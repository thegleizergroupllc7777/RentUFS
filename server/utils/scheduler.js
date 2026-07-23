const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const { sendEmail, sendReturnReminderEmail, sendOverdueReminderEmail, sendRegistrationExpirationReminder, sendVehiclePausedEmail, sendPayoutNotificationEmail, sendPayoutFailureAlert, sendPayoutRunSummaryEmail } = require('./emailService');
const { HOLIDAY_TEMPLATES, holidayEmailHtml, holidayForDate } = require('./holidayEmails');
const { sendOverdueReminderSMS, sendReturnReminderSMS } = require('./smsService');
const { isConfigured: tollspotConfigured, preRegisterVehicle, listVehicles } = require('./tollspot');
const { getOutstandingTolls, chargeDriverForTolls, transferTollsToHost, recordTollSettlement } = require('./tollSettlement');
const { checkAndSettleScheduledCharges } = require('./chargeSettlement');
const { processLateReturns } = require('./lateFees');
const { isBookingEligible, isChargingEnabled } = require('./lateReturn');
const { returnMomentForBooking } = require('./vehicleTimezone');

// Check for bookings ending soon and send reminder emails (1 hour before return)
const checkAndSendReturnReminders = async () => {
  try {
    const now = new Date();

    // Only the late-fee system's 2h/1h/30m warnings should REPLACE this reminder,
    // and those only fire when charging is actually ON. While charging is OFF
    // (default), the late-fee system sends nothing — so this reminder must cover
    // EVERY active booking, new or old, or newer bookings would get no warning.
    const chargingOn = await isChargingEnabled();

    // Find active bookings that haven't had a reminder sent yet
    const activeBookings = await Booking.find({
      status: 'active',
      returnReminderSent: { $ne: true }
    })
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');

    let remindersSent = 0;

    for (const booking of activeBookings) {
      // Skip ONLY when charging is ON and this booking is late-fee-eligible —
      // then the late-fee system's 2h/1h/30m warnings handle it and we'd double up.
      // With charging OFF, nothing is skipped: every booking gets this reminder.
      if (chargingOn && isBookingEligible(booking)) continue;

      // The real return moment, resolved in the VEHICLE's local timezone — so a
      // Pacific drop-off isn't read on the server clock and fired hours early.
      const endDate = returnMomentForBooking(booking);

      // Calculate time until end (in milliseconds)
      const timeUntilEnd = endDate.getTime() - now.getTime();
      const hoursUntilEnd = timeUntilEnd / (1000 * 60 * 60);

      // Send email reminder if booking ends within 30 minutes to 90 minutes (approximately 1 hour window)
      // This window ensures we catch bookings even if the scheduler runs every 10-15 minutes
      if (hoursUntilEnd > 0.5 && hoursUntilEnd <= 1.5) {
        console.log(`⏰ Sending return reminder for booking ${booking.reservationId} (ends in ${hoursUntilEnd.toFixed(1)} hours)`);

        // Email the renter…
        const emailResult = await sendReturnReminderEmail(
          booking.driver,
          booking,
          booking.vehicle,
          booking.host
        );

        // …and text them too — people out driving check texts, not email.
        let smsResult = { success: false };
        if (booking.driver?.phone) {
          smsResult = await sendReturnReminderSMS(booking.driver, booking, booking.vehicle, booking.host)
            .catch(err => { console.error(`📱 Return reminder SMS error for ${booking.reservationId}:`, err.message); return { success: false }; });
        }

        // Mark sent if EITHER channel went out, so we never re-blast the one that
        // did succeed just because the other failed.
        if (emailResult.success || smsResult.success) {
          booking.returnReminderSent = true;
          booking.returnReminderSentAt = new Date();
          await booking.save();
          remindersSent++;
          console.log(`✅ Return reminder sent for booking ${booking.reservationId} (email: ${emailResult.success ? 'ok' : 'fail'}, sms: ${smsResult.success ? 'ok' : (booking.driver?.phone ? 'fail' : 'no phone')})`);
        } else {
          console.error(`❌ Failed to send return reminder for booking ${booking.reservationId}`);
        }
      }
    }

    if (remindersSent > 0) {
      console.log(`📧 Sent ${remindersSent} return reminder email(s)`);
    }

    return { success: true, remindersSent };
  } catch (error) {
    console.error('❌ Error in return reminder scheduler:', error);
    return { success: false, error: error.message };
  }
};

// Check for overdue bookings and send urgent SMS about insurance coverage
const checkAndSendOverdueSMS = async () => {
  try {
    const now = new Date();

    // Find active bookings that are potentially overdue and haven't had an overdue SMS sent
    const activeBookings = await Booking.find({
      status: 'active',
      smsReturnReminderSent: { $ne: true }
    })
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');

    let smsSent = 0;

    for (const booking of activeBookings) {
      // The real return moment, resolved in the VEHICLE's local timezone — so a
      // Pacific drop-off isn't read on the server clock and fired hours early.
      const endDate = returnMomentForBooking(booking);

      // Check if booking is overdue (past return time)
      if (now > endDate) {
        // Calculate how overdue
        const diffMs = now - endDate;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        const overdueInfo = diffDays >= 1
          ? `${diffDays} day${diffDays > 1 ? 's' : ''}`
          : `${Math.max(1, diffHours)} hour${diffHours !== 1 ? 's' : ''}`;

        console.log(`🚨 Sending overdue reminder for booking ${booking.reservationId} (${overdueInfo} overdue)`);

        // Email the renter (works even with no phone on file)…
        let emailOk = false;
        try {
          const emailResult = await sendOverdueReminderEmail(
            booking.driver,
            booking,
            booking.vehicle,
            overdueInfo,
            booking.host
          );
          emailOk = !!emailResult?.success;
        } catch (e) {
          console.error(`📧 Overdue email error for ${booking.reservationId}:`, e.message);
        }

        // …and text them (only if we have a phone number).
        let smsOk = false;
        if (booking.driver?.phone) {
          const smsResult = await sendOverdueReminderSMS(
            booking.driver,
            booking,
            booking.vehicle,
            overdueInfo
          );
          smsOk = !!smsResult?.success;
          if (smsOk) console.log(`📱 Overdue SMS sent for booking ${booking.reservationId}`);
          else console.error(`📱 Failed to send overdue SMS for booking ${booking.reservationId}: ${smsResult.error}`);
        }

        // Mark sent if EITHER channel went out, so we don't re-blast every 10 min.
        if (emailOk || smsOk) {
          booking.smsReturnReminderSent = true;
          await booking.save();
          smsSent++;
          console.log(`✅ Overdue reminder sent for booking ${booking.reservationId} (email: ${emailOk ? 'ok' : 'fail'}, sms: ${smsOk ? 'ok' : (booking.driver?.phone ? 'fail' : 'no phone')})`);
        }
      }
    }

    if (smsSent > 0) {
      console.log(`📱 Sent ${smsSent} overdue SMS reminder(s)`);
    }

    return { success: true, smsSent };
  } catch (error) {
    console.error('❌ Error in overdue SMS scheduler:', error);
    return { success: false, error: error.message };
  }
};

