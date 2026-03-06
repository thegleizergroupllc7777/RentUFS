const axios = require('axios');

// TollSpot Partner API client
const TOLLSPOT_BASE_URL = process.env.TOLLSPOT_BASE_URL || 'https://api.tollspot.com';
const TOLLSPOT_API_KEY = process.env.TOLLSPOT_API_KEY || '';
const TOLLSPOT_API_VERSION = '1.2.0';

// Circuit breaker: stop calling TollSpot if it's been failing
const circuitBreaker = {
  failures: 0,
  lastFailure: null,
  cooldownMs: 5 * 60 * 1000, // 5 minutes before retrying after failures
  threshold: 2, // Open circuit after 2 consecutive failures
  isOpen() {
    if (this.failures < this.threshold) return false;
    if (!this.lastFailure) return false;
    const elapsed = Date.now() - this.lastFailure;
    if (elapsed > this.cooldownMs) {
      // Allow a retry after cooldown
      this.failures = 0;
      this.lastFailure = null;
      console.log('🛣️ TollSpot: Circuit breaker reset, allowing retry');
      return false;
    }
    return true;
  },
  recordFailure() {
    this.failures++;
    this.lastFailure = Date.now();
    console.log(`🛣️ TollSpot: Circuit breaker recorded failure (${this.failures}/${this.threshold})`);
  },
  recordSuccess() {
    this.failures = 0;
    this.lastFailure = null;
  }
};

