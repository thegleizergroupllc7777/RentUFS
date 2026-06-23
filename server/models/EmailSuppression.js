const mongoose = require('mongoose');

// Email addresses that have unsubscribed from marketing/broadcast emails but do
// NOT have a user account (prospects the sales team emailed). Registered users
// use the User.emailOptOut flag instead. Checked before every prospect send so
// an unsubscribe is always honored.
const emailSuppressionSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  unsubscribedAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.models.EmailSuppression || mongoose.model('EmailSuppression', emailSuppressionSchema);
