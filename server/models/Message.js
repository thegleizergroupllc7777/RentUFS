const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  senderRole: {
    type: String,
    enum: ['driver', 'host'],
    required: true
  },
  text: {
    type: String,
    required: true,
    trim: true,
    maxlength: 1000
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index for efficient queries
messageSchema.index({ booking: 1, createdAt: 1 });

module.exports = mongoose.model('Message', messageSchema);
