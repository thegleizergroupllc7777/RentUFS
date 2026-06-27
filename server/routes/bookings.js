const express = require('express');
const path = require('path');
const Booking = require('../models/Booking');
const { Counter } = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendBookingExtensionEmail, sendBookingCancellationEmail } = require('../utils/emailService');
const { sendExtensionReminderSMS, sendBookingConfirmedSMS, sendBookingActiveSMS, sendBookingCompletedSMS, sendBookingCancelledSMS, sendDriverCancelledNotificationSMS } = require('../utils/smsService');
const { startRentalCoverage, stopRentalCoverage, fetchCoverageCardUrl } = require('../utils/teqmobility');
const { isHostInsuranceReady } = require('../utils/hostReadiness');
const { captureCardImage } = require('../utils/screenshotCard');
const { isConfigured: tollspotConfigured, monitorCharges } = require('../utils/tollspot');
const { getOutstandingTolls, chargeDriverForTolls, transferTollsToHost, recordTollSettlement } = require('../utils/tollSettlement');

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const { calculateProcessingFee } = require('../utils/stripeFee');

const router = express.Router();

// Auto-cancel stale awaiting_payment bookings (older than 1 hour)
const cleanupStaleBookings = async () => {
  try {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const result = await Booking.updateMany(
      { status: 'awaiting_payment', createdAt: { $lt: oneHourAgo } },
      { status: 'cancelled', paymentStatus: 'expired', cancellationReason: 'Payment not completed within 1 hour', cancelledAt: new Date() }
    );
    if (result.modifiedCount > 0) {
      console.log(`🧹 Auto-cancelled ${result.modifiedCount} stale awaiting_payment booking(s)`);
    }
  } catch (err) {
    console.error('Error cleaning up stale bookings:', err);
  }
};

