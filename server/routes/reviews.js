const express = require('express');
const Review = require('../models/Review');
const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

const REVIEW_WINDOW_DAYS = 7;

// Create review
router.post('/', auth, async (req, res) => {
  try {
    const { bookingId, vehicleId, revieweeId, reviewType, rating, comment } = req.body;

    // Enforce 7-day review window after booking end date
    const booking = await Booking.findById(bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    if (booking.status !== 'completed') {
      return res.status(400).json({ message: 'Can only review completed bookings' });
    }
    const daysSinceEnd = Math.floor((new Date() - new Date(booking.endDate)) / (1000 * 60 * 60 * 24));
    if (daysSinceEnd > REVIEW_WINDOW_DAYS) {
      return res.status(400).json({ message: 'Review period has expired. Reviews must be submitted within 7 days of trip completion.' });
    }

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
