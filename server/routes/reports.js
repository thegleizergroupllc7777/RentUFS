const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');

const router = express.Router();

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
      let start;
      switch (period) {
        case 'today':
          start = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          break;
        case 'month':
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          break;
        case 'year':
          start = new Date(now);
          start.setFullYear(start.getFullYear() - 1);
          break;
        default:
          start = new Date(0); // All time
      }
      dateFilter = { createdAt: { $gte: start } };
    }

    // Get all bookings for this host within the date range
    const bookings = await Booking.find({
      host: hostId,
      ...dateFilter
    }).populate('vehicle').populate('driver', 'firstName lastName email');

    // Calculate overall stats
    const totalBookings = bookings.length;
    const confirmedBookings = bookings.filter(b => b.status === 'confirmed' || b.status === 'completed' || b.status === 'active');
    const paidBookings = bookings.filter(b => b.paymentStatus === 'paid');

    // Use Number() to ensure proper addition (not string concatenation)
    const totalRevenue = paidBookings.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);

    // Only count as "pending revenue" bookings that are:
    // 1. Actually confirmed/active (not abandoned checkout attempts)
    // 2. But payment is still pending
    // Bookings with status='pending' are just abandoned cart items, not real pending revenue
    const realPendingBookings = bookings.filter(b =>
      ['confirmed', 'active'].includes(b.status) &&
      b.paymentStatus === 'pending'
    );
    const pendingRevenue = realPendingBookings.reduce((sum, b) => sum + (Number(b.totalPrice) || 0), 0);

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
          vehicleImage: booking.vehicle.images?.[0] || null,
          totalBookings: 0,
          confirmedBookings: 0,
          totalDays: 0,
          totalRevenue: 0,
          pendingRevenue: 0
        };
      }

      vehicleStats[vehicleId].totalBookings++;

      if (['confirmed', 'completed', 'active'].includes(booking.status)) {
        vehicleStats[vehicleId].confirmedBookings++;
      }

      if (booking.paymentStatus === 'paid') {
        vehicleStats[vehicleId].totalRevenue += (Number(booking.totalPrice) || 0);
        vehicleStats[vehicleId].totalDays += (Number(booking.totalDays) || 0);
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
      dailyRevenue[date] += (Number(booking.totalPrice) || 0);
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
      .slice(0, 10)
      .map(b => ({
        id: b._id,
        vehicleName: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Unknown',
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
        pendingRevenue, // Only confirmed/active bookings awaiting payment
        pendingBookingsCount: realPendingBookings.length,
        // Show abandoned checkout attempts for reference
        abandonedPendingRevenue: abandonedValue,
        abandonedPendingCount: abandonedBookings.length,
        averageBookingValue: paidBookings.length > 0 ? totalRevenue / paidBookings.length : 0,
        totalDaysBooked: paidBookings.reduce((sum, b) => sum + (Number(b.totalDays) || 0), 0)
      },
      vehicleStats: Object.values(vehicleStats).sort((a, b) => b.totalRevenue - a.totalRevenue),
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
      let start;
      switch (period) {
        case 'today':
          start = new Date(now.setHours(0, 0, 0, 0));
          break;
        case 'week':
          start = new Date(now);
          start.setDate(start.getDate() - 7);
          break;
        case 'month':
          start = new Date(now);
          start.setMonth(start.getMonth() - 1);
          break;
        case 'year':
          start = new Date(now);
          start.setFullYear(start.getFullYear() - 1);
          break;
        default:
          start = new Date(0);
      }
      dateFilter = { createdAt: { $gte: start } };
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
