// Host integration intro sequence.
//
// When a host lists their FIRST car, we introduce the two partner integrations
// as host perks:
//   1. GPS Leaders — sent right away (on the first listing)
//   2. TollSpot    — sent ~3 days later (by the daily scheduler)
//
// This file only decides WHO gets an email and WHEN, and records that it was
// sent. It never touches bookings, insurance, tolls, payouts, Stripe or any API —
// the worst case is that an email doesn't go out. Every send is claimed
// atomically in the database, so restarts, retries, or concurrent requests can
// never send the same host the same email twice, and hosts who opted out of
// email are skipped inside the email senders themselves.

const User = require('../models/User');
const { sendGpsLeadersIntroEmail, sendTollspotIntroEmail } = require('./emailService');

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

// Called (fire-and-forget) the moment a host lists their first vehicle. Atomically
// claims the GPS send so it happens at most once, then emails them.
async function startHostIntegrationIntro(userId) {
  try {
    const now = new Date();
    // Claim succeeds only while gpsSentAt is still null → exactly-once GPS send.
    const user = await User.findOneAndUpdate(
      { _id: userId, 'hostIntroEmails.gpsSentAt': null },
      { $set: { 'hostIntroEmails.firstVehicleAt': now, 'hostIntroEmails.gpsSentAt': now } },
      { new: true }
    ).select('email firstName emailOptOut');
    if (!user) return; // already sent/claimed for this host — nothing to do
    await sendGpsLeadersIntroEmail(user);
  } catch (err) {
    console.error('🛰️ Error starting host integration intro:', err.message);
  }
}

// Daily scheduler pass: send the TollSpot intro to hosts whose first car was
// listed at least 3 days ago and who already got the GPS intro but not TollSpot.
async function checkAndSendTollspotIntros() {
  try {
    const cutoff = new Date(Date.now() - THREE_DAYS_MS);
    const due = await User.find({
      'hostIntroEmails.firstVehicleAt': { $ne: null, $lte: cutoff },
      'hostIntroEmails.gpsSentAt': { $ne: null },
      'hostIntroEmails.tollspotSentAt': null,
      userType: { $in: ['host', 'both'] },
      accountStatus: { $ne: 'deactivated' }
    }).select('email firstName emailOptOut').limit(200);

    let sent = 0;
    for (const u of due) {
      // Claim atomically so a mid-run restart can't double-send.
      const claimed = await User.findOneAndUpdate(
        { _id: u._id, 'hostIntroEmails.tollspotSentAt': null },
        { $set: { 'hostIntroEmails.tollspotSentAt': new Date() } },
        { new: true }
      ).select('email firstName emailOptOut');
      if (!claimed) continue;
      await sendTollspotIntroEmail(claimed);
      sent++;
    }
    if (sent) console.log(`🛰️ Host TollSpot intro: sent to ${sent} host(s)`);
  } catch (err) {
    console.error('🛰️ Error in host TollSpot intro scheduler:', err.message);
  }
}

module.exports = { startHostIntegrationIntro, checkAndSendTollspotIntros };
