// ─────────────────────────────────────────────────────────────────────────────
// Automatic late-return fee processor
//
// Finds active rentals past their return time and, for each new unpaid late day,
// charges the renter $5 + one insurance day + the processing fee (all to the
// platform — no host transfer). On success it emails the renter a receipt and the
// owner a confirmation copy; on a decline it backs off 6h and alerts the host+owner.
//
// TWO HARD SAFETY GATES keep this inert until we deliberately go live, both from
// server/utils/lateReturn.js:
//   1. isChargingEnabled() — the owner's ON/OFF kill switch (default OFF). While
//      OFF, this does absolutely nothing: no charges, no emails.
//   2. isBookingEligible(booking) — only bookings whose renter agreed to the new
//      Automatic Late Return Fee clause. While LATE_FEE_POLICY_START is unset, this
//      is false for EVERY booking, so even with the switch ON nothing is charged.
//
// It does NOT touch booking creation, checkout, the reservation payment flow, or
// insurance coverage start/stop — all of that keeps running unchanged.
// ─────────────────────────────────────────────────────────────────────────────

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const Booking = require('../models/Booking');
const { getLateInfo, isBookingEligible, isChargingEnabled } = require('./lateReturn');
const {
  sendLateFeeChargedToRenter,
  sendLateFeeOwnerCopy,
  sendLateFeeDeclineAlert,
  sendLateReturnWarningToRenter,
  sendLateReturnRecoverToHost,
  sendLateReturnCompanyAlert
} = require('./emailService');

const LATE_FEE_PER_DAY = 5;                       // dollars, per the agreement's Automatic Late Return Fee
const MIN_MINUTES_LATE = 60;                      // first charge fires one hour after the return time
const RETRY_BACKOFF_MS = 6 * 60 * 60 * 1000;      // after a decline, wait 6h before retrying the card
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

// Charge the renter off-session for one late day. The full amount goes to the
// PLATFORM (RentUFS) — there is NO host transfer, because the $5 + insurance day
// are platform revenue (the host earns their normal rental only when the renter
// properly extends). Mirrors the off_session pattern used by chargeSettlement.
const chargeLateDay = async (booking, driver, charge, dayNumber) => {
  const defaultPM = driver?.paymentMethods?.find(pm => pm.isDefault && pm.stripePaymentMethodId);
  if (!driver?.stripeCustomerId || !defaultPM) {
    return { success: false, error: 'No saved payment method on file' };
  }
  try {
    const pi = await stripe.paymentIntents.create({
      amount: Math.round(charge.total * 100),
      currency: 'usd',
      customer: driver.stripeCustomerId,
      payment_method: defaultPM.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
      metadata: {
        type: 'late_return_fee',
        bookingId: booking._id.toString(),
        reservationId: booking.reservationId || '',
        lateDay: String(dayNumber)
      },
      description: `Late return fee (day ${dayNumber}) for ${booking.reservationId || booking._id}`
    });
    if (pi.status !== 'succeeded') {
      return { success: false, error: `Payment status: ${pi.status}`, paymentIntentId: pi.id };
    }
    return { success: true, paymentIntentId: pi.id };
  } catch (err) {
    return { success: false, error: err.message };
  }
};

