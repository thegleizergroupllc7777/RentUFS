/**
 * Segment-based earning calculations for bookings with mixed rental types.
 *
 * When a booking starts daily and extends weekly/monthly (or any mix),
 * each segment has a different per-day earning rate. This module provides
 * helpers to compute per-segment earnings and to calculate earnings for
 * a specific range of served days (used by partial weekly payouts).
 */

/**
 * Build an ordered array of earning segments for a booking.
 * Segment 0 = original booking, segments 1..N = extensions in order.
 *
 * Each segment: { days, rental, hostFee, hostProcessingFee, earnings, dailyEarnings }
 *
 * @param {Object} booking - Mongoose booking document (or plain object)
 * @returns {Array} segments
 */
function getBookingSegments(booking) {
  const extensions = booking.extensions || [];
  const hostFeePerDay = booking.hostPlatformFeePerDay || 1.50;
  const totalHostProcessingFee = Number(booking.hostProcessingFee) || 0;
  const totalDays = booking.totalDays || 0;

  // Calculate original segment days (total minus all extension days)
  const extDaysTotal = extensions.reduce((sum, ext) => sum + (ext.days || 0), 0);
  const originalDays = Math.max(0, totalDays - extDaysTotal);

  // Original segment rental amount
  let originalRental;
  if (booking.rentalSubtotal != null) {
    originalRental = Number(booking.rentalSubtotal);
  } else if (!booking.rentalType || booking.rentalType === 'daily') {
    originalRental = (booking.pricePerDay || 0) * originalDays;
  } else {
    originalRental = (booking.pricePerUnit || booking.pricePerDay || 0) * (booking.quantity || originalDays);
  }

  const segments = [];

  // Original segment
  if (originalDays > 0) {
    const hostFee = hostFeePerDay * originalDays;
    // Pro-rate processing fee for this segment
    const processingFee = totalDays > 0
      ? totalHostProcessingFee * (originalDays / totalDays)
      : 0;
    const earnings = Math.max(0, originalRental - hostFee - processingFee);

    segments.push({
      days: originalDays,
      rental: originalRental,
      hostFee,
      hostProcessingFee: processingFee,
      earnings,
      dailyEarnings: earnings / originalDays
    });
  }

  // Extension segments
  for (const ext of extensions) {
    const extDays = ext.days || 0;
    if (extDays <= 0) continue;

    const extRental = ext.rental || 0;
    const extHostFee = hostFeePerDay * extDays;
    // Use stored hostProcessingFee if available, otherwise pro-rate from total
    const extProcessingFee = ext.hostProcessingFee != null
      ? ext.hostProcessingFee
      : (totalDays > 0 ? totalHostProcessingFee * (extDays / totalDays) : 0);
    const extEarnings = Math.max(0, extRental - extHostFee - extProcessingFee);

    segments.push({
      days: extDays,
      rental: extRental,
      hostFee: extHostFee,
      hostProcessingFee: extProcessingFee,
      earnings: extEarnings,
      dailyEarnings: extEarnings / extDays
    });
  }

  return segments;
}

/**
 * Calculate total host earnings for a booking using segment-based math.
 *
 * @param {Object} booking
 * @returns {number} total earnings
 */
function getTotalSegmentEarnings(booking) {
  const segments = getBookingSegments(booking);
  return segments.reduce((sum, seg) => sum + seg.earnings, 0);
}

/**
 * Calculate earnings for a specific range of days (1-indexed, inclusive).
 * Used for partial payouts: e.g. days 3-7 after days 1-2 were already paid.
 *
 * @param {Array} segments - from getBookingSegments()
 * @param {number} fromDay - first day (1-indexed, inclusive)
 * @param {number} toDay - last day (1-indexed, inclusive)
 * @returns {{ earnings: number, breakdown: Array }}
 */
function calculateEarningsForDayRange(segments, fromDay, toDay) {
  let earnings = 0;
  let dayOffset = 0;
  const breakdown = [];

  for (const seg of segments) {
    const segStart = dayOffset + 1;
    const segEnd = dayOffset + seg.days;

    // Calculate overlap between [fromDay, toDay] and [segStart, segEnd]
    const overlapStart = Math.max(fromDay, segStart);
    const overlapEnd = Math.min(toDay, segEnd);

    if (overlapStart <= overlapEnd) {
      const overlapDays = overlapEnd - overlapStart + 1;
      const segEarnings = seg.dailyEarnings * overlapDays;
      earnings += segEarnings;
      breakdown.push({
        days: overlapDays,
        dailyEarnings: seg.dailyEarnings,
        segmentEarnings: segEarnings,
        rental: seg.rental,
        segmentDays: seg.days
      });
    }

    dayOffset += seg.days;
    if (dayOffset >= toDay) break;
  }

  return {
    earnings: parseFloat(earnings.toFixed(2)),
    breakdown
  };
}

module.exports = { getBookingSegments, getTotalSegmentEarnings, calculateEarningsForDayRange };
