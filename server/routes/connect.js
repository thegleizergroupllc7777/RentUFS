const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');

const router = express.Router();

// Cache the platform account ID
let platformAccountId = null;
const getPlatformAccountId = async () => {
  if (!platformAccountId) {
    try {
      const account = await stripe.accounts.retrieve();
      platformAccountId = account.id;
    } catch (err) {
      console.error('Error retrieving platform account:', err.message);
    }
  }
  return platformAccountId;
};

// Get the client URL for redirects
const getClientUrl = () => {
  return process.env.CLIENT_URL || 'http://localhost:3000';
};

// Create or get Stripe Connect account for host
router.post('/create-account', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Check if user is a host
    if (user.userType !== 'host' && user.userType !== 'both') {
      return res.status(400).json({ message: 'Only hosts can create payout accounts' });
    }

    // If already has a Connect account, return it
    if (user.stripeConnectAccountId) {
      const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
      return res.json({
        accountId: user.stripeConnectAccountId,
        onboardingComplete: user.stripeConnectOnboardingComplete,
        payoutsEnabled: account.payouts_enabled,
        chargesEnabled: account.charges_enabled,
        detailsSubmitted: account.details_submitted
      });
    }

    // Create a new Connect Express account
    const account = await stripe.accounts.create({
      type: 'express',
      country: 'US',
      email: user.email,
      capabilities: {
        transfers: { requested: true }
      },
      business_type: user.hostInfo?.accountType === 'business' ? 'company' : 'individual',
      metadata: {
        userId: user._id.toString()
      },
      settings: {
        payouts: {
          schedule: {
            interval: 'weekly',
            weekly_anchor: 'monday'
          }
        }
      }
    });

    // Save the account ID to user
    user.stripeConnectAccountId = account.id;
    await user.save();

    console.log(`Created Stripe Connect account ${account.id} for user ${user._id}`);

    res.json({
      accountId: account.id,
      onboardingComplete: false,
      payoutsEnabled: false,
      chargesEnabled: false,
      detailsSubmitted: false
    });
  } catch (error) {
    console.error('Error creating Connect account:', error);
    res.status(500).json({ message: 'Failed to create payout account', error: error.message });
  }
});

// Generate onboarding link for Connect account
router.post('/onboarding-link', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.stripeConnectAccountId) {
      return res.status(400).json({ message: 'No payout account found. Please create one first.' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: user.stripeConnectAccountId,
      refresh_url: `${getClientUrl()}/host/payouts?refresh=true`,
      return_url: `${getClientUrl()}/host/payouts?onboarding=complete`,
      type: 'account_onboarding'
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('Error creating onboarding link:', error);
    res.status(500).json({ message: 'Failed to create onboarding link', error: error.message });
  }
});

// Get Connect account status
router.get('/account-status', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!user.stripeConnectAccountId) {
      return res.json({
        hasAccount: false,
        onboardingComplete: false,
        payoutsEnabled: false,
        chargesEnabled: false
      });
    }

    // Check if this user's Connect account is the platform's own account
    const platId = await getPlatformAccountId();
    if (platId && user.stripeConnectAccountId === platId) {
      return res.json({
        hasAccount: true,
        isPlatformOwner: true,
        onboardingComplete: true,
        payoutsEnabled: true,
        chargesEnabled: true
      });
    }

    // Get latest account status from Stripe
    const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);

    // Update local status if changed
    const needsUpdate =
      user.stripeConnectOnboardingComplete !== account.details_submitted ||
      user.stripeConnectPayoutsEnabled !== account.payouts_enabled ||
      user.stripeConnectChargesEnabled !== account.charges_enabled;

    if (needsUpdate) {
      user.stripeConnectOnboardingComplete = account.details_submitted;
      user.stripeConnectPayoutsEnabled = account.payouts_enabled;
      user.stripeConnectChargesEnabled = account.charges_enabled;
      await user.save();
    }

    res.json({
      hasAccount: true,
      accountId: user.stripeConnectAccountId,
      onboardingComplete: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      requirements: account.requirements,
      payoutSchedule: account.settings?.payouts?.schedule
    });
  } catch (error) {
    console.error('Error getting account status:', error);
    res.status(500).json({ message: 'Failed to get account status', error: error.message });
  }
});