// Check for vehicles with registration expiring within 30 days and send reminder emails
const checkRegistrationExpirations = async () => {
  try {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    // Find vehicles where registration expires within 30 days and reminder not yet sent
    const expiringVehicles = await Vehicle.find({
      registrationExpiration: { $lte: thirtyDaysFromNow, $gte: now },
      registrationReminderSent: { $ne: true }
    }).populate('host', 'firstName lastName email');

    let remindersSent = 0;

    for (const vehicle of expiringVehicles) {
      if (!vehicle.host || !vehicle.host.email) continue;

      console.log(`📋 Sending registration expiration reminder for ${vehicle.year} ${vehicle.make} ${vehicle.model} (expires ${vehicle.registrationExpiration.toISOString().substring(0, 10)})`);

      const result = await sendRegistrationExpirationReminder(
        vehicle.host,
        vehicle
      );

      if (result.success) {
        vehicle.registrationReminderSent = true;
        await vehicle.save();
        remindersSent++;
        console.log(`✅ Registration expiration reminder sent for vehicle ${vehicle._id}`);
      } else {
        console.error(`❌ Failed to send registration expiration reminder for vehicle ${vehicle._id}`);
      }
    }

    if (remindersSent > 0) {
      console.log(`📧 Sent ${remindersSent} registration expiration reminder(s)`);
    }

    return { success: true, remindersSent };
  } catch (error) {
    console.error('❌ Error in registration expiration scheduler:', error);
    return { success: false, error: error.message };
  }
};

// Auto-pause vehicles whose registration has FULLY expired (the date has passed)
// and the host hasn't updated it. Only pauses currently-available vehicles, and
// flags them so we can auto-relist when the host updates the registration.
//
// SAFE: this only flips `availability` to false (same as the host clicking
// "Mark Unavailable") — it removes the car from NEW bookings only. It does NOT
// touch existing/active rentals, payments, insurance, or any other flow.
const pauseExpiredRegistrations = async () => {
  try {
    const now = new Date();

    const expiredVehicles = await Vehicle.find({
      registrationExpiration: { $lt: now },     // already past
      availability: true,                        // only pause live listings
      registrationExpiredDeactivated: { $ne: true }
    }).populate('host', 'firstName lastName email');

    let pausedCount = 0;

    for (const vehicle of expiredVehicles) {
      vehicle.availability = false;
      vehicle.registrationExpiredDeactivated = true;
      await vehicle.save();
      pausedCount++;
      console.log(`⏸️  Paused ${vehicle.year} ${vehicle.make} ${vehicle.model} — registration expired ${vehicle.registrationExpiration.toISOString().substring(0, 10)}`);

      if (vehicle.host && vehicle.host.email) {
        sendVehiclePausedEmail(vehicle.host, vehicle)
          .catch(err => console.error('📧 Vehicle paused email error:', err.message));
      }
    }

    if (pausedCount > 0) {
      console.log(`⏸️  Auto-paused ${pausedCount} vehicle(s) with expired registration`);
    }
    return { success: true, pausedCount };
  } catch (error) {
    console.error('❌ Error in pauseExpiredRegistrations:', error);
    return { success: false, error: error.message };
  }
};

// Check completed bookings (within 60 days) for new unsettled toll charges and auto-charge driver
const checkAndSettlePostTripTolls = async () => {
  try {
    if (!tollspotConfigured()) return { success: true, settled: 0 };

    const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);

    // Find completed bookings with toll monitoring that might have unsettled tolls
    const completedBookings = await Booking.find({
      status: 'completed',
      paymentStatus: 'paid',
      'tollspot.monitorStarted': true,
      endDate: { $gte: sixtyDaysAgo }
    })
      .populate('vehicle', 'licensePlate location')
      .populate('host', 'firstName lastName email stripeConnectAccountId stripeConnectPayoutsEnabled');

    let settled = 0;

    for (const booking of completedBookings) {
      try {
        const tollInfo = await getOutstandingTolls(booking, booking.vehicle);
        if (tollInfo.count === 0) continue;

        // Load driver with payment methods
        const driver = await User.findById(booking.driver);
        if (!driver) continue;

        console.log(`🛣️ Post-trip: ${tollInfo.count} new toll(s) ($${tollInfo.driverTotal}) for completed booking ${booking.reservationId || booking._id}`);

        const chargeResult = await chargeDriverForTolls(booking, driver, tollInfo, 'post_trip');
        if (chargeResult.success) {
          await recordTollSettlement(Booking, booking._id, tollInfo, 'post_trip', chargeResult.paymentIntentId, null);

          // Transfer toll reimbursement to host
          if (tollInfo.originalAmount > 0 && booking.host?.stripeConnectAccountId) {
            await transferTollsToHost(booking, booking.host, tollInfo);
          }

          settled++;
          console.log(`🛣️ Post-trip: Settled ${tollInfo.count} toll(s) for booking ${booking.reservationId || booking._id}`);
        } else {
          console.error(`🛣️ Post-trip: Failed to charge driver for booking ${booking.reservationId || booking._id}: ${chargeResult.error}`);
        }
      } catch (bookingErr) {
        console.error(`🛣️ Post-trip: Error processing booking ${booking._id}:`, bookingErr.message);
      }
    }

    if (settled > 0) {
      console.log(`🛣️ Post-trip toll settlement: Settled tolls on ${settled} booking(s)`);
    }

    return { success: true, settled };
  } catch (error) {
    console.error('🛣️ Error in post-trip toll settlement scheduler:', error);
    return { success: false, error: error.message };
  }
};

