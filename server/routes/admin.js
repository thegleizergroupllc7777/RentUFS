const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const Message = require('../models/Message');
const { validateVin } = require('../utils/vinValidation');
const { calculateProcessingFee } = require('../utils/stripeFee');
const { sendBookingExtensionEmail, sendEmail } = require('../utils/emailService');
const { sendSMS } = require('../utils/smsService');
const BroadcastTemplate = require('../models/BroadcastTemplate');
const SmsSubscriber = require('../models/SmsSubscriber');
const { isSuperAdmin } = require('../utils/superAdmin');

// Append an admin action entry to a booking's audit log. Save before
// returning so the entry is persisted even if a later step fails.
async function logAdminAction(booking, admin, action, details = {}) {
  if (!booking.adminActions) booking.adminActions = [];
  booking.adminActions.push({
    admin: admin._id,
    adminEmail: admin.email,
    action,
    details,
    timestamp: new Date()
  });
  await booking.save();
}

// Verify the caller is an admin. Used by the frontend to gate /admin pages.
router.get('/ping', adminAuth, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      isSuperAdmin: isSuperAdmin(req.user)
    }
  });
});

// Dashboard stats — counts and totals for the admin landing page.
router.get('/stats', adminAuth, async (req, res) => {
  try {
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfDay);
    startOfWeek.setDate(startOfWeek.getDate() - 7);
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    const [
      totalUsers,
      totalDrivers,
      totalHosts,
      totalVehicles,
      activeVehicles,
      totalBookings,
      bookingsToday,
      bookingsThisWeek,
      bookingsThisMonth,
      activeBookings,
      pendingBookings,
      revenueAgg
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ userType: { $in: ['driver', 'both'] } }),
      User.countDocuments({ userType: { $in: ['host', 'both'] } }),
      Vehicle.countDocuments({}),
      Vehicle.countDocuments({ availability: true }),
      // Booking counts exclude cancelled and never-completed-checkout bookings so
      // metrics reflect real bookings, not abandoned/cancelled ones.
      Booking.countDocuments({ status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ createdAt: { $gte: startOfDay }, status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ createdAt: { $gte: startOfWeek }, status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ createdAt: { $gte: startOfMonth }, status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ status: 'active' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' }, platformRev: { $sum: '$platformRevenue' } } }
      ])
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const platformRevenue = revenueAgg[0]?.platformRev || 0;

    res.json({
      users: { total: totalUsers, drivers: totalDrivers, hosts: totalHosts },
      vehicles: { total: totalVehicles, active: activeVehicles },
      bookings: {
        total: totalBookings,
        today: bookingsToday,
        thisWeek: bookingsThisWeek,
        thisMonth: bookingsThisMonth,
        active: activeBookings,
        pending: pendingBookings
      },
      revenue: { total: totalRevenue, platform: platformRevenue }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load stats', error: err.message });
  }
});

