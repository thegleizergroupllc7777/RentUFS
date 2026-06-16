const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const { sendReturnReminderEmail, sendRegistrationExpirationReminder, sendVehiclePausedEmail, sendPayoutNotificationEmail, sendPayoutFailureAlert, sendPayoutRunSummaryEmail } = require('./emailService');
const { sendOverdueReminderSMS } = require('./smsService');
const { isConfigured: tollspotConfigured, preRegisterVehicle, listVehicles } = require('./tollspot');
const { getOutstandingTolls, chargeDriverForTolls, transferTollsToHost, recordTollSettlement } = require('./tollSettlement');
const { checkAndSettleScheduledCharges } = require('./chargeSettlement');

// Check for bookings ending soon and send reminder emails (1 hour before return)
const checkAndSendReturnReminders = async () => {
  try {
    const now = new Date();

    // Find active bookings that haven't had a reminder email sent yet
    const activeBookings = await Booking.find({
      status: 'active',
      returnReminderSent: { $ne: true }
    })
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');

    let remindersSent = 0;

    for (const booking of activeBookings) {
      // Calculate the exact end time based on endDate and dropoffTime
      const endDate = new Date(booking.endDate);
      const dropoffTime = booking.dropoffTime || '10:00';
      const [hours, minutes] = dropoffTime.split(':').map(Number);
      endDate.setHours(hours, minutes, 0, 0);

      // Calculate time until end (in milliseconds)
      const timeUntilEnd = endDate.getTime() - now.getTime();
      const hoursUntilEnd = timeUntilEnd / (1000 * 60 * 60);

      // Send email reminder if booking ends within 30 minutes to 90 minutes (approximately 1 hour window)
      // This window ensures we catch bookings even if the scheduler runs every 10-15 minutes
      if (hoursUntilEnd > 0.5 && hoursUntilEnd <= 1.5) {
        console.log(`⏰ Sending return reminder email for booking ${booking.reservationId} (ends in ${hoursUntilEnd.toFixed(1)} hours)`);

        const result = await sendReturnReminderEmail(
          booking.driver,
          booking,
          booking.vehicle,
          booking.host
        );

        if (result.success) {
          booking.returnReminderSent = true;
          booking.returnReminderSentAt = new Date();
          await booking.save();
          remindersSent++;
          console.log(`✅ Return reminder email sent for booking ${booking.reservationId}`);
        } else {
          console.error(`❌ Failed to send return reminder email for booking ${booking.reservationId}`);
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
      // Calculate the exact end time based on endDate and dropoffTime
      const endDate = new Date(booking.endDate);
      const dropoffTime = booking.dropoffTime || '10:00';
      const [hours, minutes] = dropoffTime.split(':').map(Number);
      endDate.setHours(hours, minutes, 0, 0);

      // Check if booking is overdue (past return time)
      if (now > endDate) {
        // Calculate how overdue
        const diffMs = now - endDate;
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        const overdueInfo = diffDays >= 1
          ? `${diffDays} day${diffDays > 1 ? 's' : ''}`
          : `${Math.max(1, diffHours)} hour${diffHours !== 1 ? 's' : ''}`;

        // Only send SMS if driver has a phone number
        if (booking.driver?.phone) {
          console.log(`🚨 Sending overdue SMS for booking ${booking.reservationId} (${overdueInfo} overdue)`);

          const smsResult = await sendOverdueReminderSMS(
            booking.driver,
            booking,
            booking.vehicle,
            overdueInfo
          );

          if (smsResult.success) {
            booking.smsReturnReminderSent = true;
            await booking.save();
            smsSent++;
            console.log(`📱 Overdue SMS sent for booking ${booking.reservationId}`);
          } else {
            console.error(`📱 Failed to send overdue SMS for booking ${booking.reservationId}: ${smsResult.error}`);
          }
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

// Automated weekly payout: transfer host earnings for both completed and active bookings
const processWeeklyPayouts = async () => {
  try {
    // Find all hosts with Stripe Connect accounts and payouts enabled
    const hosts = await User.find({
      stripeConnectAccountId: { $exists: true, $ne: null },
      stripeConnectPayoutsEnabled: true,
      userType: { $in: ['host', 'both'] }
    });

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

// Start the scheduler
let schedulerInterval = null;
let overdueInterval = null;
let registrationCheckInterval = null;
let tollSettlementInterval = null;
let tollSyncInterval = null;
let weeklyPayoutInterval = null;
let chargeSettlementInterval = null;

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

  // Weekly automated payouts: transfer eligible earnings to all hosts every Monday
  // Calculate ms until next Monday at 6:00 AM EST
  const scheduleWeeklyPayout = () => {
    const now = new Date();
    const nextMonday = new Date(now);
    const currentDay = now.getUTCDay(); // 0=Sun, 1=Mon
    const daysUntilMonday = currentDay === 0 ? 1 : currentDay === 1 ? 7 : 8 - currentDay;
    nextMonday.setUTCDate(now.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(11, 0, 0, 0); // 11:00 UTC = 6:00 AM EST

    const msUntilMonday = nextMonday.getTime() - now.getTime();
    const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

    console.log(`🚀 Weekly payout scheduler: next run ${nextMonday.toISOString()}`);

    setTimeout(() => {
      processWeeklyPayouts();
      weeklyPayoutInterval = setInterval(processWeeklyPayouts, oneWeekMs);
    }, msUntilMonday);
  };
  scheduleWeeklyPayout();
  console.log('⏱️  Weekly payout scheduler running every Monday at 6:00 AM EST');

  // Host-added charge settlement: scan every 30 minutes for charges past their
  // 3-day notice window or due for retry after a failed attempt.
  console.log('🚀 Starting charge settlement scheduler...');
  setTimeout(() => {
    checkAndSettleScheduledCharges();
    chargeSettlementInterval = setInterval(checkAndSettleScheduledCharges, 30 * 60 * 1000);
  }, 3 * 60 * 1000); // delay first run by 3 minutes
  console.log('⏱️  Charge settlement scheduler running every 30 minutes');

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
};

module.exports = {
  checkAndSendReturnReminders,
  checkAndSendOverdueSMS,
  checkRegistrationExpirations,
  checkAndSettlePostTripTolls,
  syncTollspotStatuses,
  processWeeklyPayouts,
  startReturnReminderScheduler,
  stopReturnReminderScheduler
};
