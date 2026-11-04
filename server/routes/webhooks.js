// ─────────────────────────────────────────────────────────────────────────────
// Inbound webhooks from Rentid (Vishal) Protection.
//
// Rentid sends a SIGNED POST to our webhook_url whenever a policy's status
// changes (scheduled → activated → ended/cancelled/failed). We verify the
// signature over the RAW body (captured by express.raw in index.js) BEFORE
// trusting anything, then update the matching booking's Rentid status.
//
// SAFETY: this only ever touches `booking.rentid.*` on bookings that carry a
// Rentid policy id — it cannot affect TeqMobility bookings, payments, tolls, or
// booking status. New route; additive.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const router = express.Router();
const rentid = require('../utils/rentid');
const Booking = require('../models/Booking');

const TERMINAL = ['ended', 'cancelled', 'failed'];

router.post('/rentid', async (req, res) => {
  try {
    // req.body is a Buffer (express.raw). Verify the signature over exact bytes.
    const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from(String(req.body || ''), 'utf8');
    const sig = req.get('X-Rentid-Signature');
    if (!rentid.verifyWebhookSignature(raw, sig)) {
      return res.status(400).json({ message: 'Invalid signature' });
    }

    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch (_) {
      return res.status(400).json({ message: 'Bad JSON' });
    }

    // Only protection policy events touch a booking. data = the policy object.
    if (event && typeof event.event === 'string' && event.event.startsWith('protection_policy.')) {
      const policy = event.data || {};
      const policyId = policy.id;
      if (policyId) {
        const booking = await Booking.findOne({ 'rentid.policyId': policyId });
        if (booking) {
          booking.rentid = booking.rentid || {};
          const current = booking.rentid.status;
          const next = policy.status;
          // Never downgrade out of a terminal state on an out-of-order delivery.
          const regressing = TERMINAL.includes(current) && !TERMINAL.includes(next);
          if (next && !regressing) booking.rentid.status = next;

          if (event.event === rentid.POLICY_EVENTS.FAILED) {
            booking.rentid.error = policy.failure_code || 'failed';
          }
          if ((event.event === rentid.POLICY_EVENTS.ENDED || event.event === rentid.POLICY_EVENTS.CANCELLED) && !booking.rentid.stoppedAt) {
            booking.rentid.stoppedAt = new Date();
          }
          await booking.save();
          console.log(`🛡️ Rentid webhook: ${event.event} policy=${policyId} booking=${booking.reservationId || booking._id} status=${next}`);
        }
      }
    }

    // 2xx acknowledges the delivery so Rentid stops retrying.
    return res.status(204).end();
  } catch (error) {
    console.error('Rentid webhook error:', error.message);
    // 5xx lets Rentid retry a transient failure (e.g. a brief DB blip).
    return res.status(500).json({ message: 'Webhook processing error' });
  }
});

module.exports = router;