// List bookings with optional search/filter/pagination.
router.get('/bookings', adminAuth, async (req, res) => {
  try {
    const { search = '', status = '', paymentStatus = '', page = 1, limit = 25 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    let query = Booking.find(filter);

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      const userIds = matchingUsers.map((u) => u._id);
      query = Booking.find({
        $and: [
          filter,
          {
            $or: [
              { reservationId: { $regex: search, $options: 'i' } },
              { driver: { $in: userIds } },
              { host: { $in: userIds } }
            ]
          }
        ]
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [bookings, total] = await Promise.all([
      query
        .populate('vehicle', 'make model year images')
        .populate('driver', 'email firstName lastName phone')
        .populate('host', 'email firstName lastName phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Booking.countDocuments(query.getFilter())
    ]);

    res.json({ bookings, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load bookings', error: err.message });
  }
});

// Get a single booking with full detail.
router.get('/bookings/:id', adminAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', '-password')
      .populate('host', '-password');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load booking', error: err.message });
  }
});

// Read-only: all chat messages for a booking (admin oversight). Separate from
// the driver/host /messages routes so their behavior is unchanged.
router.get('/bookings/:id/messages', adminAuth, async (req, res) => {
  try {
    const messages = await Message.find({ booking: req.params.id })
      .sort({ createdAt: 1 })
      .populate('sender', 'firstName lastName profileImage')
      .lean();
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load messages', error: err.message });
  }
});

// Change booking status. Admins can override the normal flow.
router.patch('/bookings/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, note } = req.body;
    const allowed = ['awaiting_payment', 'pending', 'confirmed', 'active', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const previousStatus = booking.status;
    booking.status = status;
    if (status === 'cancelled') {
      booking.cancelledBy = 'admin';
      booking.cancelledAt = new Date();
      if (note) booking.cancellationReason = note;
    }
    await logAdminAction(booking, req.user, 'status_changed', { from: previousStatus, to: status, note: note || null });
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update status', error: err.message });
  }
});

// Edit booking dates (and recalculate totalDays). Use with care — this does
// not adjust pricing automatically. For paid extensions use /extend below.
router.patch('/bookings/:id/dates', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, note } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const previousStart = booking.startDate;
    const previousEnd = booking.endDate;
    if (startDate) booking.startDate = new Date(startDate);
    if (endDate) booking.endDate = new Date(endDate);

    const msPerDay = 24 * 60 * 60 * 1000;
    booking.totalDays = Math.max(1, Math.ceil((booking.endDate - booking.startDate) / msPerDay));

    await logAdminAction(booking, req.user, 'dates_changed', {
      previousStart,
      previousEnd,
      newStart: booking.startDate,
      newEnd: booking.endDate,
      newTotalDays: booking.totalDays,
      note: note || null
    });

    res.json({ ok: true, booking });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update dates', error: err.message });
  }
});

