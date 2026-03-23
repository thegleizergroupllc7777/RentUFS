const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');

const router = express.Router();

const EST_OFFSET = 5; // hours behind UTC

// Helper: get Monday–Sunday payout week boundaries in EST
function getPayoutWeekRange(now) {
  const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
  const dayOfWeekEST = nowEST.getUTCDay(); // 0=Sun, 1=Mon, ...
  const daysSinceMonday = dayOfWeekEST === 0 ? 6 : dayOfWeekEST - 1;
  // Monday 00:00:00 EST = 05:00:00 UTC
  const start = new Date(Date.UTC(nowEST.getUTCFullYear(), nowEST.getUTCMonth(), nowEST.getUTCDate() - daysSinceMonday, EST_OFFSET, 0, 0, 0));
  // Sunday 23:59:59.999 EST
  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
  return { start, end };
}

// Helper: get 1st–last day of current month in EST
function getCalendarMonthRange(now) {
  const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
  const year = nowEST.getUTCFullYear();
  const month = nowEST.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1, EST_OFFSET, 0, 0, 0));
  const end = new Date(Date.UTC(year, month + 1, 1, EST_OFFSET, 0, 0, 0) - 1);
  return { start, end };
}

// Helper: get Jan 1–Dec 31 of current year in EST
function getCalendarYearRange(now) {
  const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
  const year = nowEST.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1, EST_OFFSET, 0, 0, 0));
  const end = new Date(Date.UTC(year + 1, 0, 1, EST_OFFSET, 0, 0, 0) - 1);
  return { start, end };
}

