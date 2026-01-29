const express = require('express');
const axios = require('axios');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const { sendVehicleListedEmail } = require('../utils/emailService');
const { geocodeAddress, buildAddressString } = require('../utils/geocoding');

const router = express.Router();

// Decode VIN using NHTSA vPIC API (free, no key required)
router.get('/decode-vin/:vin', async (req, res) => {
  try {
    const { vin } = req.params;
    if (!vin || vin.length !== 17) {
      return res.status(400).json({ message: 'VIN must be exactly 17 characters' });
    }

    const response = await axios.get(
      `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vin}?format=json`
    );

    const results = response.data.Results;
    const getValue = (variableId) => {
      const item = results.find(r => r.VariableId === variableId);
      return item?.Value && item.Value.trim() !== '' ? item.Value.trim() : null;
    };

    // Check for decode errors
    const errorCode = getValue(143); // Error Code
    if (errorCode && !errorCode.includes('0')) {
      const errorText = getValue(144); // Error Text
      console.log('⚠️ VIN decode warnings:', errorText);
    }

    const make = getValue(26);       // Make
    const model = getValue(28);      // Model
    const year = getValue(29);       // Model Year
    const bodyClass = getValue(5);   // Body Class
    const doors = getValue(14);      // Number of Doors
    const transmission = getValue(37); // Transmission Style
    const driveType = getValue(15);  // Drive Type
    const fuelType = getValue(24);   // Fuel Type - Primary
    const engineCylinders = getValue(9); // Engine Number of Cylinders
    const displacementL = getValue(11);  // Displacement (L)

    // Map body class to our vehicle types
    const mapBodyToType = (body) => {
      if (!body) return 'sedan';
      const b = body.toLowerCase();
      if (b.includes('suv') || b.includes('sport utility')) return 'suv';
      if (b.includes('truck') || b.includes('pickup')) return 'truck';
      if (b.includes('van') || b.includes('minivan')) return 'van';
      if (b.includes('convertible') || b.includes('cabriolet')) return 'convertible';
      if (b.includes('coupe')) return 'coupe';
      if (b.includes('wagon') || b.includes('hatchback')) return 'wagon';
      if (b.includes('sedan')) return 'sedan';
      return 'sedan';
    };

    // Map transmission
    const mapTransmission = (trans) => {
      if (!trans) return 'automatic';
      const t = trans.toLowerCase();
      if (t.includes('manual')) return 'manual';
      return 'automatic';
    };

    // Normalize make to title case to match dropdown options (e.g., "FORD" → "Ford")
    const normalizeMake = (rawMake) => {
      if (!rawMake) return '';
      // Known multi-word or special-case brands
      const specialCases = {
        'BMW': 'BMW',
        'GMC': 'GMC',
        'MINI': 'Mini',
        'MERCEDES-BENZ': 'Mercedes-Benz',
        'LAND ROVER': 'Land Rover',
        'ALFA ROMEO': 'Alfa Romeo',
        'ROLLS-ROYCE': 'Rolls-Royce',
        'MCLAREN': 'McLaren',
        'ROLLS ROYCE': 'Rolls-Royce'
      };
      const upper = rawMake.toUpperCase();
      if (specialCases[upper]) return specialCases[upper];
      // Default: title case (first letter upper, rest lower)
      return rawMake.charAt(0).toUpperCase() + rawMake.slice(1).toLowerCase();
    };

    const decoded = {
      make: normalizeMake(make),
      model: model || '',
      year: year ? parseInt(year) : new Date().getFullYear(),
      type: mapBodyToType(bodyClass),
      transmission: mapTransmission(transmission),
      bodyClass: bodyClass || '',
      doors: doors || '',
      driveType: driveType || '',
      fuelType: fuelType || '',
      engineCylinders: engineCylinders || '',
      displacementL: displacementL || ''
    };

    console.log(`🔍 VIN decoded: ${vin} → ${decoded.year} ${decoded.make} ${decoded.model}`);
    res.json(decoded);
  } catch (error) {
    console.error('❌ VIN decode error:', error.message);
    res.status(500).json({ message: 'Failed to decode VIN. Please try again or enter details manually.' });
  }
});

// Geocode a location (for search)
router.get('/geocode', async (req, res) => {
  try {
    const { address } = req.query;
    if (!address) {
      return res.status(400).json({ message: 'Address is required' });
    }

    const coords = await geocodeAddress(address + ', USA');
    if (coords) {
      res.json(coords);
    } else {
      res.status(404).json({ message: 'Location not found' });
    }
  } catch (error) {
    res.status(500).json({ message: 'Geocoding error', error: error.message });
  }
});

