const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const TollCharge = require('../models/TollCharge');
const { isConfigured, listVehicles } = require('../utils/tollspot');

const router = express.Router();

// Platform fee added to every toll charge across all reservations
const PLATFORM_TOLL_FEE = 0.50;

// Middleware to authenticate inbound requests from TollSpot using a shared API key
const tollspotAuth = (req, res, next) => {
  const apiKey = req.header('X-API-KEY');
  const expectedKey = process.env.TOLLSPOT_WEBHOOK_SECRET;

  if (!expectedKey) {
    console.error('🛣️ TollSpot Webhook: TOLLSPOT_WEBHOOK_SECRET not configured');
    return res.status(503).json({ error: 'WEBHOOK_NOT_CONFIGURED', message: 'Webhook endpoint is not configured' });
  }

  if (!apiKey || apiKey !== expectedKey) {
    return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid API key provided' });
  }

  next();
};

// ============================================================
// INBOUND ENDPOINTS - Called by TollSpot into RentUFS
// ============================================================

// GET /api/tolls/partner/reservations - TollSpot queries reservations by VIN
// Returns bookings for a vehicle so TollSpot can determine which driver was driving during a toll
router.get('/partner/reservations', tollspotAuth, async (req, res) => {
  try {
    const { vin, from_date, to_date, page = 0, limit = 20 } = req.query;

    if (!vin) {
      return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'vin query parameter is required' });
    }

    if (!from_date || !to_date) {
      return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'from_date and to_date query parameters are required (MM/DD/YYYY format)' });
    }

    // Find vehicle by VIN (case-insensitive, full match)
    const searchVin = vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
    const vehicle = await Vehicle.findOne({
      vin: { $regex: new RegExp(`^${searchVin}$`, 'i') }
    });

    if (!vehicle) {
      return res.json({ total: 0, data: [] });
    }

    // Build booking query
    const query = {
      vehicle: vehicle._id,
      status: { $in: ['confirmed', 'active', 'completed'] }
    };

    // Filter by date range if provided (MM/DD/YYYY format from TollSpot)
    if (from_date) {
      const fromParts = from_date.split('/');
      if (fromParts.length === 3) {
        query.endDate = { ...query.endDate, $gte: new Date(`${fromParts[2]}-${fromParts[0]}-${fromParts[1]}`) };
      }
    }
    if (to_date) {
      const toParts = to_date.split('/');
      if (toParts.length === 3) {
        query.startDate = { ...query.startDate, $lte: new Date(`${toParts[2]}-${toParts[0]}-${toParts[1]}`) };
      }
    }

    const pageNum = parseInt(page) || 0;
    const limitNum = Math.min(parseInt(limit) || 20, 100);

    const [bookings, total] = await Promise.all([
      Booking.find(query)
        .select('reservationId startDate endDate')
        .sort({ startDate: -1 })
        .skip(pageNum * limitNum)
        .limit(limitNum)
        .lean(),
      Booking.countDocuments(query)
    ]);

    const data = bookings.map(b => ({
      reservation_id: b.reservationId,
      trip_start: b.startDate,
      trip_end: b.endDate,
      vin: vehicle.vin,
      license_plate: vehicle.licensePlate,
      license_plate_state: vehicle.location?.state || ''
    }));

    console.log(`🛣️ TollSpot Inbound: Reservations query for VIN ${searchVin} — ${total} results`);
    res.json({ total, data });
  } catch (error) {
    console.error('🛣️ TollSpot Inbound: Error fetching reservations:', error.message);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
  }
});

// GET /api/tolls/partner/vehicles - TollSpot queries vehicles by host_id
// Returns vehicles for a host so TollSpot can register them for toll management
router.get('/partner/vehicles', tollspotAuth, async (req, res) => {
  try {
    const { host_id } = req.query;

    if (!host_id) {
      return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'host_id query parameter is required' });
    }

    const vehicles = await Vehicle.find({ host: host_id })
      .select('vin licensePlate registrationState make model year type location host')
      .lean();

    const data = vehicles.map(v => ({
      partner_vehicle_id: v._id.toString(),
      vin: v.vin || '',
      year: v.year,
      vehicle_make: v.make,
      vehicle_model: v.model,
      vehicle_type: (v.type || '').toUpperCase(),
      license_plate: v.licensePlate || '',
      license_plate_state: v.registrationState || v.location?.state || '',
      license_plate_country: 'US',
      host_id: v.host.toString()
    }));

    console.log(`🛣️ TollSpot Inbound: Vehicles query for host ${host_id} — ${data.length} results`);
    res.json({ total: data.length, data });
  } catch (error) {
    console.error('🛣️ TollSpot Inbound: Error fetching vehicles:', error.message);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
  }
});