// Get host reports/analytics
router.get('/host', auth, async (req, res) => {
  try {
    const { period, startDate, endDate } = req.query;
    const hostId = req.user._id;

    // Calculate date range based on period
    let dateFilter = {};
    const now = new Date();

    if (startDate && endDate) {
      // Custom date range
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
        }
      };
    } else if (period) {
      switch (period) {
        case 'today': {
          const start = new Date(now.setHours(0, 0, 0, 0));
          dateFilter = { createdAt: { $gte: start } };
          break;
        }
        case 'week': {
          const { start, end } = getPayoutWeekRange(new Date());
          dateFilter = { createdAt: { $gte: start, $lte: end } };
          break;
        }
        case 'month': {
          const { start, end } = getCalendarMonthRange(new Date());
          dateFilter = { createdAt: { $gte: start, $lte: end } };
          break;
        }
        case 'year': {
          const { start, end } = getCalendarYearRange(new Date());
          dateFilter = { createdAt: { $gte: start, $lte: end } };
          break;
        }
        default:
          dateFilter = { createdAt: { $gte: new Date(0) } };
      }
    }

    // Get all bookings for this host within the date range
    const bookings = await Booking.find({
      host: hostId,
      ...dateFilter
    }).populate('vehicle').populate('driver', 'firstName lastName email');

    // Helper: compute correct financial values using segment-based math (handles extensions with mixed rental types)
    const { getBookingSegments } = require('../utils/earningSegments');
    const computeBookingFinancials = (b) => {
      const totalDays = Number(b.totalDays) || 0;
      const segments = getBookingSegments(b);
      const rentalSubtotal = segments.reduce((sum, seg) => sum + seg.rental, 0);
      const hostFee = segments.reduce((sum, seg) => sum + seg.hostFee, 0);
      const driverFee = (Number(b.platformFeePerDay) || 1.50) * totalDays;
      const insuranceCost = Number(b.insurance?.totalCost) || 0;
      const hostProcessingFee = segments.reduce((sum, seg) => sum + seg.hostProcessingFee, 0);
      const hostEarnings = segments.reduce((sum, seg) => sum + seg.earnings, 0);
      const platformRevenue = driverFee + hostFee + insuranceCost;
      return { rentalSubtotal, hostFee, driverFee, insuranceCost, hostProcessingFee, hostEarnings, platformRevenue };
    };

    // Calculate overall stats
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed' || b.status === 'active');
    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');

    // Use Number() to ensure proper addition (not string concatenation)
    const totalRevenue = paidBookings.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);

    // Revenue split: always compute from per-day rates for accuracy
    const totalHostEarnings = paidBookings.reduce((sum, b) => sum + computeBookingFinancials(b).hostEarnings, 0);
    const totalPlatformRevenue = paidBookings.reduce((sum, b) => sum + computeBookingFinancials(b).platformRevenue, 0);

    // Only count as "pending revenue" bookings that are:
    // 1. Actually confirmed/active (not abandoned checkout attempts)
    // 2. But payment is still pending
    // Bookings with status='pending' are just abandoned cart items, not real pending revenue
    const realPendingBookings = bookings.filter(b =>
      ['confirmed', 'active'].includes(b.status) &&
      b.paymentStatus === 'pending'
    );
    const pendingRevenue = realPendingBookings.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);

    // Total host platform fees deducted from host earnings (always compute from per-day rate)
    const totalHostPlatformFees = paidBookings.reduce((sum, b) => sum + computeBookingFinancials(b).hostFee, 0);

    // Count abandoned bookings (status=pending, never completed) for reference
    const abandonedBookings = bookings.filter(b =>
      b.status === 'pending' &&
      b.paymentStatus === 'pending' &&
      b.status !== 'cancelled'
    );
    const abandonedValue = abandonedBookings.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);

    // Calculate per-vehicle stats
    const vehicleStats = {};
    bookings.forEach(booking => {
      if (!booking.vehicle) return;

      const vehicleId = booking.vehicle._id.toString();
      const vehicleName = `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}`;

      if (!vehicleStats[vehicleId]) {
        vehicleStats[vehicleId] = {
          vehicleId,
          vehicleName,
          vehicleNickname: booking.vehicle.nickname || null,
          vehicleImage: booking.vehicle.images?.[0] || null,
          totalBookings: 0,
          confirmedBookings: 0,
          totalDays: 0,
          totalRevenue: 0,
          hostEarnings: 0,
          hostPlatformFees: 0,
          platformRevenue: 0,
          pendingRevenue: 0
        };
      }

      vehicleStats[vehicleId].totalBookings++;

      if (['confirmed', 'completed', 'active'].includes(booking.status)) {
        vehicleStats[vehicleId].confirmedBookings++;
      }

      if (booking.paymentStatus === 'paid') {
        const financials = computeBookingFinancials(booking);
        vehicleStats[vehicleId].totalRevenue += (Number(booking.totalPrice) || 0);
        vehicleStats[vehicleId].totalDays += (Number(booking.totalDays) || 0);
        vehicleStats[vehicleId].hostPlatformFees += financials.hostFee;
        vehicleStats[vehicleId].hostEarnings += financials.hostEarnings;
        vehicleStats[vehicleId].platformRevenue += financials.platformRevenue;
      } else if (['confirmed', 'active'].includes(booking.status) && booking.paymentStatus === 'pending') {
        // Only count confirmed/active bookings awaiting payment as real pending revenue
        vehicleStats[vehicleId].pendingRevenue += (Number(booking.totalPrice) || 0);
      }
    });

    // Calculate daily revenue for chart (last 30 days or within date range)
    const dailyRevenue = {};
    const chartStart = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const chartEnd = endDate ? new Date(endDate) : new Date();

    paidBookings.forEach(booking => {
      const date = booking.createdAt.toISOString().split('T')[0];
      if (!dailyRevenue[date]) {
        dailyRevenue[date] = 0;
      }
      dailyRevenue[date] += computeBookingFinancials(booking).hostEarnings;
    });

    // Fill in missing dates with 0
    const dailyRevenueArray = [];
    const currentDate = new Date(chartStart);
    while (currentDate <= chartEnd) {
      const dateStr = currentDate.toISOString().split('T')[0];
      dailyRevenueArray.push({
        date: dateStr,
        revenue: dailyRevenue[dateStr] || 0
      });
      currentDate.setDate(currentDate.getDate() + 1);
    }

    // Get recent bookings
    const recentBookings = bookings
      .sort((a, b) => b.createdAt - a.createdAt)
      .map(b => ({
        id: b._id,
        reservationId: b.reservationId || null,
        vehicleName: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Unknown',
        vehicleNickname: b.vehicle?.nickname || null,
        driverName: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : 'Unknown',
        startDate: b.startDate,
        endDate: b.endDate,
        totalDays: b.totalDays,
        totalPrice: b.totalPrice,
        status: b.status,
        paymentStatus: b.paymentStatus,
        createdAt: b.createdAt
      }));

    res.json({
      summary: {
        totalBookings,
        confirmedBookings: confirmedBookings.length,
        cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
        totalRevenue,
        hostEarnings: totalHostEarnings,
        hostPlatformFees: totalHostPlatformFees,
        platformRevenue: totalPlatformRevenue,
        pendingRevenue, // Only confirmed/active bookings awaiting payment
        pendingBookingsCount: realPendingBookings.length,
        // Show abandoned checkout attempts for reference
        abandonedPendingRevenue: abandonedValue,
        abandonedPendingCount: abandonedBookings.length,
        averageBookingValue: paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0,
        totalDaysBooked: paidBookings.reduce((sum, b) => sum + (Number(b.totalDays) || 0), 0)
      },
      vehicleStats: Object.values(vehicleStats).sort((a, b) => b.hostEarnings - a.hostEarnings),
      dailyRevenue: dailyRevenueArray,
      recentBookings
    });

  } catch (error) {
    console.error('Reports error:', error);
    res.status(500).json({ message: 'Failed to fetch reports', error: error.message });
  }
});

