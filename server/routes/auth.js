const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendWelcomeEmail } = require('../utils/emailService');

const router = express.Router();

// Register
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, phone, dateOfBirth, userType, driverLicense, profileImage, hostInfo } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ message: 'Phone number is required' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: 'User already exists' });
    }

    // Validate age for drivers and both (must be at least 21)
    if ((userType === 'driver' || userType === 'both') && dateOfBirth) {
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

    // Validate host info for hosts
    if ((userType === 'host' || userType === 'both') && hostInfo) {
      if (!hostInfo.accountType || !['individual', 'business'].includes(hostInfo.accountType)) {
        return res.status(400).json({ message: 'Please select Individual or Business account type' });
      }
      if (!hostInfo.taxId || !hostInfo.taxId.trim()) {
        return res.status(400).json({
          message: hostInfo.accountType === 'individual'
            ? 'Social Security Number is required for individual hosts'
            : 'Business Tax ID (EIN) is required for business hosts'
        });
      }
      if (hostInfo.accountType === 'individual') {
        const ssnDigits = hostInfo.taxId.replace(/\D/g, '');
        if (ssnDigits.length !== 9) {
          return res.status(400).json({ message: 'Please enter a valid 9-digit Social Security Number' });
        }
      } else {
        const einDigits = hostInfo.taxId.replace(/\D/g, '');
        if (einDigits.length !== 9) {
          return res.status(400).json({ message: 'Please enter a valid 9-digit EIN (XX-XXXXXXX)' });
        }
        if (!hostInfo.businessName || !hostInfo.businessName.trim()) {
          return res.status(400).json({ message: 'Business name is required for business accounts' });
        }
      }
    } else if ((userType === 'host' || userType === 'both') && !hostInfo) {
      return res.status(400).json({ message: 'Host account information is required' });
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

    // Add host info if provided (for hosts and both)
    if (hostInfo && (userType === 'host' || userType === 'both')) {
      const taxIdDigits = hostInfo.taxId.replace(/\D/g, '');
      userData.hostInfo = {
        accountType: hostInfo.accountType,
        taxId: taxIdDigits,
        taxIdLast4: taxIdDigits.slice(-4),
        businessName: hostInfo.accountType === 'business' ? hostInfo.businessName.trim() : undefined
      };
    }

    // Add driver license info if provided (for drivers and both)
    if (driverLicense && (userType === 'driver' || userType === 'both')) {
      userData.driverLicense = {
        licenseNumber: driverLicense.licenseNumber,
        state: driverLicense.state,
        expirationDate: driverLicense.expirationDate ? new Date(driverLicense.expirationDate) : undefined,
        licenseImage: driverLicense.licenseImage || undefined,
        verificationSelfie: driverLicense.verificationSelfie || undefined,
        faceMatchScore: typeof driverLicense.faceMatchScore === 'number' ? driverLicense.faceMatchScore : null,
        faceVerified: driverLicense.faceVerified === true
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
        profileImage: user.profileImage
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

    res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        userType: user.userType,
        profileImage: user.profileImage
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get current user
router.get('/me', auth, async (req, res) => {
  res.json(req.user);
});

// Request password reset
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Return success even if user not found (security best practice)
      return res.json({
        message: 'If an account with that email exists, a password reset link has been generated.'
      });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiration (1 hour)
    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // In a production environment, you would send an email here
    // For now, we return the token in the response (for demo/development purposes)
    res.json({
      message: 'If an account with that email exists, a password reset link has been generated.',
      // Remove the following line in production - only for development/demo
      resetToken: resetToken,
      resetUrl: `/reset-password/${resetToken}`
    });
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
