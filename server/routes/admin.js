const express = require('express');
const router = express.Router();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const adminAuth = require('../middleware/adminAuth');
const User = require('../models/User');
const Vehicle = require('../models/Vehicle');
const Booking = require('../models/Booking');
const Message = require('../models/Message');
const { validateVin } = require('../utils/vinValidation');
const { calculateProcessingFee } = require('../utils/stripeFee');
const {
  sendBookingExtensionEmail,
  sendReservationDatesUpdatedEmail,
  sendEmail,
  sendBookingCancellationEmail,
  sendBookingConfirmationToDriver,
  sendBookingNotificationToHost,
  sendTollChargeToDriver,
  sendTollNotificationToHost,
  sendChargeAddedToDriver,
  sendChargePaymentFailedToDriver,
  sendReturnReminderEmail,
  sendWelcomeEmail,
  sendVehicleListedEmail,
  sendPayoutNotificationEmail,
  sendRegistrationExpirationReminder,
  sendVehiclePausedEmail,
  sendEmailVerificationCode,
  sendRegistrationOtp,
  sendPasswordResetEmail
} = require('../utils/emailService');
const { sendSMS } = require('../utils/smsService');
const BroadcastTemplate = require('../models/BroadcastTemplate');
const SmsSubscriber = require('../models/SmsSubscriber');
const EmailSuppression = require('../models/EmailSuppression');
const SystemState = require('../models/SystemState');
const { isSuperAdmin } = require('../utils/superAdmin');
const { startRentalCoverage, stopRentalCoverage } = require('../utils/teqmobility');
const { previewHostPayout, processWeeklyPayouts } = require('../utils/scheduler');

// Append an admin action entry to a booking's audit log. Save before
// returning so the entry is persisted even if a later step fails.
async function logAdminAction(booking, admin, action, details = {}) {
  if (!booking.adminActions) booking.adminActions = [];
  booking.adminActions.push({
    admin: admin._id,
    adminEmail: admin.email,
    action,
    details,
    timestamp: new Date()
  });
  await booking.save();
}

// Verify the caller is an admin. Used by the frontend to gate /admin pages.
router.get('/ping', adminAuth, (req, res) => {
  res.json({
    ok: true,
    user: {
      id: req.user._id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName,
      role: req.user.role,
      isSuperAdmin: isSuperAdmin(req.user)
    }
  });
});

// ── Host payout preview (OWNER-ONLY) ────────────────────────────────────────
// Read-only: shows exactly what a host is currently owed (completed remaining +
// active days served, minus any penalty). NO money moves. Master admin only.
router.get('/hosts/:id/payout-preview', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const preview = await previewHostPayout(req.params.id);
    if (preview.error) {
      return res.status(404).json({ message: preview.error });
    }
    res.json(preview);
  } catch (error) {
    console.error('Host payout preview error:', error.message);
    res.status(500).json({ message: 'Failed to load payout preview', error: error.message });
  }
});

// ── Pay a host now (OWNER-ONLY) ─────────────────────────────────────────────
// Triggers the SAME payout engine as the weekly run, scoped to one host. The
// per-booking payoutStatus tracking guarantees a booking can't be paid twice —
// if the weekly run fires later, it finds nothing owed. Master admin only.
router.post('/hosts/:id/pay-now', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const host = await User.findById(req.params.id);
    if (!host) {
      return res.status(404).json({ message: 'Host not found' });
    }
    if (!host.stripeConnectAccountId || !host.stripeConnectPayoutsEnabled) {
      return res.status(400).json({ message: 'This host is not set up to receive payouts yet (Stripe Connect not enabled).' });
    }
    console.log(`💰 Manual payout triggered by ${req.user.email} for host ${host._id}`);
    const result = await processWeeklyPayouts({ hostId: host._id });
    if (!result.success) {
      return res.status(502).json({ message: result.error || 'Payout failed' });
    }
    res.json({
      success: true,
      hostsProcessed: result.hostsProcessed,
      totalTransferred: result.totalTransferred,
      hostsFailed: result.hostsFailed,
      message: result.hostsProcessed > 0
        ? `Payout sent: $${(result.totalTransferred || 0).toFixed(2)}`
        : 'No eligible earnings to pay right now.'
    });
  } catch (error) {
    console.error('Manual host payout error:', error.message);
    res.status(500).json({ message: 'Failed to run payout', error: error.message });
  }
});

// ── Waive a host's cancellation penalty (OWNER-ONLY) ────────────────────────
// Forgives some or all of a host's outstanding cancellation-penalty balance.
// Reads/writes ONLY the host's cancellationPenaltyBalance — it does NOT touch
// bookings, payments, Stripe charges, insurance, or tolls. Never goes below $0,
// and never waives more than is actually owed. Leaving `amount` blank waives
// the entire balance. Master admin only. NO money is transferred here.
router.post('/hosts/:id/waive-penalty', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const host = await User.findById(req.params.id);
    if (!host) return res.status(404).json({ message: 'Host not found' });

    const current = host.cancellationPenaltyBalance || 0;
    if (current <= 0) {
      return res.status(400).json({ message: 'This host has no outstanding penalty to waive.' });
    }

    // No amount given → waive everything. Otherwise waive exactly what's asked,
    // capped so it can never exceed what's owed or drive the balance negative.
    const raw = req.body.amount;
    let waive = (raw === undefined || raw === null || raw === '') ? current : Number(raw);
    if (isNaN(waive) || waive <= 0) {
      return res.status(400).json({ message: 'Enter a valid dollar amount to waive (or leave blank to waive all).' });
    }
    waive = Math.min(Math.round(waive * 100) / 100, current);
    const newBalance = Math.round((current - waive) * 100) / 100;

    host.cancellationPenaltyBalance = newBalance;
    await host.save();

    console.log(`💚 Penalty waived by ${req.user.email} for host ${host._id}: -$${waive.toFixed(2)} (was $${current.toFixed(2)}, now $${newBalance.toFixed(2)})`);

    res.json({
      success: true,
      waived: waive,
      previousBalance: current,
      newBalance,
      message: `Waived $${waive.toFixed(2)}. Remaining penalty: $${newBalance.toFixed(2)}.`
    });
  } catch (error) {
    console.error('Waive penalty error:', error.message);
    res.status(500).json({ message: 'Failed to waive penalty', error: error.message });
  }
});

// ── Automatic late-fee charging switch (OWNER-ONLY) ─────────────────────────
// The master kill switch for automatic late-return charging. Stored in
// SystemState so it flips instantly with no redeploy. Default OFF (safe).
router.get('/late-fee-setting', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const doc = await SystemState.findOne({ key: 'lateFeeCharging' });
    const charging = doc && String(doc.value).toLowerCase() === 'on' ? 'on' : 'off';
    res.json({ charging });
  } catch (error) {
    console.error('Late-fee setting read error:', error.message);
    res.status(500).json({ message: 'Failed to load setting', error: error.message });
  }
});

router.put('/late-fee-setting', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const value = String(req.body.charging).toLowerCase() === 'on' ? 'on' : 'off';
    await SystemState.findOneAndUpdate(
      { key: 'lateFeeCharging' },
      { value, updatedAt: new Date() },
      { upsert: true }
    );
    console.log(`🕓 Automatic late-fee charging switched ${value.toUpperCase()} by ${req.user.email}`);
    res.json({ success: true, charging: value });
  } catch (error) {
    console.error('Late-fee setting update error:', error.message);
    res.status(500).json({ message: 'Failed to update setting', error: error.message });
  }
});

// ── Live late-returns list (OWNER-ONLY) ─────────────────────────────────────
// Every currently-overdue active rental across the platform, for the owner's
// Late Returns command center. Read-only. Uses the same lateness math as the
// charging engine so the list and any charge always agree.
router.get('/late-returns', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const { getLateInfo, isBookingEligible } = require('../utils/lateReturn');
    const now = new Date();
    const bookings = await Booking.find({ status: 'active', paymentStatus: 'paid' })
      .populate('vehicle', 'make model year')
      .populate('driver', 'firstName lastName phone')
      .populate('host', 'firstName lastName phone');

    const rows = [];
    for (const b of bookings) {
      const info = getLateInfo(b, now);
      if (!info.isLate) continue;
      rows.push({
        id: b._id,
        reservationId: b.reservationId,
        vehicle: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Vehicle',
        driver: b.driver ? `${b.driver.firstName || ''} ${b.driver.lastName || ''}`.trim() : '',
        driverPhone: b.driver?.phone || '',
        host: b.host ? `${b.host.firstName || ''} ${b.host.lastName || ''}`.trim() : '',
        hostPhone: b.host?.phone || '',
        returnMoment: info.returnMoment,
        hoursLate: info.hoursLate,
        daysLate: info.daysLate,
        eligible: isBookingEligible(b),                  // subject to automatic charging?
        daysCharged: b.lateFee?.daysCharged || 0,
        totalCharged: b.lateFee?.totalCharged || 0,
        retryCount: b.lateFee?.retryCount || 0,
        nextRetryAt: b.lateFee?.nextRetryAt || null
      });
    }
    rows.sort((a, b) => b.hoursLate - a.hoursLate);
    res.json({ rows, count: rows.length });
  } catch (error) {
    console.error('Late returns list error:', error.message);
    res.status(500).json({ message: 'Failed to load late returns', error: error.message });
  }
});