// Get vehicle-specific report
router.get('/vehicle/:vehicleId', auth, async (req, res) => {
  try {
    const { vehicleId } = req.params;
    const { period, startDate, endDate } = req.query;
    const hostId = req.user._id;

    // Verify the vehicle belongs to this host
    const vehicle = await Vehicle.findOne({ _id: vehicleId, host: hostId });
    if (!vehicle) {
      return res.status(404).json({ message: 'Vehicle not found or unauthorized' });
    }

    // Calculate date range
    let dateFilter = {};
    const now = new Date();

    if (startDate && endDate) {
      dateFilter = {
        createdAt: {
          $gte: new Date(startDate),
          $lte: new Date(new Date(endDate).setHours(23, 59, 59, 999))
        }
      };
    } else if (period) {
      switch (period) {
        case 'today': {
          const start = new Date(now.setHours(0, 0, 0, 0));
          dateFilter = { createdAt: { $gte: start } };
          break;
        }
        case 'week': {
          const { start, end } = getPayoutWeekRange(new Date());
          dateFilter = { createdAt: { $gte: start, $lte: end } };
          break;
        }
        case 'month': {
          const { start, end } = getCalendarMonthRange(new Date());
          dateFilter = { createdAt: { $gte: start, $lte: end } };
          break;
        }
        case 'year': {
          const { start, end } = getCalendarYearRange(new Date());
          dateFilter = { createdAt: { $gte: start, $lte: end } };
          break;
        }
        default:
          dateFilter = { createdAt: { $gte: new Date(0) } };
      }
    }

    // Get bookings for this vehicle
    const bookings = await Booking.find({
      vehicle: vehicleId,
      host: hostId,
      ...dateFilter
    }).populate('driver', 'firstName lastName email');

    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');
    const totalRevenue = paidBookings.reduce((sum, b) => sum + b.totalPrice, 0);

    res.json({
      vehicle: {
        id: vehicle._id,
        name: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
        image: vehicle.images?.[0] || null,
        pricePerDay: vehicle.pricePerDay
      },
      stats: {
        totalBookings: bookings.length,
        confirmedBookings: bookings.filter(b => ['confirmed', 'completed', 'active'].includes(b.status)).length,
        cancelledBookings: bookings.filter(b => b.status === 'cancelled').length,
        totalRevenue,
        totalDaysBooked: paidBookings.reduce((sum, b) => sum + b.totalDays, 0),
        averageBookingDuration: paidBookings.length > 0
          ? paidBookings.reduce((sum, b) => sum + b.totalDays, 0) / paidBookings.length
          : 0
      },
      bookings: bookings.map(b => ({
        id: b._id,
        driverName: b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : 'Unknown',
        driverEmail: b.driver?.email,
        startDate: b.startDate,
        endDate: b.endDate,
        totalDays: b.totalDays,
        totalPrice: b.totalPrice,
        status: b.status,
        paymentStatus: b.paymentStatus,
        createdAt: b.createdAt
      }))
    });

  } catch (error) {
    console.error('Vehicle report error:', error);
    res.status(500).json({ message: 'Failed to fetch vehicle report', error: error.message });
  }
});

module.exports = router;
