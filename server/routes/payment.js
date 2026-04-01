const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const { sendBookingConfirmationToDriver, sendBookingNotificationToHost, sendBookingExtensionEmail } = require('../utils/emailService');
const { sendNewBookingNotificationSMS, sendBookingConfirmedSMS } = require('../utils/smsService');
const { calculateProcessingFee } = require('../utils/stripeFee');
const { isConfigured: tollspotConfigured } = require('../utils/tollspot');
const { getOutstandingTolls, recordTollSettlement, transferTollsToHost } = require('../utils/tollSettlement');

const router = express.Router();

// Helper: get or create Stripe customer for a user
const getOrCreateStripeCustomer = async (user) => {
  // If user already has a Stripe customer ID, verify it still exists
  // (handles live/test key switches where the customer won't exist in the other mode)
  if (user.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(user.stripeCustomerId);
      return user.stripeCustomerId;
    } catch (err) {
      console.log(`⚠️ Stripe customer ${user.stripeCustomerId} not found (likely key mode switch), creating new one`);
    }
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    metadata: { userId: user._id.toString() }
  });
  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
};

// Create Payment Intent (for custom checkout form - stays on site)
router.post('/create-payment-intent', auth, async (req, res) => {
  try {
    const { bookingId, savedPaymentMethodId } = req.body;

    // Fetch the booking
    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver')
      .populate('host', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Ensure the booking belongs to the authenticated user
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Get or create Stripe customer
    const driver = await User.findById(req.user._id);
    const customerId = await getOrCreateStripeCustomer(driver);

    // Build PaymentIntent params
    // setup_future_usage saves the card for off-session charges (toll settlements, post-trip fees)
    const intentParams = {
      amount: Math.round(booking.totalPrice * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      setup_future_usage: 'off_session',
      metadata: {
        bookingId: bookingId.toString(),
        driverId: booking.driver._id.toString(),
        vehicleId: booking.vehicle._id.toString(),
      },
      description: `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model} - ${booking.totalDays} days`,
    };

    // If paying with a saved card, attach it and confirm immediately
    if (savedPaymentMethodId) {
      intentParams.payment_method = savedPaymentMethodId;
      intentParams.confirm = true;
      intentParams.automatic_payment_methods = {
        enabled: true,
        allow_redirects: 'never'
      };
    } else {
      intentParams.automatic_payment_methods = {
        enabled: true,
      };
    }

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create(intentParams);

    // Get saved payment methods for the response
    const savedCards = driver.paymentMethods.filter(pm => pm.stripePaymentMethodId);

    res.json({
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      paymentIntentStatus: paymentIntent.status,
      booking,
      savedCards: savedCards.map(c => ({
        _id: c._id,
        nickname: c.nickname,
        cardBrand: c.cardBrand,
        last4: c.last4,
        expMonth: c.expMonth,
        expYear: c.expYear,
        isDefault: c.isDefault,
        stripePaymentMethodId: c.stripePaymentMethodId
      }))
    });
  } catch (error) {
    console.error('Payment intent creation error:', error);
    res.status(500).json({ message: 'Failed to create payment intent', error: error.message });
  }
});

// Create Stripe checkout session
router.post('/create-checkout-session', auth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    // Fetch the booking
    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Ensure the booking belongs to the authenticated user
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`,
              description: `Rental from ${new Date(booking.startDate).toLocaleDateString()} to ${new Date(booking.endDate).toLocaleDateString()}`,
            },
            unit_amount: Math.round(booking.totalPrice * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/success?session_id={CHECKOUT_SESSION_ID}&booking_id=${bookingId}`,
      cancel_url: `${process.env.CLIENT_URL || 'http://localhost:3000'}/payment/cancel?booking_id=${bookingId}`,
      metadata: {
        bookingId: bookingId.toString(),
      },
    });

    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    console.error('Stripe checkout error:', error);
    res.status(500).json({ message: 'Failed to create checkout session', error: error.message });
  }
});

// Verify payment and update booking status
router.post('/verify-payment', auth, async (req, res) => {
  try {
    const { sessionId, bookingId } = req.body;

    // Retrieve the session from Stripe
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status === 'paid') {
      // First check if booking is already confirmed to prevent duplicate emails
      const existingBooking = await Booking.findById(bookingId);
      const wasAlreadyConfirmed = existingBooking && existingBooking.paymentStatus === 'paid';

      // Assign sequential reservation ID now that payment is confirmed
      if (!existingBooking.reservationId) {
        await Booking.assignReservationId(bookingId);
      }

      // Update booking status to confirmed
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentSessionId: sessionId,
        },
        { new: true }
      ).populate('vehicle').populate('driver').populate('host');

      // Vehicle stays available until the rental actually starts (pickup inspection).
      // The backend's date-overlap check prevents double-booking.

      // Only send confirmation emails if this is a new confirmation (not already paid)
      if (!wasAlreadyConfirmed && booking.driver && booking.host && booking.vehicle) {
        sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation email:', err));
        sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
          .catch(err => console.error('Failed to send host notification email:', err));
        // Send SMS notifications alongside emails
        sendBookingConfirmedSMS(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation SMS:', err));
        sendNewBookingNotificationSMS(booking.host, booking.driver, booking, booking.vehicle)
          .catch(err => console.error('Failed to send host notification SMS:', err));
      }

      res.json({
        success: true,
        booking,
        message: 'Payment successful! Your booking is confirmed.',
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not completed',
      });
    }
  } catch (error) {
    console.error('Payment verification error:', error);
    res.status(500).json({ message: 'Failed to verify payment', error: error.message });
  }
});