// Sync TollSpot vehicle statuses: retry pre_registered vehicles without a vehicleId,
// and promote pre_registered vehicles that have a vehicleId to registered
const syncTollspotStatuses = async () => {
  try {
    if (!tollspotConfigured()) return { success: true, synced: 0 };

    // Find all vehicles stuck in pre_registered
    const pendingVehicles = await Vehicle.find({
      'tollspot.status': 'pre_registered'
    }).populate('host', '_id');

    if (pendingVehicles.length === 0) return { success: true, synced: 0 };

    let synced = 0;
    let apiUnreachable = false;

    // Process vehicles sequentially to avoid spamming the TollSpot API
    for (const vehicle of pendingVehicles) {
      if (vehicle.tollspot?.vehicleId) {
        await Vehicle.findByIdAndUpdate(vehicle._id, { 'tollspot.status': 'registered' });
        console.log(`🛣️ TollSpot sync: Vehicle ${vehicle._id} promoted to registered (ID: ${vehicle.tollspot.vehicleId})`);
        synced++;
        continue;
      }

      // If the API already timed out, skip remaining vehicles
      if (apiUnreachable) continue;

      if (vehicle.licensePlate && vehicle.location?.state && vehicle.host) {
        const result = await preRegisterVehicle(vehicle, vehicle.host._id.toString(), { timeout: 8000 });
        if (result.success) {
          const tsId = result.vehicleId;
          // TollSpot accepted the vehicle — mark as registered
          await Vehicle.findByIdAndUpdate(vehicle._id, {
            'tollspot.vehicleId': tsId || null,
            'tollspot.status': 'registered'
          });
          console.log(`🛣️ TollSpot sync: Vehicle ${vehicle._id} retried → registered (ID: ${tsId || 'none'})`);
          synced++;
        } else {
          console.error(`🛣️ TollSpot sync: Vehicle ${vehicle._id} retry failed: ${result.error}`);
          if (result.isTimeout) {
            apiUnreachable = true;
            console.error('🛣️ TollSpot sync: API unreachable (timeout), skipping remaining vehicles');
          }
        }
      }
    }

    if (synced > 0) {
      console.log(`🛣️ TollSpot sync: Updated ${synced} vehicle(s) to registered`);
    }

    return { success: true, synced };
  } catch (error) {
    console.error('🛣️ Error in TollSpot status sync scheduler:', error);
    return { success: false, error: error.message };
  }
};

// Segment-based earning calculations for bookings with mixed rental types
const { getBookingSegments, getTotalSegmentEarnings, calculateEarningsForDayRange } = require('./earningSegments');
const SystemState = require('../models/SystemState');

// ── Payout schedule configuration ──
const PAYOUT_DOW = 1;          // Day of week for payouts: 0=Sun, 1=Mon, 2=Tue, 3=Wed
const PAYOUT_HOUR_UTC = 16;    // 16:00 UTC = 12:00 PM ET (EDT). Drifts to 11 AM in winter (EST).

// The most recent payout target (scheduled day at 12 PM ET) at or before `now`.
const mostRecentPayoutTarget = (now) => {
  const t = new Date(now);
  t.setUTCHours(PAYOUT_HOUR_UTC, 0, 0, 0);
  const diff = (t.getUTCDay() - PAYOUT_DOW + 7) % 7; // days since the payout weekday
  t.setUTCDate(t.getUTCDate() - diff);
  if (t.getTime() > now.getTime()) t.setUTCDate(t.getUTCDate() - 7); // not yet reached today → last week
  return t;
};

// Persisted "last payout run" marker so restarts/redeploys can never skip a payout.
const getLastPayoutRun = async () => {
  const doc = await SystemState.findOne({ key: 'lastPayoutRun' });
  return doc && doc.value ? new Date(doc.value) : null;
};
const setLastPayoutRun = async (date) => {
  await SystemState.findOneAndUpdate(
    { key: 'lastPayoutRun' },
    { value: date.toISOString(), updatedAt: new Date() },
    { upsert: true }
  );
};