// Admin-initiated booking extension. Default: auto-charge the driver via
// Stripe using their saved payment method. Pass charge=false to skip the
// charge (goodwill credit, manual reconciliation, etc.).
router.post('/bookings/:id/extend', adminAuth, async (req, res) => {
  try {
    const { extensionDays, charge = true, reason } = req.body;
    const days = parseInt(extensionDays, 10);
    if (!days || days < 1 || days > 60) {
      return res.status(400).json({ message: 'extensionDays must be between 1 and 60' });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver')
      .populate('host', 'firstName lastName email');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Compute the new end date and extension cost using the same formula
    // as the driver-initiated extension flow.
    const previousEndDate = new Date(booking.endDate);
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + days);

    const rentalCost = days * booking.pricePerDay;
    const platformFee = days * (booking.platformFeePerDay || 1.50);
    const insurance = days * (booking.insurance?.costPerDay || 0);
    const baseTotal = rentalCost + platformFee + insurance;
    const processing = calculateProcessingFee(baseTotal);
    const extensionCost = baseTotal + processing.driverProcessingFee;

    let chargeResult = null;
    let chargeError = null;
    if (charge) {
      const driver = booking.driver;
      const defaultPM = driver?.paymentMethods?.find((pm) => pm.isDefault && pm.stripePaymentMethodId);
      if (!driver?.stripeCustomerId || !defaultPM) {
        chargeError = 'Driver has no saved payment method on file';
      } else {
        try {
          const intent = await stripe.paymentIntents.create({
            amount: Math.round(extensionCost * 100),
            currency: 'usd',
            customer: driver.stripeCustomerId,
            payment_method: defaultPM.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            metadata: {
              type: 'admin_extension',
              bookingId: String(booking._id),
              reservationId: booking.reservationId || '',
              extensionDays: String(days),
              adminEmail: req.user.email
            },
            description: `Admin extension (${days} day${days !== 1 ? 's' : ''}) on ${booking.reservationId || booking._id}`
          });
          if (intent.status !== 'succeeded') {
            chargeError = `Payment intent status: ${intent.status}`;
          } else {
            chargeResult = { id: intent.id, amount: extensionCost };
          }
        } catch (err) {
          chargeError = err.message || 'Stripe charge failed';
        }
      }
    }

    // If we attempted a charge and it failed, do NOT mutate the booking dates.
    // The admin should see the failure and decide what to do (recover the
    // vehicle, escalate, retry with a different card, etc.).
    if (charge && chargeError) {
      await logAdminAction(booking, req.user, 'charge_failed', {
        extensionDays: days,
        attemptedAmount: extensionCost,
        error: chargeError,
        reason: reason || null
      });
      return res.status(402).json({
        ok: false,
        message: 'Extension charge failed — booking dates NOT updated.',
        error: chargeError,
        attemptedAmount: extensionCost
      });
    }

    // Apply the extension. Mirrors the user-facing /confirm-extension path.
    booking.endDate = newEndDate;
    booking.totalDays = booking.totalDays + days;
    booking.totalPrice = booking.totalPrice + (charge ? extensionCost : 0);
    if (charge) {
      booking.platformFee = (booking.platformFee || 0) + platformFee;
      booking.driverProcessingFee = (booking.driverProcessingFee || 0) + processing.driverProcessingFee;
      booking.hostProcessingFee = (booking.hostProcessingFee || 0) + processing.hostProcessingFee;
      booking.stripeFee = (booking.stripeFee || 0) + processing.stripeFee;
      if (booking.insurance && booking.insurance.totalCost !== undefined) {
        booking.insurance.totalCost = (booking.insurance.totalCost || 0) + insurance;
      }
      const hostFee = days * (booking.hostPlatformFeePerDay || 1.50);
      booking.hostPlatformFee = (booking.hostPlatformFee || 0) + hostFee;
      booking.hostEarnings = (booking.hostEarnings || 0) + rentalCost - hostFee - processing.hostProcessingFee;
      booking.platformRevenue = (booking.platformRevenue || 0) + platformFee + hostFee + insurance;
    }

    if (!booking.extensions) booking.extensions = [];
    booking.extensions.push({
      days,
      cost: charge ? extensionCost : 0,
      rental: charge ? rentalCost : 0,
      rentalType: 'daily',
      platformFee: charge ? platformFee : 0,
      insurance: charge ? insurance : 0,
      processingFee: charge ? processing.driverProcessingFee : 0,
      hostProcessingFee: charge ? processing.hostProcessingFee : 0,
      newEndDate,
      paymentId: chargeResult?.id || null,
      extendedAt: new Date()
    });

    await logAdminAction(booking, req.user, 'extended', {
      extensionDays: days,
      previousEndDate,
      newEndDate,
      charged: !!chargeResult,
      amount: chargeResult?.amount || 0,
      paymentIntentId: chargeResult?.id || null,
      reason: reason || null
    });

    // Notify driver + host that the booking was extended.
    try {
      await sendBookingExtensionEmail(booking.driver, booking.host, booking, booking.vehicle);
    } catch (emailErr) {
      console.error('Admin extension email failed (non-blocking):', emailErr.message);
    }

    res.json({
      ok: true,
      booking,
      charged: !!chargeResult,
      paymentIntentId: chargeResult?.id || null,
      amount: chargeResult?.amount || 0
    });
  } catch (err) {
    console.error('Admin extension error:', err);
    res.status(500).json({ message: 'Failed to extend booking', error: err.message });
  }
});

// Manually charge the driver for an arbitrary amount (late fee, damage,
// extension settlement, etc.). Uses the saved payment method.
router.post('/bookings/:id/charge', adminAuth, async (req, res) => {
  try {
    const { amount, description = 'Manual admin charge' } = req.body;
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents < 50) {
      return res.status(400).json({ message: 'amount must be at least $0.50' });
    }
    const booking = await Booking.findById(req.params.id).populate('driver');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const driver = booking.driver;
    const defaultPM = driver?.paymentMethods?.find((pm) => pm.isDefault && pm.stripePaymentMethodId);
    if (!driver?.stripeCustomerId || !defaultPM) {
      return res.status(400).json({ message: 'Driver has no saved payment method on file' });
    }

    try {
      const intent = await stripe.paymentIntents.create({
        amount: cents,
        currency: 'usd',
        customer: driver.stripeCustomerId,
        payment_method: defaultPM.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: {
          type: 'admin_manual_charge',
          bookingId: String(booking._id),
          reservationId: booking.reservationId || '',
          adminEmail: req.user.email
        },
        description: `${description} (${booking.reservationId || booking._id})`
      });
      if (intent.status !== 'succeeded') {
        await logAdminAction(booking, req.user, 'charge_failed', { amount, description, status: intent.status });
        return res.status(402).json({ ok: false, message: `Status: ${intent.status}` });
      }
      await logAdminAction(booking, req.user, 'charged', { amount, description, paymentIntentId: intent.id });
      res.json({ ok: true, paymentIntentId: intent.id, amount });
    } catch (err) {
      await logAdminAction(booking, req.user, 'charge_failed', { amount, description, error: err.message });
      res.status(402).json({ ok: false, message: err.message });
    }
  } catch (err) {
    res.status(500).json({ message: 'Charge failed', error: err.message });
  }
});

