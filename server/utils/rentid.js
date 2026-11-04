// ─────────────────────────────────────────────────────────────────────────────
// Rentid (Vishal) Protection API client — a SECOND insurance carrier for RentUFS.
//
// This is the low-level client for Rentid's "Protection" product (per-rental
// insurance): it talks to the Rentid API and verifies their webhooks. It is the
// direct counterpart of utils/teqmobility.js.
//
// SAFETY / STATUS:
//   • This file is PURELY ADDITIVE. On its own it is dormant — nothing in the
//     booking / coverage / payout / Stripe / tolls flow calls it yet.
//   • Every function no-ops cleanly when the API key isn't configured
//     (isConfigured() === false), so deploying it changes nothing.
//   • Sandbox-first: point RENTID_API_KEY at a sandbox key (ent_test_…) and all
//     calls hit Rentid's test environment — fake data, never billed.
//
// CONFIG (environment variables, set on the server — never hardcoded):
//   RENTID_API_URL        Base URL. Defaults to https://api.rentid.io
//   RENTID_API_KEY        Your API key. Sandbox (ent_test_…) or live. Sent as the
//                         X-API-Key header. Absent ⇒ this client is "not configured".
//   RENTID_WEBHOOK_SECRET Webhook signing secret (whsec_…) from the Developers ▸
//                         Webhooks tab. Used only to VERIFY inbound webhooks.
//
// Docs this implements: Rentid "Protection" + "Webhooks" API documentation.
// ─────────────────────────────────────────────────────────────────────────────

const crypto = require('crypto');

const RENTID_API_URL = (process.env.RENTID_API_URL || 'https://api.rentid.io').replace(/\/+$/, '');
const RENTID_API_KEY = process.env.RENTID_API_KEY || '';
const RENTID_WEBHOOK_SECRET = process.env.RENTID_WEBHOOK_SECRET || '';

// True only when an API key is present. Everything that talks to Rentid checks
// this first, so an unconfigured install is a safe no-op.
function isConfigured() {
  return !!RENTID_API_KEY;
}

// ── Core request helper ──────────────────────────────────────────────────────
// Returns a normalized result; NEVER throws into the caller:
//   { ok: true,  status, data, message }
//   { ok: false, status, data, errorType, errorCode, errors, message, configured?, networkError? }
// (Rentid wraps every response in { success, message, timestamp, status_code, data, error_type?, error_code?, errors? }.)
async function rentidRequest(method, path, body) {
  if (!isConfigured()) {
    return { ok: false, configured: false, message: 'Rentid is not configured (RENTID_API_KEY not set).' };
  }
  const url = `${RENTID_API_URL}${path}`;
  const headers = { 'X-API-Key': RENTID_API_KEY, Accept: 'application/json' };
  const opts = { method, headers };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  try {
    const res = await fetch(url, opts);
    let json = null;
    try { json = await res.json(); } catch (_) { json = null; }
    if (json && json.success === true) {
      return { ok: true, status: res.status, data: json.data, message: json.message };
    }
    return {
      ok: false,
      status: res.status,
      data: json ? json.data : undefined,
      errorType: json ? json.error_type : undefined,
      errorCode: json ? json.error_code : undefined,
      errors: json ? json.errors : undefined,
      message: (json && json.message) || `Rentid HTTP ${res.status}`
    };
  } catch (err) {
    // Network / transport failure (carrier unreachable). The router decides what
    // to do with this — see the "carrier unreachable" failure plan.
    return { ok: false, networkError: true, message: err.message };
  }
}

// ── Plans & coverage areas ───────────────────────────────────────────────────
// List the plans this account can use (not billed). data = { data: [plan…], has_more }.
function listPlans() {
  return rentidRequest('GET', '/api/v1/protection/plans');
}

// List the two-letter state codes a plan can be written in (not billed).
// data = { plan_id, coverage_areas: ["CA","GA",…] }. This drives state routing.
function listCoverageAreas(planId) {
  return rentidRequest('GET', `/api/v1/protection/plans/${encodeURIComponent(planId)}/coverage-areas`);
}

// ── Vehicle eligibility ──────────────────────────────────────────────────────
// Check whether a VIN can be covered under a plan (billed per call on a LIVE key;
// sandbox is free). Answers are reused for 24h. data = { plan_id, vin, eligible,
// requirements{…}, checked_at }.
function checkVehicleEligibility(planId, vin) {
  return rentidRequest('POST', '/api/v1/protection/vehicle-eligibility-checks', {
    plan_id: planId,
    vin: String(vin || '').toUpperCase()
  });
}

// ── Drivers ──────────────────────────────────────────────────────────────────
// Create a driver, or return the existing one with the same license (never billed).
// 201 = created, 200 = existing returned. A 409 DRIVER_IDENTITY_MISMATCH means the
// license matches but name/DOB differ. A policy needs phone + email + full address,
// and those can ONLY be set at create time — so always send all three.
//   driver = { first_name, last_name, date_of_birth:'YYYY-MM-DD',
//              license:{ number, state }, phone, email,
//              address:{ line1, line2?, city, state, postal_code }, reference_id? }
function createDriver(driver) {
  return rentidRequest('POST', '/api/v1/protection/drivers', driver);
}

function getDriver(driverId) {
  return rentidRequest('GET', `/api/v1/protection/drivers/${encodeURIComponent(driverId)}`);
}