// ── One-time automatic migration: flip EXISTING hosts to DAILY bank deposits ──
// New hosts already default to daily (see routes/connect.js). This brings every
// host who signed up BEFORE that change onto the same fast schedule, so their
// money reaches their real bank ~1-2 business days after the weekly RentUFS
// payout — instead of waiting an extra weekly bank-payout window.
//
// SAFETY:
//   • Runs ONCE, ever. A SystemState flag ('hostPayoutsDailyMigrated') records
//     completion, so redeploys/restarts never repeat it.
//   • Only the payout *schedule* is changed. No money moves here.
//   • The Monday RentUFS payout run (RentUFS → host Stripe wallet) is untouched.
//   • Each host is isolated in try/catch — one bad account never stops the rest,
//     and nothing here can crash server startup.
const migrateHostPayoutsToDaily = async () => {
  try {
    const FLAG = 'hostPayoutsDailyMigrated';
    const done = await SystemState.findOne({ key: FLAG });
    if (done && done.value) {
      return; // already completed — never run again
    }

    const hosts = await User.find({ stripeConnectAccountId: { $ne: null } })
      .select('_id email stripeConnectAccountId');
    console.log(`🏦 Daily-payout migration starting for ${hosts.length} existing host account(s)...`);

    let updated = 0;
    let skipped = 0;
    for (const host of hosts) {
      try {
        await stripe.accounts.update(host.stripeConnectAccountId, {
          settings: { payouts: { schedule: { interval: 'daily' } } }
        });
        updated++;
        console.log(`🏦   ✅ ${host.email || host._id} → daily bank deposits`);
      } catch (err) {
        skipped++;
        console.error(`🏦   ⚠️  ${host.email || host._id} skipped: ${err.message}`);
      }
    }

    // Mark complete even if a few accounts were skipped (e.g. restricted/incomplete
    // Stripe accounts), so we don't re-loop every deploy. Any skipped account will
    // still pick up the daily default the next time its Stripe settings change.
    await SystemState.findOneAndUpdate(
      { key: FLAG },
      { value: new Date().toISOString(), updatedAt: new Date() },
      { upsert: true }
    );
    console.log(`🏦 Daily-payout migration complete — ${updated} updated, ${skipped} skipped. Flag set; will not run again.`);
  } catch (err) {
    // Never let this crash startup. If the whole run fails (e.g. DB hiccup) the
    // flag is NOT set, so it simply tries again on the next deploy.
    console.error('🏦 Daily-payout migration failed (will retry next deploy):', err.message);
  }
};

