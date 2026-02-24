const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const { isConfigured, getTollCharges, listVehicles } = require('../utils/tollspot');

const router = express.Router();

// GET /api/tolls/charges/:bookingId - Get toll charges for a specific booking
router.get('/charges/:bookingId', auth, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ message: 'Toll management is not configured' });
    }

    const booking = await Booking.findById(req.params.bookingId)
      .populate('vehicle', 'licensePlate location');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only allow driver or host to view toll charges
    if (booking.driver.toString() !== req.user._id.toString() &&
        booking.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    const vehicle = booking.vehicle;
    if (!vehicle?.licensePlate) {
      return res.json({ total: 0, data: [] });
    }

    // Query toll charges filtered by license plate and booking date range
    const result = await getTollCharges({
      license_plate: vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, ''),
      from_date: new Date(booking.startDate).toISOString(),
      to_date: new Date(booking.endDate).toISOString(),
      page: parseInt(req.query.page) || 0,
      limit: parseInt(req.query.limit) || 100
    });

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch toll charges', error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('🛣️ TollSpot: Error fetching booking toll charges:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/tolls/host-charges - Get all toll charges for a host's vehicles
router.get('/host-charges', auth, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ message: 'Toll management is not configured' });
    }

    const result = await getTollCharges({
      host_id: req.user._id.toString(),
      from_date: req.query.from_date,
      to_date: req.query.to_date,
      page: parseInt(req.query.page) || 0,
      limit: parseInt(req.query.limit) || 50
    });

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch toll charges', error: result.error });
    }

    res.json(result.data);
  } catch (error) {
    console.error('🛣️ TollSpot: Error fetching host toll charges:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/tolls/vehicles - Get TollSpot registered vehicles for this host
router.get('/vehicles', auth, async (req, res) => {
  try {
    if (!isConfigured()) {
      return res.status(503).json({ message: 'Toll management is not configured' });
    }

    const result = await listVehicles(
      parseInt(req.query.page) || 0,
      parseInt(req.query.limit) || 100
    );

    if (!result.success) {
      return res.status(502).json({ message: 'Failed to fetch registered vehicles', error: result.error });
    }

    // Filter to only this host's vehicles by matching partner_vehicle_id
    const hostVehicles = await Vehicle.find({ host: req.user._id }).select('_id').lean();
    const hostVehicleIds = new Set(hostVehicles.map(v => v._id.toString()));

    const filtered = (result.data.data || []).filter(v =>
      hostVehicleIds.has(v.partner_vehicle_id)
    );

    res.json({ total: filtered.length, data: filtered });
  } catch (error) {
    console.error('🛣️ TollSpot: Error fetching registered vehicles:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/tolls/status - Check if TollSpot is configured
router.get('/status', auth, (req, res) => {
  res.json({ configured: isConfigured() });
});

module.exports = router;
