const express = require('express');
const Message = require('../models/Message');
const Booking = require('../models/Booking');
const auth = require('../middleware/auth');

const router = express.Router();

// Get messages for a booking
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

    // Mark unread messages from the other party as read
    await Message.updateMany(
      {
        booking: req.params.bookingId,
        sender: { $ne: req.user._id },
        read: false
      },
      { read: true }
    );

    res.json(messages);
  } catch (error) {
    console.error('❌ Error fetching messages:', error);
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

    // Only allow messaging for confirmed or active bookings
    if (!['confirmed', 'active'].includes(booking.status)) {
      return res.status(400).json({ message: 'Messaging is only available for confirmed or active reservations' });
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

// Get unread message count for current user across all bookings
router.get('/unread/count', auth, async (req, res) => {
  try {
    const count = await Message.countDocuments({
      sender: { $ne: req.user._id },
      read: false
    });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