// Issue a refund through Stripe. Pass `amount` (in dollars) for partial refund,
// or omit for a full refund.
router.post('/bookings/:id/refund', adminAuth, async (req, res) => {
  try {
    const { amount, reason = 'requested_by_customer' } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!booking.paymentSessionId) {
      return res.status(400).json({ message: 'No payment session attached to this booking' });
    }

    const session = await stripe.checkout.sessions.retrieve(booking.paymentSessionId);
    const paymentIntentId = session.payment_intent;
    if (!paymentIntentId) {
      return res.status(400).json({ message: 'Stripe payment intent not found' });
    }

    const refundParams = { payment_intent: paymentIntentId, reason };
    if (amount && Number(amount) > 0) {
      refundParams.amount = Math.round(Number(amount) * 100); // dollars to cents
    }

    const refund = await stripe.refunds.create(refundParams);

    booking.paymentStatus = amount ? 'partial_refund' : 'refunded';
    await logAdminAction(booking, req.user, 'refunded', {
      amount: amount || null,
      reason,
      refundId: refund.id,
      partial: !!amount
    });

    res.json({ ok: true, refund, booking });
  } catch (err) {
    res.status(500).json({ message: 'Refund failed', error: err.message });
  }
});

// List users with optional search/filter/pagination.
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { search = '', userType = '', role = '', accountStatus = '', page = 1, limit = 25 } = req.query;
    const filter = {};
    if (userType) filter.userType = userType;
    if (role) filter.role = role;
    if (accountStatus) filter.accountStatus = accountStatus;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordToken -resetPasswordExpires')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load users', error: err.message });
  }
});

router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user', error: err.message });
  }
});

// Bookings for a user — as driver AND as host, sorted by most recent first.
router.get('/users/:id/bookings', adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const [asDriver, asHost] = await Promise.all([
      Booking.find({ driver: userId })
        .populate('vehicle', 'make model year images')
        .populate('host', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Booking.find({ host: userId })
        .populate('vehicle', 'make model year images')
        .populate('driver', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    ]);
    res.json({ asDriver, asHost });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user bookings', error: err.message });
  }
});

// Vehicles owned by a user (host).
router.get('/users/:id/vehicles', adminAuth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ host: req.params.id }).sort({ createdAt: -1 }).lean();
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user vehicles', error: err.message });
  }
});

