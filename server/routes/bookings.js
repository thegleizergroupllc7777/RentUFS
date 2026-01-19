const express = require('express');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const auth = require('../middleware/auth');

const router = express.Router();

// Create booking
router.post('/', auth, async (req, res) => {
  try {
    const { vehicleId, startDate, endDate, message } = req.body;

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (totalDays < 1) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    const booking = new Booking({
      vehicle: vehicleId,
      driver: req.user._id,
      host: vehicle.host,
      startDate: start,
      endDate: end,
      totalDays,
      pricePerDay: vehicle.pricePerDay,
      totalPrice: totalDays * vehicle.pricePerDay,
      message
    });

    await booking.save();
    await booking.populate(['vehicle', 'driver', 'host']);

    res.status(201).json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user's bookings (as driver)
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ driver: req.user._id })
      .populate('vehicle')
      .populate('host', 'firstName lastName email phone')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get host's bookings
router.get('/host-bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ host: req.user._id })
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone')
      .sort({ createdAt: -1 });

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get host's earnings summary with per-vehicle breakdown
router.get('/host-earnings', auth, async (req, res) => {
  try {
    const now = new Date();

    // Calculate date boundaries
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Fetch all completed and paid bookings for the host
    const completedBookings = await Booking.find({
      host: req.user._id,
      status: 'completed',
      paymentStatus: 'paid'
    }).populate('vehicle', 'make model year images');

    // Fetch confirmed/active bookings (pending earnings)
    const pendingBookings = await Booking.find({
      host: req.user._id,
      status: { $in: ['confirmed', 'active'] },
      paymentStatus: 'paid'
    }).populate('vehicle', 'make model year images');

    // Calculate totals
    const calculateTotal = (bookings) => bookings.reduce((sum, b) => sum + (b.totalPrice || 0), 0);
    const filterByDate = (bookings, startDate) => bookings.filter(b => new Date(b.endDate) >= startDate);

    // Overall earnings
    const totalEarnings = calculateTotal(completedBookings);
    const todayEarnings = calculateTotal(filterByDate(completedBookings, startOfToday));
    const weekEarnings = calculateTotal(filterByDate(completedBookings, startOfWeek));
    const monthEarnings = calculateTotal(filterByDate(completedBookings, startOfMonth));
    const pendingEarnings = calculateTotal(pendingBookings);

    // Per-vehicle breakdown
    const vehicleEarningsMap = new Map();

    [...completedBookings, ...pendingBookings].forEach(booking => {
      if (!booking.vehicle) return;

      const vehicleId = booking.vehicle._id.toString();
      const existing = vehicleEarningsMap.get(vehicleId) || {
        vehicleId,
        make: booking.vehicle.make,
        model: booking.vehicle.model,
        year: booking.vehicle.year,
        image: booking.vehicle.images?.[0] || null,
        totalEarnings: 0,
        todayEarnings: 0,
        weekEarnings: 0,
        monthEarnings: 0,
        pendingEarnings: 0,
        tripCount: 0
      };

      const price = booking.totalPrice || 0;
      const endDate = new Date(booking.endDate);

      if (booking.status === 'completed') {
        existing.totalEarnings += price;
        existing.tripCount += 1;
        if (endDate >= startOfToday) existing.todayEarnings += price;
        if (endDate >= startOfWeek) existing.weekEarnings += price;
        if (endDate >= startOfMonth) existing.monthEarnings += price;
      } else {
        existing.pendingEarnings += price;
      }

      vehicleEarningsMap.set(vehicleId, existing);
    });

    const vehicleEarnings = Array.from(vehicleEarningsMap.values())
      .sort((a, b) => b.totalEarnings - a.totalEarnings);

    res.json({
      summary: {
        totalEarnings,
        todayEarnings,
        weekEarnings,
        monthEarnings,
        pendingEarnings,
        completedTrips: completedBookings.length,
        activeBookings: pendingBookings.length
      },
      vehicleEarnings
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single booking by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only allow driver or host to view the booking
    if (booking.driver._id.toString() !== req.user._id.toString() &&
        booking.host._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update booking status
router.patch('/:id/status', auth, async (req, res) => {
  try {
    const { status } = req.body;
    const booking = await Booking.findById(req.params.id);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only host can confirm/cancel, driver can cancel their own bookings
    if (booking.host.toString() !== req.user._id.toString() &&
        booking.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    booking.status = status;
    await booking.save();

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
