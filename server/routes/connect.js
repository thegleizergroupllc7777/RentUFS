const express = require('express');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const auth = require('../middleware/auth');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { sendPayoutNotificationEmail } = require('../utils/emailService');

const router = express.Router();

const { getBookingSegments, getTotalSegmentEarnings, calculateEarningsForDayRange } = require('../utils/earningSegments');

// Simple in-memory cache for Stripe account data (avoids repeated API calls)
const stripeCache = new Map();
const STRIPE_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// Cache for per-user account status verification (avoids re-verifying on every request)
const accountStatusVerifiedAt = new Map();
const ACCOUNT_STATUS_VERIFY_INTERVAL = 30 * 60 * 1000; // 30 minutes

const getCachedStripeAccount = async (accountId) => {
  const cached = stripeCache.get(accountId);
  if (cached && Date.now() - cached.timestamp < STRIPE_CACHE_TTL) {
    return cached.data;
  }
  const account = await stripe.accounts.retrieve(accountId);
  stripeCache.set(accountId, { data: account, timestamp: Date.now() });
  return account;
};

const invalidateStripeCache = (accountId) => {
  stripeCache.delete(accountId);
};

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
        const platformAccount = await getCachedStripeAccount(platId);
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
        const platformAccount = await getCachedStripeAccount(platId);
        console.log(`🔍 Platform check — User: ${user.email}, PlatformEmail: ${platformAccount.email || 'none'}, ConnectId: ${user.stripeConnectAccountId || 'none'}, PlatformId: ${platId}`);

        // Check if user's stored Connect account IS the platform account (retrieved as connected account returns type 'none')
        if (user.stripeConnectAccountId) {
          try {
            const userAccount = await getCachedStripeAccount(user.stripeConnectAccountId);
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
      account = await getCachedStripeAccount(user.stripeConnectAccountId);
    } catch (retrieveErr) {
      // Connect account can't be retrieved (wrong mode, deleted, etc.)
      // Clear the stale reference so user sees a clean state
      console.log(`⚠️ Clearing stale Connect account ${user.stripeConnectAccountId} for user ${user.email}: ${retrieveErr.message}`);
      invalidateStripeCache(user.stripeConnectAccountId);
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
    // Pre-compute segments for each completed booking (avoids recalculating 3x per booking)
    const completedSegmentsMap = new Map();
    for (const b of completedBookings) {
      const segments = getBookingSegments(b);
      completedSegmentsMap.set(b._id.toString(), {
        segments,
        correctEarnings: segments.reduce((sum, seg) => sum + seg.earnings, 0),
        correctHostFee: segments.reduce((sum, seg) => sum + seg.hostFee, 0),
        rentalSubtotal: segments.reduce((sum, seg) => sum + seg.rental, 0),
        hostProcessingFee: segments.reduce((sum, seg) => sum + seg.hostProcessingFee, 0)
      });
    }

    // Build active booking entries — start date counts as day 1
    // Uses segment-based calculation for accurate per-day earnings with mixed rental types
    const activeEntries = [];
    for (const b of activeBookings) {
      const startDate = new Date(b.startDate);
      const daysSinceStart = Math.min(b.totalDays || Infinity, Math.floor((now - startDate) / (1000 * 60 * 60 * 24)) + 1);
      const daysAlreadyPaid = b.partialPayoutDaysPaid || 0;
      const unpaidDaysServed = Math.max(0, daysSinceStart - daysAlreadyPaid);

      const segments = getBookingSegments(b);
      const totalExpectedEarnings = parseFloat(segments.reduce((sum, seg) => sum + seg.earnings, 0).toFixed(2));

      // Calculate earnings for unpaid days using segment-based day range
      const unpaidResult = unpaidDaysServed > 0
        ? calculateEarningsForDayRange(segments, daysAlreadyPaid + 1, daysSinceStart)
        : { earnings: 0, breakdown: [] };
      const unpaidAmount = unpaidResult.earnings;

      // Calculate already paid amount using segment-based day range
      const alreadyPaidResult = daysAlreadyPaid > 0
        ? calculateEarningsForDayRange(segments, 1, daysAlreadyPaid)
        : { earnings: 0 };
      const alreadyPaidAmount = alreadyPaidResult.earnings;

      // Average daily earnings for display (total / days)
      const dailyEarnings = (b.totalDays || 1) > 0 ? totalExpectedEarnings / (b.totalDays || 1) : 0;

      activeEntries.push({
        booking: b,
        unpaidDaysServed,
        daysAlreadyPaid,
        daysSinceStart,
        unpaidAmount,
        dailyEarnings,
        totalExpectedEarnings,
        alreadyPaidAmount,
        segments,
        unpaidBreakdown: unpaidResult.breakdown
      });
    }

    // Calculate totals — completed earnings + active unpaid served earnings
    const totalCompletedPending = completedBookings.reduce((sum, b) => sum + completedSegmentsMap.get(b._id.toString()).correctEarnings, 0);
    const totalActivePending = activeEntries.reduce((sum, e) => sum + e.unpaidAmount, 0);
    const totalPending = totalCompletedPending + totalActivePending;

    // Map completed bookings
    const completedEntries = completedBookings.map(b => {
      const { segments, correctHostFee, rentalSubtotal, hostProcessingFee, correctEarnings } = completedSegmentsMap.get(b._id.toString());
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
        rentalSubtotal: parseFloat(rentalSubtotal.toFixed(2)),
        hostPlatformFee: parseFloat(correctHostFee.toFixed(2)),
        hostProcessingFee: parseFloat(hostProcessingFee.toFixed(2)),
        hostEarnings: parseFloat(correctEarnings.toFixed(2)),
        payoutStatus: b.payoutStatus,
        payoutEligibleDate: b.payoutEligibleDate || b.endDate,
        bookingStatus: 'completed',
        hasExtensions: (b.extensions || []).length > 0,
        segments: segments.map(seg => ({
          days: seg.days,
          rental: seg.rental,
          dailyEarnings: parseFloat(seg.dailyEarnings.toFixed(2))
        }))
      };
    });

    // Map active booking entries with segment-based earnings breakdown
    const activeMapped = activeEntries.map(e => {
      const b = e.booking;

      // Sum rental, host fee, and processing fee across unpaid segments
      let rentalForServed = 0;
      let hostFeeForServed = 0;
      let processingFeeForServed = 0;
      if (e.unpaidBreakdown && e.unpaidBreakdown.length > 0) {
        // Use segment breakdown for accurate per-segment attribution
        let dayOffset = 0;
        for (const seg of e.segments) {
          const segStart = dayOffset + 1;
          const segEnd = dayOffset + seg.days;
          const unpaidFrom = e.daysAlreadyPaid + 1;
          const unpaidTo = e.daysSinceStart;
          const overlapStart = Math.max(unpaidFrom, segStart);
          const overlapEnd = Math.min(unpaidTo, segEnd);
          if (overlapStart <= overlapEnd) {
            const overlapDays = overlapEnd - overlapStart + 1;
            const ratio = overlapDays / seg.days;
            rentalForServed += seg.rental * ratio;
            hostFeeForServed += seg.hostFee * ratio;
            processingFeeForServed += seg.hostProcessingFee * ratio;
          }
          dayOffset += seg.days;
        }
      } else {
        hostFeeForServed = (b.hostPlatformFeePerDay || 1.50) * e.unpaidDaysServed;
        rentalForServed = (b.pricePerDay || 0) * e.unpaidDaysServed;
        const hostProcessingFee = Number(b.hostProcessingFee) || 0;
        processingFeeForServed = parseFloat(((hostProcessingFee / (b.totalDays || 1)) * e.unpaidDaysServed).toFixed(2));
      }

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
        rentalSubtotal: parseFloat(rentalForServed.toFixed(2)),
        hostPlatformFee: parseFloat(hostFeeForServed.toFixed(2)),
        hostProcessingFee: parseFloat(processingFeeForServed.toFixed(2)),
        hostEarnings: e.unpaidAmount,
        payoutStatus: 'eligible',
        payoutEligibleDate: now,
        bookingStatus: 'active',
        daysServed: e.daysSinceStart,
        daysAlreadyPaid: e.daysAlreadyPaid,
        unpaidDaysServed: e.unpaidDaysServed,
        totalExpectedEarnings: e.totalExpectedEarnings,
        alreadyPaidAmount: e.alreadyPaidAmount,
        dailyEarnings: e.dailyEarnings,
        hasExtensions: (b.extensions || []).length > 0,
        segments: e.segments.map(seg => ({
          days: seg.days,
          rental: seg.rental,
          dailyEarnings: parseFloat(seg.dailyEarnings.toFixed(2))
        }))
      };
    });

    // Match frontend badge logic: eligible if active OR payoutEligibleDate <= now
    const isEligible = (b) => b.bookingStatus === 'active' || new Date(b.payoutEligibleDate) <= now;

    // Combine and sort: eligible first, then pending; within each group oldest end date first
    const allPendingBookings = [...activeMapped, ...completedEntries].sort((a, b) => {
      const aEligible = isEligible(a) ? 0 : 1;
      const bEligible = isEligible(b) ? 0 : 1;
      if (aEligible !== bEligible) return aEligible - bEligible;
      return new Date(a.endDate) - new Date(b.endDate);
    });

    // Compute eligible count and total using same logic as frontend badge
    const eligibleBookings = allPendingBookings.filter(isEligible);
    const eligibleCount = eligibleBookings.length;
    const totalEligible = eligibleBookings.reduce((sum, b) => sum + (b.hostEarnings || 0), 0);

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
    }).select('reservationId startDate endDate totalDays rentalType pricePerDay pricePerUnit quantity hostEarnings payoutAmount payoutDate payoutId hostPlatformFeePerDay hostProcessingFee partialPayoutDaysPaid partialPayoutTotal extensions')
      .populate('vehicle', 'make model year nickname')
      .populate('driver', 'firstName lastName')
      .sort({ payoutDate: -1 })
      .limit(50)
      .lean();

    const totalPaidOut = paidBookings.reduce((sum, b) => sum + (b.payoutAmount || 0), 0);

    res.json({
      payouts: paidBookings.map(b => {
        // Use segment-based calculation for accurate earnings with mixed rental types
        const segments = getBookingSegments(b);
        const rentalSubtotal = segments.reduce((sum, seg) => sum + seg.rental, 0);
        const correctHostFee = segments.reduce((sum, seg) => sum + seg.hostFee, 0);
        const hostProcessingFee = segments.reduce((sum, seg) => sum + seg.hostProcessingFee, 0);
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
          rentalSubtotal: parseFloat(rentalSubtotal.toFixed(2)),
          hostPlatformFee: parseFloat(correctHostFee.toFixed(2)),
          hostProcessingFee: parseFloat(hostProcessingFee.toFixed(2)),
          hostEarnings: b.hostEarnings,
          payoutAmount: b.payoutAmount,
          payoutDate: b.payoutDate,
          payoutId: b.payoutId,
          hasExtensions: (b.extensions || []).length > 0,
          segments: segments.map(seg => ({
            days: seg.days,
            rental: seg.rental,
            dailyEarnings: parseFloat(seg.dailyEarnings.toFixed(2))
          }))
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

// Combined endpoint: returns account-status + pending-payouts + payout-history summary + balance
// in a single request to eliminate 3 extra round-trips on Payouts tab load
router.get('/payouts-summary', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // --- Account Status (fast path: trust local DB fields, verify periodically) ---
    let accountStatusData = null;
    const userId = user._id.toString();
    const lastVerified = accountStatusVerifiedAt.get(userId) || 0;
    const needsStripeVerify = Date.now() - lastVerified > ACCOUNT_STATUS_VERIFY_INTERVAL;

    // Fast path: if user has completed onboarding and we verified recently, skip Stripe API calls
    if (!needsStripeVerify && user.stripeConnectAccountId && user.stripeConnectOnboardingComplete) {
      accountStatusData = {
        hasAccount: true,
        accountId: user.stripeConnectAccountId,
        onboardingComplete: true,
        payoutsEnabled: user.stripeConnectPayoutsEnabled,
        chargesEnabled: user.stripeConnectChargesEnabled
      };
    }

    // Fast path: no account at all
    if (!accountStatusData && !user.stripeConnectAccountId) {
      accountStatusData = {
        hasAccount: false, onboardingComplete: false, payoutsEnabled: false, chargesEnabled: false
      };
    }

    // Slow path: verify against Stripe (first load, cache expired, or incomplete onboarding)
    if (!accountStatusData) {
      const platId = await getPlatformAccountId();

      // Check platform owner by ID
      if (platId && user.stripeConnectAccountId === platId) {
        accountStatusData = {
          hasAccount: true, isPlatformOwner: true, onboardingComplete: true,
          payoutsEnabled: true, chargesEnabled: true
        };
      }

      // Check platform owner by email or account type
      if (!accountStatusData && platId) {
        try {
          // Fetch platform and user accounts in parallel
          const [platformAccount, userAccount] = await Promise.all([
            getCachedStripeAccount(platId),
            user.stripeConnectAccountId ? getCachedStripeAccount(user.stripeConnectAccountId).catch(() => null) : Promise.resolve(null)
          ]);

          if (userAccount && (!userAccount.type || userAccount.type === 'none')) {
            user.stripeConnectAccountId = platId;
            user.stripeConnectOnboardingComplete = true;
            user.stripeConnectPayoutsEnabled = true;
            user.stripeConnectChargesEnabled = true;
            await user.save();
            accountStatusData = {
              hasAccount: true, isPlatformOwner: true, onboardingComplete: true,
              payoutsEnabled: true, chargesEnabled: true
            };
          }

          if (!accountStatusData && platformAccount.email && platformAccount.email.toLowerCase() === user.email.toLowerCase()) {
            user.stripeConnectAccountId = platId;
            user.stripeConnectOnboardingComplete = true;
            user.stripeConnectPayoutsEnabled = true;
            user.stripeConnectChargesEnabled = true;
            await user.save();
            accountStatusData = {
              hasAccount: true, isPlatformOwner: true, onboardingComplete: true,
              payoutsEnabled: true, chargesEnabled: true
            };
          }

          // Use the already-fetched user account for the final check
          if (!accountStatusData && userAccount) {
            const needsUpdate =
              user.stripeConnectOnboardingComplete !== userAccount.details_submitted ||
              user.stripeConnectPayoutsEnabled !== userAccount.payouts_enabled ||
              user.stripeConnectChargesEnabled !== userAccount.charges_enabled;
            if (needsUpdate) {
              user.stripeConnectOnboardingComplete = userAccount.details_submitted;
              user.stripeConnectPayoutsEnabled = userAccount.payouts_enabled;
              user.stripeConnectChargesEnabled = userAccount.charges_enabled;
              await user.save();
            }
            accountStatusData = {
              hasAccount: true,
              accountId: user.stripeConnectAccountId,
              onboardingComplete: userAccount.details_submitted,
              payoutsEnabled: userAccount.payouts_enabled,
              chargesEnabled: userAccount.charges_enabled,
              requirements: userAccount.requirements,
              payoutSchedule: userAccount.settings?.payouts?.schedule
            };
          }
        } catch (e) {
          console.error('⚠️ Error checking platform account:', e.message);
        }
      }

      // If we still have no status and user has an account ID, try fetching it directly
      if (!accountStatusData && user.stripeConnectAccountId) {
        try {
          const account = await getCachedStripeAccount(user.stripeConnectAccountId);
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
          accountStatusData = {
            hasAccount: true,
            accountId: user.stripeConnectAccountId,
            onboardingComplete: account.details_submitted,
            payoutsEnabled: account.payouts_enabled,
            chargesEnabled: account.charges_enabled,
            requirements: account.requirements,
            payoutSchedule: account.settings?.payouts?.schedule
          };
        } catch (retrieveErr) {
          console.log(`⚠️ Clearing stale Connect account ${user.stripeConnectAccountId} for user ${user.email}: ${retrieveErr.message}`);
          invalidateStripeCache(user.stripeConnectAccountId);
          user.stripeConnectAccountId = undefined;
          user.stripeConnectOnboardingComplete = false;
          user.stripeConnectPayoutsEnabled = false;
          user.stripeConnectChargesEnabled = false;
          await user.save();
          accountStatusData = {
            hasAccount: false, onboardingComplete: false, payoutsEnabled: false, chargesEnabled: false
          };
        }
      }

      // No account at all
      if (!accountStatusData) {
        accountStatusData = {
          hasAccount: false, onboardingComplete: false, payoutsEnabled: false, chargesEnabled: false
        };
      }

      // Mark as verified so next request uses fast path
      accountStatusVerifiedAt.set(userId, Date.now());
    }

    // If account not set up, return early — no need to query bookings or balance
    if (!accountStatusData.hasAccount) {
      return res.json({
        accountStatus: accountStatusData,
        pendingPayouts: { pendingBookings: [], totalPending: 0, totalEligible: 0, eligibleCount: 0, payoutsEnabled: false },
        payoutHistorySummary: { totalPaidOut: 0, count: 0 },
        balance: { available: 0, pending: 0 }
      });
    }

    // --- Run DB queries and Stripe balance in parallel ---
    // Select only the fields needed for segment calculations and display
    const bookingFields = 'reservationId startDate endDate totalDays rentalType pricePerDay pricePerUnit quantity payoutStatus payoutEligibleDate hostPlatformFeePerDay hostProcessingFee partialPayoutDaysPaid partialPayoutTotal extensions';

    // Select only the fields needed for segment calculations and display
    const bookingFields = 'reservationId startDate endDate totalDays rentalType pricePerDay pricePerUnit quantity payoutStatus payoutEligibleDate hostPlatformFeePerDay hostProcessingFee partialPayoutDaysPaid partialPayoutTotal extensions';

    const [completedBookings, activeBookings, paidBookingsAgg, balanceData] = await Promise.all([
      // Pending payouts: completed bookings
      Booking.find({
        host: user._id,
        status: 'completed',
        paymentStatus: 'paid',
        payoutStatus: { $in: ['pending', 'eligible'] }
      }).select(bookingFields)
        .populate('vehicle', 'make model year nickname')
        .populate('driver', 'firstName lastName')
        .sort({ endDate: -1 })
        .lean(),

      // Pending payouts: active bookings
      Booking.find({
        host: user._id,
        status: 'active',
        paymentStatus: 'paid'
      }).select(bookingFields)
        .populate('vehicle', 'make model year nickname')
        .populate('driver', 'firstName lastName')
        .sort({ startDate: -1 })
        .lean(),

      // Payout history summary (just totals, not full documents)
      Booking.aggregate([
        { $match: { host: user._id, payoutStatus: 'paid' } },
        { $group: { _id: null, totalPaidOut: { $sum: '$payoutAmount' }, count: { $sum: 1 } } }
      ]),

      // Stripe balance
      (user.stripeConnectAccountId && !accountStatusData.isPlatformOwner)
        ? stripe.balance.retrieve({ stripeAccount: user.stripeConnectAccountId })
            .then(b => ({
              available: b.available.reduce((sum, x) => sum + x.amount, 0) / 100,
              pending: b.pending.reduce((sum, x) => sum + x.amount, 0) / 100
            }))
            .catch(() => ({ available: 0, pending: 0 }))
        : Promise.resolve({ available: 0, pending: 0 })
    ]);

    // --- Build pending payouts response (same logic as /pending-payouts) ---
    const now = new Date();

    const completedSegmentsMap = new Map();
    for (const b of completedBookings) {
      const segments = getBookingSegments(b);
      completedSegmentsMap.set(b._id.toString(), {
        segments,
        correctEarnings: segments.reduce((sum, seg) => sum + seg.earnings, 0),
        correctHostFee: segments.reduce((sum, seg) => sum + seg.hostFee, 0),
        rentalSubtotal: segments.reduce((sum, seg) => sum + seg.rental, 0),
        hostProcessingFee: segments.reduce((sum, seg) => sum + seg.hostProcessingFee, 0)
      });
    }

    const activeEntries = [];
    for (const b of activeBookings) {
      const startDate = new Date(b.startDate);
      const daysSinceStart = Math.min(b.totalDays || Infinity, Math.floor((now - startDate) / (1000 * 60 * 60 * 24)) + 1);
      const daysAlreadyPaid = b.partialPayoutDaysPaid || 0;
      const unpaidDaysServed = Math.max(0, daysSinceStart - daysAlreadyPaid);

      const segments = getBookingSegments(b);
      const totalExpectedEarnings = parseFloat(segments.reduce((sum, seg) => sum + seg.earnings, 0).toFixed(2));

      const unpaidResult = unpaidDaysServed > 0
        ? calculateEarningsForDayRange(segments, daysAlreadyPaid + 1, daysSinceStart)
        : { earnings: 0, breakdown: [] };
      const unpaidAmount = unpaidResult.earnings;

      const alreadyPaidResult = daysAlreadyPaid > 0
        ? calculateEarningsForDayRange(segments, 1, daysAlreadyPaid)
        : { earnings: 0 };
      const alreadyPaidAmount = alreadyPaidResult.earnings;

      const dailyEarnings = (b.totalDays || 1) > 0 ? totalExpectedEarnings / (b.totalDays || 1) : 0;

      activeEntries.push({
        booking: b, unpaidDaysServed, daysAlreadyPaid, daysSinceStart,
        unpaidAmount, dailyEarnings, totalExpectedEarnings, alreadyPaidAmount,
        segments, unpaidBreakdown: unpaidResult.breakdown
      });
    }

    const totalCompletedPending = completedBookings.reduce((sum, b) => sum + completedSegmentsMap.get(b._id.toString()).correctEarnings, 0);
    const totalActivePending = activeEntries.reduce((sum, e) => sum + e.unpaidAmount, 0);
    const totalPending = totalCompletedPending + totalActivePending;

    const completedEntries = completedBookings.map(b => {
      const { segments, correctHostFee, rentalSubtotal, hostProcessingFee, correctEarnings } = completedSegmentsMap.get(b._id.toString());
      return {
        id: b._id, reservationId: b.reservationId,
        vehicle: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Unknown',
        vehicleNickname: b.vehicle?.nickname || null,
        driver: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : 'Unknown',
        startDate: b.startDate, endDate: b.endDate, totalDays: b.totalDays,
        rentalType: b.rentalType, pricePerDay: b.pricePerDay,
        pricePerUnit: b.pricePerUnit || b.pricePerDay,
        quantity: (!b.rentalType || b.rentalType === 'daily') ? (b.totalDays || 0) : (b.quantity || b.totalDays || 0),
        rentalSubtotal: parseFloat(rentalSubtotal.toFixed(2)),
        hostPlatformFee: parseFloat(correctHostFee.toFixed(2)),
        hostProcessingFee: parseFloat(hostProcessingFee.toFixed(2)),
        hostEarnings: parseFloat(correctEarnings.toFixed(2)),
        payoutStatus: b.payoutStatus,
        payoutEligibleDate: b.payoutEligibleDate || b.endDate,
        bookingStatus: 'completed',
        hasExtensions: (b.extensions || []).length > 0,
        segments: segments.map(seg => ({ days: seg.days, rental: seg.rental, dailyEarnings: parseFloat(seg.dailyEarnings.toFixed(2)) }))
      };
    });

    const activeMapped = activeEntries.map(e => {
      const b = e.booking;
      let rentalForServed = 0, hostFeeForServed = 0, processingFeeForServed = 0;
      if (e.unpaidBreakdown && e.unpaidBreakdown.length > 0) {
        let dayOffset = 0;
        for (const seg of e.segments) {
          const segStart = dayOffset + 1;
          const segEnd = dayOffset + seg.days;
          const unpaidFrom = e.daysAlreadyPaid + 1;
          const unpaidTo = e.daysSinceStart;
          const overlapStart = Math.max(unpaidFrom, segStart);
          const overlapEnd = Math.min(unpaidTo, segEnd);
          if (overlapStart <= overlapEnd) {
            const overlapDays = overlapEnd - overlapStart + 1;
            const ratio = overlapDays / seg.days;
            rentalForServed += seg.rental * ratio;
            hostFeeForServed += seg.hostFee * ratio;
            processingFeeForServed += seg.hostProcessingFee * ratio;
          }
          dayOffset += seg.days;
        }
      } else {
        hostFeeForServed = (b.hostPlatformFeePerDay || 1.50) * e.unpaidDaysServed;
        rentalForServed = (b.pricePerDay || 0) * e.unpaidDaysServed;
        const hostProcessingFee = Number(b.hostProcessingFee) || 0;
        processingFeeForServed = parseFloat(((hostProcessingFee / (b.totalDays || 1)) * e.unpaidDaysServed).toFixed(2));
      }

      return {
        id: b._id, reservationId: b.reservationId,
        vehicle: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Unknown',
        vehicleNickname: b.vehicle?.nickname || null,
        driver: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : 'Unknown',
        startDate: b.startDate, endDate: b.endDate, totalDays: b.totalDays,
        rentalType: b.rentalType, pricePerDay: b.pricePerDay,
        pricePerUnit: b.pricePerUnit || b.pricePerDay,
        quantity: e.unpaidDaysServed,
        rentalSubtotal: parseFloat(rentalForServed.toFixed(2)),
        hostPlatformFee: parseFloat(hostFeeForServed.toFixed(2)),
        hostProcessingFee: parseFloat(processingFeeForServed.toFixed(2)),
        hostEarnings: e.unpaidAmount,
        payoutStatus: 'eligible', payoutEligibleDate: now,
        bookingStatus: 'active', daysServed: e.daysSinceStart,
        daysAlreadyPaid: e.daysAlreadyPaid, unpaidDaysServed: e.unpaidDaysServed,
        totalExpectedEarnings: e.totalExpectedEarnings, alreadyPaidAmount: e.alreadyPaidAmount,
        dailyEarnings: e.dailyEarnings,
        hasExtensions: (b.extensions || []).length > 0,
        segments: e.segments.map(seg => ({ days: seg.days, rental: seg.rental, dailyEarnings: parseFloat(seg.dailyEarnings.toFixed(2)) }))
      };
    });

    const isEligible = (b) => b.bookingStatus === 'active' || new Date(b.payoutEligibleDate) <= now;
    const allPendingBookings = [...activeMapped, ...completedEntries].sort((a, b) => {
      const aEligible = isEligible(a) ? 0 : 1;
      const bEligible = isEligible(b) ? 0 : 1;
      if (aEligible !== bEligible) return aEligible - bEligible;
      return new Date(a.endDate) - new Date(b.endDate);
    });

    const eligibleBookings = allPendingBookings.filter(isEligible);
    const eligibleCount = eligibleBookings.length;
    const totalEligible = eligibleBookings.reduce((sum, b) => sum + (b.hostEarnings || 0), 0);

    // Payout history summary from aggregation
    const historyAgg = paidBookingsAgg[0] || { totalPaidOut: 0, count: 0 };

    res.json({
      accountStatus: accountStatusData,
      pendingPayouts: {
        pendingBookings: allPendingBookings,
        totalPending,
        totalEligible,
        eligibleCount,
        payoutsEnabled: user.stripeConnectPayoutsEnabled
      },
      payoutHistorySummary: {
        totalPaidOut: historyAgg.totalPaidOut || 0,
        count: historyAgg.count || 0
      },
      balance: balanceData
    });
  } catch (error) {
    console.error('Error getting payouts summary:', error);
    res.status(500).json({ message: 'Failed to get payouts summary', error: error.message });
  }
});

module.exports = router;
