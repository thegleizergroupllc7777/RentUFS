// ─────────────────────────────────────────────────────────────────────────────
// Automatic late-return fee processor — SHADOW STAGE
//
// This module finds active rentals that are past their return time and, for each
// new late day, works out what the renter owes ($5 + one insurance day + the
// processing fee). Right now it runs in SHADOW mode only: it emails the owner the
// math and records it on the booking, but contains NO card-charging code — nobody
// is charged. Live charging plugs into the clearly-marked spot below in a later step.
//
// Two hard safety gates, both from server/utils/lateReturn.js:
//   1. isBookingEligible(booking) — only bookings whose renter agreed to the new
//      Automatic Late Return Fee clause. While the policy start is unset, this is
//      false for EVERY booking, so this whole pass is a no-op in production.
//   2. isChargingEnabled() — the owner's ON/OFF switch. While OFF (the default),
//      we only shadow-report; we never charge.
// ─────────────────────────────────────────────────────────────────────────────

const Booking = require('../models/Booking');
const { getLateInfo, isBookingEligible, isChargingEnabled } = require('./lateReturn');
const { sendLateReturnShadowEmail } = require('./emailService');

const LATE_FEE_PER_DAY = 5;      // dollars, per the agreement's Automatic Late Return Fee
const MIN_MINUTES_LATE = 60;     // first charge fires one hour after the return time
const round2 = (n) => Math.round(n * 100) / 100;

// The insurance-day rate for this booking. Prefer what the renter actually agreed
// to at booking (booking.insurance.costPerDay); fall back to the host's resolved
// rate — mirrors server/routes/insurance.js resolveRateForHost so it stays in sync.
const resolveInsuranceDay = (booking, host) => {
  const paid = booking.insurance && booking.insurance.costPerDay;
  if (typeof paid === 'number' && paid > 0) return paid;
  const hi = host && host.hostInfo;
  if (hi && hi.coverageType === 'LIABILITY') {
    return (typeof hi.customInsuranceRate === 'number' && hi.customInsuranceRate > 0) ? hi.customInsuranceRate : 25;
  }
  if (hi && typeof hi.customFullCoverageRate === 'number' && hi.customFullCoverageRate > 0) return hi.customFullCoverageRate;
  return 33; // standard Full Coverage default
};

// Pure: what one late day costs the renter. The renter pays the full processing
// fee (2.9% + $0.30), same approach as chargeSettlement's host-added charges.
const computeLateDayCharge = (booking, host) => {
  const insurance = round2(resolveInsuranceDay(booking, host));
  const base = round2(LATE_FEE_PER_DAY + insurance);
  const stripeFee = round2(base * 0.029 + 0.30);
  const total = round2(base + stripeFee);
  return { lateFee: LATE_FEE_PER_DAY, insurance, stripeFee, total };
};

// How many late-day charges are owed right now: 0 until 60 minutes late, then 1,
// then +1 for each additional whole 24h the vehicle stays out.
const chargesOwed = (info) => {
  if (!info.isLate || info.minutesLate < MIN_MINUTES_LATE) return 0;
  return 1 + info.daysLate;
};

// Scheduled pass. Safe to run every few minutes: it only acts on a booking when a
// NEW late day is owed that hasn't already been handled (no double-charging).
const processLateReturns = async () => {
  try {
    const now = new Date();
    const chargingOn = await isChargingEnabled();

    const activeBookings = await Booking.find({ status: 'active', paymentStatus: 'paid' })
      .populate('vehicle', 'make model year')
      .populate('driver', 'firstName lastName email')
      .populate('host', 'firstName lastName email hostInfo');

    let reported = 0;
    for (const booking of activeBookings) {
      // GATE 1: new-reservations-only. No-op for everything until policy start is set.
      if (!isBookingEligible(booking)) continue;

      const info = getLateInfo(booking, now);
      const owed = chargesOwed(info);
      if (owed <= 0) continue;

      // No double-action: count late days already handled (shadow or charged).
      const handled = (booking.lateFee?.shadowDaysReported || 0) + (booking.lateFee?.daysCharged || 0);
      if (owed <= handled) continue;

      const dayNumber = owed;
      const charge = computeLateDayCharge(booking, booking.host);

      if (!chargingOn) {
        // ── SHADOW MODE ── no charge. Email the owner the math and record it.
        await sendLateReturnShadowEmail({
          booking,
          vehicle: booking.vehicle,
          driver: booking.driver,
          host: booking.host,
          dayNumber,
          charge,
          returnMoment: info.returnMoment,
          hoursLate: info.hoursLate
        }).catch(err => console.error('📧 Late-fee shadow email error:', err.message));

        if (!booking.lateFee) booking.lateFee = {};
        booking.lateFee.shadowDaysReported = owed;
        booking.lateFee.lastActionAt = now;
        booking.lateFee.entries = booking.lateFee.entries || [];
        booking.lateFee.entries.push({ day: dayNumber, mode: 'shadow', ...charge, at: now });
        await booking.save();
        reported++;
        console.log(`🕓 [SHADOW] Late day ${dayNumber} on ${booking.reservationId}: would charge $${charge.total} (no charge made)`);
      } else {
        // ── LIVE CHARGING ── intentionally NOT implemented in this step. Nothing
        // is charged here yet; real card-charging is added in the next increment.
        console.log(`🕓 Late day ${dayNumber} on ${booking.reservationId}: live charging not yet implemented — skipping (no charge)`);
      }
    }

    if (reported > 0) console.log(`🕓 Late-return shadow pass complete: reported ${reported} late day(s)`);
    return { success: true, reported };
  } catch (err) {
    console.error('🕓 Error in processLateReturns:', err);
    return { success: false, error: err.message };
  }
};

module.exports = {
  LATE_FEE_PER_DAY,
  resolveInsuranceDay,
  computeLateDayCharge,
  chargesOwed,
  processLateReturns
};
