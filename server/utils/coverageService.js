// ─────────────────────────────────────────────────────────────────────────────
// Coverage service — ONE entry point for insurance across both carriers
// (TeqMobility + Rentid/Vishal). It routes by the vehicle's state (carrierRouting)
// and calls the chosen carrier, returning a uniform result the booking flow stores.
//
// WHY: bookings.js can call startCoverage/stopCoverage/getCoverageCard here instead
// of TeqMobility directly, and the right carrier is used automatically.
//
// SAFETY:
//   • While carrier routing is OFF (the default), resolveCarrier() always returns
//     TeqMobility, so startCoverage() does EXACTLY what the code does today.
//   • If a state routes to Rentid but Rentid isn't configured (no API key), we
//     fall back to TeqMobility — so a half-set-up Rentid can never break coverage.
//   • This never decides whether a booking is allowed. The existing insurance
//     gate still enforces "coverage must succeed or the booking is blocked",
//     identically for both carriers.
//   • Additive/dormant until bookings.js is wired to call it.
// ─────────────────────────────────────────────────────────────────────────────

const teq = require('./teqmobility');
const rentid = require('./rentid');
const { resolveCarrier, getCarrierRoutingSettings, CARRIERS } = require('./carrierRouting');
const { zoneForState } = require('./vehicleTimezone');