// ── Tax / 1099 export (OWNER-ONLY) ──────────────────────────────────────────
// Returns every host's tax info + yearly NET earnings for 1099 filing.
// Restricted to super admins (the platform owner) — enforced here on the server
// AND hidden on the frontend, so regular admins can never see it.
// Includes DEACTIVATED accounts on purpose: a host who deletes/deactivates
// before tax season must still appear so their 1099 can be filed. Net earnings
// use the same segment-based math as the host's own reports & payouts.
router.get('/tax-export', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }

    const { getBookingSegments } = require('../utils/earningSegments');

    // Calendar year range in EST (Jan 1 – Dec 31). Defaults to current year.
    const EST_OFFSET = 5;
    const year = parseInt(req.query.year, 10) || new Date().getFullYear();
    const start = new Date(Date.UTC(year, 0, 1, EST_OFFSET, 0, 0, 0));
    const end = new Date(Date.UTC(year + 1, 0, 1, EST_OFFSET, 0, 0, 0) - 1);

    // All hosts — active AND deactivated (never drop tax data).
    const hosts = await User.find({ userType: { $in: ['host', 'both'] } })
      .select('firstName lastName email phone address accountStatus createdAt hostInfo')
      .lean();

    // All PAID bookings within the year, grouped by host.
    const bookings = await Booking.find({
      paymentStatus: 'paid',
      createdAt: { $gte: start, $lte: end }
    })
      .select('host totalPrice totalDays rentalType rentalSubtotal pricePerDay pricePerUnit quantity hostPlatformFeePerDay hostProcessingFee extensions')
      .lean();

    const byHost = {};
    for (const b of bookings) {
      const hid = String(b.host);
      if (!byHost[hid]) byHost[hid] = { gross: 0, platformFees: 0, stripeFees: 0, net: 0, count: 0 };
      const segments = getBookingSegments(b);
      byHost[hid].gross += segments.reduce((s, seg) => s + seg.rental, 0);
      byHost[hid].platformFees += segments.reduce((s, seg) => s + seg.hostFee, 0);
      byHost[hid].stripeFees += segments.reduce((s, seg) => s + seg.hostProcessingFee, 0);
      byHost[hid].net += segments.reduce((s, seg) => s + seg.earnings, 0);
      byHost[hid].count += 1;
    }

    const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

    const rows = hosts.map((h) => {
      const hi = h.hostInfo || {};
      const isBusiness = hi.accountType === 'business';
      const legalName = [hi.legalFirstName, hi.legalLastName].filter(Boolean).join(' ').trim();
      const displayName = legalName || `${h.firstName || ''} ${h.lastName || ''}`.trim();
      // Use the legal/business tax address on file; fall back to home address.
      const addr = (isBusiness ? hi.businessAddress : hi.legalAddress) || h.address || {};
      const e = byHost[String(h._id)] || { gross: 0, platformFees: 0, stripeFees: 0, net: 0, count: 0 };
      return {
        id: String(h._id),
        name: displayName || '—',
        businessName: hi.businessName || '',
        accountType: hi.accountType || 'individual',
        taxIdType: isBusiness ? 'EIN' : 'SSN',
        taxIdLast4: hi.taxIdLast4 || '',
        taxIdFull: hi.taxId || '',
        street: addr.street || '',
        city: addr.city || '',
        state: addr.state || '',
        zip: addr.zipCode || '',
        email: h.email || '',
        gross: round2(e.gross),
        platformFees: round2(e.platformFees),
        stripeFees: round2(e.stripeFees),
        netEarnings: round2(e.net),
        bookingCount: e.count,
        accountStatus: h.accountStatus || 'active'
      };
    });

    // Biggest earners first (most relevant for 1099 thresholds).
    rows.sort((a, b) => b.netEarnings - a.netEarnings);

    res.json({ year, hosts: rows });
  } catch (error) {
    console.error('Tax export error:', error);
    res.status(500).json({ message: 'Failed to build tax export', error: error.message });
  }
});

// ── Insurance Billing (OWNER-ONLY) ──────────────────────────────────────────
// Read-only monthly reconciliation against the TeqMobility insurance invoice.
// For a given month it lists every reservation that had coverage and rolls up
// the total COVERAGE DAYS (split Basic vs Premium) so the owner can match Nick's
// bill line-by-line. Deliberately stores/returns NO rates or dollar amounts —
// rates change, days don't. This endpoint only READS existing bookings; it never
// touches Stripe, TeqMobility, payouts, or any booking record.
router.get('/insurance-billing', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }

    // Month range in EST, same convention as the tax export. Defaults to the
    // current month if the param is missing/invalid.
    const EST_OFFSET = 5;
    let year, month;
    if (/^\d{4}-\d{2}$/.test(req.query.month || '')) {
      const parts = req.query.month.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    const start = new Date(Date.UTC(year, month - 1, 1, EST_OFFSET, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, EST_OFFSET, 0, 0, 0) - 1);

    // Reservations that (a) started this month, (b) weren't cancelled / abandoned
    // at checkout, and (c) actually had insurance coverage selected. A cancelled
    // reservation never went on rent, so it never costs insurance — excluded.
    // Only count reservations where coverage was ACTUALLY activated through
    // TeqMobility (a coverage record exists). That makes the total equal exactly
    // what the provider can bill — test/refunded/never-activated reservations,
    // where coverage was selected but never turned on, are excluded.
    const bookings = await Booking.find({
      startDate: { $gte: start, $lte: end },
      status: { $nin: ['cancelled', 'awaiting_payment'] },
      'insurance.type': { $nin: ['none', null] },
      'teqMobility.coverageId': { $exists: true, $ne: null }
    })
      .populate('vehicle', 'make model year location')
      .populate('driver', 'firstName lastName')
      .select('reservationId vehicle driver startDate endDate totalDays insurance teqMobility status')
      .lean();

    // Split into the two TeqMobility tiers by what the coverage actually included:
    //   Premium = physical-damage coverage (collision/comprehensive) on file
    //   Basic   = liability-only
    const tally = { Basic: { rentals: 0, days: 0 }, Premium: { rentals: 0, days: 0 } };
    const rows = bookings.map((b) => {
      const cov = b.insurance?.coverage || {};
      const physical = !!(cov.collision || cov.comprehensive);
      const tier = physical ? 'Premium' : 'Basic';
      const days = b.totalDays || 0;
      tally[tier].rentals += 1;
      tally[tier].days += days;
      const v = b.vehicle || {};
      const d = b.driver || {};
      return {
        id: String(b._id),
        reservationId: b.reservationId || '—',
        vehicle: [v.year, v.make, v.model].filter(Boolean).join(' ') || '—',
        driver: [d.firstName, d.lastName].filter(Boolean).join(' ') || '—',
        state: v.location?.state || '',
        tier,
        days,
        startDate: b.startDate,
        endDate: b.endDate,
        status: b.status,
        // Whether coverage was actually activated through TeqMobility (a coverage
        // record exists). Lets the owner see which rows the provider truly turned on.
        activated: !!(b.teqMobility && b.teqMobility.coverageId)
      };
    });

    rows.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const summary = [
      { tier: 'Basic', rentals: tally.Basic.rentals, days: tally.Basic.days },
      { tier: 'Premium', rentals: tally.Premium.rentals, days: tally.Premium.days }
    ];
    const totalDays = tally.Basic.days + tally.Premium.days;
    const totalRentals = tally.Basic.rentals + tally.Premium.rentals;

    res.json({
      month: `${year}-${String(month).padStart(2, '0')}`,
      summary,
      totalDays,
      totalRentals,
      rows
    });
  } catch (error) {
    console.error('Insurance billing error:', error);
    res.status(500).json({ message: 'Failed to build insurance billing report', error: error.message });
  }
});

// ── Salespeople list (OWNER-ONLY) ───────────────────────────────────────────
// Returns admins who can be credited as the salesperson that referred a host.
router.get('/salespeople', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const admins = await User.find({ role: 'admin' })
      .select('firstName lastName email')
      .sort({ firstName: 1 })
      .lean();
    res.json(admins.map((a) => ({
      id: String(a._id),
      name: `${a.firstName || ''} ${a.lastName || ''}`.trim() || a.email,
      email: a.email
    })));
  } catch (error) {
    console.error('Salespeople list error:', error.message);
    res.status(500).json({ message: 'Failed to load salespeople', error: error.message });
  }
});

// ── Set a host's referring salesperson (OWNER-ONLY) ─────────────────────────
// Owner-only on purpose: a salesperson must not be able to credit hosts to
// themselves. Pass { referredBy: <adminUserId> } or { referredBy: null } to clear.
router.patch('/users/:id/referred-by', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const { referredBy } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    // Validate the salesperson is a real admin (or null to clear).
    if (referredBy) {
      const sp = await User.findById(referredBy).select('role');
      if (!sp || sp.role !== 'admin') {
        return res.status(400).json({ message: 'Referring salesperson must be an admin.' });
      }
    }
    user.referredBy = referredBy || null;
    await user.save();
    console.log(`📣 Referred-by set by ${req.user.email} for host ${user._id}: ${referredBy || 'cleared'}`);
    res.json({ success: true, referredBy: user.referredBy });
  } catch (error) {
    console.error('Set referred-by error:', error.message);
    res.status(500).json({ message: 'Failed to set referring salesperson', error: error.message });
  }
});

