/**
 * Server-side vehicle-timezone helper for notification timing.
 *
 * Reservation times are stored as a plain "HH:MM" wall-clock string plus the
 * trip dates. The return-reminder and overdue-SMS schedulers need the REAL
 * instant a car is due back so they don't fire early. Historically they used
 * `endDate.setHours(...)`, which resolves in the SERVER's timezone (UTC on
 * Render) — so a California drop-off of "10:00 PM PT" was treated as 10 PM UTC
 * and the renter got "you're overdue" hours early.
 *
 * This resolves the drop-off in the VEHICLE's local timezone (derived from its
 * state), daylight-saving-accurate via Intl — the same DST-safe technique used
 * for Eastern in lateReturn.js, generalized to any US zone.
 *
 * Presentation/timing only: nothing here charges, books, insures, or calls an
 * external API. It just answers "what UTC instant is this car due back?"
 */

const STATE_TZ = {
  // Pacific
  CA: 'America/Los_Angeles', WA: 'America/Los_Angeles', OR: 'America/Los_Angeles', NV: 'America/Los_Angeles',
  // Mountain (Arizona has no DST — its own zone)
  CO: 'America/Denver', UT: 'America/Denver', NM: 'America/Denver', MT: 'America/Denver', WY: 'America/Denver', ID: 'America/Denver',
  AZ: 'America/Phoenix',
  // Central
  TX: 'America/Chicago', IL: 'America/Chicago', IA: 'America/Chicago', MN: 'America/Chicago', MO: 'America/Chicago',
  WI: 'America/Chicago', AR: 'America/Chicago', LA: 'America/Chicago', OK: 'America/Chicago', KS: 'America/Chicago',
  NE: 'America/Chicago', SD: 'America/Chicago', ND: 'America/Chicago', MS: 'America/Chicago', AL: 'America/Chicago',
  TN: 'America/Chicago', KY: 'America/Chicago'
  // Everything else defaults to Eastern (below).
};
const DEFAULT_TZ = 'America/New_York';

function zoneForState(state) {
  if (!state) return DEFAULT_TZ;
  return STATE_TZ[String(state).trim().toUpperCase()] || DEFAULT_TZ;
}

// Minutes a timezone is offset from UTC at a given instant (DST-accurate).
function offsetMinutes(instant, tz) {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(instant).reduce((a, x) => (a[x.type] = x.value, a), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUtc - instant.getTime()) / 60000;
}

/**
 * The real UTC instant a booking is due back, resolved in the vehicle's local
 * timezone. endDate is midnight-UTC of the drop-off day; dropoffTime is the
 * wall clock in that local zone. Falls back to Eastern if the state is unknown.
 */
function returnMomentForBooking(booking) {
  const tz = zoneForState(booking?.vehicle?.location?.state);
  const base = new Date(booking.endDate);
  const [h, m] = String(booking.dropoffTime || '10:00').split(':').map(Number);
  const hours = Number.isFinite(h) ? h : 10;
  const mins = Number.isFinite(m) ? m : 0;
  const y = base.getUTCFullYear(), mo = base.getUTCMonth(), d = base.getUTCDate();
  const guess = Date.UTC(y, mo, d, hours, mins, 0);
  let result = guess - offsetMinutes(new Date(guess), tz) * 60000;
  // One re-check pins it down across the rare DST-transition boundary.
  result = guess - offsetMinutes(new Date(result), tz) * 60000;
  return new Date(result);
}

module.exports = { zoneForState, returnMomentForBooking };
