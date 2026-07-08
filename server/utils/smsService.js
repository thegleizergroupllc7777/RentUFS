const twilio = require('twilio');

let twilioClient = null;
let twilioPhoneNumber = null;

// Initialize Twilio client if credentials are configured
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
  twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  console.log('✅ Twilio SMS service configured');
} else {
  console.log('⚠️  Twilio SMS not configured (set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER)');
}

const isSmsConfigured = () => !!twilioClient;

// Format phone number to E.164 format for Twilio
const formatToE164 = (phone) => {
  if (!phone) return null;
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '');
  // If it already has country code (11 digits starting with 1)
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`;
  }
  // US number without country code (10 digits)
  if (digits.length === 10) {
    return `+1${digits}`;
  }
  // Already has + prefix
  if (phone.startsWith('+')) {
    return phone;
  }
  return null;
};

// Send an SMS message
const sendSMS = async (to, body) => {
  const formattedNumber = formatToE164(to);

  if (!formattedNumber) {
    console.error('📱 Invalid phone number:', to);
    return { success: false, error: 'Invalid phone number format' };
  }

  if (!twilioClient) {
    console.log(`📱 [DEV] SMS to ${formattedNumber}: ${body}`);
    return { success: true, dev: true };
  }

  try {
    const message = await twilioClient.messages.create({
      body,
      from: twilioPhoneNumber,
      to: formattedNumber
    });
    console.log(`📱 SMS sent to ${formattedNumber} | SID: ${message.sid}`);
    return { success: true, messageSid: message.sid };
  } catch (error) {
    console.error('📱 SMS send error:', error.message);
    return { success: false, error: error.message };
  }
};

// Send extension reminder SMS from host to driver
const sendExtensionReminderSMS = async (driver, booking, vehicle, host) => {
  const endDate = new Date(booking.endDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const dropoffTime = booking.dropoffTime || '10:00';
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const body = `Hi ${driver.firstName}, this is a reminder from ${host.firstName} (your host) that your ${vehicle.year} ${vehicle.make} ${vehicle.model} rental ends on ${endDate} at ${dropoffTime}. Need more time? Extend your rental here: ${clientUrl}/my-bookings - RentUFS`;

  return sendSMS(driver.phone, body);
};

// Notify host when a new booking request is received
const sendNewBookingNotificationSMS = async (host, driver, booking, vehicle) => {
  const startDate = new Date(booking.startDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const endDate = new Date(booking.endDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const body = `Hi ${host.firstName}, you have a new booking request from ${driver.firstName} ${driver.lastName} for your ${vehicle.year} ${vehicle.make} ${vehicle.model}. Dates: ${startDate} - ${endDate} ($${booking.totalPrice}). Review it here: ${clientUrl}/host/bookings - RentUFS`;

  return sendSMS(host.phone, body);
};

// Notify driver when booking is confirmed by host
const sendBookingConfirmedSMS = async (driver, booking, vehicle, host) => {
  const startDate = new Date(booking.startDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const pickupTime = booking.pickupTime || '10:00';
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const body = `Great news, ${driver.firstName}! Your ${vehicle.year} ${vehicle.make} ${vehicle.model} rental has been confirmed by ${host.firstName}. Pickup: ${startDate} at ${pickupTime}. View details: ${clientUrl}/my-bookings - RentUFS`;

  return sendSMS(driver.phone, body);
};

// Notify driver when booking is marked active (vehicle picked up)
const sendBookingActiveSMS = async (driver, booking, vehicle) => {
  const endDate = new Date(booking.endDate).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  });
  const dropoffTime = booking.dropoffTime || '10:00';
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const body = `Hi ${driver.firstName}, your ${vehicle.year} ${vehicle.make} ${vehicle.model} rental is now active! Please return the vehicle by ${endDate} at ${dropoffTime}. Manage your booking: ${clientUrl}/my-bookings - RentUFS`;

  return sendSMS(driver.phone, body);
};

// Notify driver when booking is completed
const sendBookingCompletedSMS = async (driver, booking, vehicle) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const body = `Hi ${driver.firstName}, your ${vehicle.year} ${vehicle.make} ${vehicle.model} rental is now complete. Thank you for using RentUFS! Leave a review: ${clientUrl}/my-bookings - RentUFS`;

  return sendSMS(driver.phone, body);
};

// Notify driver when booking is cancelled
const sendBookingCancelledSMS = async (driver, booking, vehicle, reason) => {
  const reasonText = reason ? ` Reason: ${reason}` : '';

  const body = `Hi ${driver.firstName}, your ${vehicle.year} ${vehicle.make} ${vehicle.model} reservation (${booking.reservationId}) has been cancelled.${reasonText} If you were charged, a refund will be processed. - RentUFS`;

  return sendSMS(driver.phone, body);
};

// Notify host when driver cancels a booking
const sendDriverCancelledNotificationSMS = async (host, driver, booking, vehicle) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const body = `Hi ${host.firstName}, ${driver.firstName} ${driver.lastName} has cancelled their reservation (${booking.reservationId}) for your ${vehicle.year} ${vehicle.make} ${vehicle.model}. Your vehicle is now available again. View details: ${clientUrl}/host/bookings - RentUFS`;

  return sendSMS(host.phone, body);
};

// URGENT: Notify driver when booking is overdue (past return time) - insurance coverage at risk
const sendOverdueReminderSMS = async (driver, booking, vehicle, overdueInfo) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  const body = `URGENT: ${driver.firstName}, your ${vehicle.year} ${vehicle.make} ${vehicle.model} rental is ${overdueInfo} past due! Your insurance coverage may no longer be active. Please extend your reservation immediately to continue coverage: ${clientUrl}/my-bookings - RentUFS`;

  return sendSMS(driver.phone, body);
};

// Advance late-return warning text (2h / 1h / 30m before the return time).
// Short and escalating; caller checks SMS consent before sending.
const sendLateReturnWarningSMS = async (driver, booking, vehicle, stage) => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
  const vLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your rental';
  const lead = stage === '2h' ? 'ends in about 2 hours'
    : stage === '30m' ? 'ends in 30 minutes' : 'ends in about 1 hour';
  const urgency = stage === '30m'
    ? 'Charges begin the moment you are late.'
    : 'Avoid an automatic late fee ($5 + 1 insurance day).';
  const body = `RentUFS: Hi ${driver.firstName || 'there'}, your ${vLabel} rental ${lead}. ${urgency} Return or extend: ${clientUrl}/my-bookings`;
  return sendSMS(driver.phone, body);
};

// Welcome SMS for new HOSTS only, with the "how to host" video link.
// Safely no-ops for non-hosts or anyone without a phone number on file.
const sendHostWelcomeSMS = async (host) => {
  if (!host || (host.userType !== 'host' && host.userType !== 'both')) return { skipped: true };
  if (!host.phone) return { skipped: true };
  const body = `Hey ${host.firstName || 'there'}, welcome to RentUFS! 🚗 Here are your next steps before putting 100% in your pocket (zero commission): https://youtu.be/E94Lx7iVxpo`;
  return sendSMS(host.phone, body);
};

module.exports = {
  isSmsConfigured,
  sendSMS,
  sendHostWelcomeSMS,
  formatToE164,
  sendExtensionReminderSMS,
  sendNewBookingNotificationSMS,
  sendBookingConfirmedSMS,
  sendBookingActiveSMS,
  sendBookingCompletedSMS,
  sendBookingCancelledSMS,
  sendDriverCancelledNotificationSMS,
  sendOverdueReminderSMS,
  sendLateReturnWarningSMS
};