// ── small formatters ─────────────────────────────────────────────────────────
function toE164(phone) {
  const raw = String(phone || '').trim();
  if (raw.startsWith('+')) return raw.replace(/[^\d+]/g, '');
  const d = raw.replace(/\D/g, '');
  if (!d) return null;
  if (d.length === 10) return '+1' + d;
  if (d.length === 11 && d[0] === '1') return '+' + d;
  return '+' + d;
}
function toYMD(date) {
  if (!date) return null;
  const d = new Date(date);
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function vehicleState(vehicle) {
  return (vehicle && vehicle.location && vehicle.location.state) || null;
}

// Map a RentUFS driver object → Rentid's Create Driver body. Phone, email and a
// full address are required before a policy, so always send all three.
function buildRentidDriver(driver) {
  const lic = (driver && driver.driverLicense) || {};
  const addr = (driver && driver.address) || {};
  const body = {
    first_name: driver.firstName,
    last_name: driver.lastName,
    date_of_birth: toYMD(driver.dateOfBirth),
    license: { number: lic.licenseNumber, state: lic.state },
    phone: toE164(driver.phone),
    email: driver.email,
    address: {
      line1: addr.street,
      city: addr.city,
      state: addr.state,
      postal_code: addr.zipCode
    }
  };
  if (addr.apt) body.address.line2 = addr.apt;
  if (driver && driver._id) body.reference_id = String(driver._id);
  return body;
}

// Start coverage via Rentid: register driver → create an open-ended policy
// starting now (we end it explicitly at return, mirroring TeqMobility).
async function startRentidCoverage(driver, vehicle, booking, settings, context) {
  const planId = settings.vishalPlanId;
  if (!planId) {
    return { success: false, carrier: CARRIERS.RENTID, error: 'No Rentid plan configured (vishalPlanId).' };
  }
  const dres = await rentid.createDriver(buildRentidDriver(driver));
  if (!dres.ok) {
    return { success: false, carrier: CARRIERS.RENTID, error: dres.message, errorCode: dres.errorCode };
  }
  const driverId = dres.data && dres.data.id;

  const state = String(vehicleState(vehicle) || '').toUpperCase();
  const usageType = (booking && booking.insurance && String(booking.insurance.type).toLowerCase() === 'rideshare')
    ? 'rideshare' : 'personal';
  const payload = {
    plan_id: planId,
    driver_id: driverId,
    vehicle: { vin: vehicle.vin, year: vehicle.year, make: vehicle.make, model: vehicle.model },
    coverage_state: state,
    timezone: zoneForState(state),
    starts_at: new Date().toISOString(),       // active now; open-ended (no ends_at)
    usage_type: usageType
  };
  const ref = (booking && (booking.reservationId || booking._id));
  if (ref) { payload.reference_id = String(ref); payload.metadata = { reservation_id: String(ref) }; }
  if (context && context.webhookUrl) payload.webhook_url = context.webhookUrl;

  const pres = await rentid.createPolicy(payload);
  if (!pres.ok) {
    return { success: false, carrier: CARRIERS.RENTID, driverId, error: pres.message, errorCode: pres.errorCode };
  }
  const policy = pres.data || {};
  return {
    success: true,
    carrier: CARRIERS.RENTID,
    coverageId: policy.id,   // unified: policy id
    policyId: policy.id,
    driverId,
    status: policy.status,   // 'active' | 'scheduled'
    cardUrl: null,           // fetched lazily once active (proof-of-insurance)
    error: null
  };
}

// ── Public API ───────────────────────────────────────────────────────────────

// Start coverage for a rental. Routes by the vehicle's state; falls back to
// TeqMobility whenever routing is off, the state isn't Rentid's, or Rentid isn't
// configured. Returns a uniform result for the caller to store on the booking.
async function startCoverage(host, driver, vehicle, booking, context = {}) {
  let carrier = CARRIERS.TEQMOBILITY;
  try {
    const settings = await getCarrierRoutingSettings();
    carrier = resolveCarrier(vehicleState(vehicle), settings).carrier;
    if (carrier === CARRIERS.RENTID && rentid.isConfigured()) {
      return await startRentidCoverage(driver, vehicle, booking, settings, context);
    }
  } catch (e) {
    // Any routing error → safe default below (TeqMobility, today's behavior).
    carrier = CARRIERS.TEQMOBILITY;
  }
  const res = await teq.startRentalCoverage(host, driver, vehicle, booking);
  return { ...res, carrier: CARRIERS.TEQMOBILITY };
}

// Stop coverage. Routes by the carrier recorded on the booking.
async function stopCoverage(booking, opts = {}) {
  const carrier = booking && booking.insuranceCarrier;
  if (carrier === CARRIERS.RENTID) {
    const r = (booking && booking.rentid) || {};
    if (!r.policyId) return { success: false, carrier, error: 'No Rentid policy on booking.' };
    const res = r.status === 'scheduled'
      ? await rentid.cancelPolicy(r.policyId)
      : await rentid.endPolicy(r.policyId, opts);
    return { success: res.ok, carrier, data: res.data, status: res.data && res.data.status, error: res.ok ? null : res.message };
  }
  const vin = booking && booking.vehicle && booking.vehicle.vin;
  const coverageId = booking && booking.teqMobility && booking.teqMobility.coverageId;
  const res = await teq.stopRentalCoverage({ coverageId, vin });
  return { ...res, carrier: CARRIERS.TEQMOBILITY };
}

// Fetch the renter's insurance card. Routes by the carrier on the booking.
//   TeqMobility → { success, carrier, cardUrl }
//   Rentid      → { success, carrier, documentBase64, mimeType }  (a PDF ID card)
async function getCoverageCard(booking) {
  const carrier = booking && booking.insuranceCarrier;
  if (carrier === CARRIERS.RENTID) {
    const r = (booking && booking.rentid) || {};
    if (!r.policyId) return { success: false, carrier, error: 'No Rentid policy on booking.' };
    const res = await rentid.getProofOfInsurance(r.policyId);
    if (!res.ok) return { success: false, carrier, error: res.message };
    return {
      success: true,
      carrier,
      documentBase64: res.data && res.data.content_base64,
      mimeType: (res.data && res.data.mime_type) || 'application/pdf'
    };
  }
  const vin = booking && booking.vehicle && booking.vehicle.vin;
  const coverageId = booking && booking.teqMobility && booking.teqMobility.coverageId;
  const cardUrl = await teq.fetchCoverageCardUrl(coverageId, vin);
  return { success: !!cardUrl, carrier: CARRIERS.TEQMOBILITY, cardUrl };
}

module.exports = {
  startCoverage,
  stopCoverage,
  getCoverageCard,
  buildRentidDriver,
  toE164,
  toYMD
};
