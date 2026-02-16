const mongoose = require('mongoose');
require('dotenv').config();

// Simplified Booking schema for migration
const bookingSchema = new mongoose.Schema({
  reservationId: String,
  totalDays: Number,
  pricePerDay: Number,
  totalPrice: Number,
  platformFee: Number,
  platformFeePerDay: Number,
  hostPlatformFeePerDay: Number,
  hostPlatformFee: Number,
  hostEarnings: Number,
  platformRevenue: Number,
  payoutStatus: String,
  payoutAmount: Number,
  status: String,
  insurance: {
    totalCost: Number
  },
  extensions: [{
    days: Number,
    cost: Number
  }]
}, { strict: false });

const Booking = mongoose.model('Booking', bookingSchema);

async function backfillHostPlatformFee() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Find all bookings and check if hostPlatformFee matches feePerDay * totalDays
    // This catches both missing fees (0/null) and flat fees that weren't multiplied by totalDays
    const allBookings = await Booking.find({
      totalDays: { $gt: 0 }
    }).sort({ createdAt: 1 });

    // Filter to bookings where the fee is incorrect
    const bookings = allBookings.filter(b => {
      const feePerDay = b.hostPlatformFeePerDay || 1.50;
      const correctFee = feePerDay * (b.totalDays || 0);
      return Math.abs((b.hostPlatformFee || 0) - correctFee) > 0.01;
    });

    console.log(`Found ${bookings.length} bookings with incorrect hostPlatformFee (checked ${allBookings.length} total)\n`);

    let updatedUnpaid = 0;
    let updatedPaid = 0;
    let skipped = 0;

    for (const booking of bookings) {
      const feePerDay = booking.hostPlatformFeePerDay || 1.50;
      const totalDays = booking.totalDays || 0;
      const pricePerDay = booking.pricePerDay || 0;
      const correctHostPlatformFee = feePerDay * totalDays;
      const rentalSubtotal = pricePerDay * totalDays;

      const id = booking.reservationId || booking._id;

      if (booking.payoutStatus === 'paid') {
        // Already paid out - only fix hostPlatformFee for display
        // Do NOT change hostEarnings or payoutAmount (money already transferred)
        await Booking.updateOne(
          { _id: booking._id },
          { $set: { hostPlatformFee: correctHostPlatformFee } }
        );
        console.log(`[PAID]    ${id}: hostPlatformFee 0 -> $${correctHostPlatformFee.toFixed(2)} (hostEarnings/payoutAmount unchanged)`);
        updatedPaid++;
      } else {
        // Not yet paid out - safe to recalculate everything
        const correctHostEarnings = Math.max(0, rentalSubtotal - correctHostPlatformFee);
        const driverPlatformFee = booking.platformFee || (booking.platformFeePerDay || 1.50) * totalDays;
        const insuranceCost = booking.insurance?.totalCost || 0;
        const correctPlatformRevenue = driverPlatformFee + correctHostPlatformFee + insuranceCost;

        const oldEarnings = booking.hostEarnings || 0;

        await Booking.updateOne(
          { _id: booking._id },
          {
            $set: {
              hostPlatformFee: correctHostPlatformFee,
              hostEarnings: correctHostEarnings,
              platformRevenue: correctPlatformRevenue
            }
          }
        );
        console.log(`[PENDING] ${id}: hostPlatformFee 0 -> $${correctHostPlatformFee.toFixed(2)}, hostEarnings $${oldEarnings.toFixed(2)} -> $${correctHostEarnings.toFixed(2)}`);
        updatedUnpaid++;
      }
    }

    console.log(`\n--- Summary ---`);
    console.log(`Updated (not yet paid out): ${updatedUnpaid} bookings (hostPlatformFee + hostEarnings + platformRevenue)`);
    console.log(`Updated (already paid out): ${updatedPaid} bookings (hostPlatformFee only, for display)`);
    console.log(`Skipped: ${skipped} bookings`);
    console.log(`Total processed: ${bookings.length}`);
  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

backfillHostPlatformFee();
