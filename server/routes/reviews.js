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

    // Update vehicle rating if it's a vehicle review
    if (reviewType === 'vehicle') {
      const reviews = await Review.find({ vehicle: vehicleId, reviewType: 'vehicle' });
      const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;

      await Vehicle.findByIdAndUpdate(vehicleId, {
        rating: avgRating,
        reviewCount: reviews.length
      });
    }

    // Update user rating
    const userReviews = await Review.find({ reviewee: revieweeId });
    if (userReviews.length > 0) {
      const avgRating = userReviews.reduce((sum, r) => sum + r.rating, 0) / userReviews.length;

      await User.findByIdAndUpdate(revieweeId, {
        rating: avgRating,
        reviewCount: userReviews.length
      });
    }

    res.status(201).json(review);
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
      .sort({ createdAt: -1 });

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
      .sort({ createdAt: -1 });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
