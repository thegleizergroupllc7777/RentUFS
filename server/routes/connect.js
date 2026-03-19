const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { sendPayoutNotificationEmail } = require('../utils/emailService');

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

    // Platform owner doesn't need a Connect account — revenue goes directly to platform
    const platId = await getPlatformAccountId();
    if (platId) {
      if (user.stripeConnectAccountId === platId) {
        return res.status(400).json({ message: 'As the platform owner, payments go directly to your Stripe account. No separate payout setup is needed.' });
      }
      // Also check by email
      try {
        const platformAccount = await stripe.accounts.retrieve(platId);
        if (platformAccount.email && platformAccount.email.toLowerCase() === user.email.toLowerCase()) {
          return res.status(400).json({ message: 'As the platform owner, payments go directly to your Stripe account. No separate payout setup is needed.' });
        }
      } catch (e) { /* ignore */ }
    }

    // If already has a Connect account, return it
    if (user.stripeConnectAccountId) {
      try {
        const account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
        return res.json({
          accountId: user.stripeConnectAccountId,
          onboardingComplete: user.stripeConnectOnboardingComplete,
          payoutsEnabled: account.payouts_enabled,
          chargesEnabled: account.charges_enabled,
          detailsSubmitted: account.details_submitted
        });
      } catch (retrieveErr) {
        // Connect account is invalid (wrong mode, deleted, etc.) — clear it so user can start fresh
        console.log(`⚠️ Clearing stale Connect account ${user.stripeConnectAccountId} for user ${user.email}: ${retrieveErr.message}`);
        user.stripeConnectAccountId = undefined;
        user.stripeConnectOnboardingComplete = false;
        user.stripeConnectPayoutsEnabled = false;
        user.stripeConnectChargesEnabled = false;
        await user.save();
        // Fall through to create a new account
      }
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

    // Platform owner doesn't need onboarding — they own the Stripe account directly
    const platId = await getPlatformAccountId();
    if (platId && user.stripeConnectAccountId === platId) {
      return res.status(400).json({ message: 'As the platform owner, your payouts are already active. Please refresh the page.' });
    }


    // Verify the account still exists on Stripe before creating the link
    let account;
    try {
      account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
    } catch (retrieveErr) {
      console.error('❌ Stripe Connect account not found:', retrieveErr.message);
      // Account doesn't exist on Stripe — clear the stale reference so user can re-create
      user.stripeConnectAccountId = undefined;
      user.stripeConnectOnboardingComplete = false;
      user.stripeConnectPayoutsEnabled = false;
      user.stripeConnectChargesEnabled = false;
      await user.save();
      return res.status(400).json({ message: 'Your payout account was not found. Please set up a new one.' });
    }

    // If onboarding is already complete, they don't need an onboarding link
    if (account.details_submitted) {
      // Update local status
      user.stripeConnectOnboardingComplete = true;
      user.stripeConnectPayoutsEnabled = account.payouts_enabled;
      user.stripeConnectChargesEnabled = account.charges_enabled;
      await user.save();
      return res.status(400).json({ message: 'Your account setup is already complete. Please refresh the page.' });
    }

    const accountLink = await stripe.accountLinks.create({
      account: user.stripeConnectAccountId,
      refresh_url: `${getClientUrl()}/host/payouts?refresh=true`,
      return_url: `${getClientUrl()}/host/payouts?onboarding=complete`,
      type: 'account_onboarding'
    });

    res.json({ url: accountLink.url });
  } catch (error) {
    console.error('❌ Error creating onboarding link:', error.message);

    // If the Stripe error indicates the account type doesn't support onboarding links,
    // provide a more helpful message
    const stripeCode = error.code || error.raw?.code || '';
    if (stripeCode === 'account_invalid' || error.message?.includes('cannot create')) {
      return res.status(400).json({
        message: 'Unable to create onboarding link. Your account may need to be recreated. Please contact support.',
        stripeError: error.message
      });
    }

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

    // Check if this user is the platform owner (by matching Connect ID or email)
    const platId = await getPlatformAccountId();
    if (platId) {
      // Match by stored Connect ID
      if (user.stripeConnectAccountId === platId) {
        console.log(`🔍 Platform owner detected by ID match: ${user.email}`);
        return res.json({
          hasAccount: true,
          isPlatformOwner: true,
          onboardingComplete: true,
          payoutsEnabled: true,
          chargesEnabled: true
        });
      }
      // Match by email or account type — platform owner may not have a Connect ID stored
      try {
        const platformAccount = await stripe.accounts.retrieve(platId);
        console.log(`🔍 Platform check — User: ${user.email}, PlatformEmail: ${platformAccount.email || 'none'}, ConnectId: ${user.stripeConnectAccountId || 'none'}, PlatformId: ${platId}`);

        // Check if user's stored Connect account IS the platform account (retrieved as connected account returns type 'none')
        if (user.stripeConnectAccountId) {
          try {
            const userAccount = await stripe.accounts.retrieve(user.stripeConnectAccountId);
            if (!userAccount.type || userAccount.type === 'none') {
              console.log(`🔍 Platform owner detected: stored account ${user.stripeConnectAccountId} is the platform account (type: ${userAccount.type})`);
              user.stripeConnectAccountId = platId;
              user.stripeConnectOnboardingComplete = true;
              user.stripeConnectPayoutsEnabled = true;
              user.stripeConnectChargesEnabled = true;
              await user.save();
              return res.json({
                hasAccount: true,
                isPlatformOwner: true,
                onboardingComplete: true,
                payoutsEnabled: true,
                chargesEnabled: true
              });
            }
          } catch (e) {
            // Can't retrieve user's Connect account — will be handled below
          }
        }

        if (platformAccount.email && platformAccount.email.toLowerCase() === user.email.toLowerCase()) {
          console.log(`🔍 Platform owner detected by email match: ${user.email}`);
          // Store the platform ID so future checks are faster
          user.stripeConnectAccountId = platId;
          user.stripeConnectOnboardingComplete = true;
          user.stripeConnectPayoutsEnabled = true;
          user.stripeConnectChargesEnabled = true;
          await user.save();
          return res.json({
            hasAccount: true,
            isPlatformOwner: true,
            onboardingComplete: true,
            payoutsEnabled: true,
            chargesEnabled: true
          });
        }
      } catch (e) {
        console.error('⚠️ Error checking platform account email:', e.message);
      }
    }

    if (!user.stripeConnectAccountId) {
      return res.json({
        hasAccount: false,
        onboardingComplete: false,
        payoutsEnabled: false,
        chargesEnabled: false
      });
    }

    // Get latest account status from Stripe
    let account;
    try {
      account = await stripe.accounts.retrieve(user.stripeConnectAccountId);
    } catch (retrieveErr) {
      // Connect account can't be retrieved (wrong mode, deleted, etc.)
      // Clear the stale reference so user sees a clean state
      console.log(`⚠️ Clearing stale Connect account ${user.stripeConnectAccountId} for user ${user.email}: ${retrieveErr.message}`);
      user.stripeConnectAccountId = undefined;
      user.stripeConnectOnboardingComplete = false;
      user.stripeConnectPayoutsEnabled = false;
      user.stripeConnectChargesEnabled = false;
      await user.save();

      return res.json({
        hasAccount: false,
        onboardingComplete: false,
        payoutsEnabled: false,
        chargesEnabled: false
      });
    }

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
    const completedBookings = await Booking.find({
      host: user._id,
      status: 'completed',
      paymentStatus: 'paid',
      payoutStatus: { $in: ['pending', 'eligible'] }
    }).populate('vehicle', 'make model year nickname')
      .populate('driver', 'firstName lastName')
      .sort({ endDate: -1 });

    // Get active bookings (long reservations with partial weekly payouts)
    const activeBookings = await Booking.find({
      host: user._id,
      status: 'active',
      paymentStatus: 'paid'
    }).populate('vehicle', 'make model year nickname')
      .populate('driver', 'firstName lastName')
      .sort({ startDate: -1 });

    const now = new Date();

    // Recompute earnings for completed bookings (fix legacy stored values)
    const recomputeEarnings = (b) => {
      const correctHostFee = (b.hostPlatformFeePerDay || 1.50) * (b.totalDays || 0);
      const rentalSubtotal = (!b.rentalType || b.rentalType === 'daily')
        ? (b.pricePerDay || 0) * (b.totalDays || 0)
        : (b.pricePerUnit || b.pricePerDay || 0) * (b.quantity || b.totalDays || 0);
      const hostProcessingFee = Number(b.hostProcessingFee) || 0;
      const correctEarnings = Math.max(0, rentalSubtotal - correctHostFee - hostProcessingFee);
      return { correctHostFee, rentalSubtotal, hostProcessingFee, correctEarnings };
    };

    // Calculate daily host earnings for active bookings (same as scheduler logic)
    const calculateDailyHostEarnings = (b) => {
      const totalDays = b.totalDays || 1;
      const correctHostFee = (b.hostPlatformFeePerDay || 1.50) * totalDays;
      const rentalSubtotal = (!b.rentalType || b.rentalType === 'daily')
        ? (b.pricePerDay || 0) * totalDays
        : (b.pricePerUnit || b.pricePerDay || 0) * (b.quantity || totalDays);
      const hostProcessingFee = Number(b.hostProcessingFee) || 0;
      const totalEarnings = Math.max(0, rentalSubtotal - correctHostFee - hostProcessingFee);
      return totalEarnings / totalDays;
    };

    // Build active booking entries — only for unpaid days already served
    const activeEntries = [];
    for (const b of activeBookings) {
      const startDate = new Date(b.startDate);
      const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
      const daysAlreadyPaid = b.partialPayoutDaysPaid || 0;
      const unpaidDaysServed = Math.max(0, daysSinceStart - daysAlreadyPaid);

      if (unpaidDaysServed <= 0) continue;

      const dailyEarnings = calculateDailyHostEarnings(b);
      const unpaidAmount = parseFloat((dailyEarnings * unpaidDaysServed).toFixed(2));

      if (unpaidAmount <= 0) continue;

      activeEntries.push({
        booking: b,
        unpaidDaysServed,
        daysAlreadyPaid,
        daysSinceStart,
        unpaidAmount,
        dailyEarnings
      });
    }

    // Calculate totals — completed earnings + active unpaid served earnings
    const totalCompletedPending = completedBookings.reduce((sum, b) => sum + recomputeEarnings(b).correctEarnings, 0);
    const totalActivePending = activeEntries.reduce((sum, e) => sum + e.unpaidAmount, 0);
    const totalPending = totalCompletedPending + totalActivePending;

    // Eligible: completed bookings ready for payout + all active unpaid served days
    const eligibleCompleted = completedBookings.filter(b =>
      b.payoutStatus === 'eligible' || (b.payoutEligibleDate && new Date(b.payoutEligibleDate) <= now)
    );
    const totalEligibleCompleted = eligibleCompleted.reduce((sum, b) => sum + recomputeEarnings(b).correctEarnings, 0);
    const totalEligible = totalEligibleCompleted + totalActivePending;
    const eligibleCount = eligibleCompleted.length + activeEntries.length;

    // Map completed bookings
    const completedEntries = completedBookings.map(b => {
      const { correctHostFee, rentalSubtotal, hostProcessingFee, correctEarnings } = recomputeEarnings(b);
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
        pricePerUnit: b.pricePerUnit || b.pricePerDay,
        quantity: (!b.rentalType || b.rentalType === 'daily') ? (b.totalDays || 0) : (b.quantity || b.totalDays || 0),
        rentalSubtotal,
        hostPlatformFee: correctHostFee,
        hostProcessingFee: hostProcessingFee,
        hostEarnings: correctEarnings,
        payoutStatus: b.payoutStatus,
        payoutEligibleDate: b.payoutEligibleDate || b.endDate,
        bookingStatus: 'completed'
      };
    });

    // Map active booking entries (only unpaid served portion)
    const activeMapped = activeEntries.map(e => {
      const b = e.booking;
      const hostFeeForServed = (b.hostPlatformFeePerDay || 1.50) * e.unpaidDaysServed;
      const rentalForServed = (b.pricePerDay || 0) * e.unpaidDaysServed;
      const hostProcessingFee = Number(b.hostProcessingFee) || 0;
      const processingFeeForServed = parseFloat(((hostProcessingFee / (b.totalDays || 1)) * e.unpaidDaysServed).toFixed(2));

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
        pricePerUnit: b.pricePerUnit || b.pricePerDay,
        quantity: e.unpaidDaysServed,
        rentalSubtotal: rentalForServed,
        hostPlatformFee: hostFeeForServed,
        hostProcessingFee: processingFeeForServed,
        hostEarnings: e.unpaidAmount,
        payoutStatus: 'eligible',
        payoutEligibleDate: now,
        bookingStatus: 'active',
        daysServed: e.daysSinceStart,
        daysAlreadyPaid: e.daysAlreadyPaid,
        unpaidDaysServed: e.unpaidDaysServed
      };
    });

    // Combine: active first (they're eligible), then completed
    const allPendingBookings = [...activeMapped, ...completedEntries];

    res.json({
      pendingBookings: allPendingBookings,
      totalPending,
      totalEligible,
      eligibleCount,
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
          pricePerUnit: b.pricePerUnit || b.pricePerDay,
          quantity: (!b.rentalType || b.rentalType === 'daily') ? (b.totalDays || 0) : (b.quantity || b.totalDays || 0),
          rentalSubtotal: (!b.rentalType || b.rentalType === 'daily')
            ? (b.pricePerDay || 0) * (b.totalDays || 0)
            : (b.pricePerUnit || b.pricePerDay || 0) * (b.quantity || b.totalDays || 0),
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
      const payoutAmount = payout.amount / 100;
      console.log(`Payout ${payout.id} completed: $${payoutAmount}`);

      // Notify host that funds are arriving in their bank
      if (event.account) {
        const payoutHost = await User.findOne({ stripeConnectAccountId: event.account });
        if (payoutHost) {
          sendPayoutNotificationEmail(payoutHost, {
            totalAmount: payoutAmount,
            bookingCount: 0, // Stripe-level payout, no specific booking count
            transferId: payout.id,
            bookings: []
          }).catch(err => console.error('📧 Payout.paid email failed:', err.message));
        }
      }
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
