const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { sendBookingConfirmationToDriver, sendBookingNotificationToHost } = require('../utils/emailService');

const router = express.Router();

// Helper: get or create Stripe customer for a user
const getOrCreateStripeCustomer = async (user) => {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
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
      .populate('driver');

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
    const intentParams = {
      amount: Math.round(booking.totalPrice * 100), // Convert to cents
      currency: 'usd',
      customer: customerId,
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

      // Only send confirmation emails if this is a new confirmation (not already paid)
      if (!wasAlreadyConfirmed && booking.driver && booking.host && booking.vehicle) {
        sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation email:', err));
        sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
          .catch(err => console.error('Failed to send host notification email:', err));
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

      // Only send confirmation emails if this is a new confirmation (not already paid)
      if (!wasAlreadyConfirmed && booking.driver && booking.host && booking.vehicle) {
        sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
          .catch(err => console.error('Failed to send driver confirmation email:', err));
        sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
          .catch(err => console.error('Failed to send host notification email:', err));
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
    const { bookingId, extensionDays } = req.body;

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

    // Calculate extension cost
    const extensionCost = extensionDays * booking.pricePerDay;

    // Calculate new end date
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);

    // Create a PaymentIntent for the extension
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(extensionCost * 100), // Convert to cents
      currency: 'usd',
      automatic_payment_methods: {
        enabled: true,
      },
      metadata: {
        bookingId: bookingId.toString(),
        extensionDays: extensionDays.toString(),
        type: 'extension',
        driverId: booking.driver._id.toString(),
        vehicleId: booking.vehicle._id.toString(),
      },
      description: `Extension: ${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model} - ${extensionDays} additional day(s)`,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      extensionDetails: {
        bookingId,
        extensionDays,
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
    const { paymentIntentId, bookingId, extensionDays } = req.body;

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

      // Calculate new values
      const extensionCost = extensionDays * booking.pricePerDay;
      const newEndDate = new Date(booking.endDate);
      newEndDate.setDate(newEndDate.getDate() + extensionDays);

      // Update booking
      booking.endDate = newEndDate;
      booking.totalDays = booking.totalDays + extensionDays;
      booking.totalPrice = booking.totalPrice + extensionCost;

      // Track extension
      if (!booking.extensions) {
        booking.extensions = [];
      }
      booking.extensions.push({
        days: extensionDays,
        cost: extensionCost,
        paymentId: paymentIntentId,
        extendedAt: new Date()
      });

      await booking.save();

      res.json({
        success: true,
        message: `Booking extended by ${extensionDays} day(s)!`,
        booking: {
          _id: booking._id,
          newEndDate: booking.endDate,
          totalDays: booking.totalDays,
          totalPrice: booking.totalPrice,
          extensionCost
        }
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
            const extensionCost = extensionDays * existingBooking.pricePerDay;
            const newEndDate = new Date(existingBooking.endDate);
            newEndDate.setDate(newEndDate.getDate() + extensionDays);

            existingBooking.endDate = newEndDate;
            existingBooking.totalDays = existingBooking.totalDays + extensionDays;
            existingBooking.totalPrice = existingBooking.totalPrice + extensionCost;

            if (!existingBooking.extensions) {
              existingBooking.extensions = [];
            }
            existingBooking.extensions.push({
              days: extensionDays,
              cost: extensionCost,
              paymentId: paymentIntent.id,
              extendedAt: new Date()
            });

            await existingBooking.save();
            console.log(`✅ Extension processed via webhook: ${extensionDays} days added to booking ${bookingId}`);
          }
          break;
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

          // Send confirmation emails
          if (booking.driver && booking.host && booking.vehicle) {
            sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
              .catch(err => console.error('Failed to send driver confirmation email:', err));
            sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
              .catch(err => console.error('Failed to send host notification email:', err));
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

            // Send confirmation emails
            if (booking.driver && booking.host && booking.vehicle) {
              sendBookingConfirmationToDriver(booking.driver, booking, booking.vehicle, booking.host)
                .catch(err => console.error('Failed to send driver confirmation email:', err));
              sendBookingNotificationToHost(booking.host, booking, booking.vehicle, booking.driver)
                .catch(err => console.error('Failed to send host notification email:', err));
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