// Automated weekly payout: transfer host earnings for both completed and active bookings.
// Pass { hostId } to pay a single host (used by the admin "Pay host now" button); the
// double-pay protection (per-booking payoutStatus tracking) is identical either way.
const processWeeklyPayouts = async (options = {}) => {
  const { hostId = null } = options;
  try {
    // Find all hosts with Stripe Connect accounts and payouts enabled
    const hostQuery = {
      stripeConnectAccountId: { $exists: true, $ne: null },
      stripeConnectPayoutsEnabled: true,
      userType: { $in: ['host', 'both'] }
    };
    if (hostId) hostQuery._id = hostId; // single-host payout
    const hosts = await User.find(hostQuery);

    if (hosts.length === 0) {
      console.log('💰 Weekly payouts: No eligible hosts found');
      return { success: true, hostsProcessed: 0 };
    }

    let hostsProcessed = 0;
    let totalTransferred = 0;
    const failures = []; // For end-of-run summary email
    const now = new Date();

    for (const host of hosts) {
      let hostPayoutAmount = 0;
      const payoutBookings = []; // For email breakdown
      try {

        // ── 1. Completed bookings: pay remaining balance ──
        const completedBookings = await Booking.find({
          host: host._id,
          status: 'completed',
          paymentStatus: 'paid',
          payoutStatus: { $in: ['pending', 'eligible', 'partial'] }
        }).populate('vehicle', 'make model year');

        for (const b of completedBookings) {
          const totalEarnings = getTotalSegmentEarnings(b);
          const alreadyPaid = b.partialPayoutTotal || 0;
          const remaining = Math.max(0, totalEarnings - alreadyPaid);

          if (remaining <= 0) {
            // Zero or negative earnings — mark as paid so they move to History
            await Booking.findByIdAndUpdate(b._id, {
              payoutStatus: 'paid',
              payoutAmount: 0,
              payoutDate: now,
              partialPayoutDaysPaid: b.totalDays,
              partialPayoutTotal: alreadyPaid
            });
            console.log(`✅ Auto-completed $0 payout for booking ${b.reservationId || b._id}`);
            continue;
          }

          hostPayoutAmount += remaining;
          payoutBookings.push({
            booking: b,
            amount: remaining,
            type: 'completed',
            daysPaid: b.totalDays - (b.partialPayoutDaysPaid || 0)
          });
        }

        // ── 2. Active bookings: pay for days served since last partial payout ──
        const activeBookings = await Booking.find({
          host: host._id,
          status: 'active',
          paymentStatus: 'paid'
        }).populate('vehicle', 'make model year');

        for (const b of activeBookings) {
          const startDate = new Date(b.startDate);
          const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
          const daysAlreadyPaid = b.partialPayoutDaysPaid || 0;
          const newDaysToPayFor = Math.max(0, daysSinceStart - daysAlreadyPaid);

          if (newDaysToPayFor <= 0) continue;

          // Use segment-based calculation for accurate earnings with mixed rental types
          const segments = getBookingSegments(b);
          const { earnings: partialAmount } = calculateEarningsForDayRange(segments, daysAlreadyPaid + 1, daysSinceStart);

          if (partialAmount <= 0) continue;

          hostPayoutAmount += partialAmount;
          payoutBookings.push({
            booking: b,
            amount: partialAmount,
            type: 'active',
            daysPaid: newDaysToPayFor
          });
        }

        if (hostPayoutAmount <= 0 || payoutBookings.length === 0) continue;

        hostPayoutAmount = parseFloat(hostPayoutAmount.toFixed(2));

        // Deduct any outstanding host cancellation penalty from payout
        let penaltyDeducted = 0;
        if (host.cancellationPenaltyBalance > 0) {
          penaltyDeducted = Math.min(host.cancellationPenaltyBalance, hostPayoutAmount);
          hostPayoutAmount = parseFloat((hostPayoutAmount - penaltyDeducted).toFixed(2));
          await User.findByIdAndUpdate(host._id, {
            $inc: { cancellationPenaltyBalance: -penaltyDeducted }
          });
          console.log(`💰 Deducted $${penaltyDeducted.toFixed(2)} cancellation penalty from host ${host.firstName} ${host.lastName}'s payout`);
        }

        // Deduct any outstanding late-return debt (insurance overage the renter's
        // card couldn't cover) from the remaining payout. Same pattern as the
        // cancellation penalty above, but a SEPARATE balance so the two never mix.
        let lateDebtDeducted = 0;
        if (host.lateReturnDebtBalance > 0 && hostPayoutAmount > 0) {
          lateDebtDeducted = Math.min(host.lateReturnDebtBalance, hostPayoutAmount);
          hostPayoutAmount = parseFloat((hostPayoutAmount - lateDebtDeducted).toFixed(2));
          await User.findByIdAndUpdate(host._id, {
            $inc: { lateReturnDebtBalance: -lateDebtDeducted }
          });
          console.log(`💰 Deducted $${lateDebtDeducted.toFixed(2)} late-return debt from host ${host.firstName} ${host.lastName}'s payout`);
        }

        if (hostPayoutAmount <= 0) {
          // Entire payout consumed by penalty — mark bookings as paid with $0 transfer
          for (const p of payoutBookings) {
            const b = p.booking;
            if (p.type === 'completed') {
              await Booking.findByIdAndUpdate(b._id, {
                payoutStatus: 'paid',
                payoutDate: now,
                payoutAmount: 0,
                partialPayoutDaysPaid: b.totalDays,
                partialPayoutTotal: (b.partialPayoutTotal || 0),
                lastPartialPayoutDate: now
              });
            } else {
              const newDaysPaid = (b.partialPayoutDaysPaid || 0) + p.daysPaid;
              await Booking.findByIdAndUpdate(b._id, {
                payoutStatus: 'partial',
                payoutDate: now,
                payoutAmount: (b.partialPayoutTotal || 0),
                partialPayoutDaysPaid: newDaysPaid,
                partialPayoutTotal: (b.partialPayoutTotal || 0),
                lastPartialPayoutDate: now
              });
            }
          }
          console.log(`⚠️ Host ${host.firstName} ${host.lastName}'s entire payout was consumed by cancellation penalty`);
          hostsProcessed++;
          continue;
        }

        // Create Stripe transfer to host's Connect account
        const transfer = await stripe.transfers.create({
          amount: Math.round(hostPayoutAmount * 100),
          currency: 'usd',
          destination: host.stripeConnectAccountId,
          description: `Weekly payout for ${payoutBookings.length} booking(s)`,
          metadata: {
            hostId: host._id.toString(),
            bookingCount: payoutBookings.length.toString(),
            bookingIds: payoutBookings.map(p => p.booking._id.toString()).join(',')
          }
        });

        // Update each booking's payout tracking
        for (const p of payoutBookings) {
          const b = p.booking;

          if (p.type === 'completed') {
            // Completed: mark fully paid
            await Booking.findByIdAndUpdate(b._id, {
              payoutStatus: 'paid',
              payoutId: transfer.id,
              payoutDate: now,
              payoutAmount: (b.partialPayoutTotal || 0) + p.amount,
              partialPayoutDaysPaid: b.totalDays,
              partialPayoutTotal: (b.partialPayoutTotal || 0) + p.amount,
              lastPartialPayoutDate: now
            });
          } else {
            // Active: update partial payout tracking
            const newDaysPaid = (b.partialPayoutDaysPaid || 0) + p.daysPaid;
            const newPartialTotal = (b.partialPayoutTotal || 0) + p.amount;
            await Booking.findByIdAndUpdate(b._id, {
              payoutStatus: 'partial',
              payoutId: transfer.id,
              payoutDate: now,
              payoutAmount: newPartialTotal,
              partialPayoutDaysPaid: newDaysPaid,
              partialPayoutTotal: newPartialTotal,
              lastPartialPayoutDate: now
            });
          }
        }

        hostsProcessed++;
        totalTransferred += hostPayoutAmount;

        const completedCount = payoutBookings.filter(p => p.type === 'completed').length;
        const activeCount = payoutBookings.filter(p => p.type === 'active').length;
        console.log(`💰 Weekly payout: Transferred $${hostPayoutAmount.toFixed(2)} to host ${host.firstName} ${host.lastName} (${completedCount} completed, ${activeCount} active)`);

        // Send payout notification email
        sendPayoutNotificationEmail(host, {
          totalAmount: hostPayoutAmount,
          bookingCount: payoutBookings.length,
          transferId: transfer.id,
          bookings: payoutBookings.map(p => {
            const v = p.booking.vehicle;
            const label = p.type === 'active'
              ? `${p.daysPaid} day(s) served`
              : 'Final payout';
            return {
              reservationId: p.booking.reservationId,
              vehicle: v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle',
              amount: p.amount,
              note: label
            };
          })
        }).catch(err => console.error(`📧 Weekly payout email failed for host ${host._id}:`, err.message));

      } catch (hostErr) {
        console.error(`💰 Weekly payout error for host ${host._id}:`, hostErr.message);

        failures.push({
          hostId: host._id.toString(),
          hostName: `${host.firstName || ''} ${host.lastName || ''}`.trim() || 'Unknown',
          attemptedAmount: hostPayoutAmount,
          bookingCount: payoutBookings.length,
          errorMessage: hostErr.message
        });

        sendPayoutFailureAlert({
          host,
          attemptedAmount: hostPayoutAmount,
          errorMessage: hostErr.message,
          bookings: payoutBookings.map(p => ({
            reservationId: p.booking.reservationId,
            bookingId: p.booking._id.toString(),
            type: p.type,
            amount: p.amount
          }))
        }).catch(err => console.error(`📧 Payout failure alert failed for host ${host._id}:`, err.message));
      }
    }

    if (hostsProcessed > 0) {
      console.log(`💰 Weekly payouts complete: ${hostsProcessed} host(s), $${totalTransferred.toFixed(2)} total`);
    }

    if (failures.length > 0) {
      console.log(`⚠️ Weekly payouts: ${failures.length} host(s) failed`);
      sendPayoutRunSummaryEmail({
        totalHosts: hosts.length,
        hostsSucceeded: hostsProcessed,
        hostsFailed: failures.length,
        totalTransferred,
        failures
      }).catch(err => console.error('📧 Payout run summary email failed:', err.message));
    }

    return { success: true, hostsProcessed, totalTransferred, hostsFailed: failures.length };
  } catch (error) {
    console.error('💰 Error in weekly payout scheduler:', error);
    return { success: false, error: error.message };
  }
};

