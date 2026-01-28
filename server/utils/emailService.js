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

// Helper function to send email via SendGrid or Nodemailer
const sendEmail = async (mailOptions) => {
  const transporter = createTransporter();

  if (!transporter) {
    return { success: false, dev: true };
  }

  if (transporter.type === 'sendgrid') {
    // Use SendGrid API
    const msg = {
      to: mailOptions.to,
      from: mailOptions.from || process.env.EMAIL_FROM || 'noreply@rentufs.com',
      subject: mailOptions.subject,
      text: mailOptions.text,
      html: mailOptions.html
    };

    const response = await sgMail.send(msg);
    return { success: true, messageId: response[0]?.headers['x-message-id'] };
  } else {
    // Use Nodemailer
    const info = await transporter.sendMail(mailOptions);
    return { success: true, messageId: info.messageId };
  }
};

// Send welcome email to new users
const sendWelcomeEmail = async (user) => {
  try {
    const transporter = createTransporter();

    if (!transporter) {
      // Development mode - just log the email
      console.log('📧 [DEV] Welcome Email to:', user.email);
      console.log('-----------------------------------');
      console.log(`To: ${user.email}`);
      console.log(`Subject: Welcome to UFS - Your Account is Ready!`);
      console.log(`
Hi ${user.firstName},

Welcome to UFS!

Your account has been successfully created. You're now part of our community!

Account Type: ${user.userType === 'driver' ? 'Driver' : user.userType === 'host' ? 'Host' : 'Driver & Host'}

${user.userType === 'driver' ?
  'You can now browse and rent vehicles from trusted hosts in your area.' :
  user.userType === 'host' ?
  'You can now list your vehicles and start earning money!' :
  'You can rent vehicles and list your own cars to earn money!'}

Get Started:
- Browse available vehicles
- ${user.userType !== 'driver' ? 'List your vehicles' : 'Book your first ride'}
- Complete your profile

Thank you for choosing UFS!

Best regards,
The UFS Team
      `);
      console.log('-----------------------------------\n');
      return { success: true, dev: true };
    }

    const userTypeText = user.userType === 'driver' ? 'Driver' :
                         user.userType === 'host' ? 'Host' : 'Driver & Host';

    const mailOptions = {
      from: `"UFS" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@rentufs.com'}>`,
      to: user.email,
      subject: 'Welcome to UFS - Your Account is Ready!',
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
              <div class="logo">UFS</div>
              <h1 style="margin-top: 20px; color: white;">Welcome Aboard!</h1>
            </div>

            <div class="content">
              <h2>Hi ${user.firstName},</h2>

              <p>Your UFS account has been successfully created!</p>

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
              <p style="margin: 0;">&copy; ${new Date().getFullYear()} UFS. All rights reserved.</p>
              <p style="margin: 5px 0 0 0; font-size: 0.8rem;">597 West Side Ave PMB 194, Jersey City, NJ 07304</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${user.firstName},

Welcome to UFS!

Your account has been successfully created. You're now part of our community!

Account Type: ${userTypeText}

${user.userType === 'driver' ?
  'You can now browse and rent vehicles from trusted hosts in your area.' :
  user.userType === 'host' ?
  'You can now list your vehicles and start earning money!' :
  'You can rent vehicles and list your own cars to earn money!'}

Get Started:
- Browse available vehicles
- ${user.userType !== 'driver' ? 'List your vehicles' : 'Book your first ride'}
- Complete your profile

Thank you for choosing UFS!

Best regards,
The UFS Team
      `
    };

    const result = await sendEmail(mailOptions);
    if (result.success) {
      console.log('✅ Welcome email sent to:', user.email);
      if (result.messageId) console.log('Message ID:', result.messageId);
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
    const transporter = createTransporter();

    if (!transporter) {
      // Development mode - just log the email
      console.log('📧 [DEV] Vehicle Listed Email to:', user.email);
      console.log('-----------------------------------');
      console.log(`To: ${user.email}`);
      console.log(`Subject: Your ${vehicle.year} ${vehicle.make} ${vehicle.model} is Now Listed!`);
      console.log(`
Hi ${user.firstName},

Congratulations! Your vehicle has been successfully listed on UFS!

Vehicle Details:
- ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Type: ${vehicle.type}
- Price: $${vehicle.pricePerDay}/day
- Location: ${vehicle.location?.city}, ${vehicle.location?.state}

Your vehicle is now visible to thousands of potential renters!

What's Next:
- Monitor booking requests in your host dashboard
- Update your vehicle availability as needed
- Respond to renter inquiries promptly

Start earning today!

Best regards,
The UFS Team
      `);
      console.log('-----------------------------------\n');
      return { success: true, dev: true };
    }

    const mailOptions = {
      from: `"UFS" <${process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@rentufs.com'}>`,
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
              <div class="logo">UFS</div>
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
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${user.firstName},

Congratulations! Your vehicle has been successfully listed on UFS!

Vehicle Details:
- ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Type: ${vehicle.type}
- Transmission: ${vehicle.transmission}
- Seats: ${vehicle.seats}
- Price: $${vehicle.pricePerDay}/day
- Location: ${vehicle.location?.city}, ${vehicle.location?.state}

Your vehicle is now visible to thousands of potential renters!

What's Next:
- Monitor booking requests in your host dashboard
- Update your vehicle availability as needed
- Respond to renter inquiries promptly

Start earning today!

Best regards,
The UFS Team
      `
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
    const transporter = createTransporter();
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (!transporter) {
      console.log('📧 [DEV] Booking Confirmation Email to Driver:', driver.email);
      console.log('-----------------------------------');
      console.log(`To: ${driver.email}`);
      console.log(`Subject: Booking Confirmed - ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
      console.log(`
Hi ${driver.firstName},

Great news! Your booking has been confirmed and payment processed successfully!

Reservation ID: ${booking.reservationId || booking._id}

Booking Details:
- Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Pick-up Date: ${startDate}
- Return Date: ${endDate}
- Duration: ${booking.totalDays} day(s)
- Total Paid: $${booking.totalPrice.toFixed(2)}

Host Information:
- Name: ${host.firstName} ${host.lastName}
- Email: ${host.email}

Pick-up Location:
${vehicle.location?.address || ''}, ${vehicle.location?.city || ''}, ${vehicle.location?.state || ''} ${vehicle.location?.zipCode || ''}

Important Reminders:
- Bring a valid driver's license
- Arrive on time for pick-up
- Inspect the vehicle before driving

Thank you for choosing RentUFS!

Best regards,
The RentUFS Team
      `);
      console.log('-----------------------------------\n');
      return { success: true, dev: true };
    }

    const mailOptions = {
      from: `"RentUFS" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
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
                <h3 style="margin-top: 0; color: #10b981;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="detail-row">
                  <span class="label">Pick-up Date</span>
                  <span class="value">${startDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Return Date</span>
                  <span class="value">${endDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Duration</span>
                  <span class="value">${booking.totalDays} day(s)</span>
                </div>
                <div class="detail-row">
                  <span class="label">Location</span>
                  <span class="value">${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'}</span>
                </div>

                <div class="total">Total Paid: $${booking.totalPrice.toFixed(2)}</div>
              </div>

              <div class="host-info">
                <h4 style="margin-top: 0; color: #059669;">Host Information</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${host.firstName} ${host.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${host.email}</p>
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
- Pick-up Date: ${startDate}
- Return Date: ${endDate}
- Duration: ${booking.totalDays} day(s)
- Total Paid: $${booking.totalPrice.toFixed(2)}

Host Information:
- Name: ${host.firstName} ${host.lastName}
- Email: ${host.email}

Pick-up Location:
${vehicle.location?.city || 'N/A'}, ${vehicle.location?.state || 'N/A'}

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
    const transporter = createTransporter();
    const startDate = new Date(booking.startDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const endDate = new Date(booking.endDate).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

    if (!transporter) {
      console.log('📧 [DEV] Booking Notification Email to Host:', host.email);
      console.log('-----------------------------------');
      console.log(`To: ${host.email}`);
      console.log(`Subject: New Booking! ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
      console.log(`
Hi ${host.firstName},

Great news! You have a new confirmed booking for your vehicle!

Reservation ID: ${booking.reservationId || booking._id}

Booking Details:
- Vehicle: ${vehicle.year} ${vehicle.make} ${vehicle.model}
- Pick-up Date: ${startDate}
- Return Date: ${endDate}
- Duration: ${booking.totalDays} day(s)
- Earnings: $${booking.totalPrice.toFixed(2)}

Driver Information:
- Name: ${driver.firstName} ${driver.lastName}
- Email: ${driver.email}

Next Steps:
- Ensure your vehicle is clean and ready
- Confirm the pick-up location with the driver
- Have all necessary documents ready

Congratulations on your booking!

Best regards,
The RentUFS Team
      `);
      console.log('-----------------------------------\n');
      return { success: true, dev: true };
    }

    const mailOptions = {
      from: `"RentUFS" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
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
                <h3 style="margin-top: 0; color: #10b981;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

                <div class="detail-row">
                  <span class="label">Pick-up Date</span>
                  <span class="value">${startDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Return Date</span>
                  <span class="value">${endDate}</span>
                </div>
                <div class="detail-row">
                  <span class="label">Duration</span>
                  <span class="value">${booking.totalDays} day(s)</span>
                </div>

                <div class="earnings">Earnings: $${booking.totalPrice.toFixed(2)}</div>
              </div>

              <div class="driver-info">
                <h4 style="margin-top: 0; color: #1d4ed8;">Driver Information</h4>
                <p style="margin: 5px 0;"><strong>Name:</strong> ${driver.firstName} ${driver.lastName}</p>
                <p style="margin: 5px 0;"><strong>Email:</strong> ${driver.email}</p>
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
- Pick-up Date: ${startDate}
- Return Date: ${endDate}
- Duration: ${booking.totalDays} day(s)
- Earnings: $${booking.totalPrice.toFixed(2)}

Driver Information:
- Name: ${driver.firstName} ${driver.lastName}
- Email: ${driver.email}

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

module.exports = {
  sendWelcomeEmail,
  sendVehicleListedEmail,
  sendBookingConfirmationToDriver,
  sendBookingNotificationToHost
};