const tollApi = axios.create({
  baseURL: TOLLSPOT_BASE_URL,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Add auth and version headers to every request
// Send API key in multiple header formats for compatibility
tollApi.interceptors.request.use((config) => {
  if (TOLLSPOT_API_KEY) {
    config.headers['X-API-KEY'] = TOLLSPOT_API_KEY;
    config.headers['Authorization'] = `Bearer ${TOLLSPOT_API_KEY}`;
    config.headers['x-api-key'] = TOLLSPOT_API_KEY;
  }
  config.headers['X-API-VERSION'] = TOLLSPOT_API_VERSION;
  console.log(`🛣️ TollSpot: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
  return config;
});

/**
 * Convert full state name to 2-letter abbreviation.
 */
const STATE_ABBR = {
  'alabama': 'AL', 'alaska': 'AK', 'arizona': 'AZ', 'arkansas': 'AR',
  'california': 'CA', 'colorado': 'CO', 'connecticut': 'CT', 'delaware': 'DE',
  'florida': 'FL', 'georgia': 'GA', 'hawaii': 'HI', 'idaho': 'ID',
  'illinois': 'IL', 'indiana': 'IN', 'iowa': 'IA', 'kansas': 'KS',
  'kentucky': 'KY', 'louisiana': 'LA', 'maine': 'ME', 'maryland': 'MD',
  'massachusetts': 'MA', 'michigan': 'MI', 'minnesota': 'MN', 'mississippi': 'MS',
  'missouri': 'MO', 'montana': 'MT', 'nebraska': 'NE', 'nevada': 'NV',
  'new hampshire': 'NH', 'new jersey': 'NJ', 'new mexico': 'NM', 'new york': 'NY',
  'north carolina': 'NC', 'north dakota': 'ND', 'ohio': 'OH', 'oklahoma': 'OK',
  'oregon': 'OR', 'pennsylvania': 'PA', 'rhode island': 'RI', 'south carolina': 'SC',
  'south dakota': 'SD', 'tennessee': 'TN', 'texas': 'TX', 'utah': 'UT',
  'vermont': 'VT', 'virginia': 'VA', 'washington': 'WA', 'west virginia': 'WV',
  'wisconsin': 'WI', 'wyoming': 'WY', 'district of columbia': 'DC'
};

const toStateAbbr = (state) => {
  if (!state) return '';
  const trimmed = state.trim();
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  return STATE_ABBR[trimmed.toLowerCase()] || trimmed;
};

/**
 * Map RentUFS vehicle type to TollSpot vehicle_type enum
 * TollSpot: SEDAN, SUV, TRUCK, MOTORCYCLE, RV, TRAILER
 */
const mapVehicleType = (type) => {
  const mapping = {
    'sedan': 'SEDAN',
    'suv': 'SUV',
    'truck': 'TRUCK',
    'van': 'SUV',
    'convertible': 'SEDAN',
    'coupe': 'SEDAN',
    'wagon': 'SEDAN',
    'other': 'SEDAN'
  };
  return mapping[type?.toLowerCase()] || 'SEDAN';
};

/**
 * Check if TollSpot integration is configured
 */
const isConfigured = () => {
  return !!TOLLSPOT_API_KEY;
};

/**
 * Extract vehicle ID from TollSpot API response.
 * TollSpot may return the ID as `id`, `vehicle_id`, `vehicleId`,
 * or nested inside a `data` or `vehicle` wrapper.
 */
const extractVehicleId = (data) => {
  if (!data) return null;
  // Direct fields
  if (data.id) return data.id;
  if (data.vehicle_id) return data.vehicle_id;
  if (data.vehicleId) return data.vehicleId;
  // Nested under data envelope
  if (data.data?.id) return data.data.id;
  if (data.data?.vehicle_id) return data.data.vehicle_id;
  if (data.data?.vehicleId) return data.data.vehicleId;
  // Nested under vehicle key
  if (data.vehicle?.id) return data.vehicle.id;
  if (data.vehicle?.vehicle_id) return data.vehicle.vehicle_id;
  return null;
};

/**
 * Pre-register a vehicle with toll agencies
 * POST /api/partner/vehicle/pre-register
 */
const preRegisterVehicle = async (vehicle, hostId, options = {}) => {
  const body = {
    license_plate: (vehicle.licensePlate || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    license_plate_state: toStateAbbr(vehicle.location?.state),
    license_plate_country: 'US',
    year: vehicle.year,
    vehicle_make: vehicle.make,
    vehicle_model: vehicle.model,
    vehicle_type: mapVehicleType(vehicle.type),
    host_id: hostId,
    partner_vehicle_id: vehicle._id.toString()
  };

  // Send the full VIN to TollSpot for accurate vehicle matching
  if (vehicle.vin) {
    body.vin = vehicle.vin.toUpperCase().replace(/[^A-HJ-NPR-Z0-9]/g, '');
  }

  console.log('🛣️ TollSpot: Pre-registering vehicle:', JSON.stringify(body, null, 2));

  // Check circuit breaker before making the call
  if (circuitBreaker.isOpen()) {
    console.log('🛣️ TollSpot: Circuit breaker OPEN - skipping API call (will retry after cooldown)');
    return { success: false, error: 'TollSpot API temporarily unavailable (circuit breaker open)', isTimeout: true, circuitOpen: true };
  }

  try {
    const requestConfig = {};
    if (options.timeout) requestConfig.timeout = options.timeout;
    const response = await tollApi.post('/api/partner/vehicle/pre-register', body, requestConfig);
    const vehicleId = extractVehicleId(response.data);
    console.log('🛣️ TollSpot: Vehicle pre-registered successfully:', JSON.stringify(response.data), '→ extracted ID:', vehicleId);
    circuitBreaker.recordSuccess();
    return { success: true, data: response.data, vehicleId };
  } catch (err) {
    const status = err.response?.status;
    const respData = err.response?.data;
    const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
    console.error(`🛣️ TollSpot: Pre-registration failed - ${isTimeout ? 'TIMEOUT' : `HTTP ${status}`}:`, JSON.stringify(respData, null, 2));
    if (isTimeout) circuitBreaker.recordFailure();
    return { success: false, error: respData?.message || err.message, isTimeout };
  }
};

/**
 * Deregister a vehicle from toll agencies
 * POST /api/partner/vehicle/deregister/{vehicle_id}
 */
const deregisterVehicle = async (tollspotVehicleId) => {
  console.log(`🛣️ TollSpot: Deregistering vehicle ID: ${tollspotVehicleId}`);

  try {
    const response = await tollApi.post(`/api/partner/vehicle/deregister/${tollspotVehicleId}`);
    console.log('🛣️ TollSpot: Vehicle deregistration scheduled:', response.data);
    return { success: true, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    const respData = err.response?.data;
    console.error(`🛣️ TollSpot: Deregistration failed - HTTP ${status}:`, JSON.stringify(respData, null, 2));
    return { success: false, error: respData?.message || err.message };
  }
};

/**
 * List registered vehicles (paginated)
 * GET /api/partner/vehicle
 */
const listVehicles = async (page = 0, limit = 20) => {
  if (circuitBreaker.isOpen()) {
    console.log('🛣️ TollSpot: Circuit breaker OPEN - skipping list vehicles');
    return { success: false, error: 'TollSpot API temporarily unavailable', circuitOpen: true };
  }
  try {
    const response = await tollApi.get('/api/partner/vehicle', {
      params: { page, limit }
    });
    circuitBreaker.recordSuccess();
    return { success: true, data: response.data };
  } catch (err) {
    const isTimeout = err.code === 'ECONNABORTED' || err.message?.includes('timeout');
    if (isTimeout) circuitBreaker.recordFailure();
    console.error('🛣️ TollSpot: List vehicles failed:', err.response?.data || err.message);
    return { success: false, error: err.response?.data?.message || err.message };
  }
};

/**
 * Start monitoring toll charges for a rental trip
 * POST /api/partner/monitor-charges
 * Monitoring extends 60 days beyond trip_end for delayed toll postings
 */
const monitorCharges = async (booking, vehicle) => {
  const body = {
    trip_start: new Date(booking.startDate).toISOString(),
    trip_end: new Date(booking.endDate).toISOString(),
    partner_vehicle_id: (vehicle._id || vehicle).toString(),
    host_id: (booking.host._id || booking.host).toString(),
    license_plate: (vehicle.licensePlate || '').toUpperCase().replace(/[^A-Z0-9]/g, ''),
    license_plate_state: toStateAbbr(vehicle.location?.state),
    license_plate_country: 'US'
  };

  console.log('🛣️ TollSpot: Starting toll monitoring:', JSON.stringify(body, null, 2));

  try {
    const response = await tollApi.post('/api/partner/monitor-charges', body);
    console.log('🛣️ TollSpot: Monitoring started:', response.data);
    return { success: true, data: response.data };
  } catch (err) {
    const status = err.response?.status;
    const respData = err.response?.data;
    console.error(`🛣️ TollSpot: Monitor charges failed - HTTP ${status}:`, JSON.stringify(respData, null, 2));
    return { success: false, error: respData?.message || err.message };
  }
};

/**
 * Get toll charges with optional filters
 * GET /api/partner/toll-charge
 */
const getTollCharges = async (filters = {}) => {
  const params = {};
  if (filters.page !== undefined) params.page = filters.page;
  if (filters.limit !== undefined) params.limit = filters.limit;
  if (filters.from_date) params.from_date = filters.from_date;
  if (filters.to_date) params.to_date = filters.to_date;
  if (filters.host_id) params.host_id = filters.host_id;
  if (filters.license_plate) params.license_plate = filters.license_plate;
  if (filters.license_plate_state) params.license_plate_state = filters.license_plate_state;

  try {
    const response = await tollApi.get('/api/partner/toll-charge', { params });
    return { success: true, data: response.data };
  } catch (err) {
    console.error('🛣️ TollSpot: Get toll charges failed:', err.response?.data || err.message);
    return { success: false, error: err.response?.data?.message || err.message };
  }
};

module.exports = {
  isConfigured,
  preRegisterVehicle,
  deregisterVehicle,
  listVehicles,
  monitorCharges,
  getTollCharges,
  extractVehicleId,
  isCircuitOpen: () => circuitBreaker.isOpen()
};
