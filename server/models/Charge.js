const mongoose = require('mongoose');

// Host-initiated post-trip charge (citation, parking ticket, cleaning fee, etc.)
// Mirrors the TollCharge / settlement pattern but is created manually by the host
// rather than ingested from a 3rd-party partner.
const chargeSchema = new mongoose.Schema({
  booking: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booking',
    required: true,
    index: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  chargeType: {
    type: String,
    enum: [
      'citation',
      'parking_ticket',
      'manual_toll',
      'late_return',
      'cleaning',
      'fuel',
      'smoking_violation',
      'other'
    ],
    required: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0.01,
    max: 150
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  proofImage: {
    type: String,
    required: true
  },
  dateIncurred: {
    type: Date,
    required: true
  },

  // Lifecycle
  status: {
    type: String,
    enum: ['pending', 'charged', 'failed', 'waived'],
    default: 'pending',
    index: true
  },
  scheduledChargeAt: {
    type: Date,
    required: true,
    index: true
  },
  chargedAt: { type: Date, default: null },
  waivedAt: { type: Date, default: null },

  // Stripe references (populated after settlement)
  paymentIntentId: { type: String, default: null },
  transferId: { type: String, default: null },
  lastFailureMessage: { type: String, default: null },
  retryCount: { type: Number, default: 0 },
  lastRetryAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now }
});

chargeSchema.index({ driver: 1, status: 1 });
chargeSchema.index({ status: 1, scheduledChargeAt: 1 });

module.exports = mongoose.model('Charge', chargeSchema);