// POST /api/tolls/partner/charges - TollSpot pushes toll charges to RentUFS
// Payload matches TollSpot's TollCharge schema from their List Toll Charges API
router.post('/partner/charges', tollspotAuth, async (req, res) => {
  try {
    const charges = Array.isArray(req.body) ? req.body : [req.body];

    if (charges.length === 0) {
      return res.status(422).json({ error: 'VALIDATION_ERROR', message: 'At least one toll charge is required' });
    }

    const results = { received: charges.length, created: 0, duplicates: 0, errors: 0 };

    const errorDetails = [];

    for (const charge of charges) {
      // Validate required fields
      const missingFields = [];
      if (!charge.id) missingFields.push('id');
      if (!charge.posted_time) missingFields.push('posted_time');
      if (!charge.exit_time) missingFields.push('exit_time');
      if (!charge.exit_location) missingFields.push('exit_location');
      if (charge.amount === undefined) missingFields.push('amount');
      if (!charge.agency) missingFields.push('agency');

      if (missingFields.length > 0) {
        results.errors++;
        errorDetails.push({ charge_id: charge.id || null, missing_fields: missingFields });
        console.error(`🛣️ TollSpot Inbound: Charge rejected — missing fields: ${missingFields.join(', ')}`);
        continue;
      }

      // Check for duplicate by TollSpot ID
      const existing = await TollCharge.findOne({ tollspotId: charge.id });
      if (existing) {
        results.duplicates++;
        continue;
      }

      // Resolve RentUFS vehicle by partner_vehicle_id or license plate
      let vehicle = null;
      let booking = null;

      if (charge.partner_vehicle_id) {
        vehicle = await Vehicle.findById(charge.partner_vehicle_id).lean();
      }
      if (!vehicle && charge.license_plate) {
        const plateClean = charge.license_plate.toUpperCase().replace(/[^A-Z0-9]/g, '');
        vehicle = await Vehicle.findOne({ licensePlate: plateClean }).lean();
      }

      // Resolve booking: find the booking covering exit_time for this vehicle
      if (vehicle) {
        const exitDate = new Date(charge.exit_time);
        booking = await Booking.findOne({
          vehicle: vehicle._id,
          status: { $in: ['confirmed', 'active', 'completed'] },
          startDate: { $lte: exitDate },
          endDate: { $gte: exitDate }
        }).lean();
      }

      try {
        await TollCharge.create({
          tollspotId: charge.id,
          postedTime: new Date(charge.posted_time),
          entryTime: charge.entry_time ? new Date(charge.entry_time) : null,
          entryLocation: charge.entry_location || null,
          exitTime: new Date(charge.exit_time),
          exitLocation: charge.exit_location,
          amount: charge.amount,
          transactionType: charge.transaction_type || null,
          licensePlate: charge.license_plate || null,
          licensePlateState: charge.license_plate_state || null,
          licensePlateCountry: charge.license_plate_country || null,
          transponderNumber: charge.transponder_number || null,
          agency: charge.agency,
          detectionType: charge.detection_type || null,
          tollAccountId: charge.toll_account_id || null,
          vin: charge.vin || null,
          hostId: charge.host_id || null,
          partnerVehicleId: charge.partner_vehicle_id || null,
          tollspotVehicleId: charge.vehicle_id || null,
          vehicle: vehicle?._id || null,
          booking: booking?._id || null,
          host: vehicle?.host || null,
          driver: booking?.driver || null
        });
        results.created++;

        // Update toll accounting on the booking if resolved
        if (booking) {
          const tollCount = await TollCharge.countDocuments({ booking: booking._id });
          const tollSum = await TollCharge.aggregate([
            { $match: { booking: booking._id } },
            { $group: { _id: null, total: { $sum: '$amount' } } }
          ]);
          const originalAmount = tollSum[0]?.total || 0;

          await Booking.findByIdAndUpdate(booking._id, {
            'tollAccounting.totalTolls': tollCount,
            'tollAccounting.originalTollAmount': parseFloat(originalAmount.toFixed(2)),
            'tollAccounting.platformTollFees': parseFloat((tollCount * PLATFORM_TOLL_FEE).toFixed(2)),
            'tollAccounting.driverTollTotal': parseFloat((originalAmount + tollCount * PLATFORM_TOLL_FEE).toFixed(2)),
            'tollAccounting.lastSyncedAt': new Date()
          });
        }
      } catch (err) {
        if (err.code === 11000) {
          results.duplicates++;
        } else {
          console.error('🛣️ TollSpot Inbound: Error saving charge:', err.message);
          results.errors++;
          errorDetails.push({ charge_id: charge.id, error: err.message });
        }
      }
    }

    console.log(`🛣️ TollSpot Inbound: Processed ${results.received} charges — ${results.created} created, ${results.duplicates} duplicates, ${results.errors} errors`);
    const response = { message: 'Toll charges processed', ...results };
    if (errorDetails.length > 0) {
      response.error_details = errorDetails;
    }
    res.json(response);
  } catch (error) {
    console.error('🛣️ TollSpot Inbound: Error processing toll charges:', error.message);
    res.status(500).json({ error: 'INTERNAL_SERVER_ERROR', message: 'An unexpected error occurred' });
  }
});

