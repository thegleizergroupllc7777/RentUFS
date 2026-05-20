import React from 'react';
import { Link } from 'react-router-dom';

const SmsTerms = () => {
  return (
    <div style={{
      maxWidth: '800px',
      margin: '0 auto',
      padding: '2rem 1.25rem',
      color: '#1f2937',
      lineHeight: '1.6'
    }}>
      <Link to="/" style={{ color: '#10b981', textDecoration: 'none', fontSize: '0.9rem' }}>
        ← Back to RentUFS
      </Link>

      <h1 style={{ marginTop: '1rem', fontSize: '2rem' }}>SMS Messaging Terms</h1>
      <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
        Last updated: May 20, 2026
      </p>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Program description</h2>
        <p>
          When you opt in by checking the SMS consent box during registration,
          RentUFS (operated by The Gleizer Group, LLC) will send you text
          messages at the mobile phone number you provided. This program is
          designed to keep you informed about your account activity, bookings,
          and trips.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>What messages you will receive</h2>
        <p>By opting in, you agree to receive the following types of SMS:</p>
        <ul>
          <li><strong>Booking confirmations</strong> — when a reservation is created or confirmed.</li>
          <li><strong>Reservation reminders</strong> — upcoming pickup, return, and itinerary updates.</li>
          <li><strong>Trip event notifications</strong> — pickup ready, trip started, trip completed, and inspection updates.</li>
          <li><strong>Host notifications</strong> — when a new booking is received on a vehicle you list.</li>
          <li><strong>Account and security alerts</strong> — verification codes, password resets, and account-related notices.</li>
        </ul>
        <p>
          We do not send promotional or marketing SMS under this opt-in. If we
          ever add a marketing program, we will request separate consent.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Sender identity</h2>
        <p>
          Messages are sent from <strong>+1 (888) 773-9405</strong>, our
          dedicated toll-free messaging number operated through Twilio. Live
          customer service conversations may come from our team line at{' '}
          <strong>318-RENT-UFS (318-736-8837)</strong> via OpenPhone.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Frequency</h2>
        <p>
          Message frequency varies based on your activity. Most users receive
          fewer than 10 messages per month. During an active rental, you may
          receive several event notifications per day (pickup, trip start,
          trip end, return).
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Cost</h2>
        <p>
          RentUFS does not charge for SMS. However,{' '}
          <strong>message and data rates may apply</strong> based on your
          mobile carrier plan. Contact your carrier with any questions about
          your plan.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>How to opt out</h2>
        <p>
          You can opt out at any time by replying <strong>STOP</strong> to any
          message we send. You will receive a one-time confirmation that you
          have been unsubscribed, after which we will stop sending SMS to your
          number. You can re-subscribe at any time by replying{' '}
          <strong>START</strong> or by updating your preferences in your
          account.
        </p>
        <p>
          Opting out of SMS does not affect your account or your ability to
          book vehicles. You will continue to receive transactional emails
          and may still be contacted by our team for live customer service.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Help</h2>
        <p>
          For help, reply <strong>HELP</strong> to any message, or contact us
          at{' '}
          <a href="mailto:support@rentufs.com" style={{ color: '#10b981' }}>
            support@rentufs.com
          </a>
          .
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Eligibility</h2>
        <p>
          You must be at least 18 years old and the authorized user or account
          holder of the mobile phone number you provide. By opting in, you
          represent that you have the authority to grant consent for that
          number.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Carrier disclaimer</h2>
        <p>
          Supported carriers include AT&amp;T, T-Mobile, Verizon Wireless,
          Sprint, Boost Mobile, U.S. Cellular, MetroPCS, Cricket, Virgin
          Mobile, and most other US carriers. Carriers are not liable for
          delayed or undelivered messages.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Privacy</h2>
        <p>
          We will not share your mobile phone number or message content with
          third parties or affiliates for marketing or promotional purposes.
          For more on how we handle your information, see our{' '}
          <a
            href="https://rentufs.com/privacy"
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: '#10b981' }}
          >
            Privacy Policy
          </a>
          .
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Changes</h2>
        <p>
          We may update these SMS Terms from time to time. When we do, we will
          update the "Last updated" date at the top of this page. Material
          changes to the program will require new consent.
        </p>
      </section>

      <section style={{ marginTop: '1.5rem' }}>
        <h2 style={{ fontSize: '1.25rem' }}>Contact</h2>
        <p>
          The Gleizer Group, LLC — operator of RentUFS<br />
          Email:{' '}
          <a href="mailto:support@rentufs.com" style={{ color: '#10b981' }}>
            support@rentufs.com
          </a>
        </p>
      </section>
    </div>
  );
};

export default SmsTerms;
