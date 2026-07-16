/**
 * Reservation-time timezone helpers (DISPLAY ONLY).
 *
 * Every stored pickup/drop-off time is a plain "HH:MM" wall-clock string that
 * means the LOCAL time where the car lives. Historically the app showed that
 * string as-is, which everyone read in their own timezone — so a California
 * renter and a New York dispatcher could read the same "10 PM" as two different
 * real moments. These helpers show the time in the car's real local timezone
 * (with a label), plus the Eastern equivalent in parentheses so an Eastern-based
 * dispatcher instantly understands it too.
 *
 * IMPORTANT: this is presentation only. It does NOT change any stored value and
 * is not used by any charging, insurance, payout, or coverage logic.
 *
 * Pacific / Mountain / Central all observe daylight saving on the SAME dates as
 * Eastern, so a fixed hour offset from Eastern is exact for them year-round.
 * (Arizona doesn't observe DST, so its Eastern-equivalent hint can be off by an
 * hour in summer — a cosmetic edge on the parenthetical only.)
 */

const ZONE_ET = { label: 'ET', hoursFromET: 0 };
const ZONE_CT = { label: 'CT', hoursFromET: -1 };
const ZONE_MT = { label: 'MT', hoursFromET: -2 };
const ZONE_PT = { label: 'PT', hoursFromET: -3 };

// State (2-letter) → operating timezone. Anything not listed defaults to Eastern.
const STATE_ZONES = {
  // Pacific
  CA: ZONE_PT, WA: ZONE_PT, OR: ZONE_PT, NV: ZONE_PT,
  // Mountain (Arizona folded in; see note above)
  CO: ZONE_MT, UT: ZONE_MT, NM: ZONE_MT, MT: ZONE_MT, WY: ZONE_MT, ID: ZONE_MT, AZ: ZONE_MT,
  // Central
  TX: ZONE_CT, IL: ZONE_CT, IA: ZONE_CT, MN: ZONE_CT, MO: ZONE_CT, WI: ZONE_CT,
  AR: ZONE_CT, LA: ZONE_CT, OK: ZONE_CT, KS: ZONE_CT, NE: ZONE_CT, SD: ZONE_CT,
  ND: ZONE_CT, MS: ZONE_CT, AL: ZONE_CT, TN: ZONE_CT, KY: ZONE_CT,
  // Eastern (explicit — everything else also defaults here)
  NY: ZONE_ET, NJ: ZONE_ET, PA: ZONE_ET, GA: ZONE_ET, FL: ZONE_ET, NC: ZONE_ET,
  SC: ZONE_ET, VA: ZONE_ET, MD: ZONE_ET, DE: ZONE_ET, CT: ZONE_ET, MA: ZONE_ET,
  ME: ZONE_ET, NH: ZONE_ET, VT: ZONE_ET, RI: ZONE_ET, OH: ZONE_ET, MI: ZONE_ET,
  IN: ZONE_ET, WV: ZONE_ET, DC: ZONE_ET
};

export function zoneForState(state) {
  if (!state) return ZONE_ET;
  return STATE_ZONES[String(state).trim().toUpperCase()] || ZONE_ET;
}

function to12(h, m) {
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

/**
 * Format a "HH:MM" time in the car's local timezone, with the Eastern
 * equivalent appended in parentheses when the car isn't already Eastern.
 *   formatTimeWithZone('22:00', 'CA') -> "10:00 PM PT (1:00 AM ET next day)"
 *   formatTimeWithZone('22:00', 'GA') -> "10:00 PM ET"
 * Falls back gracefully to the plain local label if anything is off.
 */
export function formatTimeWithZone(time, state) {
  const t = time || '10:00';
  const parts = String(t).split(':').map(Number);
  const h = parts[0];
  const m = parts[1] || 0;
  if (isNaN(h)) return String(t);

  const zone = zoneForState(state);
  const local = `${to12(h, m)} ${zone.label}`;
  if (zone.hoursFromET === 0) return local; // car is Eastern → single label is enough

  // Eastern equivalent = local time minus the (negative) offset → i.e. add hours.
  let etH = h - zone.hoursFromET;
  let dayShift = 0;
  while (etH >= 24) { etH -= 24; dayShift += 1; }
  while (etH < 0) { etH += 24; dayShift -= 1; }
  const shift = dayShift > 0 ? ' next day' : dayShift < 0 ? ' prev day' : '';
  return `${local} (${to12(etH, m)} ET${shift})`;
}
