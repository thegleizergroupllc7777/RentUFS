const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const User = require('../models/User');
const Otp = require('../models/Otp');
const auth = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordResetEmail, sendRegistrationOtp } = require('../utils/emailService');

const router = express.Router();

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

// Rate limit tracker for password reset requests (email -> timestamp)
const passwordResetRateLimit = new Map();
const PASSWORD_RESET_COOLDOWN = 2 * 60 * 1000; // 2 minutes between reset emails

// Rate limit tracker for OTP requests (email -> timestamp)
const otpRateLimit = new Map();
const OTP_COOLDOWN = 60 * 1000; // 60 seconds between OTP sends

// Helper: resolve relative profile image path to full URL
function resolveProfileImageUrl(profileImage, req) {
  if (profileImage && profileImage.startsWith('/uploads/')) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}${profileImage}`;
  }
  return profileImage;
}

// Send OTP for registration email verification
router.post('/send-otp', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Rate limit: prevent rapid-fire OTP sends
    const lastSend = otpRateLimit.get(normalizedEmail);
    if (lastSend && Date.now() - lastSend < OTP_COOLDOWN) {
      const secondsLeft = Math.ceil((OTP_COOLDOWN - (Date.now() - lastSend)) / 1000);
      return res.status(429).json({ message: `Please wait ${secondsLeft} seconds before requesting a new code.` });
    }

    // Check if email is already registered
    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'An account with this email already exists.' });
    }

    // Generate 6-digit code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Delete any existing OTPs for this email
    await Otp.deleteMany({ email: normalizedEmail });

    // Save new OTP (expires in 10 minutes)
    await Otp.create({
      email: normalizedEmail,
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    });

    // Send the OTP email
    const emailResult = await sendRegistrationOtp(normalizedEmail, code);

    if (emailResult.dev) {
      console.log(`📧 [DEV] Registration OTP for ${normalizedEmail}: ${code}`);
      return res.json({ message: 'Verification code sent to your email.', dev: true, code });
    } else if (!emailResult.success) {
      return res.status(500).json({ message: 'Failed to send verification email. Please try again.' });
    }

    // Record for rate limiting
    otpRateLimit.set(normalizedEmail, Date.now());

    console.log(`📧 Registration OTP sent to: ${normalizedEmail}`);
    res.json({ message: 'Verification code sent to your email.' });
  } catch (error) {
    console.error('❌ Send OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify OTP for registration email verification
router.post('/verify-otp', async (req, res) => {
  try {
    const { email, code } = req.body;

    if (!email || !code) {
      return res.status(400).json({ message: 'Email and verification code are required.' });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const otp = await Otp.findOne({
      email: normalizedEmail,
      code: code.trim(),
      expiresAt: { $gt: new Date() }
    });

    if (!otp) {
      return res.status(400).json({ message: 'Invalid or expired verification code.' });
    }

    // Mark as verified
    otp.verified = true;
    await otp.save();

    console.log(`✅ Email verified via OTP: ${normalizedEmail}`);
    res.json({ message: 'Email verified successfully.', verified: true });
  } catch (error) {
    console.error('❌ Verify OTP error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dateOfBirth, userType, driverLicense, profileImage, hostInfo, address } = req.body;

    // Verify that email was confirmed via OTP
    const verifiedOtp = await Otp.findOne({
      email: email.toLowerCase().trim(),
      verified: true,
      expiresAt: { $gt: new Date() }
    });
    if (!verifiedOtp) {
      return res.status(400).json({ message: 'Please verify your email address before registering.' });
    }

    // Validate name fields
    if (firstName && firstName.length > 30) {
      return res.status(400).json({ message: 'First name must be 30 characters or less' });
    }
    if (lastName && lastName.length > 30) {
      return res.status(400).json({ message: 'Last name must be 30 characters or less' });
    }
    if (firstName && /[^a-zA-Z\s\-'.]/.test(firstName)) {
      return res.status(400).json({ message: 'First name can only contain letters, spaces, hyphens, and apostrophes' });
    }
    if (lastName && /[^a-zA-Z\s\-'.]/.test(lastName)) {
      return res.status(400).json({ message: 'Last name can only contain letters, spaces, hyphens, and apostrophes' });
    }

    // Validate email length
    if (email && email.length > 100) {
      return res.status(400).json({ message: 'Email must be 100 characters or less' });
    }

    // Validate password
    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (password.length > 40) {
      return res.status(400).json({ message: 'Password must be 40 characters or less' });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      return res.status(400).json({ message: 'Phone number must be exactly 10 digits' });
    }

    // Validate address field lengths
    if (address) {
      if (address.street && address.street.length > 60) {
        return res.status(400).json({ message: 'Street address must be 60 characters or less' });
      }
      if (address.apt && address.apt.length > 10) {
        return res.status(400).json({ message: 'Apt/Suite/Unit must be 10 characters or less' });
      }
      if (address.city && address.city.length > 35) {
        return res.status(400).json({ message: 'City must be 35 characters or less' });
      }
      if (address.state && address.state.length > 2) {
        return res.status(400).json({ message: 'State must be 2 characters or less' });
      }
      if (address.zipCode) {
        const zipDigits = address.zipCode.replace(/\D/g, '');
        if (zipDigits.length !== 5) {
          return res.status(400).json({ message: 'Zip code must be exactly 5 digits' });
        }
      }
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate age (must be at least 21)
    if (dateOfBirth) {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();

      // Calculate exact age
      const exactAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

      if (exactAge < 21) {
        return res.status(400).json({
          message: 'You must be at least 21 years old to register.'
        });
      }
    }

    const userData = {
      email,
      password,
      firstName,
      lastName,
      phone,
      dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : undefined,
      userType: userType || 'driver',
      profileImage: profileImage || undefined
    };

    // Add address if provided
    if (address && (address.street || address.city || address.state || address.zipCode)) {
      userData.address = {
        street: address.street?.trim() || '',
        apt: address.apt?.trim() || '',
        city: address.city?.trim() || '',
        state: address.state?.trim() || '',
        zipCode: address.zipCode?.trim() || ''
      };
    }

    // Add host info if provided (for hosts)
    if (hostInfo && userType === 'host') {
      const taxIdDigits = hostInfo.taxId.replace(/\D/g, '');
      userData.hostInfo = {
        accountType: hostInfo.accountType,
        taxId: taxIdDigits,
        taxIdLast4: taxIdDigits.slice(-4),
        taxIdLocked: false,
        legalFirstName: hostInfo.accountType === 'individual' && hostInfo.legalFirstName ? hostInfo.legalFirstName.trim() : undefined,
        legalLastName: hostInfo.accountType === 'individual' && hostInfo.legalLastName ? hostInfo.legalLastName.trim() : undefined,
        legalAddress: hostInfo.accountType === 'individual' && hostInfo.legalAddress ? {
          street: hostInfo.legalAddress.street?.trim() || '',
          city: hostInfo.legalAddress.city?.trim() || '',
          state: hostInfo.legalAddress.state?.trim() || '',
          zipCode: hostInfo.legalAddress.zipCode?.trim() || ''
        } : undefined,
        businessName: hostInfo.accountType === 'business' && hostInfo.businessName ? hostInfo.businessName.trim() : undefined,
        dba: hostInfo.accountType === 'business' && hostInfo.dba ? hostInfo.dba.trim() : undefined,
        businessAddress: hostInfo.accountType === 'business' && hostInfo.businessAddress ? {
          street: hostInfo.businessAddress.street?.trim() || '',
          city: hostInfo.businessAddress.city?.trim() || '',
          state: hostInfo.businessAddress.state?.trim() || '',
          zipCode: hostInfo.businessAddress.zipCode?.trim() || ''
        } : undefined
      };
    }

    // Add driver license info if provided (for all user types - needed for insurance)
    if (driverLicense) {
      const dl = {
        licenseNumber: driverLicense.licenseNumber,
        state: driverLicense.state,
        expirationDate: driverLicense.expirationDate ? new Date(driverLicense.expirationDate) : undefined,
        licenseImage: driverLicense.licenseImage || undefined,
        verificationSelfie: driverLicense.verificationSelfie || undefined,
        faceMatchScore: typeof driverLicense.faceMatchScore === 'number' ? driverLicense.faceMatchScore : null,
        faceVerified: driverLicense.faceVerified === true,
        licenseNumberMatched: driverLicense.licenseNumberMatched === true
      };
      // Auto-verify when all required fields are provided at registration
      if (dl.licenseNumber && dl.state && dl.expirationDate && dl.licenseImage && dl.verificationSelfie) {
        dl.verified = true;
        dl.faceVerified = true;
      }
      userData.driverLicense = dl;
    }

    const user = new User(userData);

    await user.save();

    // Clean up used OTP
    await Otp.deleteMany({ email: email.toLowerCase().trim() });

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn: '7d' }
    );

    // Send welcome email (async, don't wait for it)
    sendWelcomeEmail({
      email: user.email,
      firstName: user.firstName,
      userType: user.userType
    }).catch(err => console.error('Failed to send welcome email:', err));

    res.status(201).json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        profileImage: resolveProfileImageUrl(user.profileImage, req)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn: '7d' }
    );

    // Check if account is deactivated - return token but flag it
    if (user.accountStatus === 'deactivated') {
      return res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          profileImage: resolveProfileImageUrl(user.profileImage, req)
        },
        deactivated: true,
        deactivatedAt: user.deactivatedAt
      });
    }

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        profileImage: resolveProfileImageUrl(user.profileImage, req)
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Google Sign-In: verify ID token, create user if new, return JWT
// Body: { credential: <Google ID token>, userType?: 'driver'|'host'|'both' }
// - Returning users: signed in immediately (userType ignored)
// - New users with userType: account created
// - New users without userType: responds { needsUserType: true } so UI can prompt
router.post('/google', async (req, res) => {
  try {
    if (!googleClient) {
      return res.status(500).json({ message: 'Google Sign-In is not configured on the server' });
    }

    const { credential, userType } = req.body;
    if (!credential) {
      return res.status(400).json({ message: 'Missing Google credential' });
    }

    // Verify the ID token with Google
    let payload;
    try {
      const ticket = await googleClient.verifyIdToken({
        idToken: credential,
        audience: process.env.GOOGLE_CLIENT_ID
      });
      payload = ticket.getPayload();
    } catch (verifyErr) {
      console.error('❌ Google token verification failed:', verifyErr.message);
      return res.status(401).json({ message: 'Invalid Google credential' });
    }

    if (!payload?.email || !payload?.email_verified) {
      return res.status(401).json({ message: 'Google account email is not verified' });
    }

    const googleId = payload.sub;
    const email = payload.email.toLowerCase().trim();
    let firstName = payload.given_name || '';
    let lastName = payload.family_name || '';
    const fullName = (payload.name || '').trim();
    if ((!firstName || !lastName) && fullName) {
      const parts = fullName.split(/\s+/).filter(Boolean);
      if (!firstName && parts.length > 0) firstName = parts[0];
      if (!lastName && parts.length > 1) lastName = parts.slice(1).join(' ');
    }
    const googleProfileImage = payload.picture || '';

    // Look for existing account by googleId, then by email (to link accounts)
    let user = await User.findOne({ googleId });
    if (!user) {
      user = await User.findOne({ email });
      if (user) {
        // Link the existing email-based account to this Google identity
        user.googleId = googleId;
        if (!user.profileImage && googleProfileImage) {
          user.profileImage = googleProfileImage;
        }
        await user.save();
      }
    }

    // New user flow
    if (!user) {
      const allowedTypes = ['driver', 'host', 'both'];
      if (!userType || !allowedTypes.includes(userType)) {
        // Tell the client to collect userType, then re-submit
        return res.json({ needsUserType: true });
      }

      user = new User({
        email,
        firstName: firstName || email.split('@')[0],
        lastName: lastName || '',
        googleId,
        userType,
        profileImage: googleProfileImage || ''
      });
      await user.save();

      sendWelcomeEmail({
        email: user.email,
        firstName: user.firstName,
        userType: user.userType
      }).catch(err => console.error('Failed to send welcome email:', err));
    }

    if (user.accountStatus === 'deactivated') {
      const token = jwt.sign(
        { userId: user._id },
        process.env.JWT_SECRET || 'your_jwt_secret_key',
        { expiresIn: '7d' }
      );
      return res.json({
        token,
        user: {
          id: user._id,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          userType: user.userType,
          profileImage: resolveProfileImageUrl(user.profileImage, req)
        },
        deactivated: true,
        deactivatedAt: user.deactivatedAt
      });
    }

    const token = jwt.sign(
      { userId: user._id },
      process.env.JWT_SECRET || 'your_jwt_secret_key',
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        profileImage: resolveProfileImageUrl(user.profileImage, req)
      }
    });
  } catch (error) {
    console.error('❌ Google auth error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  const user = req.user.toObject();
  // Resolve relative profile image path to full URL
  if (user.profileImage && user.profileImage.startsWith('/uploads/')) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    user.profileImage = `${protocol}://${host}${user.profileImage}`;
  }
  res.json(user);
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email || !email.trim()) {
      return res.status(400).json({ message: 'Email is required' });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const successMessage = 'If an account with that email exists, a password reset link has been sent.';

    // Rate limit: prevent rapid-fire reset emails (causes Yahoo/other providers to defer)
    const lastRequest = passwordResetRateLimit.get(normalizedEmail);
    if (lastRequest && Date.now() - lastRequest < PASSWORD_RESET_COOLDOWN) {
      console.log(`⏳ Password reset rate limited for: ${normalizedEmail} (cooldown active)`);
      return res.json({ message: successMessage });
    }

    const user = await User.findOne({ email: normalizedEmail });
    if (!user) {
      // Return success even if user not found (security best practice)
      return res.json({ message: successMessage });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiration (1 hour)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // Send password reset email and await the result
    const emailResult = await sendPasswordResetEmail(user, resetToken);

    if (emailResult.dev) {
      console.log('⚠️  Email service not configured — password reset email logged to console only');
      return res.status(503).json({
        message: 'Email service is not configured. Please contact support or check server environment variables (SENDGRID_API_KEY, EMAIL_SERVICE, or SMTP_HOST).'
      });
    } else if (!emailResult.success) {
      console.error('❌ Failed to send password reset email:', emailResult.error);
      return res.status(500).json({
        message: 'Failed to send password reset email. Please try again later.'
      });
    }

    // Record successful send for rate limiting
    passwordResetRateLimit.set(normalizedEmail, Date.now());

    res.json({ message: successMessage });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Verify reset token
router.get('/verify-reset-token/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    res.json({
      message: 'Token is valid',
      email: user.email
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Reset password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, password } = req.body;

    if (!token || !password) {
      return res.status(400).json({ message: 'Token and password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }
    if (password.length > 40) {
      return res.status(400).json({ message: 'Password must be 40 characters or less' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }

    // Update password (will be hashed by pre-save hook)
    user.password = password;
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;
    await user.save();

    res.json({ message: 'Password has been reset successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
