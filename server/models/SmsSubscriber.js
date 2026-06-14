const mongoose = require('mongoose');

// People who opted in to marketing texts by texting a keyword (e.g. "RENT")
// to the RentUFS Twilio number. This is the legal record of consent (TCPA):
// the phone number, the exact time they texted in, and the keyword/message
// they sent. Separate from the User collection — these are leads/subscribers,
// not necessarily registered accounts. Does not touch users, bookings, or
// payments in any way.
const smsSubscriberSchema = new mongoose.Schema(
  {
    // E.164 format, e.g. +13472510825
    phone: { type: String, required: true, unique: true, index: true },
    optedIn: { type: Boolean, default: true },
    // Legal proof of consent — when they texted the keyword in.
    optedInAt: { type: Date, default: Date.now },
    optedOutAt: { type: Date, default: null },
    // The keyword/message that opted them in (e.g. "RENT").
    keyword: { type: String, default: null },
    // The full text of the message they sent (extra proof).
    consentText: { type: String, default: null },
    source: { type: String, default: 'sms-keyword' }
  },
  { timestamps: true }
);

module.exports = mongoose.model('SmsSubscriber', smsSubscriberSchema);
