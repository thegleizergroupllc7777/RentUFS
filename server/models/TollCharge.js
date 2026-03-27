const mongoose = require('mongoose');

const tollChargeSchema = new mongoose.Schema({
  // TollSpot fields (matches their TollCharge schema)
  tollspotId: { type: Number, required: true, unique: true },  // TollSpot's charge ID
  postedTime: { type: Date, required: true },
  entryTime: { type: Date, default: null },
  entryLocation: { type: String, default: null },
  exitTime: { type: Date, required: true },
  exitLocation: { type: String, required: true },
  amount: { type: Number, required: true, min: 0 },
  transactionType: {
    type: String,
    enum: ['PARKING', 'TOLL', 'TOLLS', 'VIOLATION', null],
    default: null
  },
  licensePlate: { type: String, default: null },
  licensePlateState: { type: String, default: null },
  licensePlateCountry: { type: String, default: null },
  transponderNumber: { type: String, default: null },
  agency: { type: String, required: true },
  detectionType: { type: String, default: null },
  tollAccountId: { type: String, default: null },
  vin: { type: String, default: null },

  // TollSpot partner references
  hostId: { type: String, default: null },
  partnerVehicleId: { type: String, default: null },
  tollspotVehicleId: { type: Number, default: null },

  // RentUFS references (resolved after ingestion)
  vehicle: { type: mongoose.Schema.Types.ObjectId, ref: 'Vehicle', default: null },
  booking: { type: mongoose.Schema.Types.ObjectId, ref: 'Booking', default: null },
  host: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },

  // Settlement tracking
  settled: { type: Boolean, default: false },
  settledAt: { type: Date, default: null },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Indexes for efficient lookups
tollChargeSchema.index({ vehicle: 1, exitTime: 1 });
tollChargeSchema.index({ booking: 1 });
tollChargeSchema.index({ licensePlate: 1, exitTime: 1 });
tollChargeSchema.index({ partnerVehicleId: 1, exitTime: 1 });
tollChargeSchema.index({ settled: 1 });

module.exports = mongoose.model('TollCharge', tollChargeSchema);
