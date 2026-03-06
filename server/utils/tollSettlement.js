const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const { isConfigured, getTollCharges } = require('./tollspot');

const PLATFORM_TOLL_FEE = 0.50;

/**
 * Fetch outstanding (unsettled) toll charges for a booking.
 * Compares total tolls from TollSpot against what's been settled.
 */
const getOutstandingTolls = async (booking, vehicle) => {
  if (!isConfigured() || !vehicle?.licensePlate) {
    return { tolls: [], count: 0, originalAmount: 0, platformFees: 0, driverTotal: 0, allTollCount: 0 };
  }

  // TollSpot expects MM/DD/YYYY format for date filters
  const formatDate = (d) => {
    const dt = new Date(d);
    return `${String(dt.getMonth() + 1).padStart(2, '0')}/${String(dt.getDate()).padStart(2, '0')}/${dt.getFullYear()}`;
  };
  const result = await getTollCharges({
    license_plate: vehicle.licensePlate.toUpperCase().replace(/[^A-Z0-9]/g, ''),
    from_date: formatDate(booking.startDate),
    to_date: formatDate(booking.endDate),
    page: 0,
    limit: 200
  });

  if (!result.success) {
    console.error('🛣️ Toll settlement: Failed to fetch tolls:', result.error);
    return { tolls: [], count: 0, originalAmount: 0, platformFees: 0, driverTotal: 0, allTollCount: 0, error: result.error };
  }

  const allTolls = result.data.data || [];
  const settledCount = booking.tollAccounting?.settledTollCount || 0;

  // Sort by date for consistent ordering, then take only unsettled tolls
  const sortedTolls = allTolls.sort((a, b) =>
    new Date(a.exit_time || a.posted_time) - new Date(b.exit_time || b.posted_time)
  );
  const unsettledTolls = sortedTolls.slice(settledCount);

  const originalAmount = parseFloat(unsettledTolls.reduce((sum, t) => sum + (t.amount || 0), 0).toFixed(2));
  const platformFees = parseFloat((unsettledTolls.length * PLATFORM_TOLL_FEE).toFixed(2));
  const driverTotal = parseFloat((originalAmount + platformFees).toFixed(2));

  return {
    tolls: unsettledTolls,
    count: unsettledTolls.length,
    originalAmount,
    platformFees,
    driverTotal,
    allTollCount: allTolls.length
  };
};

/**
 * Charge driver off-session for outstanding tolls using their saved payment method.
 * Used at return inspection and for post-trip delayed toll charges.
 */
const chargeDriverForTolls = async (booking, driver, tollInfo, trigger) => {
  if (tollInfo.driverTotal <= 0) {
    return { success: true, message: 'No tolls to settle', charged: 0 };
  }

  // Find driver's default saved payment method
  const defaultPM = driver.paymentMethods?.find(pm => pm.isDefault && pm.stripePaymentMethodId);
  if (!defaultPM) {
    console.error(`🛣️ Toll settlement: No saved payment method for driver ${driver._id}`);
    return { success: false, error: 'No saved payment method found' };
  }

  if (!driver.stripeCustomerId) {
    return { success: false, error: 'No Stripe customer ID' };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(tollInfo.driverTotal * 100),
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
        bookingId: booking._id.toString(),
        reservationId: booking.reservationId || '',
        type: 'toll_settlement',
        trigger,
        tollCount: tollInfo.count.toString(),
        originalTollAmount: tollInfo.originalAmount.toString(),
        platformTollFee: tollInfo.platformFees.toString()
      },
      description: `Toll charges for ${booking.reservationId || booking._id} (${tollInfo.count} toll${tollInfo.count !== 1 ? 's' : ''})`
    });

    console.log(`🛣️ Toll settlement: Charged driver $${tollInfo.driverTotal} for ${tollInfo.count} toll(s) on booking ${booking._id} [${trigger}]`);

    return {
      success: paymentIntent.status === 'succeeded',
      paymentIntentId: paymentIntent.id,
      status: paymentIntent.status,
      charged: tollInfo.driverTotal
    };
  } catch (err) {
    console.error(`🛣️ Toll settlement: Charge failed for booking ${booking._id}:`, err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Transfer toll reimbursement to host's Stripe Connect account.
 * Host receives the original toll amount (without the $0.25 platform fee).
 */
const transferTollsToHost = async (booking, host, tollInfo) => {
  if (tollInfo.originalAmount <= 0) {
    return { success: true, message: 'No amount to transfer' };
  }

  if (!host.stripeConnectAccountId || !host.stripeConnectPayoutsEnabled) {
    console.error(`🛣️ Toll settlement: Host ${host._id} has no Connect account or payouts not enabled`);
    return { success: false, error: 'Host payout account not set up' };
  }

  try {
    const transfer = await stripe.transfers.create({
      amount: Math.round(tollInfo.originalAmount * 100),
      currency: 'usd',
      destination: host.stripeConnectAccountId,
      description: `Toll reimbursement for ${booking.reservationId || booking._id} (${tollInfo.count} toll${tollInfo.count !== 1 ? 's' : ''})`,
      metadata: {
        bookingId: booking._id.toString(),
        reservationId: booking.reservationId || '',
        type: 'toll_reimbursement',
        tollCount: tollInfo.count.toString()
      }
    });

    console.log(`🛣️ Toll settlement: Transferred $${tollInfo.originalAmount} to host ${host._id} for ${tollInfo.count} toll(s)`);
    return { success: true, transferId: transfer.id };
  } catch (err) {
    console.error(`🛣️ Toll settlement: Transfer to host failed for booking ${booking._id}:`, err.message);
    return { success: false, error: err.message };
  }
};

/**
 * Record a toll settlement on the booking.
 * Updates both tollAccounting totals and appends to tollSettlements array.
 */
const recordTollSettlement = async (Booking, bookingId, tollInfo, trigger, paymentIntentId, transferId) => {
  // Use $inc for all cumulative fields to avoid overwriting previous settlement data
  const update = {
    $inc: {
      'tollAccounting.settledTollCount': tollInfo.count,
      'tollAccounting.settledAmount': tollInfo.driverTotal,
      'tollAccounting.settledToHost': tollInfo.originalAmount,
      'tollAccounting.totalTolls': tollInfo.count,
      'tollAccounting.originalTollAmount': tollInfo.originalAmount,
      'tollAccounting.platformTollFees': tollInfo.platformFees,
      'tollAccounting.driverTollTotal': tollInfo.driverTotal
    },
    $set: {
      'tollAccounting.lastSettledAt': new Date(),
      'tollAccounting.lastSyncedAt': new Date()
    },
    $push: {
      tollSettlements: {
        trigger,
        tollCount: tollInfo.count,
        chargeAmount: tollInfo.driverTotal,
        hostAmount: tollInfo.originalAmount,
        platformFee: tollInfo.platformFees,
        paymentIntentId: paymentIntentId || null,
        transferId: transferId || null,
        settledAt: new Date()
      }
    }
  };

  await Booking.findByIdAndUpdate(bookingId, update);
};

module.exports = {
  PLATFORM_TOLL_FEE,
  getOutstandingTolls,
  chargeDriverForTolls,
  transferTollsToHost,
  recordTollSettlement
};