// Scheduled pass. Safe to run every few minutes: acts on a booking only when a NEW
// unpaid late day is owed (no double-charging), and backs off 6h after a decline.
const processLateReturns = async () => {
  try {
    const now = new Date();
    const chargingOn = await isChargingEnabled();

    // KILL SWITCH: while OFF, do absolutely nothing (no charges, no emails).
    if (!chargingOn) return { success: true, charged: 0, skipped: 'charging_off' };

    const activeBookings = await Booking.find({ status: 'active', paymentStatus: 'paid' })
      .populate('vehicle', 'make model year')
      .populate('driver', 'firstName lastName email phone stripeCustomerId paymentMethods')
      .populate('host', 'firstName lastName email hostInfo');

    let charged = 0;
    let failed = 0;
    for (const booking of activeBookings) {
      // GATE: new-reservations-only. No-op for everything until the policy start is set.
      if (!isBookingEligible(booking)) continue;

      const info = getLateInfo(booking, now);
      if (!info.isLate) continue;                // not overdue → nothing to do

      if (!booking.lateFee) booking.lateFee = {};
      booking.lateFee.entries = booking.lateFee.entries || [];
      let dirty = false;                         // did we set a notification flag this pass?

      // ── Renter warnings (before the first charge at 60 min) ──
      if (!booking.lateFee.warn0Sent) {
        sendLateReturnWarningToRenter({ driver: booking.driver, booking, vehicle: booking.vehicle, minutesLate: info.minutesLate })
          .catch(err => console.error('📧 Late warning (0m) error:', err.message));
        booking.lateFee.warn0Sent = true; dirty = true;
      }
      if (info.minutesLate >= 30 && !booking.lateFee.warn30Sent) {
        sendLateReturnWarningToRenter({ driver: booking.driver, booking, vehicle: booking.vehicle, minutesLate: info.minutesLate })
          .catch(err => console.error('📧 Late warning (30m) error:', err.message));
        booking.lateFee.warn30Sent = true; dirty = true;
      }

      // ── Host / company escalations ──
      if (info.hoursLate >= 48 && !booking.lateFee.day2AlertSent) {
        sendLateReturnRecoverToHost({ booking, vehicle: booking.vehicle, driver: booking.driver, host: booking.host, hoursLate: info.hoursLate, stage: '48h' })
          .catch(err => console.error('📧 Host recover (48h) error:', err.message));
        booking.lateFee.day2AlertSent = true; dirty = true;
      }
      if (info.hoursLate >= 72 && !booking.lateFee.day3AlertSent) {
        sendLateReturnRecoverToHost({ booking, vehicle: booking.vehicle, driver: booking.driver, host: booking.host, hoursLate: info.hoursLate, stage: '72h' })
          .catch(err => console.error('📧 Host recover (72h) error:', err.message));
        sendLateReturnCompanyAlert({ booking, vehicle: booking.vehicle, driver: booking.driver, host: booking.host, hoursLate: info.hoursLate })
          .catch(err => console.error('📧 Company 72h alert error:', err.message));
        booking.lateFee.day3AlertSent = true; dirty = true;
      }

      // ── Charging (first charge fires at 60 min; then one unpaid day per pass) ──
      const owed = chargesOwed(info);
      const daysCharged = booking.lateFee.daysCharged || 0;
      const inBackoff = booking.lateFee.nextRetryAt && now < new Date(booking.lateFee.nextRetryAt);

      if (owed > daysCharged && !inBackoff) {
        const targetDay = daysCharged + 1;       // charge the next unpaid late day
        const charge = computeLateDayCharge(booking, booking.host);
        const result = await chargeLateDay(booking, booking.driver, charge, targetDay);
        booking.lateFee.lastActionAt = now;

        if (result.success) {
          booking.lateFee.daysCharged = targetDay;
          booking.lateFee.totalCharged = round2((booking.lateFee.totalCharged || 0) + charge.total);
          booking.lateFee.retryCount = 0;
          booking.lateFee.nextRetryAt = null;
          booking.lateFee.entries.push({ day: targetDay, mode: 'charged', ...charge, chargeId: result.paymentIntentId, at: now });
          await booking.save();
          charged++;
          console.log(`🕓 Late fee charged: ${booking.reservationId} day ${targetDay} $${charge.total} [${result.paymentIntentId}]`);

          sendLateFeeChargedToRenter({ driver: booking.driver, booking, vehicle: booking.vehicle, dayNumber: targetDay, charge })
            .catch(err => console.error('📧 Late-fee receipt error:', err.message));
          sendLateFeeOwnerCopy({ booking, vehicle: booking.vehicle, driver: booking.driver, host: booking.host, dayNumber: targetDay, charge })
            .catch(err => console.error('📧 Late-fee owner copy error:', err.message));
        } else {
          booking.lateFee.retryCount = (booking.lateFee.retryCount || 0) + 1;
          booking.lateFee.nextRetryAt = new Date(now.getTime() + RETRY_BACKOFF_MS);
          booking.lateFee.entries.push({ day: targetDay, mode: 'failed', ...charge, at: now });
          await booking.save();
          failed++;
          console.error(`🕓 Late fee DECLINED: ${booking.reservationId} day ${targetDay} — ${result.error}`);

          sendLateFeeDeclineAlert({ booking, vehicle: booking.vehicle, driver: booking.driver, host: booking.host, dayNumber: targetDay, charge, failureMessage: result.error })
            .catch(err => console.error('📧 Late-fee decline alert error:', err.message));
        }
      } else if (dirty) {
        // No charge this pass, but a warning/escalation was sent — persist the flags.
        booking.lateFee.lastActionAt = now;
        await booking.save();
      }
    }

    if (charged || failed) console.log(`🕓 Late-return pass complete: ${charged} charged, ${failed} declined`);
    return { success: true, charged, failed };
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
  chargeLateDay,
  processLateReturns
};
