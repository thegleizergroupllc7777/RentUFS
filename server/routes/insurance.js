const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');
const { calculateProcessingFee } = require('../utils/stripeFee');

const router = express.Router();

// Insurance plans — Full Coverage only (Car Share + Ride Share)
// Pricing is placeholder — update to match carrier agreement
const INSURANCE_PLANS = {
  rideshare: {
    id: 'rideshare',
    name: 'Full Coverage',
    description: 'Car Share & Ride Share — Full collision and liability protection',
    pricePerDay: 28,
    category: 'rideshare',
    usage: 'RIDESHARE',
    coverage: {
      liability: true,
      collision: true,
      comprehensive: true,
      personalInjury: true,
      roadsideAssistance: true
    },
    details: [
      'Car Share & Ride Share Coverage',
      'Liability coverage up to $300,000',
      'Comprehensive coverage (theft, vandalism, weather)',
      'Personal injury protection',
      'Coverage in your name from pickup to return'
    ]
  }
};

// Get available insurance plans
// Plan selection is static; actual coverage is activated via TeqMobility in bookings flow
router.get('/plans', auth, async (req, res) => {
  try {
    const { totalDays } = req.query;

    const plans = Object.values(INSURANCE_PLANS).map(plan => ({
      ...plan,
      totalCost: plan.pricePerDay * (parseInt(totalDays) || 1)
    }));

    res.json({
      plans,
      source: 'static'
    });
  } catch (error) {
    console.error('Error fetching insurance plans:', error);
    res.status(500).json({ message: 'Failed to fetch insurance plans', error: error.message });
  }
});

// Get quote from insurance API
router.post('/quote', auth, async (req, res) => {
  try {
    const { bookingId, planId, driverInfo } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email dateOfBirth');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify authorization
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Map legacy plan IDs to new category structure
    const LEGACY_MAP = { basic: 'carshare', standard: 'rideshare', premium: 'rideshare', protection: 'rideshare' };
    const resolvedPlanId = LEGACY_MAP[planId] || planId;
    const plan = INSURANCE_PLANS[resolvedPlanId];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid insurance plan' });
    }

    // Calculate quote using static pricing
    const totalCost = plan.pricePerDay * booking.totalDays;

    res.json({
      quote: {
        planId: plan.id,
        planName: plan.name,
        pricePerDay: plan.pricePerDay,
        totalDays: booking.totalDays,
        totalCost,
        coverage: plan.coverage,
        details: plan.details || [],
        validUntil: new Date(Date.now() + 30 * 60 * 1000) // Valid for 30 minutes
      },
      source: 'static'
    });
  } catch (error) {
    console.error('Error getting insurance quote:', error);
    res.status(500).json({ message: 'Failed to get insurance quote', error: error.message });
  }
});

