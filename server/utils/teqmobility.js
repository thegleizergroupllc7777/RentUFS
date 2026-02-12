const axios = require('axios');

// TeqMobility Dynamic Insurance API client
const TEQMOBILITY_BASE_URL = process.env.TEQMOBILITY_API_URL || 'https://insurance.sandbox.teqmobility.com';
const TEQMOBILITY_API_KEY = process.env.TEQMOBILITY_API_KEY || '';

const teqApi = axios.create({
  baseURL: TEQMOBILITY_BASE_URL,
  timeout: 8000, // 8 second timeout per request
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Add auth headers to every request
// TeqMobility docs show Bearer token auth; send both Bearer and x-api-key for compatibility
teqApi.interceptors.request.use((config) => {
  if (TEQMOBILITY_API_KEY) {
    config.headers['Authorization'] = `Bearer ${TEQMOBILITY_API_KEY}`;
    config.headers['x-api-key'] = TEQMOBILITY_API_KEY;
  }
  console.log(`🛡️ TeqMobility: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
  return config;
});

/**
 * Convert full state name to 2-letter abbreviation.
 * If already a 2-letter code, returns it as-is.
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

// Strip non-alphanumeric characters from zip codes (TeqMobility rejects hyphens, spaces, etc.)
const sanitizeZip = (zip) => (zip || '').replace(/[^a-zA-Z0-9]/g, '');

const toStateAbbr = (state) => {
  if (!state) return '';
  const trimmed = state.trim();
  // Already a 2-letter abbreviation
  if (/^[A-Z]{2}$/.test(trimmed)) return trimmed;
  if (/^[a-z]{2}$/i.test(trimmed)) return trimmed.toUpperCase();
  // Look up full name
  return STATE_ABBR[trimmed.toLowerCase()] || trimmed;
};

/**
 * Check if TeqMobility integration is configured
 */
const isConfigured = () => {
  return !!(TEQMOBILITY_API_KEY);
};

/**
 * 1. Upsert Owner - Creates or updates an owner (the vehicle host)
 * PUT /api/v2/owners
 */
const upsertOwner = async (host) => {
  const isBusinessHost = host.hostInfo?.accountType === 'business';

  const body = {
    external_id: host._id.toString(),
    phone: host.phone || '',
    email: host.email,
    type: isBusinessHost ? 'COMMERCIAL' : 'PERSONAL',
    firstname: host.firstName || '',
    lastname: host.lastName || ''
  };

  // PERSONAL type requires dl_number, dl_state, birth_date, firstname, lastname
  if (!isBusinessHost) {
    const dlNumber = host.driverLicense?.licenseNumber || '';
    const dlState = toStateAbbr(host.driverLicense?.state);
    const birthDate = host.dateOfBirth
      ? new Date(host.dateOfBirth).toISOString().split('T')[0]
      : '';

    // TeqMobility API rejects empty strings for required PERSONAL fields
    if (!dlNumber || !dlState || !birthDate) {
      console.warn('🛡️ TeqMobility: Host missing required PERSONAL owner fields -', {
        hasDlNumber: !!dlNumber,
        hasDlState: !!dlState,
        hasBirthDate: !!birthDate,
        hostId: host._id
      });
      throw new Error('Host profile incomplete for insurance: missing driver license number, state, or date of birth');
    }

    body.dl_number = dlNumber;
    body.dl_state = dlState;
    body.birth_date = birthDate;
  }

  // COMMERCIAL type requires fein
  if (isBusinessHost && host.hostInfo?.taxId) {
    body.fein = host.hostInfo.taxId;
    body.commercial_name = host.hostInfo.businessName || '';
  }

  // Address - for individual hosts, fall back to hostInfo.legalAddress if personal address is missing
  const addr = isBusinessHost
    ? host.hostInfo?.businessAddress
    : (host.address?.street ? host.address : host.hostInfo?.legalAddress);
  if (addr) {
    body.address = {
      line1: addr.street || addr.line1 || '',
      city: addr.city || '',
      state: toStateAbbr(addr.state),
      zip_code: sanitizeZip(addr.zipCode)
    };
  }

  const response = await teqApi.put('/api/v2/owners', body);
  console.log('🛡️ TeqMobility: Owner upserted -', response.data.id);
  return response.data;
};

/**
 * 2. Upsert Vehicle - Creates or updates a vehicle in the fleet
 * PUT /api/v1/vehicles
 */
const upsertVehicle = async (vehicle, ownerId) => {
  const body = {
    vin: vehicle.vin,
    state_registered: toStateAbbr(vehicle.location?.state) || 'FL',
    year: vehicle.year,
    make: vehicle.make,
    model: vehicle.model,
    plate: vehicle.licensePlate || '',
    active: true
  };

  if (ownerId) {
    body.owner_id = ownerId;
  }

  if (vehicle.vehicleValue) {
    body.value_in_cents = Math.round(vehicle.vehicleValue * 100);
    body.market_value_cents = Math.round(vehicle.vehicleValue * 100);
  }

  const response = await teqApi.put('/api/v1/vehicles', body);
  console.log('🛡️ TeqMobility: Vehicle upserted - full response:', JSON.stringify(response.data, null, 2));
  return response.data;
};

/**
 * 3. Change Vehicle Owner - Links a vehicle to an owner
 * POST /api/v1/vehicles/{vin}/switch-owner
 */
const changeVehicleOwner = async (vin, ownerId) => {
  const response = await teqApi.post(`/api/v1/vehicles/${vin}/switch-owner`, {
    owner_id: ownerId
  });
  console.log('🛡️ TeqMobility: Vehicle owner updated for VIN', vin);
  return response.data;
};

/**
 * 4. Start On-Rent Coverage - Starts insurance coverage for a rental
 * POST /api/v1/coverages/on-rent/{vin}/start (current endpoint, legacy path without /start was deprecated 2/14/2025)
 * VIN is a path parameter, body contains usage + optional fields
 * @param {string} vehicleId - TeqMobility vehicle ID (from upsertVehicle response)
 * @param {string} vin - Vehicle VIN (17-char, used as path param)
 */
const startOnRentCoverage = async (vehicleId, vin, driver, vehicle, booking) => {
  // Driver object (required) — uses nested license and address objects per API docs
  // birth_date is required in license object per API docs
  const birthDate = driver.dateOfBirth
    ? new Date(driver.dateOfBirth).toISOString().split('T')[0]
    : '';
  if (!birthDate) {
    console.warn('🛡️ TeqMobility: Driver missing required birth_date for coverage');
  }

  const licenseObj = {
    number: driver.driverLicense?.licenseNumber || '',
    state: toStateAbbr(driver.driverLicense?.state),
    birth_date: birthDate
  };
  if (driver.driverLicense?.expirationDate) {
    licenseObj.expiration_date = new Date(driver.driverLicense.expirationDate).toISOString().split('T')[0];
  }

  const driverObj = {
    firstname: driver.firstName || '',
    lastname: driver.lastName || '',
    email: driver.email || '',
    phone: driver.phone || '',
    license: licenseObj,
    address: {
      line1: driver.address?.street || '',
      city: driver.address?.city || '',
      state: toStateAbbr(driver.address?.state),
      zip_code: sanitizeZip(driver.address?.zipCode)
    }
  };

  const body = {
    usage: 'RIDESHARE',
    external_id: booking._id.toString(),
    driver: driverObj,
    pickup_address: {
      state: toStateAbbr(vehicle.location?.state),
      city: vehicle.location?.city || '',
      zip_code: sanitizeZip(vehicle.location?.zipCode),
      line1: vehicle.location?.address || ''
    }
  };

  console.log(`🛡️ TeqMobility: Starting on-rent coverage - POST /api/v1/coverages/on-rent/${vin}/start`);
  console.log(`🛡️ TeqMobility: Coverage request body:`, JSON.stringify(body, null, 2));

  try {
    const response = await teqApi.post(`/api/v1/coverages/on-rent/${vin}/start`, body);
    console.log(`🛡️ TeqMobility: ✅ Coverage started successfully`);
    console.log(`🛡️ TeqMobility: Coverage response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const respData = err.response?.data;
    console.error(`🛡️ TeqMobility: ❌ Coverage start failed - HTTP ${status}`);
    console.error(`🛡️ TeqMobility: Response:`, JSON.stringify(respData, null, 2));
    throw err;
  }
};

/**
 * 5. Stop On-Rent Coverage - Stops insurance coverage when rental ends
 * POST /api/v1/coverages/on-rent/{coverageId}/stop (confirmed from TeqMobility API docs)
 */
const stopOnRentCoverage = async (coverageId) => {
  console.log(`🛡️ TeqMobility: Stopping on-rent coverage - coverageId=${coverageId}`);

  try {
    const response = await teqApi.post(`/api/v1/coverages/on-rent/${coverageId}/stop`, {});
    console.log(`🛡️ TeqMobility: ✅ Coverage stopped successfully`);
    console.log(`🛡️ TeqMobility: Stop response:`, JSON.stringify(response.data, null, 2));
    return response.data;
  } catch (err) {
    const status = err.response?.status;
    const respData = err.response?.data;
    console.error(`🛡️ TeqMobility: ❌ Coverage stop failed - HTTP ${status}`);
    console.error(`🛡️ TeqMobility: Response:`, JSON.stringify(respData, null, 2));
    throw err;
  }
};

/**
 * Full pickup flow: Upsert Owner → Upsert Vehicle → Change Owner → Start Coverage
 * Non-blocking: returns result or error, never throws
 */
const startRentalCoverage = async (host, driver, vehicle, booking) => {
  if (!isConfigured()) {
    console.log('🛡️ TeqMobility: Not configured, skipping insurance integration');
    return { success: false, reason: 'not_configured' };
  }

  try {
    console.log('🛡️ TeqMobility: Host data -', {
      id: host._id,
      name: `${host.firstName} ${host.lastName}`,
      email: host.email,
      accountType: host.hostInfo?.accountType || 'individual',
      hasDriverLicense: !!host.driverLicense?.licenseNumber,
      hasDOB: !!host.dateOfBirth,
      dlState: host.driverLicense?.state || 'N/A'
    });

    // Step 1: Upsert the host as owner
    const owner = await upsertOwner(host);

    // Step 2: Upsert the vehicle
    const vehicleResult = await upsertVehicle(vehicle, owner.id);

    // Step 3: Ensure vehicle is linked to owner
    if (vehicleResult.owner_id !== owner.id) {
      await changeVehicleOwner(vehicle.vin, owner.id);
    }

    // Step 4: Start on-rent coverage (tries multiple endpoint variants)
    const coverage = await startOnRentCoverage(vehicleResult.id, vehicle.vin, driver, vehicle, booking);

    return {
      success: true,
      coverageId: coverage.id,
      ownerId: owner.id,
      status: coverage.status,
      cardUrl: coverage.card_url || null
    };
  } catch (error) {
    const isProfileIncomplete = error.message?.includes('Host profile incomplete');
    if (isProfileIncomplete) {
      console.warn('🛡️ TeqMobility: Skipping insurance — host profile incomplete (missing driver license or DOB)');
    } else {
      console.error('🛡️ TeqMobility: Error starting rental coverage:', error.response?.data || error.message);
    }
    return {
      success: false,
      reason: isProfileIncomplete ? 'host_profile_incomplete' : 'api_error',
      error: error.response?.data?.message || error.message
    };
  }
};

/**
 * Full return flow: Stop Coverage
 * Non-blocking: returns result or error, never throws
 */
const stopRentalCoverage = async (vinOrCoverageId) => {
  if (!isConfigured()) {
    console.log('🛡️ TeqMobility: Not configured, skipping stop coverage');
    return { success: false, reason: 'not_configured' };
  }

  try {
    const coverage = await stopOnRentCoverage(vinOrCoverageId);
    return {
      success: true,
      coverageId: coverage.id,
      status: coverage.status
    };
  } catch (error) {
    console.error('🛡️ TeqMobility: Error stopping rental coverage:', error.response?.data || error.message);
    return {
      success: false,
      reason: 'api_error',
      error: error.response?.data?.message || error.message
    };
  }
};

module.exports = {
  isConfigured,
  upsertOwner,
  upsertVehicle,
  changeVehicleOwner,
  startOnRentCoverage,
  stopOnRentCoverage,
  startRentalCoverage,
  stopRentalCoverage
};