// Read-only preview of what a single host is currently owed. Uses the SAME
// completed-remaining + active-days-served + penalty math as processWeeklyPayouts,
// but performs NO Stripe transfer and NO database writes. Powers the admin
// "Pay host now" preview so the amount shown equals the amount that would be paid.
const previewHostPayout = async (hostId) => {
  const host = await User.findById(hostId);
  if (!host) return { error: 'Host not found' };

  const now = new Date();
  const lineItems = [];
  let gross = 0;

  // ── Completed bookings: remaining balance ──
  const completedBookings = await Booking.find({
    host: host._id,
    status: 'completed',
    paymentStatus: 'paid',
    payoutStatus: { $in: ['pending', 'eligible', 'partial'] }
  }).populate('vehicle', 'make model year');

  for (const b of completedBookings) {
    const totalEarnings = getTotalSegmentEarnings(b);
    const alreadyPaid = b.partialPayoutTotal || 0;
    const remaining = Math.max(0, totalEarnings - alreadyPaid);
    if (remaining <= 0) continue;
    gross += remaining;
    const v = b.vehicle;
    lineItems.push({
      reservationId: b.reservationId,
      vehicle: v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle',
      type: 'completed',
      amount: parseFloat(remaining.toFixed(2)),
      note: 'Final payout'
    });
  }

  // ── Active bookings: days served since last partial payout ──
  const activeBookings = await Booking.find({
    host: host._id,
    status: 'active',
    paymentStatus: 'paid'
  }).populate('vehicle', 'make model year');

  for (const b of activeBookings) {
    const startDate = new Date(b.startDate);
    const daysSinceStart = Math.floor((now - startDate) / (1000 * 60 * 60 * 24));
    const daysAlreadyPaid = b.partialPayoutDaysPaid || 0;
    const newDaysToPayFor = Math.max(0, daysSinceStart - daysAlreadyPaid);
    if (newDaysToPayFor <= 0) continue;
    const segments = getBookingSegments(b);
    const { earnings: partialAmount } = calculateEarningsForDayRange(segments, daysAlreadyPaid + 1, daysSinceStart);
    if (partialAmount <= 0) continue;
    gross += partialAmount;
    const v = b.vehicle;
    lineItems.push({
      reservationId: b.reservationId,
      vehicle: v ? `${v.year} ${v.make} ${v.model}` : 'Vehicle',
      type: 'active',
      amount: parseFloat(partialAmount.toFixed(2)),
      note: `${newDaysToPayFor} day(s) served`
    });
  }

  let penaltyDeducted = 0;
  let net = gross;
  if (host.cancellationPenaltyBalance > 0 && gross > 0) {
    penaltyDeducted = Math.min(host.cancellationPenaltyBalance, gross);
    net = parseFloat((gross - penaltyDeducted).toFixed(2));
  }

  // Mirror the live payout: also subtract any uncollected late-return debt.
  let lateDebtDeducted = 0;
  if (host.lateReturnDebtBalance > 0 && net > 0) {
    lateDebtDeducted = Math.min(host.lateReturnDebtBalance, net);
    net = parseFloat((net - lateDebtDeducted).toFixed(2));
  }

  return {
    hostId: host._id,
    hostName: `${host.firstName || ''} ${host.lastName || ''}`.trim(),
    hasConnectAccount: !!host.stripeConnectAccountId,
    payoutsEnabled: !!host.stripeConnectPayoutsEnabled,
    lineItems,
    gross: parseFloat(gross.toFixed(2)),
    penaltyDeducted: parseFloat(penaltyDeducted.toFixed(2)),
    lateDebtDeducted: parseFloat(lateDebtDeducted.toFixed(2)),
    net
  };
};

// ── Holiday auto-send ─────────────────────────────────────────────────────
// Automatically emails the branded holiday template to every active host AND
// driver on the correct day each year (Happy Holidays Dec 23, Thanksgiving,
// New Year's, Memorial Day, Labor Day). Weekday-based holidays are computed
// each year (holidayForDate) so the date self-adjusts — no yearly maintenance.
//
// SAFETY — ON by default (the owner enabled auto-send), but fully controllable
// and it can never blast or double-send:
//   • Master switch: SystemState key 'holidayAutoSend'. Only an explicit 'off'
//     pauses it — the owner can flip it from the Broadcast switch anytime, no
//     redeploy. While 'off', this is a pure no-op — nothing is queried or sent.
//   • Only fires inside the 9 AM ET hour, and only on an actual holiday.
//   • Once-per-year guard: a SystemState marker ('holidaySent:<key>:<year>') is
//     CLAIMED before sending, so redeploys/restarts can never double-send.
//   • Respects emailOptOut and skips deactivated accounts, exactly like the
//     manual Broadcast tool. Each send is isolated in try/catch.
const HOLIDAY_SEND_HOUR_ET = 9; // 9:00 AM Eastern