// ── Commissions report (OWNER-ONLY) ─────────────────────────────────────────
// For a month, totals booked DAYS of paid (non-cancelled, non-refunded) bookings,
// grouped by the salesperson who referred each booking's host. Days only — the
// owner settles the per-day rate with the salesperson directly.
router.get('/commissions', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    // Month range in EST, same convention as the tax/insurance reports.
    const EST_OFFSET = 5;
    let year, month;
    if (/^\d{4}-\d{2}$/.test(req.query.month || '')) {
      const parts = req.query.month.split('-');
      year = parseInt(parts[0], 10);
      month = parseInt(parts[1], 10);
    } else {
      const now = new Date();
      year = now.getFullYear();
      month = now.getMonth() + 1;
    }
    const start = new Date(Date.UTC(year, month - 1, 1, EST_OFFSET, 0, 0, 0));
    const end = new Date(Date.UTC(year, month, 1, EST_OFFSET, 0, 0, 0) - 1);

    // Hosts that have a referring salesperson set.
    const referredHosts = await User.find({ referredBy: { $ne: null } })
      .select('firstName lastName referredBy')
      .lean();
    if (referredHosts.length === 0) {
      return res.json({ month: `${year}-${String(month).padStart(2, '0')}`, salespeople: [], totalDays: 0 });
    }
    const hostMap = new Map(referredHosts.map((h) => [String(h._id), h]));
    const hostIds = referredHosts.map((h) => h._id);

    // Paid, non-cancelled, non-refunded bookings for those hosts that started this month.
    const bookings = await Booking.find({
      host: { $in: hostIds },
      startDate: { $gte: start, $lte: end },
      status: { $nin: ['cancelled', 'awaiting_payment'] },
      paymentStatus: 'paid'
    }).populate('vehicle', 'make model year').select('host vehicle totalDays reservationId startDate endDate status').lean();

    // Salesperson names.
    const salespersonIds = [...new Set(referredHosts.map((h) => String(h.referredBy)))];
    const salespeople = await User.find({ _id: { $in: salespersonIds } }).select('firstName lastName email').lean();
    const spMap = new Map(salespeople.map((s) => [String(s._id), `${s.firstName || ''} ${s.lastName || ''}`.trim() || s.email]));

    // Aggregate: salesperson -> { days, rentals, rows[] }
    const tally = {};
    let grandTotalDays = 0;
    for (const b of bookings) {
      const host = hostMap.get(String(b.host));
      if (!host || !host.referredBy) continue;
      const spId = String(host.referredBy);
      if (!tally[spId]) {
        tally[spId] = { salespersonId: spId, salesperson: spMap.get(spId) || 'Unknown', days: 0, rentals: 0, rows: [] };
      }
      const days = b.totalDays || 0;
      tally[spId].days += days;
      tally[spId].rentals += 1;
      grandTotalDays += days;
      const v = b.vehicle || {};
      tally[spId].rows.push({
        reservationId: b.reservationId || '—',
        host: `${host.firstName || ''} ${host.lastName || ''}`.trim(),
        vehicle: [v.year, v.make, v.model].filter(Boolean).join(' ') || '—',
        days,
        startDate: b.startDate,
        endDate: b.endDate,
        status: b.status
      });
    }

    const salespeopleOut = Object.values(tally).sort((a, b) => b.days - a.days);
    salespeopleOut.forEach((sp) => sp.rows.sort((a, b) => new Date(a.startDate) - new Date(b.startDate)));

    res.json({
      month: `${year}-${String(month).padStart(2, '0')}`,
      salespeople: salespeopleOut,
      totalDays: grandTotalDays
    });
  } catch (error) {
    console.error('Commissions report error:', error.message);
    res.status(500).json({ message: 'Failed to build commissions report', error: error.message });
  }
});

// Dashboard stats — counts and totals for the admin landing page.
router.get('/stats', adminAuth, async (req, res) => {
  try {
    // Compute day/week/month boundaries in Eastern time (EST), matching the
    // EST_OFFSET convention already used in reports.js — otherwise the server's
    // UTC clock makes "Today" roll over at 8 PM Eastern instead of midnight.
    const EST_OFFSET = 5; // hours behind UTC
    const now = new Date();
    const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
    // Midnight Eastern today, expressed as a UTC instant (midnight EST = 05:00 UTC)
    const startOfDay = new Date(Date.UTC(nowEST.getUTCFullYear(), nowEST.getUTCMonth(), nowEST.getUTCDate(), EST_OFFSET, 0, 0, 0));
    const startOfWeek = new Date(startOfDay.getTime() - 7 * 24 * 60 * 60 * 1000);
    const startOfMonth = new Date(Date.UTC(nowEST.getUTCFullYear(), nowEST.getUTCMonth(), 1, EST_OFFSET, 0, 0, 0));

    const [
      totalUsers,
      totalDrivers,
      totalHosts,
      totalVehicles,
      activeVehicles,
      totalBookings,
      bookingsToday,
      bookingsThisWeek,
      bookingsThisMonth,
      activeBookings,
      pendingBookings,
      revenueAgg
    ] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ userType: { $in: ['driver', 'both'] } }),
      User.countDocuments({ userType: { $in: ['host', 'both'] } }),
      Vehicle.countDocuments({}),
      Vehicle.countDocuments({ availability: true }),
      // Booking counts exclude cancelled and never-completed-checkout bookings so
      // metrics reflect real bookings, not abandoned/cancelled ones.
      Booking.countDocuments({ status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ createdAt: { $gte: startOfDay }, status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ createdAt: { $gte: startOfWeek }, status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ createdAt: { $gte: startOfMonth }, status: { $nin: ['cancelled', 'awaiting_payment'] } }),
      Booking.countDocuments({ status: 'active' }),
      Booking.countDocuments({ status: 'pending' }),
      Booking.aggregate([
        { $match: { paymentStatus: 'paid' } },
        { $group: { _id: null, total: { $sum: '$totalPrice' }, platformRev: { $sum: '$platformRevenue' } } }
      ])
    ]);

    const totalRevenue = revenueAgg[0]?.total || 0;
    const platformRevenue = revenueAgg[0]?.platformRev || 0;

    res.json({
      users: { total: totalUsers, drivers: totalDrivers, hosts: totalHosts },
      vehicles: { total: totalVehicles, active: activeVehicles },
      bookings: {
        total: totalBookings,
        today: bookingsToday,
        thisWeek: bookingsThisWeek,
        thisMonth: bookingsThisMonth,
        active: activeBookings,
        pending: pendingBookings
      },
      revenue: { total: totalRevenue, platform: platformRevenue }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load stats', error: err.message });
  }
});

// List bookings with optional search/filter/pagination.
router.get('/bookings', adminAuth, async (req, res) => {
  try {
    const { search = '', status = '', paymentStatus = '', page = 1, limit = 25 } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (paymentStatus) filter.paymentStatus = paymentStatus;

    let query = Booking.find(filter);

    if (search) {
      const matchingUsers = await User.find({
        $or: [
          { email: { $regex: search, $options: 'i' } },
          { firstName: { $regex: search, $options: 'i' } },
          { lastName: { $regex: search, $options: 'i' } }
        ]
      }).select('_id');
      const userIds = matchingUsers.map((u) => u._id);
      query = Booking.find({
        $and: [
          filter,
          {
            $or: [
              { reservationId: { $regex: search, $options: 'i' } },
              { driver: { $in: userIds } },
              { host: { $in: userIds } }
            ]
          }
        ]
      });
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [bookings, total] = await Promise.all([
      query
        .populate('vehicle', 'make model year images')
        .populate('driver', 'email firstName lastName phone')
        .populate('host', 'email firstName lastName phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Booking.countDocuments(query.getFilter())
    ]);

    res.json({ bookings, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load bookings', error: err.message });
  }
});

// Get a single booking with full detail.
router.get('/bookings/:id', adminAuth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver', '-password')
      .populate('host', '-password');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    res.json(booking);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load booking', error: err.message });
  }
});

// Read-only: all chat messages for a booking (admin oversight). Separate from
// the driver/host /messages routes so their behavior is unchanged.
router.get('/bookings/:id/messages', adminAuth, async (req, res) => {
  try {
    const messages = await Message.find({ booking: req.params.id })
      .sort({ createdAt: 1 })
      .populate('sender', 'firstName lastName profileImage')
      .lean();
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load messages', error: err.message });
  }
});

// Change booking status. Admins can override the normal flow.
// ── Record a booking's TeqMobility Coverage ID (OWNER-ONLY) ─────────────────
// Saves the real coverage ID (from TeqMobility's dashboard) onto a booking so it
// reconciles in the insurance billing tab. Writes ONLY this one reference field —
// does NOT call TeqMobility or change the actual policy.
router.patch('/bookings/:id/coverage-id', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Owner access required.' });
    }
    const coverageId = String(req.body.coverageId || '').trim();
    if (!coverageId) {
      return res.status(400).json({ message: 'Coverage ID is required.' });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }
    await Booking.findByIdAndUpdate(booking._id, { 'teqMobility.coverageId': coverageId });
    console.log(`🛡️ Coverage ID manually recorded by ${req.user.email} for booking ${booking._id}: ${coverageId}`);
    res.json({ success: true, message: 'Coverage ID saved.', coverageId });
  } catch (error) {
    console.error('Set coverage ID error:', error.message);
    res.status(500).json({ message: 'Failed to save coverage ID', error: error.message });
  }
});

router.patch('/bookings/:id/status', adminAuth, async (req, res) => {
  try {
    const { status, paymentStatus, note } = req.body;
    const allowed = ['awaiting_payment', 'pending', 'confirmed', 'active', 'completed', 'cancelled'];
    if (status && !allowed.includes(status)) {
      return res.status(400).json({ message: `Invalid status. Must be one of: ${allowed.join(', ')}` });
    }
    // Payment status is RECORD-ONLY here — it does NOT call Stripe. It's for
    // reflecting a refund already issued in Stripe, or correcting a record. To
    // actually move money, use the /refund route instead.
    const allowedPayments = ['pending', 'paid', 'refunded', 'partial_refund', 'failed', 'expired'];
    if (paymentStatus && !allowedPayments.includes(paymentStatus)) {
      return res.status(400).json({ message: `Invalid payment status. Must be one of: ${allowedPayments.join(', ')}` });
    }
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const previousStatus = booking.status;
    const previousPayment = booking.paymentStatus;
    if (status) booking.status = status;
    if (status === 'cancelled') {
      booking.cancelledBy = 'admin';
      booking.cancelledAt = new Date();
      if (note) booking.cancellationReason = note;
    }
    if (paymentStatus) booking.paymentStatus = paymentStatus;
    // Persistent, editable note shown on the booking (not buried in the log).
    if (note !== undefined) booking.adminNote = note;

    await logAdminAction(booking, req.user, 'status_changed', {
      from: previousStatus,
      to: status || previousStatus,
      paymentFrom: previousPayment,
      paymentTo: paymentStatus || previousPayment,
      note: note || null
    });
    res.json({ ok: true, booking });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update status', error: err.message });
  }
});

// Edit booking dates (and recalculate totalDays). Use with care — this does
// not adjust pricing automatically. For paid extensions use /extend below.
router.patch('/bookings/:id/dates', adminAuth, async (req, res) => {
  try {
    const { startDate, endDate, pickupTime, note } = req.body;
    const booking = await Booking.findById(req.params.id)
      .populate('driver', 'firstName lastName email')
      .populate('vehicle', 'make model year');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const previousStart = booking.startDate;
    const previousEnd = booking.endDate;
    const previousPickupTime = booking.pickupTime;
    if (startDate) booking.startDate = new Date(startDate);
    if (endDate) booking.endDate = new Date(endDate);
    // 24-hour rentals: the return time always mirrors the pickup time.
    if (pickupTime) {
      booking.pickupTime = pickupTime;
      booking.dropoffTime = pickupTime;
    }

    const msPerDay = 24 * 60 * 60 * 1000;
    booking.totalDays = Math.max(1, Math.ceil((booking.endDate - booking.startDate) / msPerDay));

    await logAdminAction(booking, req.user, 'dates_changed', {
      previousStart,
      previousEnd,
      previousPickupTime,
      newStart: booking.startDate,
      newEnd: booking.endDate,
      newPickupTime: booking.pickupTime,
      newTotalDays: booking.totalDays,
      note: note || null
    });

    // Notify the driver of the new schedule — best-effort, never blocks the save.
    try {
      await sendReservationDatesUpdatedEmail(booking.driver, booking, booking.vehicle);
    } catch (e) {
      console.error('Dates-updated email failed (non-blocking):', e.message);
    }

    res.json({ ok: true, booking });
  } catch (err) {
    res.status(500).json({ message: 'Failed to update dates', error: err.message });
  }
});

