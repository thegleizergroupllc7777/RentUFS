const nodemailer = require('nodemailer');

// Create reusable transporter
const createTransporter = () => {
  // For development, use ethereal.email (fake SMTP) or configure your own SMTP
  // For production, use services like SendGrid, Mailgun, AWS SES, etc.

  if (process.env.EMAIL_SERVICE === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASSWORD // Use App Password for Gmail
      }
    });
  } else if (process.env.SMTP_HOST) {
    // Custom SMTP configuration
    return nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD
      }
    });
  } else {
    // Development mode - create test account using ethereal.email
    console.log('⚠️  Email service not configured. Emails will be logged to console only.');
    return null;
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
      console.log(`Subject: Welcome to RentUFS - Your Account is Ready!`);
      console.log(`
Hi ${user.firstName},

Welcome to RentUFS! 🚗

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

Thank you for choosing RentUFS!

Best regards,
The RentUFS Team
      `);
      console.log('-----------------------------------\n');
      return { success: true, dev: true };
    }

    const userTypeText = user.userType === 'driver' ? 'Driver' :
                         user.userType === 'host' ? 'Host' : 'Driver & Host';

    const mailOptions = {
      from: `"RentUFS" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: user.email,
      subject: 'Welcome to RentUFS - Your Account is Ready! 🚗',
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 30px 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .logo {
              font-size: 2rem;
              font-weight: bold;
              font-style: italic;
              transform: skewX(-10deg);
              display: inline-block;
              border: 2px solid #000;
              padding: 10px 20px;
              border-radius: 8px;
              background: white;
              color: #10b981;
            }
            .content {
              background: #f9fafb;
              padding: 30px;
              border-radius: 0 0 8px 8px;
            }
            .badge {
              background: #10b981;
              color: white;
              padding: 5px 15px;
              border-radius: 20px;
              display: inline-block;
              font-size: 0.9rem;
              margin: 10px 0;
            }
            .button {
              background: #10b981;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              display: inline-block;
              margin-top: 20px;
            }
            .features {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
            }
            .feature-item {
              padding: 10px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .feature-item:last-child {
              border-bottom: none;
            }
            .footer {
              text-align: center;
              color: #6b7280;
              padding: 20px;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="logo">🏎️ RentUFS</div>
              <h1 style="margin-top: 20px;">Welcome Aboard!</h1>
            </div>

            <div class="content">
              <h2>Hi ${user.firstName},</h2>

              <p>Your RentUFS account has been successfully created! 🎉</p>

              <div class="badge">${userTypeText} Account</div>

              <div class="features">
                <h3 style="margin-top: 0; color: #10b981;">What's Next?</h3>

                ${user.userType === 'driver' ? `
                  <div class="feature-item">✅ Browse thousands of vehicles</div>
                  <div class="feature-item">✅ Book your first ride</div>
                  <div class="feature-item">✅ Rate and review your experience</div>
                ` : user.userType === 'host' ? `
                  <div class="feature-item">✅ List your vehicles</div>
                  <div class="feature-item">✅ Set your own prices</div>
                  <div class="feature-item">✅ Start earning money</div>
                ` : `
                  <div class="feature-item">✅ Browse and rent vehicles</div>
                  <div class="feature-item">✅ List your own cars</div>
                  <div class="feature-item">✅ Earn while you rent</div>
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
              <p>© ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
              <p>You're receiving this email because you created an account on RentUFS.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${user.firstName},

Welcome to RentUFS! 🚗

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

Thank you for choosing RentUFS!

Best regards,
The RentUFS Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Welcome email sent to:', user.email);
    console.log('Message ID:', info.messageId);

    return { success: true, messageId: info.messageId };
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

Congratulations! Your vehicle has been successfully listed on RentUFS! 🎉

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
The RentUFS Team
      `);
      console.log('-----------------------------------\n');
      return { success: true, dev: true };
    }

    const mailOptions = {
      from: `"RentUFS" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to: user.email,
      subject: `Your ${vehicle.year} ${vehicle.make} ${vehicle.model} is Now Listed! 🚗`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <style>
            body {
              font-family: Arial, sans-serif;
              line-height: 1.6;
              color: #333;
            }
            .container {
              max-width: 600px;
              margin: 0 auto;
              padding: 20px;
            }
            .header {
              background: linear-gradient(135deg, #10b981 0%, #059669 100%);
              color: white;
              padding: 30px 20px;
              text-align: center;
              border-radius: 8px 8px 0 0;
            }
            .content {
              background: #f9fafb;
              padding: 30px;
              border-radius: 0 0 8px 8px;
            }
            .vehicle-card {
              background: white;
              padding: 20px;
              border-radius: 8px;
              margin: 20px 0;
              border-left: 4px solid #10b981;
            }
            .vehicle-detail {
              padding: 8px 0;
              border-bottom: 1px solid #e5e7eb;
            }
            .vehicle-detail:last-child {
              border-bottom: none;
            }
            .price {
              font-size: 1.5rem;
              color: #10b981;
              font-weight: bold;
            }
            .button {
              background: #10b981;
              color: white;
              padding: 12px 30px;
              text-decoration: none;
              border-radius: 6px;
              display: inline-block;
              margin-top: 20px;
            }
            .footer {
              text-align: center;
              color: #6b7280;
              padding: 20px;
              font-size: 0.9rem;
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Vehicle Listed Successfully!</h1>
            </div>

            <div class="content">
              <h2>Hi ${user.firstName},</h2>

              <p>Great news! Your vehicle is now live on RentUFS and ready to be rented!</p>

              <div class="vehicle-card">
                <h3 style="margin-top: 0; color: #10b981;">${vehicle.year} ${vehicle.make} ${vehicle.model}</h3>

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
              <p>© ${new Date().getFullYear()} RentUFS. All rights reserved.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
Hi ${user.firstName},

Congratulations! Your vehicle has been successfully listed on RentUFS! 🎉

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
The RentUFS Team
      `
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('✅ Vehicle listing email sent to:', user.email);

    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending vehicle listing email:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendVehicleListedEmail
};
