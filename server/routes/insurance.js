const express = require('express');
const auth = require('../middleware/auth');
const Booking = require('../models/Booking');

const router = express.Router();

// Insurance plans with pricing (configurable via API or static)
// teqCoverageType maps to TeqMobility API coverage types: LIABILITY or FULL_COVERAGE
const INSURANCE_PLANS = {
  none: {
    id: 'none',
    name: 'No Insurance',
    description: 'I will use my own insurance coverage',
    pricePerDay: 0,
    teqCoverageType: null,
    coverage: {
      liability: false,
      collision: false,
      comprehensive: false,
      personalInjury: false,
      roadsideAssistance: false
    }
  },
  basic: {
    id: 'basic',
    name: 'Basic Protection',
    description: 'Liability coverage only - protects against third-party claims',
    pricePerDay: 15,
    teqCoverageType: 'LIABILITY',
    coverage: {
      liability: true,
      collision: false,
      comprehensive: false,
      personalInjury: false,
      roadsideAssistance: false
    },
    details: [
      'Up to $50,000 liability coverage',
      'Third-party property damage',
      'Basic legal protection'
    ]
  },
  standard: {
    id: 'standard',
    name: 'Standard Protection',
    description: 'Collision and liability coverage - covers most rental situations',
    pricePerDay: 29,
    teqCoverageType: 'FULL_COVERAGE',
    coverage: {
      liability: true,
      collision: true,
      comprehensive: false,
      personalInjury: false,
      roadsideAssistance: true
    },
    details: [
      'Up to $100,000 liability coverage',
      'Collision damage waiver (CDW)',
      '24/7 roadside assistance',
      '$500 deductible'
    ]
  },
  premium: {
    id: 'premium',
    name: 'Premium Protection',
    description: 'Full comprehensive coverage - complete peace of mind',
    pricePerDay: 45,
    teqCoverageType: 'FULL_COVERAGE',
    coverage: {
      liability: true,
      collision: true,
      comprehensive: true,
      personalInjury: true,
      roadsideAssistance: true
    },
    details: [
      'Up to $300,000 liability coverage',
      'Full collision damage waiver',
      'Comprehensive coverage (theft, vandalism, weather)',
      'Personal injury protection',
      '24/7 roadside assistance',
      '$0 deductible',
      'Loss of use coverage'
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

    const plan = INSURANCE_PLANS[planId];
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

    const plan = INSURANCE_PLANS[planId];
    if (!plan && planId !== 'none') {
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
      type: planId,
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
