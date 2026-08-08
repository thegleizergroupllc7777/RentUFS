// ─────────────────────────────────────────────────────────────────────────────
// Extension rental rate — "down-only, capped at the agreed rate"
//
// A host may LOWER an active renter's future extension rate, but may NEVER raise
// it above the daily rate the renter agreed to when the trip was booked. So the
// per-day rate used for a NEW extension is the LOWER of:
//   • booking.pricePerDay        — the rate locked onto the booking at creation
//   • booking.vehicle.pricePerDay — the host's current listing price (live)
//
// This ONLY affects the daily rental portion of a future extension. It does not
// touch insurance (booking.insurance.costPerDay), the platform fee, tolls,
// Stripe, or ANY amount already paid. It is never retroactive.
//
// Defensive by design: if the live vehicle price is missing, zero, or invalid,
// it returns the locked booking rate — i.e. exactly today's behavior. It can
// never raise a charge, return 0/NaN, or throw.
// ─────────────────────────────────────────────────────────────────────────────

const extensionDailyRate = (booking) => {
  const agreed = Number(booking && booking.pricePerDay) || 0;
  const current = Number(booking && booking.vehicle && booking.vehicle.pricePerDay);
  // No usable live price → fall back to the agreed rate (today's behavior).
  if (!Number.isFinite(current) || current <= 0) return agreed;
  // Cap: never above the agreed rate; follow the host down when they lower it.
  return Math.min(agreed, current);
};

module.exports = { extensionDailyRate };
