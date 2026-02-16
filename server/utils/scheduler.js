const Booking = require('../models/Booking');
const Vehicle = require('../models/Vehicle');
const { sendReturnReminderEmail, sendRegistrationExpirationReminder } = require('./emailService');
const { sendOverdueReminderSMS } = require('./smsService');

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

// Start the scheduler
let schedulerInterval = null;
let overdueInterval = null;
let registrationCheckInterval = null;

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
};

module.exports = {
  checkAndSendReturnReminders,
  checkAndSendOverdueSMS,
  checkRegistrationExpirations,
  startReturnReminderScheduler,
  stopReturnReminderScheduler
};
