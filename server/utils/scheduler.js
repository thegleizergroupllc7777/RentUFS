const Booking = require('../models/Booking');
const { sendReturnReminderEmail } = require('./emailService');

// Check for bookings ending soon and send reminder emails
const checkAndSendReturnReminders = async () => {
  try {
    const now = new Date();

    // Find active bookings that:
    // 1. Are currently active
    // 2. Haven't had a reminder sent yet
    // 3. End within the next 1-2 hours (we check this window to account for scheduler interval)
    const activeBookings = await Booking.find({
      status: 'active',
      returnReminderSent: { $ne: true }
    })
      .populate('vehicle')
      .populate('driver', 'firstName lastName email')
      .populate('host', 'firstName lastName email');

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

      // Send reminder if booking ends within 30 minutes to 90 minutes (approximately 1 hour window)
      // This window ensures we catch bookings even if the scheduler runs every 10-15 minutes
      if (hoursUntilEnd > 0.5 && hoursUntilEnd <= 1.5) {
        console.log(`⏰ Sending return reminder for booking ${booking.reservationId} (ends in ${hoursUntilEnd.toFixed(1)} hours)`);

        // Send the reminder email
        const result = await sendReturnReminderEmail(
          booking.driver,
          booking,
          booking.vehicle,
          booking.host
        );

        if (result.success) {
          // Mark the booking as reminder sent
          booking.returnReminderSent = true;
          booking.returnReminderSentAt = new Date();
          await booking.save();
          remindersSent++;
          console.log(`✅ Return reminder sent for booking ${booking.reservationId}`);
        } else {
          console.error(`❌ Failed to send return reminder for booking ${booking.reservationId}`);
        }
      }
    }

    if (remindersSent > 0) {
      console.log(`📧 Sent ${remindersSent} return reminder(s)`);
    }

    return { success: true, remindersSent };
  } catch (error) {
    console.error('❌ Error in return reminder scheduler:', error);
    return { success: false, error: error.message };
  }
};

// Start the scheduler
let schedulerInterval = null;

const startReturnReminderScheduler = (intervalMinutes = 10) => {
  // Run immediately on startup
  console.log('🚀 Starting return reminder scheduler...');
  checkAndSendReturnReminders();

  // Then run at the specified interval
  const intervalMs = intervalMinutes * 60 * 1000;
  schedulerInterval = setInterval(checkAndSendReturnReminders, intervalMs);

  console.log(`⏱️  Return reminder scheduler running every ${intervalMinutes} minutes`);

  return schedulerInterval;
};

const stopReturnReminderScheduler = () => {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('🛑 Return reminder scheduler stopped');
  }
};

module.exports = {
  checkAndSendReturnReminders,
  startReturnReminderScheduler,
  stopReturnReminderScheduler
};
