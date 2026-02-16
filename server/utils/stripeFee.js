/**
 * Calculate Stripe processing fee split 50/50 between driver and host.
 *
 * Stripe charges 2.9% + $0.30 on the total amount charged to the driver's card.
 * Since the driver's half of the fee is added to the total, this creates a circular
 * dependency. We solve it algebraically:
 *
 *   stripeFee = RATE * (baseTotal + stripeFee / 2) + FIXED
 *   stripeFee * (1 - RATE / 2) = RATE * baseTotal + FIXED
 *   stripeFee = (RATE * baseTotal + FIXED) / (1 - RATE / 2)
 *
 * @param {number} baseTotal - Total before processing fees (rental + driver platform fee + insurance)
 * @returns {{ stripeFee: number, driverProcessingFee: number, hostProcessingFee: number }}
 */
function calculateProcessingFee(baseTotal) {
  const STRIPE_RATE = 0.029;
  const STRIPE_FIXED = 0.30;

  const stripeFee = (STRIPE_RATE * baseTotal + STRIPE_FIXED) / (1 - STRIPE_RATE / 2);

  // Split 50/50, round to cents (driver gets the extra penny if odd)
  const driverProcessingFee = Math.ceil(stripeFee * 100 / 2) / 100;
  const hostProcessingFee = Math.floor(stripeFee * 100 / 2) / 100;

  return {
    stripeFee: Math.round(stripeFee * 100) / 100,
    driverProcessingFee,
    hostProcessingFee
  };
}

module.exports = { calculateProcessingFee };
