const express = require('express');
const Booking = require('../models/Booking');
const { Counter } = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendBookingExtensionEmail, sendBookingCancellationEmail } = require('../utils/emailService');
const { startRentalCoverage, stopRentalCoverage } = require('../utils/teqmobility');
const { captureCardImage } = require('../utils/screenshotCard');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');

const router = express.Router();

// Auto-cancel stale awaiting_payment bookings (older than 30 minutes)
const cleanupStaleBookings = async () => {
  try {
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
    const result = await Booking.updateMany(
      { status: 'awaiting_payment', createdAt: { $lt: thirtyMinutesAgo } },
      { status: 'cancelled', cancellationReason: 'Payment not completed within 30 minutes', cancelledAt: new Date() }
    );
    if (result.modifiedCount > 0) {
      console.log(`🧹 Auto-cancelled ${result.modifiedCount} stale awaiting_payment booking(s)`);
    }
  } catch (err) {
    console.error('Error cleaning up stale bookings:', err);
  }
};

// Auto-expire confirmed/active bookings whose rental period has fully passed
// Uses a 1-day buffer to avoid premature expiration due to UTC/timezone mismatch
const expireStaleBookings = async () => {
  try {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    // Subtract 1 day as buffer — only expire bookings that ended BEFORE yesterday
    const cutoff = new Date(now);
    cutoff.setDate(cutoff.getDate() - 1);

    // Confirmed bookings well past end date — rental window expired without pickup
    const staleConfirmed = await Booking.find({
      status: 'confirmed',
      endDate: { $lt: cutoff }
    }).select('vehicle').lean();

    if (staleConfirmed.length > 0) {
      const staleConfirmedIds = staleConfirmed.map(b => b._id);
      await Booking.updateMany(
        { _id: { $in: staleConfirmedIds } },
        { status: 'cancelled', cancellationReason: 'Booking expired — rental period passed without pickup', cancelledAt: new Date() }
      );
      const vehicleIds = staleConfirmed.map(b => b.vehicle);
      await Vehicle.updateMany({ _id: { $in: vehicleIds } }, { availability: true });
    }

    // Active bookings well past end date — trip ended but return inspection never completed
    const staleActive = await Booking.find({
      status: 'active',
      endDate: { $lt: cutoff }
    }).select('vehicle').lean();

    if (staleActive.length > 0) {
      const staleActiveIds = staleActive.map(b => b._id);
      await Booking.updateMany(
        { _id: { $in: staleActiveIds } },
        { status: 'completed', completedAt: new Date() }
      );
      const vehicleIds = staleActive.map(b => b.vehicle);
      await Vehicle.updateMany({ _id: { $in: vehicleIds } }, { availability: true });
    }

    const total = staleConfirmed.length + staleActive.length;
    if (total > 0) {
      console.log(`🧹 Auto-expired ${staleConfirmed.length} stale confirmed + ${staleActive.length} stale active booking(s)`);
    }
  } catch (err) {
    console.error('Error expiring stale bookings:', err);
  }
};