// ============================================================
// OUTBOUND ENDPOINTS - Called by RentUFS frontend (JWT auth)
// ============================================================

// Map local TollCharge document to snake_case format expected by frontend
const formatTollCharge = (doc) => ({
  id: doc.tollspotId,
  posted_time: doc.postedTime,
  entry_time: doc.entryTime,
  entry_location: doc.entryLocation,
  exit_time: doc.exitTime,
  exit_location: doc.exitLocation,
  amount: doc.amount,
  transaction_type: doc.transactionType,
  license_plate: doc.licensePlate,
  license_plate_state: doc.licensePlateState,
  license_plate_country: doc.licensePlateCountry,
  transponder_number: doc.transponderNumber,
  agency: doc.agency,
  detection_type: doc.detectionType,
  toll_account_id: doc.tollAccountId,
  vin: doc.vin,
  host_id: doc.hostId,
  partner_vehicle_id: doc.partnerVehicleId,
  vehicle_id: doc.tollspotVehicleId
});

// GET /api/tolls/charges/:bookingId - Get toll charges for a specific booking
router.get('/charges/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only allow driver or host to view toll charges
    if (booking.driver.toString() !== req.user._id.toString() &&
        booking.host.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Query local TollCharge collection
    const charges = await TollCharge.find({ booking: booking._id })
      .sort({ exitTime: -1 })
      .lean();

    // Add $0.50 platform fee to each toll charge (included in amount, not shown separately)
    const chargesWithFee = charges.map(doc => ({
      ...formatTollCharge(doc),
      amount: parseFloat(((doc.amount || 0) + PLATFORM_TOLL_FEE).toFixed(2))
    }));

    // Calculate toll accounting totals
    const totalTolls = charges.length;
    const originalTollAmount = parseFloat(charges.reduce((sum, c) => sum + (c.amount || 0), 0).toFixed(2));
    const platformTollFees = parseFloat((totalTolls * PLATFORM_TOLL_FEE).toFixed(2));
    const driverTollTotal = parseFloat((originalTollAmount + platformTollFees).toFixed(2));

    // Sync toll accounting to booking (fire-and-forget)
    Booking.findByIdAndUpdate(booking._id, {
      'tollAccounting.totalTolls': totalTolls,
      'tollAccounting.originalTollAmount': originalTollAmount,
      'tollAccounting.platformTollFees': platformTollFees,
      'tollAccounting.driverTollTotal': driverTollTotal,
      'tollAccounting.lastSyncedAt': new Date()
    }).catch(err => {
      console.error('🛣️ TollSpot: Failed to sync toll accounting:', err.message);
    });

    res.json({
      total: totalTolls,
      data: chargesWithFee
    });
  } catch (error) {
    console.error('🛣️ TollSpot: Error fetching booking toll charges:', error.message);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// GET /api/tolls/host-charges - Get all toll charges for a host's vehicles
router.get('/host-charges', auth, async (req, res) => {
  try {
    const query = { host: req.user._id };

    // Optional date filters
    if (req.query.from_date) {
      query.exitTime = { ...query.exitTime, $gte: new Date(req.query.from_date) };
    }
    if (req.query.to_date) {
      query.exitTime = { ...query.exitTime, $lte: new Date(req.query.to_date) };
    }

    const page = parseInt(req.query.page) || 0;
    const limit = Math.min(parseInt(req.query.limit) || 50, 100);

    const [charges, total] = await Promise.all([
      TollCharge.find(query)
        .sort({ exitTime: -1 })
        .skip(page * limit)
        .limit(limit)
        .lean(),
      TollCharge.countDocuments(query)
    ]);

    // Add $0.50 platform fee to each toll charge
    const chargesWithFee = charges.map(doc => ({
      ...formatTollCharge(doc),
      amount: parseFloat(((doc.amount || 0) + PLATFORM_TOLL_FEE).toFixed(2))
    }));

    res.json({
      total,
      data: chargesWithFee
    });
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
  res.json({
    configured: isConfigured(),
    signupUrl: process.env.TOLLSPOT_SIGNUP_URL || null
  });
});

module.exports = router;