// A Date whose wall-clock fields (getHours/getDate/getMonth/getFullYear) reflect
// America/New_York, so DST is handled automatically.
const nowInET = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));

const checkAndSendHolidayBroadcasts = async () => {
  try {
    // Master switch — ON by default (owner enabled auto-send). Only an explicit
    // 'off' in SystemState pauses it; unset or 'on' both mean enabled, so the
    // owner can pause it anytime from the Broadcast switch without a redeploy.
    const flag = await SystemState.findOne({ key: 'holidayAutoSend' });
    if (flag && String(flag.value).toLowerCase() === 'off') return { success: true, sent: 0, reason: 'disabled' };

    const et = nowInET();
    // Only fire inside the 9 AM ET hour (this checker runs hourly).
    if (et.getHours() !== HOLIDAY_SEND_HOUR_ET) return { success: true, sent: 0, reason: 'off-hour' };

    const key = holidayForDate(et);
    if (!key) return { success: true, sent: 0, reason: 'no-holiday-today' };

    const year = et.getFullYear();
    const sentKey = `holidaySent:${key}:${year}`;

    // Once-per-year guard (redeploy-proof). CLAIM it before sending so a restart
    // mid-run can never re-send the same holiday.
    const already = await SystemState.findOne({ key: sentKey });
    if (already && already.value) return { success: true, sent: 0, reason: 'already-sent' };
    await SystemState.findOneAndUpdate(
      { key: sentKey },
      { value: new Date().toISOString(), updatedAt: new Date() },
      { upsert: true }
    );

    const cfg = HOLIDAY_TEMPLATES[key];
    const apiBase = process.env.API_URL || process.env.CLIENT_URL?.replace(/:\d+$/, ':5000') || 'http://localhost:5000';

    // All active hosts AND drivers who accept email.
    const users = await User.find({ accountStatus: { $ne: 'deactivated' }, email: { $ne: null } })
      .select('firstName email emailOptOut').lean();

    let sent = 0, failed = 0, skipped = 0;
    for (const u of users) {
      if (!u.email || u.emailOptOut) { skipped++; continue; }
      try {
        const unsubscribeUrl = `${apiBase}/api/users/unsubscribe/${u._id}`;
        await sendEmail({ to: u.email, subject: cfg.subject, html: holidayEmailHtml(cfg, u.firstName, unsubscribeUrl) });
        sent++;
      } catch (e) {
        failed++;
      }
    }
    console.log(`🎉 Holiday auto-send (${key} ${year}): sent ${sent}, failed ${failed}, skipped ${skipped}`);
    return { success: true, key, sent, failed, skipped };
  } catch (error) {
    console.error('🎉 Holiday auto-send error:', error.message);
    return { success: false, error: error.message };
  }
};

// Start the scheduler
let schedulerInterval = null;
let overdueInterval = null;
let registrationCheckInterval = null;
let tollSettlementInterval = null;
let tollSyncInterval = null;
let weeklyPayoutInterval = null;
let chargeSettlementInterval = null;
let lateReturnInterval = null;
let holidayBroadcastInterval = null;