// Confirm payment intent and update booking
router.post('/confirm-payment', auth, async (req, res) => {
  try {
    const { paymentIntentId, bookingId } = req.body;

    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      // First check if booking is already confirmed to prevent duplicate emails
      const existingBooking = await Booking.findById(bookingId);
      const wasAlreadyConfirmed = existingBooking && existingBooking.paymentStatus === 'paid';

      // Assign sequential reservation ID now that payment is confirmed
      if (!existingBooking.reservationId) {
        await Booking.assignReservationId(bookingId);
      }

      // Update booking status to confirmed
      const booking = await Booking.findByIdAndUpdate(
        bookingId,
        {
          status: 'confirmed',
          paymentStatus: 'paid',
          paymentSessionId: paymentIntentId,
        },
        { new: true }
      ).populate('vehicle').populate('driver').populate('host');

      // Vehicle stays available until the rental actually starts (pickup inspection).
      // The backend's date-overlap check prevents double-booking.

      // Only send confirmation emails if this is a new confirmation (not already paid)
      if (!wasAlreadyConfirmed && booking.driver && booking.host && booking.vehicle) {
        sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation email:', err));
        sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
          .catch(err => console.error('Failed to send host notification email:', err));
        // Send SMS notifications alongside emails
        sendBookingConfirmedSMS(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation SMS:', err));
        sendNewBookingNotificationSMS(booking.host, booking.driver, booking, booking.vehicle)
          .catch(err => console.error('Failed to send host notification SMS:', err));
      }

      res.json({
        success: true,
        booking,
        message: 'Payment successful! Your booking is confirmed.',
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Payment not completed',
        status: paymentIntent.status,
      });
    }
  } catch (error) {
    console.error('Payment confirmation error:', error);
    res.status(500).json({ message: 'Failed to confirm payment', error: error.message });
  }
});

// Create Payment Intent for booking extension
router.post('/create-extension-payment', auth, async (req, res) => {
  try {
    const { bookingId, extensionDays, rentalType } = req.body;

    // Fetch the booking
    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Ensure the booking belongs to the authenticated user
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Only active or confirmed bookings can be extended
    if (!['active', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Only active or confirmed bookings can be extended' });
    }

    // Calculate extension costs with platform fee + processing fee
    const effectiveRentalType = rentalType || 'daily';
    let rentalCost;
    if (effectiveRentalType === 'weekly' && booking.vehicle.pricePerWeek) {
      rentalCost = booking.vehicle.pricePerWeek;
    } else if (effectiveRentalType === 'monthly' && booking.vehicle.pricePerMonth) {
      rentalCost = booking.vehicle.pricePerMonth;
    } else {
      rentalCost = extensionDays * booking.pricePerDay;
    }
    const platformFeePerDay = booking.platformFeePerDay || 1.50;
    const platformFee = extensionDays * platformFeePerDay;
    const extensionInsurance = extensionDays * (booking.insurance?.costPerDay || 0);
    const extensionBaseTotal = rentalCost + platformFee + extensionInsurance;

    // Fetch outstanding toll charges — included in extension payment
    let tollInfo = { count: 0, originalAmount: 0, platformFees: 0, driverTotal: 0 };
    if (tollspotConfigured()) {
      tollInfo = await getOutstandingTolls(booking, booking.vehicle);
    }

    // Include outstanding tolls in extension total before calculating processing fee
    const extensionPlusTolls = extensionBaseTotal + tollInfo.driverTotal;
    const extensionProcessing = calculateProcessingFee(extensionPlusTolls);
    const extensionCost = extensionPlusTolls + extensionProcessing.driverProcessingFee;

    // Calculate new end date
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);

    // Use the same Stripe customer as the original booking
    const driver = await User.findById(req.user._id);
    const customerId = await getOrCreateStripeCustomer(driver);

    // Create a PaymentIntent for the extension (includes toll settlement)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(extensionCost * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        bookingId: bookingId.toString(),
        extensionDays: extensionDays.toString(),
        rentalType: effectiveRentalType,
        type: 'extension',
        driverId: booking.driver._id.toString(),
        vehicleId: booking.vehicle._id.toString(),
        rentalCost: rentalCost.toString(),
        platformFee: platformFee.toString(),
        driverProcessingFee: extensionProcessing.driverProcessingFee.toString(),
        hostProcessingFee: extensionProcessing.hostProcessingFee.toString(),
        tollCharges: tollInfo.driverTotal.toString(),
        tollCount: tollInfo.count.toString(),
        tollOriginalAmount: tollInfo.originalAmount.toString(),
        tollPlatformFee: tollInfo.platformFees.toString(),
      },
      description: `Extension: ${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model} - ${extensionDays} additional day(s)${tollInfo.count > 0 ? ` + ${tollInfo.count} toll(s)` : ''}`,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      extensionDetails: {
        bookingId,
        extensionDays,
        rentalType: effectiveRentalType,
        rentalCost,
        platformFeePerDay,
        platformFee,
        extensionInsurance,
        tollCharges: tollInfo.driverTotal,
        tollCount: tollInfo.count,
        driverProcessingFee: extensionProcessing.driverProcessingFee,
        extensionCost,
        pricePerDay: booking.pricePerDay,
        currentEndDate: booking.endDate,
        newEndDate,
        vehicle: {
          name: `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`
        }
      }
    });
  } catch (error) {
    console.error('Extension payment intent creation error:', error);
    res.status(500).json({ message: 'Failed to create extension payment', error: error.message });
  }
});