// Admin-initiated booking extension. Default: auto-charge the driver via
// Stripe using their saved payment method. Pass charge=false to skip the
// charge (goodwill credit, manual reconciliation, etc.).
router.post('/bookings/:id/extend', adminAuth, async (req, res) => {
  try {
    const { extensionDays, charge = true, reason } = req.body;
    const days = parseInt(extensionDays, 10);
    if (!days || days < 1 || days > 60) {
      return res.status(400).json({ message: 'extensionDays must be between 1 and 60' });
    }

    const booking = await Booking.findById(req.params.id)
      .populate('vehicle')
      .populate('driver')
      .populate('host', 'firstName lastName email');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    // Compute the new end date and extension cost using the same formula
    // as the driver-initiated extension flow.
    const previousEndDate = new Date(booking.endDate);
    const newEndDate = new Date(booking.endDate);
    newEndDate.setDate(newEndDate.getDate() + days);

    const rentalCost = days * booking.pricePerDay;
    const platformFee = days * (booking.platformFeePerDay || 1.50);
    const insurance = days * (booking.insurance?.costPerDay || 0);
    const baseTotal = rentalCost + platformFee + insurance;
    const processing = calculateProcessingFee(baseTotal);
    const extensionCost = baseTotal + processing.driverProcessingFee;

    let chargeResult = null;
    let chargeError = null;
    if (charge) {
      const driver = booking.driver;
      const defaultPM = driver?.paymentMethods?.find((pm) => pm.isDefault && pm.stripePaymentMethodId);
      if (!driver?.stripeCustomerId || !defaultPM) {
        chargeError = 'Driver has no saved payment method on file';
      } else {
        try {
          const intent = await stripe.paymentIntents.create({
            amount: Math.round(extensionCost * 100),
            currency: 'usd',
            customer: driver.stripeCustomerId,
            payment_method: defaultPM.stripePaymentMethodId,
            off_session: true,
            confirm: true,
            automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
            metadata: {
              type: 'admin_extension',
              bookingId: String(booking._id),
              reservationId: booking.reservationId || '',
              extensionDays: String(days),
              adminEmail: req.user.email
            },
            description: `Admin extension (${days} day${days !== 1 ? 's' : ''}) on ${booking.reservationId || booking._id}`
          });
          if (intent.status !== 'succeeded') {
            chargeError = `Payment intent status: ${intent.status}`;
          } else {
            chargeResult = { id: intent.id, amount: extensionCost };
          }
        } catch (err) {
          chargeError = err.message || 'Stripe charge failed';
        }
      }
    }

    // If we attempted a charge and it failed, do NOT mutate the booking dates.
    // The admin should see the failure and decide what to do (recover the
    // vehicle, escalate, retry with a different card, etc.).
    if (charge && chargeError) {
      await logAdminAction(booking, req.user, 'charge_failed', {
        extensionDays: days,
        attemptedAmount: extensionCost,
        error: chargeError,
        reason: reason || null
      });
      return res.status(402).json({
        ok: false,
        message: 'Extension charge failed — booking dates NOT updated.',
        error: chargeError,
        attemptedAmount: extensionCost
      });
    }

    // Apply the extension. Mirrors the user-facing /confirm-extension path.
    booking.endDate = newEndDate;
    booking.totalDays = booking.totalDays + days;
    booking.totalPrice = booking.totalPrice + (charge ? extensionCost : 0);
    if (charge) {
      booking.platformFee = (booking.platformFee || 0) + platformFee;
      booking.driverProcessingFee = (booking.driverProcessingFee || 0) + processing.driverProcessingFee;
      booking.hostProcessingFee = (booking.hostProcessingFee || 0) + processing.hostProcessingFee;
      booking.stripeFee = (booking.stripeFee || 0) + processing.stripeFee;
      if (booking.insurance && booking.insurance.totalCost !== undefined) {
        booking.insurance.totalCost = (booking.insurance.totalCost || 0) + insurance;
      }
      const hostFee = days * (booking.hostPlatformFeePerDay || 1.50);
      booking.hostPlatformFee = (booking.hostPlatformFee || 0) + hostFee;
      booking.hostEarnings = (booking.hostEarnings || 0) + rentalCost - hostFee - processing.hostProcessingFee;
      booking.platformRevenue = (booking.platformRevenue || 0) + platformFee + hostFee + insurance;
    }

    if (!booking.extensions) booking.extensions = [];
    booking.extensions.push({
      days,
      cost: charge ? extensionCost : 0,
      rental: charge ? rentalCost : 0,
      rentalType: 'daily',
      platformFee: charge ? platformFee : 0,
      insurance: charge ? insurance : 0,
      processingFee: charge ? processing.driverProcessingFee : 0,
      hostProcessingFee: charge ? processing.hostProcessingFee : 0,
      newEndDate,
      paymentId: chargeResult?.id || null,
      extendedAt: new Date()
    });

    await logAdminAction(booking, req.user, 'extended', {
      extensionDays: days,
      previousEndDate,
      newEndDate,
      charged: !!chargeResult,
      amount: chargeResult?.amount || 0,
      paymentIntentId: chargeResult?.id || null,
      reason: reason || null
    });

    // Notify driver + host that the booking was extended.
    try {
      await sendBookingExtensionEmail(booking.driver, booking.host, booking, booking.vehicle);
    } catch (emailErr) {
      console.error('Admin extension email failed (non-blocking):', emailErr.message);
    }

    res.json({
      ok: true,
      booking,
      charged: !!chargeResult,
      paymentIntentId: chargeResult?.id || null,
      amount: chargeResult?.amount || 0
    });
  } catch (err) {
    console.error('Admin extension error:', err);
    res.status(500).json({ message: 'Failed to extend booking', error: err.message });
  }
});

// Manually charge the driver for an arbitrary amount (late fee, damage,
// extension settlement, etc.). Uses the saved payment method.
router.post('/bookings/:id/charge', adminAuth, async (req, res) => {
  try {
    const { amount, description = 'Manual admin charge' } = req.body;
    const cents = Math.round(Number(amount) * 100);
    if (!cents || cents < 50) {
      return res.status(400).json({ message: 'amount must be at least $0.50' });
    }
    const booking = await Booking.findById(req.params.id).populate('driver');
    if (!booking) return res.status(404).json({ message: 'Booking not found' });

    const driver = booking.driver;
    const defaultPM = driver?.paymentMethods?.find((pm) => pm.isDefault && pm.stripePaymentMethodId);
    if (!driver?.stripeCustomerId || !defaultPM) {
      return res.status(400).json({ message: 'Driver has no saved payment method on file' });
    }

    try {
      const intent = await stripe.paymentIntents.create({
        amount: cents,
        currency: 'usd',
        customer: driver.stripeCustomerId,
        payment_method: defaultPM.stripePaymentMethodId,
        off_session: true,
        confirm: true,
        automatic_payment_methods: { enabled: true, allow_redirects: 'never' },
        metadata: {
          type: 'admin_manual_charge',
          bookingId: String(booking._id),
          reservationId: booking.reservationId || '',
          adminEmail: req.user.email
        },
        description: `${description} (${booking.reservationId || booking._id})`
      });
      if (intent.status !== 'succeeded') {
        await logAdminAction(booking, req.user, 'charge_failed', { amount, description, status: intent.status });
        return res.status(402).json({ ok: false, message: `Status: ${intent.status}` });
      }
      await logAdminAction(booking, req.user, 'charged', { amount, description, paymentIntentId: intent.id });
      res.json({ ok: true, paymentIntentId: intent.id, amount });
    } catch (err) {
      await logAdminAction(booking, req.user, 'charge_failed', { amount, description, error: err.message });
      res.status(402).json({ ok: false, message: err.message });
    }
  } catch (err) {
    res.status(500).json({ message: 'Charge failed', error: err.message });
  }
});

// Issue a refund through Stripe. Pass `amount` (in dollars) for partial refund,
// or omit for a full refund.
router.post('/bookings/:id/refund', adminAuth, async (req, res) => {
  try {
    const { amount, reason = 'requested_by_customer' } = req.body;
    const booking = await Booking.findById(req.params.id);
    if (!booking) return res.status(404).json({ message: 'Booking not found' });
    if (!booking.paymentSessionId) {
      return res.status(400).json({ message: 'No payment session attached to this booking' });
    }

    // paymentSessionId can hold EITHER a Checkout Session id (cs_...) or a
    // PaymentIntent id (pi_...), depending on which payment flow the driver
    // used. Resolve to a PaymentIntent id for both so refunds always work.
    let paymentIntentId;
    if (booking.paymentSessionId.startsWith('pi_')) {
      paymentIntentId = booking.paymentSessionId;
    } else {
      const session = await stripe.checkout.sessions.retrieve(booking.paymentSessionId);
      paymentIntentId = session.payment_intent;
    }
    if (!paymentIntentId) {
      return res.status(400).json({ message: 'Stripe payment intent not found' });
    }

    const refundParams = { payment_intent: paymentIntentId, reason };
    if (amount && Number(amount) > 0) {
      refundParams.amount = Math.round(Number(amount) * 100); // dollars to cents
    }

    const refund = await stripe.refunds.create(refundParams);

    booking.paymentStatus = amount ? 'partial_refund' : 'refunded';
    await logAdminAction(booking, req.user, 'refunded', {
      amount: amount || null,
      reason,
      refundId: refund.id,
      partial: !!amount
    });

    res.json({ ok: true, refund, booking });
  } catch (err) {
    res.status(500).json({ message: 'Refund failed', error: err.message });
  }
});

