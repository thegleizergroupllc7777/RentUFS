/**
 * probeWheelbaseRentedStatus.js — Diagnostic for the marketplace "Rented" badge.
 *
 * For every Vehicle with bookingProvider === 'wheelbase', this script:
 *   1. Calls Outdoorsy's availability API the same way wheelbaseAvailability.js does
 *   2. Prints the raw response status, body, and interpreted result
 *   3. Summarizes how many vehicles show as rented today
 *
 * If the badge isn't appearing on cars that ARE booked, this script makes
 * the cause obvious: either the API is returning empty for them (so the
 * code is correct and they aren't booked TODAY), or the API is failing
 * (auth, endpoint change, etc.) and we're silently treating everything as
 * available.
 *
 * USAGE:
 *   cd server
 *   node scripts/probeWheelbaseRentedStatus.js
 *
 *   # Check a future date instead of today (e.g. to see upcoming bookings):
 *   node scripts/probeWheelbaseRentedStatus.js 2026-06-01
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Vehicle = require('../models/Vehicle');

const ENDPOINT = 'https://api.outdoorsy.com/v0/availability';
const WIDGET_ORIGIN = 'https://widget.wheelbasepro.com';

async function probe(rentalId, dateIso) {
  try {
    const res = await axios.get(ENDPOINT, {
      params: { rental_id: rentalId, from: dateIso, to: dateIso },
      headers: {
        Accept: '*/*',
        Origin: WIDGET_ORIGIN,
        Referer: `${WIDGET_ORIGIN}/`,
        'User-Agent': 'Mozilla/5.0 (compatible; RentUFS marketplace)'
      },
      timeout: 8000,
      validateStatus: () => true
    });
    return { ok: true, status: res.status, data: res.data };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

async function run() {
  const dateArg = process.argv[2];
  const dateIso = dateArg || new Date().toISOString().split('T')[0];

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set.');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI);

  const vehicles = await Vehicle.find({ bookingProvider: 'wheelbase' })
    .select('_id make model year nickname wheelbase')
    .lean();

  console.log(`\nChecking ${vehicles.length} Wheelbase vehicles for date: ${dateIso}\n`);

  let rentedCount = 0;
  let errorCount = 0;
  let noRentalIdCount = 0;

  for (const v of vehicles) {
    const label = `${v.nickname || `${v.year} ${v.make} ${v.model}`} (${v._id})`;
    const rentalId = v.wheelbase?.rentalId;

    if (!rentalId) {
      console.log(`⚠️  ${label} — NO wheelbase.rentalId set`);
      noRentalIdCount++;
      continue;
    }

    const result = await probe(rentalId, dateIso);
    if (!result.ok) {
      console.log(`❌ ${label} rentalId=${rentalId} — request failed: ${result.error}`);
      errorCount++;
      continue;
    }

    const { status, data } = result;
    const isArray = Array.isArray(data);
    const rented = status === 200 && isArray && data.length > 0;
    const summary = isArray
      ? `array(${data.length} ranges)`
      : typeof data === 'object'
        ? `object: ${JSON.stringify(data).slice(0, 100)}`
        : `${typeof data}: ${String(data).slice(0, 80)}`;

    if (rented) rentedCount++;
    if (status !== 200 || !isArray) errorCount++;

    const icon = rented ? '🔴 RENTED' : status !== 200 ? `❌ HTTP ${status}` : !isArray ? '❌ NOT ARRAY' : '🟢 available';
    console.log(`${icon}  ${label}  rentalId=${rentalId}  →  ${summary}`);
  }

  console.log(`\n── SUMMARY ──`);
  console.log(`  Total vehicles:           ${vehicles.length}`);
  console.log(`  Marked rented today:      ${rentedCount}`);
  console.log(`  API errors / bad shape:   ${errorCount}`);
  console.log(`  Missing rentalId:         ${noRentalIdCount}`);
  console.log(`  Available:                ${vehicles.length - rentedCount - errorCount - noRentalIdCount}`);

  if (errorCount > 0) {
    console.log(`\n⚠️  ${errorCount} vehicles errored. If this matches the count you expect to be rented,`);
    console.log(`   the Outdoorsy API likely changed (auth, endpoint, response shape).`);
  }

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