// Confirm extension payment and update booking
router.post('/confirm-extension-payment', auth, async (req, res) => {
  try {
    const { paymentIntentId, bookingId, extensionDays, rentalType } = req.body;

    // Retrieve the payment intent from Stripe
    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status === 'succeeded') {
      const booking = await Booking.findById(bookingId)
        .populate('vehicle')
        .populate('driver', 'firstName lastName email')
        .populate('host', 'firstName lastName email');

      if (!booking) {
        return res.status(404).json({ message: 'Booking not found' });
      }

      // Extract toll info from payment metadata (tolls were bundled into extension payment)
      const tollCharges = parseFloat(paymentIntent.metadata.tollCharges || '0');
      const tollCount = parseInt(paymentIntent.metadata.tollCount || '0');
      const tollOriginalAmount = parseFloat(paymentIntent.metadata.tollOriginalAmount || '0');
      const tollPlatformFee = parseFloat(paymentIntent.metadata.tollPlatformFee || '0');

      // Calculate new values with platform fee + insurance + processing fee
      const effectiveRentalType = rentalType || paymentIntent.metadata.rentalType || 'daily';
      let rentalCost;
      if (effectiveRentalType === 'weekly' && booking.vehicle.pricePerWeek) {
        rentalCost = booking.vehicle.pricePerWeek;
      } else if (effectiveRentalType === 'monthly' && booking.vehicle.pricePerMonth) {
        rentalCost = booking.vehicle.pricePerMonth;
      } else {
        rentalCost = extensionDays * booking.pricePerDay;
      }
      const platformFeePerDay = booking.platformFeePerDay || 1.50;
      const extensionPlatformFee = extensionDays * platformFeePerDay;
      const extensionInsurance = extensionDays * (booking.insurance?.costPerDay || 0);
      const extensionBaseTotal = rentalCost + extensionPlatformFee + extensionInsurance + tollCharges;
      const extensionProcessing = calculateProcessingFee(extensionBaseTotal);
      const extensionCost = extensionBaseTotal + extensionProcessing.driverProcessingFee;
      const newEndDate = new Date(booking.endDate);
      newEndDate.setDate(newEndDate.getDate() + extensionDays);

      // Host platform fee on extension: $1.50/day (deducted from host, goes to RentUFS)
      const extensionHostFee = extensionDays * (booking.hostPlatformFeePerDay || 1.50);

      // Update booking
      booking.endDate = newEndDate;
      booking.totalDays = booking.totalDays + extensionDays;
      booking.totalPrice = booking.totalPrice + extensionCost;
      booking.platformFee = (booking.platformFee || 0) + extensionPlatformFee;
      booking.driverProcessingFee = (booking.driverProcessingFee || 0) + extensionProcessing.driverProcessingFee;
      booking.hostProcessingFee = (booking.hostProcessingFee || 0) + extensionProcessing.hostProcessingFee;
      booking.stripeFee = (booking.stripeFee || 0) + extensionProcessing.stripeFee;
      booking.hostPlatformFee = (booking.hostPlatformFee || 0) + extensionHostFee;
      if (booking.insurance && booking.insurance.totalCost !== undefined) {
        booking.insurance.totalCost = (booking.insurance.totalCost || 0) + extensionInsurance;
      }

      // Update host earnings (rental minus host fee minus host processing fee goes to host)
      // Toll original amount also goes to host (to reimburse their toll)
      booking.hostEarnings = (booking.hostEarnings || 0) + rentalCost - extensionHostFee - extensionProcessing.hostProcessingFee + tollOriginalAmount;
      booking.platformRevenue = (booking.platformRevenue || 0) + extensionPlatformFee + extensionHostFee + extensionInsurance + tollPlatformFee;

      // Track extension
      if (!booking.extensions) {
        booking.extensions = [];
      }
      booking.extensions.push({
        days: extensionDays,
        cost: extensionCost,
        rental: rentalCost,
        rentalType: effectiveRentalType,
        hostProcessingFee: extensionProcessing.hostProcessingFee,
        platformFee: extensionPlatformFee,
        insurance: extensionInsurance,
        processingFee: extensionProcessing.driverProcessingFee,
        newEndDate: newEndDate,
        paymentId: paymentIntentId,
        extendedAt: new Date()
      });

      await booking.save();

      // Send extension confirmation emails to both driver and host (fire-and-forget)
      if (booking.driver && booking.host && booking.vehicle) {
        sendBookingExtensionEmail(booking.driver, booking.host, booking, booking.vehicle)
          .catch(err => console.error('📧 Extension email failed (non-blocking):', err.message));
      }

      // Record toll settlement if tolls were included (fire-and-forget)
      if (tollCount > 0) {
        const tollInfo = {
          count: tollCount,
          originalAmount: tollOriginalAmount,
          platformFees: tollPlatformFee,
          driverTotal: tollCharges,
          allTollCount: tollCount + (booking.tollAccounting?.settledTollCount || 0)
        };
        recordTollSettlement(Booking, booking._id, tollInfo, 'extension', paymentIntentId, null)
          .then(() => {
            // Transfer toll reimbursement to host's Connect account
            if (tollOriginalAmount > 0 && booking.host?.stripeConnectAccountId) {
              return transferTollsToHost(booking, booking.host, tollInfo);
            }
          })
          .catch(err => console.error('🛣️ Toll settlement recording failed (non-blocking):', err.message));
      }

      res.json({
        success: true,
        message: `Booking extended by ${extensionDays} day(s)!${tollCount > 0 ? ` ${tollCount} toll(s) settled.` : ''}`,
        booking: {
          _id: booking._id,
          newEndDate: booking.endDate,
          totalDays: booking.totalDays,
          totalPrice: booking.totalPrice,
          extensionCost
        },
        tollSettlement: tollCount > 0 ? { tollCount, amount: tollCharges } : null
      });
    } else {
      res.status(400).json({
        success: false,
        message: 'Extension payment not completed',
        status: paymentIntent.status,
      });
    }
  } catch (error) {
    console.error('Extension payment confirmation error:', error);
    res.status(500).json({ message: 'Failed to confirm extension payment', error: error.message });
  }
});