// List users with optional search/filter/pagination.
router.get('/users', adminAuth, async (req, res) => {
  try {
    const { search = '', userType = '', role = '', accountStatus = '', page = 1, limit = 25 } = req.query;
    const filter = {};
    if (userType) filter.userType = userType;
    if (role) filter.role = role;
    if (accountStatus) filter.accountStatus = accountStatus;
    if (search) {
      filter.$or = [
        { email: { $regex: search, $options: 'i' } },
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { phone: { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -resetPasswordToken -resetPasswordExpires')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter)
    ]);

    res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load users', error: err.message });
  }
});

router.get('/users/:id', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password').lean();
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user', error: err.message });
  }
});

// Bookings for a user — as driver AND as host, sorted by most recent first.
router.get('/users/:id/bookings', adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const [asDriver, asHost] = await Promise.all([
      Booking.find({ driver: userId })
        .populate('vehicle', 'make model year images')
        .populate('host', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean(),
      Booking.find({ host: userId })
        .populate('vehicle', 'make model year images')
        .populate('driver', 'firstName lastName email')
        .sort({ createdAt: -1 })
        .limit(100)
        .lean()
    ]);
    res.json({ asDriver, asHost });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user bookings', error: err.message });
  }
});

// Vehicles owned by a user (host).
router.get('/users/:id/vehicles', adminAuth, async (req, res) => {
  try {
    const vehicles = await Vehicle.find({ host: req.params.id }).sort({ createdAt: -1 }).lean();
    res.json({ vehicles });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user vehicles', error: err.message });
  }
});

// Aggregate stats for a user's lifetime activity.
router.get('/users/:id/stats', adminAuth, async (req, res) => {
  try {
    const userId = req.params.id;
    const [driverAgg, hostAgg, vehicleCount] = await Promise.all([
      Booking.aggregate([
        { $match: { driver: new (require('mongoose').Types.ObjectId)(String(userId)), paymentStatus: 'paid' } },
        { $group: { _id: null, count: { $sum: 1 }, totalSpent: { $sum: '$totalPrice' } } }
      ]),
      Booking.aggregate([
        { $match: { host: new (require('mongoose').Types.ObjectId)(String(userId)), paymentStatus: 'paid' } },
        { $group: { _id: null, count: { $sum: 1 }, totalEarned: { $sum: '$hostEarnings' }, grossBookings: { $sum: '$totalPrice' } } }
      ]),
      Vehicle.countDocuments({ host: userId })
    ]);
    res.json({
      asDriver: {
        paidBookings: driverAgg[0]?.count || 0,
        totalSpent: driverAgg[0]?.totalSpent || 0
      },
      asHost: {
        paidBookings: hostAgg[0]?.count || 0,
        totalEarned: hostAgg[0]?.totalEarned || 0,
        grossBookings: hostAgg[0]?.grossBookings || 0,
        vehicleCount
      }
    });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load user stats', error: err.message });
  }
});

// Edit basic user fields. Admins cannot change passwords directly — they
// trigger a reset link instead (separate endpoint).
router.patch('/users/:id', adminAuth, async (req, res) => {
  try {
    // Protect the owner: only a super admin may edit a super admin's account.
    const target = await User.findById(req.params.id).select('email isSuperAdmin');
    if (target && isSuperAdmin(target) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'You cannot modify the owner account.' });
    }
    const allowedFields = ['firstName', 'lastName', 'email', 'phone', 'userType', 'accountStatus'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // Custom per-host insurance rate (per day). Empty string / null clears it
    // (host reverts to the platform default). A positive number sets the override.
    if (req.body.customInsuranceRate !== undefined) {
      const raw = req.body.customInsuranceRate;
      if (raw === '' || raw === null) {
        updates['hostInfo.customInsuranceRate'] = null;
      } else {
        const rate = Number(raw);
        if (Number.isNaN(rate) || rate < 0) {
          return res.status(400).json({ message: 'Custom insurance rate must be a positive number' });
        }
        updates['hostInfo.customInsuranceRate'] = rate;
      }
    }

    // Custom per-host Full Coverage rate (per day). Empty/null clears it (host
    // reverts to the standard $33). A positive number sets the negotiated override.
    if (req.body.customFullCoverageRate !== undefined) {
      const raw = req.body.customFullCoverageRate;
      if (raw === '' || raw === null) {
        updates['hostInfo.customFullCoverageRate'] = null;
      } else {
        const rate = Number(raw);
        if (Number.isNaN(rate) || rate < 0) {
          return res.status(400).json({ message: 'Custom Full Coverage rate must be a positive number' });
        }
        updates['hostInfo.customFullCoverageRate'] = rate;
      }
    }

    // Per-host insurance coverage type. Applies to all of the host's vehicles
    // and is passed to TeqMobility when starting coverage.
    if (req.body.coverageType !== undefined) {
      const ct = req.body.coverageType;
      if (ct !== 'FULL_COVERAGE' && ct !== 'LIABILITY') {
        return res.status(400).json({ message: 'Coverage type must be FULL_COVERAGE or LIABILITY' });
      }
      updates['hostInfo.coverageType'] = ct;
    }

    const user = await User.findByIdAndUpdate(req.params.id, updates, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update user', error: err.message });
  }
});

router.post('/users/:id/suspend', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuperAdmin(user) && !isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'You cannot deactivate the owner account.' });
    }
    user.accountStatus = 'deactivated';
    user.deactivatedAt = new Date();
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to suspend user', error: err.message });
  }
});

router.post('/users/:id/reactivate', adminAuth, async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.accountStatus = 'active';
    user.deactivatedAt = undefined;
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to reactivate user', error: err.message });
  }
});

router.post('/users/:id/promote', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only the owner can manage admin access.' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.role = 'admin';
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to promote user', error: err.message });
  }
});

router.post('/users/:id/demote', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only the owner can manage admin access.' });
    }
    if (String(req.user._id) === String(req.params.id)) {
      return res.status(400).json({ message: 'You cannot demote yourself' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    if (isSuperAdmin(user)) {
      return res.status(403).json({ message: 'The owner account cannot be demoted.' });
    }
    user.role = 'user';
    await user.save();
    res.json({ ok: true, user });
  } catch (err) {
    res.status(500).json({ message: 'Failed to demote user', error: err.message });
  }
});

