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

module.exports = {
  isSmsConfigured,
  sendSMS,
  sendExtensionReminderSMS
};