// Run cleanups every 5 minutes
setInterval(cleanupStaleBookings, 5 * 60 * 1000);
setInterval(expireStaleBookings, 5 * 60 * 1000);
// Run once on startup
cleanupStaleBookings();
expireStaleBookings();

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

    // Verify driver has a valid license on file
    const driver = await User.findById(req.user._id);
    if (!driver.driverLicense?.licenseNumber || !driver.driverLicense?.expirationDate) {
      return res.status(400).json({ message: 'A valid driver\'s license is required to book a vehicle. Please add your license information in your profile.' });
    }
    if (new Date(driver.driverLicense.expirationDate) < new Date()) {
      return res.status(400).json({ message: 'Your driver\'s license is expired. Please update your license information in your profile.' });
    }

    // Validate required date fields
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Please select a pick-up date' });
    }

    const vehicle = await Vehicle.findById(vehicleId);
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    // Validate dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

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

    // Platform transaction fee: $1.50 per day
    const platformFeePerDay = 1.50;
    const platformFee = platformFeePerDay * totalDays;
    const rentalSubtotal = totalPrice; // Rental amount before fees
    totalPrice = totalPrice + platformFee;

    // Revenue split: host gets rental subtotal, platform keeps fee (+ insurance added later)
    const hostEarnings = rentalSubtotal;
    const platformRevenue = platformFee;

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
      platformFeePerDay,
      platformFee,
      hostEarnings,
      platformRevenue,
      status: 'awaiting_payment',
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
    const bookings = await Booking.find({ driver: req.user._id, status: { $ne: 'awaiting_payment' } })
      .populate('vehicle')
      .populate('host', 'firstName lastName email phone profileImage hostInfo.displayPreference hostInfo.businessName hostInfo.dba')
      .sort({ createdAt: -1 })
      .lean();

    res.json(bookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get host's bookings
router.get('/host-bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ host: req.user._id, status: { $ne: 'awaiting_payment' } })
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone profileImage')
      .sort({ createdAt: -1 })
      .lean();

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

    // Calculate extension cost: rental + platform fee per day + insurance per day
    const rentalCost = extensionDays * booking.pricePerDay;
    const extensionPlatformFee = extensionDays * (booking.platformFeePerDay || 1.50);
    const extensionInsurance = extensionDays * (booking.insurance?.costPerDay || 0);
    const extensionCost = rentalCost + extensionPlatformFee + extensionInsurance;

    res.json({
      bookingId: booking._id,
      currentEndDate: booking.endDate,
      newEndDate,
      extensionDays,
      pricePerDay: booking.pricePerDay,
      extensionCost,
      extensionBreakdown: {
        rental: rentalCost,
        platformFee: extensionPlatformFee,
        insurance: extensionInsurance
      },
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

    // Calculate new values: rental + platform fee + insurance per extension day
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);
    const extensionRental = extensionDays * booking.pricePerDay;
    const extensionPlatformFee = extensionDays * (booking.platformFeePerDay || 1.50);
    const extensionInsurance = extensionDays * (booking.insurance?.costPerDay || 0);
    const extensionCost = extensionRental + extensionPlatformFee + extensionInsurance;

    // Update booking
    booking.endDate = newEndDate;
    booking.totalDays = booking.totalDays + extensionDays;
    booking.totalPrice = booking.totalPrice + extensionCost;
    booking.platformFee = (booking.platformFee || 0) + extensionPlatformFee;
    if (booking.insurance && booking.insurance.totalCost !== undefined) {
      booking.insurance.totalCost = (booking.insurance.totalCost || 0) + extensionInsurance;
    }

    // Extension rental goes to host, platform fee + insurance to platform
    booking.hostEarnings = (booking.hostEarnings || 0) + extensionRental;
    booking.platformRevenue = (booking.platformRevenue || 0) + extensionPlatformFee + extensionInsurance;

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

    // Update living agreement with amendment
    if (booking.agreement && booking.agreement.signed) {
      if (!booking.agreement.amendments) {
        booking.agreement.amendments = [];
      }
      const previousEndDate = new Date(newEndDate);
      previousEndDate.setDate(previousEndDate.getDate() - extensionDays);
      booking.agreement.amendments.push({
        type: 'extension',
        description: `Rental extended by ${extensionDays} day(s)`,
        previousEndDate: previousEndDate,
        newEndDate: newEndDate,
        additionalDays: extensionDays,
        additionalCost: extensionCost,
        newTotalPrice: booking.totalPrice,
        acknowledgedAt: new Date()
      });
    }

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
      .populate('host', 'firstName lastName email phone dateOfBirth driverLicense address hostInfo');

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

    // Mark vehicle as unavailable while actively rented
    await Vehicle.findByIdAndUpdate(booking.vehicle._id || booking.vehicle, { availability: false });

    // Fetch driver for TeqMobility before sending response
    const driver = await User.findById(req.user._id);

    // Initialize TeqMobility status as pending
    booking.teqMobility = {
      coverageId: null,
      ownerId: null,
      status: 'pending',
      cardUrl: null,
      startedAt: null,
      error: null
    };

    await booking.save();

    // Respond immediately - don't block on TeqMobility
    res.json({
      success: true,
      message: 'Reservation started successfully! Drive safely!',
      booking: {
        _id: booking._id,
        status: booking.status,
        pickupInspection: booking.pickupInspection,
        insuranceCoverage: null // Updated asynchronously
      }
    });

    // TeqMobility Dynamic Insurance - Start on-rent coverage (fire-and-forget)
    // Runs in background after response is sent so booking isn't delayed
    startRentalCoverage(booking.host, driver, booking.vehicle, booking)
      .then(async (coverageResult) => {
        try {
          const teqData = {
            coverageId: coverageResult.coverageId || null,
            ownerId: coverageResult.ownerId || null,
            status: coverageResult.success ? coverageResult.status : 'failed',
            cardUrl: coverageResult.cardUrl || null,
            cardImage: null,
            startedAt: coverageResult.success ? new Date() : null,
            error: coverageResult.success ? null : (coverageResult.error || coverageResult.reason)
          };

          // Capture insurance card as a screenshot image
          if (coverageResult.success && coverageResult.cardUrl) {
            const imagePath = await captureCardImage(coverageResult.cardUrl, booking._id.toString());
            if (imagePath) {
              teqData.cardImage = imagePath;
            }
          }

          await Booking.findByIdAndUpdate(booking._id, { teqMobility: teqData });
          if (coverageResult.success) {
            console.log(`🛡️ TeqMobility: Coverage activated for booking ${booking._id}`);
          }
        } catch (dbErr) {
          console.error('🛡️ TeqMobility: Failed to save coverage result:', dbErr.message);
        }
      })
      .catch((err) => {
        console.error('🛡️ TeqMobility: Background coverage error:', err.message);
      });
    return; // Prevent outer catch from trying to send response
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

    // Mark earnings as immediately eligible for next payout cycle
    booking.payoutStatus = 'eligible';
    booking.payoutEligibleDate = new Date();

    // TeqMobility Dynamic Insurance - Stop on-rent coverage (non-blocking)
    if (booking.teqMobility?.coverageId) {
      const stopResult = await stopRentalCoverage(booking.teqMobility.coverageId);
      booking.teqMobility.stoppedAt = new Date();
      if (stopResult.success) {
        booking.teqMobility.status = stopResult.status;
      } else {
        // Try stopping by VIN as fallback
        const vinStopResult = await stopRentalCoverage(booking.vehicle.vin);
        if (vinStopResult.success) {
          booking.teqMobility.status = vinStopResult.status;
        } else {
          booking.teqMobility.error = stopResult.error || 'Failed to stop coverage';
        }
      }
    } else if (booking.vehicle?.vin) {
      // No coverage ID stored, try by VIN
      const stopResult = await stopRentalCoverage(booking.vehicle.vin);
      if (stopResult.success) {
        booking.teqMobility = booking.teqMobility || {};
        booking.teqMobility.stoppedAt = new Date();
        booking.teqMobility.status = stopResult.status;
      }
    }

    await booking.save();

    // Set vehicle back to available after trip completion
    await Vehicle.findByIdAndUpdate(booking.vehicle._id, { availability: true });

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
    }).lean();

    // Batch query: find all conflicting bookings for ALL host vehicles at once
    const vehicleIds = hostVehicles.map(v => v._id);
    const conflictingBookings = await Booking.find({
      vehicle: { $in: vehicleIds },
      _id: { $ne: booking._id },
      status: { $in: ['pending', 'confirmed', 'active'] },
      $or: [
        { startDate: { $gte: booking.startDate, $lte: booking.endDate } },
        { endDate: { $gte: booking.startDate, $lte: booking.endDate } },
        { startDate: { $lte: booking.startDate }, endDate: { $gte: booking.endDate } }
      ]
    }).select('vehicle').lean();

    const conflictedVehicleIds = new Set(conflictingBookings.map(b => b.vehicle.toString()));

    const availableVehicles = hostVehicles
      .filter(vehicle => !conflictedVehicleIds.has(vehicle._id.toString()))
      .map(vehicle => {
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

        return {
          ...vehicle,
          newTotalPrice,
          priceDifference,
          currentBookingPrice: booking.totalPrice
        };
      });

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

    // Update living agreement with vehicle swap amendment
    if (booking.agreement && booking.agreement.signed) {
      if (!booking.agreement.amendments) {
        booking.agreement.amendments = [];
      }
      booking.agreement.amendments.push({
        type: 'vehicle_swap',
        description: `Vehicle swapped to ${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`,
        newTotalPrice: newTotalPrice,
        newVehicleInfo: `${newVehicle.year} ${newVehicle.make} ${newVehicle.model} (VIN: ${newVehicle.vin || 'N/A'})`,
        acknowledgedAt: new Date()
      });
    }

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

// Host cancel reservation with full refund
router.post('/:id/host-cancel', auth, async (req, res) => {
  try {
    const { reason } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email')
      .populate('host', 'firstName lastName email');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only the host can use this endpoint
    if (booking.host._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the host can cancel this reservation' });
    }

    // Can only cancel confirmed or active bookings
    if (!['confirmed', 'active', 'pending'].includes(booking.status)) {
      return res.status(400).json({ message: `Cannot cancel a booking with status "${booking.status}"` });
    }

    // Attempt Stripe refund if payment was made
    let refundResult = null;
    if (booking.paymentStatus === 'paid' && booking.paymentSessionId) {
      try {
        let paymentIntentId;

        // paymentSessionId may be a checkout session ID (cs_...) or a payment intent ID (pi_...)
        if (booking.paymentSessionId.startsWith('pi_')) {
          paymentIntentId = booking.paymentSessionId;
        } else {
          // Retrieve the checkout session to get the payment intent
          const session = await stripe.checkout.sessions.retrieve(booking.paymentSessionId);
          paymentIntentId = session.payment_intent;
        }

        if (paymentIntentId) {
          // Create a full refund
          refundResult = await stripe.refunds.create({
            payment_intent: paymentIntentId,
            reason: 'requested_by_customer'
          });
          console.log('✅ Stripe refund created:', refundResult.id, 'Amount:', refundResult.amount);
        }
      } catch (stripeError) {
        console.error('❌ Stripe refund error:', stripeError.message);
        // If refund fails, still cancel the booking but note the refund failure
        refundResult = { error: stripeError.message };
      }
    }

    // Update booking status
    booking.status = 'cancelled';
    if (booking.paymentStatus === 'paid') {
      booking.paymentStatus = 'refunded';
    }
    booking.cancellationReason = reason || 'Cancelled by host';
    booking.cancelledBy = 'host';
    booking.cancelledAt = new Date();

    // TeqMobility: Stop coverage on host cancellation
    if (booking.teqMobility?.coverageId) {
      const stopResult = await stopRentalCoverage(booking.teqMobility.coverageId);
      booking.teqMobility.stoppedAt = new Date();
      if (stopResult.success) {
        booking.teqMobility.status = stopResult.status;
      }
    }

    await booking.save();

    // Set vehicle back to available after host cancellation
    await Vehicle.findByIdAndUpdate(booking.vehicle._id, { availability: true });

    // Send cancellation email to driver
    try {
      await sendBookingCancellationEmail(booking.driver, booking.host, booking, booking.vehicle, reason);
    } catch (emailError) {
      console.error('❌ Cancellation email failed (non-blocking):', emailError);
    }

    res.json({
      success: true,
      message: 'Reservation cancelled and refund initiated',
      booking: {
        _id: booking._id,
        status: booking.status,
        paymentStatus: booking.paymentStatus
      },
      refund: refundResult ? {
        id: refundResult.id,
        amount: refundResult.amount,
        status: refundResult.status
      } : null
    });
  } catch (error) {
    console.error('Host cancellation error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Check if cancellation fee applies for a booking
router.get('/:id/cancellation-fee', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (booking.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const now = new Date();
    const pickupDate = new Date(booking.startDate);
    const pickupTime = booking.pickupTime || '10:00';
    const [hours, minutes] = pickupTime.split(':').map(Number);
    pickupDate.setHours(hours, minutes, 0, 0);

    const hoursUntilPickup = (pickupDate - now) / (1000 * 60 * 60);
    const isLateCancellation = hoursUntilPickup <= 24;
    const cancellationFee = isLateCancellation ? 5.00 : 0;

    res.json({ isLateCancellation, cancellationFee, hoursUntilPickup: Math.max(0, hoursUntilPickup) });
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

    // Late cancellation fee: $5 if driver cancels within 24 hours of pickup
    let cancellationFee = 0;
    if (status === 'cancelled' && booking.driver.toString() === req.user._id.toString()) {
      const now = new Date();
      const pickupDate = new Date(booking.startDate);
      // Set pickup time on the date
      const pickupTime = booking.pickupTime || '10:00';
      const [hours, minutes] = pickupTime.split(':').map(Number);
      pickupDate.setHours(hours, minutes, 0, 0);

      const hoursUntilPickup = (pickupDate - now) / (1000 * 60 * 60);

      if (hoursUntilPickup <= 24) {
        cancellationFee = 5.00;
        booking.cancellationFee = cancellationFee;
        // Add fee to platform revenue
        booking.platformRevenue = (booking.platformRevenue || 0) + cancellationFee;
      }

      booking.cancelledBy = 'driver';
      booking.cancelledAt = new Date();
      booking.cancellationReason = hoursUntilPickup <= 24
        ? 'Cancelled by driver (late cancellation - within 24 hours of pickup)'
        : 'Cancelled by driver';
    }

    booking.status = status;

    // Mark vehicle as unavailable when booking is confirmed or active
    if (['confirmed', 'active'].includes(status)) {
      await Vehicle.findByIdAndUpdate(booking.vehicle, { availability: false });
    }

    // TeqMobility: Stop coverage when booking is completed or cancelled
    if (['completed', 'cancelled'].includes(status) && booking.teqMobility?.coverageId) {
      const stopResult = await stopRentalCoverage(booking.teqMobility.coverageId);
      booking.teqMobility.stoppedAt = new Date();
      if (stopResult.success) {
        booking.teqMobility.status = stopResult.status;
      }
    }

    await booking.save();

    // Set vehicle back to available when booking is completed or cancelled
    if (['completed', 'cancelled'].includes(status)) {
      await Vehicle.findByIdAndUpdate(booking.vehicle, { availability: true });
    }

    res.json({ ...booking.toObject(), cancellationFee });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
