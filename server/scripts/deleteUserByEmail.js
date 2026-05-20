/**
 * deleteUserByEmail.js — Permanently delete a user by email.
 *
 * USAGE:
 *   cd server
 *
 *   # Dry-run (default) — shows who would be deleted, deletes nothing:
 *   node scripts/deleteUserByEmail.js <email>
 *
 *   # Real run — requires --apply AND interactive "YES DELETE" confirmation:
 *   node scripts/deleteUserByEmail.js <email> --apply
 *
 * SAFETY
 *   • Hardcoded block on the admin email (thegleizergroupllc@gmail.com) — script
 *     refuses to delete it no matter what.
 *   • Dry-run by default.
 *   • Requires interactive YES DELETE to actually delete.
 *   • Deletes the User document only. Does not touch Stripe / Tollspot /
 *     Wheelbase. Any bookings/vehicles referencing this user are left as-is
 *     (run cleanupTestData.js first to clear those).
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const readline = require('readline');
const User = require('../models/User');

const BLOCKED_EMAILS = ['thegleizergroupllc@gmail.com'];

const apply = process.argv.includes('--apply');
const email = process.argv.find((a) => a && !a.startsWith('--') && a.includes('@'));

const confirm = () =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question('Type "YES DELETE" to proceed: ', (answer) => {
      rl.close();
      resolve(answer.trim() === 'YES DELETE');
    });
  });

async function run() {
  if (!email) {
    console.error('Usage: node scripts/deleteUserByEmail.js <email> [--apply]');
    process.exit(1);
  }
  if (BLOCKED_EMAILS.includes(email.toLowerCase().trim())) {
    console.error(`Refusing to delete protected email: ${email}`);
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: email.toLowerCase().trim() })
    .select('_id email firstName lastName userType accountStatus role')
    .lean();

  if (!user) {
    console.log(`No user found with email: ${email}`);
    await mongoose.disconnect();
    return;
  }

  console.log('\n── USER TO DELETE ──');
  console.log(`  Name:           ${user.firstName || ''} ${user.lastName || ''}`);
  console.log(`  Email:          ${user.email}`);
  console.log(`  Type:           ${user.userType}`);
  console.log(`  Role:           ${user.role}`);
  console.log(`  Account status: ${user.accountStatus || '(unset)'}`);

  if (!apply) {
    console.log('\n[DRY-RUN] No changes were made.');
    console.log(`To actually delete, re-run with:  node scripts/deleteUserByEmail.js ${email} --apply`);
    await mongoose.disconnect();
    return;
  }

  console.log('\n⚠️  This permanently deletes the user above.');
  const ok = await confirm();
  if (!ok) {
    console.log('Aborted. No changes were made.');
    await mongoose.disconnect();
    return;
  }

  await User.deleteOne({ _id: user._id });
  console.log(`\nDeleted ${user.email}.`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
