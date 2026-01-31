const express = require('express');
const crypto = require('crypto');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendEmailVerificationCode } = require('../utils/emailService');

const router = express.Router();

// Get user profile
router.get('/:id', async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, phone, userType, profileImage } = req.body;

    const user = await User.findById(req.user._id);

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (userType) user.userType = userType;
    if (profileImage) user.profileImage = profileImage;

    await user.save();

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update profile image only
router.put('/profile-image', auth, async (req, res) => {
  try {
    const { profileImage } = req.body;

    if (!profileImage) {
      return res.status(400).json({ message: 'Profile image is required' });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { profileImage },
      { new: true }
    ).select('-password');

    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Request email change - sends verification code to new email
router.post('/request-email-change', auth, async (req, res) => {
  try {
    const { newEmail } = req.body;

    if (!newEmail || !newEmail.trim()) {
      return res.status(400).json({ message: 'New email address is required' });
    }

    const cleanEmail = newEmail.toLowerCase().trim();

    // Check if same as current
    const user = await User.findById(req.user._id);
    if (user.email === cleanEmail) {
      return res.status(400).json({ message: 'This is already your current email address' });
    }

    // Check if email is already taken
    const existingUser = await User.findOne({ email: cleanEmail });
    if (existingUser) {
      return res.status(400).json({ message: 'This email address is already in use' });
    }

    // Generate 6-digit verification code
    const code = crypto.randomInt(100000, 999999).toString();

    // Store pending email and code (expires in 15 minutes)
    user.pendingEmail = cleanEmail;
    user.emailVerificationCode = code;
    user.emailVerificationExpires = new Date(Date.now() + 15 * 60 * 1000);
    await user.save();

    // Send verification code to the NEW email
    await sendEmailVerificationCode(cleanEmail, user.firstName, code);

    console.log('📧 Email change requested for user:', user.email, '-> new:', cleanEmail);

    res.json({ message: 'Verification code sent to your new email address' });
  } catch (error) {
    console.error('❌ Error requesting email change:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Confirm email change with verification code
router.post('/confirm-email-change', auth, async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || !code.trim()) {
      return res.status(400).json({ message: 'Verification code is required' });
    }

    const user = await User.findById(req.user._id);

    if (!user.pendingEmail || !user.emailVerificationCode) {
      return res.status(400).json({ message: 'No pending email change request found' });
    }

    // Check if code has expired
    if (user.emailVerificationExpires < new Date()) {
      user.pendingEmail = null;
      user.emailVerificationCode = null;
      user.emailVerificationExpires = null;
      await user.save();
      return res.status(400).json({ message: 'Verification code has expired. Please request a new one.' });
    }

    // Check if code matches
    if (user.emailVerificationCode !== code.trim()) {
      return res.status(400).json({ message: 'Invalid verification code' });
    }

    // Double-check email isn't taken (race condition)
    const existingUser = await User.findOne({ email: user.pendingEmail });
    if (existingUser) {
      user.pendingEmail = null;
      user.emailVerificationCode = null;
      user.emailVerificationExpires = null;
      await user.save();
      return res.status(400).json({ message: 'This email address is already in use' });
    }

    // Update email
    const oldEmail = user.email;
    user.email = user.pendingEmail;
    user.pendingEmail = null;
    user.emailVerificationCode = null;
    user.emailVerificationExpires = null;
    await user.save();

    console.log('✅ Email changed for user:', oldEmail, '->', user.email);

    res.json({
      message: 'Email address updated successfully',
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
    console.error('❌ Error confirming email change:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get host tax info (only last 4 digits visible)
router.get('/host-tax-info', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    res.json({
      accountType: user.hostInfo?.accountType || 'individual',
      taxIdLast4: user.hostInfo?.taxIdLast4 || '',
      businessName: user.hostInfo?.businessName || '',
      dba: user.hostInfo?.dba || '',
      businessAddress: user.hostInfo?.businessAddress || {},
      hasSubmitted: !!(user.hostInfo?.taxIdLast4)
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update host tax info
router.put('/host-tax-info', auth, async (req, res) => {
  try {
    const { accountType, taxId, businessName, dba, businessAddress } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!['host', 'both'].includes(user.userType)) {
      return res.status(403).json({ message: 'Only hosts can update tax information' });
    }

    if (!accountType || !['individual', 'business'].includes(accountType)) {
      return res.status(400).json({ message: 'Please select Individual or Business account type' });
    }

    if (!taxId || !taxId.trim()) {
      return res.status(400).json({
        message: accountType === 'individual'
          ? 'Social Security Number is required'
          : 'Business Tax ID (EIN) is required'
      });
    }

    const taxIdDigits = taxId.replace(/\D/g, '');
    if (taxIdDigits.length !== 9) {
      return res.status(400).json({
        message: accountType === 'individual'
          ? 'Please enter a valid 9-digit Social Security Number'
          : 'Please enter a valid 9-digit EIN (XX-XXXXXXX)'
      });
    }

    if (accountType === 'business' && (!businessName || !businessName.trim())) {
      return res.status(400).json({ message: 'Business name is required for business accounts' });
    }

    if (accountType === 'business') {
      if (!businessAddress || !businessAddress.street?.trim() || !businessAddress.city?.trim() || !businessAddress.state?.trim() || !businessAddress.zipCode?.trim()) {
        return res.status(400).json({ message: 'Complete business address is required for business accounts' });
      }
    }

    user.hostInfo = {
      accountType,
      taxId: taxIdDigits,
      taxIdLast4: taxIdDigits.slice(-4),
      businessName: accountType === 'business' ? businessName.trim() : undefined,
      dba: accountType === 'business' && dba ? dba.trim() : undefined,
      businessAddress: accountType === 'business' && businessAddress ? {
        street: businessAddress.street?.trim() || '',
        city: businessAddress.city?.trim() || '',
        state: businessAddress.state?.trim() || '',
        zipCode: businessAddress.zipCode?.trim() || ''
      } : undefined
    };

    await user.save();

    console.log('✅ Host tax info updated for:', user.email, '- Type:', accountType);

    res.json({
      message: 'Tax information saved successfully',
      accountType: user.hostInfo.accountType,
      taxIdLast4: user.hostInfo.taxIdLast4,
      businessName: user.hostInfo.businessName || '',
      dba: user.hostInfo.dba || '',
      businessAddress: user.hostInfo.businessAddress || {},
      hasSubmitted: true
    });
  } catch (error) {
    console.error('❌ Error updating host tax info:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