// ── Policies ─────────────────────────────────────────────────────────────────
// Create a policy = START coverage. Billed by covered day on a LIVE key.
//   policy = { plan_id, driver_id, vehicle:{ vin, year?, make?, model? },
//              coverage_state (2-letter, must be in the plan's coverage areas),
//              timezone (IANA, e.g. 'America/Los_Angeles'),
//              starts_at (ISO 8601 w/ offset, ≤5 min in the past),
//              ends_at? (ISO 8601, after starts_at; omit/null = open-ended),
//              usage_type ('personal'|'rideshare', in the plan's usage_types),
//              odometer_start? (required only if billed by the mile),
//              reference_id? (e.g. our reservationId), metadata?,
//              webhook_url? (https:// — gets this policy's status events) }
// Returns the policy object: status 'active' if it starts now, else 'scheduled'.
function createPolicy(policy) {
  return rentidRequest('POST', '/api/v1/protection/policies', policy);
}

function getPolicy(policyId) {
  return rentidRequest('GET', `/api/v1/protection/policies/${encodeURIComponent(policyId)}`);
}

// Cancel a SCHEDULED policy before it starts (never billed). Body must be empty.
// Once started, use endPolicy instead (cancel then fails POLICY_ALREADY_STARTED).
function cancelPolicy(policyId) {
  return rentidRequest('POST', `/api/v1/protection/policies/${encodeURIComponent(policyId)}/cancel`, {});
}

// End an ACTIVE policy = STOP coverage (never billed per call).
//   opts = { ended_at? (ISO 8601; defaults to now), odometer_end? | miles_driven? }
// Send odometer_end OR miles_driven, never both; one is required only when the
// account charges by the mile.
function endPolicy(policyId, opts = {}) {
  const body = {};
  if (opts.ended_at) body.ended_at = opts.ended_at;
  if (opts.odometer_end != null) body.odometer_end = opts.odometer_end;
  else if (opts.miles_driven != null) body.miles_driven = opts.miles_driven;
  return rentidRequest('POST', `/api/v1/protection/policies/${encodeURIComponent(policyId)}/end`, body);
}

// The renter's insurance ID card for an ACTIVE policy. Returns
// { policy_id, document_type:'id_card', mime_type:'application/pdf',
//   content_base64 }. Sandbox returns a sample card watermarked
// "SAMPLE – NOT INSURANCE". Before start / after end ⇒ 409 POLICY_NOT_ACTIVE.
function getProofOfInsurance(policyId) {
  return rentidRequest('GET', `/api/v1/protection/policies/${encodeURIComponent(policyId)}/proof-of-insurance`);
}

// ── Webhook signature verification ───────────────────────────────────────────
// Verify an inbound Rentid webhook BEFORE trusting it. Follows Rentid's scheme:
// X-Rentid-Signature: t=<unix seconds>,v1=<hex HMAC-SHA256 of "<t>.<raw body>">.
// The HMAC key is the WHOLE signing secret (incl. the whsec_ prefix) as UTF-8.
// During a 24h secret rotation the header carries two v1 values — accept if ANY
// matches. `rawBody` MUST be the exact bytes received (a Buffer or raw string);
// re-serialized JSON will not match.
function verifyWebhookSignature(rawBody, signatureHeader, secret = RENTID_WEBHOOK_SECRET) {
  try {
    if (!secret || !signatureHeader || rawBody == null) return false;
    let timestamp = null;
    const signatures = [];
    for (const part of String(signatureHeader).split(',')) {
      const trimmed = part.trim();
      const at = trimmed.indexOf('=');
      if (at === -1) continue;
      const key = trimmed.slice(0, at);
      const value = trimmed.slice(at + 1);
      if (key === 't') timestamp = value;
      else if (key === 'v1' && value) signatures.push(value);
    }
    if (!timestamp || !/^\d+$/.test(timestamp) || signatures.length === 0) return false;

    // Reject replays: timestamp must be within 5 minutes of our clock.
    const TOLERANCE_SECONDS = 5 * 60;
    if (Math.abs(Date.now() / 1000 - Number(timestamp)) > TOLERANCE_SECONDS) return false;

    const expected = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.`)
      .update(rawBody)
      .digest();

    return signatures.some((candidate) => {
      let received;
      try { received = Buffer.from(candidate, 'hex'); } catch (_) { return false; }
      return received.length === expected.length && crypto.timingSafeEqual(received, expected);
    });
  } catch (_) {
    return false;
  }
}

// Protection policy webhook event names (the only policy events Rentid sends).
const POLICY_EVENTS = {
  SCHEDULED: 'protection_policy.scheduled',
  ACTIVATED: 'protection_policy.activated',
  ENDED: 'protection_policy.ended',
  CANCELLED: 'protection_policy.cancelled',
  FAILED: 'protection_policy.failed'
};

module.exports = {
  isConfigured,
  RENTID_API_URL,
  // Plans / coverage
  listPlans,
  listCoverageAreas,
  // Eligibility
  checkVehicleEligibility,
  // Drivers
  createDriver,
  getDriver,
  // Policies (start / stop / read / card)
  createPolicy,
  getPolicy,
  cancelPolicy,
  endPolicy,
  getProofOfInsurance,
  // Webhooks
  verifyWebhookSignature,
  POLICY_EVENTS
};
