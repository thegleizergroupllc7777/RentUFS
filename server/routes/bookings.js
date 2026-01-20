const express = require('express');
const Booking = require('../models/Booking');
const { Counter } = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const auth = require('../middleware/auth');

const router = express.Router();

// Migration endpoint to add reservation IDs to existing bookings
router.post('/migrate-reservation-ids', auth, async (req, res) => {
  try {
    // Find all bookings without a reservationId
    const bookingsWithoutId = await Booking.find({
      $or: [
        { reservationId: { $exists: false } },
        { reservationId: null },
        { reservationId: '' }
      ]
    }).sort({ createdAt: 1 });

    const results = [];
    for (const booking of bookingsWithoutId) {
      const counter = await Counter.findByIdAndUpdate(
        'reservationId',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      const reservationId = `RUFS-${counter.seq.toString().padStart(5, '0')}`;

      await Booking.updateOne(
        { _id: booking._id },
        { $set: { reservationId: reservationId } }
      );

      results.push({ bookingId: booking._id, reservationId });
    }

    res.json({
      success: true,
      message: `Migrated ${results.length} bookings`,
      results
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ message: 'Migration failed', error: error.message });
  }
});

// Create booking
router.post('/', auth, async (req, res) => {
  try {
    const { vehicleId, startDate, endDate, pickupTime, dropoffTime, rentalType, quantity, message } = req.body;

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

    // Calculate total price based on rental type
    let totalPrice;
    let pricePerDay = vehicle.pricePerDay;

    if (rentalType === 'weekly') {
      // Use weekly rate if available, otherwise calculate from daily
      const weeklyRate = vehicle.pricePerWeek || (vehicle.pricePerDay * 7);
      totalPrice = quantity * weeklyRate;
    } else if (rentalType === 'monthly') {
      // Use monthly rate if available, otherwise calculate from daily
      const monthlyRate = vehicle.pricePerMonth || (vehicle.pricePerDay * 30);
      totalPrice = quantity * monthlyRate;
    } else {
      // Daily rate (default)
      totalPrice = totalDays * vehicle.pricePerDay;
    }

    const booking = new Booking({
      vehicle: vehicleId,
      driver: req.user._id,
      host: vehicle.host,
      startDate: start,
      endDate: end,
      pickupTime: pickupTime || '10:00',
      dropoffTime: dropoffTime || '10:00',
      totalDays,
      rentalType: rentalType || 'daily',
      quantity: quantity || totalDays,
      pricePerDay: vehicle.pricePerDay, // Store original daily rate
      totalPrice,
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

// Request booking extension (creates extension request, needs payment)
router.post('/:id/extend', auth, async (req, res) => {
  try {
    const { extensionDays } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('host', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only driver can request extension
    if (booking.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the driver can extend this booking' });
    }

    // Only active or confirmed bookings can be extended
    if (!['active', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Only active or confirmed bookings can be extended' });
    }

    // Only paid bookings can be extended
    if (booking.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'Booking must be paid before extending' });
    }

    // Validate extension days
    if (!extensionDays || extensionDays < 1 || extensionDays > 30) {
      return res.status(400).json({ message: 'Extension must be between 1 and 30 days' });
    }

    // Check if vehicle is available for the extension period
    const currentEndDate = new Date(booking.endDate);
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);

    console.log('Extension availability check:', {
      bookingId: booking._id,
      vehicleId: booking.vehicle._id,
      currentEndDate: currentEndDate.toISOString(),
      newEndDate: newEndDate.toISOString(),
      extensionDays
    });

    // Check for conflicting bookings - ONLY conflict if another booking
    // STARTS during the extension period (between current end and new end)
    // Simple and precise: startDate must be >= current end AND < new end
    const conflictingBooking = await Booking.findOne({
      vehicle: booking.vehicle._id,
      _id: { $ne: booking._id },
      status: { $in: ['confirmed', 'active'] },
      startDate: {
        $gte: currentEndDate,  // Starts on or after current booking ends
        $lt: newEndDate        // Starts before the new end date
      }
    });

    if (conflictingBooking) {
      console.log('Extension conflict found:', {
        bookingId: booking._id,
        conflictingId: conflictingBooking._id,
        conflictingStartDate: conflictingBooking.startDate,
        extensionPeriod: { start: currentEndDate, end: newEndDate }
      });
      return res.status(400).json({
        message: 'Vehicle is not available for the requested extension period',
        availableUntil: conflictingBooking.startDate
      });
    }

    // Calculate extension cost
    const extensionCost = extensionDays * booking.pricePerDay;

    res.json({
      bookingId: booking._id,
      currentEndDate: booking.endDate,
      newEndDate,
      extensionDays,
      pricePerDay: booking.pricePerDay,
      extensionCost,
      vehicle: {
        id: booking.vehicle._id,
        name: `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`
      }
    });
  } catch (error) {
    console.error('Extension request error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Confirm booking extension (after payment)
router.post('/:id/confirm-extension', auth, async (req, res) => {
  try {
    const { extensionDays, paymentIntentId } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email')
      .populate('host', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only driver can confirm extension
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Only active or confirmed bookings can be extended
    if (!['active', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({ message: 'Only active or confirmed bookings can be extended' });
    }

    // Calculate new values
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);
    const extensionCost = extensionDays * booking.pricePerDay;

    // Update booking
    booking.endDate = newEndDate;
    booking.totalDays = booking.totalDays + extensionDays;
    booking.totalPrice = booking.totalPrice + extensionCost;

    // Track extension history
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
      message: `Booking extended by ${extensionDays} day(s)`,
      booking: {
        _id: booking._id,
        newEndDate: booking.endDate,
        totalDays: booking.totalDays,
        totalPrice: booking.totalPrice,
        extensionCost
      }
    });
  } catch (error) {
    console.error('Extension confirmation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Start reservation with pickup inspection photos
router.post('/:id/start-inspection', auth, async (req, res) => {
  try {
    const { photos, notes } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('host', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only driver can start the inspection
    if (booking.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the driver can start this reservation' });
    }

    // Check booking status - must be confirmed and paid
    if (booking.status !== 'confirmed') {
      return res.status(400).json({ message: 'Booking must be confirmed before starting' });
    }

    if (booking.paymentStatus !== 'paid') {
      return res.status(400).json({ message: 'Payment must be completed before starting' });
    }

    // Validate all 4 photos are provided
    if (!photos || !photos.frontView || !photos.backView || !photos.leftSide || !photos.rightSide) {
      return res.status(400).json({
        message: 'All 4 inspection photos are required (front, back, left side, right side)'
      });
    }

    // Update booking with inspection photos and change status to active
    booking.pickupInspection = {
      completed: true,
      completedAt: new Date(),
      photos: {
        frontView: photos.frontView,
        backView: photos.backView,
        leftSide: photos.leftSide,
        rightSide: photos.rightSide
      },
      notes: notes || ''
    };
    booking.status = 'active';

    await booking.save();

    res.json({
      success: true,
      message: 'Reservation started successfully! Drive safely!',
      booking: {
        _id: booking._id,
        status: booking.status,
        pickupInspection: booking.pickupInspection
      }
    });
  } catch (error) {
    console.error('Start inspection error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Complete reservation with return inspection photos
router.post('/:id/return-inspection', auth, async (req, res) => {
  try {
    const { photos, notes } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('host', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only driver can complete the return inspection
    if (booking.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the driver can return this vehicle' });
    }

    // Check booking status - must be active
    if (booking.status !== 'active') {
      return res.status(400).json({ message: 'Booking must be active to complete return' });
    }

    // Validate all 4 photos are provided
    if (!photos || !photos.frontView || !photos.backView || !photos.leftSide || !photos.rightSide) {
      return res.status(400).json({
        message: 'All 4 return inspection photos are required (front, back, left side, right side)'
      });
    }

    // Update booking with return inspection photos and change status to completed
    booking.returnInspection = {
      completed: true,
      completedAt: new Date(),
      photos: {
        frontView: photos.frontView,
        backView: photos.backView,
        leftSide: photos.leftSide,
        rightSide: photos.rightSide
      },
      notes: notes || ''
    };
    booking.status = 'completed';

    await booking.save();

    res.json({
      success: true,
      message: 'Vehicle returned successfully! Thank you for renting with us!',
      booking: {
        _id: booking._id,
        status: booking.status,
        returnInspection: booking.returnInspection
      }
    });
  } catch (error) {
    console.error('Return inspection error:', error);
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
