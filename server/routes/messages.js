const express = require('express');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// Get unread message count for current user across all bookings
// IMPORTANT: This must be defined before /:bookingId to avoid being caught by the dynamic route
router.get('/unread/count', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all bookings where user is driver or host
    const userBookings = await Booking.find({
      $or: [{ driver: userId }, { host: userId }]
    }).select('_id');

    const bookingIds = userBookings.map(b => b._id);

    const count = await Message.countDocuments({
      booking: { $in: bookingIds },
      sender: { $ne: userId },
      read: false
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get per-booking unread message counts for current user
router.get('/unread/per-booking', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    // Find all bookings where user is driver or host
    const userBookings = await Booking.find({
      $or: [{ driver: userId }, { host: userId }]
    }).select('_id');

    // Ensure ObjectIds are properly typed for aggregate pipeline
    const bookingIds = userBookings.map(b => new mongoose.Types.ObjectId(b._id));
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Aggregate unread counts per booking
    const unreadCounts = await Message.aggregate([
      {
        $match: {
          booking: { $in: bookingIds },
          sender: { $ne: userObjectId },
          read: false
        }
      },
      {
        $group: {
          _id: '$booking',
          count: { $sum: 1 }
        }
      }
    ]);

    // Convert to a map of bookingId -> count
    const counts = {};
    unreadCounts.forEach(item => {
      counts[item._id.toString()] = item.count;
    });

    res.json({ counts });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get messages for a booking (no longer auto-marks as read; use POST /:bookingId/read instead)
router.get('/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only driver or host can view messages
    const userId = req.user._id.toString();
    if (booking.driver.toString() !== userId && booking.host.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized to view these messages' });
    }

    const messages = await Message.find({ booking: req.params.bookingId })
      .sort({ createdAt: 1 })
      .populate('sender', 'firstName lastName profileImage');

    res.json(messages);
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Mark messages as read for a booking (call when user opens chat or sends a message)
router.post('/:bookingId/read', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    const userId = req.user._id.toString();
    if (booking.driver.toString() !== userId && booking.host.toString() !== userId) {
      return res.status(403).json({ message: 'Not authorized' });
    }

    const result = await Message.updateMany(
      {
        booking: req.params.bookingId,
        sender: { $ne: req.user._id },
        read: false
      },
      { read: true }
    );

    res.json({ markedRead: result.modifiedCount });
  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Send a message
router.post('/:bookingId', auth, async (req, res) => {
  try {
    const { text } = req.body;

    if (!text || !text.trim()) {
      return res.status(400).json({ message: 'Message text is required' });
    }

    const booking = await Booking.findById(req.params.bookingId);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only driver or host can send messages
    const userId = req.user._id.toString();
    const isDriver = booking.driver.toString() === userId;
    const isHost = booking.host.toString() === userId;

    if (!isDriver && !isHost) {
      return res.status(403).json({ message: 'Not authorized to send messages for this booking' });
    }

    // Only block messaging for cancelled bookings
    if (booking.status === 'cancelled') {
      return res.status(400).json({ message: 'Messaging is not available for cancelled reservations' });
    }

    const message = new Message({
      booking: req.params.bookingId,
      sender: req.user._id,
      senderRole: isDriver ? 'driver' : 'host',
      text: text.trim()
    });

    await message.save();

    // Populate sender info before returning
    await message.populate('sender', 'firstName lastName profileImage');

    res.status(201).json(message);
  } catch (error) {
    console.error('❌ Error sending message:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