// List vehicles with optional search/filter/pagination.
router.get('/vehicles', adminAuth, async (req, res) => {
  try {
    const { search = '', availability = '', page = 1, limit = 25 } = req.query;
    const filter = {};
    if (availability === 'true') filter.availability = true;
    if (availability === 'false') filter.availability = false;
    if (search) {
      filter.$or = [
        { make: { $regex: search, $options: 'i' } },
        { model: { $regex: search, $options: 'i' } },
        { 'location.city': { $regex: search, $options: 'i' } },
        { 'location.state': { $regex: search, $options: 'i' } }
      ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [vehicles, total] = await Promise.all([
      Vehicle.find(filter)
        .populate('host', 'email firstName lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Vehicle.countDocuments(filter)
    ]);

    res.json({ vehicles, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ message: 'Failed to load vehicles', error: err.message });
  }
});

router.patch('/vehicles/:id', adminAuth, async (req, res) => {
  try {
    const allowedFields = ['availability', 'make', 'model', 'year', 'pricePerDay', 'pricePerWeek', 'pricePerMonth'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    }

    // VIN correction is admin-only (hosts can't change it for insurance/legal
    // integrity). Validate the check digit, and never allow a change while the
    // vehicle is on an active rental (it would break the insurance link).
    if (req.body.vin !== undefined) {
      const newVin = String(req.body.vin).toUpperCase().trim();
      const check = validateVin(newVin);
      if (!check.valid) {
        return res.status(400).json({ message: `Invalid VIN: ${check.reason}` });
      }
      const activeRental = await Booking.findOne({ vehicle: req.params.id, status: 'active' });
      if (activeRental) {
        return res.status(409).json({ message: 'Cannot change VIN while this vehicle has an active rental. Wait until the trip is completed.' });
      }
      updates.vin = newVin;
    }

    const vehicle = await Vehicle.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });
    res.json(vehicle);
  } catch (err) {
    res.status(500).json({ message: 'Failed to update vehicle', error: err.message });
  }
});

// ===========================================================================
// Broadcast — admin mass email / SMS to platform users (hosts/drivers).
// Additive feature. Does not touch booking, payment, insurance, or any
// existing notification flow. Email goes out via the same SendGrid setup used
// for transactional mail; SMS via the same Twilio setup used for booking
// alerts (and only to users who opted in to texts).
// ===========================================================================

// Build the audience filter from a target keyword.
function broadcastAudienceQuery(target) {
  if (target === 'hosts') return { userType: { $in: ['host', 'both'] } };
  if (target === 'drivers') return { userType: { $in: ['driver', 'both'] } };
  return {}; // 'both' / anything else => everyone
}

// Replace {firstName} with the recipient's first name.
function personalizeBroadcast(text, user) {
  return (text || '').replace(/\{firstName\}/g, (user && user.firstName) || 'there');
}

// Wrap a plain-text broadcast message in simple branded HTML + an unsubscribe
// footer (required for marketing email / keeps SendGrid happy).
function broadcastEmailHtml(messageText, unsubscribeUrl) {
  const safe = String(messageText || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>');
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#064e3b;text-decoration:underline">Unsubscribe from promotional emails</a>`
    : '';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border:3px solid #00FF66;border-radius:8px;overflow:hidden;">
        <div style="background:#000000;padding:26px 20px;text-align:center;">
          <span style="font-size:30px;font-weight:bold;letter-spacing:4px;color:#00FF66;">RENTUFS</span>
        </div>
        <div style="background:#f9fafb;padding:30px 28px;color:#333333;font-size:15px;line-height:1.7;">${safe}</div>
        <div style="background:#00FF66;text-align:center;color:#000000;padding:20px;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>
          597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}
        </div>
      </div>
    </div>
  </body></html>`;
}

// Pre-designed "Become a Host" pitch email for the sales team to send to
// prospective hosts. Branded, generic (no individual's name so it never needs
// updating when sales staff change), with a Host Guide button + support contact.
function becomeHostEmailHtml(firstName, unsubscribeUrl) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi,';
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#064e3b;text-decoration:underline">Unsubscribe</a>`
    : '';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border:3px solid #00FF66;border-radius:8px;overflow:hidden;">
        <div style="background:#000000;padding:26px 20px;text-align:center;">
          <span style="font-size:30px;font-weight:bold;letter-spacing:4px;color:#00FF66;">RENTUFS</span>
        </div>
        <div style="background:#f9fafb;padding:30px 28px;color:#333333;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 14px;font-size:1.25rem;font-weight:bold;color:#111827;">Turn your car into income — and keep 100% of it. 🚗</p>
          <p style="margin:0 0 14px;">${greeting}</p>
          <p style="margin:0 0 14px;">RentUFS is a car-sharing marketplace that connects your vehicle with verified, insured renters — so your car earns money even when you're not using it.</p>
          <p style="margin:0 0 10px;">Here's why hosts choose us:</p>
          <ul style="margin:0 0 18px;padding-left:20px;">
            <li style="margin-bottom:6px;"><strong>0% commission</strong> — you keep <strong>100%</strong> of your rental income.</li>
            <li style="margin-bottom:6px;">You set your own <strong>price and availability</strong>.</li>
            <li style="margin-bottom:6px;">Every renter is <strong>verified and insured</strong> during the trip.</li>
            <li style="margin-bottom:6px;">Simple setup — list your car in minutes.</li>
          </ul>
          <p style="margin:0 0 8px;">Want to see exactly how it works? Our Host Guide walks you through everything:</p>
          <p style="text-align:center;margin:22px 0;">
            <a href="https://rentufs.com/host-guide" style="display:inline-block;background:#10b981;color:#ffffff;padding:13px 32px;text-decoration:none;border-radius:6px;font-weight:bold;">View the Host Guide</a>
          </p>
          <p style="margin:0;">Questions or need a hand getting started? Just reply to this email, call or text us at <a href="tel:+13187368837" style="color:#10b981;font-weight:bold;">318-RENT-UFS</a>, or email <a href="mailto:support@rentufs.com" style="color:#10b981;">support@rentufs.com</a> — we're happy to help.</p>
          <p style="margin:16px 0 0;">Looking forward to having you on board,<br>The RentUFS Team</p>
        </div>
        <div style="background:#00FF66;text-align:center;color:#000000;padding:20px;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>
          597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}
        </div>
      </div>
    </div>
  </body></html>`;
}

// Pre-designed "List Your Car" reminder for hosts who signed up but haven't
// listed a vehicle yet. Branded green/black, upbeat, drives to Add New Vehicle.
function listYourCarEmailHtml(firstName, unsubscribeUrl) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#064e3b;text-decoration:underline">Unsubscribe</a>`
    : '';
  const clientUrl = process.env.CLIENT_URL || 'https://app.rentufs.com';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border:3px solid #00FF66;border-radius:8px;overflow:hidden;">
        <div style="background:#000000;padding:26px 20px 10px;text-align:center;">
          <span style="font-size:30px;font-weight:bold;letter-spacing:4px;color:#00FF66;">RENTUFS</span>
        </div>
        <div style="background:#000000;padding:0 20px 22px;text-align:center;">
          <span style="display:inline-block;background:#00FF66;color:#000000;font-weight:bold;font-size:13px;letter-spacing:1px;padding:6px 16px;border-radius:20px;">🚗 YOUR CAR IS READY TO EARN</span>
        </div>
        <div style="background:#f9fafb;padding:30px 28px;color:#333333;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 14px;font-size:1.35rem;font-weight:bold;color:#111827;">Get your car out of the driveway and earning 💸</p>
          <p style="margin:0 0 14px;">${greeting}</p>
          <p style="margin:0 0 16px;">Your car could be <strong>making you money</strong> instead of sitting in the driveway! You've already signed up as a RentUFS host — the last step is getting it <strong>listed and rolling</strong>.</p>
          <p style="margin:0 0 8px;font-weight:bold;color:#111827;">A few reasons hosts love it:</p>
          <ul style="margin:0 0 18px;padding-left:20px;">
            <li style="margin-bottom:6px;">🛡️ Every rental is <strong>backed by RentUFS insurance protection</strong></li>
            <li style="margin-bottom:6px;">🛣️ <strong>Tolls are handled automatically</strong> — renters pay their own, and you're reimbursed</li>
            <li style="margin-bottom:6px;">📱 <strong>Manage everything</strong> from your Host Dashboard</li>
          </ul>
          <p style="margin:0 0 6px;">Listing takes just a few minutes — add your car's details and a few photos, and you're open for bookings.</p>
          <p style="text-align:center;margin:24px 0;">
            <a href="${clientUrl}/host/add-vehicle" style="display:inline-block;background:#10b981;color:#ffffff;padding:14px 34px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px;">List Your Car &rarr;</a>
          </p>
          <p style="margin:0;">Questions or need a hand? Just reply to this email, or call/text us at <a href="tel:+13187368837" style="color:#10b981;font-weight:bold;">318-RENT-UFS</a> — we've got you.</p>
          <p style="margin:16px 0 0;">Let's get you rolling,<br>The RentUFS Team</p>
        </div>
        <div style="background:#00FF66;text-align:center;color:#000000;padding:20px;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>
          597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}
        </div>
      </div>
    </div>
  </body></html>`;
}

// Pre-designed "How to Host" video guide — branded email with a clickable video
// thumbnail that opens YouTube. This is the one pre-designed template that also
// has an SMS companion (a short text + the video link), handled in /broadcast.
function hostVideoEmailHtml(firstName, unsubscribeUrl) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#064e3b;text-decoration:underline">Unsubscribe</a>`
    : '';
  const clientUrl = process.env.CLIENT_URL || 'https://app.rentufs.com';
  const videoUrl = 'https://youtu.be/E94Lx7iVxpo';
  const thumb = 'https://img.youtube.com/vi/E94Lx7iVxpo/hqdefault.jpg';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border:3px solid #00FF66;border-radius:8px;overflow:hidden;">
        <div style="background:#000000;padding:26px 20px 10px;text-align:center;">
          <span style="font-size:30px;font-weight:bold;letter-spacing:4px;color:#00FF66;">RENTUFS</span>
        </div>
        <div style="background:#000000;padding:0 20px 22px;text-align:center;">
          <span style="display:inline-block;background:#00FF66;color:#000000;font-weight:bold;font-size:13px;letter-spacing:1px;padding:6px 16px;border-radius:20px;">🎥 WATCH: HOW TO HOST</span>
        </div>
        <div style="background:#f9fafb;padding:30px 28px;color:#333333;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 14px;font-size:1.35rem;font-weight:bold;color:#111827;">See how to start earning in under 3 minutes</p>
          <p style="margin:0 0 14px;">${greeting}</p>
          <p style="margin:0 0 18px;">New to hosting? We put together a quick video that walks you through exactly how to list your car and start earning on RentUFS — <strong>zero commission, 100% yours.</strong></p>
          <a href="${videoUrl}" style="text-decoration:none;display:block;margin:0 0 22px;">
            <div style="position:relative;background:#000;border-radius:10px;overflow:hidden;border:2px solid #00FF66;">
              <img src="${thumb}" alt="How to Host Your Car on RentUFS" width="540" style="display:block;width:100%;height:auto;opacity:0.8;">
              <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:74px;height:74px;background:#00FF66;border-radius:50%;">
                <div style="position:absolute;top:50%;left:54%;transform:translate(-50%,-50%);width:0;height:0;border-top:17px solid transparent;border-bottom:17px solid transparent;border-left:28px solid #000;"></div>
              </div>
            </div>
          </a>
          <p style="margin:0 0 8px;font-weight:bold;color:#111827;">A few reasons hosts love it:</p>
          <ul style="margin:0 0 18px;padding-left:20px;">
            <li style="margin-bottom:6px;">🛡️ Every rental <strong>backed by RentUFS insurance</strong></li>
            <li style="margin-bottom:6px;">🛣️ <strong>Tolls handled automatically</strong> — renters pay their own, and you're reimbursed</li>
            <li style="margin-bottom:6px;">📱 <strong>Manage everything</strong> from your Host Dashboard</li>
          </ul>
          <p style="text-align:center;margin:24px 0;">
            <a href="${videoUrl}" style="display:inline-block;background:#000000;color:#00FF66;border:2px solid #00FF66;padding:13px 30px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;">&#9654; Watch the Video</a>
            <br><br>
            <a href="${clientUrl}/host/add-vehicle" style="display:inline-block;background:#10b981;color:#ffffff;padding:13px 34px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:15px;">List Your Car &rarr;</a>
          </p>
          <p style="margin:0;">Questions or need a hand? Just reply, or call/text us at <a href="tel:+13187368837" style="color:#10b981;font-weight:bold;">318-RENT-UFS</a> — we've got you.</p>
          <p style="margin:16px 0 0;">Let's get you rolling,<br>The RentUFS Team</p>
        </div>
        <div style="background:#00FF66;text-align:center;color:#000000;padding:20px;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>
          597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}
        </div>
      </div>
    </div>
  </body></html>`;
}

// Pre-designed holiday greeting — Fourth of July. Warm, festive (red/white/blue),
// no hard sell; goes to everyone (hosts + drivers).
function julyFourthEmailHtml(firstName, unsubscribeUrl) {
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const unsub = unsubscribeUrl
    ? `<br><a href="${unsubscribeUrl}" style="color:#ffffff;text-decoration:underline;opacity:0.85">Unsubscribe</a>`
    : '';
  const clientUrl = process.env.CLIENT_URL || 'https://app.rentufs.com';
  return `<!DOCTYPE html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"></head>
  <body style="margin:0;padding:0;background:#eef0f2;font-family:Arial,Helvetica,sans-serif;">
    <div style="max-width:600px;margin:0 auto;padding:20px;">
      <div style="border-radius:10px;overflow:hidden;border:1px solid #d1d5db;">
        <div style="background:#000000;padding:22px 20px;text-align:center;">
          <span style="font-size:28px;font-weight:bold;letter-spacing:4px;color:#00FF66;">RENTUFS</span>
        </div>
        <div style="background:#3C3B6E;padding:30px 20px;text-align:center;">
          <div style="font-size:40px;line-height:1;margin-bottom:8px;">🇺🇸 🎆</div>
          <div style="color:#ffffff;font-size:1.7rem;font-weight:bold;">Happy 4th of July!</div>
        </div>
        <div style="height:6px;background:#B22234;"></div>
        <div style="background:#ffffff;padding:30px 28px;color:#333333;font-size:15px;line-height:1.7;">
          <p style="margin:0 0 14px;">${greeting}</p>
          <p style="margin:0 0 14px;">From all of us at <strong>RentUFS</strong>, we're wishing you a happy, safe, and fun Fourth of July! 🎉</p>
          <p style="margin:0 0 14px;">The Fourth is one of the busiest travel weekends of the year — so many of us hitting the road to see family and friends. Wherever the holiday takes you, <strong>RentUFS is here for the journey.</strong> 🚗</p>
          <p style="margin:0 0 20px;">Thank you for being part of the RentUFS community. Have a safe and happy holiday! 🇺🇸</p>
          <p style="text-align:center;margin:4px 0 22px;">
            <a href="${clientUrl}/marketplace" style="display:inline-block;background:#B22234;color:#ffffff;padding:13px 32px;text-decoration:none;border-radius:6px;font-weight:bold;">Find Your Ride &rarr;</a>
          </p>
          <p style="margin:0;">Have a wonderful holiday,<br><strong>The RentUFS Team</strong></p>
        </div>
        <div style="background:#3C3B6E;text-align:center;color:#ffffff;padding:18px;font-size:12px;line-height:1.6;">
          &copy; ${new Date().getFullYear()} RentUFS. All rights reserved.<br>
          597 West Side Ave PMB 194, Jersey City, NJ 07304${unsub}
        </div>
      </div>
    </div>
  </body></html>`;
}

// Preview how many people a target audience would reach on each channel.
router.get('/broadcast/preview', adminAuth, async (req, res) => {
  try {
    // "Text sign-ups" — people who opted in via the keyword flow (text-only).
    if (req.query.audience === 'sms-subscribers') {
      const smsCount = await SmsSubscriber.countDocuments({ optedIn: true });
      return res.json({ total: smsCount, emailCount: 0, smsCount });
    }
    const query = { ...broadcastAudienceQuery(req.query.audience), accountStatus: { $ne: 'deactivated' } };
    const users = await User.find(query).select('email phone smsConsent emailOptOut').lean();
    const emailCount = users.filter(u => u.email && !u.emailOptOut).length;
    const smsCount = users.filter(u => u.phone && u.smsConsent && u.smsConsent.granted).length;
    res.json({ total: users.length, emailCount, smsCount });
  } catch (error) {
    console.error('❌ Broadcast preview error:', error.message);
    res.status(500).json({ message: 'Failed to load preview', error: error.message });
  }
});

// Send a broadcast. channel: 'email' | 'sms' | 'both'; audience: 'hosts' | 'drivers' | 'both'.
router.post('/broadcast', adminAuth, async (req, res) => {
  try {
    const { channel, audience, subject, message, design } = req.body;
    const isHostPitch = design === 'become_host';
    const isListCar = design === 'list_car';
    const isJulyFourth = design === 'july_fourth';
    const isHostVideo = design === 'host_video';
    const isPreDesigned = isHostPitch || isListCar || isJulyFourth || isHostVideo;
    const preDesignedHtml = (fn, unsub) =>
      isJulyFourth ? julyFourthEmailHtml(fn, unsub)
      : isListCar ? listYourCarEmailHtml(fn, unsub)
      : isHostVideo ? hostVideoEmailHtml(fn, unsub)
      : becomeHostEmailHtml(fn, unsub);
    // The "How to Host" video template is the only pre-designed email that also
    // sends by SMS — a short text with the video link.
    const videoSmsBody = (fn) => `Hey ${fn || 'there'}, here's how to start earning on RentUFS in under 3 min (zero commission): https://youtu.be/E94Lx7iVxpo`;
    if (!isPreDesigned && (!message || !message.trim())) {
      return res.status(400).json({ message: 'Message is required.' });
    }
    if (!['email', 'sms', 'both'].includes(channel)) {
      return res.status(400).json({ message: 'Please choose a valid channel.' });
    }

    const doEmail = channel === 'email' || channel === 'both';
    // Pre-designed HTML templates are email-only (SMS can't render HTML) — EXCEPT
    // the "How to Host" video template, which has a plain-text SMS companion.
    const doSms = (channel === 'sms' || channel === 'both') && (!isPreDesigned || isHostVideo);

    const emailSubject = (subject && subject.trim())
      ? subject.trim()
      : (isJulyFourth ? 'Happy 4th of July from RentUFS! 🇺🇸'
        : isListCar ? 'Get your car out of the driveway and earning 🚗💸'
        : isHostVideo ? '🎥 How to host your car on RentUFS (2-min guide)'
        : isHostPitch ? 'List your car on RentUFS — keep 100% of your earnings 🚗'
        : 'A message from RentUFS');

    // Public base URL — used to build unsubscribe links for both prospects
    // (no account) and registered users.
    const proto = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    const base = `${proto}://${host}`;

    // "Specific people" — send only to the exact emails / phone numbers entered
    // (also used to test to yourself). These recipients have no account, so the
    // unsubscribe link is email-based (CAN-SPAM requires every send to have one).
    if (audience === 'specific') {
      const raw = String(req.body.recipients || '');
      const tokens = raw.split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
      const emails = tokens.filter(t => t.includes('@'));
      const phones = tokens.filter(t => !t.includes('@'));
      const r = { audience: tokens.length, emailSent: 0, emailFailed: 0, emailSkipped: 0, smsSent: 0, smsFailed: 0, smsSkipped: 0 };
      if (doEmail) {
        for (const email of emails) {
          const lower = email.toLowerCase();
          // Skip anyone who has already unsubscribed.
          const suppressed = await EmailSuppression.findOne({ email: lower }).lean();
          if (suppressed) { r.emailSkipped++; continue; }
          try {
            const unsubscribeUrl = `${base}/api/users/unsubscribe-email/${Buffer.from(lower).toString('base64url')}`;
            await sendEmail({
              to: email,
              subject: emailSubject,
              html: isPreDesigned
                ? preDesignedHtml('', unsubscribeUrl)
                : broadcastEmailHtml(personalizeBroadcast(message, {}), unsubscribeUrl)
            });
            r.emailSent++;
          } catch (e) { r.emailFailed++; }
        }
      }
      if (doSms) {
        for (const phone of phones) {
          try {
            await sendSMS(phone, isHostVideo ? videoSmsBody('') : personalizeBroadcast(message, {}));
            r.smsSent++;
          } catch (e) { r.smsFailed++; }
        }
      }
      console.log(`📣 Broadcast (specific) by ${req.user.email}:`, r);
      return res.json({ ok: true, results: r });
    }

    // "Text sign-ups" — opted-in keyword subscribers. Text-only audience.
    if (audience === 'sms-subscribers') {
      const subs = await SmsSubscriber.find({ optedIn: true }).select('phone').lean();
      const r = { audience: subs.length, emailSent: 0, emailFailed: 0, emailSkipped: 0, smsSent: 0, smsFailed: 0, smsSkipped: 0 };
      if (doSms) {
        for (const s of subs) {
          if (!s.phone) { r.smsSkipped++; continue; }
          try {
            await sendSMS(s.phone, isHostVideo ? videoSmsBody('') : personalizeBroadcast(message, {}));
            r.smsSent++;
          } catch (e) { r.smsFailed++; }
        }
      }
      console.log(`📣 Broadcast (sms-subscribers) by ${req.user.email}:`, r);
      return res.json({ ok: true, results: r });
    }

    const query = { ...broadcastAudienceQuery(audience), accountStatus: { $ne: 'deactivated' } };
    const users = await User.find(query)
      .select('firstName email phone userType smsConsent emailOptOut')
      .lean();

    const results = {
      audience: users.length,
      emailSent: 0, emailFailed: 0, emailSkipped: 0,
      smsSent: 0, smsFailed: 0, smsSkipped: 0
    };

    for (const u of users) {
      if (doEmail) {
        if (!u.email || u.emailOptOut) {
          results.emailSkipped++;
        } else {
          try {
            const unsubscribeUrl = `${base}/api/users/unsubscribe/${u._id}`;
            await sendEmail({
              to: u.email,
              subject: emailSubject,
              html: isPreDesigned
                ? preDesignedHtml(u.firstName, unsubscribeUrl)
                : broadcastEmailHtml(personalizeBroadcast(message, u), unsubscribeUrl)
            });
            results.emailSent++;
          } catch (e) {
            results.emailFailed++;
          }
        }
      }
      if (doSms) {
        if (!u.phone || !(u.smsConsent && u.smsConsent.granted)) {
          results.smsSkipped++;
        } else {
          try {
            await sendSMS(u.phone, isHostVideo ? videoSmsBody(u.firstName) : personalizeBroadcast(message, u));
            results.smsSent++;
          } catch (e) {
            results.smsFailed++;
          }
        }
      }
    }

    console.log(`📣 Broadcast by ${req.user.email}: channel=${channel} audience=${audience} ->`, results);
    res.json({ ok: true, results });
  } catch (error) {
    console.error('❌ Broadcast error:', error.message);
    res.status(500).json({ message: 'Failed to send broadcast', error: error.message });
  }
});

