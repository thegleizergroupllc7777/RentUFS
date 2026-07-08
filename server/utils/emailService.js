const nodemailer = require('nodemailer');

// Check if SendGrid is available
let sgMail = null;
if (process.env.SENDGRID_API_KEY) {
  sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  console.log('✅ SendGrid email service configured');
}

// Create reusable transporter
const createTransporter = () => {
  // Priority 1: SendGrid (recommended for production)
  if (process.env.SENDGRID_API_KEY) {
    // Return a special marker - we'll use SendGrid API directly
    return { type: 'sendgrid' };
  }

  // Priority 2: Gmail
  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // Use App Password for Gmail
      }
    });
  }

  // Priority 3: Custom SMTP configuration
  if (process.env.SMTP_HOST) {
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  }

  // Development mode - create test account using ethereal.email
  console.log('⚠️  Email service not configured. Emails will be logged to console only.');
  return null;
};

// Consistent sender info used across all emails
const SENDER_NAME = 'RentUFS';

// Get the verified sender email/name
const getSenderInfo = () => {
  const email = process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@rentufs.com';
  const name = SENDER_NAME;
  return { email, name };
};

// Check if email service is available (not dev mode)
const isEmailConfigured = () => {
  return !!(process.env.SENDGRID_API_KEY || process.env.EMAIL_SERVICE || process.env.SMTP_HOST);
};

// Helper function to send email via SendGrid or Nodemailer
// All emails go through this single function to ensure consistent headers
const sendEmail = async (mailOptions) => {
  const transporter = createTransporter();

  if (!transporter) {
    return { success: false, dev: true };
  }

  const sender = getSenderInfo();
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

  // Anti-spam headers applied to ALL transport methods
  const antiSpamHeaders = {
    'X-Priority': '3',
    'X-Mailer': 'RentUFS Notifications',
    'List-Unsubscribe': `<${clientUrl}/unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    'X-Auto-Response-Suppress': 'OOF, AutoReply'
  };

  if (transporter.type === 'sendgrid') {
    const msg = {
      to: mailOptions.to,
      from: {
        email: sender.email,
        name: sender.name
      },
      replyTo: {
        email: process.env.EMAIL_REPLY_TO || process.env.SUPPORT_EMAIL || sender.email,
        name: sender.name
      },
      subject: mailOptions.subject,
      text: mailOptions.text || stripHtml(mailOptions.html),
      html: mailOptions.html,
      headers: antiSpamHeaders,
      trackingSettings: {
        clickTracking: { enable: false },
        openTracking: { enable: false },
        subscriptionTracking: { enable: false }
      },
      mailSettings: {
        bypassListManagement: { enable: false }
      }
    };

    const response = await sgMail.send(msg);
    console.log(`📧 Email sent via SendGrid to: ${mailOptions.to} | Subject: ${mailOptions.subject}`);
    return { success: true, messageId: response[0]?.headers['x-message-id'] };
  } else {
    // Nodemailer (Gmail / SMTP) — apply the same anti-spam headers
    const nodemailerOptions = {
      from: `"${sender.name}" <${sender.email}>`,
      to: mailOptions.to,
      subject: mailOptions.subject,
      text: mailOptions.text || stripHtml(mailOptions.html),
      html: mailOptions.html,
      headers: antiSpamHeaders,
      replyTo: process.env.EMAIL_REPLY_TO || process.env.SUPPORT_EMAIL || sender.email
    };

    const info = await transporter.sendMail(nodemailerOptions);
    console.log(`📧 Email sent via Nodemailer to: ${mailOptions.to} | Subject: ${mailOptions.subject}`);
    return { success: true, messageId: info.messageId };
  }
};

// Simple HTML tag stripper for auto-generating text fallback
const stripHtml = (html) => {
  if (!html) return '';
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<li>/gi, '- ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&copy;/g, '(c)')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
};

// Send welcome email to new users
const sendWelcomeEmail = async (user) => {
  try {
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Welcome Email to: ${user.email}`);
      return { success: true, dev: true };
    }

    const userTypeText = user.userType === 'driver' ? 'Driver' :
                         user.userType === 'host' ? 'Host' : 'Driver & Host';

    const mailOptions = {
      to: user.email,
      subject: 'Welcome to RentUFS - Your Account is Ready!',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
              margin: 0;
              padding: 0;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: #000000;
              color: #00FF66;
              padding: 30px 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .logo {
              font-size: 2.5rem;
              font-weight: bold;
              letter-spacing: 0.15em;
              color: #00FF66;
            }
            .content {
              background: #f9fafb;
              padding: 30px;
              border-radius: 0 0 8px 8px;
            }
            .badge {
              background: #00FF66;
              color: #000000;
              padding: 5px 15px;
              border-radius: 20px;
              display: inline-block;
              font-size: 0.9rem;
              font-weight: bold;
              margin: 10px 0;
            }
            .button {
              background: #000000;
              color: #00FF66;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              display: inline-block;
              margin-top: 20px;
              font-weight: bold;
            }
            .features {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #00FF66;
            }
            .feature-item {
              padding: 10px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .feature-item:last-child {
              border-bottom: none;
            }
            .footer {
              background: #00FF66;
              text-align: center;
              color: #000000;
              padding: 20px;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: white;">Welcome Aboard!</h1>
            </div>

            <div class="content">
              <h2>Hi ${user.firstName},</h2>

              <p>Your RentUFS account has been successfully created!</p>

              <div class="badge">${userTypeText} Account</div>

              <div class="features">
                <h3 style="margin-top: 0; color: #000000;">What's Next?</h3>

                ${user.userType === 'driver' ? `
                  <div class="feature-item">Browse thousands of vehicles</div>
                  <div class="feature-item">Book your first ride</div>
                  <div class="feature-item">Rate and review your experience</div>
                ` : user.userType === 'host' ? `
                  <div class="feature-item">List your vehicles</div>
                  <div class="feature-item">Set your own prices</div>
                  <div class="feature-item">Start earning money</div>
                ` : `
                  <div class="feature-item">Browse and rent vehicles</div>
                  <div class="feature-item">List your own cars</div>
                  <div class="feature-item">Earn while you rent</div>
                `}
              </div>

              ${(user.userType === 'host' || user.userType === 'both') ? `
              <center>
                <a href="https://youtu.be/E94Lx7iVxpo" style="background:#000000;color:#00FF66;border:2px solid #00FF66;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  ▶ Watch: How to Host Your Car
                </a>
                <p style="font-size:0.85rem;color:#6b7280;margin-top:8px;">A quick guide to start earning — zero commission, 100% yours.</p>
              </center>
              ` : ''}

              <p>We're excited to have you as part of our community. Whether you're looking to rent a car or earn money by listing yours, we've got you covered!</p>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/marketplace" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  Explore Marketplace
                </a>
              </center>

              <p style="margin-top: 30px; font-size: 0.9rem; color: #6b7280;">
                <strong>Need Help?</strong><br>
                If you have any questions, feel free to reach out to our support team.
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${user.firstName},\n\nWelcome to RentUFS!\n\nYour account has been successfully created.\n\nAccount Type: ${userTypeText}\n\n${user.userType === 'driver' ? 'You can now browse and rent vehicles from trusted hosts in your area.' : user.userType === 'host' ? 'You can now list your vehicles and start earning money!\n\n▶ Watch how to host your car (zero commission): https://youtu.be/E94Lx7iVxpo' : 'You can rent vehicles and list your own cars to earn money!\n\n▶ Watch how to host your car (zero commission): https://youtu.be/E94Lx7iVxpo'}\n\nGet Started:\n- Browse available vehicles\n- ${user.userType !== 'driver' ? 'List your vehicles' : 'Book your first ride'}\n- Complete your profile\n\nThank you for choosing RentUFS!\n\nBest regards,\nThe RentUFS Team`
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Welcome email sent to:', user.email);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending welcome email:', error);
    // Don't throw error - we don't want to fail registration if email fails
    return { success: false, error: error.message };
  }
};

// Send vehicle listing confirmation email
const sendVehicleListedEmail = async (user, vehicle) => {
  try {
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Vehicle Listed Email to: ${user.email}`);
      return { success: true, dev: true };
    }

    const mailOptions = {
      to: user.email,
      subject: `Your ${vehicle.year} ${vehicle.make} ${vehicle.model} is Now Listed!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .vehicle-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00FF66; }
            .vehicle-detail { padding: 8px 0; border-bottom: 1px solid #e5e7eb; }
            .vehicle-detail:last-child { border-bottom: none; }
            .price { font-size: 1.5rem; color: #00CC52; font-weight: bold; }
            .button { background: #000000; color: #00FF66; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: #00FF66;">Vehicle Listed Successfully!</h1>
            </div>

            <div class="content">
              <h2>Hi ${user.firstName},</h2>

              <p>Great news! Your vehicle is now live on UFS and ready to be rented!</p>

              <div class="vehicle-card">
                <h3 style="margin-top: 0; color: #000000;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="vehicle-detail">
                  <strong>Type:</strong> ${vehicle.type.charAt(0).toUpperCase() + vehicle.type.slice(1)}
                </div>
                <div class="vehicle-detail">
                  <strong>Transmission:</strong> ${vehicle.transmission.charAt(0).toUpperCase() + vehicle.transmission.slice(1)}
                </div>
                <div class="vehicle-detail">
                  <strong>Seats:</strong> ${vehicle.seats} passengers
                </div>
                <div class="vehicle-detail">
                  <strong>Location:</strong> ${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'}
                </div>
                <div class="vehicle-detail" style="margin-top: 15px;">
                  <span class="price">$${vehicle.pricePerDay}/day</span>
                </div>
              </div>

              <p><strong>What happens next?</strong></p>
              <ul>
                <li>Your vehicle is now visible to renters searching in your area</li>
                <li>You'll receive notifications for booking requests</li>
                <li>You can manage your listing anytime from your host dashboard</li>
              </ul>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/host/dashboard" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View Dashboard
                </a>
              </center>

              <p style="margin-top: 30px; font-size: 0.9rem; color: #6b7280;">
                <strong>Pro Tip:</strong> Vehicles with complete profiles and clear photos get 3x more bookings!
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${user.firstName},\n\nCongratulations! Your vehicle has been successfully listed on RentUFS!\n\nVehicle Details:\n- ${vehicle.year} ${vehicle.make} ${vehicle.model}\n- Type: ${vehicle.type}\n- Price: $${vehicle.pricePerDay}/day\n- Location: ${vehicle.location?.city}, ${vehicle.location?.state}\n\nYour vehicle is now visible to potential renters!\n\nWhat's Next:\n- Monitor booking requests in your host dashboard\n- Update your vehicle availability as needed\n- Respond to renter inquiries promptly\n\nStart earning today!\n\nBest regards,\nThe RentUFS Team`
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Vehicle listing email sent to:', user.email);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending vehicle listing email:', error);
    return { success: false, error: error.message };
  }
};

// Format 24h time string (e.g. "14:00") to 12h with AM/PM (e.g. "2:00 PM")
const formatTime12h = (time) => {
  if (!time) return '10:00 AM';
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const h = hours % 12 || 12;
  return `${h}:${String(minutes).padStart(2, '0')} ${period}`;
};

