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
  pricePerUnit: {
    type: Number
  },
  rentalSubtotal: {
    type: Number
  },
  totalPrice: {
    type: Number,
    required: true
  },
  platformFeePerDay: {
    type: Number,
    default: 1.50
  },
  platformFee: {
    type: Number,
    default: 0
  },
  // Revenue split: platform keeps platformFee + insurance + hostPlatformFee, host gets the rest
  hostEarnings: {
    type: Number,
    default: 0
  },
  hostPlatformFeePerDay: {
    type: Number,
    default: 1.50
  },
  hostPlatformFee: {
    type: Number,
    default: 0
  },
  platformRevenue: {
    type: Number,
    default: 0
  },
  // Stripe processing fee split 50/50 between driver and host
  stripeFee: {
    type: Number,
    default: 0
  },
  driverProcessingFee: {
    type: Number,
    default: 0
  },
  hostProcessingFee: {
    type: Number,
    default: 0
  },
  // Payout tracking for host earnings via Stripe Connect
  payoutStatus: {
    type: String,
    enum: ['pending', 'eligible', 'scheduled', 'paid', 'failed', 'partial'],
    default: 'pending'
  },
  payoutId: {
    type: String,
    default: null
  },
  payoutDate: {
    type: Date,
    default: null
  },
  payoutAmount: {
    type: Number,
    default: 0
  },
  payoutEligibleDate: {
    type: Date,
    default: null
  },
  // Partial payout tracking for active bookings (paid weekly for days served)
  partialPayoutDaysPaid: {
    type: Number,
    default: 0
  },
  partialPayoutTotal: {
    type: Number,
    default: 0
  },
  lastPartialPayoutDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: ['awaiting_payment', 'pending', 'confirmed', 'active', 'completed', 'cancelled'],
    default: 'pending'
  },
  message: {
    type: String,
    default: ''
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'refunded', 'partial_refund', 'failed'],
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
  // Cancellation tracking
  cancellationReason: { type: String, default: null },
  cancelledBy: { type: String, enum: ['host', 'driver', null], default: null },
  cancelledAt: { type: Date, default: null },
  cancellationFee: { type: Number, default: 0 },
  // Vehicle switch history for when host transfers booking to another vehicle
  vehicleSwitchHistory: [{
    previousVehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle'
    },
    newVehicle: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Vehicle'
    },
    previousPrice: Number,
    newPrice: Number,
    priceDifference: Number,
    reason: String,
    paymentId: { type: String, default: null },
    switchedAt: { type: Date, default: Date.now }
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
      enum: ['none', 'basic', 'standard', 'premium', 'protection', 'carshare', 'rideshare'],
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
  // TeqMobility Dynamic Insurance
  teqMobility: {
    coverageId: { type: String, default: null },
    ownerId: { type: String, default: null },
    status: { type: String, default: null },
    cardUrl: { type: String, default: null },
    cardImage: { type: String, default: null },
    startedAt: { type: Date, default: null },
    stoppedAt: { type: Date, default: null },
    error: { type: String, default: null }
  },
  // Rental Agreement
  agreement: {
    signed: { type: Boolean, default: false },
    signedAt: { type: Date },
    driverSignature: { type: String }, // Typed full legal name
    signatureImage: { type: String }, // Base64 drawn signature image
    driverAddressAtSigning: {
      street: { type: String },
      apt: { type: String },
      city: { type: String },
      state: { type: String },
      zipCode: { type: String }
    },
    amendments: [{
      type: { type: String, enum: ['extension', 'vehicle_swap'] },
      description: { type: String },
      previousEndDate: { type: Date },
      newEndDate: { type: Date },
      additionalDays: { type: Number },
      additionalCost: { type: Number },
      newTotalPrice: { type: Number },
      newVehicleInfo: { type: String },
      acknowledgedAt: { type: Date, default: Date.now }
    }]
  },
  // TollSpot toll monitoring
  tollspot: {
    monitorId: { type: Number, default: null },       // TollSpot monitor request ID
    monitorStarted: { type: Boolean, default: false },
    error: { type: String, default: null }
  },
  // Toll charge accounting - $0.25 platform fee per toll across all reservations
  tollAccounting: {
    totalTolls: { type: Number, default: 0 },           // Number of toll charges posted
    originalTollAmount: { type: Number, default: 0 },    // Sum of original toll amounts (goes to host)
    platformTollFees: { type: Number, default: 0 },      // Sum of $0.25 fees (goes to platform)
    driverTollTotal: { type: Number, default: 0 },       // What driver pays (original + fees)
    lastSyncedAt: { type: Date, default: null },          // Last time toll data was synced
    // Settlement tracking
    settledTollCount: { type: Number, default: 0 },      // How many tolls have been charged to driver
    settledAmount: { type: Number, default: 0 },          // Total charged to driver for tolls
    settledToHost: { type: Number, default: 0 },          // Total transferred to host for tolls
    lastSettledAt: { type: Date, default: null }
  },
  // Individual toll settlement records
  tollSettlements: [{
    trigger: { type: String, enum: ['extension', 'return', 'post_trip'] },
    tollCount: { type: Number },
    chargeAmount: { type: Number },       // What driver was charged
    hostAmount: { type: Number },          // What host received (original toll amounts)
    platformFee: { type: Number },         // What platform kept ($0.25 × tollCount)
    paymentIntentId: { type: String },
    transferId: { type: String, default: null },
    settledAt: { type: Date, default: Date.now }
  }],
  // Track if return reminder email has been sent
  returnReminderSent: {
    type: Boolean,
    default: false
  },
  returnReminderSentAt: {
    type: Date,
    default: null
  },
  // Track when host last sent SMS extension reminder to driver
  smsReminderSentAt: {
    type: Date,
    default: null
  },
  // Track if automated SMS return reminder has been sent
  smsReturnReminderSent: {
    type: Boolean,
    default: false
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

// Performance indexes for common query patterns
bookingSchema.index({ driver: 1, status: 1 });
bookingSchema.index({ host: 1, status: 1 });
bookingSchema.index({ vehicle: 1, status: 1, startDate: 1, endDate: 1 });
bookingSchema.index({ status: 1, createdAt: 1 });
bookingSchema.index({ status: 1, endDate: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
module.exports.Counter = Counter;
