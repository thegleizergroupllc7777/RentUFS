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
    'Precedence': 'bulk',
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
        email: process.env.EMAIL_REPLY_TO || sender.email,
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
      replyTo: process.env.EMAIL_REPLY_TO || sender.email
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
            <div class="header">
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

              <p>We're excited to have you as part of our community. Whether you're looking to rent a car or earn money by listing yours, we've got you covered!</p>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/marketplace" class="button">
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
      text: `Hi ${user.firstName},\n\nWelcome to RentUFS!\n\nYour account has been successfully created.\n\nAccount Type: ${userTypeText}\n\n${user.userType === 'driver' ? 'You can now browse and rent vehicles from trusted hosts in your area.' : user.userType === 'host' ? 'You can now list your vehicles and start earning money!' : 'You can rent vehicles and list your own cars to earn money!'}\n\nGet Started:\n- Browse available vehicles\n- ${user.userType !== 'driver' ? 'List your vehicles' : 'Book your first ride'}\n- Complete your profile\n\nThank you for choosing RentUFS!\n\nBest regards,\nThe RentUFS Team`
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
            <div class="header">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: white;">Vehicle Listed Successfully!</h1>
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
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/host/dashboard" class="button">
                  View Dashboard
                </a>
              </center>

              <p style="margin-top: 30px; font-size: 0.9rem; color: #6b7280;">
                <strong>Pro Tip:</strong> Vehicles with complete profiles and good photos get 3x more bookings!
              </p>
            </div>

            <div class="footer">
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} UFS. All rights reserved.</p>
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

