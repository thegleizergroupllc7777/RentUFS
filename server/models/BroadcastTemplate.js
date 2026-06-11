const mongoose = require('mongoose');

// Saved message templates for the admin Broadcast tool. Lets admins reuse
// common messages (discounts, host bonuses, announcements, etc.) instead of
// retyping them every time. Purely an admin convenience — not tied to any
// booking, payment, or user-facing flow.
const broadcastTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  channel: { type: String, enum: ['email', 'sms', 'both'], default: 'both' },
  subject: { type: String, trim: true, default: '' }, // email subject (ignored for SMS-only)
  message: { type: String, required: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('BroadcastTemplate', broadcastTemplateSchema);