// Send booking confirmation email to driver
const sendBookingConfirmationToDriver = async (driver, booking, vehicle, host) => {
  try {
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const pickupTime = formatTime12h(booking.pickupTime);
    const dropoffTime = formatTime12h(booking.dropoffTime || booking.pickupTime);
    const vehicleImageUrl = getVehicleImageUrl(vehicle);

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Booking Confirmation Email to Driver: ${driver.email}`);
      return { success: true, dev: true };
    }

    const mailOptions = {
      to: driver.email,
      subject: `Booking Confirmed - ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00FF66; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .total { font-size: 1.5rem; color: #00CC52; font-weight: bold; text-align: right; margin-top: 15px; }
            .host-info { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { background: #000000; color: #00FF66; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; }
            .reminders { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: #00FF66;">Booking Confirmed!</h1>
              <p style="margin: 0; color: #ffffff; opacity: 0.85;">Your payment was successful</p>
            </div>

            <div class="content">
              <h2>Hi ${driver.firstName},</h2>
              <p>Great news! Your booking has been confirmed and payment processed successfully!</p>

              <div class="booking-card">
                <div style="background: #f0fdf4; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #00CC52;">${booking.reservationId || booking._id}</span>
                </div>
                ${vehicleImageUrl ? `
                <div style="text-align: center; margin-bottom: 15px;">
                  <img src="${vehicleImageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" style="max-width: 100%; height: auto; max-height: 200px; border-radius: 8px; object-fit: cover;" />
                </div>
                ` : ''}
                <h3 style="margin-top: 0; color: #000000;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="detail-row">
                  <span class="label">Pick-up Date</span>
                  <span class="value">${startDate} at ${pickupTime}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Return Date</span>
                  <span class="value">${endDate} at ${dropoffTime}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Duration</span>
                  <span class="value">${booking.totalDays} day(s)</span>
                </div>
                <div class="detail-row">
                  <span class="label">Pickup Location</span>
                  <span class="value">
                    ${vehicle.location?.address ? `${vehicle.location.address}<br>` : ''}${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'} ${vehicle.location?.zipCode || ''}
                  </span>
                </div>

                <div class="total">Total Paid: $${booking.totalPrice.toFixed(2)}</div>
              </div>

              <div class="host-info">
                <h4 style="margin-top: 0; color: #059669;">Host Information</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${host.firstName} ${host.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${host.email}</p>
                ${host.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${host.phone}</p>` : ''}
              </div>

              <div class="reminders">
                <h4 style="margin-top: 0; color: #b45309;">Important Reminders</h4>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Bring a valid driver's license</li>
                  <li>Arrive on time for pick-up</li>
                  <li>Inspect the vehicle before driving</li>
                  <li>Return or extend on time — late returns are charged automatically ($5/day plus one day of insurance)</li>
                </ul>
              </div>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View My Bookings
                </a>
              </center>
            </div>

            <div class="footer">
              <p>© ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p>Booking ID: ${booking._id}</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${driver.firstName},

Great news! Your booking has been confirmed and payment processed successfully!

Reservation ID: ${booking.reservationId || booking._id}

Booking Details:
- Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Pick-up Date: ${startDate} at ${pickupTime}
- Return Date: ${endDate} at ${dropoffTime}
- Duration: ${booking.totalDays} day(s)
- Total Paid: $${booking.totalPrice.toFixed(2)}

Host Information:
- Name: ${host.firstName} ${host.lastName}
- Email: ${host.email}
- Phone: ${host.phone || 'Not provided'}

Pick-up Location:
${vehicle.location?.address ? `${vehicle.location.address}\n` : ''}${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'} ${vehicle.location?.zipCode || ''}

Important Reminders:
- Bring a valid driver's license
- Arrive on time for pick-up
- Inspect the vehicle before driving
- Return or extend on time — late returns are charged automatically ($5/day plus one day of insurance)

Thank you for choosing RentUFS!

Best regards,
The RentUFS Team
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Booking confirmation email sent to driver:', driver.email);
      if (result.messageId) console.log('Message ID:', result.messageId);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending booking confirmation to driver:', error);
    return { success: false, error: error.message };
  }
};

// Send booking notification email to host
const sendBookingNotificationToHost = async (host, booking, vehicle, driver) => {
  try {
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const pickupTime = formatTime12h(booking.pickupTime);
    const dropoffTime = formatTime12h(booking.dropoffTime || booking.pickupTime);
    const vehicleImageUrl = getVehicleImageUrl(vehicle);

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Booking Notification Email to Host: ${host.email}`);
      return { success: true, dev: true };
    }

    const mailOptions = {
      to: host.email,
      subject: `New Booking! ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #00FF66; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .earnings { font-size: 1.5rem; color: #00CC52; font-weight: bold; text-align: right; margin-top: 15px; }
            .driver-info { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { background: #000000; color: #00FF66; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; }
            .next-steps { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: #00FF66;">New Booking!</h1>
              <p style="margin: 0; color: #ffffff; opacity: 0.85;">Payment has been processed</p>
            </div>

            <div class="content">
              <h2>Hi ${host.firstName},</h2>
              <p>Great news! You have a new confirmed booking for your vehicle!</p>

              <div class="booking-card">
                <div style="background: #f0fdf4; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #00CC52;">${booking.reservationId || booking._id}</span>
                </div>
                ${vehicleImageUrl ? `
                <div style="text-align: center; margin-bottom: 15px;">
                  <img src="${vehicleImageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" style="max-width: 100%; height: auto; max-height: 200px; border-radius: 8px; object-fit: cover;" />
                </div>
                ` : ''}
                <h3 style="margin-top: 0; color: #000000;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="detail-row">
                  <span class="label">Pick-up Date</span>
                  <span class="value">${startDate} at ${pickupTime}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Return Date</span>
                  <span class="value">${endDate} at ${dropoffTime}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Duration</span>
                  <span class="value">${booking.totalDays} day(s)</span>
                </div>
                <div class="detail-row">
                  <span class="label">Pickup Location</span>
                  <span class="value">
                    ${vehicle.location?.address ? `${vehicle.location.address}<br>` : ''}${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'} ${vehicle.location?.zipCode || ''}
                  </span>
                </div>

                <div class="earnings">Earnings: $${booking.totalPrice.toFixed(2)}</div>
              </div>

              <div class="driver-info">
                <h4 style="margin-top: 0; color: #1d4ed8;">Driver Information</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${driver.firstName} ${driver.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${driver.email}</p>
                ${driver.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${driver.phone}</p>` : ''}
              </div>

              <div class="next-steps">
                <h4 style="margin-top: 0; color: #059669;">Next Steps</h4>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Ensure your vehicle is clean and ready</li>
                  <li>Confirm the pick-up location with the driver</li>
                  <li>Have all necessary documents ready</li>
                </ul>
              </div>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/host/bookings" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View Bookings
                </a>
              </center>
            </div>

            <div class="footer">
              <p>© ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p>Booking ID: ${booking._id}</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${host.firstName},

Great news! You have a new confirmed booking for your vehicle!

Reservation ID: ${booking.reservationId || booking._id}

Booking Details:
- Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Pick-up Date: ${startDate} at ${pickupTime}
- Return Date: ${endDate} at ${dropoffTime}
- Duration: ${booking.totalDays} day(s)
- Pickup Location: ${vehicle.location?.address ? `${vehicle.location.address}, ` : ''}${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'} ${vehicle.location?.zipCode || ''}
- Earnings: $${booking.totalPrice.toFixed(2)}

Driver Information:
- Name: ${driver.firstName} ${driver.lastName}
- Email: ${driver.email}${driver.phone ? `\n- Phone: ${driver.phone}` : ''}

Next Steps:
- Ensure your vehicle is clean and ready
- Confirm the pick-up location with the driver
- Have all necessary documents ready

Congratulations on your booking!

Best regards,
The RentUFS Team
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Booking notification email sent to host:', host.email);
      if (result.messageId) console.log('Message ID:', result.messageId);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending booking notification to host:', error);
    return { success: false, error: error.message };
  }
};

// Send return reminder email to driver (1 hour before reservation ends)
const sendReturnReminderEmail = async (driver, booking, vehicle, host) => {
  try {
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dropoffTime = formatTime12h(booking.dropoffTime || booking.pickupTime);
    const vehicleImageUrl = getVehicleImageUrl(vehicle);

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Return Reminder Email to Driver: ${driver.email}`);
      return { success: true, dev: true };
    }

    const mailOptions = {
      to: driver.email,
      subject: `Reminder: Your ${vehicle.year} ${vehicle.make} ${vehicle.model} rental ends soon!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .clock-icon { font-size: 3rem; margin-bottom: 10px; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #f59e0b; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .options { display: flex; gap: 15px; margin: 25px 0; }
            .option-card { flex: 1; background: white; padding: 20px; border-radius: 8px; text-align: center; border: 2px solid #e5e7eb; }
            .option-card.extend { border-color: #10b981; }
            .option-card.return { border-color: #3b82f6; }
            .button { padding: 12px 25px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold; }
            .button-extend { background: #10b981; color: white; }
            .button-return { background: #3b82f6; color: white; }
            .host-info { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .reminders { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="padding: 0; border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
              <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
                <div style="color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.15em;">RentUFS</div>
              </div>
              <div style="background: #f59e0b; padding: 18px 20px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 1.5rem;">⏰ Rental Ending Soon!</h1>
                <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95); font-size: 0.95rem;">Your reservation ends in about 1 hour</p>
              </div>
            </div>

            <div class="content">
              <h2>Hi ${driver.firstName},</h2>
              <p>This is a friendly reminder that your rental period is ending soon!</p>

              <div class="booking-card">
                <div style="background: #fef3c7; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #d97706;">${booking.reservationId || booking._id}</span>
                </div>
                ${vehicleImageUrl ? `
                <div style="text-align: center; margin-bottom: 15px;">
                  <img src="${vehicleImageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" style="max-width: 100%; height: auto; max-height: 200px; border-radius: 8px; object-fit: cover;" />
                </div>
                ` : ''}
                <h3 style="margin-top: 0; color: #d97706;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="detail-row">
                  <span class="label">Return Date</span>
                  <span class="value">${endDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Return Time</span>
                  <span class="value" style="color: #dc2626; font-size: 1.1rem;">${dropoffTime}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Return Location</span>
                  <span class="value">
                    ${vehicle.location?.address ? `${vehicle.location.address}<br>` : ''}${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'} ${vehicle.location?.zipCode || ''}
                  </span>
                </div>
              </div>

              <h3 style="text-align: center; color: #374151;">What would you like to do?</h3>

              <div class="options">
                <div class="option-card extend">
                  <h4 style="margin: 0 0 10px 0; color: #059669;">Need More Time?</h4>
                  <p style="font-size: 0.9rem; color: #6b7280; margin: 0 0 15px 0;">Extend your rental from your dashboard</p>
                  <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings" class="button button-extend">
                    Extend Rental
                  </a>
                </div>
                <div class="option-card return">
                  <h4 style="margin: 0 0 10px 0; color: #1d4ed8;">Ready to Return?</h4>
                  <p style="font-size: 0.9rem; color: #6b7280; margin: 0 0 15px 0;">Complete the return inspection</p>
                  <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                    Return Vehicle
                  </a>
                </div>
              </div>

              <div style="background: #fff7ed; border: 1px solid #f59e0b; border-radius: 8px; padding: 14px 16px; margin: 20px 0;">
                <p style="margin: 0; color: #b45309; font-size: 0.9rem;">
                  ⏰ <strong>Please return or extend on time.</strong> If the vehicle isn't returned or extended by your return time, an automatic late fee of <strong>$5/day plus one day of insurance</strong> applies for each day it's late.
                </p>
              </div>

              <div class="reminders">
                <h4 style="margin-top: 0; color: #b45309;">Before You Return</h4>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Return the vehicle with the same fuel level</li>
                  <li>Complete the return inspection photos in the app</li>
                  <li>Remove all personal belongings from the vehicle</li>
                  <li>Return on time to avoid late fees</li>
                </ul>
              </div>

              <div class="host-info">
                <h4 style="margin-top: 0; color: #1d4ed8;">Need Help? Contact Your Host</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${host.firstName} ${host.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${host.email}</p>
                ${host.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${host.phone}</p>` : ''}
              </div>
            </div>

            <div class="footer">
              <p>© ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p>Booking ID: ${booking._id}</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${driver.firstName},

This is a friendly reminder that your rental period is ending soon!

Reservation ID: ${booking.reservationId || booking._id}

Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
Return Date: ${endDate}
Return Time: ${dropoffTime}

Return Location:
${vehicle.location?.address ? `${vehicle.location.address}\n` : ''}${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'} ${vehicle.location?.zipCode || ''}

Options:
1. EXTEND YOUR RENTAL - Need more time? You can extend your booking from your dashboard.
2. RETURN THE VEHICLE - Please return the vehicle on time to avoid late fees.

Important Reminders:
- Return the vehicle with the same fuel level
- Complete the return inspection photos
- Remove all personal belongings

Need to extend? Visit: ${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings

If you have any questions, contact your host:
- Name: ${host.firstName} ${host.lastName}
- Email: ${host.email}
- Phone: ${host.phone || 'Not provided'}

Thank you for choosing RentUFS!

Best regards,
The RentUFS Team
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Return reminder email sent to driver:', driver.email);
      if (result.messageId) console.log('Message ID:', result.messageId);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending return reminder email:', error);
    return { success: false, error: error.message };
  }
};

// Helper to get absolute vehicle image URL
const getVehicleImageUrl = (vehicle) => {
  const img = vehicle?.images?.[0];
  if (!img) return null;
  if (img.startsWith('http')) return img;
  const apiUrl = process.env.API_URL || process.env.CLIENT_URL?.replace(/:\d+$/, ':5000') || 'http://localhost:5000';
  return `${apiUrl}${img}`;
};

// Send booking extension confirmation email to driver and host
const sendBookingExtensionEmail = async (driver, host, booking, vehicle) => {
  try {
    const newEndDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const pickupTime = formatTime12h(booking.pickupTime);
    const dropoffTime = formatTime12h(booking.dropoffTime || booking.pickupTime);
    const vehicleImageUrl = getVehicleImageUrl(vehicle);
    const lastExtension = booking.extensions?.[booking.extensions.length - 1];
    const extensionDays = lastExtension?.days || 0;
    const extensionCost = lastExtension?.cost || 0;

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Booking Extension Email to: ${driver.email}, ${host.email}`);
      return { success: true, dev: true };
    }

    const emailStyles = `
      body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
      .container { max-width: 600px; margin: 0 auto; padding: 20px; }
      .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
      .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
      .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
      .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
      .detail-row:last-child { border-bottom: none; }
      .label { color: #6b7280; }
      .value { font-weight: bold; color: #111827; }
      .extension-badge { background: #dbeafe; color: #1d4ed8; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold; font-size: 0.9rem; }
      .updated { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
      .button { background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; }
      .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
    `;

    const bookingDetailsHtml = `
      <div class="booking-card">
        <div style="background: #dbeafe; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
          <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
          <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #1d4ed8;">${booking.reservationId || booking._id}</span>
        </div>
        ${vehicleImageUrl ? `
        <div style="text-align: center; margin-bottom: 15px;">
          <img src="${vehicleImageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" style="max-width: 100%; height: auto; max-height: 200px; border-radius: 8px; object-fit: cover;" />
        </div>
        ` : ''}
        <h3 style="margin-top: 0; color: #1d4ed8;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

        <div class="detail-row">
          <span class="label">Pick-up Date</span>
          <span class="value">${startDate}</span>
        </div>
        <div class="detail-row">
          <span class="label">New Return Date</span>
          <span class="value" style="color: #2563eb;">${newEndDate}</span>
        </div>
        <div class="detail-row">
          <span class="label">Pick-up Time</span>
          <span class="value">${pickupTime}</span>
        </div>
        <div class="detail-row">
          <span class="label">Drop-off Time</span>
          <span class="value">${dropoffTime}</span>
        </div>
        <div class="detail-row">
          <span class="label">Total Duration</span>
          <span class="value">${booking.totalDays} day(s)</span>
        </div>
        <div class="detail-row">
          <span class="label">Extension Added</span>
          <span class="value" style="color: #2563eb;">+${extensionDays} day(s)</span>
        </div>
        <div class="detail-row">
          <span class="label">Extension Cost</span>
          <span class="value">$${extensionCost.toFixed(2)}</span>
        </div>
        <div style="font-size: 1.3rem; color: #10b981; font-weight: bold; text-align: right; margin-top: 15px; padding-top: 10px; border-top: 2px solid #e5e7eb;">
          New Total: $${booking.totalPrice.toFixed(2)}
        </div>
      </div>
    `;

    const textContent = `
Reservation ${booking.reservationId || booking._id} has been extended.

Updated Booking Details:
- Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Pick-up Date: ${startDate}
- New Return Date: ${newEndDate}
- Pick-up Time: ${pickupTime}
- Drop-off Time: ${dropoffTime}
- Total Duration: ${booking.totalDays} day(s)
- Extension: +${extensionDays} day(s)
- Extension Cost: $${extensionCost.toFixed(2)}
- New Total: $${booking.totalPrice.toFixed(2)}
    `;

    // Email to driver
    const driverMail = {
      to: driver.email,
      subject: `Booking Extended - ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><style>${emailStyles}</style></head>
        <body>
          <div class="container">
            <div class="header" style="padding: 0; border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
              <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
                <div style="color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.15em;">RentUFS</div>
              </div>
              <div style="background: #3b82f6; padding: 18px 20px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 1.5rem;">Booking Extended!</h1>
                <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95); font-size: 0.95rem;">Your rental has been extended by ${extensionDays} day(s)</p>
              </div>
            </div>
            <div class="content">
              <h2>Hi ${driver.firstName},</h2>
              <p>Your booking extension has been confirmed and payment processed!</p>
              <div style="text-align: center; margin: 15px 0;">
                <span class="extension-badge">+${extensionDays} Day(s) Added</span>
              </div>

              ${bookingDetailsHtml}

              <div class="updated">
                <h4 style="margin-top: 0; color: #059669;">Updated Information</h4>
                <p style="margin: 5px 0;">Your new return date is <strong>${newEndDate}</strong>.</p>
                <p style="margin: 5px 0;">Please return the vehicle by <strong>${dropoffTime}</strong> on the new return date.</p>
              </div>

              <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin-top: 0; color: #1d4ed8;">Host Contact</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${host.firstName} ${host.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${host.email}</p>
                ${host.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${host.phone}</p>` : ''}
              </div>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View My Bookings
                </a>
              </center>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${driver.firstName},\n\nYour booking has been extended by ${extensionDays} day(s).\n${textContent}\nHost: ${host.firstName} ${host.lastName} (${host.email})${host.phone ? `\nPhone: ${host.phone}` : ''}\n\nThank you for choosing RentUFS!\nThe RentUFS Team`
    };

    // Email to host
    const hostMail = {
      to: host.email,
      subject: `Booking Extended - ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head><style>${emailStyles}</style></head>
        <body>
          <div class="container">
            <div class="header" style="padding: 0; border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
              <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
                <div style="color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.15em;">RentUFS</div>
              </div>
              <div style="background: #3b82f6; padding: 18px 20px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 1.5rem;">Booking Extended!</h1>
                <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95); font-size: 0.95rem;">A rental has been extended by ${extensionDays} day(s)</p>
              </div>
            </div>
            <div class="content">
              <h2>Hi ${host.firstName},</h2>
              <p>Your renter has extended their booking. Payment has been processed.</p>
              <div style="text-align: center; margin: 15px 0;">
                <span class="extension-badge">+${extensionDays} Day(s) Added</span>
              </div>

              ${bookingDetailsHtml}

              <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin-top: 0; color: #1d4ed8;">Driver Information</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${driver.firstName} ${driver.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${driver.email}</p>
                ${driver.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${driver.phone}</p>` : ''}
              </div>

              <div class="updated">
                <h4 style="margin-top: 0; color: #059669;">What This Means</h4>
                <p style="margin: 5px 0;">The vehicle will now be returned on <strong>${newEndDate}</strong> by <strong>${dropoffTime}</strong>.</p>
                <p style="margin: 5px 0;">Additional earnings: <strong>$${extensionCost.toFixed(2)}</strong></p>
              </div>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/host/bookings" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View Bookings
                </a>
              </center>
            </div>
            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${host.firstName},\n\nA booking for your ${vehicle.year} ${vehicle.make} ${vehicle.model} has been extended by ${extensionDays} day(s).\n${textContent}\nDriver: ${driver.firstName} ${driver.lastName} (${driver.email})${driver.phone ? `\nPhone: ${driver.phone}` : ''}\n\nThe RentUFS Team`
    };

    // Send both emails
    const [driverResult, hostResult] = await Promise.all([
      sendEmail(driverMail),
      sendEmail(hostMail)
    ]);

    if (driverResult.success) {
      console.log('✅ Extension email sent to driver:', driver.email);
    }
    if (hostResult.success) {
      console.log('✅ Extension email sent to host:', host.email);
    }
    return { success: true, driverResult, hostResult };
  } catch (error) {
    console.error('❌ Error sending extension email:', error);
    return { success: false, error: error.message };
  }
};

// Send booking cancellation email to driver (cancelled by host with full refund)
const sendBookingCancellationEmail = async (driver, host, booking, vehicle, reason) => {
  try {
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const vehicleImageUrl = getVehicleImageUrl(vehicle);
    const wasRefunded = booking.paymentStatus === 'refunded';

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Booking Cancellation Email to Driver: ${driver.email}`);
      return { success: true, dev: true };
    }

    const mailOptions = {
      to: driver.email,
      subject: `Reservation Cancelled - ${vehicle.year} ${vehicle.make} ${vehicle.model}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .refund-notice { background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; text-align: center; }
            .reason-box { background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="padding: 0; border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
              <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
                <div style="color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.15em;">RentUFS</div>
              </div>
              <div style="background: #ef4444; padding: 18px 20px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 1.5rem;">Reservation Cancelled</h1>
                <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95); font-size: 0.95rem;">Your booking has been cancelled by the host</p>
              </div>
            </div>

            <div class="content">
              <h2>Hi ${driver.firstName},</h2>
              <p>We're sorry to inform you that the host has cancelled your reservation.</p>

              ${wasRefunded ? `
              <div class="refund-notice">
                <h3 style="margin: 0 0 10px 0; color: #059669;">Full Refund Processed</h3>
                <p style="font-size: 1.5rem; font-weight: bold; color: #10b981; margin: 0;">$${booking.totalPrice.toFixed(2)}</p>
                <p style="font-size: 0.85rem; color: #6b7280; margin: 10px 0 0 0;">The refund will appear on your original payment method within 5-10 business days.</p>
              </div>
              ` : ''}

              ${reason ? `
              <div class="reason-box">
                <h4 style="margin-top: 0; color: #dc2626;">Cancellation Reason</h4>
                <p style="margin: 0;">${reason}</p>
              </div>
              ` : ''}

              <div class="booking-card">
                <div style="background: #fef2f2; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #dc2626;">${booking.reservationId || booking._id}</span>
                </div>
                ${vehicleImageUrl ? `
                <div style="text-align: center; margin-bottom: 15px;">
                  <img src="${vehicleImageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" style="max-width: 100%; height: auto; max-height: 200px; border-radius: 8px; object-fit: cover;" />
                </div>
                ` : ''}
                <h3 style="margin-top: 0; color: #dc2626;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="detail-row">
                  <span class="label">Pick-up Date</span>
                  <span class="value" style="text-decoration: line-through; color: #9ca3af;">${startDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Return Date</span>
                  <span class="value" style="text-decoration: line-through; color: #9ca3af;">${endDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Duration</span>
                  <span class="value">${booking.totalDays} day(s)</span>
                </div>
                <div class="detail-row">
                  <span class="label">Status</span>
                  <span class="value" style="color: #dc2626;">Cancelled</span>
                </div>
              </div>

              <p>We apologize for the inconvenience. You're welcome to browse other vehicles on our marketplace and book a new rental.</p>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/marketplace" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  Browse Vehicles
                </a>
              </center>

              <p style="margin-top: 30px; font-size: 0.9rem; color: #6b7280;">
                If you have any questions about the cancellation or refund, please contact us.
              </p>
            </div>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${driver.firstName},\n\nYour reservation (${booking.reservationId || booking._id}) for ${vehicle.year} ${vehicle.make} ${vehicle.model} has been cancelled by the host.\n${reason ? `Reason: ${reason}\n` : ''}${wasRefunded ? `A full refund of $${booking.totalPrice.toFixed(2)} has been processed and will appear within 5-10 business days.\n` : ''}\nDates: ${startDate} - ${endDate}\n\nYou can browse other vehicles at: ${process.env.CLIENT_URL || 'http://localhost:3000'}/marketplace\n\nThe RentUFS Team`
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Cancellation email sent to driver:', driver.email);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending cancellation email:', error);
    return { success: false, error: error.message };
  }
};

// Send email verification code for email change
const sendEmailVerificationCode = async (toEmail, firstName, code) => {
  try {
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';

    const mailOptions = {
      to: toEmail,
      subject: 'Verify Your New Email Address - RentUFS',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2.5rem; font-weight: bold; letter-spacing: 0.15em; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .code-box { background: #000000; color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.5em; text-align: center; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: white;">Email Verification</h1>
            </div>
            <div class="content">
              <h2>Hi ${firstName},</h2>
              <p>You requested to change your email address to <strong>${toEmail}</strong>.</p>
              <p>Enter this verification code to confirm your new email:</p>
              <div class="code-box">${code}</div>
              <p style="color: #6b7280; font-size: 0.9rem;">This code expires in <strong>15 minutes</strong>.</p>
              <p style="color: #6b7280; font-size: 0.9rem;">If you didn't request this change, please ignore this email. Your current email will remain unchanged.</p>
            </div>
            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${firstName},\n\nYour email verification code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you didn't request this change, please ignore this email.`
    };

    const result = await sendEmail(mailOptions);
    console.log('📧 Email verification code sent to:', toEmail);
    return result;
  } catch (error) {
    console.error('❌ Error sending verification email:', error);
    return { success: false, error: error.message };
  }
};

const sendRegistrationOtp = async (toEmail, code) => {
  try {
    const mailOptions = {
      to: toEmail,
      subject: 'Your RentUFS Verification Code',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2.5rem; font-weight: bold; letter-spacing: 0.15em; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .code-box { background: #000000; color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.5em; text-align: center; padding: 20px; border-radius: 8px; margin: 20px 0; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: white;">Verify Your Email</h1>
            </div>
            <div class="content">
              <h2>Welcome to RentUFS!</h2>
              <p>Enter this verification code to confirm your email address and complete your registration:</p>
              <div class="code-box">${code}</div>
              <p style="color: #6b7280; font-size: 0.9rem;">This code expires in <strong>10 minutes</strong>.</p>
              <p style="color: #6b7280; font-size: 0.9rem;">If you didn't request this, please ignore this email.</p>
            </div>
            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Welcome to RentUFS!\n\nYour verification code is: ${code}\n\nThis code expires in 10 minutes.\n\nIf you didn't request this, please ignore this email.`
    };

    const result = await sendEmail(mailOptions);
    console.log('📧 Registration OTP sent to:', toEmail);
    return result;
  } catch (error) {
    console.error('❌ Error sending registration OTP email:', error);
    return { success: false, error: error.message };
  }
};

const sendRegistrationExpirationReminder = async (host, vehicle) => {
  try {
    const expirationDate = new Date(vehicle.registrationExpiration).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const dashboardUrl = `${process.env.CLIENT_URL || 'http://localhost:3000'}/host/edit-vehicle/${vehicle._id}`;

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Registration Expiration Reminder to Host: ${host.email} (${vehicleName})`);
      return { success: true, dev: true };
    }

    const subject = `Registration Expiring Soon: ${vehicleName}`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000; color: #fff; border-radius: 12px; overflow: hidden; border: 3px solid #00FF66;">
        <div style="background: #000000; padding: 24px 20px 14px; text-align: center;">
          <h1 style="margin: 0; font-size: 26px; font-weight: bold; letter-spacing: 0.15em; color: #00FF66;">RentUFS</h1>
        </div>
        <div style="background: #f59e0b; padding: 18px 20px; text-align: center;">
          <h2 style="margin: 0; color: #ffffff; font-size: 1.4rem;">Registration Expiring Soon</h2>
          <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95); font-size: 0.95rem;">Action needed on your vehicle</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #f59e0b; margin-top: 0;">⚠️ Registration Expiring Soon</h2>
          <p style="color: #ffffff; line-height: 1.6;">
            Hi ${host.firstName},
          </p>
          <p style="color: #ffffff; line-height: 1.6;">
            The vehicle registration for your <strong style="color: #fff;">${vehicleName}</strong> is expiring on <strong style="color: #f59e0b;">${expirationDate}</strong>.
          </p>
          <p style="color: #ffffff; line-height: 1.6;">
            Please renew your registration and upload the updated document to keep your vehicle listing active on RentUFS.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="background: #10b981; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
              Update Registration
            </a>
          </div>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #10b981; margin-top: 0; font-size: 14px; text-transform: uppercase;">Vehicle Details</h3>
            <p style="color: #ffffff; margin: 5px 0;"><strong>Vehicle:</strong> ${vehicleName}</p>
            <p style="color: #ffffff; margin: 5px 0;"><strong>VIN:</strong> ${vehicle.vin || 'N/A'}</p>
            <p style="color: #ffffff; margin: 5px 0;"><strong>Registration Expires:</strong> <span style="color: #f59e0b;">${expirationDate}</span></p>
          </div>
          <p style="color: #cccccc; font-size: 13px; line-height: 1.5;">
            Vehicles with expired registrations may be temporarily delisted from the marketplace. Please update your registration as soon as possible.
          </p>
        </div>
        <div style="background: #00FF66; padding: 20px; text-align: center; color: #000000;">
          <p style="margin: 0; font-size: 0.9rem;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
          <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
        </div>
      </div>
    `;

    const mailOptions = {
      to: host.email,
      subject,
      html,
      text: `Hi ${host.firstName},\n\nThe vehicle registration for your ${vehicleName} is expiring on ${expirationDate}.\n\nPlease renew your registration and upload the updated document to keep your vehicle listing active on RentUFS.\n\nUpdate your registration at: ${dashboardUrl}\n\nVehicle: ${vehicleName}\nVIN: ${vehicle.vin || 'N/A'}\nExpires: ${expirationDate}\n\nThe RentUFS Team`
    };

    const result = await sendEmail(mailOptions);
    console.log(`📧 Registration expiration reminder sent to ${host.email} for ${vehicleName}`);
    return result;
  } catch (error) {
    console.error('❌ Error sending registration expiration reminder:', error);
    return { success: false, error: error.message };
  }
};

// Sent when the platform auto-pauses a host's vehicle because its registration
// fully expired. Tells them to update the registration to relist it.
const sendVehiclePausedEmail = async (host, vehicle) => {
  try {
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Vehicle Paused Email to Host: ${host.email}`);
      return { success: true, dev: true };
    }
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const vehicleName = `${vehicle.year} ${vehicle.make} ${vehicle.model}`;
    const expDate = vehicle.registrationExpiration
      ? new Date(vehicle.registrationExpiration).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
      : 'recently';
    return await sendEmail({
      to: host.email,
      subject: `Action needed: ${vehicleName} paused — registration expired`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
            <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
              <div style="font-size: 1.6rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66;">RentUFS</div>
            </div>
            <div style="background: #f59e0b; padding: 18px 20px; text-align: center;">
              <h2 style="margin: 0; color: #ffffff;">Vehicle Paused — Registration Expired</h2>
            </div>
          </div>
          <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>Hi ${host.firstName || 'there'},</p>
            <p>Your <strong>${vehicleName}</strong> has been temporarily paused from the marketplace because its registration expired on <strong>${expDate}</strong>.</p>
            <p>For safety and insurance compliance, vehicles with expired registration can't accept new bookings. <strong>Any active rentals are not affected.</strong></p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${clientUrl}/host/dashboard" style="background: #10b981; color: #ffffff; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: bold;">Update Registration</a>
            </p>
            <p style="font-size: 0.85rem; color: #6b7280;">Once you enter a valid registration date, your vehicle will automatically relist — no extra steps needed.</p>
          </div>
          <div style="background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; border-radius: 0 0 8px 8px;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
            <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
          </div>
        </div>
      `,
      text: `Hi ${host.firstName || 'there'},

Your ${vehicleName} has been paused from the marketplace because its registration expired on ${expDate}.

Vehicles with expired registration can't accept new bookings (active rentals are not affected). Update your registration to bring it back online — it will automatically relist.

Update here: ${clientUrl}/host/dashboard
`
    });
  } catch (error) {
    console.error('❌ Error sending vehicle paused email:', error);
    return { success: false, error: error.message };
  }
};

// Send password reset email
const sendPasswordResetEmail = async (user, resetToken) => {
  try {
    if (!isEmailConfigured()) {
      const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
      console.log(`📧 [DEV] Password Reset Email to: ${user.email}`);
      console.log(`📧 [DEV] Reset link: ${clientUrl}/reset-password/${resetToken}`);
      console.log('⚠️  No email service configured (set SENDGRID_API_KEY, EMAIL_SERVICE, or SMTP_HOST)');
      return { success: false, dev: true };
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const resetUrl = `${clientUrl}/reset-password/${resetToken}`;

    const mailOptions = {
      to: user.email,
      subject: 'Reset Your RentUFS Password',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; margin: 0; padding: 0; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2.5rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .button { background: #000000; color: #00FF66; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; font-size: 1.1rem; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
            .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 12px 16px; border-radius: 4px; margin: 20px 0; font-size: 0.9rem; color: #856404; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: #00FF66;">Password Reset</h1>
            </div>

            <div class="content">
              <h2>Hi ${user.firstName},</h2>

              <p>We received a request to reset the password for your RentUFS account.</p>

              <p>Click the button below to set a new password:</p>

              <center>
                <a href="${resetUrl}" class="button" style="background: #10b981; color: #ffffff; padding: 14px 35px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; font-size: 1.1rem;">
                  Reset My Password
                </a>
              </center>

              <div class="warning">
                This link will expire in <strong>1 hour</strong>. If you didn't request a password reset, you can safely ignore this email — your password will remain unchanged.
              </div>

              <p style="margin-top: 20px; font-size: 0.85rem; color: #6b7280;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${resetUrl}" style="color: #10b981; word-break: break-all;">${resetUrl}</a>
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `Hi ${user.firstName},\n\nWe received a request to reset the password for your RentUFS account.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 1 hour.\n\nIf you didn't request a password reset, you can safely ignore this email.\n\nThe RentUFS Team`
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Password reset email sent to:', user.email);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending password reset email:', error);
    return { success: false, error: error.message };
  }
};

// Send payout notification email to host when earnings are transferred
const sendPayoutNotificationEmail = async (host, payoutDetails) => {
  try {
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Payout Notification Email to: ${host.email}`);
      return { success: true, dev: true };
    }

    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const payoutDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    // Build booking breakdown rows for batch payouts
    let bookingRows = '';
    if (payoutDetails.bookings && payoutDetails.bookings.length > 0) {
      bookingRows = payoutDetails.bookings.map(b => `
        <tr>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; font-family: monospace; color: #10b981;">${b.reservationId || 'N/A'}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb;">${b.vehicle || 'N/A'}${b.note ? `<br><span style="font-size: 0.75rem; color: #6b7280;">${b.note}</span>` : ''}</td>
          <td style="padding: 8px 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold;">$${b.amount.toFixed(2)}</td>
        </tr>
      `).join('');
    }

    const mailOptions = {
      to: host.email,
      subject: `Payout Sent - $${payoutDetails.totalAmount.toFixed(2)} on the Way!`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .payout-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .amount-display { font-size: 2rem; color: #10b981; font-weight: bold; text-align: center; padding: 15px 0; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .info-box { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="border: 3px solid #00FF66; border-bottom: none;">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 15px; color: #00FF66;">Payout On The Way!</h1>
              <p style="margin: 0; opacity: 0.9;">Your earnings have been transferred</p>
            </div>

            <div class="content">
              <h2>Hi ${host.firstName},</h2>
              <p>Great news! Your earnings have been transferred to your connected payout account.</p>

              <div class="payout-card">
                <div class="amount-display">$${payoutDetails.totalAmount.toFixed(2)}</div>

                <div class="detail-row">
                  <span class="label">Date</span>
                  <span class="value">${payoutDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Bookings</span>
                  <span class="value">${payoutDetails.bookingCount} reservation${payoutDetails.bookingCount !== 1 ? 's' : ''}</span>
                </div>
                ${payoutDetails.transferId ? `
                <div class="detail-row">
                  <span class="label">Transfer ID</span>
                  <span class="value" style="font-family: monospace; font-size: 0.85rem;">${payoutDetails.transferId}</span>
                </div>
                ` : ''}
              </div>

              ${bookingRows ? `
              <h3 style="color: #374151; margin-bottom: 10px;">Booking Breakdown</h3>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 8px; overflow: hidden;">
                <thead>
                  <tr style="background: #f3f4f6;">
                    <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 0.85rem;">Reservation</th>
                    <th style="padding: 10px 12px; text-align: left; color: #6b7280; font-size: 0.85rem;">Vehicle</th>
                    <th style="padding: 10px 12px; text-align: right; color: #6b7280; font-size: 0.85rem;">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  ${bookingRows}
                </tbody>
              </table>
              ` : ''}

              <div class="info-box">
                <h4 style="margin-top: 0; color: #059669;">When will I receive this?</h4>
                <p style="margin: 5px 0;">Funds have been transferred to your Stripe account. From there, Stripe will automatically deposit to your bank account within 2-3 business days, depending on your banking institution.</p>
              </div>

              <center>
                <a href="${clientUrl}/host/payouts" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View Payout History
                </a>
              </center>
            </div>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log(`✅ Payout notification email sent to: ${host.email} ($${payoutDetails.totalAmount.toFixed(2)})`);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending payout notification email:', error);
    return { success: false, error: error.message };
  }
};

// Internal alert: a single host's weekly payout failed mid-run.
// Sent to SUPPORT_EMAIL so the team can investigate before the next run.
const sendPayoutFailureAlert = async ({ host, attemptedAmount, errorMessage, bookings = [] }) => {
  try {
    const supportEmail = process.env.SUPPORT_EMAIL;
    if (!supportEmail) {
      console.warn('⚠️ SUPPORT_EMAIL not configured — skipping payout failure alert');
      return { success: false, skipped: true };
    }

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Payout Failure Alert to: ${supportEmail} (host ${host._id})`);
      return { success: true, dev: true };
    }

    const hostName = `${host.firstName || ''} ${host.lastName || ''}`.trim() || 'Unknown';
    const amount = (attemptedAmount || 0).toFixed(2);
    const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    const bookingRows = bookings.map(b => `
      <tr>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; font-family: monospace;">${b.reservationId || b.bookingId || 'N/A'}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb;">${b.type || 'N/A'}</td>
        <td style="padding: 6px 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${(b.amount || 0).toFixed(2)}</td>
      </tr>
    `).join('');

    const mailOptions = {
      to: supportEmail,
      subject: `[ALERT] Weekly payout failed for ${hostName} ($${amount})`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
          <div style="max-width: 640px; margin: 0 auto; padding: 20px;">
            <div style="background: #dc2626; color: white; padding: 16px 20px; border-radius: 6px 6px 0 0;">
              <h2 style="margin: 0;">Weekly payout failed</h2>
              <p style="margin: 4px 0 0 0; opacity: 0.9; font-size: 0.9rem;">Internal alert · Action required</p>
            </div>
            <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 6px 6px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #6b7280; width: 160px;">Host</td><td style="padding: 6px 0;"><strong>${hostName}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Host email</td><td style="padding: 6px 0;">${host.email || 'N/A'}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Host ID</td><td style="padding: 6px 0; font-family: monospace; font-size: 0.85rem;">${host._id}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Stripe Connect ID</td><td style="padding: 6px 0; font-family: monospace; font-size: 0.85rem;">${host.stripeConnectAccountId || 'N/A'}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Attempted amount</td><td style="padding: 6px 0;"><strong>$${amount}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Bookings affected</td><td style="padding: 6px 0;">${bookings.length}</td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">When (ET)</td><td style="padding: 6px 0;">${when}</td></tr>
              </table>

              <h3 style="margin: 20px 0 8px 0; color: #374151;">Error</h3>
              <pre style="background: #fef2f2; border: 1px solid #fecaca; padding: 12px; border-radius: 4px; white-space: pre-wrap; word-break: break-word; font-size: 0.85rem; color: #991b1b;">${(errorMessage || 'No error message').toString()}</pre>

              ${bookingRows ? `
              <h3 style="margin: 20px 0 8px 0; color: #374151;">Affected bookings</h3>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px;">
                <thead>
                  <tr style="background: #f3f4f6;">
                    <th style="padding: 8px 10px; text-align: left; font-size: 0.85rem; color: #6b7280;">Reservation</th>
                    <th style="padding: 8px 10px; text-align: left; font-size: 0.85rem; color: #6b7280;">Type</th>
                    <th style="padding: 8px 10px; text-align: right; font-size: 0.85rem; color: #6b7280;">Amount</th>
                  </tr>
                </thead>
                <tbody>${bookingRows}</tbody>
              </table>` : ''}

              <p style="margin-top: 20px; font-size: 0.85rem; color: #6b7280;">
                The booking payoutStatus was NOT updated, so this payout will be retried on the next weekly run.
                Investigate the host's Stripe Connect account state before then.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log(`📧 Payout failure alert sent to ${supportEmail} for host ${host._id}`);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending payout failure alert:', error);
    return { success: false, error: error.message };
  }
};

// Internal digest: end-of-run summary covering successes and failures.
// Sent to SUPPORT_EMAIL after each weekly payout run, only if there were any failures.
const sendPayoutRunSummaryEmail = async ({ totalHosts, hostsSucceeded, hostsFailed, totalTransferred, failures = [] }) => {
  try {
    const supportEmail = process.env.SUPPORT_EMAIL;
    if (!supportEmail) {
      console.warn('⚠️ SUPPORT_EMAIL not configured — skipping payout run summary');
      return { success: false, skipped: true };
    }

    if (failures.length === 0) {
      return { success: true, skipped: true };
    }

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Payout Run Summary to: ${supportEmail} (${hostsFailed} failures)`);
      return { success: true, dev: true };
    }

    const when = new Date().toLocaleString('en-US', { timeZone: 'America/New_York' });

    const failureRows = failures.map(f => `
      <tr>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb;">${f.hostName || 'Unknown'}<br><span style="font-size: 0.75rem; color: #6b7280; font-family: monospace;">${f.hostId}</span></td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">$${(f.attemptedAmount || 0).toFixed(2)}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; text-align: right;">${f.bookingCount || 0}</td>
        <td style="padding: 8px 10px; border-bottom: 1px solid #e5e7eb; font-size: 0.85rem; color: #991b1b;">${(f.errorMessage || '').toString().slice(0, 120)}</td>
      </tr>
    `).join('');

    const mailOptions = {
      to: supportEmail,
      subject: `[Summary] Weekly payout run — ${hostsFailed} failure${hostsFailed === 1 ? '' : 's'}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; color: #111827; line-height: 1.5;">
          <div style="max-width: 720px; margin: 0 auto; padding: 20px;">
            <div style="background: #f59e0b; color: white; padding: 16px 20px; border-radius: 6px 6px 0 0;">
              <h2 style="margin: 0;">Weekly payout run — summary</h2>
              <p style="margin: 4px 0 0 0; opacity: 0.95; font-size: 0.9rem;">${when} ET</p>
            </div>
            <div style="background: #f9fafb; padding: 20px; border-radius: 0 0 6px 6px;">
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 6px 0; color: #6b7280; width: 220px;">Total eligible hosts</td><td style="padding: 6px 0;"><strong>${totalHosts}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Succeeded</td><td style="padding: 6px 0; color: #059669;"><strong>${hostsSucceeded}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Failed</td><td style="padding: 6px 0; color: #dc2626;"><strong>${hostsFailed}</strong></td></tr>
                <tr><td style="padding: 6px 0; color: #6b7280;">Total transferred</td><td style="padding: 6px 0;"><strong>$${(totalTransferred || 0).toFixed(2)}</strong></td></tr>
              </table>

              <h3 style="margin: 20px 0 8px 0; color: #374151;">Failures</h3>
              <table style="width: 100%; border-collapse: collapse; background: white; border-radius: 4px;">
                <thead>
                  <tr style="background: #f3f4f6;">
                    <th style="padding: 8px 10px; text-align: left; font-size: 0.85rem; color: #6b7280;">Host</th>
                    <th style="padding: 8px 10px; text-align: right; font-size: 0.85rem; color: #6b7280;">Amount</th>
                    <th style="padding: 8px 10px; text-align: right; font-size: 0.85rem; color: #6b7280;">Bookings</th>
                    <th style="padding: 8px 10px; text-align: left; font-size: 0.85rem; color: #6b7280;">Error</th>
                  </tr>
                </thead>
                <tbody>${failureRows}</tbody>
              </table>

              <p style="margin-top: 20px; font-size: 0.85rem; color: #6b7280;">
                Each failed host received an individual alert earlier in this run.
                Failed bookings retain their existing payoutStatus and will retry on the next weekly run.
              </p>
            </div>
          </div>
        </body>
        </html>
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log(`📧 Payout run summary sent to ${supportEmail} (${hostsFailed} failures)`);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending payout run summary:', error);
    return { success: false, error: error.message };
  }
};

// Send toll charge notification to driver (detailed)
const sendTollChargeToDriver = async (driver, booking, vehicle, tollCharge, tollSummary) => {
  try {
    const tollDate = new Date(tollCharge.exitTime).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const tollTime = new Date(tollCharge.exitTime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    // Driver sees toll amount with platform fee baked in
    const driverAmount = (tollCharge.amount + 0.50).toFixed(2);
    const runningTotal = tollSummary.driverTollTotal.toFixed(2);

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Toll Charge Email to Driver: ${driver.email} — $${driverAmount} at ${tollCharge.exitLocation}`);
      return { success: true, dev: true };
    }

    const mailOptions = {
      to: driver.email,
      subject: `Toll Charge Alert - ${booking.reservationId} | ${tollCharge.agency} - $${driverAmount}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .toll-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; white-space: nowrap; }
            .value { font-weight: bold; color: #111827; text-align: right; }
            .summary-box { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
            .info-box { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="padding: 0; border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
              <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
                <div style="color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.15em;">RentUFS</div>
              </div>
              <div style="background: #f59e0b; padding: 18px 20px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 1.5rem;">Toll Charge Detected</h1>
                <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95); font-size: 0.95rem;">A new toll has been added to your reservation</p>
              </div>
            </div>

            <div class="content">
              <h2>Hi ${driver.firstName},</h2>
              <p>A toll charge has been recorded on your current reservation. This toll will be added to your final trip charges.</p>

              <div class="toll-card">
                <div style="background: #f0fdf4; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #10b981;">${booking.reservationId}</span>
                </div>

                <h3 style="margin-top: 0; color: #000000;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="detail-row">
                  <span class="label">Toll Agency</span>
                  <span class="value">${tollCharge.agency}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Location</span>
                  <span class="value">${tollCharge.exitLocation}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Date & Time</span>
                  <span class="value">${tollDate} at ${tollTime}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Toll Amount</span>
                  <span class="value" style="color: #10b981; font-size: 1.1rem;">$${driverAmount}</span>
                </div>
              </div>

              <div class="summary-box">
                <h4 style="margin-top: 0; color: #1e40af;">Trip Toll Summary</h4>
                <div class="detail-row" style="border-bottom: none;">
                  <span class="label">Total Tolls This Trip</span>
                  <span class="value">${tollSummary.totalTolls}</span>
                </div>
                <div class="detail-row" style="border-bottom: none;">
                  <span class="label">Running Toll Total</span>
                  <span class="value" style="color: #1e40af; font-size: 1.1rem;">$${runningTotal}</span>
                </div>
              </div>

              <div class="info-box">
                <h4 style="margin-top: 0; color: #b45309;">How Toll Charges Work</h4>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Tolls are detected automatically during your trip</li>
                  <li>Tolls are settled at vehicle return or trip extension</li>
                  <li>You can view all toll details in your bookings page</li>
                </ul>
              </div>

              <center>
                <a href="${clientUrl}/my-bookings" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View My Bookings
                </a>
              </center>
            </div>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${driver.firstName},

A toll charge has been recorded on your current reservation.

Reservation ID: ${booking.reservationId}
Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}

Toll Details:
- Agency: ${tollCharge.agency}
- Location: ${tollCharge.exitLocation}
- Date & Time: ${tollDate} at ${tollTime}
- Toll Amount: $${driverAmount}

Trip Toll Summary:
- Total Tolls This Trip: ${tollSummary.totalTolls}
- Running Toll Total: $${runningTotal}

How Toll Charges Work:
- Tolls are detected automatically during your trip
- Tolls are settled at vehicle return or trip extension
- You can view all toll details in your bookings page

View your bookings: ${clientUrl}/my-bookings

Thank you for choosing RentUFS!

Best regards,
The RentUFS Team
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log(`✅ Toll charge email sent to driver: ${driver.email} — $${driverAmount}`);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending toll charge email to driver:', error);
    return { success: false, error: error.message };
  }
};

// Send toll notification to host (general, no amounts)
const sendTollNotificationToHost = async (host, booking, vehicle, driver, tollSummary) => {
  try {
    const tollDate = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const driverName = `${driver.firstName} ${driver.lastName ? driver.lastName.charAt(0) + '.' : ''}`;

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Toll Notification Email to Host: ${host.email} — ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
      return { success: true, dev: true };
    }

    const mailOptions = {
      to: host.email,
      subject: `New Toll Recorded - ${vehicle.year} ${vehicle.make} ${vehicle.model} | ${booking.reservationId}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #000000; color: #00FF66; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .logo { font-size: 2rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .toll-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; white-space: nowrap; }
            .value { font-weight: bold; color: #111827; text-align: right; }
            .info-box { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
            .footer { background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header" style="padding: 0; border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
              <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
                <div style="color: #00FF66; font-size: 2rem; font-weight: bold; letter-spacing: 0.15em;">RentUFS</div>
              </div>
              <div style="background: #f59e0b; padding: 18px 20px; text-align: center;">
                <h1 style="margin: 0; color: #ffffff; font-size: 1.5rem;">New Toll Recorded</h1>
                <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95); font-size: 0.95rem;">A toll has been recorded on one of your vehicles</p>
              </div>
            </div>

            <div class="content">
              <h2>Hi ${host.firstName},</h2>
              <p>A toll charge has been recorded on your vehicle during an active reservation.</p>

              <div class="toll-card">
                <div style="background: #f0fdf4; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #10b981;">${booking.reservationId}</span>
                </div>

                <div class="detail-row">
                  <span class="label">Vehicle</span>
                  <span class="value">${vehicle.year} ${vehicle.make} ${vehicle.model}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Driver</span>
                  <span class="value">${driverName}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Toll Agency</span>
                  <span class="value">${tollSummary.latestAgency}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Date</span>
                  <span class="value">${tollDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Total Tolls This Trip</span>
                  <span class="value">${tollSummary.totalTolls}</span>
                </div>
              </div>

              <div class="info-box">
                <h4 style="margin-top: 0; color: #1e40af;">How It Works</h4>
                <ul style="margin: 0; padding-left: 20px;">
                  <li>Toll charges are the driver's responsibility</li>
                  <li>Tolls are settled automatically at return or extension</li>
                  <li>The original toll amount is transferred to you after settlement</li>
                  <li>You can view toll details on your dashboard</li>
                </ul>
              </div>

              <center>
                <a href="${clientUrl}/host/bookings" class="button" style="background:#10b981;color:#ffffff;padding:12px 30px;text-decoration:none;border-radius:6px;display:inline-block;font-weight:bold;">
                  View Host Dashboard
                </a>
              </center>
            </div>

            <div class="footer">
              <p>&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${host.firstName},

A toll charge has been recorded on your vehicle during an active reservation.

Reservation ID: ${booking.reservationId}
Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
Driver: ${driverName}
Toll Agency: ${tollSummary.latestAgency}
Date: ${tollDate}
Total Tolls This Trip: ${tollSummary.totalTolls}

How It Works:
- Toll charges are the driver's responsibility
- Tolls are settled automatically at return or extension
- The original toll amount is transferred to you after settlement
- You can view toll details on your dashboard

View your dashboard: ${clientUrl}/host/bookings

Best regards,
The RentUFS Team
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log(`✅ Toll notification email sent to host: ${host.email} — ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
    }
    return result;
  } catch (error) {
    console.error('❌ Error sending toll notification email to host:', error);
    return { success: false, error: error.message };
  }
};

// =============================================================================
// Host-added charges (citation, parking ticket, cleaning, etc.) lifecycle emails
// =============================================================================

const CHARGE_TYPE_LABELS = {
  citation: 'Traffic Citation',
  parking_ticket: 'Parking Ticket',
  manual_toll: 'Manual Toll',
  late_return: 'Late Return Fee',
  cleaning: 'Cleaning Fee',
  fuel: 'Fuel Charge',
  smoking_violation: 'Smoking Violation',
  other: 'Other'
};

// Sent when the host creates a new charge against the renter's booking.
// Notifies the renter, shows the charge details + proof, and links to Pay Now.
const sendChargeAddedToDriver = async (driver, host, booking, vehicle, charge) => {
  try {
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Charge added email to ${driver.email}: $${charge.amount} ${charge.chargeType}`);
      return { success: true, dev: true };
    }
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const typeLabel = CHARGE_TYPE_LABELS[charge.chargeType] || charge.chargeType;
    const total = (charge.amount + 0.50).toFixed(2);
    const autoChargeDate = new Date(charge.scheduledChargeAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    const hostName = `${host.firstName || ''} ${host.lastName || ''}`.trim() || 'Your host';
    const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your rental vehicle';

    return await sendEmail({
      to: driver.email,
      subject: `New charge on ${booking.reservationId || 'your reservation'} — $${total}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
            <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
              <div style="font-size: 1.6rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66;">RentUFS</div>
            </div>
            <div style="background: #f59e0b; padding: 18px 20px; text-align: center;">
              <h2 style="margin: 0; color: #ffffff;">New Charge on Your Reservation</h2>
              <p style="margin: 6px 0 0; color: rgba(255,255,255,0.95);">${typeLabel} — $${total}</p>
            </div>
          </div>
          <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>Hi ${driver.firstName || 'there'},</p>
            <p>${hostName} added a new charge to your reservation of the ${vehicleLabel}.</p>
            <div style="background: white; padding: 16px; border-radius: 8px; border-left: 4px solid #f59e0b; margin: 16px 0;">
              <p style="margin: 0;"><strong>${typeLabel}</strong></p>
              <p style="margin: 6px 0; color: #6b7280; font-size: 0.9rem;">${charge.description}</p>
              <p style="margin: 6px 0; font-size: 1.05rem;"><strong>Amount: $${charge.amount.toFixed(2)}</strong> + $0.50 service fee = <strong>$${total}</strong></p>
              ${charge.proofImage ? `<p style="margin: 8px 0 0;"><a href="${charge.proofImage}" style="color: #10b981;">View proof →</a></p>` : ''}
            </div>
            <p>If no action is taken, this charge will be automatically billed to your saved card on <strong>${autoChargeDate}</strong>. You can pay now, or contact support if you believe the charge is incorrect.</p>
            <p style="text-align: center; margin: 24px 0;">
              <a href="${clientUrl}/my-bookings" style="background: #10b981; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Review &amp; Pay</a>
            </p>
            <p style="font-size: 0.85rem; color: #6b7280;">Think this charge is wrong? Reply to this email or contact <a href="mailto:support@rentufs.com">support@rentufs.com</a>.</p>
          </div>
          <div style="background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; border-radius: 0 0 8px 8px;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
            <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
          </div>
        </div>
      `,
      text: `Hi ${driver.firstName || 'there'},

${hostName} added a new charge to your reservation of the ${vehicleLabel}.

${typeLabel}
${charge.description}
Amount: $${charge.amount.toFixed(2)} + $0.50 service fee = $${total}

If no action is taken, this charge will be auto-billed to your saved card on ${autoChargeDate}.

Review & pay: ${clientUrl}/my-bookings
Contact support: support@rentufs.com
`
    });
  } catch (error) {
    console.error('❌ Error sending charge added email:', error);
    return { success: false, error: error.message };
  }
};

// Sent when the auto-charge attempt declines. Tells the renter to update their card.
const sendChargePaymentFailedToDriver = async (driver, booking, charge, attempts, maxAttempts) => {
  try {
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Charge payment failed email to ${driver.email} (attempt ${attempts}/${maxAttempts})`);
      return { success: true, dev: true };
    }
    const clientUrl = process.env.CLIENT_URL || 'http://localhost:3000';
    const typeLabel = CHARGE_TYPE_LABELS[charge.chargeType] || charge.chargeType;
    const total = (charge.amount + 0.50).toFixed(2);
    const isFinal = attempts >= maxAttempts;

    return await sendEmail({
      to: driver.email,
      subject: isFinal
        ? `Final notice: $${total} charge unpaid — your account will be locked`
        : `Payment failed for $${total} charge — please update your card`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333;">
          <div style="border: 3px solid #00FF66; border-bottom: none; border-radius: 8px 8px 0 0; overflow: hidden;">
            <div style="background: #000000; padding: 22px 20px 16px; text-align: center;">
              <div style="font-size: 1.6rem; font-weight: bold; letter-spacing: 0.15em; color: #00FF66;">RentUFS</div>
            </div>
            <div style="background: ${isFinal ? '#dc2626' : '#f59e0b'}; padding: 18px 20px; text-align: center;">
              <h2 style="margin: 0; color: #ffffff;">${isFinal ? 'Final Payment Notice' : 'Payment Failed'}</h2>
            </div>
          </div>
          <div style="background: #f9fafb; padding: 24px; border-radius: 0 0 8px 8px;">
            <p>Hi ${driver.firstName || 'there'},</p>
            <p>We tried to charge your saved card $${total} for the <strong>${typeLabel}</strong> on reservation <strong>${booking.reservationId || booking._id}</strong>, but the payment was declined.</p>
            ${isFinal
              ? `<p style="background: #fee2e2; border-left: 4px solid #dc2626; padding: 12px; border-radius: 4px;"><strong>This was the final automatic attempt.</strong> You will not be able to book any new vehicles on RentUFS until this balance is cleared.</p>`
              : `<p>We'll automatically retry in a few days, but the fastest way to clear this is to update your card and pay now.</p>`}
            <p style="text-align: center; margin: 24px 0;">
              <a href="${clientUrl}/my-bookings" style="background: #10b981; color: white; padding: 12px 28px; text-decoration: none; border-radius: 6px; font-weight: 600;">Pay Now</a>
            </p>
            <p style="font-size: 0.85rem; color: #6b7280;">Need help? Email <a href="mailto:support@rentufs.com">support@rentufs.com</a>.</p>
          </div>
          <div style="background: #00FF66; text-align: center; color: #000000; padding: 20px; font-size: 0.9rem; border-radius: 0 0 8px 8px;">
            <p style="margin: 0;">&copy; ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
            <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
          </div>
        </div>
      `,
      text: `Hi ${driver.firstName || 'there'},

We tried to charge $${total} for the ${typeLabel} on reservation ${booking.reservationId || booking._id}, but the payment was declined.

${isFinal
  ? 'This was the final automatic attempt. You will not be able to book any new vehicles on RentUFS until this balance is cleared.'
  : 'We will retry automatically in a few days, but you can update your card and pay now.'}

Pay now: ${clientUrl}/my-bookings
Contact support: support@rentufs.com
`
    });
  } catch (error) {
    console.error('❌ Error sending charge failure email:', error);
    return { success: false, error: error.message };
  }
};

// Notify the driver when an admin changes their reservation dates/time from the
// "Edit dates" tool, so they always know the new pickup/return schedule. Sent
// best-effort — never throws, so a failed send can never block the date change.
const sendReservationDatesUpdatedEmail = async (driver, booking, vehicle) => {
  try {
    if (!driver?.email) return { success: false };
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const pickupTime = formatTime12h(booking.pickupTime || '10:00');
    const dropoffTime = formatTime12h(booking.dropoffTime || booking.pickupTime || '10:00');
    const vehicleName = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your vehicle';

    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Reservation dates updated email to: ${driver.email}`);
      return { success: true, dev: true };
    }

    await sendEmail({
      to: driver.email,
      subject: `Your RentUFS reservation has been updated${booking.reservationId ? ` - ${booking.reservationId}` : ''}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <h2 style="color: #111827;">Your reservation has been updated</h2>
            <p>Hi ${driver.firstName || 'there'},</p>
            <p>The schedule for your ${vehicleName} rental${booking.reservationId ? ` (${booking.reservationId})` : ''} has been updated. Here are your new details:</p>
            <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin:16px 0;">
              <p style="margin:0 0 6px;"><strong>Pick-up:</strong> ${startDate} at ${pickupTime}</p>
              <p style="margin:0;"><strong>Return:</strong> ${endDate} at ${dropoffTime}</p>
            </div>
            <p>If anything looks off, please contact us at <a href="mailto:support@rentufs.com">support@rentufs.com</a>.</p>
            <p>Thank you,<br>The RentUFS Team</p>
          </div>
        </body>
        </html>
      `,
      text: `Your reservation has been updated.\n\nPick-up: ${startDate} at ${pickupTime}\nReturn: ${endDate} at ${dropoffTime}\n\nQuestions? Contact support@rentufs.com\n\n- RentUFS`
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to send reservation dates updated email:', error.message);
    return { success: false, error: error.message };
  }
};

// Shared little breakdown table used by the late-fee emails below.
const lateFeeBreakdownHtml = (charge) => `
  <div style="margin-top:14px; background:#0b0b0b; border:1px solid #333; border-radius:8px; padding:14px;">
    <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
      <tr><td style="padding:4px 0; color:#9ca3af;">Late fee</td><td style="padding:4px 0; color:#fff; text-align:right;">$${charge.lateFee.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 0; color:#9ca3af;">Insurance (1 day)</td><td style="padding:4px 0; color:#fff; text-align:right;">$${charge.insurance.toFixed(2)}</td></tr>
      <tr><td style="padding:4px 0; color:#9ca3af;">Processing fee</td><td style="padding:4px 0; color:#fff; text-align:right;">$${charge.stripeFee.toFixed(2)}</td></tr>
      <tr><td style="padding:8px 0 0; color:#10b981; font-weight:800; border-top:1px solid #333;">Total</td><td style="padding:8px 0 0; color:#10b981; font-weight:800; text-align:right; border-top:1px solid #333;">$${charge.total.toFixed(2)}</td></tr>
    </table>
  </div>`;

// RECEIPT to the renter when an automatic late-return fee is successfully charged.
const sendLateFeeChargedToRenter = async ({ driver, booking, vehicle, dayNumber, charge }) => {
  try {
    if (!driver?.email) return { success: false, skipped: true };
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Late-fee receipt to renter: ${driver.email} ($${charge?.total}, day ${dayNumber})`);
      return { success: true, dev: true };
    }
    const vLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your rental vehicle';
    const resId = booking?.reservationId || String(booking?._id || '');
    const mailOptions = {
      to: driver.email,
      subject: `Late return fee charged — ${resId} ($${charge.total.toFixed(2)})`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background:#000; color:#e5e7eb; margin:0; padding:0;">
          <div style="max-width:600px; margin:0 auto; padding:20px;">
            <div style="background:#111; border:1px solid #f59e0b; border-radius:10px; overflow:hidden;">
              <div style="background:#f59e0b; color:#1a1200; padding:14px 18px; font-weight:800;">⚠ YOUR RENTAL IS OVERDUE</div>
              <div style="padding:18px;">
                <p style="margin:0 0 12px;">Hi ${driver.firstName || 'there'}, your rental of the <strong style="color:#fff;">${vLabel}</strong> (reservation ${resId}) is past its return time.</p>
                <p style="margin:0 0 12px; color:#9ca3af;">As agreed in your rental agreement, an automatic late-return fee for <strong style="color:#fff;">day ${dayNumber}</strong> has been charged to your card on file:</p>
                ${lateFeeBreakdownHtml(charge)}
                <p style="margin:16px 0 0; color:#fca5a5;"><strong>This repeats every day until the vehicle is returned.</strong> To stop further charges, please <strong style="color:#fff;">return the vehicle now</strong> or <strong style="color:#fff;">extend your trip</strong> in the RentUFS app.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };
    await sendEmail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error('📧 Late-fee renter receipt failed:', err.message);
    return { success: false, error: err.message };
  }
};

// CONFIRMATION copy to the company inbox (SUPPORT_EMAIL) for each real late charge,
// so the owner can watch the first ones. FYI only — no action needed.
const sendLateFeeOwnerCopy = async ({ booking, vehicle, driver, host, dayNumber, charge }) => {
  try {
    const supportEmail = process.env.SUPPORT_EMAIL;
    if (!supportEmail) return { success: false, skipped: true };
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Late-fee owner copy to: ${supportEmail} (booking ${booking?.reservationId}, day ${dayNumber}, charged $${charge?.total})`);
      return { success: true, dev: true };
    }
    const vLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle';
    const dName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Renter' : 'Renter';
    const resId = booking?.reservationId || String(booking?._id || '');
    const mailOptions = {
      to: supportEmail,
      subject: `Late fee charged — ${resId} · day ${dayNumber} · $${charge.total.toFixed(2)}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background:#000; color:#e5e7eb; margin:0; padding:0;">
          <div style="max-width:600px; margin:0 auto; padding:20px;">
            <div style="background:#111; border:1px solid #10b981; border-radius:10px; overflow:hidden;">
              <div style="background:#10b981; color:#04331f; padding:14px 18px; font-weight:800;">LATE FEE CHARGED · FYI</div>
              <div style="padding:18px;">
                <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                  <tr><td style="padding:6px 0; color:#9ca3af; width:150px;">Reservation</td><td style="padding:6px 0; color:#fff; font-family:monospace;">${resId}</td></tr>
                  <tr><td style="padding:6px 0; color:#9ca3af;">Vehicle</td><td style="padding:6px 0; color:#fff;">${vLabel}</td></tr>
                  <tr><td style="padding:6px 0; color:#9ca3af;">Renter</td><td style="padding:6px 0; color:#fff;">${dName}</td></tr>
                  <tr><td style="padding:6px 0; color:#9ca3af;">Late day #</td><td style="padding:6px 0; color:#fff;">${dayNumber}</td></tr>
                </table>
                ${lateFeeBreakdownHtml(charge)}
                <p style="margin:14px 0 0; color:#6b7280; font-size:0.8rem;">Automatic — no action needed. Charged to the renter's card on file. If anything looks wrong, you can switch late-fee charging OFF in Admin.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };
    await sendEmail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error('📧 Late-fee owner copy failed:', err.message);
    return { success: false, error: err.message };
  }
};

// URGENT alert to the HOST + company inbox when a late-fee charge is DECLINED.
// Coverage stays ON — no "lapse" language. Asks the host to help reach the renter.
const sendLateFeeDeclineAlert = async ({ booking, vehicle, driver, host, dayNumber, charge, failureMessage }) => {
  try {
    const supportEmail = process.env.SUPPORT_EMAIL;
    const recipients = [host?.email, supportEmail].filter(Boolean);
    if (recipients.length === 0) return { success: false, skipped: true };
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Late-fee DECLINE alert to: ${recipients.join(', ')} (booking ${booking?.reservationId}, day ${dayNumber})`);
      return { success: true, dev: true };
    }
    const vLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'the vehicle';
    const dName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'the renter' : 'the renter';
    const dPhone = driver?.phone ? ` (${driver.phone})` : '';
    const resId = booking?.reservationId || String(booking?._id || '');
    const mailOptions = {
      to: recipients.join(', '),
      subject: `[ACTION NEEDED] Overdue rental & payment failed — ${resId}`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background:#000; color:#e5e7eb; margin:0; padding:0;">
          <div style="max-width:600px; margin:0 auto; padding:20px;">
            <div style="background:#111; border:1px solid #f59e0b; border-radius:10px; overflow:hidden;">
              <div style="background:#f59e0b; color:#1a1200; padding:14px 18px; font-weight:800;">⚠ OVERDUE RENTAL · PAYMENT FAILED · TIME CRITICAL</div>
              <div style="padding:18px;">
                <p style="margin:0 0 12px;"><strong style="color:#fff;">${vLabel}</strong> (reservation ${resId}) is overdue, and the automatic late-return charge for day ${dayNumber} <strong style="color:#fff;">did not go through</strong>.</p>
                <p style="margin:0 0 12px; color:#fca5a5;"><strong>Please contact your renter ${dName}${dPhone} immediately</strong> to get the vehicle returned or the payment resolved. Time is critical.</p>
                <p style="margin:0 0 12px; color:#9ca3af;">We will automatically retry the card. Insurance coverage remains active while the vehicle is out. If it is not returned, RentUFS will keep you informed and, per the signed rental agreement, additional remedies apply after 72 hours.</p>
                ${lateFeeBreakdownHtml(charge)}
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };
    await sendEmail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error('📧 Late-fee decline alert failed:', err.message);
    return { success: false, error: err.message };
  }
};

// Advance WARNING to the renter BEFORE their rental ends, nudging them to return
// or extend so they avoid the automatic late fee. Three escalating stages:
//   '2h'  → ~2 hours before (friendly, green)
//   '1h'  → ~1 hour before  (firmer, amber)
//   '30m' → ~30 min before  (urgent, red)
const LATE_WARN_STAGES = {
  '2h':  { color: '#10b981', ink: '#04331f', banner: 'YOUR RENTAL ENDS SOON',        lead: 'ends in about 2 hours',   tone: 'Please plan to return the vehicle on time, or extend your trip in the RentUFS app if you need longer.' },
  '1h':  { color: '#f59e0b', ink: '#1a1200', banner: '1 HOUR LEFT ON YOUR RENTAL',    lead: 'ends in about 1 hour',    tone: 'To avoid an automatic late fee ($5 plus one day of insurance), please return the vehicle or extend now.' },
  '30m': { color: '#dc2626', ink: '#ffffff', banner: 'FINAL REMINDER — 30 MINUTES',   lead: 'ends in about 30 minutes',tone: 'Charges begin the moment you are late. Please return the vehicle now, or extend immediately, to avoid the fee.' }
};

const sendLateReturnWarningToRenter = async ({ driver, booking, vehicle, stage }) => {
  try {
    if (!driver?.email) return { success: false, skipped: true };
    const cfg = LATE_WARN_STAGES[stage] || LATE_WARN_STAGES['1h'];
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Late warning (${stage}) to renter: ${driver.email}`);
      return { success: true, dev: true };
    }
    const vLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your rental vehicle';
    const resId = booking?.reservationId || String(booking?._id || '');
    const mailOptions = {
      to: driver.email,
      subject: `${stage === '30m' ? 'Final reminder' : 'Reminder'}: your rental ${cfg.lead} — return or extend (${resId})`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background:#000; color:#e5e7eb; margin:0; padding:0;">
          <div style="max-width:600px; margin:0 auto; padding:20px;">
            <div style="background:#111; border:1px solid ${cfg.color}; border-radius:10px; overflow:hidden;">
              <div style="background:${cfg.color}; color:${cfg.ink}; padding:14px 18px; font-weight:800;">${cfg.banner}</div>
              <div style="padding:18px;">
                <p style="margin:0 0 12px;">Hi ${driver.firstName || 'there'}, your rental of the <strong style="color:#fff;">${vLabel}</strong> (reservation ${resId}) ${cfg.lead}.</p>
                <p style="margin:0 0 12px; color:#9ca3af;">${cfg.tone}</p>
                <p style="margin:0; color:#6b7280; font-size:0.82rem;">If you've already returned it, you can ignore this message.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };
    await sendEmail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error('📧 Late-return warning failed:', err.message);
    return { success: false, error: err.message };
  }
};

// URGENT "recover your vehicle" email to the HOST. Sent at 48h (Day 2) and again
// at 72h (Day 3). Coverage stays ON — no "lapse" language. References the signed
// agreement's remedies (which begin at 72 hours).
const sendLateReturnRecoverToHost = async ({ booking, vehicle, driver, host, hoursLate, stage }) => {
  try {
    if (!host?.email) return { success: false, skipped: true };
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Host recover email: ${host.email} (${stage}, ${hoursLate}h late)`);
      return { success: true, dev: true };
    }
    const vLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'your vehicle';
    const dName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'the renter' : 'the renter';
    const dPhone = driver?.phone ? ` (${driver.phone})` : '';
    const resId = booking?.reservationId || String(booking?._id || '');
    const is72 = stage === '72h';
    const mailOptions = {
      to: host.email,
      subject: `[URGENT] ${vLabel} is ${is72 ? '3+ days' : '2+ days'} overdue — action needed (${resId})`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background:#000; color:#e5e7eb; margin:0; padding:0;">
          <div style="max-width:600px; margin:0 auto; padding:20px;">
            <div style="background:#111; border:1px solid #dc2626; border-radius:10px; overflow:hidden;">
              <div style="background:#dc2626; color:#fff; padding:14px 18px; font-weight:800;">🚨 VEHICLE SIGNIFICANTLY OVERDUE — PLEASE ACT</div>
              <div style="padding:18px;">
                <p style="margin:0 0 12px;">Your <strong style="color:#fff;">${vLabel}</strong> (reservation ${resId}) is now <strong style="color:#fff;">${is72 ? 'more than 3 days' : 'more than 2 days'}</strong> past its return time and has not been returned.</p>
                <p style="margin:0 0 12px; color:#fca5a5;"><strong>Please contact your renter ${dName}${dPhone} immediately</strong> to arrange the vehicle's return.</p>
                ${is72 ? `<p style="margin:0 0 12px; color:#9ca3af;">Per the rental agreement your renter signed, once a vehicle is more than 72 hours overdue and the rental has not been extended, you (the Owner) may take further action to recover the vehicle. RentUFS is also being notified.</p>` : `<p style="margin:0 0 12px; color:#9ca3af;">RentUFS is continuing to attempt collection of the late fees. Insurance coverage remains active while the vehicle is out.</p>`}
                <p style="margin:0; color:#6b7280; font-size:0.82rem;">If the vehicle has already been returned, please disregard this message.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };
    await sendEmail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error('📧 Host recover email failed:', err.message);
    return { success: false, error: err.message };
  }
};

// Alert to the company inbox (SUPPORT_EMAIL) at 72 hours so the team can lean on
// the host / consider the agreement's recovery remedies. Internal, FYI + action.
const sendLateReturnCompanyAlert = async ({ booking, vehicle, driver, host, hoursLate }) => {
  try {
    const supportEmail = process.env.SUPPORT_EMAIL;
    if (!supportEmail) return { success: false, skipped: true };
    if (!isEmailConfigured()) {
      console.log(`📧 [DEV] Company 72h alert to: ${supportEmail} (booking ${booking?.reservationId}, ${hoursLate}h late)`);
      return { success: true, dev: true };
    }
    const vLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : 'Vehicle';
    const dName = driver ? `${driver.firstName || ''} ${driver.lastName || ''}`.trim() || 'Renter' : 'Renter';
    const dPhone = driver?.phone ? ` (${driver.phone})` : '';
    const hName = host ? `${host.firstName || ''} ${host.lastName || ''}`.trim() || 'Host' : 'Host';
    const hPhone = host?.phone ? ` (${host.phone})` : '';
    const resId = booking?.reservationId || String(booking?._id || '');
    const mailOptions = {
      to: supportEmail,
      subject: `[72h OVERDUE] ${resId} — lean on host / review recovery`,
      html: `
        <!DOCTYPE html>
        <html>
        <body style="font-family: Arial, sans-serif; background:#000; color:#e5e7eb; margin:0; padding:0;">
          <div style="max-width:600px; margin:0 auto; padding:20px;">
            <div style="background:#111; border:1px solid #dc2626; border-radius:10px; overflow:hidden;">
              <div style="background:#dc2626; color:#fff; padding:14px 18px; font-weight:800;">🚨 72+ HOURS OVERDUE — INTERNAL</div>
              <div style="padding:18px;">
                <table style="width:100%; border-collapse:collapse; font-size:0.9rem;">
                  <tr><td style="padding:6px 0; color:#9ca3af; width:150px;">Reservation</td><td style="padding:6px 0; color:#fff; font-family:monospace;">${resId}</td></tr>
                  <tr><td style="padding:6px 0; color:#9ca3af;">Vehicle</td><td style="padding:6px 0; color:#fff;">${vLabel}</td></tr>
                  <tr><td style="padding:6px 0; color:#9ca3af;">Renter</td><td style="padding:6px 0; color:#fff;">${dName}${dPhone}</td></tr>
                  <tr><td style="padding:6px 0; color:#9ca3af;">Host</td><td style="padding:6px 0; color:#fff;">${hName}${hPhone}</td></tr>
                  <tr><td style="padding:6px 0; color:#9ca3af;">Overdue</td><td style="padding:6px 0; color:#fff;">${Math.round(hoursLate)} hours</td></tr>
                </table>
                <p style="margin:14px 0 0; color:#9ca3af; font-size:0.85rem;">The host has been sent the urgent recover email. Per the signed agreement, remedies are available after 72 hours. Follow up with the host to apply pressure / assist recovery.</p>
              </div>
            </div>
          </div>
        </body>
        </html>
      `
    };
    await sendEmail(mailOptions);
    return { success: true };
  } catch (err) {
    console.error('📧 Company 72h alert failed:', err.message);
    return { success: false, error: err.message };
  }
};

module.exports = {
  sendEmail,
  sendLateFeeChargedToRenter,
  sendLateFeeOwnerCopy,
  sendLateFeeDeclineAlert,
  sendLateReturnWarningToRenter,
  sendLateReturnRecoverToHost,
  sendLateReturnCompanyAlert,
  sendReservationDatesUpdatedEmail,
  sendWelcomeEmail,
  sendVehicleListedEmail,
  sendBookingConfirmationToDriver,
  sendBookingNotificationToHost,
  sendReturnReminderEmail,
  sendBookingExtensionEmail,
  sendBookingCancellationEmail,
  sendEmailVerificationCode,
  sendRegistrationOtp,
  sendRegistrationExpirationReminder,
  sendVehiclePausedEmail,
  sendPasswordResetEmail,
  sendPayoutNotificationEmail,
  sendPayoutFailureAlert,
  sendPayoutRunSummaryEmail,
  sendTollChargeToDriver,
  sendTollNotificationToHost,
  sendChargeAddedToDriver,
  sendChargePaymentFailedToDriver
};