// Generate login link for Connect dashboard
router.post('/dashboard-link', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.stripeConnectAccountId) {
      return res.status(400).json({ message: 'No payout account found' });
    }

    const loginLink = await stripe.accounts.createLoginLink(user.stripeConnectAccountId);

    res.json({ url: loginLink.url });
  } catch (error) {
    console.error('Error creating dashboard link:', error);
    res.status(500).json({ message: 'Failed to create dashboard link', error: error.message });
  }
});

// Get pending payouts for host
router.get('/pending-payouts', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get completed bookings that haven't been paid out yet
    const pendingBookings = await Booking.find({
      host: user._id,
      status: 'completed',
      paymentStatus: 'paid',
      payoutStatus: { $in: ['pending', 'eligible'] },
      hostEarnings: { $gt: 0 }
    }).populate('vehicle', 'make model year nickname')
      .populate('driver', 'firstName lastName')
      .sort({ endDate: -1 });

    // Calculate totals
    const totalPending = pendingBookings.reduce((sum, b) => sum + (b.hostEarnings || 0), 0);

    // Get bookings that are eligible for payout (immediately after completion)
    const now = new Date();
    const eligibleBookings = pendingBookings.filter(b => {
      const eligibleDate = b.payoutEligibleDate || new Date();
      return eligibleDate <= now;
    });
    const totalEligible = eligibleBookings.reduce((sum, b) => sum + (b.hostEarnings || 0), 0);

    res.json({
      pendingBookings: pendingBookings.map(b => {
        // Always compute from per-day rate to fix legacy bookings that stored a flat fee
        const correctHostFee = (b.hostPlatformFeePerDay || 1.50) * (b.totalDays || 0);
        const rentalSubtotal = (b.pricePerDay || 0) * (b.totalDays || 0);
        const hostProcessingFee = Number(b.hostProcessingFee) || 0;
        const correctEarnings = Math.max(0, rentalSubtotal - correctHostFee - hostProcessingFee);
        return {
          id: b._id,
          reservationId: b.reservationId,
          vehicle: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Unknown',
          vehicleNickname: b.vehicle?.nickname || null,
          driver: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : 'Unknown',
          startDate: b.startDate,
          endDate: b.endDate,
          totalDays: b.totalDays,
          rentalType: b.rentalType,
          pricePerDay: b.pricePerDay,
          hostPlatformFee: correctHostFee,
          hostProcessingFee: hostProcessingFee,
          hostEarnings: correctEarnings,
          payoutStatus: b.payoutStatus,
          payoutEligibleDate: b.payoutEligibleDate || b.endDate
        };
      }),
      totalPending,
      totalEligible,
      payoutsEnabled: user.stripeConnectPayoutsEnabled
    });
  } catch (error) {
    console.error('Error getting pending payouts:', error);
    res.status(500).json({ message: 'Failed to get pending payouts', error: error.message });
  }
});

// Get payout history
router.get('/payout-history', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Get bookings that have been paid out
    const paidBookings = await Booking.find({
      host: user._id,
      payoutStatus: 'paid'
    }).populate('vehicle', 'make model year nickname')
      .populate('driver', 'firstName lastName')
      .sort({ payoutDate: -1 })
      .limit(50);

    const totalPaidOut = paidBookings.reduce((sum, b) => sum + (b.payoutAmount || 0), 0);

    res.json({
      payouts: paidBookings.map(b => {
        // Always compute from per-day rate to fix legacy bookings that stored a flat fee
        const correctHostFee = (b.hostPlatformFeePerDay || 1.50) * (b.totalDays || 0);
        const hostProcessingFee = Number(b.hostProcessingFee) || 0;
        return {
          id: b._id,
          reservationId: b.reservationId,
          vehicle: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Unknown',
          vehicleNickname: b.vehicle?.nickname || null,
          driver: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : 'Unknown',
          startDate: b.startDate,
          endDate: b.endDate,
          totalDays: b.totalDays,
          rentalType: b.rentalType,
          pricePerDay: b.pricePerDay,
          hostPlatformFee: correctHostFee,
          hostProcessingFee: hostProcessingFee,
          hostEarnings: b.hostEarnings,
          payoutAmount: b.payoutAmount,
          payoutDate: b.payoutDate,
          payoutId: b.payoutId
        };
      }),
      totalPaidOut
    });
  } catch (error) {
    console.error('Error getting payout history:', error);
    res.status(500).json({ message: 'Failed to get payout history', error: error.message });
  }
});

