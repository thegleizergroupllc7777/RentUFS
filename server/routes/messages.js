const express = require('express');
const mongoose = require('mongoose');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// Get unread message count for current user across all bookings
// IMPORTANT: This must be defined before /:bookingId to avoid being caught by the dynamic route
// Accepts optional ?role=host|driver to use role-based filtering (needed for self-bookings)
router.get('/unread/count', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.query.role; // 'host' or 'driver'

    // Find all bookings where user is driver or host
    const userBookings = await Booking.find({
      $or: [{ driver: userId }, { host: userId }]
    }).select('_id');

    const bookingIds = userBookings.map(b => b._id);

    if (bookingIds.length === 0) {
      return res.json({ count: 0 });
    }

    // Use role-based filtering if role is provided (works for self-bookings)
    // Otherwise fall back to sender-based filtering
    const matchFilter = {
      booking: { $in: bookingIds },
      read: false
    };

    if (role && ['host', 'driver'].includes(role)) {
      // Count messages NOT from my current role (e.g., if I'm host, count driver messages)
      matchFilter.senderRole = { $ne: role };
    } else {
      // Fallback: count messages not from me
      matchFilter.sender = { $ne: userId };
    }

    const count = await Message.countDocuments(matchFilter);

    res.json({ count });
  } catch (error) {
    console.error('❌ Error fetching unread count:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get per-booking unread message counts for current user
// Accepts optional ?role=host|driver for role-based filtering
router.get('/unread/per-booking', auth, async (req, res) => {
  try {
    const userId = req.user._id;
    const role = req.query.role; // 'host' or 'driver'

    // Find all bookings where user is driver or host
    const userBookings = await Booking.find({
      $or: [{ driver: userId }, { host: userId }]
    }).select('_id');

    // Ensure ObjectIds are properly typed for aggregate pipeline
    const bookingIds = userBookings.map(b => new mongoose.Types.ObjectId(b._id));
    const userObjectId = new mongoose.Types.ObjectId(userId);

    // Build match filter - role-based or sender-based
    const matchFilter = {
      booking: { $in: bookingIds },
      read: false
    };

    if (role && ['host', 'driver'].includes(role)) {
      matchFilter.senderRole = { $ne: role };
    } else {
      matchFilter.sender = { $ne: userObjectId };
    }

    // Aggregate unread counts per booking
    const unreadCounts = await Message.aggregate([
      { $match: matchFilter },
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
// Accepts optional { role: 'host'|'driver' } in body for role-based filtering
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

    const role = req.body.role; // optional: 'host' or 'driver'

    // Build filter - role-based or sender-based
    const filter = {
      booking: req.params.bookingId,
      read: false
    };

    if (role && ['host', 'driver'].includes(role)) {
      // Mark messages from the OTHER role as read
      filter.senderRole = { $ne: role };
    } else {
      // Fallback: mark messages from other users as read
      filter.sender = { $ne: req.user._id };
    }

    const result = await Message.updateMany(filter, { read: true });

    if (result.modifiedCount > 0) {
      console.log(`✅ Marked ${result.modifiedCount} messages as read for booking ${req.params.bookingId} by user ${req.user._id} (role: ${role || 'auto'})`);
    }
    res.json({ markedRead: result.modifiedCount });
  } catch (error) {
    console.error('❌ Error marking messages as read:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Send a message
// Accepts optional { senderRole: 'host'|'driver' } to override auto-detected role
// This is needed for self-bookings where user is both host and driver
router.post('/:bookingId', auth, async (req, res) => {
  try {
    const { text, senderRole: requestedRole } = req.body;

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

    // Use requested role if valid and user has that role, otherwise auto-detect
    let role;
    if (requestedRole && ['host', 'driver'].includes(requestedRole)) {
      // Validate the requested role matches the user's relationship to the booking
      if ((requestedRole === 'host' && isHost) || (requestedRole === 'driver' && isDriver)) {
        role = requestedRole;
      } else {
        role = isHost ? 'host' : 'driver';
      }
    } else {
      // Auto-detect: prefer host if user is host-only, driver if driver-only
      // For users who are both, default to host (since isHost check is more specific for host actions)
      role = isHost && !isDriver ? 'host' : isDriver && !isHost ? 'driver' : isDriver ? 'driver' : 'host';
    }

    const message = new Message({
      booking: req.params.bookingId,
      sender: req.user._id,
      senderRole: role,
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