// Create payment intent for vehicle switch price difference (host-initiated, driver pays)
router.post('/create-vehicle-switch-payment', auth, async (req, res) => {
  try {
    const { bookingId, newVehicleId, reason } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Host initiates but driver's card is charged
    if (booking.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the host can initiate a vehicle switch' });
    }

    if (booking.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'Booking must be paid to charge a switch difference' });
    }

    // Limit to one vehicle swap per reservation
    if (booking.vehicleSwitchHistory && booking.vehicleSwitchHistory.length > 0) {
      return res.status(400).json({
        message: 'This reservation has already had a vehicle swap. Only one swap is allowed per reservation.'
      });
    }

    const newVehicle = await Vehicle.findOne({ _id: newVehicleId, host: req.user._id });
    if (!newVehicle) {
      return res.status(404).json({ message: 'New vehicle not found or unauthorized' });
    }

    // Calculate rental difference
    const currentBaseRental = booking.pricePerDay * booking.totalDays;
    let newBaseRental;
    if (booking.rentalType === 'weekly') {
      const weeklyRate = newVehicle.pricePerWeek || (newVehicle.pricePerDay * 7);
      newBaseRental = booking.quantity * weeklyRate;
    } else if (booking.rentalType === 'monthly') {
      const monthlyRate = newVehicle.pricePerMonth || (newVehicle.pricePerDay * 30);
      newBaseRental = booking.quantity * monthlyRate;
    } else {
      newBaseRental = booking.totalDays * newVehicle.pricePerDay;
    }

    const rentalDifference = newBaseRental - currentBaseRental;
    if (rentalDifference <= 0) {
      return res.status(400).json({ message: 'No additional charge needed — use the switch endpoint directly' });
    }

    // Calculate processing fee on the supplemental charge
    const supplementalProcessing = calculateProcessingFee(rentalDifference);
    const additionalCharge = rentalDifference + supplementalProcessing.driverProcessingFee;

    // Get or create Stripe customer for the driver
    const driver = await User.findById(booking.driver._id);
    const customerId = await getOrCreateStripeCustomer(driver);

    // Create PaymentIntent for the difference
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(additionalCharge * 100),
      currency: 'usd',
      customer: customerId,
      automatic_payment_methods: { enabled: true },
      metadata: {
        bookingId: bookingId.toString(),
        newVehicleId: newVehicleId.toString(),
        type: 'vehicle_switch',
        hostId: req.user._id.toString(),
        driverId: booking.driver._id.toString(),
        rentalDifference: rentalDifference.toString(),
        driverProcessingFee: supplementalProcessing.driverProcessingFee.toString(),
        hostProcessingFee: supplementalProcessing.hostProcessingFee.toString(),
        reason: reason || 'Vehicle switched by host'
      },
      description: `Vehicle switch: ${newVehicle.year} ${newVehicle.make} ${newVehicle.model} (Booking ${booking.reservationId})`
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      switchPaymentDetails: {
        bookingId,
        newVehicleId,
        rentalDifference,
        driverProcessingFee: supplementalProcessing.driverProcessingFee,
        additionalCharge,
        currentPricePerDay: booking.pricePerDay,
        newPricePerDay: newVehicle.pricePerDay,
        newVehicle: {
          name: `${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`
        },
        reason: reason || 'Vehicle switched by host'
      }
    });
  } catch (error) {
    console.error('❌ Vehicle switch payment intent creation error:', error);
    res.status(500).json({ message: 'Failed to create vehicle switch payment', error: error.message });
  }
});