// Transfer earnings to host (called after booking completion + hold period)
router.post('/transfer-earnings', auth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate('host')
      .populate('vehicle', 'make model year');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify the requester is the host or an admin
    if (booking.host._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Verify booking is completed and paid
    if (booking.status !== 'completed' || booking.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'Booking must be completed and paid' });
    }

    // Verify not already paid out
    if (booking.payoutStatus === 'paid') {
      return res.status(400).json({ message: 'This booking has already been paid out' });
    }

    // Verify host has Connect account with payouts enabled
    const host = booking.host;
    if (!host.stripeConnectAccountId || !host.stripeConnectPayoutsEnabled) {
      return res.status(400).json({ message: 'Host payout account is not set up or enabled' });
    }

    // Verify booking is completed before transferring
    if (booking.status !== 'completed') {
      return res.status(400).json({ message: 'Booking must be completed before payout' });
    }

    // Recalculate correct host earnings from per-day values (fixes legacy bookings with flat $1.50 fee)
    const correctHostFee = (booking.hostPlatformFeePerDay || 1.50) * (booking.totalDays || 0);
    const rentalSubtotal = (booking.pricePerDay || 0) * (booking.totalDays || 0);
    const hostProcessingFee = Number(booking.hostProcessingFee) || 0;
    const correctEarnings = Math.max(0, rentalSubtotal - correctHostFee - hostProcessingFee);

    // Fix stored values if they were wrong
    if (booking.hostPlatformFee !== correctHostFee || booking.hostEarnings !== correctEarnings) {
      console.log(`💰 Correcting host fee for ${booking.reservationId}: $${booking.hostPlatformFee} -> $${correctHostFee}, earnings: $${booking.hostEarnings} -> $${correctEarnings}`);
      booking.hostPlatformFee = correctHostFee;
      booking.hostEarnings = correctEarnings;
    }

    // Create transfer to host's Connect account
    const transfer = await stripe.transfers.create({
      amount: Math.round(correctEarnings * 100), // Convert to cents
      currency: 'usd',
      destination: host.stripeConnectAccountId,
      description: `Payout for ${booking.reservationId} - ${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`,
      metadata: {
        bookingId: booking._id.toString(),
        reservationId: booking.reservationId,
        hostId: host._id.toString()
      }
    });

    // Update booking with payout info
    booking.payoutStatus = 'paid';
    booking.payoutId = transfer.id;
    booking.payoutDate = new Date();
    booking.payoutAmount = correctEarnings;
    await booking.save();

    console.log(`Transferred $${correctEarnings} to host ${host._id} for booking ${booking.reservationId}`);

    res.json({
      success: true,
      transferId: transfer.id,
      amount: booking.hostEarnings,
      message: `Successfully transferred $${booking.hostEarnings.toFixed(2)} to your account`
    });
  } catch (error) {
    console.error('Error transferring earnings:', error);
    res.status(500).json({ message: 'Failed to transfer earnings', error: error.message });
  }
});

