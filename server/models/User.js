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
    required: true,
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
