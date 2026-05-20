/**
 * cleanupTestData.js — Wipe pre-launch test data from the database.
 *
 * USAGE:
 *   cd server
 *
 *   # 1) Dry-run (default) — shows what WOULD be deleted, deletes nothing:
 *   node scripts/cleanupTestData.js
 *
 *   # 2) Real run — actually deletes. You'll be prompted to type "YES DELETE":
 *   node scripts/cleanupTestData.js --apply
 *
 *   # Optional flags:
 *   --include-users   Also delete the 6 deactivated test users (default: keep)
 *
 * WHAT THIS SCRIPT DOES
 *   1. Deletes all Bookings whose vehicle is NOT a Wheelbase NJ fleet vehicle.
 *   2. Deletes all Vehicles whose bookingProvider !== 'wheelbase'.
 *   3. With --include-users: deletes Users whose accountStatus === 'deactivated'
 *      AND email is NOT on the protected list.
 *
 * PROTECTED FROM DELETION (always)
 *   • Users with email: thegleizergroupllc@gmail.com (admin/host with NJ fleet)
 *   • Users with email: dadamota2000@yahoo.com (active driver)
 *   • Vehicles with bookingProvider: 'wheelbase' (the 24 NJ fleet vehicles)
 *   • Bookings whose vehicle is a Wheelbase NJ fleet vehicle
 *
 * SAFETY
 *   • Stripe is NOT contacted — local records only.
 *   • Tollspot, Wheelbase, insurance integrations are not modified.
 *   • Active accounts and the NJ fleet are explicitly preserved.
 *   • Dry-run is the default; --apply requires interactive confirmation.
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const readline = require('readline');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');

const PROTECTED_EMAILS = [
  'thegleizergroupllc@gmail.com',
  'dadamota2000@yahoo.com'
];

const apply = process.argv.includes('--apply');
const includeUsers = process.argv.includes('--include-users');

const confirm = () =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Type "YES DELETE" to proceed: ', (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES DELETE');
    });
  });

async function run() {
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set. Check your .env.');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected.\n');

  const mode = apply ? 'APPLY (will delete)' : 'DRY-RUN (no changes)';
  console.log(`Mode: ${mode}`);
  console.log(`Include deactivated users: ${includeUsers ? 'YES' : 'NO'}\n`);

  // Identify protected wheelbase vehicles
  const wheelbaseVehicles = await Vehicle.find({ bookingProvider: 'wheelbase' }).select('_id make model').lean();
  const wheelbaseIds = new Set(wheelbaseVehicles.map((v) => String(v._id)));
  console.log(`Protected NJ fleet (Wheelbase) vehicles: ${wheelbaseVehicles.length}`);

  // Vehicles to delete: anything that is NOT a wheelbase vehicle
  const vehiclesToDelete = await Vehicle.find({ bookingProvider: { $ne: 'wheelbase' } })
    .select('_id make model year host')
    .lean();

  // Bookings to delete: any booking whose vehicle is NOT in the wheelbase set
  // (covers test bookings tied to test vehicles AND any orphan bookings)
  const allBookings = await Booking.find({}).select('_id reservationId vehicle status totalPrice paymentStatus').lean();
  const bookingsToDelete = allBookings.filter((b) => !wheelbaseIds.has(String(b.vehicle)));

  // Users to delete (only if --include-users): non-active AND not protected.
  // We match `accountStatus !== 'active'` rather than `=== 'deactivated'` so we
  // catch legacy users from before the accountStatus field was added (where
  // the field is undefined).
  let usersToDelete = [];
  if (includeUsers) {
    usersToDelete = await User.find({
      accountStatus: { $ne: 'active' },
      email: { $nin: PROTECTED_EMAILS }
    })
      .select('_id email firstName lastName userType accountStatus')
      .lean();
  }

  // Summary
  console.log('\n── DELETION PLAN ──');
  console.log(`  Bookings to delete: ${bookingsToDelete.length}`);
  console.log(`  Vehicles to delete: ${vehiclesToDelete.length}`);
  console.log(`  Users to delete:    ${usersToDelete.length}`);
  console.log('\n── PRESERVED ──');
  console.log(`  NJ fleet vehicles (Wheelbase): ${wheelbaseVehicles.length}`);
  console.log(`  Protected emails:              ${PROTECTED_EMAILS.join(', ')}`);

  if (vehiclesToDelete.length > 0) {
    console.log('\n── VEHICLES TO BE DELETED ──');
    vehiclesToDelete.slice(0, 25).forEach((v) => {
      console.log(`  - ${v.year || '?'} ${v.make || '?'} ${v.model || '?'} (${v._id})`);
    });
    if (vehiclesToDelete.length > 25) console.log(`  ... and ${vehiclesToDelete.length - 25} more`);
  }

  if (usersToDelete.length > 0) {
    console.log('\n── USERS TO BE DELETED ──');
    usersToDelete.forEach((u) => {
      console.log(`  - ${u.firstName || ''} ${u.lastName || ''}  <${u.email}>  (${u.userType})`);
    });
  }

  if (!apply) {
    console.log('\n[DRY-RUN] No changes were made.');
    console.log('To actually delete, re-run with:  node scripts/cleanupTestData.js --apply');
    if (!includeUsers) {
      console.log('To also delete deactivated test users, add: --include-users');
    }
    await mongoose.disconnect();
    return;
  }

  // APPLY mode — require explicit confirmation
  console.log('\n⚠️  This will permanently delete the records listed above.');
  console.log('⚠️  Stripe charges, Tollspot, and Wheelbase data are NOT affected.');
  console.log('⚠️  Your admin account and NJ fleet stay intact.\n');
  const ok = await confirm();
  if (!ok) {
    console.log('Aborted. No changes were made.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nDeleting...');
  const bookingResult = await Booking.deleteMany({ _id: { $in: bookingsToDelete.map((b) => b._id) } });
  console.log(`  Bookings deleted: ${bookingResult.deletedCount}`);

  const vehicleResult = await Vehicle.deleteMany({ _id: { $in: vehiclesToDelete.map((v) => v._id) } });
  console.log(`  Vehicles deleted: ${vehicleResult.deletedCount}`);

  if (includeUsers && usersToDelete.length > 0) {
    const userResult = await User.deleteMany({ _id: { $in: usersToDelete.map((u) => u._id) } });
    console.log(`  Users deleted:    ${userResult.deletedCount}`);
  }

  console.log('\nDone. Reload /admin to see updated counts.');
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
