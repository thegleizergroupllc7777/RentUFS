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
    // 'expired' = the booking timed out without payment (driver never completed
    // checkout). Distinct from 'failed', which is reserved for an actual payment
    // problem (e.g. a declined card).
    enum: ['pending', 'paid', 'refunded', 'partial_refund', 'failed', 'expired'],
    default: 'pending'
  },
  paymentSessionId: {
    type: String,
    default: null
  },
  extensions: [{
    days: Number,
    cost: Number,
    rental: Number,
    rentalType: { type: String, enum: ['daily', 'weekly', 'monthly'], default: 'daily' },
    hostProcessingFee: Number,
    platformFee: Number,
    insurance: Number,
    processingFee: Number,
    newEndDate: Date,
    paymentId: String,
    extendedAt: { type: Date, default: Date.now }
  }],
  // Cancellation tracking
  cancellationReason: { type: String, default: null },
  cancelledBy: { type: String, enum: ['host', 'driver', 'admin', null], default: null },
  cancelledAt: { type: Date, default: null },
  cancellationFee: { type: Number, default: 0 },
  // Persistent admin note shown on the booking (e.g. "Refunded via Stripe").
  // Kept separate from the append-only adminActions audit log so it stays
  // visible and editable in the admin UI instead of disappearing.
  adminNote: { type: String, default: '' },
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
    cardCloudinaryUrl: { type: String, default: null }, // Permanent card storage (survives redeploys)
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
  // Toll charge accounting - $0.50 platform fee per toll across all reservations
  tollAccounting: {
    totalTolls: { type: Number, default: 0 },           // Number of toll charges posted
    originalTollAmount: { type: Number, default: 0 },    // Sum of original toll amounts (goes to host)
    platformTollFees: { type: Number, default: 0 },      // Sum of $0.50 fees (goes to platform)
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
    platformFee: { type: Number },         // What platform kept ($0.50 × tollCount)
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
  // Track if the 30-minutes-before "ending soon" text has been sent (the 1-hour
  // stage uses returnReminderSent above). Both reset when a booking is extended.
  reminder30mSent: {
    type: Boolean,
    default: false
  },
  // ── Repeating overdue nudges ──
  // Once a booking is past its return time and still not returned/extended, the
  // scheduler keeps nudging the renter: a TEXT every 3 hours (around the clock —
  // people return cars at any hour) and an EMAIL every 12 hours. These timestamps
  // track when the last of each went out so the cadence is honored. Both reset
  // when the booking is extended (return date changes), re-arming the nudges for
  // the new deadline. Stops automatically once returned/extended.
  overdueTextAt: {
    type: Date,
    default: null
  },
  overdueEmailAt: {
    type: Date,
    default: null
  },
  // ── Automatic late-return fee tracking ──
  // Only ever populated for bookings that agreed to the Automatic Late Return Fee
  // clause (see server/utils/lateReturn.js isBookingEligible). Every field is
  // additive with a default, so existing/current bookings are completely unaffected.
  lateFee: {
    daysCharged: { type: Number, default: 0 },        // real charges applied to renter
    totalCharged: { type: Number, default: 0 },       // sum actually charged
    shadowDaysReported: { type: Number, default: 0 }, // (legacy shadow field; unused once live)
    retryCount: { type: Number, default: 0 },         // consecutive failed charge attempts
    nextRetryAt: { type: Date, default: null },       // don't retry a declined card before this time
    lastActionAt: { type: Date, default: null },
    // One-time notification flags (so warnings/escalations never double-send)
    warn2hSent: { type: Boolean, default: false },    // reminder 2 hours before return
    warn1hSent: { type: Boolean, default: false },    // reminder 1 hour before return
    warn30mSent: { type: Boolean, default: false },   // final reminder 30 min before return
    day2AlertSent: { type: Boolean, default: false }, // host recover email (48h)
    day3AlertSent: { type: Boolean, default: false }, // company + host recover (72h)
    hostBackstopTotal: { type: Number, default: 0 },  // amount moved to the host after the renter couldn't be charged
    entries: [{
      day: { type: Number },                          // late-day number (1, 2, 3, ...)
      mode: { type: String, enum: ['shadow', 'charged', 'failed', 'host_backstop'], default: 'shadow' },
      lateFee: { type: Number },                       // $5 late fee
      insurance: { type: Number },                     // one insurance day at the booking's rate
      stripeFee: { type: Number },                     // processing fee passed to renter
      total: { type: Number },                         // total renter is/would be charged
      chargeId: { type: String, default: null },       // Stripe payment intent (when charged)
      at: { type: Date, default: Date.now }
    }]
  },
  // Audit log of admin actions taken on this booking (date edits, manual
  // extensions, charges, refunds, status overrides). Append-only — never
  // mutate existing entries.
  adminActions: [{
    admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    adminEmail: { type: String },
    action: { type: String }, // status_changed | dates_changed | extended | charged | refunded | refund_failed | charge_failed | note
    details: { type: mongoose.Schema.Types.Mixed },
    timestamp: { type: Date, default: Date.now }
  }],
  // Who marked this booking completed, and how — a plain audit stamp so we can
  // always see who closed a reservation (driver photo return, host portal,
  // admin panel, or an automatic overdue sweep).
  completionInfo: {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
    role: { type: String },   // 'driver' | 'host' | 'admin' | 'system'
    method: { type: String }, // 'return_inspection' | 'host_portal' | 'app' | 'admin_panel' | 'auto_overdue'
    at: { type: Date }
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

// Update timestamp on every save
bookingSchema.pre('save', async function(next) {
  this.updatedAt = Date.now();

  // Re-arm ALL return reminders + late warnings whenever the return date moves —
  // via ANY path (renter payment extension, admin extend, or a date edit). Each
  // reminder flips an "already sent" flag so it doesn't spam; extending is meant
  // to flip those back so the reminders fire again for the new deadline. Only one
  // extension route was doing that reset, so bookings extended through the others
  // got permanently benched — one reminder, then silence, even while running late
  // (affected both text AND email, since they fire together). Centralizing it
  // here covers every path. Fires ONLY when endDate actually changes, so the
  // scheduler saving a freshly-set flag never wipes it. Touches only notification
  // flags — nothing about money, insurance coverage, charges, or booking status.
  if (!this.isNew && this.isModified('endDate')) {
    this.returnReminderSent = false;
    this.returnReminderSentAt = null;
    this.reminder30mSent = false;
    this.smsReturnReminderSent = false;
    this.overdueTextAt = null;   // re-arm the repeating overdue nudges
    this.overdueEmailAt = null;
    if (this.lateFee) {
      this.lateFee.warn1hSent = false;
      this.lateFee.warn30mSent = false;
      this.lateFee.warn2hSent = false;
    }
  }

  next();
});

// Assign a sequential reservation ID to a booking (call only after payment is confirmed)
bookingSchema.statics.assignReservationId = async function(bookingId) {
  const counter = await Counter.findByIdAndUpdate(
    'reservationId',
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  const reservationId = `RUFS-${counter.seq.toString().padStart(5, '0')}`;
  await this.findByIdAndUpdate(bookingId, { reservationId });
  return reservationId;
};

// Performance indexes for common query patterns
bookingSchema.index({ driver: 1, status: 1 });
bookingSchema.index({ host: 1, status: 1 });
bookingSchema.index({ host: 1, status: 1, paymentStatus: 1, payoutStatus: 1 });
bookingSchema.index({ host: 1, payoutStatus: 1 });
bookingSchema.index({ vehicle: 1, status: 1, startDate: 1, endDate: 1 });
bookingSchema.index({ status: 1, createdAt: 1 });
bookingSchema.index({ status: 1, endDate: 1 });

const Booking = mongoose.model('Booking', bookingSchema);

module.exports = Booking;
module.exports.Counter = Counter;
