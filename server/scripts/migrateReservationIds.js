const mongoose = require('mongoose');
require('dotenv').config();

// Counter schema
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

// Simplified Booking schema for migration
const bookingSchema = new mongoose.Schema({
  reservationId: String
}, { strict: false });

const Booking = mongoose.model('Booking', bookingSchema);

async function migrateReservationIds() {
  try {
    // Connect to MongoDB
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB');

    // Find all bookings without a reservationId
    const bookingsWithoutId = await Booking.find({
      $or: [
        { reservationId: { $exists: false } },
        { reservationId: null },
        { reservationId: '' }
      ]
    }).sort({ createdAt: 1 }); // Process oldest first

    console.log(`Found ${bookingsWithoutId.length} bookings without reservation IDs`);

    for (const booking of bookingsWithoutId) {
      // Get next sequence number
      const counter = await Counter.findByIdAndUpdate(
        'reservationId',
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
      );

      // Generate reservation ID in RUFS-00000 format
      const reservationId = `RUFS-${counter.seq.toString().padStart(5, '0')}`;

      // Update the booking
      await Booking.updateOne(
        { _id: booking._id },
        { $set: { reservationId: reservationId } }
      );

      console.log(`Updated booking ${booking._id} with reservationId: ${reservationId}`);
    }

    console.log('Migration complete!');
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

migrateReservationIds();
