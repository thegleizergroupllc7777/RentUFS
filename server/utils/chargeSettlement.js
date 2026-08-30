const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const Charge = require('../models/Charge');
const User = require('../models/User');
const Booking = require('../models/Booking');
const { sendChargePaymentFailedToDriver } = require('./emailService');

// Per-charge fees on top of the host-entered amount.
// Renter pays SERVICE_FEE on top of the charge amount; the host's payout is
// reduced by HOST_PLATFORM_FEE plus the actual Stripe processing fee.
const SERVICE_FEE = 0.50;          // added to renter's bill, kept by platform
const HOST_PLATFORM_FEE = 0.35;    // deducted from host's payout, kept by platform

// Retry schedule (days after the previous attempt). Once exhausted the charge
// stays in 'failed' state and triggers the new-booking lockout.
const RETRY_INTERVAL_DAYS = [2, 4]; // first attempt at scheduledChargeAt, then +2d, then +4d
const MAX_ATTEMPTS = RETRY_INTERVAL_DAYS.length + 1;

// Stripe processing fee approximation: 2.9% + $0.30 of the gross charged.
const estimateStripeFee = (gross) => {
  return parseFloat((gross * 0.029 + 0.30).toFixed(2));
};

/**
 * Compute the fee breakdown for a charge.
 *   gross = host-entered amount + $0.50 service fee  (renter pays)
 *   stripeFee = 2.9% + $0.30 on gross
 *   platformProfit = $0.50 + $0.35 = $0.85
 *   hostPayout = gross - stripeFee - platformProfit
 */
const computeBreakdown = (chargeAmount) => {
  const gross = parseFloat((chargeAmount + SERVICE_FEE).toFixed(2));
  const stripeFee = estimateStripeFee(gross);
  const platformProfit = parseFloat((SERVICE_FEE + HOST_PLATFORM_FEE).toFixed(2));
  const hostPayout = parseFloat((gross - stripeFee - platformProfit).toFixed(2));
  return {
    chargeAmount,
    serviceFee: SERVICE_FEE,
    gross,
    stripeFee,
    hostPlatformFee: HOST_PLATFORM_FEE,
    platformProfit,
    hostPayout
  };
};

/**
 * Settle a single Charge: bills the renter via Stripe and transfers the host's
 * net amount to their Connect account. Mirrors the toll settlement flow.
 *
 * Triggers:
 *   'auto'     — fired by the scheduler after the 3-day notice window
 *   'pay_now'  — driver pressed Pay Now on My Bookings
 *   'retry'    — scheduler retrying a previously failed charge
 *
 * Returns { success, charge, error? }.
 */
const settleCharge = async (chargeId, trigger = 'auto') => {
  const charge = await Charge.findById(chargeId)
    .populate('driver')
    .populate('host')
    .populate('booking');

  if (!charge) return { success: false, error: 'Charge not found' };
  if (charge.status === 'charged') return { success: true, charge, alreadyCharged: true };
  if (charge.status === 'waived') return { success: false, error: 'Charge has been waived' };

  const driver = charge.driver;
  const host = charge.host;
  if (!driver) return { success: false, error: 'Driver not found on charge' };
  if (!host) return { success: false, error: 'Host not found on charge' };

  const breakdown = computeBreakdown(charge.amount);

  // Mark a charge as failed and notify the renter (only when triggered by the
  // auto-charge cron — manual Pay Now failures surface in the UI directly).
  const markFailed = async (failureMessage, extraFields = {}) => {
    const incRetry = trigger === 'retry' ? 1 : 0;
    await Charge.findByIdAndUpdate(chargeId, {
      status: 'failed',
      lastFailureMessage: failureMessage,
      lastRetryAt: new Date(),
      ...extraFields,
      $inc: { retryCount: incRetry }
    });
    if (trigger === 'auto' || trigger === 'retry') {
      const attempts = (charge.retryCount || 0) + 1 + incRetry;
      sendChargePaymentFailedToDriver(driver, charge.booking, charge, attempts, MAX_ATTEMPTS)
        .catch(err => console.error('📧 Charge failure email error:', err.message));
    }
  };

  // Need a saved payment method on the driver.
  const defaultPM = driver.paymentMethods?.find(pm => pm.isDefault && pm.stripePaymentMethodId);
  if (!driver.stripeCustomerId || !defaultPM) {
    await markFailed('No saved payment method on file');
    return { success: false, error: 'No saved payment method on file' };
  }

  let paymentIntent;
  try {
    paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(breakdown.gross * 100),
      currency: 'usd',
      customer: driver.stripeCustomerId,
      payment_method: defaultPM.stripePaymentMethodId,
      off_session: true,
      confirm: true,
      automatic_payment_methods: {
        enabled: true,
        allow_redirects: 'never'
      },
      metadata: {
        type: 'host_charge',
        chargeId: charge._id.toString(),
        bookingId: charge.booking?._id?.toString() || '',
        reservationId: charge.booking?.reservationId || '',
        chargeType: charge.chargeType,
        trigger
      },
      description: `${charge.chargeType} on ${charge.booking?.reservationId || charge.booking?._id || 'booking'}`
    });
  } catch (err) {
    console.error(`💸 Charge settlement failed [${chargeId}]:`, err.message);
    await markFailed(err.message);
    return { success: false, error: err.message };
  }

  if (paymentIntent.status !== 'succeeded') {
    await markFailed(`Payment intent status: ${paymentIntent.status}`, { paymentIntentId: paymentIntent.id });
    return { success: false, error: `Payment intent status: ${paymentIntent.status}` };
  }

  // Driver was charged successfully. Now transfer the host's cut.
  let transferId = null;
  if (host.stripeConnectAccountId && host.stripeConnectPayoutsEnabled && breakdown.hostPayout > 0) {
    try {
      const transfer = await stripe.transfers.create({
        amount: Math.round(breakdown.hostPayout * 100),
        currency: 'usd',
        destination: host.stripeConnectAccountId,
        description: `Charge reimbursement (${charge.chargeType}) for ${charge.booking?.reservationId || charge.booking?._id || 'booking'}`,
        metadata: {
          type: 'host_charge_payout',
          chargeId: charge._id.toString(),
          bookingId: charge.booking?._id?.toString() || ''
        }
      });
      transferId = transfer.id;
    } catch (transferErr) {
      // Driver was charged but transfer failed — log and continue. Surfaces in
      // host's payout dashboard later; doesn't reverse the charge to the renter.
      console.error(`💸 Charge transfer to host failed [${chargeId}]:`, transferErr.message);
    }
  }

  const updated = await Charge.findByIdAndUpdate(
    chargeId,
    {
      status: 'charged',
      chargedAt: new Date(),
      paymentIntentId: paymentIntent.id,
      transferId,
      lastFailureMessage: null
    },
    { new: true }
  );

  console.log(`💸 Charge settled [${chargeId}]: gross $${breakdown.gross}, host payout $${breakdown.hostPayout}, platform $${breakdown.platformProfit} [${trigger}]`);

  return { success: true, charge: updated, breakdown, paymentIntentId: paymentIntent.id, transferId };
};

