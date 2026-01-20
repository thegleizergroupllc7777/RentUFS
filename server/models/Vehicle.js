const mongoose = require('mongoose');

const vehicleSchema = new mongoose.Schema({
  host: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
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
    trim: true,
    uppercase: true,
    minlength: 17,
    maxlength: 17
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
  description: {
    type: String,
    required: true
  },
  features: [{
    type: String
  }],
  location: {
    address: String,
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
    min: 0
  },
  pricePerWeek: {
    type: Number,
    min: 0
  },
  pricePerMonth: {
    type: Number,
    min: 0
  },
  images: [{
    type: String
  }],
  registrationImage: {
    type: String,
    required: true
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
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Add 2dsphere index for geospatial queries
vehicleSchema.index({ geoLocation: '2dsphere' });

module.exports = mongoose.model('Vehicle', vehicleSchema);