// Send booking confirmation email to driver
const sendBookingConfirmationToDriver = async (driver, booking, vehicle, host) => {
  try {
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const pickupTime = booking.pickupTime || '10:00';
    const dropoffTime = booking.dropoffTime || booking.pickupTime || '10:00';
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
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .total { font-size: 1.5rem; color: #10b981; font-weight: bold; text-align: right; margin-top: 15px; }
            .host-info { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
            .reminders { background: #fef3c7; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Booking Confirmed!</h1>
              <p style="margin: 0; opacity: 0.9;">Your payment was successful</p>
            </div>

            <div class="content">
              <h2>Hi ${driver.firstName},</h2>
              <p>Great news! Your booking has been confirmed and payment processed successfully!</p>

              <div class="booking-card">
                <div style="background: #f0fdf4; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #10b981;">${booking.reservationId || booking._id}</span>
                </div>
                ${vehicleImageUrl ? `
                <div style="text-align: center; margin-bottom: 15px;">
                  <img src="${vehicleImageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" style="max-width: 100%; height: auto; max-height: 200px; border-radius: 8px; object-fit: cover;" />
                </div>
                ` : ''}
                <h3 style="margin-top: 0; color: #10b981;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

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
                </ul>
              </div>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings" class="button">
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
    const pickupTime = booking.pickupTime || '10:00';
    const dropoffTime = booking.dropoffTime || booking.pickupTime || '10:00';
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
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .earnings { font-size: 1.5rem; color: #10b981; font-weight: bold; text-align: right; margin-top: 15px; }
            .driver-info { background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
            .next-steps { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .footer { text-align: center; color: #6b7280; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>New Booking!</h1>
              <p style="margin: 0; opacity: 0.9;">Payment has been processed</p>
            </div>

            <div class="content">
              <h2>Hi ${host.firstName},</h2>
              <p>Great news! You have a new confirmed booking for your vehicle!</p>

              <div class="booking-card">
                <div style="background: #f0fdf4; padding: 10px 15px; border-radius: 6px; margin-bottom: 15px; text-align: center;">
                  <span style="color: #6b7280; font-size: 0.85rem;">Reservation ID</span><br>
                  <span style="font-family: monospace; font-size: 1.25rem; font-weight: bold; color: #10b981;">${booking.reservationId || booking._id}</span>
                </div>
                ${vehicleImageUrl ? `
                <div style="text-align: center; margin-bottom: 15px;">
                  <img src="${vehicleImageUrl}" alt="${vehicle.year} ${vehicle.make} ${vehicle.model}" style="max-width: 100%; height: auto; max-height: 200px; border-radius: 8px; object-fit: cover;" />
                </div>
                ` : ''}
                <h3 style="margin-top: 0; color: #10b981;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

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
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/host/bookings" class="button">
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
    const dropoffTime = booking.dropoffTime || '10:00';
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
            .header { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
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
            .footer { text-align: center; color: #6b7280; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="clock-icon">⏰</div>
              <h1 style="margin: 0;">Rental Ending Soon!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Your reservation ends in about 1 hour</p>
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
                  <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings" class="button button-return">
                    Return Vehicle
                  </a>
                </div>
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
      .header { background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
      .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
      .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #3b82f6; }
      .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
      .detail-row:last-child { border-bottom: none; }
      .label { color: #6b7280; }
      .value { font-weight: bold; color: #111827; }
      .extension-badge { background: #dbeafe; color: #1d4ed8; padding: 8px 16px; border-radius: 20px; display: inline-block; font-weight: bold; font-size: 0.9rem; }
      .updated { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
      .button { background: #3b82f6; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; }
      .footer { text-align: center; color: #6b7280; padding: 20px; font-size: 0.9rem; }
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
          <span class="value">${booking.pickupTime || '10:00'}</span>
        </div>
        <div class="detail-row">
          <span class="label">Drop-off Time</span>
          <span class="value">${booking.dropoffTime || booking.pickupTime || '10:00'}</span>
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
- Pick-up Time: ${booking.pickupTime || '10:00'}
- Drop-off Time: ${booking.dropoffTime || booking.pickupTime || '10:00'}
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
            <div class="header">
              <h1 style="margin: 0;">Booking Extended!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Your rental has been extended by ${extensionDays} day(s)</p>
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
                <p style="margin: 5px 0;">Please return the vehicle by <strong>${booking.dropoffTime || booking.pickupTime || '10:00'}</strong> on the new return date.</p>
              </div>

              <div style="background: #eff6ff; padding: 15px; border-radius: 8px; margin: 20px 0;">
                <h4 style="margin-top: 0; color: #1d4ed8;">Host Contact</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${host.firstName} ${host.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${host.email}</p>
                ${host.phone ? `<p style="margin: 5px 0;"><strong>Phone:</strong> ${host.phone}</p>` : ''}
              </div>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/my-bookings" class="button">
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
            <div class="header">
              <h1 style="margin: 0;">Booking Extended!</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">A rental has been extended by ${extensionDays} day(s)</p>
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
                <p style="margin: 5px 0;">The vehicle will now be returned on <strong>${newEndDate}</strong> by <strong>${booking.dropoffTime || booking.pickupTime || '10:00'}</strong>.</p>
                <p style="margin: 5px 0;">Additional earnings: <strong>$${extensionCost.toFixed(2)}</strong></p>
              </div>

              <center>
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/host/bookings" class="button">
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
            .header { background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .booking-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .refund-notice { background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; text-align: center; }
            .reason-box { background: #fef2f2; padding: 15px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ef4444; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; font-weight: bold; }
            .footer { text-align: center; color: #6b7280; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1 style="margin: 0;">Reservation Cancelled</h1>
              <p style="margin: 10px 0 0 0; opacity: 0.9;">Your booking has been cancelled by the host</p>
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
                <a href="${process.env.CLIENT_URL || 'http://localhost:3000'}/marketplace" class="button">
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
            <div class="header">
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
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} UFS. All rights reserved.</p>
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
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background-color: #000; color: #fff; border-radius: 12px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #10b981, #059669); padding: 30px; text-align: center;">
          <h1 style="margin: 0; font-size: 24px; color: #fff;">RentUFS</h1>
          <p style="margin: 10px 0 0; font-size: 14px; color: rgba(255,255,255,0.9);">Registration Expiration Reminder</p>
        </div>
        <div style="padding: 30px;">
          <h2 style="color: #f59e0b; margin-top: 0;">⚠️ Registration Expiring Soon</h2>
          <p style="color: #d1d5db; line-height: 1.6;">
            Hi ${host.firstName},
          </p>
          <p style="color: #d1d5db; line-height: 1.6;">
            The vehicle registration for your <strong style="color: #fff;">${vehicleName}</strong> is expiring on <strong style="color: #f59e0b;">${expirationDate}</strong>.
          </p>
          <p style="color: #d1d5db; line-height: 1.6;">
            Please renew your registration and upload the updated document to keep your vehicle listing active on RentUFS.
          </p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${dashboardUrl}" style="background: #10b981; color: #fff; padding: 14px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 16px; display: inline-block;">
              Update Registration
            </a>
          </div>
          <div style="background: #1a1a2e; border-radius: 8px; padding: 20px; margin: 20px 0;">
            <h3 style="color: #10b981; margin-top: 0; font-size: 14px; text-transform: uppercase;">Vehicle Details</h3>
            <p style="color: #d1d5db; margin: 5px 0;"><strong>Vehicle:</strong> ${vehicleName}</p>
            <p style="color: #d1d5db; margin: 5px 0;"><strong>VIN:</strong> ${vehicle.vin || 'N/A'}</p>
            <p style="color: #d1d5db; margin: 5px 0;"><strong>Registration Expires:</strong> <span style="color: #f59e0b;">${expirationDate}</span></p>
          </div>
          <p style="color: #9ca3af; font-size: 13px; line-height: 1.5;">
            Vehicles with expired registrations may be temporarily delisted from the marketplace. Please update your registration as soon as possible.
          </p>
        </div>
        <div style="background: #111; padding: 20px; text-align: center; border-top: 1px solid #222;">
          <p style="color: #6b7280; font-size: 12px; margin: 0;">
            &copy; ${new Date().getFullYear()} RentUFS. All rights reserved.
          </p>
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
            <div class="header">
              <div class="logo">RentUFS</div>
              <h1 style="margin-top: 20px; color: white;">Password Reset</h1>
            </div>

            <div class="content">
              <h2>Hi ${user.firstName},</h2>

              <p>We received a request to reset the password for your RentUFS account.</p>

              <p>Click the button below to set a new password:</p>

              <center>
                <a href="${resetUrl}" class="button">
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
            .header { background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: white; padding: 30px 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px; }
            .payout-card { background: white; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #10b981; }
            .amount-display { font-size: 2rem; color: #10b981; font-weight: bold; text-align: center; padding: 15px 0; }
            .detail-row { padding: 10px 0; border-bottom: 1px solid #e5e7eb; display: flex; justify-content: space-between; }
            .detail-row:last-child { border-bottom: none; }
            .label { color: #6b7280; }
            .value { font-weight: bold; color: #111827; }
            .info-box { background: #ecfdf5; padding: 15px; border-radius: 8px; margin: 20px 0; }
            .button { background: #10b981; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; margin-top: 20px; }
            .footer { text-align: center; color: #6b7280; padding: 20px; font-size: 0.9rem; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Payout On The Way!</h1>
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
                <p style="margin: 5px 0;">Funds are transferred to your Stripe account immediately. From there, Stripe will deposit the funds to your bank account on your next weekly payout (every Monday). You can check your payout schedule in your Stripe dashboard.</p>
              </div>

              <center>
                <a href="${clientUrl}/host/payouts" class="button">
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

module.exports = {
  sendWelcomeEmail,
  sendVehicleListedEmail,
  sendBookingConfirmationToDriver,
  sendBookingNotificationToHost,
  sendReturnReminderEmail,
  sendBookingExtensionEmail,
  sendBookingCancellationEmail,
  sendEmailVerificationCode,
  sendRegistrationExpirationReminder,
  sendPasswordResetEmail,
  sendPayoutNotificationEmail
};
