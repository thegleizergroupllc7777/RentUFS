const express = require('express');
const axios = require('axios');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');
const { sendVehicleListedEmail } = require('../utils/emailService');
const { geocodeAddress, buildAddressString } = require('../utils/geocoding');
const { isConfigured: tollspotConfigured, preRegisterVehicle, deregisterVehicle, isCircuitOpen: tollspotCircuitOpen } = require('../utils/tollspot');

const router = express.Router();

// Helper: resolve image URLs - converts relative paths to full URLs
function resolveImageUrls(vehicle, req) {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const baseUrl = `${protocol}://${host}`;

  if (vehicle.images && vehicle.images.length > 0) {
    vehicle.images = vehicle.images.map(img => {
      if (typeof img === 'string' && img.startsWith('/uploads/')) {
        return `${baseUrl}${img}`;
      }
      return img;
    });
  }
  if (vehicle.registrationImage && typeof vehicle.registrationImage === 'string' && vehicle.registrationImage.startsWith('/uploads/')) {
    vehicle.registrationImage = `${baseUrl}${vehicle.registrationImage}`;
  }
  return vehicle;
}

// Lookup city/state from zip code using free Zippopotam API
router.get('/lookup-zip/:zip', async (req, res) => {
  try {
    const { zip } = req.params;
    if (!zip || !/^\d{5}$/.test(zip)) {
      return res.status(400).json({ message: 'Zip code must be exactly 5 digits' });
    }

    const response = await axios.get(`https://api.zippopotam.us/us/${zip}`);
    const place = response.data.places?.[0];
    if (!place) {
      return res.status(404).json({ message: 'Zip code not found' });
    }

    res.json({
      city: place['place name'],
      state: place['state abbreviation'] || place['state']
    });
  } catch (err) {
    if (err.response?.status === 404) {
      return res.status(404).json({ message: 'Zip code not found' });
    }
    res.status(500).json({ message: 'Failed to lookup zip code' });
  }
});