const startReturnReminderScheduler = (intervalMinutes = 10) => {
  // Run email reminders immediately on startup
  console.log('🚀 Starting return reminder scheduler...');
  checkAndSendReturnReminders();

  // Then run at the specified interval
  const intervalMs = intervalMinutes * 60 * 1000;
  schedulerInterval = setInterval(checkAndSendReturnReminders, intervalMs);
  console.log(`⏱️  Return reminder scheduler running every ${intervalMinutes} minutes`);

  // Run overdue SMS check immediately and then every 10 minutes
  console.log('🚀 Starting overdue SMS scheduler...');
  checkAndSendOverdueSMS();
  overdueInterval = setInterval(checkAndSendOverdueSMS, intervalMs);
  console.log(`⏱️  Overdue SMS scheduler running every ${intervalMinutes} minutes`);

  // Automatic late-return fee processor. Same 10-minute rhythm. Fully gated:
  // acts only on bookings that agreed to the new late clause (isBookingEligible)
  // AND only charges when the owner's switch is ON (isChargingEnabled). While the
  // switch is OFF or the policy start is unset, this is a harmless no-op.
  console.log('🚀 Starting late-return fee processor...');
  processLateReturns();
  lateReturnInterval = setInterval(processLateReturns, intervalMs);
  console.log(`⏱️  Late-return fee processor running every ${intervalMinutes} minutes`);

  // Also start the daily registration expiration check
  console.log('🚀 Starting registration expiration scheduler...');
  checkRegistrationExpirations();
  pauseExpiredRegistrations();

  // Run registration checks once every 24 hours
  const oneDayMs = 24 * 60 * 60 * 1000;
  registrationCheckInterval = setInterval(() => {
    checkRegistrationExpirations();
    pauseExpiredRegistrations();
  }, oneDayMs);
  console.log('⏱️  Registration expiration scheduler running every 24 hours');

  // TollSpot status sync: check every 30 minutes for pre_registered vehicles to promote
  const thirtyMinMs = 30 * 60 * 1000;
  console.log('🚀 Starting TollSpot status sync scheduler...');
  setTimeout(() => {
    syncTollspotStatuses();
    tollSyncInterval = setInterval(syncTollspotStatuses, thirtyMinMs);
  }, 1 * 60 * 1000); // Delay first run by 1 minute
  console.log('⏱️  TollSpot status sync scheduler running every 30 minutes');

  // Post-trip toll settlement: check every 6 hours for new delayed toll charges
  const sixHoursMs = 6 * 60 * 60 * 1000;
  console.log('🚀 Starting post-trip toll settlement scheduler...');
  // Delay first run by 2 minutes to let server fully start
  setTimeout(() => {
    checkAndSettlePostTripTolls();
    tollSettlementInterval = setInterval(checkAndSettlePostTripTolls, sixHoursMs);
  }, 2 * 60 * 1000);
  console.log('⏱️  Post-trip toll settlement scheduler running every 6 hours');

  // Weekly automated payouts: every Monday at 12:00 PM ET — REDEPLOY-PROOF.
  // Instead of a fragile in-memory countdown (which resets on every redeploy and
  // could skip a day), we record the last run in the database and check hourly
  // whether this week's payout is due but hasn't run yet. Because the marker lives
  // in the DB, restarts/redeploys can never skip or double-run a payout.
  const runWeeklyPayoutIfDue = async () => {
    try {
      const now = new Date();
      const target = mostRecentPayoutTarget(now); // this week's Monday 12 PM ET (or earlier)
      const lastRun = await getLastPayoutRun();

      if (!lastRun) {
        // First startup ever: seed the marker WITHOUT running, so we don't fire a
        // payout for a past window we were never tracking. Normal schedule begins next cycle.
        await setLastPayoutRun(now);
        console.log(`💰 Weekly payout scheduler initialized — next payout target ${target.toISOString()} (no catch-up run)`);
        return;
      }

      if (lastRun.getTime() < target.getTime()) {
        console.log(`💰 Weekly payout due (target ${target.toISOString()}, last run ${lastRun.toISOString()}) — running now`);
        await processWeeklyPayouts();
        await setLastPayoutRun(new Date());
        console.log('💰 Weekly payout run complete; marker updated');
      }
    } catch (err) {
      console.error('💰 Weekly payout scheduler check failed:', err.message);
    }
  };

  // Check shortly after startup (catch-up if a run was missed), then every hour.
  setTimeout(runWeeklyPayoutIfDue, 60 * 1000);
  weeklyPayoutInterval = setInterval(runWeeklyPayoutIfDue, 60 * 60 * 1000);
  console.log('⏱️  Weekly payout scheduler running every Monday at 12:00 PM ET (redeploy-proof)');

  // One-time automatic flip of EXISTING hosts to daily bank deposits (see
  // migrateHostPayoutsToDaily above). Delayed 90s so the server & DB are fully
  // up; self-gated by a DB flag so it runs only once, ever. No button, no money
  // movement, and the Monday payout run above is untouched.
  console.log('🚀 Scheduling one-time daily-payout migration (runs 90s after startup, once ever)...');
  setTimeout(migrateHostPayoutsToDaily, 90 * 1000);

  // Host-added charge settlement: scan every 30 minutes for charges past their
  // 3-day notice window or due for retry after a failed attempt.
  console.log('🚀 Starting charge settlement scheduler...');
  setTimeout(() => {
    checkAndSettleScheduledCharges();
    chargeSettlementInterval = setInterval(checkAndSettleScheduledCharges, 30 * 60 * 1000);
  }, 3 * 60 * 1000); // delay first run by 3 minutes
  console.log('⏱️  Charge settlement scheduler running every 30 minutes');

  // Holiday auto-send: check hourly, but only actually sends inside the 9 AM ET
  // hour on a real holiday. ON by default; the owner can pause it anytime from
  // the Broadcast switch (sets SystemState 'holidayAutoSend' to 'off').
  const oneHourMs = 60 * 60 * 1000;
  console.log('🚀 Starting holiday auto-send scheduler (ON — pausable from Broadcast switch)...');
  setTimeout(() => {
    checkAndSendHolidayBroadcasts();
    holidayBroadcastInterval = setInterval(checkAndSendHolidayBroadcasts, oneHourMs);
  }, 4 * 60 * 1000); // delay first run by 4 minutes
  console.log('⏱️  Holiday auto-send scheduler checking hourly');

  return schedulerInterval;
};

const stopReturnReminderScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('🛑 Return reminder scheduler stopped');
  }
  if (overdueInterval) {
    clearInterval(overdueInterval);
    overdueInterval = null;
    console.log('🛑 Overdue SMS scheduler stopped');
  }
  if (registrationCheckInterval) {
    clearInterval(registrationCheckInterval);
    registrationCheckInterval = null;
    console.log('🛑 Registration expiration scheduler stopped');
  }
  if (tollSyncInterval) {
    clearInterval(tollSyncInterval);
    tollSyncInterval = null;
    console.log('🛑 TollSpot status sync scheduler stopped');
  }
  if (tollSettlementInterval) {
    clearInterval(tollSettlementInterval);
    tollSettlementInterval = null;
    console.log('🛑 Post-trip toll settlement scheduler stopped');
  }
  if (weeklyPayoutInterval) {
    clearInterval(weeklyPayoutInterval);
    weeklyPayoutInterval = null;
    console.log('🛑 Weekly payout scheduler stopped');
  }
  if (chargeSettlementInterval) {
    clearInterval(chargeSettlementInterval);
    chargeSettlementInterval = null;
    console.log('🛑 Charge settlement scheduler stopped');
  }
  if (lateReturnInterval) {
    clearInterval(lateReturnInterval);
    lateReturnInterval = null;
    console.log('🛑 Late-return fee processor stopped');
  }
  if (holidayBroadcastInterval) {
    clearInterval(holidayBroadcastInterval);
    holidayBroadcastInterval = null;
    console.log('🛑 Holiday auto-send scheduler stopped');
  }
};

module.exports = {
  checkAndSendReturnReminders,
  checkAndSendOverdueSMS,
  checkRegistrationExpirations,
  checkAndSettlePostTripTolls,
  syncTollspotStatuses,
  processWeeklyPayouts,
  previewHostPayout,
  checkAndSendHolidayBroadcasts,
  startReturnReminderScheduler,
  stopReturnReminderScheduler
};
