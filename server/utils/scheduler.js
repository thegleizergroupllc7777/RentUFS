const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const User = require('../models/User');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const { sendReturnReminderEmail, sendRegistrationExpirationReminder, sendPayoutNotificationEmail } = require('./emailService');
const { sendOverdueReminderSMS } = require('./smsService');
const { isConfigured: tollspotConfigured } = require('./tollspot');
const { getOutstandingTolls, chargeDriverForTolls, transferTollsToHost, recordTollSettlement } = require('./tollSettlement');

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

// Automated weekly payout: transfer all eligible host earnings to their Stripe Connect accounts
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

    for (const host of hosts) {
      try {
        // Find all eligible bookings for this host
        const eligibleBookings = await Booking.find({
          host: host._id,
          status: 'completed',
          paymentStatus: 'paid',
          payoutStatus: { $in: ['pending', 'eligible'] },
          hostEarnings: { $gt: 0 }
        }).populate('vehicle', 'make model year');

        if (eligibleBookings.length === 0) continue;

        // Recalculate correct earnings for each booking
        for (const b of eligibleBookings) {
          const correctHostFee = (b.hostPlatformFeePerDay || 1.50) * (b.totalDays || 0);
          const rentalSubtotal = (b.pricePerDay || 0) * (b.totalDays || 0);
          const hostProcessingFee = Number(b.hostProcessingFee) || 0;
          const correctEarnings = Math.max(0, rentalSubtotal - correctHostFee - hostProcessingFee);
          if (b.hostPlatformFee !== correctHostFee || b.hostEarnings !== correctEarnings) {
            b.hostPlatformFee = correctHostFee;
            b.hostEarnings = correctEarnings;
          }
        }

        const totalAmount = eligibleBookings.reduce((sum, b) => sum + b.hostEarnings, 0);
        if (totalAmount <= 0) continue;

        // Create Stripe transfer to host's Connect account
        const transfer = await stripe.transfers.create({
          amount: Math.round(totalAmount * 100),
          currency: 'usd',
          destination: host.stripeConnectAccountId,
          description: `Weekly payout for ${eligibleBookings.length} booking(s)`,
          metadata: {
            hostId: host._id.toString(),
            bookingCount: eligibleBookings.length.toString(),
            bookingIds: eligibleBookings.map(b => b._id.toString()).join(',')
          }
        });

        // Update all bookings as paid out
        const now = new Date();
        for (const booking of eligibleBookings) {
          await Booking.findByIdAndUpdate(booking._id, {
            payoutStatus: 'paid',
            payoutId: transfer.id,
            payoutDate: now,
            payoutAmount: booking.hostEarnings
          });
        }

        hostsProcessed++;
        totalTransferred += totalAmount;

        console.log(`💰 Weekly payout: Transferred $${totalAmount.toFixed(2)} to host ${host.firstName} ${host.lastName} (${eligibleBookings.length} booking(s))`);

        // Send payout notification email
        sendPayoutNotificationEmail(host, {
          totalAmount,
          bookingCount: eligibleBookings.length,
          transferId: transfer.id,
          bookings: eligibleBookings.map(b => ({
            reservationId: b.reservationId,
            vehicle: b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : 'Vehicle',
            amount: b.hostEarnings
          }))
        }).catch(err => console.error(`📧 Weekly payout email failed for host ${host._id}:`, err.message));

      } catch (hostErr) {
        console.error(`💰 Weekly payout error for host ${host._id}:`, hostErr.message);
      }
    }

    if (hostsProcessed > 0) {
      console.log(`💰 Weekly payouts complete: ${hostsProcessed} host(s), $${totalTransferred.toFixed(2)} total`);
    }

    return { success: true, hostsProcessed, totalTransferred };
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
let weeklyPayoutInterval = null;

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

  // Run registration check once every 24 hours
  const oneDayMs = 24 * 60 * 60 * 1000;
  registrationCheckInterval = setInterval(checkRegistrationExpirations, oneDayMs);
  console.log('⏱️  Registration expiration scheduler running every 24 hours');

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
};

module.exports = {
  checkAndSendReturnReminders,
  checkAndSendOverdueSMS,
  checkRegistrationExpirations,
  checkAndSettlePostTripTolls,
  processWeeklyPayouts,
  startReturnReminderScheduler,
  stopReturnReminderScheduler
};
