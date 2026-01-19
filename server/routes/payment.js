const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const User = require('../models/User');
const { sendBookingConfirmationToDriver, sendBookingNotificationToHost } = require('../utils/emailService');

const router = express.Router();

// Create Payment Intent (for custom checkout form - stays on site)
router.post('/create-payment-intent', auth, async (req, res) => {
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

    // Create a PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(booking.totalPrice * 100), // Convert to cents
      currency: 'usd',
      payment_method_types: ['card'],
      metadata: {
        bookingId: bookingId.toString(),
        driverId: booking.driver._id.toString(),
        vehicleId: booking.vehicle._id.toString(),
      },
      description: `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model} - ${booking.totalDays} days`,
    });

    res.json({
      clientSecret: paymentIntent.client_secret,
      booking,
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

      // Send confirmation emails to both driver and host
      if (booking.driver && booking.host && booking.vehicle) {
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

      // Send confirmation emails to both driver and host
      if (booking.driver && booking.host && booking.vehicle) {
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

module.exports = router;
