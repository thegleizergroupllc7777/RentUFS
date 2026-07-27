// ─────────────────────────────────────────────────────────────────────────────
// ClearDrive (TeqMobility "Driver Vetting") integration — STANDALONE + INERT
//
// This module ONLY knows how to talk to the ClearDrive / Driver-Vetting API.
// It is imported by NOTHING in the live booking / payment / insurance / toll
// flow, and it does absolutely nothing unless CLEARDRIVE_API_KEY is set.
//
// ⇒ Building and deploying this file cannot affect anything live. It is dead
//   code sitting off to the side until we deliberately wire it in (a later,
//   separate step, behind an ON/OFF switch).
//
// All configuration comes from environment variables — no secrets in code:
//   CLEARDRIVE_API_KEY   — the `x-api-key` credential (sandbox key for now)
//   CLEARDRIVE_BASE_URL  — API base; defaults to the SANDBOX, swap to prod later
//   CLEARDRIVE_FLOW      — verification flow; defaults to PERSONAL (car rental)
// ─────────────────────────────────────────────────────────────────────────────

const axios = require('axios');

const BASE_URL = process.env.CLEARDRIVE_BASE_URL || 'https://driver-vetting.sandbox.teqmobility.com/api';
const API_KEY = process.env.CLEARDRIVE_API_KEY || '';
const DEFAULT_FLOW = process.env.CLEARDRIVE_FLOW || 'PERSONAL';

// True only when a key is present. Everything below no-ops safely when false,
// so the module is harmless until the owner adds the key on Render.
const isConfigured = () => !!API_KEY;

// Send the key BOTH ways (Bearer + x-api-key) — the docs list both as valid
// auth schemes, and this matches the working insurance integration (teqmobility.js)
// which sends both for maximum compatibility.
const client = () => axios.create({
  baseURL: BASE_URL,
  timeout: 15000,
  headers: {
    'Authorization': `Bearer ${API_KEY}`,
    'x-api-key': API_KEY,
    'content-type': 'application/json',
    'accept': 'application/json'
  }
});

const fail = (err) => ({
  success: false,
  error: err.response?.data?.message || err.message,
  code: err.response?.data?.code || null
});

// Register a driver as an "Applicant". `external_id` makes this idempotent —
// pass the RentUFS user id, so a given driver is only ever ONE applicant and we
// never create duplicates on repeat bookings. (email/firstname/lastname required.)
// → { success, applicant } | { success:false, error, code }
const createApplicant = async ({ email, firstname, lastname, dl_number, dl_state, dl_expiration, birth_date, external_id }) => {
  if (!isConfigured()) return { success: false, error: 'ClearDrive not configured' };
  try {
    const body = { email, firstname, lastname };
    if (dl_number) body.dl_number = dl_number;
    if (dl_state) body.dl_state = dl_state;
    if (dl_expiration) body.dl_expiration = dl_expiration;
    if (birth_date) body.birth_date = birth_date;
    if (external_id) body.external_id = external_id;
    const { data } = await client().post('/v1/applicants', body);
    return { success: true, applicant: data };
  } catch (err) {
    return fail(err);
  }
};

// Create the verification URL the driver completes (license photo + video
// selfie). Can be embedded in the booking page OR emailed (send_email).
// → { success, url, destination_email } | { success:false, error, code }
const createVerificationUrl = async ({ applicant_id, flow = DEFAULT_FLOW, send_email = false, success_url, failure_url }) => {
  if (!isConfigured()) return { success: false, error: 'ClearDrive not configured' };
  try {
    const body = { applicant_id, flow };
    if (send_email) body.send_email = true;
    if (success_url) body.success_url = success_url;
    if (failure_url) body.failure_url = failure_url;
    const { data } = await client().post('/v1/verifications/url', body);
    return { success: true, url: data.url, destination_email: data.destination_email };
  } catch (err) {
    return fail(err);
  }
};

// Read a driver's latest verification result (PASSED / FAILED / IN_PROGRESS /
// NOT_STARTED). Looks the applicant up via the documented list endpoint with
// includes=latest_verification, searching by external_id (or DL number).
// → { success, status, verification, applicant } | { success:false, error }
const getLatestVerification = async ({ external_id, dl_number }) => {
  if (!isConfigured()) return { success: false, error: 'ClearDrive not configured' };
  try {
    const search = external_id || dl_number || '';
    const { data } = await client().get('/v1/applicants', {
      params: { search, includes: 'latest_verification', pagesize: 1 }
    });
    const applicant = (data.items && data.items[0]) || null;
    const verification = applicant?.includes?.latest_verification || null;
    return { success: true, status: verification?.status || 'NOT_STARTED', verification, applicant };
  } catch (err) {
    return fail(err);
  }
};

module.exports = {
  isConfigured,
  createApplicant,
  createVerificationUrl,
  getLatestVerification,
  BASE_URL,
  DEFAULT_FLOW
};
