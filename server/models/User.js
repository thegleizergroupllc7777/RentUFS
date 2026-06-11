const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: function() {
      // Password is required unless this is a Google-authenticated account
      return !this.googleId;
    }
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
    index: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: function() {
      // Some Google profiles don't provide family_name (e.g. single-name
      // accounts or certain locales); collect it later in the Profile page.
      return !this.googleId;
    },
    trim: true
  },
  phone: {
    type: String,
    required: function() {
      // Phone is required unless this is a Google-authenticated account
      // (Google doesn't provide phone; collected later via profile/booking gates)
      return !this.googleId;
    },
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  address: {
    street: { type: String, trim: true },
    apt: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true }
  },
  userType: {
    type: String,
    enum: ['driver', 'host', 'both'],
    default: 'driver'
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user'
  },
  accountStatus: {
    type: String,
    enum: ['active', 'deactivated'],
    default: 'active'
  },
  deactivatedAt: {
    type: Date
  },
  driverLicense: {
    licenseNumber: {
      type: String,
      trim: true
    },
    state: {
      type: String,
      trim: true
    },
    expirationDate: {
      type: Date
    },
    licenseImage: {
      type: String,
      default: ''
    },
    verificationSelfie: {
      type: String,
      default: ''
    },
    verified: {
      type: Boolean,
      default: false
    },
    faceMatchScore: {
      type: Number,
      default: null
    },
    faceVerified: {
      type: Boolean,
      default: false
    },
    licenseNumberMatched: {
      type: Boolean,
      default: false
    }
  },
  hostInfo: {
    accountType: {
      type: String,
      enum: ['individual', 'business'],
      default: 'individual'
    },
    legalFirstName: {
      type: String,
      trim: true
    },
    legalLastName: {
      type: String,
      trim: true
    },
    legalAddress: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zipCode: { type: String, trim: true }
    },
    taxId: {
      type: String,
      trim: true
    },
    taxIdLast4: {
      type: String,
      trim: true
    },
    taxIdLocked: {
      type: Boolean,
      default: false
    },
    businessName: {
      type: String,
      trim: true
    },
    dba: {
      type: String,
      trim: true
    },
    businessAddress: {
      street: { type: String, trim: true },
      city: { type: String, trim: true },
      state: { type: String, trim: true },
      zipCode: { type: String, trim: true }
    },
    displayPreference: {
      type: String,
      enum: ['personal', 'business', 'dba'],
      default: 'personal'
    },
    // Optional per-host insurance rate (per day). When null/undefined, the
    // platform default rate is used. Set by an admin to give a specific host
    // a custom insurance price; applies to all of that host's vehicles.
    customInsuranceRate: {
      type: Number,
      default: null
    },
    // Insurance coverage type for this host's fleet, passed to TeqMobility's
    // coverage_type when starting on-rent coverage. Admin-only; applies to all
    // of the host's vehicles. Defaults to FULL_COVERAGE (TeqMobility's account
    // default) so behavior is unchanged unless an admin sets LIABILITY.
    coverageType: {
      type: String,
      enum: ['FULL_COVERAGE', 'LIABILITY'],
      default: 'FULL_COVERAGE'
    }
  },
  profileImage: {
    type: String,
    default: ''
  },
  rating: {
    type: Number,
    default: 0
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  // When true, the user has unsubscribed from marketing / broadcast emails.
  // Only affects the admin Broadcast tool — transactional emails (bookings,
  // password resets, account alerts) are always delivered regardless.
  emailOptOut: {
    type: Boolean,
    default: false
  },
  resetPasswordToken: {
    type: String,
    default: null
  },
  resetPasswordExpires: {
    type: Date,
    default: null
  },
  pendingEmail: {
    type: String,
    default: null
  },
  emailVerificationCode: {
    type: String,
    default: null
  },
  emailVerificationExpires: {
    type: Date,
    default: null
  },
  stripeCustomerId: {
    type: String,
    default: null
  },
  // Stripe Connect for hosts to receive payouts
  stripeConnectAccountId: {
    type: String,
    default: null
  },
  stripeConnectOnboardingComplete: {
    type: Boolean,
    default: false
  },
  stripeConnectPayoutsEnabled: {
    type: Boolean,
    default: false
  },
  stripeConnectChargesEnabled: {
    type: Boolean,
    default: false
  },
  // Tracks platform fee penalty owed by host for host-initiated cancellations ($1.50/day)
  cancellationPenaltyBalance: {
    type: Number,
    default: 0
  },
  integrations: {
    tollspot: {
      active: { type: Boolean, default: false },
      connectedAt: { type: Date, default: null },
      signedUp: { type: Boolean, default: false }
    }
  },
  // SMS messaging consent for TCPA compliance and Twilio toll-free verification.
  // Granted only when the user explicitly checks the opt-in box at registration.
  // If granted is false, do not send transactional or notification SMS to this user.
  smsConsent: {
    granted: { type: Boolean, default: false },
    grantedAt: { type: Date, default: null },
    ipAddress: { type: String, default: null },
    // Version of the opt-in language the user agreed to, so we can re-prompt if
    // the disclosure ever materially changes.
    version: { type: String, default: null }
  },
  paymentMethods: [{
    nickname: { type: String, trim: true },
    cardBrand: { type: String, trim: true },
    last4: { type: String, trim: true },
    expMonth: { type: Number },
    expYear: { type: Number },
    isDefault: { type: Boolean, default: false },
    stripePaymentMethodId: { type: String, default: null },
    addedAt: { type: Date, default: Date.now }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Hash password before saving
userSchema.pre('save', async function(next) {
  // Skip if no password (Google-only accounts) or password wasn't modified
  if (!this.password) return next();
  if (!this.isNew && !this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Performance index for password reset token lookup
userSchema.index({ resetPasswordToken: 1, resetPasswordExpires: 1 });

module.exports = mongoose.model('User', userSchema);
