const mongoose = require('mongoose');

// Counter schema for auto-incrementing reservation IDs
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.models.Counter || mongoose.model('Counter', counterSchema);

const bookingSchema = new mongoose.Schema({
  reservationId: {
    type: String,
    unique: true,
    sparse: true
  },
  vehicle: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Vehicle',
    required: true
  },
  driver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  startDate: {
    type: Date,
    required: true
  },
  endDate: {
    type: Date,
    required: true
  },
  pickupTime: {
    type: String,
    default: '10:00'
  },
  dropoffTime: {
    type: String,
    default: '10:00'
  },
  totalDays: {
    type: Number,
    required: true
  },
  rentalType: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    default: 'daily'
  },
  quantity: {
    type: Number,
    default: 1
  },
  pricePerDay: {
    type: Number,
    required: true
  },
  totalPrice: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  message: {
    type: String,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'failed'],
    default: 'pending'
  },
  paymentSessionId: {
    type: String,
    default: null
  },
  extensions: [{
    days: Number,
    cost: Number,
    paymentId: String,
    extendedAt: { type: Date, default: Date.now }
  }],
  // Vehicle inspection photos at pickup
  pickupInspection: {
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
    photos: {
      frontView: { type: String, default: null },
      backView: { type: String, default: null },
      leftSide: { type: String, default: null },
      rightSide: { type: String, default: null }
    },
    notes: { type: String, default: '' }
  },
  // Vehicle inspection photos at return
  returnInspection: {
    completed: { type: Boolean, default: false },
    completedAt: { type: Date },
    photos: {
      frontView: { type: String, default: null },
      backView: { type: String, default: null },
      leftSide: { type: String, default: null },
      rightSide: { type: String, default: null }
    },
    notes: { type: String, default: '' }
  },
  insurance: {
    type: {
      type: String,
      enum: ['none', 'basic', 'standard', 'premium'],
      default: 'none'
    },
    provider: {
      type: String,
      default: null
    },
    policyNumber: {
      type: String,
      default: null
    },
    costPerDay: {
      type: Number,
      default: 0
    },
    totalCost: {
      type: Number,
      default: 0
    },
    coverage: {
      liability: { type: Boolean, default: false },
      collision: { type: Boolean, default: false },
      comprehensive: { type: Boolean, default: false },
      personalInjury: { type: Boolean, default: false },
      roadsideAssistance: { type: Boolean, default: false }
    }
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Generate reservation ID before saving new booking
bookingSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

  // Only generate reservationId for new documents
  if (this.isNew && !this.reservationId) {
    try {
      const counter = await Counter.findByIdAndUpdate(
        'reservationId',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );
      // Format: RUFS-00001, RUFS-00002, etc.
      this.reservationId = `RUFS-${counter.seq.toString().padStart(5, '0')}`;
    } catch (error) {
      console.error('Error generating reservation ID:', error);
    }
  }

  next();
});

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
module.exports.Counter = Counter;
