/**
 * makeAdmin.js — Promote a user to admin role.
 *
 * USAGE:
 *   cd server
 *   node scripts/makeAdmin.js <email>
 *
 *   Example:
 *     node scripts/makeAdmin.js thegleizergroupllc@gmail.com
 *
 * To demote an admin back to a regular user:
 *   node scripts/makeAdmin.js <email> --revoke
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

async function run() {
  const email = process.argv[2];
  const revoke = process.argv.includes('--revoke');

  if (!email) {
    console.error('Usage: node scripts/makeAdmin.js <email> [--revoke]');
    process.exit(1);
  }

  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Check your .env file.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);

  const user = await User.findOne({ email: email.toLowerCase().trim() });
  if (!user) {
    console.error(`No user found with email: ${email}`);
    await mongoose.disconnect();
    process.exit(1);
  }

  const newRole = revoke ? 'user' : 'admin';
  if (user.role === newRole) {
    console.log(`User ${email} already has role: ${newRole}. No change made.`);
    await mongoose.disconnect();
    return;
  }

  user.role = newRole;
  await user.save();

  console.log(`Successfully updated ${email} to role: ${newRole}`);
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