// Confirm vehicle switch payment and apply the switch
router.post('/confirm-vehicle-switch-payment', auth, async (req, res) => {
  try {
    const { paymentIntentId, bookingId, newVehicleId, reason } = req.body;

    const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

    if (paymentIntent.status !== 'succeeded') {
      return res.status(400).json({
        success: false,
        message: 'Vehicle switch payment not completed',
        status: paymentIntent.status
      });
    }

    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email')
      .populate('host', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const newVehicle = await Vehicle.findById(newVehicleId);
    if (!newVehicle) {
      return res.status(404).json({ message: 'New vehicle not found' });
    }

    // Calculate the rental amounts
    const currentBaseRental = booking.pricePerDay * booking.totalDays;
    let newBaseRental;
    if (booking.rentalType === 'weekly') {
      const weeklyRate = newVehicle.pricePerWeek || (newVehicle.pricePerDay * 7);
      newBaseRental = booking.quantity * weeklyRate;
    } else if (booking.rentalType === 'monthly') {
      const monthlyRate = newVehicle.pricePerMonth || (newVehicle.pricePerDay * 30);
      newBaseRental = booking.quantity * monthlyRate;
    } else {
      newBaseRental = booking.totalDays * newVehicle.pricePerDay;
    }

    const rentalDifference = newBaseRental - currentBaseRental;

    // Calculate supplemental processing fees
    const supplementalProcessing = calculateProcessingFee(rentalDifference);

    // Store previous info
    const previousVehicle = booking.vehicle._id;
    const previousPrice = booking.totalPrice;

    // Add to switch history
    if (!booking.vehicleSwitchHistory) {
      booking.vehicleSwitchHistory = [];
    }
    booking.vehicleSwitchHistory.push({
      previousVehicle: previousVehicle,
      newVehicle: newVehicleId,
      previousPrice: previousPrice,
      newPrice: previousPrice + rentalDifference + supplementalProcessing.driverProcessingFee,
      priceDifference: rentalDifference,
      paymentId: paymentIntentId,
      reason: reason || 'Vehicle switched by host',
      switchedAt: new Date()
    });

    // Update booking
    booking.vehicle = newVehicleId;
    booking.pricePerDay = newVehicle.pricePerDay;
    booking.totalPrice = booking.totalPrice + rentalDifference + supplementalProcessing.driverProcessingFee;
    booking.driverProcessingFee = (booking.driverProcessingFee || 0) + supplementalProcessing.driverProcessingFee;
    booking.hostProcessingFee = (booking.hostProcessingFee || 0) + supplementalProcessing.hostProcessingFee;
    booking.stripeFee = (booking.stripeFee || 0) + supplementalProcessing.stripeFee;

    // Recalculate host earnings
    const hostPlatformFee = (booking.hostPlatformFeePerDay || 1.50) * booking.totalDays;
    booking.hostEarnings = newBaseRental - hostPlatformFee - booking.hostProcessingFee;

    // Update living agreement
    if (booking.agreement && booking.agreement.signed) {
      if (!booking.agreement.amendments) {
        booking.agreement.amendments = [];
      }
      booking.agreement.amendments.push({
        type: 'vehicle_swap',
        description: `Vehicle swapped to ${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`,
        newTotalPrice: booking.totalPrice,
        newVehicleInfo: `${newVehicle.year} ${newVehicle.make} ${newVehicle.model} (VIN: ${newVehicle.vin || 'N/A'})`,
        acknowledgedAt: new Date()
      });
    }

    await booking.save();

    await booking.populate('vehicle');

    console.log(`✅ Vehicle switched (paid) for booking ${booking.reservationId}: ${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`);

    res.json({
      success: true,
      message: 'Vehicle switched successfully with additional payment',
      booking: {
        _id: booking._id,
        reservationId: booking.reservationId,
        vehicle: booking.vehicle,
        previousPrice: previousPrice,
        newPrice: booking.totalPrice,
        priceDifference: rentalDifference,
        additionalCharged: rentalDifference + supplementalProcessing.driverProcessingFee,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('❌ Vehicle switch payment confirmation error:', error);
    res.status(500).json({ message: 'Failed to confirm vehicle switch payment', error: error.message });
  }
});

// Get payment session details
router.get('/session/:sessionId', auth, async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(req.params.sessionId);
    res.json(session);
  } catch (error) {
    console.error('Error retrieving session:', error);
    res.status(500).json({ message: 'Failed to retrieve session', error: error.message });
  }
});

// Stripe Webhook Handler - handles payment events directly from Stripe
// This ensures payments are recorded even if client-side confirmation fails
router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // If webhook secret is configured, verify the signature
    if (webhookSecret && sig) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // For development without webhook secret, parse the body directly
      event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      console.log('⚠️ Webhook signature verification skipped (no STRIPE_WEBHOOK_SECRET configured)');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object;
      console.log('💰 Payment succeeded via webhook:', paymentIntent.id);

      // Get bookingId from metadata
      const bookingId = paymentIntent.metadata?.bookingId;
      if (!bookingId) {
        console.log('No bookingId in payment metadata, skipping');
        break;
      }

      try {
        // Check if booking already updated (idempotency)
        const existingBooking = await Booking.findById(bookingId);
        if (existingBooking && existingBooking.paymentStatus === 'paid') {
          console.log('Booking already marked as paid, skipping duplicate webhook');
          break;
        }

        // Check if this is an extension payment
        if (paymentIntent.metadata?.type === 'extension') {
          const extensionDays = parseInt(paymentIntent.metadata.extensionDays, 10);
          if (existingBooking && extensionDays) {
            // Use rental cost from payment metadata (calculated correctly at payment time)
            // Falls back to pricePerDay × days for legacy payments without metadata
            const effectiveRentalType = paymentIntent.metadata.rentalType || 'daily';
            let rentalCost;
            if (paymentIntent.metadata.rentalCost) {
              rentalCost = parseFloat(paymentIntent.metadata.rentalCost);
            } else if (effectiveRentalType === 'weekly' || effectiveRentalType === 'monthly') {
              const vehicle = await Vehicle.findById(existingBooking.vehicle);
              if (effectiveRentalType === 'weekly' && vehicle?.pricePerWeek) {
                rentalCost = vehicle.pricePerWeek;
              } else if (effectiveRentalType === 'monthly' && vehicle?.pricePerMonth) {
                rentalCost = vehicle.pricePerMonth;
              } else {
                rentalCost = extensionDays * existingBooking.pricePerDay;
              }
            } else {
              rentalCost = extensionDays * existingBooking.pricePerDay;
            }
            const platformFeePerDay = existingBooking.platformFeePerDay || 1.50;
            const extensionPlatformFee = extensionDays * platformFeePerDay;
            const extensionInsurance = extensionDays * (existingBooking.insurance?.costPerDay || 0);
            const extensionBaseTotal = rentalCost + extensionPlatformFee + extensionInsurance;
            const extensionProcessing = calculateProcessingFee(extensionBaseTotal);
            const extensionCost = extensionBaseTotal + extensionProcessing.driverProcessingFee;
            const newEndDate = new Date(existingBooking.endDate);
            newEndDate.setDate(newEndDate.getDate() + extensionDays);

            // Host platform fee on extension: $1.50/day (deducted from host, goes to RentUFS)
            const extensionHostFee = extensionDays * (existingBooking.hostPlatformFeePerDay || 1.50);

            existingBooking.endDate = newEndDate;
            existingBooking.totalDays = existingBooking.totalDays + extensionDays;
            existingBooking.totalPrice = existingBooking.totalPrice + extensionCost;
            existingBooking.platformFee = (existingBooking.platformFee || 0) + extensionPlatformFee;
            existingBooking.driverProcessingFee = (existingBooking.driverProcessingFee || 0) + extensionProcessing.driverProcessingFee;
            existingBooking.hostProcessingFee = (existingBooking.hostProcessingFee || 0) + extensionProcessing.hostProcessingFee;
            existingBooking.stripeFee = (existingBooking.stripeFee || 0) + extensionProcessing.stripeFee;
            existingBooking.hostPlatformFee = (existingBooking.hostPlatformFee || 0) + extensionHostFee;
            if (existingBooking.insurance && existingBooking.insurance.totalCost !== undefined) {
              existingBooking.insurance.totalCost = (existingBooking.insurance.totalCost || 0) + extensionInsurance;
            }
            existingBooking.hostEarnings = (existingBooking.hostEarnings || 0) + rentalCost - extensionHostFee - extensionProcessing.hostProcessingFee;
            existingBooking.platformRevenue = (existingBooking.platformRevenue || 0) + extensionPlatformFee + extensionHostFee + extensionInsurance;

            if (!existingBooking.extensions) {
              existingBooking.extensions = [];
            }
            existingBooking.extensions.push({
              days: extensionDays,
              cost: extensionCost,
              rental: rentalCost,
              rentalType: effectiveRentalType,
              hostProcessingFee: extensionProcessing.hostProcessingFee,
              platformFee: extensionPlatformFee,
              insurance: extensionInsurance,
              processingFee: extensionProcessing.driverProcessingFee,
              newEndDate: newEndDate,
              paymentId: paymentIntent.id,
              extendedAt: new Date()
            });

            await existingBooking.save();
            console.log(`✅ Extension processed via webhook: ${extensionDays} days added to booking ${bookingId}`);
          }
          break;
        }

        // Check if this is a vehicle switch payment (manual or auto-charged)
        if (paymentIntent.metadata?.type === 'vehicle_switch' || paymentIntent.metadata?.type === 'vehicle_switch_auto') {
          const newVehicleId = paymentIntent.metadata.newVehicleId;
          const reason = paymentIntent.metadata.reason;
          if (existingBooking && newVehicleId) {
            // Check if switch was already applied (idempotency)
            const alreadySwitched = existingBooking.vehicleSwitchHistory?.some(
              h => h.paymentId === paymentIntent.id
            );
            if (!alreadySwitched) {
              const newVehicle = await Vehicle.findById(newVehicleId);
              if (newVehicle) {
                const currentBaseRental = existingBooking.pricePerDay * existingBooking.totalDays;
                let newBaseRental;
                if (existingBooking.rentalType === 'weekly') {
                  newBaseRental = existingBooking.quantity * (newVehicle.pricePerWeek || newVehicle.pricePerDay * 7);
                } else if (existingBooking.rentalType === 'monthly') {
                  newBaseRental = existingBooking.quantity * (newVehicle.pricePerMonth || newVehicle.pricePerDay * 30);
                } else {
                  newBaseRental = existingBooking.totalDays * newVehicle.pricePerDay;
                }

                const rentalDifference = newBaseRental - currentBaseRental;
                const supplementalProcessing = calculateProcessingFee(rentalDifference);
                const previousPrice = existingBooking.totalPrice;

                if (!existingBooking.vehicleSwitchHistory) {
                  existingBooking.vehicleSwitchHistory = [];
                }
                existingBooking.vehicleSwitchHistory.push({
                  previousVehicle: existingBooking.vehicle,
                  newVehicle: newVehicleId,
                  previousPrice: previousPrice,
                  newPrice: previousPrice + rentalDifference + supplementalProcessing.driverProcessingFee,
                  priceDifference: rentalDifference,
                  paymentId: paymentIntent.id,
                  reason: reason || 'Vehicle switched by host',
                  switchedAt: new Date()
                });

                existingBooking.vehicle = newVehicleId;
                existingBooking.pricePerDay = newVehicle.pricePerDay;
                existingBooking.totalPrice = previousPrice + rentalDifference + supplementalProcessing.driverProcessingFee;
                existingBooking.driverProcessingFee = (existingBooking.driverProcessingFee || 0) + supplementalProcessing.driverProcessingFee;
                existingBooking.hostProcessingFee = (existingBooking.hostProcessingFee || 0) + supplementalProcessing.hostProcessingFee;
                existingBooking.stripeFee = (existingBooking.stripeFee || 0) + supplementalProcessing.stripeFee;

                const hostPlatformFee = (existingBooking.hostPlatformFeePerDay || 1.50) * existingBooking.totalDays;
                existingBooking.hostEarnings = newBaseRental - hostPlatformFee - existingBooking.hostProcessingFee;

                await existingBooking.save();
                console.log(`✅ Vehicle switch processed via webhook: booking ${bookingId} switched to ${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`);
              }
            }
          }
          break;
        }

        // Assign sequential reservation ID now that payment is confirmed
        const preBooking = await Booking.findById(bookingId);
        if (preBooking && !preBooking.reservationId) {
          await Booking.assignReservationId(bookingId);
        }

        // Update booking status for regular payments
        const booking = await Booking.findByIdAndUpdate(
          bookingId,
          {
            status: 'confirmed',
            paymentStatus: 'paid',
            paymentSessionId: paymentIntent.id,
          },
          { new: true }
        ).populate('vehicle').populate('driver').populate('host');

        if (booking) {
          console.log(`✅ Booking ${bookingId} confirmed via webhook`);

          // Vehicle stays available until pickup inspection — overlap check prevents double-booking

          // Send confirmation emails
          if (booking.driver && booking.host && booking.vehicle) {
            sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
              .catch(err => console.error('Failed to send driver confirmation email:', err));
            sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
              .catch(err => console.error('Failed to send host notification email:', err));
            // Send SMS notifications alongside emails
            sendBookingConfirmedSMS(booking.driver, booking, booking.vehicle, booking.host)
              .catch(err => console.error('Failed to send driver confirmation SMS:', err));
            sendNewBookingNotificationSMS(booking.host, booking.driver, booking, booking.vehicle)
              .catch(err => console.error('Failed to send host notification SMS:', err));
          }
        }
      } catch (err) {
        console.error('Error updating booking from webhook:', err);
      }
      break;
    }

    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('💰 Checkout session completed via webhook:', session.id);

      const bookingId = session.metadata?.bookingId;
      if (!bookingId) {
        console.log('No bookingId in session metadata, skipping');
        break;
      }

      try {
        // Check if booking already updated (idempotency)
        const existingBooking = await Booking.findById(bookingId);
        if (existingBooking && existingBooking.paymentStatus === 'paid') {
          console.log('Booking already marked as paid, skipping duplicate webhook');
          break;
        }

        if (session.payment_status === 'paid') {
          // Assign sequential reservation ID now that payment is confirmed
          if (existingBooking && !existingBooking.reservationId) {
            await Booking.assignReservationId(bookingId);
          }

          const booking = await Booking.findByIdAndUpdate(
            bookingId,
            {
              status: 'confirmed',
              paymentStatus: 'paid',
              paymentSessionId: session.id,
            },
            { new: true }
          ).populate('vehicle').populate('driver').populate('host');

          if (booking) {
            console.log(`✅ Booking ${bookingId} confirmed via checkout session webhook`);

            // Vehicle stays available until pickup inspection — overlap check prevents double-booking

            // Send confirmation emails
            if (booking.driver && booking.host && booking.vehicle) {
              sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
                .catch(err => console.error('Failed to send driver confirmation email:', err));
              sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
                .catch(err => console.error('Failed to send host notification email:', err));
              // Send SMS notifications alongside emails
              sendBookingConfirmedSMS(booking.driver, booking, booking.vehicle, booking.host)
                .catch(err => console.error('Failed to send driver confirmation SMS:', err));
              sendNewBookingNotificationSMS(booking.host, booking.driver, booking, booking.vehicle)
                .catch(err => console.error('Failed to send host notification SMS:', err));
            }
          }
        }
      } catch (err) {
        console.error('Error updating booking from checkout webhook:', err);
      }
      break;
    }

    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  // Return 200 to acknowledge receipt of the event
  res.json({ received: true });
});

