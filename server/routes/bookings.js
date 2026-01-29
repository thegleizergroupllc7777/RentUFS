const express = require('express');
const Booking = require('../models/Booking');
const { Counter } = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const auth = require('../middleware/auth');
const { sendBookingExtensionEmail } = require('../utils/emailService');

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

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
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

    // Drop-off time always matches pickup time (24-hour rental periods)
    const resolvedPickupTime = pickupTime || '10:00';
    const resolvedDropoffTime = resolvedPickupTime;

    const booking = new Booking({
      vehicle: vehicleId,
      driver: req.user._id,
      host: vehicle.host,
      startDate: start,
      endDate: end,
      pickupTime: resolvedPickupTime,
      dropoffTime: resolvedDropoffTime,
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
      .populate('driver', 'firstName lastName email phone profileImage')
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

    // Send extension confirmation emails to driver and host
    try {
      await sendBookingExtensionEmail(booking.driver, booking.host, booking, booking.vehicle);
    } catch (emailError) {
      console.error('❌ Extension email failed (non-blocking):', emailError);
    }

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

// Get host's available vehicles for switching a booking
router.get('/:id/available-vehicles', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only host can view available vehicles for switching
    if (booking.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the host can switch vehicles' });
    }

    // Only pending or confirmed bookings can have vehicles switched
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        message: 'Can only switch vehicles for pending or confirmed bookings'
      });
    }

    // Get all host's vehicles except the current one
    const hostVehicles = await Vehicle.find({
      host: req.user._id,
      _id: { $ne: booking.vehicle._id },
      availability: true
    });

    // Check for conflicting bookings on each vehicle
    const availableVehicles = [];

    for (const vehicle of hostVehicles) {
      // Check if this vehicle has any conflicting bookings
      const conflictingBooking = await Booking.findOne({
        vehicle: vehicle._id,
        _id: { $ne: booking._id },
        status: { $in: ['pending', 'confirmed', 'active'] },
        $or: [
          // Booking starts during the period
          { startDate: { $gte: booking.startDate, $lte: booking.endDate } },
          // Booking ends during the period
          { endDate: { $gte: booking.startDate, $lte: booking.endDate } },
          // Booking spans the entire period
          { startDate: { $lte: booking.startDate }, endDate: { $gte: booking.endDate } }
        ]
      });

      if (!conflictingBooking) {
        // Calculate price for this vehicle
        let newTotalPrice;
        if (booking.rentalType === 'weekly') {
          const weeklyRate = vehicle.pricePerWeek || (vehicle.pricePerDay * 7);
          newTotalPrice = booking.quantity * weeklyRate;
        } else if (booking.rentalType === 'monthly') {
          const monthlyRate = vehicle.pricePerMonth || (vehicle.pricePerDay * 30);
          newTotalPrice = booking.quantity * monthlyRate;
        } else {
          newTotalPrice = booking.totalDays * vehicle.pricePerDay;
        }

        const priceDifference = newTotalPrice - booking.totalPrice;

        availableVehicles.push({
          ...vehicle.toObject(),
          newTotalPrice,
          priceDifference,
          currentBookingPrice: booking.totalPrice
        });
      }
    }

    res.json({
      bookingId: booking._id,
      currentVehicle: booking.vehicle,
      startDate: booking.startDate,
      endDate: booking.endDate,
      availableVehicles
    });
  } catch (error) {
    console.error('Error fetching available vehicles:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Switch booking to a different vehicle
router.patch('/:id/switch-vehicle', auth, async (req, res) => {
  try {
    const { newVehicleId, reason } = req.body;

    if (!newVehicleId) {
      return res.status(400).json({ message: 'New vehicle ID is required' });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only host can switch vehicles
    if (booking.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the host can switch vehicles' });
    }

    // Only pending or confirmed bookings can have vehicles switched
    if (!['pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        message: 'Can only switch vehicles for pending or confirmed bookings'
      });
    }

    // Verify new vehicle exists and belongs to the same host
    const newVehicle = await Vehicle.findOne({
      _id: newVehicleId,
      host: req.user._id
    });

    if (!newVehicle) {
      return res.status(404).json({ message: 'New vehicle not found or unauthorized' });
    }

    // Check for conflicting bookings on the new vehicle
    const conflictingBooking = await Booking.findOne({
      vehicle: newVehicleId,
      _id: { $ne: booking._id },
      status: { $in: ['pending', 'confirmed', 'active'] },
      $or: [
        { startDate: { $gte: booking.startDate, $lte: booking.endDate } },
        { endDate: { $gte: booking.startDate, $lte: booking.endDate } },
        { startDate: { $lte: booking.startDate }, endDate: { $gte: booking.endDate } }
      ]
    });

    if (conflictingBooking) {
      return res.status(400).json({
        message: 'New vehicle is not available for the booking dates'
      });
    }

    // Calculate new price
    let newTotalPrice;
    let newPricePerDay = newVehicle.pricePerDay;

    if (booking.rentalType === 'weekly') {
      const weeklyRate = newVehicle.pricePerWeek || (newVehicle.pricePerDay * 7);
      newTotalPrice = booking.quantity * weeklyRate;
    } else if (booking.rentalType === 'monthly') {
      const monthlyRate = newVehicle.pricePerMonth || (newVehicle.pricePerDay * 30);
      newTotalPrice = booking.quantity * monthlyRate;
    } else {
      newTotalPrice = booking.totalDays * newVehicle.pricePerDay;
    }

    const priceDifference = newTotalPrice - booking.totalPrice;

    // Store previous vehicle info for history
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
      newPrice: newTotalPrice,
      priceDifference: priceDifference,
      reason: reason || 'Vehicle switched by host',
      switchedAt: new Date()
    });

    // Update booking with new vehicle and price
    booking.vehicle = newVehicleId;
    booking.pricePerDay = newPricePerDay;
    booking.totalPrice = newTotalPrice;

    await booking.save();

    // Populate the updated booking for response
    await booking.populate('vehicle');
    await booking.populate('driver', 'firstName lastName email');

    console.log(`✅ Vehicle switched for booking ${booking.reservationId}: ${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`);

    res.json({
      success: true,
      message: 'Vehicle switched successfully',
      booking: {
        _id: booking._id,
        reservationId: booking.reservationId,
        vehicle: booking.vehicle,
        previousPrice: previousPrice,
        newPrice: newTotalPrice,
        priceDifference: priceDifference,
        status: booking.status
      }
    });
  } catch (error) {
    console.error('❌ Error switching vehicle:', error);
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
