const mongoose = require('mongoose');

// Generic key/value store for small bits of persistent system state that must
// survive redeploys (e.g. the last time the weekly payout actually ran).
const systemStateSchema = new mongoose.Schema({
  key: { type: String, unique: true, required: true },
  value: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SystemState', systemStateSchema);
