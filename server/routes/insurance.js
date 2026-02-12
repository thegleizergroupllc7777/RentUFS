const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');

const router = express.Router();

// Insurance plans — 2 TeqMobility coverage categories + decline
// Pricing is placeholder — update to match carrier agreement
const INSURANCE_PLANS = {
  none: {
    id: 'none',
    name: 'Decline Coverage',
    description: 'I have my own insurance and choose not to add coverage through RentUFS',
    pricePerDay: 0,
    category: 'decline',
    usage: null,
    coverage: {
      liability: false,
      collision: false,
      comprehensive: false,
      personalInjury: false,
      roadsideAssistance: false
    },
    details: [
      'You are responsible for providing your own coverage',
      'Your personal auto policy may or may not cover rental vehicles',
      'Check with your insurer before declining'
    ]
  },
  carshare: {
    id: 'carshare',
    name: 'Liability Coverage',
    description: 'Car Share — Liability protection for your rental trip',
    pricePerDay: 15,
    category: 'carshare',
    usage: 'CARSHARE',
    coverage: {
      liability: true,
      collision: false,
      comprehensive: false,
      personalInjury: false,
      roadsideAssistance: true
    },
    details: [
      'Liability coverage up to $300,000',
      'Third-party bodily injury and property damage',
      '24/7 roadside assistance',
      'Coverage in your name from pickup to return'
    ]
  },
  rideshare: {
    id: 'rideshare',
    name: 'Full Coverage',
    description: 'Ride Share — Full collision and liability protection',
    pricePerDay: 29,
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
      'Liability coverage up to $300,000',
      'Collision damage waiver (CDW)',
      'Comprehensive coverage (theft, vandalism, weather)',
      'Personal injury protection',
      '24/7 roadside assistance',
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
    if (!plan && resolvedPlanId !== 'none') {
      return res.status(400).json({ message: 'Invalid insurance plan' });
    }

    const selectedPlan = plan || INSURANCE_PLANS.none;
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

    // Update total price to include insurance
    booking.totalPrice = booking.totalPrice + priceDifference;

    // Update revenue split: platform keeps platformFee + insurance
    booking.platformRevenue = (booking.platformFee || (booking.platformFeePerDay || 1.50) * booking.totalDays) + insuranceCost;
    // Host earnings stays the same (rental subtotal only)

    await booking.save();

    res.json({
      success: true,
      booking: {
        _id: booking._id,
        insurance: booking.insurance,
        totalPrice: booking.totalPrice,
        priceBreakdown: {
          rental: booking.pricePerDay * booking.totalDays,
          insurance: insuranceCost,
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

    // Remove insurance cost from total
    const insuranceCost = booking.insurance?.totalCost || 0;
    booking.totalPrice = booking.totalPrice - insuranceCost;

    // Update revenue split: platform only keeps platformFee when no insurance
    booking.platformRevenue = (booking.platformFee || (booking.platformFeePerDay || 1.50) * booking.totalDays);

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
        totalPrice: booking.totalPrice
      }
    });
  } catch (error) {
    console.error('Error removing insurance from booking:', error);
    res.status(500).json({ message: 'Failed to remove insurance', error: error.message });
  }
});

module.exports = router;