// Build realistic dummy data so any transactional template can be previewed
// without a real booking. All emails go to the address the admin enters.
function mockEmailData(toEmail) {
  const now = new Date();
  const later = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const vehicle = {
    _id: '000000000000000000000000',
    year: 2023, make: 'BMW', model: '530i', type: 'sedan',
    transmission: 'automatic', seats: 5,
    location: { address: '123 Main St', city: 'Jersey City', state: 'NJ', zipCode: '07304' },
    images: [], pricePerDay: 50
  };
  const driver = {
    _id: '000000000000000000000001', firstName: 'Test', lastName: 'Driver',
    email: toEmail, phone: '3475551234', dateOfBirth: new Date('1990-01-01'),
    driverLicense: { licenseNumber: 'D1234567', state: 'NJ', expirationDate: new Date('2030-01-01') },
    address: { street: '1 Test Rd', city: 'Jersey City', state: 'NJ', zipCode: '07304' }
  };
  const host = {
    _id: '000000000000000000000002', firstName: 'Test', lastName: 'Host',
    email: toEmail, phone: '3475555678'
  };
  const booking = {
    _id: '000000000000000000000003', reservationId: 'RUFS-TEST',
    startDate: now, endDate: later, totalDays: 1, rentalType: 'daily',
    pickupTime: '10:00', dropoffTime: '10:00', totalPrice: 36.18,
    paymentStatus: 'refunded',
    insurance: { type: 'rideshare', price: 25, coverage: 'Ride Share Coverage' },
    platformFee: 1.5, platformFeePerDay: 1.5, driverProcessingFee: 1.2,
    extensions: [{ days: 2, rental: 100 }]
  };
  return { vehicle, driver, host, booking };
}