// Get all vehicles (with filters)
router.get('/', async (req, res) => {
  try {
    const { location, radius, startDate, endDate } = req.query;
    let vehicles;

    // If location and radius are provided, use geospatial query
    if (location && radius) {
      // First geocode the search location
      const searchCoords = await geocodeAddress(location + ', USA');

      if (searchCoords) {
        // Convert radius from miles to meters (1 mile = 1609.34 meters)
        const radiusInMeters = parseFloat(radius) * 1609.34;

        // Use aggregation with $geoNear for radius search
        vehicles = await Vehicle.aggregate([
          {
            $geoNear: {
              near: {
                type: 'Point',
                coordinates: [searchCoords.lng, searchCoords.lat]
              },
              distanceField: 'distance',
              maxDistance: radiusInMeters,
              spherical: true,
              query: { availability: true }
            }
          },
          {
            $lookup: {
              from: 'users',
              localField: 'host',
              foreignField: '_id',
              as: 'host'
            }
          },
          {
            $unwind: '$host'
          },
          {
            $project: {
              'host.password': 0,
              'host.resetPasswordToken': 0,
              'host.resetPasswordExpires': 0
            }
          },
          {
            $sort: { distance: 1 }
          }
        ]);

        // Convert distance from meters to miles for display
        vehicles = vehicles.map(v => ({
          ...v,
          distanceMiles: (v.distance / 1609.34).toFixed(1)
        }));
      } else {
        // Geocoding failed, fall back to text search
        let query = { availability: true };
        if (/^\d{5}$/.test(location.trim())) {
          query['location.zipCode'] = location.trim();
        } else {
          query['location.city'] = new RegExp(location, 'i');
        }
        vehicles = await Vehicle.find(query)
          .populate('host', 'firstName lastName rating reviewCount')
          .sort({ createdAt: -1 });
      }
    } else if (location) {
      // Location without radius - use text search
      let query = { availability: true };
      if (/^\d{5}$/.test(location.trim())) {
        query['location.zipCode'] = location.trim();
      } else {
        query['location.city'] = new RegExp(location, 'i');
      }
      vehicles = await Vehicle.find(query)
        .populate('host', 'firstName lastName rating reviewCount')
        .sort({ createdAt: -1 });
    } else {
      // No location filter - return all available vehicles
      vehicles = await Vehicle.find({ availability: true })
        .populate('host', 'firstName lastName rating reviewCount')
        .sort({ createdAt: -1 });
    }

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
    const vehicleData = {
      ...req.body,
      host: req.user._id
    };

    // Geocode the vehicle location to get coordinates
    if (vehicleData.location) {
      const addressString = buildAddressString(vehicleData.location);
      const coords = await geocodeAddress(addressString);
      if (coords) {
        vehicleData.location.coordinates = [coords.lng, coords.lat]; // Legacy format
        // Set GeoJSON format for geospatial queries
        vehicleData.geoLocation = {
          type: 'Point',
          coordinates: [coords.lng, coords.lat]
        };
      }
    }

    const vehicle = new Vehicle(vehicleData);
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

    // Check if location changed, if so re-geocode
    if (req.body.location) {
      const oldLocation = vehicle.location || {};
      const newLocation = req.body.location;

      const locationChanged =
        oldLocation.city !== newLocation.city ||
        oldLocation.state !== newLocation.state ||
        oldLocation.zipCode !== newLocation.zipCode;

      if (locationChanged) {
        const addressString = buildAddressString(newLocation);
        const coords = await geocodeAddress(addressString);
        if (coords) {
          req.body.location.coordinates = [coords.lng, coords.lat];
          // Set GeoJSON format for geospatial queries
          req.body.geoLocation = {
            type: 'Point',
            coordinates: [coords.lng, coords.lat]
          };
        }
      }
    }

    Object.assign(vehicle, req.body);
    await vehicle.save();

    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Geocode all existing vehicles (migration endpoint)
router.post('/geocode-all', async (req, res) => {
  try {
    // Find all vehicles that don't have geoLocation coordinates
    const vehicles = await Vehicle.find({
      $or: [
        { 'geoLocation.coordinates': { $exists: false } },
        { 'geoLocation.coordinates': null },
        { 'geoLocation': { $exists: false } }
      ]
    });

    let updated = 0;
    let failed = 0;

    for (const vehicle of vehicles) {
      if (vehicle.location) {
        const addressString = buildAddressString(vehicle.location);
        const coords = await geocodeAddress(addressString);

        if (coords) {
          vehicle.location.coordinates = [coords.lng, coords.lat];
          vehicle.geoLocation = {
            type: 'Point',
            coordinates: [coords.lng, coords.lat]
          };
          await vehicle.save();
          updated++;
        } else {
          failed++;
        }
      }
    }

    res.json({
      message: `Geocoded ${updated} vehicles`,
      updated,
      failed,
      total: vehicles.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Geocoding error', error: error.message });
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
