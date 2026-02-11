const axios = require('axios');

// TeqMobility Dynamic Insurance API client
const TEQMOBILITY_BASE_URL = process.env.TEQMOBILITY_API_URL || 'https://insurance.sandbox.teqmobility.com';
const TEQMOBILITY_API_KEY = process.env.TEQMOBILITY_API_KEY || '';

const teqApi = axios.create({
  baseURL: TEQMOBILITY_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

// Add auth header to every request
// TeqMobility uses x-api-key header for authentication
teqApi.interceptors.request.use((config) => {
  if (TEQMOBILITY_API_KEY) {
    config.headers['x-api-key'] = TEQMOBILITY_API_KEY;
  }
  console.log(`🛡️ TeqMobility: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);
  if (config.data) {
    console.log('🛡️ TeqMobility Request Body:', JSON.stringify(config.data, null, 2));
  }
  return config;
});

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
    name: isBusinessHost
      ? (host.hostInfo.businessName || `${host.firstName} ${host.lastName}`)
      : `${host.firstName} ${host.lastName}`,
    phone: host.phone || '',
    email: host.email,
    type: isBusinessHost ? 'COMMERCIAL' : 'PERSONAL',
    firstname: host.firstName || '',
    lastname: host.lastName || ''
  };

  // PERSONAL type requires dl_number, dl_state, birth_date, firstname, lastname
  if (!isBusinessHost) {
    body.dl_number = host.driverLicense?.licenseNumber || '';
    body.dl_state = host.driverLicense?.state || '';
    body.birth_date = host.dateOfBirth
      ? new Date(host.dateOfBirth).toISOString().split('T')[0]
      : '';
  }

  // COMMERCIAL type requires fein
  if (isBusinessHost && host.hostInfo?.taxId) {
    body.fein = host.hostInfo.taxId;
    body.commercial_name = host.hostInfo.businessName || '';
  }

  // Address
  const addr = isBusinessHost ? host.hostInfo?.businessAddress : host.address;
  if (addr) {
    body.address = {
      line1: addr.street || addr.line1 || '',
      city: addr.city || '',
      state: addr.state || '',
      zip_code: addr.zipCode || ''
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
    state_registered: vehicle.location?.state || 'FL',
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
  console.log('🛡️ TeqMobility: Vehicle upserted -', response.data.id);
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
 * POST /api/v1/coverages/on-rent/{vin}
 */
const startOnRentCoverage = async (vin, driver, vehicle, booking) => {
  const body = {
    usage: 'RIDESHARE',
    external_id: booking._id.toString(),
    driver: {
      firstname: driver.firstName,
      lastname: driver.lastName,
      email: driver.email,
      phone: driver.phone || '',
      license: {
        number: driver.driverLicense?.licenseNumber || '',
        state: driver.driverLicense?.state || '',
      },
      address: {
        line1: driver.address?.street || '',
        city: driver.address?.city || '',
        state: driver.address?.state || '',
        zip_code: driver.address?.zipCode || ''
      }
    },
    pickup_address: {
      state: vehicle.location?.state || '',
      city: vehicle.location?.city || '',
      zip_code: vehicle.location?.zipCode || '',
      line1: vehicle.location?.address || ''
    }
  };

  // Add driver birth_date if available
  if (driver.dateOfBirth) {
    body.driver.license.birth_date = new Date(driver.dateOfBirth).toISOString().split('T')[0];
  }

  // Add license expiration if available
  if (driver.driverLicense?.expirationDate) {
    body.driver.license.expiration_date = new Date(driver.driverLicense.expirationDate).toISOString().split('T')[0];
  }

  const response = await teqApi.post(`/api/v1/coverages/on-rent/${vin}`, body);
  console.log('🛡️ TeqMobility: On-rent coverage started -', response.data.id, 'Status:', response.data.status);
  return response.data;
};

/**
 * 5. Stop On-Rent Coverage - Stops insurance coverage when rental ends
 * POST /api/v1/coverages/on-rent/{vin_or_coverage_id}/stop
 */
const stopOnRentCoverage = async (vinOrCoverageId) => {
  const response = await teqApi.post(`/api/v1/coverages/on-rent/${vinOrCoverageId}/stop`, {});
  console.log('🛡️ TeqMobility: On-rent coverage stopped for', vinOrCoverageId);
  return response.data;
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

    // Step 4: Start on-rent coverage
    const coverage = await startOnRentCoverage(vehicle.vin, driver, vehicle, booking);

    return {
      success: true,
      coverageId: coverage.id,
      ownerId: owner.id,
      status: coverage.status,
      cardUrl: coverage.card_url || null
    };
  } catch (error) {
    console.error('🛡️ TeqMobility: Error starting rental coverage:', error.response?.data || error.message);
    return {
      success: false,
      reason: 'api_error',
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