// Send a test copy of a transactional email template to a chosen address, so
// admins can preview how each one looks. Uses dummy data — no real booking.
router.post('/email-test', adminAuth, async (req, res) => {
  try {
    const to = String(req.body.to || req.user.email || '').trim();
    const template = String(req.body.template || 'cancellation');
    if (!to || !to.includes('@')) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }
    const { vehicle, driver, host, booking } = mockEmailData(to);

    let result;
    switch (template) {
      case 'cancellation':
        result = await sendBookingCancellationEmail(driver, host, booking, vehicle, 'Test cancellation reason');
        break;
      case 'booking_driver':
        result = await sendBookingConfirmationToDriver(driver, booking, vehicle, host);
        break;
      case 'booking_host':
        result = await sendBookingNotificationToHost(host, booking, vehicle, driver);
        break;
      case 'extension':
        result = await sendBookingExtensionEmail(driver, host, booking, vehicle);
        break;
      case 'toll':
        result = await sendTollChargeToDriver(driver, booking, vehicle,
          { amount: 5, exitTime: new Date(), exitLocation: 'NJ Turnpike Exit 14', agency: 'NJTA' },
          { totalTolls: 1, driverTollTotal: 5.5 });
        break;
      case 'charge':
        result = await sendChargeAddedToDriver(driver, host, booking, vehicle,
          { amount: 25, chargeType: 'parking_ticket', description: 'Test parking ticket', proofImage: '', scheduledChargeAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000) });
        break;
      case 'reminder':
        result = await sendReturnReminderEmail(driver, booking, vehicle, host);
        break;
      case 'toll_host':
        result = await sendTollNotificationToHost(host, booking, vehicle, driver,
          { totalTolls: 1, driverTollTotal: 5.5, hostTollTotal: 5 });
        break;
      case 'payment_failed':
        result = await sendChargePaymentFailedToDriver(driver, booking,
          { amount: 25, chargeType: 'parking_ticket' }, 3, 3);
        break;
      case 'welcome':
        result = await sendWelcomeEmail({ email: to, firstName: 'Test', userType: 'host' });
        break;
      case 'vehicle_listed':
        result = await sendVehicleListedEmail({ email: to, firstName: 'Test' }, vehicle);
        break;
      case 'payout':
        result = await sendPayoutNotificationEmail(host,
          { totalAmount: 142.50, bookings: [{ reservationId: 'RUFS-TEST', vehicle: '2023 BMW 530i', amount: 142.50 }] });
        break;
      case 'registration':
        result = await sendRegistrationExpirationReminder(host,
          { ...vehicle, vin: 'WBA13BJ02PCM91747', registrationExpiration: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) });
        break;
      case 'vehicle_paused':
        result = await sendVehiclePausedEmail(host,
          { ...vehicle, registrationExpiration: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) });
        break;
      case 'email_verify':
        result = await sendEmailVerificationCode(to, 'Test', '123456');
        break;
      case 'otp':
        result = await sendRegistrationOtp(to, '123456');
        break;
      case 'password_reset':
        result = await sendPasswordResetEmail({ email: to, firstName: 'Test' }, 'test-reset-token-abc123');
        break;
      case 'become_host':
        result = await sendEmail({
          to,
          subject: 'List your car on RentUFS — keep 100% of your earnings 🚗',
          html: becomeHostEmailHtml('', null)
        });
        break;
      case 'list_car':
        result = await sendEmail({
          to,
          subject: 'Get your car out of the driveway and earning 🚗💸',
          html: listYourCarEmailHtml('', null)
        });
        break;
      case 'host_video':
        result = await sendEmail({
          to,
          subject: '🎥 How to host your car on RentUFS (2-min guide)',
          html: hostVideoEmailHtml('', null)
        });
        break;
      case 'july_fourth':
        result = await sendEmail({
          to,
          subject: 'Happy 4th of July from RentUFS! 🇺🇸',
          html: julyFourthEmailHtml('', null)
        });
        break;
      default:
        return res.status(400).json({ message: 'Unknown template.' });
    }
    console.log(`📧 Test email (${template}) sent to ${to} by ${req.user.email}`);
    res.json({ ok: true, result });
  } catch (error) {
    console.error('❌ Test email error:', error.message);
    res.status(500).json({ message: 'Failed to send test email', error: error.message });
  }
});

// Diagnostic: attempt TeqMobility on-rent coverage with a TEST driver to check
// whether insurance is working — WITHOUT creating a real reservation, booking,
// or charging any customer. Owner (super admin) only.
//
// SAFE & ISOLATED: does not create a Booking, does not touch payments/Stripe,
// tolls, or the live booking flow. It only calls TeqMobility's API directly with
// dummy data and immediately cancels any coverage that starts. The only external
// effect is a coverage attempt on TeqMobility's side (the point of the test).
// NOTE: a *successful* start may incur a charge from TeqMobility.
// List registered vehicles (VIN + state) for the insurance-test picker. Owner only.
router.get('/insurance-test/vehicles', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only the owner can do this.' });
    }
    const vehicles = await Vehicle.find({ vin: { $exists: true, $ne: null } })
      .select('vin year make model location.state')
      .lean();
    res.json(vehicles.map(v => ({
      vin: v.vin,
      label: `${v.year} ${v.make} ${v.model}`,
      state: v.location?.state || '—'
    })));
  } catch (error) {
    res.status(500).json({ message: 'Failed to load vehicles', error: error.message });
  }
});

router.post('/insurance-test', adminAuth, async (req, res) => {
  try {
    if (!isSuperAdmin(req.user)) {
      return res.status(403).json({ message: 'Only the owner can run the insurance test.' });
    }

    // Pick a real registered vehicle (optionally by VIN) and its host.
    const vinFilter = req.body.vin
      ? { vin: String(req.body.vin).trim().toUpperCase() }
      : { vin: { $exists: true, $ne: null } };
    const vehicle = await Vehicle.findOne(vinFilter).populate('host');
    if (!vehicle || !vehicle.vin) {
      return res.status(400).json({ message: 'No registered vehicle with a VIN found to test with.' });
    }
    if (!vehicle.host) {
      return res.status(400).json({ message: 'That vehicle has no host on file.' });
    }

    // Dummy test driver — not a real person, nothing is saved anywhere.
    const driver = {
      firstName: 'Insurance', lastName: 'Test',
      email: 'insurance-test@rentufs.com', phone: '3475550100',
      dateOfBirth: new Date('1990-01-01'),
      driverLicense: { licenseNumber: 'TEST123456', state: 'NJ', expirationDate: new Date('2030-01-01') },
      address: { street: '597 West Side Ave', city: 'Jersey City', state: 'NJ', zipCode: '07304' }
    };
    const booking = { _id: 'insurance-test-' + Date.now(), insurance: { type: 'rideshare' } };

    // Ensure a clean pickup address so the test reaches the actual coverage
    // check (some vehicles have a missing/ZIP+4 zip TeqMobility rejects). This
    // only affects the in-memory copy used for the test — nothing is saved.
    if (!vehicle.location) vehicle.location = {};
    vehicle.location.zipCode = String(vehicle.location.zipCode || '').replace(/\D/g, '').slice(0, 5) || '07304';
    if (!vehicle.location.city) vehicle.location.city = 'Jersey City';
    if (!vehicle.location.state) vehicle.location.state = 'NJ';
    if (!vehicle.location.address) vehicle.location.address = '597 West Side Ave';

    const result = await startRentalCoverage(vehicle.host, driver, vehicle, booking);

    // If coverage actually started, cancel it immediately to minimize any charge.
    let cancelled = false;
    if (result.success) {
      try {
        await stopRentalCoverage({ coverageId: result.coverageId, vin: vehicle.vin });
        cancelled = true;
      } catch (e) { /* best-effort cancel */ }
    }

    console.log(`🧪 Insurance test by ${req.user.email}: success=${result.success} vin=${vehicle.vin} cancelled=${cancelled}`);
    res.json({
      ok: true,
      started: !!result.success,
      cancelled,
      cardUrl: result.cardUrl || null,
      coverageId: result.coverageId || null,
      error: result.success ? null : (result.error || result.reason || 'Coverage did not start'),
      vehicle: `${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      vin: vehicle.vin
    });
  } catch (error) {
    console.error('❌ Insurance test error:', error.message);
    res.status(500).json({ message: 'Insurance test failed', error: error.message });
  }
});

// Saved templates (admin convenience).
router.get('/broadcast/templates', adminAuth, async (req, res) => {
  try {
    const templates = await BroadcastTemplate.find().sort({ createdAt: -1 }).lean();
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load templates', error: error.message });
  }
});

router.post('/broadcast/templates', adminAuth, async (req, res) => {
  try {
    const { name, channel, subject, message } = req.body;
    if (!name || !name.trim() || !message || !message.trim()) {
      return res.status(400).json({ message: 'Template name and message are required.' });
    }
    const tpl = await BroadcastTemplate.create({
      name: name.trim(),
      channel: ['email', 'sms', 'both'].includes(channel) ? channel : 'both',
      subject: subject || '',
      message,
      createdBy: req.user._id
    });
    res.json(tpl);
  } catch (error) {
    res.status(500).json({ message: 'Failed to save template', error: error.message });
  }
});

router.delete('/broadcast/templates/:id', adminAuth, async (req, res) => {
  try {
    await BroadcastTemplate.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete template', error: error.message });
  }
});

module.exports = router;
