const express = require('express');
const Review = require('../models/Review');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Create review
router.post('/', auth, async (req, res) => {
  try {
    const { bookingId, vehicleId, revieweeId, reviewType, rating, comment } = req.body;

    const review = new Review({
      booking: bookingId,
      vehicle: vehicleId,
      reviewer: req.user._id,
      reviewee: revieweeId,
      reviewType,
      rating,
      comment
    });

    await review.save();

    // Update vehicle rating using aggregation instead of fetching all reviews
    if (reviewType === 'vehicle') {
      const [vehicleStats] = await Review.aggregate([
        { $match: { vehicle: review.vehicle, reviewType: 'vehicle' } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
      ]);

      if (vehicleStats) {
        await Vehicle.findByIdAndUpdate(vehicleId, {
          rating: vehicleStats.avgRating,
          reviewCount: vehicleStats.count
        });
      }
    }

    // Update user rating using aggregation instead of fetching all reviews
    const [userStats] = await Review.aggregate([
      { $match: { reviewee: review.reviewee } },
      { $group: { _id: null, avgRating: { $avg: '$rating' }, count: { $sum: 1 } } }
    ]);

    if (userStats) {
      await User.findByIdAndUpdate(revieweeId, {
        rating: userStats.avgRating,
        reviewCount: userStats.count
      });
    }

    res.status(201).json(review);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user's reviews (returns booking IDs they've reviewed)
router.get('/my-reviews', auth, async (req, res) => {
  try {
    const reviews = await Review.find({ reviewer: req.user._id })
      .select('booking reviewType rating')
      .lean();
    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get vehicle reviews
router.get('/vehicle/:vehicleId', async (req, res) => {
  try {
    const reviews = await Review.find({
      vehicle: req.params.vehicleId,
      reviewType: 'vehicle'
    })
      .populate('reviewer', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .lean();

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user reviews
router.get('/user/:userId', async (req, res) => {
  try {
    const reviews = await Review.find({ reviewee: req.params.userId })
      .populate('reviewer', 'firstName lastName profileImage')
      .sort({ createdAt: -1 })
      .lean();

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
