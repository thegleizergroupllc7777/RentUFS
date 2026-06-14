const express = require('express');
const router = express.Router();
const SmsSubscriber = require('../models/SmsSubscriber');
const User = require('../models/User');
const { sendSMS, formatToE164 } = require('../utils/smsService');

// ===========================================================================
// Inbound SMS keyword opt-in (TCPA-compliant "Text RENT to join" flow).
//
// When someone texts the RentUFS Twilio number, Twilio POSTs the message here.
// - A join keyword (RENT/JOIN/START/YES) => record consent + send welcome.
// - STOP/UNSUBSCRIBE/etc.                 => record opt-out (Twilio also handles
//                                            the carrier-level block automatically).
// - HELP/INFO                            => send the help/info reply.
// - Anything else                        => gentle nudge on how to join.
//
// This is purely additive. It does NOT touch bookings, payments, insurance,
// tolls, login, or any existing notification. The outbound texts your platform
// already sends are unchanged.
// ===========================================================================

// Keyword groups (compared case-insensitively, first word of the message).
const JOIN_KEYWORDS = ['RENT', 'JOIN', 'START', 'YES', 'SUBSCRIBE', 'UNSTOP'];
const STOP_KEYWORDS = ['STOP', 'STOPALL', 'UNSUBSCRIBE', 'CANCEL', 'END', 'QUIT'];
const HELP_KEYWORDS = ['HELP', 'INFO'];

// Auto-reply copy. Includes the legally required disclosures: program name,
// message frequency, "msg & data rates may apply", and STOP/HELP instructions.
const WELCOME_MSG =
  "RentUFS: You're in! 🚗 Get $25 off your first rental with code WELCOME25 at app.rentufs.com. " +
  "You'll get occasional deals & updates. Msg freq varies. Msg & data rates may apply. " +
  'Reply STOP to opt out, HELP for help.';

const HELP_MSG =
  'RentUFS deals & updates. Msg freq varies. Msg & data rates may apply. ' +
  'Reply STOP to opt out. Support: support@rentufs.com';

const STOP_MSG =
  "You've been unsubscribed from RentUFS texts and won't receive any more. " +
  'Reply RENT to rejoin.';

const NUDGE_MSG =
  'Welcome to RentUFS! Reply RENT to join and get $25 off your first rental. ' +
  'Msg & data rates may apply. Reply STOP to opt out.';

// Build a minimal TwiML response. If message is empty, an empty <Response/>
// tells Twilio to do nothing (used for STOP, since Twilio sends its own
// carrier-mandated opt-out confirmation automatically).
function twiml(message) {
  const head = '<?xml version="1.0" encoding="UTF-8"?>';
  if (!message) return `${head}<Response></Response>`;
  const safe = String(message)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `${head}<Response><Message>${safe}</Message></Response>`;
}

router.post('/inbound', async (req, res) => {
  try {
    const from = (req.body && req.body.From) ? String(req.body.From).trim() : '';
    const body = (req.body && req.body.Body) ? String(req.body.Body).trim() : '';
    const phone = formatToE164(from) || from;

    // First word, letters only, uppercased — robust to punctuation/emoji.
    const firstWord = (body.split(/\s+/)[0] || '').toUpperCase().replace(/[^A-Z]/g, '');

    let reply = NUDGE_MSG;

    if (!phone) {
      // No sender we can record — just acknowledge with nothing.
      res.set('Content-Type', 'text/xml');
      return res.send(twiml(''));
    }

    if (STOP_KEYWORDS.includes(firstWord)) {
      await SmsSubscriber.findOneAndUpdate(
        { phone },
        { optedIn: false, optedOutAt: new Date() },
        { upsert: true, setDefaultsOnInsert: true }
      );
      // Also flip consent off for a matching registered user, so the Broadcast
      // tool stops texting them too.
      await User.updateOne({ phone }, { $set: { 'smsConsent.granted': false } });
      console.log(`📵 SMS opt-out recorded: ${phone}`);
      // Let Twilio's automatic opt-out confirmation handle the reply.
      res.set('Content-Type', 'text/xml');
      return res.send(twiml(''));
    }

    if (HELP_KEYWORDS.includes(firstWord)) {
      res.set('Content-Type', 'text/xml');
      return res.send(twiml(HELP_MSG));
    }

    if (JOIN_KEYWORDS.includes(firstWord)) {
      await SmsSubscriber.findOneAndUpdate(
        { phone },
        {
          optedIn: true,
          optedInAt: new Date(),
          optedOutAt: null,
          keyword: firstWord,
          consentText: body
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
      // If they're already a registered user, grant SMS consent so the Broadcast
      // tool can text them immediately.
      await User.updateOne(
        { phone },
        {
          $set: {
            'smsConsent.granted': true,
            'smsConsent.grantedAt': new Date(),
            'smsConsent.version': 'sms-keyword'
          }
        }
      );
      console.log(`✅ SMS opt-in recorded: ${phone} (keyword: ${firstWord})`);
      reply = WELCOME_MSG;
    }

    res.set('Content-Type', 'text/xml');
    return res.send(twiml(reply));
  } catch (error) {
    console.error('❌ Inbound SMS error:', error.message);
    // Always return valid (empty) TwiML so Twilio doesn't retry/alarm.
    res.set('Content-Type', 'text/xml');
    return res.send(twiml(''));
  }
});

module.exports = router;