// Add insurance to booking
router.post('/add-to-booking', auth, async (req, res) => {
  try {
    const { bookingId, planId, quoteId } = req.body;

    const booking = await Booking.findById(bookingId)
      .populate('vehicle')
      .populate('driver');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify authorization
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Only allow adding insurance before payment
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Cannot modify insurance after payment' });
    }

    // Map legacy plan IDs to new category structure
    const LEGACY_MAP = { basic: 'carshare', standard: 'rideshare', premium: 'rideshare', protection: 'rideshare' };
    const resolvedPlanId = LEGACY_MAP[planId] || planId;
    const plan = INSURANCE_PLANS[resolvedPlanId];
    if (!plan) {
      return res.status(400).json({ message: 'Invalid insurance plan' });
    }

    const selectedPlan = plan;
    const insuranceCost = selectedPlan.pricePerDay * booking.totalDays;

    // Calculate the difference in insurance cost
    const previousInsuranceCost = booking.insurance?.totalCost || 0;
    const priceDifference = insuranceCost - previousInsuranceCost;

    // Update booking with insurance
    // Actual coverage is activated via TeqMobility when pickup inspection is completed
    booking.insurance = {
      type: resolvedPlanId,
      provider: 'teqmobility',
      policyNumber: null,
      costPerDay: selectedPlan.pricePerDay,
      totalCost: insuranceCost,
      coverage: selectedPlan.coverage
    };

    // Remove old processing fee from total, add insurance difference
    const oldDriverProcessingFee = booking.driverProcessingFee || 0;
    booking.totalPrice = booking.totalPrice - oldDriverProcessingFee + priceDifference;

    // Recalculate processing fee on new base total (rental + platform fee + insurance)
    const { stripeFee, driverProcessingFee, hostProcessingFee } = calculateProcessingFee(booking.totalPrice);
    booking.totalPrice = booking.totalPrice + driverProcessingFee;
    booking.stripeFee = stripeFee;
    booking.driverProcessingFee = driverProcessingFee;
    booking.hostProcessingFee = hostProcessingFee;

    // Update host earnings with new processing fee
    const rentalSubtotal = booking.rentalSubtotal || booking.pricePerDay * booking.totalDays;
    const hostPlatformFee = booking.hostPlatformFee || (booking.hostPlatformFeePerDay || 1.50) * booking.totalDays;
    booking.hostEarnings = rentalSubtotal - hostPlatformFee - hostProcessingFee;

    // Update revenue split: RentUFS keeps driverFee + hostFee + insurance
    booking.platformRevenue = (booking.platformFee || (booking.platformFeePerDay || 1.50) * booking.totalDays) + hostPlatformFee + insuranceCost;

    await booking.save();

    res.json({
      success: true,
      booking: {
        _id: booking._id,
        insurance: booking.insurance,
        totalPrice: booking.totalPrice,
        driverProcessingFee: booking.driverProcessingFee,
        stripeFee: booking.stripeFee,
        priceBreakdown: {
          rental: rentalSubtotal,
          insurance: insuranceCost,
          processingFee: driverProcessingFee,
          total: booking.totalPrice
        }
      }
    });
  } catch (error) {
    console.error('Error adding insurance to booking:', error);
    res.status(500).json({ message: 'Failed to add insurance', error: error.message });
  }
});

// Remove insurance from booking
router.post('/remove-from-booking', auth, async (req, res) => {
  try {
    const { bookingId } = req.body;

    const booking = await Booking.findById(bookingId);

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Verify authorization
    if (booking.driver.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    // Only allow removing insurance before payment
    if (booking.paymentStatus === 'paid') {
      return res.status(400).json({ message: 'Cannot modify insurance after payment' });
    }

    // Remove insurance cost and old processing fee from total
    const insuranceCost = booking.insurance?.totalCost || 0;
    const oldDriverProcessingFee = booking.driverProcessingFee || 0;
    booking.totalPrice = booking.totalPrice - insuranceCost - oldDriverProcessingFee;

    // Recalculate processing fee on new base total (rental + platform fee, no insurance)
    const { stripeFee, driverProcessingFee, hostProcessingFee } = calculateProcessingFee(booking.totalPrice);
    booking.totalPrice = booking.totalPrice + driverProcessingFee;
    booking.stripeFee = stripeFee;
    booking.driverProcessingFee = driverProcessingFee;
    booking.hostProcessingFee = hostProcessingFee;

    // Update host earnings with new processing fee
    const rentalSubtotal = booking.rentalSubtotal || booking.pricePerDay * booking.totalDays;
    const hostPlatformFee = booking.hostPlatformFee || (booking.hostPlatformFeePerDay || 1.50) * booking.totalDays;
    booking.hostEarnings = rentalSubtotal - hostPlatformFee - hostProcessingFee;

    // Update revenue split: RentUFS keeps driverFee + hostFee when no insurance
    booking.platformRevenue = (booking.platformFee || (booking.platformFeePerDay || 1.50) * booking.totalDays) + hostPlatformFee;

    // Reset insurance to none
    booking.insurance = {
      type: 'none',
      provider: null,
      policyNumber: null,
      costPerDay: 0,
      totalCost: 0,
      coverage: {
        liability: false,
        collision: false,
        comprehensive: false,
        personalInjury: false,
        roadsideAssistance: false
      }
    };

    await booking.save();

    res.json({
      success: true,
      booking: {
        _id: booking._id,
        insurance: booking.insurance,
        totalPrice: booking.totalPrice,
        driverProcessingFee: booking.driverProcessingFee
      }
    });
  } catch (error) {
    console.error('Error removing insurance from booking:', error);
    res.status(500).json({ message: 'Failed to remove insurance', error: error.message });
  }
});

module.exports = router;
