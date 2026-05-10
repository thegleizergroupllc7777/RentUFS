const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  nickname: {
    type: String,
    required: true,
    trim: true,
    maxlength: 50
  },
  make: {
    type: String,
    required: true,
    trim: true
  },
  model: {
    type: String,
    required: true,
    trim: true
  },
  year: {
    type: Number,
    required: true
  },
  vin: {
    type: String,
    required: true,
    trim: true,
    uppercase: true,
    minlength: 17,
    maxlength: 17
  },
  licensePlate: {
    type: String,
    required: true,
    trim: true,
    uppercase: true
  },
  registrationState: {
    type: String,
    trim: true,
    uppercase: true,
    enum: ['AZ', 'CA', 'CO', 'CT', 'FL', 'GA', 'IL', 'MD', 'NJ', 'NV', 'PA', 'SC', 'TX']
  },
  type: {
    type: String,
    enum: ['sedan', 'suv', 'truck', 'van', 'convertible', 'coupe', 'wagon', 'other'],
    required: true
  },
  transmission: {
    type: String,
    enum: ['automatic', 'manual'],
    default: 'automatic'
  },
  seats: {
    type: Number,
    required: true,
    min: 1
  },
  odometer: {
    type: Number,
    min: 0,
    max: 200000
  },
  vehicleValue: {
    type: Number,
    min: 5000,
    max: 90000
  },
  description: {
    type: String,
    required: true
  },
  features: [{
    type: String
  }],
  location: {
    address: { type: String, required: true },
    city: String,
    state: String,
    zipCode: String,
    coordinates: [Number] // [longitude, latitude] - for legacy support
  },
  // GeoJSON location for geospatial queries
  geoLocation: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      default: undefined
    }
  },
  pricePerDay: {
    type: Number,
    required: true,
    min: 1,
    max: 500
  },
  pricePerWeek: {
    type: Number,
    min: 1,
    max: 2500
  },
  pricePerMonth: {
    type: Number,
    min: 1,
    max: 5000
  },
  images: [{
    type: String
  }],
  registrationImage: {
    type: String,
    required: true
  },
  registrationExpiration: {
    type: Date
  },
  registrationReminderSent: {
    type: Boolean,
    default: false
  },
  availability: {
    type: Boolean,
    default: true
  },
  rating: {
    type: Number,
    default: 0
  },
  reviewCount: {
    type: Number,
    default: 0
  },
  tripCount: {
    type: Number,
    default: 0
  },
  // TollSpot toll management integration
  tollspot: {
    vehicleId: { type: mongoose.Schema.Types.Mixed, default: null },  // TollSpot's vehicle ID (number or string)
    status: {
      type: String,
      enum: ['none', 'pre_registered', 'registered', 'unregister_scheduled', 'unregistered'],
      default: 'none'
    }
  },
  // Booking provider — determines how renters book this vehicle
  // 'p2p' = standard peer-to-peer flow via this app's Stripe checkout
  // 'wheelbase' = embed Wheelbase/Outdoorsy SDK widget for booking (used for RentUFS fleet vehicles)
  bookingProvider: {
    type: String,
    enum: ['p2p', 'wheelbase'],
    default: 'p2p'
  },
  // Wheelbase / Outdoorsy fleet integration
  wheelbase: {
    rentalId: { type: String, default: null }  // e.g., "4726129" — the Wheelbase data-rental ID
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add 2dsphere index for geospatial queries
vehicleSchema.index({ geoLocation: '2dsphere' });
// Performance indexes for common query patterns
vehicleSchema.index({ host: 1 });
vehicleSchema.index({ availability: 1 });

module.exports = mongoose.model('Vehicle', vehicleSchema);
