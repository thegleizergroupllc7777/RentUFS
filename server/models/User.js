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
    required: true
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
    required: [true, 'Phone number is required'],
    trim: true
  },
  dateOfBirth: {
    type: Date
  },
  userType: {
    type: String,
    enum: ['driver', 'host', 'both'],
    default: 'driver'
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
    }
  },
  hostInfo: {
    accountType: {
      type: String,
      enum: ['individual', 'business'],
      default: 'individual'
    },
    taxId: {
      type: String,
      trim: true
    },
    taxIdLast4: {
      type: String,
      trim: true
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
  // Hash password for new documents OR when password is modified on existing documents
  if (!this.isNew && !this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

// Compare password method
userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