// Reconcile payment - check Stripe and update booking if payment succeeded
// Use this to fix bookings where payment succeeded but status wasn't updated
router.post('/reconcile/:bookingId', auth, async (req, res) => {
  try {
    const { bookingId } = req.params;

    // Fetch the booking
    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver')
      .populate('host');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Ensure the booking belongs to the authenticated user
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // If already paid, no need to reconcile
    if (booking.paymentStatus === 'paid') {
      return res.json({
        success: true,
        message: 'Booking is already marked as paid',
        booking,
        reconciled: false
      });
    }

    // Search for payment intents with this booking's metadata
    const paymentIntents = await stripe.paymentIntents.list({
      limit: 10,
    });

    // Find a successful payment intent for this booking
    const successfulPayment = paymentIntents.data.find(
      pi => pi.metadata?.bookingId === bookingId && pi.status === 'succeeded'
    );

    if (successfulPayment) {
      // Assign sequential reservation ID now that payment is confirmed
      if (!booking.reservationId) {
        await Booking.assignReservationId(bookingId);
      }

      // Update booking status
      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      booking.paymentSessionId = successfulPayment.id;
      await booking.save();

      // Reload with populated fields
      await booking.populate('vehicle');
      await booking.populate('driver');
      await booking.populate('host');

      // Send confirmation emails
      if (booking.driver && booking.host && booking.vehicle) {
        sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation email:', err));
        sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
          .catch(err => console.error('Failed to send host notification email:', err));
        // Send SMS notifications alongside emails
        sendBookingConfirmedSMS(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation SMS:', err));
        sendNewBookingNotificationSMS(booking.host, booking.driver, booking, booking.vehicle)
          .catch(err => console.error('Failed to send host notification SMS:', err));
      }

      console.log(`✅ Reconciled booking ${bookingId} - payment ${successfulPayment.id} found`);

      return res.json({
        success: true,
        message: 'Payment found and booking updated successfully!',
        booking,
        reconciled: true,
        paymentId: successfulPayment.id
      });
    }

    // Also check checkout sessions
    const sessions = await stripe.checkout.sessions.list({
      limit: 10,
    });

    const successfulSession = sessions.data.find(
      s => s.metadata?.bookingId === bookingId && s.payment_status === 'paid'
    );

    if (successfulSession) {
      // Assign sequential reservation ID now that payment is confirmed
      if (!booking.reservationId) {
        await Booking.assignReservationId(bookingId);
      }

      // Update booking status
      booking.status = 'confirmed';
      booking.paymentStatus = 'paid';
      booking.paymentSessionId = successfulSession.id;
      await booking.save();

      // Reload with populated fields
      await booking.populate('vehicle');
      await booking.populate('driver');
      await booking.populate('host');

      // Send confirmation emails
      if (booking.driver && booking.host && booking.vehicle) {
        sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation email:', err));
        sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
          .catch(err => console.error('Failed to send host notification email:', err));
        // Send SMS notifications alongside emails
        sendBookingConfirmedSMS(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation SMS:', err));
        sendNewBookingNotificationSMS(booking.host, booking.driver, booking, booking.vehicle)
          .catch(err => console.error('Failed to send host notification SMS:', err));
      }

      console.log(`✅ Reconciled booking ${bookingId} - checkout session ${successfulSession.id} found`);

      return res.json({
        success: true,
        message: 'Payment found and booking updated successfully!',
        booking,
        reconciled: true,
        paymentId: successfulSession.id
      });
    }

    return res.json({
      success: false,
      message: 'No successful payment found for this booking in Stripe',
      reconciled: false
    });

  } catch (error) {
    console.error('Payment reconciliation error:', error);
    res.status(500).json({ message: 'Failed to reconcile payment', error: error.message });
  }
});

module.exports = router;