// Aggregate stats for a user's lifetime activity.
router.get('/users/:id/stats', adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const [driverAgg, hostAgg, vehicleCount] = await Promise.all([
      Booking.aggregate([
        { $match: { driver: new (require('mongoose').Types.ObjectId)(String(userId)), paymentStatus: 'paid' } },
        { $group: { _id: null, count: { $sum: 1 }, totalSpent: { $sum: '$totalPrice' } } }
      ]),
      Booking.aggregate([
        { $match: { host: new (require('mongoose').Types.ObjectId)(String(userId)), paymentStatus: 'paid' } },
        { $group: { _id: null, count: { $sum: 1 }, totalEarned: { $sum: '$hostEarnings' }, grossBookings: { $sum: '$totalPrice' } } }
      ]),
      Vehicle.countDocuments({ host: userId })
    ]);
    res.json({
      asDriver: {
        paidBookings: driverAgg[0]?.count || 0,
        totalSpent: driverAgg[0]?.totalSpent || 0
      },
      asHost: {
        paidBookings: hostAgg[0]?.count || 0,
        totalEarned: hostAgg[0]?.totalEarned || 0,
        grossBookings: hostAgg[0]?.grossBookings || 0,
        vehicleCount
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user stats', error: err.message });
  }
});

// Edit basic user fields. Admins cannot change passwords directly — they
// trigger a reset link instead (separate endpoint).
router.patch('/users/:id', adminAuth, async (req, res) => {
  try {
    // Protect the owner: only a super admin may edit a super admin's account.
    const target = await User.findById(req.params.id).select('email isSuperAdmin');
    if (target && isSuperAdmin(target) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'You cannot modify the owner account.' });
    }
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'userType', 'accountStatus'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Custom per-host insurance rate (per day). Empty string / null clears it
    // (host reverts to the platform default). A positive number sets the override.
    if (req.body.customInsuranceRate !== undefined) {
      const raw = req.body.customInsuranceRate;
      if (raw === '' || raw === null) {
        updates['hostInfo.customInsuranceRate'] = null;
      } else {
        const rate = Number(raw);
        if (Number.isNaN(rate) || rate < 0) {
          return res.status(400).json({ message: 'Custom insurance rate must be a positive number' });
        }
        updates['hostInfo.customInsuranceRate'] = rate;
      }
    }

    // Per-host insurance coverage type. Applies to all of the host's vehicles
    // and is passed to TeqMobility when starting coverage.
    if (req.body.coverageType !== undefined) {
      const ct = req.body.coverageType;
      if (ct !== 'FULL_COVERAGE' && ct !== 'LIABILITY') {
        return res.status(400).json({ message: 'Coverage type must be FULL_COVERAGE or LIABILITY' });
      }
      updates['hostInfo.coverageType'] = ct;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user', error: err.message });
  }
});

router.post('/users/:id/suspend', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuperAdmin(user) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'You cannot deactivate the owner account.' });
    }
    user.accountStatus = 'deactivated';
    user.deactivatedAt = new Date();
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to suspend user', error: err.message });
  }
});

router.post('/users/:id/reactivate', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.accountStatus = 'active';
    user.deactivatedAt = undefined;
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reactivate user', error: err.message });
  }
});

router.post('/users/:id/promote', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only the owner can manage admin access.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.role = 'admin';
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to promote user', error: err.message });
  }
});

router.post('/users/:id/demote', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only the owner can manage admin access.' });
    }
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'You cannot demote yourself' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuperAdmin(user)) {
      return res.status(403).json({ message: 'The owner account cannot be demoted.' });
    }
    user.role = 'user';
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to demote user', error: err.message });
  }
});