// Check if a VIN already exists for this host
router.get('/check-vin/:vin', auth, async (req, res) => {
  try {
    const { vin } = req.params;
    if (!vin || vin.length !== 17) {
      return res.json({ duplicate: false });
    }

    const existing = await Vehicle.findOne({
      vin: vin.toUpperCase(),
      host: req.user._id
    });

    res.json({
      duplicate: !!existing,
      vehicleNickname: existing?.nickname || `${existing?.year} ${existing?.make} ${existing?.model}` || null
    });
  } catch (error) {
    console.error('❌ VIN check error:', error.message);
    res.status(500).json({ message: 'Failed to check VIN' });
  }
});

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

    // Check for decode errors - NHTSA returns error codes per field
    // ErrorCode "0" = no error, any other value indicates issues
    const errorCode = getValue(143); // Error Code
    const errorText = getValue(144); // Error Text
    if (errorCode) {
      console.log('⚠️ VIN decode error codes:', errorCode, errorText);
    }

    const make = getValue(26);       // Make
    const model = getValue(28);      // Model
    const year = getValue(29);       // Model Year

    // If make AND model are both missing, the VIN is likely invalid/fake
    if (!make && !model) {
      return res.status(400).json({
        message: 'Could not decode this VIN. The VIN may be invalid or not recognized. Please check and try again, or enter vehicle details manually.'
      });
    }
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
          .populate('host', 'firstName lastName rating reviewCount hostInfo.displayPreference hostInfo.businessName hostInfo.dba')
          .sort({ createdAt: -1 })
          .lean();
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
        .populate('host', 'firstName lastName rating reviewCount hostInfo.displayPreference hostInfo.businessName hostInfo.dba')
        .sort({ createdAt: -1 })
        .lean();
    } else {
      // No location filter - return all available vehicles (limit to 100 for performance)
      vehicles = await Vehicle.find({ availability: true })
        .populate('host', 'firstName lastName rating reviewCount hostInfo.displayPreference hostInfo.businessName hostInfo.dba')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean();
    }

    // Resolve relative image paths to full URLs
    vehicles = vehicles.map(v => resolveImageUrls(v, req));

    // Filter by date availability if dates are provided
    if (startDate && endDate) {
      const start = new Date(startDate);
      const end = new Date(endDate);

      // Find all bookings that overlap with the requested dates
      const overlappingBookings = await Booking.find({
        status: { $in: ['confirmed', 'pending', 'active'] },
        $or: [
          // Booking starts during requested period
          { startDate: { $gte: start, $lte: end } },
          // Booking ends during requested period
          { endDate: { $gte: start, $lte: end } },
          // Booking spans the entire requested period
          { startDate: { $lte: start }, endDate: { $gte: end } }
        ]
      }).select('vehicle').lean();

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
      .sort({ createdAt: -1 })
      .lean();

    // Resolve relative image paths to full URLs
    vehicles.forEach(v => resolveImageUrls(v, req));

    res.json(vehicles);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get vehicle by ID
router.get('/:id', async (req, res) => {
  try {
    const vehicle = await Vehicle.findById(req.params.id)
      .populate('host', 'firstName lastName email phone rating reviewCount hostInfo.displayPreference hostInfo.businessName hostInfo.dba');

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found' });
    }

    // Resolve relative image paths to full URLs
    resolveImageUrls(vehicle, req);

    res.json(vehicle);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Helper: clean vehicle data before saving
function cleanVehicleData(data) {
  // Remove empty strings from optional numeric fields to prevent Mongoose cast errors
  if (data.pricePerWeek === '' || data.pricePerWeek === null || data.pricePerWeek === undefined) delete data.pricePerWeek;
  if (data.pricePerMonth === '' || data.pricePerMonth === null || data.pricePerMonth === undefined) delete data.pricePerMonth;
  // Remove internal fields that shouldn't be set by client
  delete data._id;
  delete data.__v;
  delete data.host;
  delete data.rating;
  delete data.reviewCount;
  delete data.tripCount;
  delete data.createdAt;
  return data;
}

// Create vehicle (host only)
router.post('/', auth, async (req, res) => {
  try {
    const vehicleData = cleanVehicleData({ ...req.body });
    vehicleData.host = req.user._id;

    // Server-side VIN validation: re-decode and compare make/year
    if (vehicleData.vin && vehicleData.vin.length === 17) {
      try {
        const vinResponse = await axios.get(
          `https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/${vehicleData.vin}?format=json`
        );
        const vinResults = vinResponse.data.Results;
        const getVinValue = (variableId) => {
          const item = vinResults.find(r => r.VariableId === variableId);
          return item?.Value && item.Value.trim() !== '' ? item.Value.trim() : null;
        };
        const vinMake = getVinValue(26);
        const vinYear = getVinValue(29);

        if (vinMake && vehicleData.make) {
          if (vinMake.toLowerCase() !== vehicleData.make.toLowerCase()) {
            return res.status(400).json({
              message: `VIN mismatch: VIN indicates make "${vinMake}" but "${vehicleData.make}" was submitted. Please correct the vehicle details.`
            });
          }
        }
        if (vinYear && vehicleData.year) {
          if (String(vinYear) !== String(vehicleData.year)) {
            return res.status(400).json({
              message: `VIN mismatch: VIN indicates year "${vinYear}" but "${vehicleData.year}" was submitted. Please correct the vehicle details.`
            });
          }
        }
      } catch (vinErr) {
        // NHTSA API unavailable - don't block vehicle creation
        console.log('⚠️ VIN validation skipped (NHTSA unavailable):', vinErr.message);
      }
    }

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

    // TollSpot: Pre-register vehicle with toll agencies (fire-and-forget)
    if (tollspotConfigured()) {
      preRegisterVehicle(vehicle, req.user._id.toString())
        .then(async (result) => {
          if (result.success) {
            const tsId = result.vehicleId;
            // TollSpot accepted the vehicle — mark as registered
            const tollspotData = {
              vehicleId: tsId || null,
              status: 'registered'
            };
            await Vehicle.findByIdAndUpdate(vehicle._id, { tollspot: tollspotData });
            console.log(`🛣️ TollSpot: Vehicle ${vehicle._id} registered (TollSpot ID: ${tsId || 'none'})`);
          }
        })
        .catch(err => console.error('🛣️ TollSpot: Pre-registration error (non-blocking):', err.message));
    }

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
    console.error('❌ Create vehicle error:', error.message);
    const msg = error.name === 'ValidationError'
      ? Object.values(error.errors).map(e => e.message).join(', ')
      : error.message || 'Server error';
    res.status(500).json({ message: msg });
  }
});

// Update vehicle
router.put('/:id', auth, async (req, res) => {
  try {
    const updateData = cleanVehicleData({ ...req.body });

    // Nickname cannot be changed after creation
    delete updateData.nickname;

    const vehicle = await Vehicle.findOne({ _id: req.params.id, host: req.user._id });

    // VIN cannot be changed once set (must create a new listing)
    if (vehicle && vehicle.vin && vehicle.vin.length === 17) {
      delete updateData.vin;
    }

    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    // Check if location changed, if so re-geocode
    if (updateData.location) {
      const oldLocation = vehicle.location || {};
      const newLocation = updateData.location;

      const locationChanged =
        oldLocation.city !== newLocation.city ||
        oldLocation.state !== newLocation.state ||
        oldLocation.zipCode !== newLocation.zipCode;

      if (locationChanged) {
        const addressString = buildAddressString(newLocation);
        const coords = await geocodeAddress(addressString);
        if (coords) {
          updateData.location.coordinates = [coords.lng, coords.lat];
          // Set GeoJSON format for geospatial queries
          updateData.geoLocation = {
            type: 'Point',
            coordinates: [coords.lng, coords.lat]
          };
        }
      }
    }

    // Reset registration reminder if expiration date changed
    if (updateData.registrationExpiration &&
        updateData.registrationExpiration !== vehicle.registrationExpiration?.toISOString()?.substring(0, 10)) {
      updateData.registrationReminderSent = false;
    }

    Object.assign(vehicle, updateData);
    await vehicle.save();

    res.json(vehicle);
  } catch (error) {
    console.error('❌ Update vehicle error:', error.message);
    const msg = error.name === 'ValidationError'
      ? Object.values(error.errors).map(e => e.message).join(', ')
      : error.message || 'Server error';
    res.status(500).json({ message: msg });
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

// Sync TollSpot statuses for host's vehicles (promotes pre_registered → registered)
router.post('/tollspot-sync', auth, async (req, res) => {
  try {
    if (!tollspotConfigured()) {
      return res.status(503).json({ message: 'TollSpot integration is not configured' });
    }

    const vehicles = await Vehicle.find({
      host: req.user._id,
      'tollspot.status': 'pre_registered'
    });

    if (vehicles.length === 0) {
      return res.json({ message: 'No vehicles pending sync', synced: 0, failed: 0 });
    }

    // If the circuit breaker is open, don't even try
    if (tollspotCircuitOpen()) {
      return res.json({
        message: 'TollSpot API is temporarily unavailable. Will retry automatically in a few minutes.',
        synced: 0,
        failed: vehicles.length,
        circuitOpen: true
      });
    }

    // Process vehicles sequentially to avoid spamming the TollSpot API
    let synced = 0;
    let failed = 0;
    let apiUnreachable = false;

    for (const vehicle of vehicles) {
      if (vehicle.tollspot?.vehicleId) {
        await Vehicle.findByIdAndUpdate(vehicle._id, { 'tollspot.status': 'registered' });
        synced++;
        continue;
      }

      // If the API already timed out, skip remaining vehicles
      if (apiUnreachable) {
        failed++;
        continue;
      }

      if (vehicle.licensePlate && vehicle.location?.state) {
        const result = await preRegisterVehicle(vehicle, req.user._id.toString(), { timeout: 8000 });
        if (result.success) {
          const tsId = result.vehicleId;
          // TollSpot accepted the vehicle — mark as registered
          // (even if no ID returned, the API confirmed receipt)
          await Vehicle.findByIdAndUpdate(vehicle._id, {
            'tollspot.vehicleId': tsId || null,
            'tollspot.status': 'registered'
          });
          synced++;
        } else {
          failed++;
          // If the first call times out, don't bother trying the rest
          if (result.isTimeout) {
            apiUnreachable = true;
            console.error('🛣️ TollSpot sync: API unreachable (timeout), skipping remaining vehicles');
          }
        }
      } else {
        failed++;
      }
    }

    const message = synced > 0
      ? `Synced ${synced} vehicle(s)${failed > 0 ? `, ${failed} failed` : ''}`
      : failed > 0
        ? `TollSpot API unreachable. ${failed} vehicle(s) could not sync — will retry automatically.`
        : 'No vehicles needed syncing';
    res.json({ message, synced, failed });
  } catch (error) {
    console.error('❌ TollSpot sync error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Reset stuck toll registration so the host can re-enroll
router.post('/:id/tollspot-reset', auth, async (req, res) => {
  try {
    const vehicle = await Vehicle.findOne({ _id: req.params.id, host: req.user._id });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    if (vehicle.tollspot?.status !== 'pre_registered') {
      return res.status(400).json({ message: 'Vehicle is not stuck in registration' });
    }
    await Vehicle.findByIdAndUpdate(vehicle._id, {
      'tollspot.vehicleId': null,
      'tollspot.status': 'none'
    });
    console.log(`🛣️ TollSpot: Vehicle ${vehicle._id} toll registration reset by host`);
    res.json({ message: 'Toll registration cleared. You can re-enroll this vehicle.' });
  } catch (error) {
    console.error('❌ TollSpot reset error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Re-enroll vehicle with TollSpot (reset + enroll in one step)
router.post('/:id/tollspot-reenroll', auth, async (req, res) => {
  try {
    if (!tollspotConfigured()) {
      return res.status(503).json({ message: 'TollSpot integration is not configured' });
    }

    const vehicle = await Vehicle.findOne({ _id: req.params.id, host: req.user._id });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    if (!vehicle.tollspot?.status || vehicle.tollspot.status === 'none') {
      return res.status(400).json({ message: 'Vehicle is not enrolled. Use enroll instead.' });
    }

    if (!vehicle.licensePlate || !vehicle.licensePlate.trim()) {
      return res.status(400).json({ message: 'Vehicle must have a license plate before enrolling in TollSpot.' });
    }
    if (!vehicle.location?.state) {
      return res.status(400).json({ message: 'Vehicle must have a state in its location before enrolling in TollSpot.' });
    }

    // Reset status first
    await Vehicle.findByIdAndUpdate(vehicle._id, {
      'tollspot.vehicleId': null,
      'tollspot.status': 'none'
    });

    // Re-enroll with TollSpot
    const result = await preRegisterVehicle(vehicle, req.user._id.toString());

    if (result.success) {
      const tollspotData = {
        vehicleId: result.vehicleId || null,
        status: 'registered'
      };
      await Vehicle.findByIdAndUpdate(vehicle._id, { tollspot: tollspotData });
      console.log(`🛣️ TollSpot: Vehicle ${vehicle._id} re-enrolled (TollSpot ID: ${tollspotData.vehicleId})`);
      return res.json({ message: 'Vehicle re-enrolled with TollSpot', tollspot: tollspotData });
    }

    const isNetworkError = result.isTimeout || result.circuitOpen || (result.error && (
      result.error.includes('timeout') ||
      result.error.includes('circuit breaker') ||
      result.error.includes('ECONNREFUSED') ||
      result.error.includes('ENOTFOUND') ||
      result.error.includes('ECONNRESET') ||
      result.error.includes('Network Error')
    ));

    if (isNetworkError) {
      const tollspotData = { vehicleId: null, status: 'pre_registered' };
      await Vehicle.findByIdAndUpdate(vehicle._id, { tollspot: tollspotData });
      console.log(`🛣️ TollSpot: Vehicle ${vehicle._id} re-enrolled locally (API unavailable, will sync later)`);
      return res.json({ message: 'Vehicle re-enrolled with TollSpot', tollspot: tollspotData });
    }

    // Re-enrollment failed — restore registered status so badge doesn't disappear
    await Vehicle.findByIdAndUpdate(vehicle._id, {
      'tollspot.vehicleId': vehicle.tollspot.vehicleId,
      'tollspot.status': vehicle.tollspot.status
    });

    const errorDetail = result.error || 'Unknown error';
    console.error(`🛣️ TollSpot: Re-enrollment rejected for vehicle ${vehicle._id}: ${errorDetail}`);
    return res.status(result.status || 502).json({ message: `TollSpot re-enrollment failed: ${errorDetail}` });
  } catch (error) {
    console.error('❌ TollSpot re-enroll error:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Enroll existing vehicle with TollSpot
router.post('/:id/tollspot-enroll', auth, async (req, res) => {
  try {
    if (!tollspotConfigured()) {
      return res.status(503).json({ message: 'TollSpot integration is not configured' });
    }

    const vehicle = await Vehicle.findOne({ _id: req.params.id, host: req.user._id });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    // Already enrolled
    if (vehicle.tollspot?.status && vehicle.tollspot.status !== 'none' && vehicle.tollspot.status !== 'unregistered') {
      return res.status(400).json({ message: `Vehicle is already ${vehicle.tollspot.status}` });
    }

    // Validate required fields before calling TollSpot API
    if (!vehicle.licensePlate || !vehicle.licensePlate.trim()) {
      return res.status(400).json({ message: 'Vehicle must have a license plate before enrolling in TollSpot. Please edit the vehicle and add a license plate.' });
    }
    if (!vehicle.location?.state) {
      return res.status(400).json({ message: 'Vehicle must have a state in its location before enrolling in TollSpot. Please edit the vehicle and add a location.' });
    }

    const result = await preRegisterVehicle(vehicle, req.user._id.toString());

    if (result.success) {
      const tsId = result.vehicleId;
      // TollSpot accepted the vehicle — mark as registered
      const tollspotData = {
        vehicleId: tsId || null,
        status: 'registered'
      };
      await Vehicle.findByIdAndUpdate(vehicle._id, { tollspot: tollspotData });
      console.log(`🛣️ TollSpot: Vehicle ${vehicle._id} enrolled (TollSpot ID: ${tollspotData.vehicleId}, status: registered)`);
      return res.json({ message: 'Vehicle enrolled with TollSpot', tollspot: tollspotData });
    }

    // If TollSpot API is unreachable (timeout/network error/circuit breaker), save enrollment locally
    // and queue for sync when the API becomes available
    const isNetworkError = result.isTimeout || result.circuitOpen || (result.error && (
      result.error.includes('timeout') ||
      result.error.includes('circuit breaker') ||
      result.error.includes('ECONNREFUSED') ||
      result.error.includes('ENOTFOUND') ||
      result.error.includes('ECONNRESET') ||
      result.error.includes('Network Error')
    ));

    if (isNetworkError) {
      const tollspotData = {
        vehicleId: null,
        status: 'pre_registered'
      };
      await Vehicle.findByIdAndUpdate(vehicle._id, { tollspot: tollspotData });
      console.log(`🛣️ TollSpot: Vehicle ${vehicle._id} enrolled locally (API unavailable, will sync later)`);
      return res.json({ message: 'Vehicle enrolled with TollSpot', tollspot: tollspotData });
    }

    const errorDetail = result.error || 'Unknown error';
    console.error(`🛣️ TollSpot: Enrollment rejected for vehicle ${vehicle._id} (HTTP ${result.status}): ${errorDetail}`);
    return res.status(result.status || 502).json({ message: `TollSpot registration failed: ${errorDetail}` });
  } catch (error) {
    console.error('❌ TollSpot enroll error:', error.message);
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

    // TollSpot: Deregister vehicle from toll agencies
    const wasTollEnrolled = vehicle.tollspot?.status && vehicle.tollspot.status !== 'none';
    let tollMessage = '';

    if (wasTollEnrolled && tollspotConfigured() && vehicle.tollspot?.vehicleId) {
      try {
        const result = await deregisterVehicle(vehicle.tollspot.vehicleId);
        if (result.success) {
          console.log(`🛣️ TollSpot: Vehicle ${vehicle._id} deregistration scheduled`);
          tollMessage = ' Toll registration has been removed from TollSpot.';
        } else {
          console.error(`🛣️ TollSpot: Deregistration failed for vehicle ${vehicle._id}: ${result.error}`);
          tollMessage = ' Could not remove toll registration automatically — please remove the plate from TollSpot manually.';
        }
      } catch (err) {
        console.error('🛣️ TollSpot: Deregistration error:', err.message);
        tollMessage = ' Could not remove toll registration automatically — please remove the plate from TollSpot manually.';
      }
    } else if (wasTollEnrolled) {
      tollMessage = ' This vehicle was enrolled in TollSpot but could not be deregistered automatically — please remove the plate from TollSpot manually.';
    }

    res.json({ message: `Vehicle deleted successfully.${tollMessage}` });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
