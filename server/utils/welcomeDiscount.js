/**
 * WELCOME20 first-rental discount — single source of truth.
 *
 * What it does: lets a brand-new renter type WELCOME20 at checkout for $20 off
 * their FIRST trip. The $20 comes entirely out of RentUFS's own revenue (our
 * platform/insurance margin). It NEVER touches the host's payout — hostEarnings
 * is computed separately and is left completely alone — and it NEVER touches the
 * Stripe charge code: the discount is just baked into the booking's stored
 * totalPrice, which the payment routes already read as-is.
 *
 * Safety properties:
 *  - Off by default. Controlled by the owner-only toggle in SystemState
 *    (key 'welcomeDiscount'). While OFF, the code is simply "not available" and
 *    nothing changes anywhere.
 *  - One-time per account, server-enforced. A renter who already has ANY paid
 *    booking, or any other booking that already carries a discount, is not a
 *    first-timer and cannot use it. The code cannot be reused.
 *  - Fixed code, fixed amount — no free-form promo system to abuse.
 */

const SystemState = require('../models/SystemState');
const Booking = require('../models/Booking');

const WELCOME_CODE = 'WELCOME20';
const WELCOME_AMOUNT = 20;

// Normalize whatever the renter typed: trim, uppercase, strip spaces.
function normalizeCode(code) {
  return String(code || '').trim().toUpperCase().replace(/\s+/g, '');
}

// Is the WELCOME20 promo turned on right now? Default OFF — only an explicit
// 'on' enables it. Reads the same SystemState store every other toggle uses.
async function isWelcomeEnabled() {
  const doc = await SystemState.findOne({ key: 'welcomeDiscount' });
  return !!(doc && String(doc.value).toLowerCase() === 'on');
}

/**
 * Is this renter a genuine first-timer? True only when they have NO OTHER
 * booking that is already paid or already carries a discount. The current
 * booking is excluded so re-applying to the same in-progress checkout (e.g.
 * after an insurance change) still counts as first-time.
 */
async function isFirstTimeRenter(driverId, excludeBookingId) {
  const prior = await Booking.findOne({
    driver: driverId,
    _id: { $ne: excludeBookingId },
    $or: [
      { paymentStatus: 'paid' },
      { 'discount.amount': { $gt: 0 } }
    ]
  }).select('_id').lean();
  return !prior;
}

/**
 * Validate a promo code for a given booking. Returns
 *   { ok: true,  code, amount }                        when it may be applied
 *   { ok: false, reason: '<friendly message>' }        otherwise
 *
 * Read-only: this never mutates or saves anything. Callers decide what to do.
 */
async function validateWelcomeDiscount(rawCode, booking) {
  const code = normalizeCode(rawCode);

  if (code !== WELCOME_CODE) {
    return { ok: false, reason: "That promo code isn't valid." };
  }
  if (!(await isWelcomeEnabled())) {
    return { ok: false, reason: "This promo code isn't available right now." };
  }
  const driverId = booking.driver?._id || booking.driver;
  if (!(await isFirstTimeRenter(driverId, booking._id))) {
    return { ok: false, reason: 'This code is for your first rental only.' };
  }
  return { ok: true, code: WELCOME_CODE, amount: WELCOME_AMOUNT };
}

module.exports = {
  WELCOME_CODE,
  WELCOME_AMOUNT,
  normalizeCode,
  isWelcomeEnabled,
  isFirstTimeRenter,
  validateWelcomeDiscount
};