// Batch transfer all eligible earnings
router.post('/transfer-all-eligible', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.stripeConnectAccountId || !user.stripeConnectPayoutsEnabled) {
      return res.status(400).json({ message: 'Payout account not set up or not enabled' });
    }

    // Find all eligible bookings (completed and paid)
    const eligibleBookings = await Booking.find({
      host: user._id,
      status: 'completed',
      paymentStatus: 'paid',
      payoutStatus: { $in: ['pending', 'eligible'] },
      hostEarnings: { $gt: 0 }
    }).populate('vehicle', 'make model year');

    if (eligibleBookings.length === 0) {
      return res.json({ success: true, message: 'No eligible payouts found', transferred: 0 });
    }

    // Recalculate correct earnings for each booking (fixes legacy bookings with flat $1.50 fee)
    for (const b of eligibleBookings) {
      const correctHostFee = (b.hostPlatformFeePerDay || 1.50) * (b.totalDays || 0);
      const rentalSubtotal = (b.pricePerDay || 0) * (b.totalDays || 0);
      const hostProcessingFee = Number(b.hostProcessingFee) || 0;
      const correctEarnings = Math.max(0, rentalSubtotal - correctHostFee - hostProcessingFee);
      if (b.hostPlatformFee !== correctHostFee || b.hostEarnings !== correctEarnings) {
        console.log(`💰 Correcting host fee for ${b.reservationId}: $${b.hostPlatformFee} -> $${correctHostFee}, earnings: $${b.hostEarnings} -> $${correctEarnings}`);
        b.hostPlatformFee = correctHostFee;
        b.hostEarnings = correctEarnings;
      }
    }

    // Calculate total
    const totalAmount = eligibleBookings.reduce((sum, b) => sum + b.hostEarnings, 0);

    // Create a single transfer for all eligible earnings
    const transfer = await stripe.transfers.create({
      amount: Math.round(totalAmount * 100),
      currency: 'usd',
      destination: user.stripeConnectAccountId,
      description: `Batch payout for ${eligibleBookings.length} bookings`,
      metadata: {
        hostId: user._id.toString(),
        bookingCount: eligibleBookings.length.toString(),
        bookingIds: eligibleBookings.map(b => b._id.toString()).join(',')
      }
    });

    // Update all bookings
    const now = new Date();
    await Booking.updateMany(
      { _id: { $in: eligibleBookings.map(b => b._id) } },
      {
        payoutStatus: 'paid',
        payoutId: transfer.id,
        payoutDate: now,
        $set: { payoutAmount: '$hostEarnings' }
      }
    );

    // Update each booking individually for payoutAmount (can't use $set with field reference in updateMany)
    for (const booking of eligibleBookings) {
      await Booking.findByIdAndUpdate(booking._id, {
        payoutStatus: 'paid',
        payoutId: transfer.id,
        payoutDate: now,
        payoutAmount: booking.hostEarnings
      });
    }

    console.log(`Batch transferred $${totalAmount} to host ${user._id} for ${eligibleBookings.length} bookings`);

    res.json({
      success: true,
      transferId: transfer.id,
      amount: totalAmount,
      bookingCount: eligibleBookings.length,
      message: `Successfully transferred $${totalAmount.toFixed(2)} for ${eligibleBookings.length} booking(s)`
    });
  } catch (error) {
    console.error('Error batch transferring:', error);
    res.status(500).json({ message: 'Failed to transfer earnings', error: error.message });
  }
});

// Get balance from Stripe (platform balance)
router.get('/balance', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user || !user.stripeConnectAccountId) {
      return res.json({ available: 0, pending: 0 });
    }

    // Get the balance of the connected account
    const balance = await stripe.balance.retrieve({
      stripeAccount: user.stripeConnectAccountId
    });

    const available = balance.available.reduce((sum, b) => sum + b.amount, 0) / 100;
    const pending = balance.pending.reduce((sum, b) => sum + b.amount, 0) / 100;

    res.json({ available, pending });
  } catch (error) {
    console.error('Error getting balance:', error);
    res.status(500).json({ message: 'Failed to get balance', error: error.message });
  }
});

// Webhook handler for Connect events (called by Stripe)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_CONNECT_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      event = JSON.parse(req.body);
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'account.updated': {
      const account = event.data.object;
      // Update user's Connect status
      const user = await User.findOne({ stripeConnectAccountId: account.id });
      if (user) {
        user.stripeConnectOnboardingComplete = account.details_submitted;
        user.stripeConnectPayoutsEnabled = account.payouts_enabled;
        user.stripeConnectChargesEnabled = account.charges_enabled;
        await user.save();
        console.log(`Updated Connect status for user ${user._id}: payouts=${account.payouts_enabled}`);
      }
      break;
    }
    case 'payout.paid': {
      const payout = event.data.object;
      console.log(`Payout ${payout.id} completed: $${payout.amount / 100}`);
      break;
    }
    case 'payout.failed': {
      const payout = event.data.object;
      console.error(`Payout ${payout.id} failed:`, payout.failure_message);
      // Could update booking payoutStatus to 'failed' here
      break;
    }
    default:
      console.log(`Unhandled Connect event type: ${event.type}`);
  }

  res.json({ received: true });
});

module.exports = router;
