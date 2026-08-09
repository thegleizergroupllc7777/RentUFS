// ─────────────────────────────────────────────────────────────────────────────
// Late-return detection + charging switch
//
// This module is the single source of truth for "is this rental late, and by how
// much?" It is PURE and READ-ONLY: importing it does nothing, and none of its
// functions write to the database or charge anyone. The scheduler and the host
// dashboard both call getLateInfo() so the LATE banner and any late fee always
// agree on the exact same moment.
//
// It intentionally does NOT touch the existing return-reminder / overdue-SMS
// logic in scheduler.js — that code keeps running unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const SystemState = require('../models/SystemState');
const { returnMomentForBooking } = require('./vehicleTimezone');

// Legacy fixed Eastern offset (kept for backward-compatible export only). The
// return-moment math below no longer uses it — it computes the true Eastern time
// (DST-aware) so a charge fires at the renter's real clock deadline year-round.
const EST_OFFSET = 5;

// How many minutes America/New_York is offset from UTC at a given instant.
// Uses the runtime's timezone database, so it's automatically correct for
// daylight saving (EDT = -240 in summer, EST = -300 in winter).
const ET_TZ = 'America/New_York';
const easternOffsetMinutes = (instant) => {
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(instant).reduce((a, x) => (a[x.type] = x.value, a), {});
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUtc - instant.getTime()) / 60000; // ET is behind UTC → negative
};

// The exact instant a rental is due back, as a real UTC Date.
//   endDate     = midnight UTC of the drop-off day
//   dropoffTime = "HH:MM" Eastern (defaults to 10:00, same default as the model)
// The drop-off clock time is the renter's REAL Eastern time, so we resolve it to
// UTC using the actual Eastern offset for that date (daylight-saving accurate) —
// no fixed 5-hour assumption, so summer returns aren't given a hidden extra hour.
// Delegates to the shared vehicle-timezone resolver (the SAME one the return
// reminders/overdue scheduler uses) so a California drop-off is read in Pacific,
// not Eastern. Falls back to Eastern inside that helper when the vehicle's state
// is unknown — i.e. exactly the previous behavior — so it can never regress.
const getReturnMoment = (booking) => returnMomentForBooking(booking);

// Given a booking, return how late it is right now. Only 'active' bookings can
// be late — a completed/cancelled trip is never late no matter the clock.
//
// Returns:
//   {
//     isLate:      boolean
//     returnMoment: Date            // when it was due back
//     msLate:      number           // 0 if not late
//     minutesLate: number           // whole minutes, 0 if not late
//     hoursLate:   number           // whole hours, 0 if not late
//     daysLate:    number           // whole 24h periods elapsed, 0 if not late
//   }
const getLateInfo = (booking, now = new Date()) => {
  const notLate = { isLate: false, returnMoment: null, msLate: 0, minutesLate: 0, hoursLate: 0, daysLate: 0 };
  if (!booking || booking.status !== 'active') return notLate;

  const returnMoment = getReturnMoment(booking);
  const msLate = now.getTime() - returnMoment.getTime();
  if (msLate <= 0) return { ...notLate, returnMoment };

  return {
    isLate: true,
    returnMoment,
    msLate,
    minutesLate: Math.floor(msLate / 60000),
    hoursLate: Math.floor(msLate / 3600000),
    daysLate: Math.floor(msLate / (24 * 3600000))
  };
};

// ── New-reservations-only guardrail ──
// Late fees may ONLY ever apply to bookings created AFTER the updated rental
// agreement (with the Automatic Late Return Fee clause) went live — i.e. only
// renters who actually agreed to those terms. Every current/existing booking was
// created before this line and is therefore permanently invisible to the charger.
//
// GO-LIVE: set to the moment the new agreement + late-fee policy went live.
// Only bookings created on/after this instant can ever be charged, so every
// reservation that existed before this line is permanently protected. Setting
// this back to null instantly makes the whole system inert again.
const LATE_FEE_POLICY_START = '2026-07-01T21:04:16Z';

// True only if this booking was created on/after the policy start — meaning its
// renter signed the agreement that authorizes the late fee. Fails safe: if no
// start date is configured, or the booking has no createdAt, returns false.
const isBookingEligible = (booking) => {
  if (!LATE_FEE_POLICY_START) return false;           // not live yet → nobody eligible
  if (!booking || !booking.createdAt) return false;   // can't prove it's new → exclude
  return new Date(booking.createdAt).getTime() >= new Date(LATE_FEE_POLICY_START).getTime();
};

// The master ON/OFF switch for AUTOMATIC LATE-FEE CHARGING.
//
// Read from the SystemState key/value store so the owner can flip it without a
// redeploy. Default is OFF ('off') — until the owner explicitly turns it on,
// the system detects lateness and reports the math but charges NO ONE.
//
// An env var (LATE_FEE_CHARGING=on) can force it on for testing, but the DB
// value wins once it is set, so the admin toggle is always authoritative.
const isChargingEnabled = async () => {
  try {
    const doc = await SystemState.findOne({ key: 'lateFeeCharging' });
    if (doc && typeof doc.value === 'string') {
      return doc.value.toLowerCase() === 'on';
    }
    // No explicit setting yet → fall back to env, else OFF.
    return String(process.env.LATE_FEE_CHARGING || '').toLowerCase() === 'on';
  } catch (err) {
    // If we cannot read the switch for any reason, fail SAFE (charge no one).
    console.error('⚠️ lateReturn.isChargingEnabled read failed, defaulting OFF:', err.message);
    return false;
  }
};

module.exports = {
  EST_OFFSET,
  LATE_FEE_POLICY_START,
  getReturnMoment,
  getLateInfo,
  isBookingEligible,
  isChargingEnabled
};
