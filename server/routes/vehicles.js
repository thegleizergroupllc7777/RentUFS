const express = require('express');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const { sendVehicleListedEmail } = require('../utils/emailService');

const router = express.Router();

// Get all vehicles (with filters)
router.get('/', async (req, res) => {
  try {
    const { location, startDate, endDate } = req.query;
    let query = { availability: true };

    // Handle location search (city or zip code)
    if (location) {
      // Check if it looks like a zip code (5 digits)
      if (/^\d{5}$/.test(location.trim())) {
        query['location.zipCode'] = location.trim();
      } else {
        // Search by city name (case insensitive)
        query['location.city'] = new RegExp(location, 'i');
      }
    }

    let vehicles = await Vehicle.find(query)
      .populate('host', 'firstName lastName rating reviewCount')
      .sort({ createdAt: -1 });

    // Filter by date availability if dates are provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Find all bookings that overlap with the requested dates
      const overlappingBookings = await Booking.find({
        status: { $in: ['confirmed', 'pending'] },
        $or: [
          // Booking starts during requested period
          { startDate: { $gte: start, $lte: end } },
          // Booking ends during requested period
          { endDate: { $gte: start, $lte: end } },
          // Booking spans the entire requested period
          { startDate: { $lte: start }, endDate: { $gte: end } }
        ]
      }).select('vehicle');

      // Get IDs of unavailable vehicles
      const unavailableVehicleIds = overlappingBookings.map(b => b.vehicle.toString());

      // Filter out unavailable vehicles
      vehicles = vehicles.filter(v => !unavailableVehicleIds.includes(v._id.toString()));
    }

    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get host's vehicles (MUST be before /:id route to avoid matching "host" as an id)
router.get('/host/my-vehicles', auth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ host: req.user._id })
      .sort({ createdAt: -1 });

    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get vehicle by ID
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('host', 'firstName lastName email phone rating reviewCount');

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create vehicle (host only)
router.post('/', auth, async (req, res) => {
  try {
    const vehicle = new Vehicle({
      ...req.body,
      host: req.user._id
    });

    await vehicle.save();

    // Send vehicle listing confirmation email (async, don't wait for it)
    sendVehicleListedEmail(
      {
        email: req.user.email,
        firstName: req.user.firstName
      },
      {
        year: vehicle.year,
        make: vehicle.make,
        model: vehicle.model,
        type: vehicle.type,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        pricePerDay: vehicle.pricePerDay,
        location: vehicle.location
      }
    ).catch(err => console.error('Failed to send vehicle listing email:', err));

    res.status(201).json(vehicle);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update vehicle
router.put('/:id', auth, async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, host: req.user._id });

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    Object.assign(vehicle, req.body);
    await vehicle.save();

    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete vehicle
router.delete('/:id', auth, async (req, res) => {
  try {
    const vehicle = await Vehicle.findOneAndDelete({ _id: req.params.id, host: req.user._id });

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    res.json({ message: 'Vehicle deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
