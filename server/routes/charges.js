const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Charge = require('../models/Charge');

const router = express.Router();

// Charge configuration (mirrors the toll fee pattern at PLATFORM_TOLL_FEE = $0.50)
const MAX_CHARGE_AMOUNT = 150;        // hard cap host can enter
const NOTICE_PERIOD_DAYS = 3;          // days between creation and auto-charge

const VALID_CHARGE_TYPES = [
  'citation',
  'parking_ticket',
  'manual_toll',
  'late_return',
  'cleaning',
  'fuel',
  'smoking_violation',
  'other'
];

// POST /api/charges
// Host creates a new charge against a booking. Renter is auto-charged after
// the notice period unless the host waives it first.
router.post('/', auth, async (req, res) => {
  try {
    const {
      bookingId,
      chargeType,
      amount,
      description,
      proofImage,
      dateIncurred
    } = req.body;

    if (!bookingId) return res.status(400).json({ message: 'Booking ID is required' });
    if (!VALID_CHARGE_TYPES.includes(chargeType)) {
      return res.status(400).json({ message: 'Invalid charge type' });
    }
    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({ message: 'Amount must be greater than 0' });
    }
    if (numericAmount > MAX_CHARGE_AMOUNT) {
      return res.status(400).json({
        message: `Amount cannot exceed $${MAX_CHARGE_AMOUNT}. Contact support for larger charges.`
      });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ message: 'Description is required' });
    }
    if (!proofImage || !proofImage.trim()) {
      return res.status(400).json({ message: 'Proof image is required' });
    }
    if (!dateIncurred) {
      return res.status(400).json({ message: 'Date incurred is required' });
    }

    const booking = await Booking.findById(bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    if (String(booking.host) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the host can add charges to this booking' });
    }

    const scheduledChargeAt = new Date(Date.now() + NOTICE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const charge = new Charge({
      booking: booking._id,
      vehicle: booking.vehicle,
      host: booking.host,
      driver: booking.driver,
      chargeType,
      amount: numericAmount,
      description: description.trim(),
      proofImage: proofImage.trim(),
      dateIncurred: new Date(dateIncurred),
      scheduledChargeAt,
      status: 'pending'
    });

    await charge.save();

    console.log(`💸 Charge created: ${charge._id} ($${numericAmount} ${chargeType}) on booking ${booking.reservationId || booking._id}`);

    res.status(201).json({ charge });
  } catch (error) {
    console.error('❌ Failed to create charge:', error);
    res.status(500).json({ message: 'Failed to create charge', error: error.message });
  }
});

// GET /api/charges/booking/:bookingId
// List all charges for a booking. Visible to host or driver of the booking.
router.get('/booking/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const userId = String(req.user._id);
    if (String(booking.host) !== userId && String(booking.driver) !== userId) {
      return res.status(403).json({ message: 'Not authorized to view charges for this booking' });
    }

    const charges = await Charge.find({ booking: booking._id }).sort({ createdAt: -1 });
    res.json({ charges });
  } catch (error) {
    console.error('❌ Failed to fetch charges:', error);
    res.status(500).json({ message: 'Failed to fetch charges', error: error.message });
  }
});

// GET /api/charges/host
// List all charges created by the authenticated host across all their bookings.
router.get('/host', auth, async (req, res) => {
  try {
    const charges = await Charge.find({ host: req.user._id })
      .populate('booking', 'reservationId startDate endDate')
      .populate('vehicle', 'make model year')
      .populate('driver', 'firstName lastName email')
      .sort({ createdAt: -1 });
    res.json({ charges });
  } catch (error) {
    console.error('❌ Failed to fetch host charges:', error);
    res.status(500).json({ message: 'Failed to fetch charges', error: error.message });
  }
});

// GET /api/charges/driver
// List all charges against the authenticated driver. Used on My Bookings to
// show pending/charged status and outstanding balance for the lockout banner.
router.get('/driver', auth, async (req, res) => {
  try {
    const charges = await Charge.find({ driver: req.user._id })
      .populate('booking', 'reservationId startDate endDate')
      .populate('vehicle', 'make model year')
      .populate('host', 'firstName lastName')
      .sort({ createdAt: -1 });
    res.json({ charges });
  } catch (error) {
    console.error('❌ Failed to fetch driver charges:', error);
    res.status(500).json({ message: 'Failed to fetch charges', error: error.message });
  }
});

// POST /api/charges/:id/waive
// Host cancels a pending charge before it's been billed. Once status is
// 'charged' it can't be waived (refund must go through Stripe / support).
router.post('/:id/waive', auth, async (req, res) => {
  try {
    const charge = await Charge.findById(req.params.id);
    if (!charge) return res.status(404).json({ message: 'Charge not found' });

    if (String(charge.host) !== String(req.user._id)) {
      return res.status(403).json({ message: 'Only the host can waive this charge' });
    }
    if (charge.status !== 'pending' && charge.status !== 'failed') {
      return res.status(400).json({
        message: `Charge cannot be waived (status: ${charge.status}). Already settled charges require a refund through support.`
      });
    }

    charge.status = 'waived';
    charge.waivedAt = new Date();
    await charge.save();

    console.log(`✋ Charge waived: ${charge._id} by host ${req.user._id}`);
    res.json({ charge });
  } catch (error) {
    console.error('❌ Failed to waive charge:', error);
    res.status(500).json({ message: 'Failed to waive charge', error: error.message });
  }
});

// GET /api/charges/types
// Returns the allowed charge types and the cap so the frontend stays in sync.
router.get('/types', (req, res) => {
  res.json({
    types: VALID_CHARGE_TYPES,
    maxAmount: MAX_CHARGE_AMOUNT,
    noticeDays: NOTICE_PERIOD_DAYS
  });
});

module.exports = router;
