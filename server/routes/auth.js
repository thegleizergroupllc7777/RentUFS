const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/emailService');

const router = express.Router();

// Helper: resolve relative profile image path to full URL
function resolveProfileImageUrl(profileImage, req) {
  if (profileImage && profileImage.startsWith('/uploads/')) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    return `${protocol}://${host}${profileImage}`;
  }
  return profileImage;
}

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dateOfBirth, userType, driverLicense, profileImage, hostInfo, address } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate age for drivers (must be at least 21)
    if (userType === 'driver' && dateOfBirth) {
      const birthDate = new Date(dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();

      // Calculate exact age
      const exactAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

      if (exactAge < 21) {
        return res.status(400).json({
          message: 'You must be at least 21 years old to register as a driver.'
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

    // Add driver license info if provided (for drivers)
    if (driverLicense && userType === 'driver') {
      userData.driverLicense = {
        licenseNumber: driverLicense.licenseNumber,
        state: driverLicense.state,
        expirationDate: driverLicense.expirationDate ? new Date(driverLicense.expirationDate) : undefined,
        licenseImage: driverLicense.licenseImage || undefined,
        verificationSelfie: driverLicense.verificationSelfie || undefined,
        faceMatchScore: typeof driverLicense.faceMatchScore === 'number' ? driverLicense.faceMatchScore : null,
        faceVerified: driverLicense.faceVerified === true,
        licenseNumberMatched: driverLicense.licenseNumberMatched === true
      };
    }

    const user = new User(userData);

    await user.save();

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

    if (password.length < 6) {
      return res.status(400).json({ message: 'Password must be at least 6 characters' });
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
