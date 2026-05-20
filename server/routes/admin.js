const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');

// Verify the caller is an admin. Used by the frontend to gate /admin pages.
router.get('/ping', adminAuth, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role
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
      Booking.countDocuments({}),
      Booking.countDocuments({ createdAt: { $gte: startOfDay } }),
      Booking.countDocuments({ createdAt: { $gte: startOfWeek } }),
      Booking.countDocuments({ createdAt: { $gte: startOfMonth } }),
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

    booking.status = status;
    if (status === 'cancelled') {
      booking.cancelledBy = 'admin';
      booking.cancelledAt = new Date();
      if (note) booking.cancellationReason = note;
    }
    await booking.save();
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update status', error: err.message });
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
    await booking.save();

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

// Edit basic user fields. Admins cannot change passwords directly — they
// trigger a reset link instead (separate endpoint).
router.patch('/users/:id', adminAuth, async (req, res) => {
  try {
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'userType', 'accountStatus'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
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
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'You cannot demote yourself' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
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
    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update vehicle', error: err.message });
  }
});

module.exports = router;