// List vehicles with optional search/filter/pagination.
router.get('/vehicles', adminAuth, async (req, res) => {
  try {
    const { search = '', availability = '', page = 1, limit = 25 } = req.query;
    const filter = {};
    if (availability === 'true') filter.availability = true;
    if (availability === 'false') filter.availability = false;
    if (search) {
      filter.$or = [
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
        { 'location.state': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('host', 'email firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Vehicle.countDocuments(filter)
    ]);

    res.json({ vehicles, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load vehicles', error: err.message });
  }
});

router.patch('/vehicles/:id', adminAuth, async (req, res) => {
  try {
    const allowedFields = ['availability', 'make', 'model', 'year', 'pricePerDay', 'pricePerWeek', 'pricePerMonth'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // VIN correction is admin-only (hosts can't change it for insurance/legal
    // integrity). Validate the check digit, and never allow a change while the
    // vehicle is on an active rental (it would break the insurance link).
    if (req.body.vin !== undefined) {
      const newVin = String(req.body.vin).toUpperCase().trim();
      const check = validateVin(newVin);
      if (!check.valid) {
        return res.status(400).json({ message: `Invalid VIN: ${check.reason}` });
      }
      const activeRental = await Booking.findOne({ vehicle: req.params.id, status: 'active' });
      if (activeRental) {
        return res.status(409).json({ message: 'Cannot change VIN while this vehicle has an active rental. Wait until the trip is completed.' });
      }
      updates.vin = newVin;
    }

    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update vehicle', error: err.message });
  }
});

// ===========================================================================
// Broadcast — admin mass email / SMS to platform users (hosts/drivers).
// Additive feature. Does not touch booking, payment, insurance, or any
// existing notification flow. Email goes out via the same SendGrid setup used
// for transactional mail; SMS via the same Twilio setup used for booking
// alerts (and only to users who opted in to texts).
// ===========================================================================

// Build the audience filter from a target keyword.
function broadcastAudienceQuery(target) {
  if (target === 'hosts') return { userType: { $in: ['host', 'both'] } };
  if (target === 'drivers') return { userType: { $in: ['driver', 'both'] } };
  return {}; // 'both' / anything else => everyone
}

// Replace {firstName} with the recipient's first name.
function personalizeBroadcast(text, user) {
  return (text || '').replace(/\{firstName\}/g, (user && user.firstName) || 'there');
}

// Wrap a plain-text broadcast message in simple branded HTML + an unsubscribe
// footer (required for marketing email / keeps SendGrid happy).
function broadcastEmailHtml(messageText, unsubscribeUrl) {
  const safe = String(messageText || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#9ca3af;text-decoration:underline">Unsubscribe from promotional emails</a>`
    : '';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="background:#000000;padding:28px 20px;text-align:center;border-radius:8px 8px 0 0;">
        <span style="font-size:30px;font-weight:bold;letter-spacing:4px;color:#00FF66;">RENTUFS</span>
      </div>
      <div style="background:#f9fafb;padding:30px 28px;border-radius:0 0 8px 8px;color:#333333;font-size:15px;line-height:1.7;">${safe}</div>
      <p style="text-align:center;color:#9ca3af;font-size:12px;line-height:1.6;margin:18px 8px 0;">
        RentUFS<br>597 West Side Ave, PMB 194, Jersey City, NJ 07304${unsub}
      </p>
    </div>
  </body></html>`;
}

// Preview how many people a target audience would reach on each channel.
router.get('/broadcast/preview', adminAuth, async (req, res) => {
  try {
    // "Text sign-ups" — people who opted in via the keyword flow (text-only).
    if (req.query.audience === 'sms-subscribers') {
      const smsCount = await SmsSubscriber.countDocuments({ optedIn: true });
      return res.json({ total: smsCount, emailCount: 0, smsCount });
    }
    const query = { ...broadcastAudienceQuery(req.query.audience), accountStatus: { $ne: 'deactivated' } };
    const users = await User.find(query).select('email phone smsConsent emailOptOut').lean();
    const emailCount = users.filter(u => u.email && !u.emailOptOut).length;
    const smsCount = users.filter(u => u.phone && u.smsConsent && u.smsConsent.granted).length;
    res.json({ total: users.length, emailCount, smsCount });
  } catch (error) {
    console.error('❌ Broadcast preview error:', error.message);
    res.status(500).json({ message: 'Failed to load preview', error: error.message });
  }
});

// Send a broadcast. channel: 'email' | 'sms' | 'both'; audience: 'hosts' | 'drivers' | 'both'.
router.post('/broadcast', adminAuth, async (req, res) => {
  try {
    const { channel, audience, subject, message } = req.body;
    if (!message || !message.trim()) {
      return res.status(400).json({ message: 'Message is required.' });
    }
    if (!['email', 'sms', 'both'].includes(channel)) {
      return res.status(400).json({ message: 'Please choose a valid channel.' });
    }

    const doEmail = channel === 'email' || channel === 'both';
    const doSms = channel === 'sms' || channel === 'both';

    // "Specific people" — send only to the exact emails / phone numbers entered
    // (also used to test to yourself). Not pulled from the user list, so no
    // per-user unsubscribe link is added.
    if (audience === 'specific') {
      const raw = String(req.body.recipients || '');
      const tokens = raw.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
      const emails = tokens.filter(t => t.includes('@'));
      const phones = tokens.filter(t => !t.includes('@'));
      const r = { audience: tokens.length, emailSent: 0, emailFailed: 0, emailSkipped: 0, smsSent: 0, smsFailed: 0, smsSkipped: 0 };
      if (doEmail) {
        for (const email of emails) {
          try {
            await sendEmail({
              to: email,
              subject: (subject && subject.trim()) ? subject.trim() : 'A message from RentUFS',
              html: broadcastEmailHtml(personalizeBroadcast(message, {}), null)
            });
            r.emailSent++;
          } catch (e) { r.emailFailed++; }
        }
      }
      if (doSms) {
        for (const phone of phones) {
          try {
            await sendSMS(phone, personalizeBroadcast(message, {}));
            r.smsSent++;
          } catch (e) { r.smsFailed++; }
        }
      }
      console.log(`📣 Broadcast (specific) by ${req.user.email}:`, r);
      return res.json({ ok: true, results: r });
    }

    // "Text sign-ups" — opted-in keyword subscribers. Text-only audience.
    if (audience === 'sms-subscribers') {
      const subs = await SmsSubscriber.find({ optedIn: true }).select('phone').lean();
      const r = { audience: subs.length, emailSent: 0, emailFailed: 0, emailSkipped: 0, smsSent: 0, smsFailed: 0, smsSkipped: 0 };
      if (doSms) {
        for (const s of subs) {
          if (!s.phone) { r.smsSkipped++; continue; }
          try {
            await sendSMS(s.phone, personalizeBroadcast(message, {}));
            r.smsSent++;
          } catch (e) { r.smsFailed++; }
        }
      }
      console.log(`📣 Broadcast (sms-subscribers) by ${req.user.email}:`, r);
      return res.json({ ok: true, results: r });
    }

    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const base = `${proto}://${host}`;

    const query = { ...broadcastAudienceQuery(audience), accountStatus: { $ne: 'deactivated' } };
    const users = await User.find(query)
      .select('firstName email phone userType smsConsent emailOptOut')
      .lean();

    const results = {
      audience: users.length,
      emailSent: 0, emailFailed: 0, emailSkipped: 0,
      smsSent: 0, smsFailed: 0, smsSkipped: 0
    };

    for (const u of users) {
      if (doEmail) {
        if (!u.email || u.emailOptOut) {
          results.emailSkipped++;
        } else {
          try {
            const unsubscribeUrl = `${base}/api/users/unsubscribe/${u._id}`;
            await sendEmail({
              to: u.email,
              subject: (subject && subject.trim()) ? subject.trim() : 'A message from RentUFS',
              html: broadcastEmailHtml(personalizeBroadcast(message, u), unsubscribeUrl)
            });
            results.emailSent++;
          } catch (e) {
            results.emailFailed++;
          }
        }
      }
      if (doSms) {
        if (!u.phone || !(u.smsConsent && u.smsConsent.granted)) {
          results.smsSkipped++;
        } else {
          try {
            await sendSMS(u.phone, personalizeBroadcast(message, u));
            results.smsSent++;
          } catch (e) {
            results.smsFailed++;
          }
        }
      }
    }

    console.log(`📣 Broadcast by ${req.user.email}: channel=${channel} audience=${audience} ->`, results);
    res.json({ ok: true, results });
  } catch (error) {
    console.error('❌ Broadcast error:', error.message);
    res.status(500).json({ message: 'Failed to send broadcast', error: error.message });
  }
});

// Saved templates (admin convenience).
router.get('/broadcast/templates', adminAuth, async (req, res) => {
  try {
    const templates = await BroadcastTemplate.find().sort({ createdAt: -1 }).lean();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load templates', error: error.message });
  }
});

router.post('/broadcast/templates', adminAuth, async (req, res) => {
  try {
    const { name, channel, subject, message } = req.body;
    if (!name || !name.trim() || !message || !message.trim()) {
      return res.status(400).json({ message: 'Template name and message are required.' });
    }
    const tpl = await BroadcastTemplate.create({
      name: name.trim(),
      channel: ['email', 'sms', 'both'].includes(channel) ? channel : 'both',
      subject: subject || '',
      message,
      createdBy: req.user._id
    });
    res.json(tpl);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save template', error: error.message });
  }
});

router.delete('/broadcast/templates/:id', adminAuth, async (req, res) => {
  try {
    await BroadcastTemplate.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete template', error: error.message });
  }
});

module.exports = router;