/**
 * Determine if a driver is locked out from creating new bookings due to
 * unpaid charges that have exhausted their retry attempts.
 *
 * Returns { locked: bool, charges: [...], totalOwed: number }
 */
const getDriverLockoutStatus = async (driverId) => {
  const failedCharges = await Charge.find({
    driver: driverId,
    status: 'failed',
    retryCount: { $gte: MAX_ATTEMPTS - 1 }
  }).select('amount chargeType description');

  const totalOwed = failedCharges.reduce((sum, c) => sum + (c.amount + SERVICE_FEE), 0);
  return {
    locked: failedCharges.length > 0,
    charges: failedCharges,
    totalOwed: parseFloat(totalOwed.toFixed(2))
  };
};

/**
 * Scheduled job: scan for charges that are due to be billed (first attempt) or
 * are in 'failed' state and ready for the next retry. Runs from the scheduler.
 */
const checkAndSettleScheduledCharges = async () => {
  try {
    const now = new Date();

    // First-attempt charges: pending and past their scheduledChargeAt.
    const pending = await Charge.find({
      status: 'pending',
      scheduledChargeAt: { $lte: now }
    });

    let settled = 0;
    let failed = 0;

    for (const charge of pending) {
      const result = await settleCharge(charge._id, 'auto');
      if (result.success) settled++;
      else failed++;
    }

    // Retry-eligible charges: failed, retryCount < MAX_ATTEMPTS-1, and enough
    // time has passed since the last attempt per RETRY_INTERVAL_DAYS.
    const failedCharges = await Charge.find({
      status: 'failed',
      retryCount: { $lt: MAX_ATTEMPTS - 1 }
    });

    for (const charge of failedCharges) {
      const intervalDays = RETRY_INTERVAL_DAYS[charge.retryCount] ?? null;
      if (intervalDays === null) continue;
      const lastAttempt = charge.lastRetryAt || charge.scheduledChargeAt;
      const dueAt = new Date(lastAttempt.getTime() + intervalDays * 24 * 60 * 60 * 1000);
      if (dueAt > now) continue;

      const result = await settleCharge(charge._id, 'retry');
      if (result.success) settled++;
      else failed++;
    }

    if (settled || failed) {
      console.log(`💸 Charge scheduler: ${settled} settled, ${failed} failed`);
    }

    return { success: true, settled, failed };
  } catch (err) {
    console.error('💸 Charge scheduler error:', err);
    return { success: false, error: err.message };
  }
};

module.exports = {
  SERVICE_FEE,
  HOST_PLATFORM_FEE,
  MAX_ATTEMPTS,
  computeBreakdown,
  settleCharge,
  getDriverLockoutStatus,
  checkAndSettleScheduledCharges
};