// Auto-expire confirmed/active bookings whose rental period has fully passed
const expireStaleBookings = async () => {
  try {
    // Use midnight today as cutoff — any booking that ended before today is expired
    const cutoff = new Date();
    cutoff.setHours(0, 0, 0, 0);

    // Confirmed bookings past end date — rental window expired without pickup
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

    // Note: Active bookings are NOT auto-completed. They must be completed by
    // the driver (return inspection), the host (complete reservation), or support.
    // The overdue SMS/email reminders will nudge the driver to return the vehicle.

    if (staleConfirmed.length > 0) {
      console.log(`🧹 Auto-expired ${staleConfirmed.length} stale confirmed booking(s)`);
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
    const { vehicleId, startDate, endDate, pickupTime, dropoffTime, rentalType, quantity, message, pickupDateTimeISO } = req.body;

    // Only drivers or 'both' users can create bookings.
    const bookingUser = await User.findById(req.user._id).select('userType hostInfo.accountType');
    if (bookingUser && bookingUser.userType === 'host') {
      return res.status(403).json({ message: 'Host accounts cannot rent vehicles. Please contact support to enable renting on your account.' });
    }
    // Business accounts cannot rent: a driver must be insured under a real
    // person's legal name, but a business account's identity is the business
    // name (which would print incorrectly on the insurance card). They must
    // rent under a personal account instead. Reversible — only blocks while
    // the account type is 'business'.
    if (bookingUser && bookingUser.hostInfo?.accountType === 'business') {
      return res.status(403).json({ message: 'Business accounts cannot rent vehicles. A driver must book under their personal legal name — please use a personal account or contact support.' });
    }

    // Verify driver has a valid license on file
    const driver = await User.findById(req.user._id);
    if (!driver.driverLicense?.licenseNumber || !driver.driverLicense?.expirationDate) {
      return res.status(400).json({ message: 'A valid driver\'s license is required to book a vehicle. Please add your license information in your profile.' });
    }
    if (new Date(driver.driverLicense.expirationDate) < new Date()) {
      return res.status(400).json({ message: 'Your driver\'s license is expired. Please update your license information in your profile.' });
    }

    // Verify driver has a date of birth and is at least 21
    if (!driver.dateOfBirth) {
      return res.status(400).json({ message: 'Your date of birth is required to book a vehicle. Please add it in your profile.' });
    }
    const dob = new Date(driver.dateOfBirth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age--;
    }
    if (age < 21) {
      return res.status(400).json({ message: 'You must be at least 21 years old to book a vehicle.' });
    }

    // Verify driver has a complete home address (required for rental agreement
    // and for insurance coverage — Teq Mobility rejects coverage without it)
    if (!driver.address?.street || !driver.address?.city || !driver.address?.state || !driver.address?.zipCode) {
      return res.status(400).json({ message: 'A complete home address is required to book a vehicle. Please add your street, city, state, and zip code in your profile.' });
    }

    // Block new bookings if the driver has unpaid post-trip charges that
    // exhausted their automatic retry attempts.
    const { getDriverLockoutStatus } = require('../utils/chargeSettlement');
    const lockoutStatus = await getDriverLockoutStatus(req.user._id);
    if (lockoutStatus.locked) {
      return res.status(402).json({
        message: `You have an outstanding balance of $${lockoutStatus.totalOwed.toFixed(2)} from a previous reservation. Please settle this charge from My Bookings before booking another vehicle.`,
        code: 'OUTSTANDING_CHARGE',
        totalOwed: lockoutStatus.totalOwed
      });
    }

    // Validate required date fields
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Please select a pick-up date' });
    }

    // Accept either a Mongo _id OR a SEO slug — vehicle links/pages use the slug
    // (e.g. "2025-nissan-versa-..."), so resolve it the same way the vehicle page
    // does. Using findById directly on a slug throws a CastError -> "Server error".
    const isVehicleObjectId = /^[0-9a-fA-F]{24}$/.test(String(vehicleId || ''));
    const vehicle = await Vehicle.findOne(isVehicleObjectId ? { _id: vehicleId } : { slug: vehicleId });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Defense in depth: the vehicle's host must be insurance-ready (complete
    // name + address). Incomplete hosts are already hidden from the
    // marketplace, but block here too so a stale link can't create a booking
    // that would fail insurance at pickup.
    const vehicleHost = await User.findById(vehicle.host)
      .select('firstName lastName address hostInfo');
    if (!isHostInsuranceReady(vehicleHost)) {
      return res.status(400).json({ message: 'This vehicle is not currently available for booking. The host needs to complete their profile.' });
    }

    const start = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');

    // Validate dates are valid
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    // Reject bookings with a pick-up date+time in the past. Prefer the
    // timezone-aware ISO timestamp sent by the client so the check works
    // regardless of the server's timezone (Render runs in UTC).
    let pickupDateTime;
    if (pickupDateTimeISO) {
      pickupDateTime = new Date(pickupDateTimeISO);
      if (isNaN(pickupDateTime.getTime())) {
        return res.status(400).json({ message: 'Invalid pick-up date/time' });
      }
    } else {
      const [pickupHour, pickupMin] = (pickupTime || '10:00').split(':').map(Number);
      pickupDateTime = new Date(start);
      pickupDateTime.setHours(pickupHour || 0, pickupMin || 0, 0, 0);
    }
    if (pickupDateTime <= now) {
      return res.status(400).json({ message: 'Pick-up time has already passed. Please select a later time or a future date.' });
    }

    const totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));

    if (totalDays < 1) {
      return res.status(400).json({ message: 'Invalid date range' });
    }

    // Cancel any of this driver's awaiting_payment bookings that overlap with the requested dates.
    // These are ghost bookings from abandoned payment flows that the driver can't see in MyBookings.
    // If the driver is starting a new booking, any prior awaiting_payment one is abandoned.
    await Booking.updateMany(
      {
        driver: req.user._id,
        status: 'awaiting_payment',
        startDate: { $lt: end },
        endDate: { $gt: start }
      },
      { status: 'cancelled', paymentStatus: 'expired', cancellationReason: 'Superseded by new booking request', cancelledAt: new Date() }
    );

    // Check if driver already has an overlapping booking (security: prevent unauthorized multi-bookings)
    const overlappingBooking = await Booking.findOne({
      driver: req.user._id,
      _id: { $ne: null },
      status: { $in: ['awaiting_payment', 'pending', 'confirmed', 'active'] },
      startDate: { $lt: end },
      endDate: { $gt: start }
    });

    if (overlappingBooking) {
      return res.status(400).json({
        message: 'You already have a reservation during these dates. Each driver can only have one active reservation per date range.'
      });
    }

    // Vehicle-level conflict guard (the lock that prevents double-booking).
    // Refuse if THIS vehicle is already reserved for overlapping dates by ANY
    // driver. Previously a double-booking was only prevented by hiding rented
    // cars from the marketplace; this guard enforces it at the source, so the
    // car can safely stay visible with a "Rented" badge. Read-only: it only
    // reads existing bookings to decide whether to block this new one — it never
    // touches them. Statuses match the marketplace's availability filter
    // (awaiting_payment carts are excluded so abandoned checkouts can't block).
    const vehicleConflict = await Booking.findOne({
      vehicle: vehicle._id,
      status: { $in: ['pending', 'confirmed', 'active'] },
      startDate: { $lt: end },
      endDate: { $gt: start }
    });

    if (vehicleConflict) {
      return res.status(400).json({
        message: 'Sorry, this vehicle is already booked for the dates you selected. Please choose different dates.'
      });
    }

    // Calculate total price based on rental type
    let totalPrice;
    let pricePerDay = vehicle.pricePerDay;
    let pricePerUnit; // Rate per unit (day/week/month) for display

    if (rentalType === 'weekly') {
      const weeklyRate = vehicle.pricePerWeek || (vehicle.pricePerDay * 7);
      pricePerUnit = weeklyRate;
      totalPrice = quantity * weeklyRate;
    } else if (rentalType === 'monthly') {
      const monthlyRate = vehicle.pricePerMonth || (vehicle.pricePerDay * 30);
      pricePerUnit = monthlyRate;
      totalPrice = quantity * monthlyRate;
    } else {
      pricePerUnit = vehicle.pricePerDay;
      totalPrice = totalDays * vehicle.pricePerDay;
    }

    // Drop-off time always matches pickup time (24-hour rental periods)
    const resolvedPickupTime = pickupTime || '10:00';
    const resolvedDropoffTime = resolvedPickupTime;

    // Platform transaction fee: $1.50 per day (charged to driver)
    const platformFeePerDay = 1.50;
    const platformFee = platformFeePerDay * totalDays;
    const rentalSubtotal = totalPrice; // Rental amount before fees
    totalPrice = totalPrice + platformFee;

    // Host platform fee: $1.50 per day (deducted from host earnings, goes to RentUFS)
    const hostPlatformFeePerDay = 1.50;
    const hostPlatformFee = hostPlatformFeePerDay * totalDays;

    // Stripe processing fee split 50/50 between driver and host
    // baseTotal = rental + driver platform fee (insurance starts at $0, added during checkout)
    const { stripeFee, driverProcessingFee, hostProcessingFee } = calculateProcessingFee(totalPrice);
    totalPrice = totalPrice + driverProcessingFee;

    // Revenue split: host gets rental subtotal minus host fee minus their half of Stripe fee
    const hostEarnings = rentalSubtotal - hostPlatformFee - hostProcessingFee;
    const platformRevenue = platformFee + hostPlatformFee;

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
      pricePerUnit, // Rate per unit (day/week/month) for display
      rentalSubtotal, // Rental amount before fees
      totalPrice,
      platformFeePerDay,
      platformFee,
      hostPlatformFeePerDay,
      hostPlatformFee,
      stripeFee,
      driverProcessingFee,
      hostProcessingFee,
      hostEarnings,
      platformRevenue,
      status: 'awaiting_payment',
      message
    });

    await booking.save();
    await booking.populate(['vehicle', 'driver', 'host']);

    res.status(201).json(booking);
  } catch (error) {
    // Log full detail to Render so an intermittent "Server error" on booking
    // creation can actually be diagnosed (who, which vehicle, and the stack).
    console.error('❌ Booking creation error:', {
      message: error.message,
      driverId: req.user?._id?.toString(),
      vehicleId: req.body?.vehicleId,
      stack: error.stack
    });
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Public: a vehicle's already-booked date ranges, so the booking calendar can
// gray them out (Turo/Airbnb style). Read-only — only reads existing bookings.
// Accepts a Mongo _id or a SEO slug. Statuses match the double-booking guard.
router.get('/vehicle/:vehicleId/booked-dates', async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const isObjectId = /^[0-9a-fA-F]{24}$/.test(String(vehicleId || ''));
    const vehicle = await Vehicle.findOne(isObjectId ? { _id: vehicleId } : { slug: vehicleId }).select('_id');
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    const bookings = await Booking.find({
      vehicle: vehicle._id,
      status: { $in: ['pending', 'confirmed', 'active'] }
    }).select('startDate endDate').lean();

    // Trip dates are stored at midnight UTC of the chosen day, so the UTC date
    // part (slice 0-10) is the intended calendar day.
    const ranges = bookings
      .filter((b) => b.startDate && b.endDate)
      .map((b) => ({
        start: new Date(b.startDate).toISOString().slice(0, 10),
        end: new Date(b.endDate).toISOString().slice(0, 10)
      }));

    res.json({ ranges });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user's bookings (as driver)
router.get('/my-bookings', auth, async (req, res) => {
  try {
    const bookings = await Booking.find({ driver: req.user._id })
      .select('-agreement.signatureImage -agreement.driverAddressAtSigning -pickupInspection.photos -returnInspection.photos -vehicleSwitchHistory -hostPlatformFeePerDay -hostPlatformFee -hostProcessingFee -hostEarnings -platformRevenue')
      .populate('vehicle', 'nickname make model year images registrationImage pricePerDay pricePerWeek pricePerMonth')
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
    const bookings = await Booking.find({
      host: req.user._id,
      status: { $ne: 'awaiting_payment' },
      // Hide "ghost" reservations from the host — abandoned checkouts that were
      // cancelled without ever being paid (driver started a booking but never
      // completed payment). The host was never affected by these, so showing
      // them just causes confusion and needless "is something broken?" support
      // requests. A cancelled booking is shown only if it was actually paid at
      // some point (a real reservation later cancelled/refunded).
      $nor: [{ status: 'cancelled', paymentStatus: { $nin: ['paid', 'refunded', 'partial_refund'] } }]
    })
      .select('-agreement.signatureImage -agreement.driverAddressAtSigning -pickupInspection.photos -returnInspection.photos')
      .populate('vehicle', 'nickname make model year images registrationImage pricePerDay vin')
      .populate('driver', 'firstName lastName email phone profileImage')
      .sort({ createdAt: -1 })
      .lean();

    // Strip driver commission from host view
    const adjustedBookings = bookings.map(b => {
      b.totalPrice = (b.totalPrice || 0) - (b.platformFee || 0) - (b.driverProcessingFee || 0);
      delete b.platformFee;
      delete b.platformFeePerDay;
      delete b.driverProcessingFee;
      delete b.stripeFee;
      delete b.platformRevenue;
      return b;
    });

    res.json(adjustedBookings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get single booking by ID
router.get('/:id', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone profileImage')
      .populate('host', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only allow driver or host to view the booking
    if (booking.driver._id.toString() !== req.user._id.toString() &&
        booking.host._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Strip host-only financial fields when driver is viewing
    if (booking.driver._id.toString() === req.user._id.toString()) {
      const bookingObj = booking.toObject();
      delete bookingObj.hostPlatformFeePerDay;
      delete bookingObj.hostPlatformFee;
      delete bookingObj.hostProcessingFee;
      delete bookingObj.hostEarnings;
      delete bookingObj.platformRevenue;
      return res.json(bookingObj);
    }

    // Strip driver commission fields when host is viewing
    if (booking.host._id.toString() === req.user._id.toString()) {
      const bookingObj = booking.toObject();
      // Adjust totalPrice to exclude driver commission + driver processing fee (show rental + insurance only)
      bookingObj.totalPrice = (bookingObj.totalPrice || 0) - (bookingObj.platformFee || 0) - (bookingObj.driverProcessingFee || 0);

      // Recalculate host earnings using per-segment logic (same as payouts)
      const { getBookingSegments } = require('../utils/earningSegments');
      const segments = getBookingSegments(booking);
      bookingObj.hostEarnings = parseFloat(segments.reduce((sum, seg) => sum + seg.earnings, 0).toFixed(2));
      bookingObj.hostPlatformFee = parseFloat(segments.reduce((sum, seg) => sum + seg.hostFee, 0).toFixed(2));
      bookingObj.hostProcessingFee = parseFloat(segments.reduce((sum, seg) => sum + seg.hostProcessingFee, 0).toFixed(2));

      delete bookingObj.platformFee;
      delete bookingObj.platformFeePerDay;
      delete bookingObj.driverProcessingFee;
      delete bookingObj.stripeFee;
      delete bookingObj.platformRevenue;
      return res.json(bookingObj);
    }

    res.json(booking);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Serve insurance card content — returns HTML suitable for srcdoc or raw file for download
router.get('/:id/insurance-card', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only allow driver, host, or an admin to view
    if (booking.driver.toString() !== req.user._id.toString() &&
        booking.host.toString() !== req.user._id.toString() &&
        req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const isRaw = req.query.format === 'raw';

    // If a local file exists, verify on disk then serve
    if (booking.teqMobility?.cardImage) {
      const fs = require('fs');
      const imagePath = path.join(__dirname, '..', 'uploads', booking.teqMobility.cardImage);
      if (fs.existsSync(imagePath)) {
        const fileData = fs.readFileSync(imagePath);

        // Detect real type from magic bytes — file extension may be wrong (e.g. PDF saved as .png)
        const filePdf = fileData.slice(0, 5).toString('ascii') === '%PDF-';
        const filePng = fileData[0] === 0x89 && fileData[1] === 0x50 && fileData[2] === 0x4E && fileData[3] === 0x47;
        const fileJpeg = fileData[0] === 0xFF && fileData[1] === 0xD8;
        const fileGif = fileData[0] === 0x47 && fileData[1] === 0x49 && fileData[2] === 0x46;
        const fileMime = filePdf ? 'application/pdf' : filePng ? 'image/png' : fileJpeg ? 'image/jpeg' : fileGif ? 'image/gif' : 'application/octet-stream';

        // Raw mode: serve the actual file directly (for download / open in new tab)
        if (isRaw) {
          res.set('Content-Type', fileMime);
          res.set('Content-Disposition', filePdf ? 'inline; filename="insurance-card.pdf"' : 'inline');
          return res.send(fileData);
        }

        // HTML mode: wrap in self-contained HTML for srcdoc display
        if (filePdf) {
          const pdfBase64 = fileData.toString('base64');
          const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Insurance Card</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#f3f4f6}embed{width:100%;height:100%;border:none}.fallback{padding:2rem;text-align:center;font-family:system-ui,sans-serif}.fallback a{display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#0ea5e9;color:white;border-radius:0.5rem;text-decoration:none}</style>
</head><body>
<embed src="data:application/pdf;base64,${pdfBase64}" type="application/pdf" width="100%" height="100%">
<noembed><div class="fallback"><p>Your browser cannot display this PDF inline.</p><a href="data:application/pdf;base64,${pdfBase64}" download="insurance-card.pdf">Download Insurance Card PDF</a></div></noembed>
</body></html>`;
          res.set('Content-Type', 'text/html');
          return res.send(html);
        }
        const imgBase64 = fileData.toString('base64');
        const imgHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Insurance Card</title>
<style>*{margin:0;padding:0}body{background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;height:auto}</style>
</head><body><img src="data:${fileMime};base64,${imgBase64}" alt="Insurance Card"></body></html>`;
        res.set('Content-Type', 'text/html');
        return res.send(imgHtml);
      }
      // File was lost (e.g. ephemeral filesystem redeploy) — clear stale reference and fall through
      console.log(`🛡️ Insurance card file missing on disk: ${imagePath}, falling through to cardUrl proxy`);
      await Booking.findByIdAndUpdate(booking._id, { 'teqMobility.cardImage': null });
    }

    // Proxy the external card URL
    const cardUrl = booking.teqMobility?.cardUrl;
    if (!cardUrl) {
      return res.status(404).json({ message: 'Insurance card not available' });
    }

    const axios = require('axios');
    let response;
    try {
      response = await axios.get(cardUrl, {
        responseType: 'arraybuffer',
        timeout: 10000,
        headers: { 'Accept': 'text/html,application/xhtml+xml,application/pdf,image/*,*/*' }
      });
    } catch (proxyErr) {
      console.error(`🛡️ Insurance card proxy failed for URL ${cardUrl}:`, proxyErr.message);
      // Clear the stale cardUrl so retry will fetch a fresh one
      await Booking.findByIdAndUpdate(booking._id, { 'teqMobility.cardUrl': null, 'teqMobility.cardImage': null });
      return res.status(404).json({ message: 'Insurance card URL is no longer valid. Please retry.' });
    }

    const headerContentType = response.headers['content-type'] || '';
    const buf = Buffer.from(response.data);

    // Validate the response contains actual data
    if (buf.length < 100) {
      console.error(`🛡️ Insurance card response too small (${buf.length} bytes), likely invalid`);
      await Booking.findByIdAndUpdate(booking._id, { 'teqMobility.cardUrl': null, 'teqMobility.cardImage': null });
      return res.status(404).json({ message: 'Insurance card data is invalid. Please retry.' });
    }

    // Detect REAL content type from magic bytes — don't trust the header
    const isPdf = buf.slice(0, 5).toString('ascii') === '%PDF-';
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const isGif = buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46;
    const isImage = isPng || isJpeg || isGif;

    // Determine the real content type based on magic bytes, falling back to header
    let contentType;
    if (isPdf) {
      contentType = 'application/pdf';
    } else if (isPng) {
      contentType = 'image/png';
    } else if (isJpeg) {
      contentType = 'image/jpeg';
    } else if (isGif) {
      contentType = 'image/gif';
    } else if (headerContentType.includes('text/html')) {
      contentType = 'text/html';
    } else {
      // Unknown binary — check if it looks like HTML text
      const firstChars = buf.slice(0, 100).toString('utf-8').trim().toLowerCase();
      if (firstChars.startsWith('<!doctype') || firstChars.startsWith('<html')) {
        contentType = 'text/html';
      } else {
        console.error(`🛡️ Insurance card: unrecognized format (header: ${headerContentType}, first bytes: ${buf.slice(0, 8).toString('hex')})`);
        await Booking.findByIdAndUpdate(booking._id, { 'teqMobility.cardUrl': null, 'teqMobility.cardImage': null });
        return res.status(404).json({ message: 'Insurance card format not recognized. Please retry.' });
      }
    }

    console.log(`🛡️ Insurance card: header says "${headerContentType}", detected as "${contentType}" (${buf.length} bytes)`);

    // Raw mode: pass through the actual file for download / open in new tab
    if (isRaw) {
      res.set('Content-Type', contentType);
      res.set('Content-Disposition', 'inline');
      return res.send(buf);
    }

    // HTML wrapping mode for inline display via srcdoc
    res.set('Content-Disposition', 'inline');

    if (isPdf) {
      const pdfBase64 = buf.toString('base64');
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Insurance Card</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;background:#f3f4f6}embed{width:100%;height:100%;border:none}.fallback{padding:2rem;text-align:center;font-family:system-ui,sans-serif}.fallback a{display:inline-block;margin-top:1rem;padding:0.75rem 1.5rem;background:#0ea5e9;color:white;border-radius:0.5rem;text-decoration:none}</style>
</head><body>
<embed src="data:application/pdf;base64,${pdfBase64}" type="application/pdf" width="100%" height="100%">
<noembed><div class="fallback"><p>Your browser cannot display this PDF inline.</p><a href="data:application/pdf;base64,${pdfBase64}" download="insurance-card.pdf">Download Insurance Card PDF</a></div></noembed>
</body></html>`;
      res.set('Content-Type', 'text/html');
      return res.send(html);
    }

    if (isImage) {
      const imgBase64 = buf.toString('base64');
      const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Insurance Card</title>
<style>*{margin:0;padding:0}body{background:#f3f4f6;display:flex;align-items:center;justify-content:center;min-height:100vh}img{max-width:100%;height:auto}</style>
</head><body><img src="data:${contentType};base64,${imgBase64}" alt="Insurance Card"></body></html>`;
      res.set('Content-Type', 'text/html');
      return res.send(html);
    }

    // For HTML responses, inject a <base> tag so relative resources resolve correctly
    if (contentType === 'text/html') {
      let html = buf.toString('utf-8');
      const baseUrl = new URL(cardUrl);
      const baseTag = `<base href="${baseUrl.origin}/">`;
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${baseTag}`);
      } else if (html.includes('<HEAD>')) {
        html = html.replace('<HEAD>', `<HEAD>${baseTag}`);
      } else {
        html = baseTag + html;
      }
      res.set('Content-Type', 'text/html');
      return res.send(html);
    }

    res.set('Content-Type', contentType);
    res.send(buf);
  } catch (error) {
    console.error('Insurance card proxy error:', error.message);
    res.status(502).json({ message: 'Failed to load insurance card' });
  }
});

// Retry TeqMobility insurance card fetch for an active booking
router.post('/:id/retry-insurance', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('host', 'firstName lastName email phone dateOfBirth driverLicense address hostInfo');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only allow driver or host to retry
    if (booking.driver.toString() !== req.user._id.toString() &&
        booking.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    if (booking.status !== 'active') {
      return res.status(400).json({ message: 'Insurance card is only available for active bookings' });
    }

    if (!booking.insurance?.type || booking.insurance.type === 'none') {
      return res.status(400).json({ message: 'No insurance selected for this booking' });
    }

    // If card file is already available on disk, no need to retry
    if (booking.teqMobility?.cardImage) {
      const fs = require('fs');
      const filePath = path.join(__dirname, '..', 'uploads', booking.teqMobility.cardImage);
      if (fs.existsSync(filePath)) {
        return res.json({
          success: true,
          message: 'Insurance card already available',
          teqMobility: booking.teqMobility
        });
      }
    }
    // If we have a cardUrl saved (even if cardImage is missing), try to re-download it
    if (booking.teqMobility?.cardUrl) {
      const imagePath = await captureCardImage(booking.teqMobility.cardUrl, booking._id.toString());
      if (imagePath) {
        // Verify the downloaded file is valid (not empty or too small)
        const fs = require('fs');
        const dlPath = path.join(__dirname, '..', 'uploads', imagePath);
        const stat = fs.existsSync(dlPath) ? fs.statSync(dlPath) : null;
        if (stat && stat.size > 100) {
          booking.teqMobility.cardImage = imagePath;
          await Booking.findByIdAndUpdate(booking._id, { 'teqMobility.cardImage': imagePath });
          return res.json({
            success: true,
            message: 'Insurance card retrieved successfully',
            teqMobility: booking.teqMobility
          });
        }
      }
      // cardUrl is stale/broken — clear it and fall through to re-fetch from TeqMobility
      console.log(`🛡️ Insurance card URL is stale or download failed, clearing and re-fetching from TeqMobility`);
      await Booking.findByIdAndUpdate(booking._id, { 'teqMobility.cardUrl': null, 'teqMobility.cardImage': null });
      booking.teqMobility.cardUrl = null;
      booking.teqMobility.cardImage = null;
    }

    // Fetch driver
    const driver = await User.findById(booking.driver);

    console.log(`🛡️ TeqMobility: Retrying insurance card fetch for booking ${booking._id}`);

    const coverageResult = await startRentalCoverage(booking.host, driver, booking.vehicle, booking);

    // Preserve existing data — don't overwrite cardUrl/cardImage if the new response is missing them
    const existingTeq = booking.teqMobility || {};
    const teqData = {
      coverageId: coverageResult.coverageId || existingTeq.coverageId || null,
      ownerId: coverageResult.ownerId || existingTeq.ownerId || null,
      status: coverageResult.success ? coverageResult.status : (existingTeq.status || 'failed'),
      cardUrl: coverageResult.cardUrl || existingTeq.cardUrl || null,
      cardImage: existingTeq.cardImage || null,
      startedAt: coverageResult.success ? new Date() : (existingTeq.startedAt || null),
      error: coverageResult.success ? null : (coverageResult.error || coverageResult.reason)
    };

    // Capture insurance card as a local file
    if (coverageResult.success && teqData.cardUrl && !teqData.cardImage) {
      const imagePath = await captureCardImage(teqData.cardUrl, booking._id.toString());
      if (imagePath) {
        teqData.cardImage = imagePath;
      }
    }

    await Booking.findByIdAndUpdate(booking._id, { teqMobility: teqData });

    if (coverageResult.success) {
      const hasCard = !!(teqData.cardUrl || teqData.cardImage);

      // If coverage is active but no card URL, try one more time to fetch it
      if (!hasCard && (teqData.coverageId || booking.vehicle?.vin)) {
        console.log(`🛡️ TeqMobility: Coverage active but no card URL, trying dedicated fetch...`);
        const cardUrl = await fetchCoverageCardUrl(teqData.coverageId, booking.vehicle?.vin);
        if (cardUrl) {
          teqData.cardUrl = cardUrl;
          // Try to download/capture the card
          const imagePath = await captureCardImage(cardUrl, booking._id.toString());
          if (imagePath) {
            teqData.cardImage = imagePath;
          }
          await Booking.findByIdAndUpdate(booking._id, { teqMobility: teqData });
        }
      }

      const cardAvailable = !!(teqData.cardUrl || teqData.cardImage);
      console.log(`🛡️ TeqMobility: ✅ Retry succeeded for booking ${booking._id}, card available: ${cardAvailable}`);
      res.json({
        success: cardAvailable,
        message: cardAvailable
          ? 'Insurance card retrieved successfully'
          : 'Coverage is active but insurance card is not yet available from the provider. Please try again in a few minutes.',
        teqMobility: teqData
      });
    } else {
      console.error(`🛡️ TeqMobility: ❌ Retry failed for booking ${booking._id}:`, coverageResult.error || coverageResult.reason);
      res.json({
        success: false,
        message: `Insurance provider error: ${coverageResult.error || coverageResult.reason}`,
        teqMobility: teqData
      });
    }
  } catch (error) {
    console.error('Retry insurance error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Request booking extension (creates extension request, needs payment)
router.post('/:id/extend', auth, async (req, res) => {
  try {
    const { extensionDays, rentalType } = req.body;
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
    if (!extensionDays || extensionDays < 1 || extensionDays > 31) {
      return res.status(400).json({ message: 'Extension must be between 1 and 31 days' });
    }

    // Validate rentalType if provided
    if (rentalType && !['daily', 'weekly', 'monthly'].includes(rentalType)) {
      return res.status(400).json({ message: 'Invalid rental type' });
    }
    if (rentalType === 'weekly' && extensionDays !== 7) {
      return res.status(400).json({ message: 'Weekly extension must be 7 days' });
    }
    if (rentalType === 'monthly' && (extensionDays < 28 || extensionDays > 31)) {
      return res.status(400).json({ message: 'Monthly extension must be 28-31 days' });
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

    // Calculate extension rental cost based on rentalType
    const effectiveRentalType = rentalType || 'daily';
    let rentalCost;
    if (effectiveRentalType === 'weekly' && booking.vehicle.pricePerWeek) {
      rentalCost = booking.vehicle.pricePerWeek;
    } else if (effectiveRentalType === 'monthly' && booking.vehicle.pricePerMonth) {
      rentalCost = booking.vehicle.pricePerMonth;
    } else {
      rentalCost = extensionDays * booking.pricePerDay;
    }
    const extensionPlatformFee = extensionDays * (booking.platformFeePerDay || 1.50);
    const extensionInsurance = extensionDays * (booking.insurance?.costPerDay || 0);
    const extensionBaseTotal = rentalCost + extensionPlatformFee + extensionInsurance;

    // Fetch outstanding toll charges — driver must settle before extending
    let tollInfo = { count: 0, originalAmount: 0, platformFees: 0, driverTotal: 0 };
    if (tollspotConfigured()) {
      tollInfo = await getOutstandingTolls(booking, booking.vehicle);
    }

    // Include outstanding tolls in the extension total
    const extensionPlusTolls = extensionBaseTotal + tollInfo.driverTotal;
    const extensionProcessing = calculateProcessingFee(extensionPlusTolls);
    const extensionCost = extensionPlusTolls + extensionProcessing.driverProcessingFee;

    res.json({
      bookingId: booking._id,
      currentEndDate: booking.endDate,
      newEndDate,
      extensionDays,
      rentalType: effectiveRentalType,
      pricePerDay: booking.pricePerDay,
      extensionCost,
      extensionBreakdown: {
        rental: rentalCost,
        platformFee: extensionPlatformFee,
        insurance: extensionInsurance,
        tollCharges: tollInfo.driverTotal,
        tollCount: tollInfo.count,
        processingFee: extensionProcessing.driverProcessingFee
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
    const { extensionDays, paymentIntentId, rentalType } = req.body;
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

    // Calculate extension rental cost based on rentalType (weekly/monthly use discounted rate)
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + extensionDays);
    const effectiveRentalType = rentalType || 'daily';
    let extensionRental;
    if (effectiveRentalType === 'weekly' && booking.vehicle?.pricePerWeek) {
      extensionRental = booking.vehicle.pricePerWeek;
    } else if (effectiveRentalType === 'monthly' && booking.vehicle?.pricePerMonth) {
      extensionRental = booking.vehicle.pricePerMonth;
    } else {
      extensionRental = extensionDays * booking.pricePerDay;
    }
    const extensionPlatformFee = extensionDays * (booking.platformFeePerDay || 1.50);
    const extensionInsurance = extensionDays * (booking.insurance?.costPerDay || 0);
    const extensionBaseTotal = extensionRental + extensionPlatformFee + extensionInsurance;
    const extensionProcessing = calculateProcessingFee(extensionBaseTotal);
    const extensionCost = extensionBaseTotal + extensionProcessing.driverProcessingFee;

    // Update booking
    booking.endDate = newEndDate;
    booking.totalDays = booking.totalDays + extensionDays;
    booking.totalPrice = booking.totalPrice + extensionCost;
    booking.platformFee = (booking.platformFee || 0) + extensionPlatformFee;
    booking.driverProcessingFee = (booking.driverProcessingFee || 0) + extensionProcessing.driverProcessingFee;
    booking.hostProcessingFee = (booking.hostProcessingFee || 0) + extensionProcessing.hostProcessingFee;
    booking.stripeFee = (booking.stripeFee || 0) + extensionProcessing.stripeFee;
    if (booking.insurance && booking.insurance.totalCost !== undefined) {
      booking.insurance.totalCost = (booking.insurance.totalCost || 0) + extensionInsurance;
    }

    // Host platform fee on extension: $1.50/day (deducted from host, goes to RentUFS)
    const extensionHostFee = extensionDays * (booking.hostPlatformFeePerDay || 1.50);
    booking.hostPlatformFee = (booking.hostPlatformFee || 0) + extensionHostFee;

    // Extension rental minus host fee minus host processing fee goes to host
    booking.hostEarnings = (booking.hostEarnings || 0) + extensionRental - extensionHostFee - extensionProcessing.hostProcessingFee;
    booking.platformRevenue = (booking.platformRevenue || 0) + extensionPlatformFee + extensionHostFee + extensionInsurance;

    // Track extension history
    if (!booking.extensions) {
      booking.extensions = [];
    }
    booking.extensions.push({
      days: extensionDays,
      cost: extensionCost,
      rental: extensionRental,
      rentalType: effectiveRentalType,
      hostProcessingFee: extensionProcessing.hostProcessingFee,
      platformFee: extensionPlatformFee,
      insurance: extensionInsurance,
      processingFee: extensionProcessing.driverProcessingFee,
      newEndDate: newEndDate,
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

    // Time guard: drivers may start no earlier than 30 minutes before the booked
    // pickup date + time. Prevents starting hours early (unpaid time + early
    // insurance coverage burn). Enforced server-side so the UI cannot be bypassed.
    const START_GRACE_MS = 30 * 60 * 1000; // 30 minutes
    const pickupDateTime = new Date(booking.startDate);
    const [pickupHour, pickupMinute] = (booking.pickupTime || '10:00').split(':').map(Number);
    pickupDateTime.setHours(pickupHour || 0, pickupMinute || 0, 0, 0);
    const earliestStart = new Date(pickupDateTime.getTime() - START_GRACE_MS);
    if (new Date() < earliestStart) {
      const startTimeLabel = earliestStart.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      return res.status(400).json({
        message: `Too early to start. You can begin your reservation at ${startTimeLabel} (30 minutes before your pickup time).`
      });
    }

    // Overlap guard: block starting if this vehicle is still out on another
    // active rental. Avoids two active reservations — and two insurance
    // coverages — on the same VIN at once.
    const vehicleId = booking.vehicle._id || booking.vehicle;
    const activeOnVehicle = await Booking.findOne({
      vehicle: vehicleId,
      status: 'active',
      _id: { $ne: booking._id }
    });
    if (activeOnVehicle) {
      return res.status(409).json({
        message: 'This vehicle is currently still out on another active reservation. You can start once it has been returned.'
      });
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

    // TollSpot: Start toll monitoring for this trip (fire-and-forget)
    if (tollspotConfigured()) {
      monitorCharges(booking, booking.vehicle)
        .then(async (result) => {
          if (result.success && result.data) {
            await Booking.findByIdAndUpdate(booking._id, {
              'tollspot.monitorId': result.data.id || null,
              'tollspot.monitorStarted': true,
              'tollspot.error': null
            });
            console.log(`🛣️ TollSpot: Monitoring started for booking ${booking._id}`);
          } else {
            await Booking.findByIdAndUpdate(booking._id, {
              'tollspot.error': result.error || 'Failed to start monitoring'
            });
          }
        })
        .catch(err => console.error('🛣️ TollSpot: Monitor error (non-blocking):', err.message));
    }

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
      .populate('host', 'firstName lastName email stripeConnectAccountId stripeConnectPayoutsEnabled');

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

    // TeqMobility Dynamic Insurance - Stop on-rent coverage
    if (booking.teqMobility?.coverageId || booking.vehicle?.vin) {
      const stopResult = await stopRentalCoverage({
        coverageId: booking.teqMobility?.coverageId,
        vin: booking.vehicle?.vin
      });
      booking.teqMobility = booking.teqMobility || {};
      booking.teqMobility.stoppedAt = new Date();
      if (stopResult.success) {
        booking.teqMobility.status = stopResult.status;
      } else {
        // Retry once after 2 seconds
        console.error(`🛡️ TeqMobility: ❌ Stop coverage failed for booking ${booking._id}, retrying...`, stopResult.error);
        await new Promise(r => setTimeout(r, 2000));
        const retryResult = await stopRentalCoverage({ coverageId: booking.teqMobility?.coverageId, vin: booking.vehicle?.vin });
        if (retryResult.success) {
          booking.teqMobility.status = retryResult.status;
        } else {
          console.error(`🛡️ TeqMobility: ❌ Stop coverage retry also failed for booking ${booking._id}:`, retryResult.error);
          booking.teqMobility.error = retryResult.error || 'Failed to stop coverage';
        }
      }
    }

    await booking.save();

    // Set vehicle back to available and increment trip count after trip completion
    await Vehicle.findByIdAndUpdate(booking.vehicle._id, { availability: true, $inc: { tripCount: 1 } });

    // Settle outstanding toll charges (fire-and-forget, don't block return)
    let tollSettlement = null;
    if (tollspotConfigured()) {
      const driver = await User.findById(booking.driver);
      const tollInfo = await getOutstandingTolls(booking, booking.vehicle);
      if (tollInfo.count > 0 && driver) {
        console.log(`🛣️ Return inspection: ${tollInfo.count} outstanding toll(s) totaling $${tollInfo.driverTotal} for booking ${booking._id}`);
        const chargeResult = await chargeDriverForTolls(booking, driver, tollInfo, 'return');
        if (chargeResult.success) {
          tollSettlement = { tollCount: tollInfo.count, amount: tollInfo.driverTotal };
          // Record settlement and transfer to host in background
          recordTollSettlement(Booking, booking._id, tollInfo, 'return', chargeResult.paymentIntentId, null)
            .then(() => {
              if (tollInfo.originalAmount > 0 && booking.host?.stripeConnectAccountId) {
                return transferTollsToHost(booking, booking.host, tollInfo);
              }
            })
            .catch(err => console.error('🛣️ Return toll settlement recording failed:', err.message));
        } else {
          console.error(`🛣️ Return toll charge failed for booking ${booking._id}: ${chargeResult.error}`);
          // Tolls not settled — will be picked up by post-trip scheduler
        }
      }
    }

    // Settle pending host-added charges (fire-and-forget, non-blocking).
    // Failures fall back to the retry cron / lockout flow.
    let chargeSettlement = null;
    try {
      const Charge = require('../models/Charge');
      const { settleCharge } = require('../utils/chargeSettlement');
      const pendingCharges = await Charge.find({
        booking: booking._id,
        status: { $in: ['pending', 'failed'] }
      }).select('_id amount');
      if (pendingCharges.length > 0) {
        let settledCount = 0;
        let settledAmount = 0;
        for (const c of pendingCharges) {
          const result = await settleCharge(c._id, 'return');
          if (result.success) {
            settledCount++;
            settledAmount += c.amount;
          }
        }
        if (settledCount > 0) {
          chargeSettlement = {
            chargeCount: settledCount,
            amount: parseFloat(settledAmount.toFixed(2))
          };
          console.log(`💸 Return inspection: settled ${settledCount} host charge(s) totaling $${settledAmount.toFixed(2)} for booking ${booking._id}`);
        }
      }
    } catch (err) {
      console.error(`💸 Return inspection charge settlement error for booking ${booking._id}:`, err.message);
    }

    res.json({
      success: true,
      message: `Vehicle returned successfully!${tollSettlement ? ` ${tollSettlement.tollCount} toll(s) settled ($${tollSettlement.amount.toFixed(2)}).` : ''}${chargeSettlement ? ` ${chargeSettlement.chargeCount} charge(s) settled ($${chargeSettlement.amount.toFixed(2)}).` : ''} Thank you for renting with us!`,
      booking: {
        _id: booking._id,
        status: booking.status,
        returnInspection: booking.returnInspection
      },
      tollSettlement,
      chargeSettlement
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

    // Limit to one vehicle swap per reservation
    if (booking.vehicleSwitchHistory && booking.vehicleSwitchHistory.length > 0) {
      return res.status(400).json({
        message: 'This reservation has already had a vehicle swap. Only one swap is allowed per reservation.'
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
        return {
          ...vehicle,
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
// The booking price stays the same — if the host wants to charge more, the driver should make a new reservation.
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

    // Only awaiting_payment, pending, or confirmed bookings can have vehicles switched
    if (!['awaiting_payment', 'pending', 'confirmed'].includes(booking.status)) {
      return res.status(400).json({
        message: 'Can only switch vehicles for pending or confirmed bookings'
      });
    }

    // Limit to one vehicle swap per reservation
    if (booking.vehicleSwitchHistory && booking.vehicleSwitchHistory.length > 0) {
      return res.status(400).json({
        message: 'This reservation has already had a vehicle swap. Only one swap is allowed per reservation.'
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

    // Vehicle swap keeps the original booking price — driver pays what they agreed to.
    // If the host wants to charge more, they should have the driver make a new reservation.
    const previousVehicle = booking.vehicle._id || booking.vehicle;
    const previousPrice = booking.totalPrice;

    // Record the switch in history
    if (!booking.vehicleSwitchHistory) {
      booking.vehicleSwitchHistory = [];
    }
    booking.vehicleSwitchHistory.push({
      previousVehicle,
      newVehicle: newVehicleId,
      previousPrice,
      newPrice: previousPrice,
      priceDifference: 0,
      reason: reason || 'Vehicle switched by host',
      switchedAt: new Date()
    });

    // Update booking to the new vehicle but keep the same price
    booking.vehicle = newVehicleId;

    // Update living agreement with vehicle swap amendment
    if (booking.agreement && booking.agreement.signed) {
      if (!booking.agreement.amendments) {
        booking.agreement.amendments = [];
      }
      booking.agreement.amendments.push({
        type: 'vehicle_swap',
        description: `Vehicle swapped to ${newVehicle.year} ${newVehicle.make} ${newVehicle.model}`,
        newTotalPrice: previousPrice,
        newVehicleInfo: `${newVehicle.year} ${newVehicle.make} ${newVehicle.model} (VIN: ${newVehicle.vin || 'N/A'})`,
        acknowledgedAt: new Date()
      });
    }

    await booking.save();

    // Populate the updated booking for response
    await booking.populate('vehicle');
    await booking.populate('driver', 'firstName lastName email');

    console.log(`✅ Vehicle switched for booking ${booking.reservationId}: ${newVehicle.year} ${newVehicle.make} ${newVehicle.model} (price unchanged at $${previousPrice.toFixed(2)})`);

    res.json({
      success: true,
      message: `Vehicle switched successfully to ${newVehicle.year} ${newVehicle.make} ${newVehicle.model}. Booking price remains $${previousPrice.toFixed(2)}.`,
      booking: {
        _id: booking._id,
        reservationId: booking.reservationId,
        vehicle: booking.vehicle,
        previousPrice,
        newPrice: previousPrice,
        priceDifference: 0,
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
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');

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
    if (booking.teqMobility?.coverageId || booking.vehicle?.vin) {
      const stopResult = await stopRentalCoverage({
        coverageId: booking.teqMobility?.coverageId,
        vin: booking.vehicle?.vin
      });
      booking.teqMobility = booking.teqMobility || {};
      booking.teqMobility.stoppedAt = new Date();
      if (stopResult.success) {
        booking.teqMobility.status = stopResult.status;
      }
    }

    await booking.save();

    // Withhold platform fee from host: $1.50 per booked day added to penalty balance
    const penaltyAmount = 1.50 * (booking.totalDays || 1);
    await User.findByIdAndUpdate(booking.host._id, {
      $inc: { cancellationPenaltyBalance: penaltyAmount }
    });
    console.log(`💰 Host cancellation penalty: $${penaltyAmount.toFixed(2)} added to host ${booking.host.firstName} ${booking.host.lastName}'s penalty balance`);

    // Set vehicle back to available after host cancellation
    await Vehicle.findByIdAndUpdate(booking.vehicle._id, { availability: true });

    // Send cancellation email to driver
    try {
      await sendBookingCancellationEmail(booking.driver, booking.host, booking, booking.vehicle, reason);
    } catch (emailError) {
      console.error('❌ Cancellation email failed (non-blocking):', emailError);
    }

    // Send cancellation SMS to driver
    if (booking.driver?.phone) {
      sendBookingCancelledSMS(booking.driver, booking, booking.vehicle, reason)
        .catch(err => console.error('📱 Cancellation SMS failed (non-blocking):', err.message));
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
    const booking = await Booking.findById(req.params.id).populate('vehicle');

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

      // Process Stripe refund for driver cancellation
      if (booking.paymentStatus === 'paid' && booking.paymentSessionId) {
        try {
          let paymentIntentId;
          if (booking.paymentSessionId.startsWith('pi_')) {
            paymentIntentId = booking.paymentSessionId;
          } else {
            const session = await stripe.checkout.sessions.retrieve(booking.paymentSessionId);
            paymentIntentId = session.payment_intent;
          }

          if (paymentIntentId) {
            // Retrieve payment intent to get total amount
            const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);
            const totalPaidCents = paymentIntent.amount_received;

            // Deduct cancellation fee (convert to cents) from refund
            const feeCents = Math.round(cancellationFee * 100);
            const refundAmountCents = totalPaidCents - feeCents;

            if (refundAmountCents > 0) {
              const refund = await stripe.refunds.create({
                payment_intent: paymentIntentId,
                amount: refundAmountCents,
                reason: 'requested_by_customer'
              });
              console.log(`✅ Stripe refund for driver cancellation: ${refund.id}, amount: ${refund.amount}, fee retained: ${feeCents}`);
            }
            booking.paymentStatus = cancellationFee > 0 ? 'partial_refund' : 'refunded';
          }
        } catch (stripeError) {
          console.error('❌ Stripe refund error on driver cancellation:', stripeError.message);
          // Still proceed with cancellation even if refund fails
        }
      }
    }

    booking.status = status;

    // Mark earnings as eligible for payout when booking is completed (by host or driver)
    if (status === 'completed' && booking.payoutStatus === 'pending') {
      booking.payoutStatus = 'eligible';
      booking.payoutEligibleDate = new Date();
    }

    // Mark vehicle as unavailable only when the rental is actively in progress
    if (status === 'active') {
      await Vehicle.findByIdAndUpdate(booking.vehicle, { availability: false });
    }

    // TeqMobility: Stop coverage when booking is completed or cancelled
    if (['completed', 'cancelled'].includes(status) && (booking.teqMobility?.coverageId || booking.vehicle?.vin)) {
      const stopResult = await stopRentalCoverage({
        coverageId: booking.teqMobility?.coverageId,
        vin: booking.vehicle?.vin
      });
      booking.teqMobility = booking.teqMobility || {};
      booking.teqMobility.stoppedAt = new Date();
      if (stopResult.success) {
        booking.teqMobility.status = stopResult.status;
      } else {
        // Retry once after 2 seconds
        console.error(`🛡️ TeqMobility: ❌ Stop coverage failed for booking ${booking._id}, retrying...`, stopResult.error);
        await new Promise(r => setTimeout(r, 2000));
        const retryResult = await stopRentalCoverage({ coverageId: booking.teqMobility?.coverageId, vin: booking.vehicle?.vin });
        if (retryResult.success) {
          booking.teqMobility.status = retryResult.status;
        } else {
          console.error(`🛡️ TeqMobility: ❌ Stop coverage retry also failed for booking ${booking._id}:`, retryResult.error);
          booking.teqMobility.error = retryResult.error || 'Failed to stop coverage';
        }
      }
    }

    await booking.save();

    // Set vehicle back to available when booking is completed or cancelled
    if (['completed', 'cancelled'].includes(status)) {
      const update = { availability: true };
      if (status === 'completed') {
        update.$inc = { tripCount: 1 };
      }
      await Vehicle.findByIdAndUpdate(booking.vehicle, update);
    }

    // Send SMS notifications for status changes (non-blocking)
    try {
      const populatedBooking = await Booking.findById(booking._id)
        .populate('vehicle', 'year make model')
        .populate('driver', 'firstName lastName phone')
        .populate('host', 'firstName lastName phone');

      if (populatedBooking?.driver?.phone) {
        if (status === 'confirmed') {
          sendBookingConfirmedSMS(populatedBooking.driver, populatedBooking, populatedBooking.vehicle, populatedBooking.host)
            .catch(err => console.error('📱 Failed to send booking confirmed SMS:', err.message));
        } else if (status === 'active') {
          sendBookingActiveSMS(populatedBooking.driver, populatedBooking, populatedBooking.vehicle)
            .catch(err => console.error('📱 Failed to send booking active SMS:', err.message));
        } else if (status === 'completed') {
          sendBookingCompletedSMS(populatedBooking.driver, populatedBooking, populatedBooking.vehicle)
            .catch(err => console.error('📱 Failed to send booking completed SMS:', err.message));
        } else if (status === 'cancelled') {
          // Notify the driver about cancellation
          sendBookingCancelledSMS(populatedBooking.driver, populatedBooking, populatedBooking.vehicle, booking.cancellationReason)
            .catch(err => console.error('📱 Failed to send booking cancelled SMS:', err.message));
          // If driver cancelled, also notify the host
          if (booking.cancelledBy === 'driver' && populatedBooking.host?.phone) {
            sendDriverCancelledNotificationSMS(populatedBooking.host, populatedBooking.driver, populatedBooking, populatedBooking.vehicle)
              .catch(err => console.error('📱 Failed to send driver cancelled notification SMS to host:', err.message));
          }
        }
      }
    } catch (smsErr) {
      console.error('📱 SMS notification error (non-blocking):', smsErr.message);
    }

    res.json({ ...booking.toObject(), cancellationFee });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Host sends SMS reminder to driver to extend reservation
router.post('/:id/send-extension-reminder', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only the host can send a reminder
    if (booking.host._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the host can send a reminder' });
    }

    // Only active bookings can receive reminders
    if (booking.status !== 'active') {
      return res.status(400).json({ message: 'Reminders can only be sent for active bookings' });
    }

    // Check driver has a phone number
    if (!booking.driver.phone) {
      return res.status(400).json({ message: 'Driver does not have a phone number on file' });
    }

    // Rate limit: only allow one SMS reminder per booking per 4 hours
    if (booking.smsReminderSentAt) {
      const hoursSinceLast = (Date.now() - new Date(booking.smsReminderSentAt).getTime()) / (1000 * 60 * 60);
      if (hoursSinceLast < 4) {
        const nextAvailable = Math.ceil((4 - hoursSinceLast) * 60);
        return res.status(429).json({
          message: `SMS reminder already sent. You can send another in ${nextAvailable} minutes.`
        });
      }
    }

    const result = await sendExtensionReminderSMS(
      booking.driver,
      booking,
      booking.vehicle,
      booking.host
    );

    if (result.success) {
      booking.smsReminderSentAt = new Date();
      await booking.save();

      console.log(`📱 Host ${booking.host.firstName} sent SMS reminder for booking ${booking.reservationId}`);
      res.json({
        success: true,
        message: 'Text message reminder sent to driver',
        dev: result.dev || false
      });
    } else {
      res.status(500).json({ message: 'Failed to send text message', error: result.error });
    }
  } catch (error) {
    console.error('SMS reminder error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
