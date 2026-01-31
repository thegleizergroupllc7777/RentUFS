const express = require('express');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendEmailVerificationCode } = require('../utils/emailService');

const router = express.Router();

// Helper: get or create Stripe customer for a user
const getOrCreateStripeCustomer = async (user) => {
  if (user.stripeCustomerId) {
    return user.stripeCustomerId;
  }
  const customer = await stripe.customers.create({
    email: user.email,
    name: `${user.firstName} ${user.lastName}`,
    metadata: { userId: user._id.toString() }
  });
  user.stripeCustomerId = customer.id;
  await user.save();
  return customer.id;
};

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

// Get driver license info
router.get('/driver-license', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({
      licenseNumber: user.driverLicense?.licenseNumber || '',
      state: user.driverLicense?.state || '',
      expirationDate: user.driverLicense?.expirationDate || '',
      licenseImage: user.driverLicense?.licenseImage || '',
      verificationSelfie: user.driverLicense?.verificationSelfie || '',
      faceVerified: user.driverLicense?.faceVerified || false,
      faceMatchScore: user.driverLicense?.faceMatchScore || null
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update driver license info
router.put('/driver-license', auth, async (req, res) => {
  try {
    const { licenseNumber, state, expirationDate, licenseImage, verificationSelfie, faceMatchScore, faceVerified } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!['driver', 'both'].includes(user.userType)) {
      return res.status(403).json({ message: 'Only drivers can update license information' });
    }

    user.driverLicense = {
      ...user.driverLicense,
      licenseNumber: licenseNumber || user.driverLicense?.licenseNumber,
      state: state || user.driverLicense?.state,
      expirationDate: expirationDate ? new Date(expirationDate) : user.driverLicense?.expirationDate,
      licenseImage: licenseImage !== undefined ? licenseImage : user.driverLicense?.licenseImage,
      verificationSelfie: verificationSelfie !== undefined ? verificationSelfie : user.driverLicense?.verificationSelfie,
      faceMatchScore: typeof faceMatchScore === 'number' ? faceMatchScore : user.driverLicense?.faceMatchScore,
      faceVerified: typeof faceVerified === 'boolean' ? faceVerified : user.driverLicense?.faceVerified
    };

    await user.save();
    console.log('✅ Driver license updated for:', user.email);

    res.json({
      message: 'Driver license information updated successfully',
      licenseNumber: user.driverLicense.licenseNumber,
      state: user.driverLicense.state,
      expirationDate: user.driverLicense.expirationDate,
      licenseImage: user.driverLicense.licenseImage,
      verificationSelfie: user.driverLicense.verificationSelfie,
      faceVerified: user.driverLicense.faceVerified,
      faceMatchScore: user.driverLicense.faceMatchScore
    });
  } catch (error) {
    console.error('❌ Error updating driver license:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Create SetupIntent for saving a card via Stripe Elements
router.post('/payment-methods/setup-intent', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const customerId = await getOrCreateStripeCustomer(user);

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
    });

    res.json({ clientSecret: setupIntent.client_secret });
  } catch (error) {
    console.error('❌ Error creating setup intent:', error);
    res.status(500).json({ message: 'Failed to initialize card setup', error: error.message });
  }
});

// Get payment methods
router.get('/payment-methods', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user.paymentMethods || []);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Save payment method after Stripe SetupIntent confirmation
router.post('/payment-methods', auth, async (req, res) => {
  try {
    const { paymentMethodId, nickname } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!paymentMethodId) {
      return res.status(400).json({ message: 'Payment method ID is required' });
    }

    // Retrieve the payment method from Stripe to get card details
    const pm = await stripe.paymentMethods.retrieve(paymentMethodId);
    if (!pm || pm.type !== 'card') {
      return res.status(400).json({ message: 'Invalid payment method' });
    }

    // Check for duplicate (same last4 + brand + exp)
    const isDuplicate = user.paymentMethods.some(
      existing => existing.stripePaymentMethodId === paymentMethodId
    );
    if (isDuplicate) {
      return res.status(400).json({ message: 'This card is already saved' });
    }

    const card = pm.card;
    const isDefault = user.paymentMethods.length === 0;

    const brandMap = { visa: 'Visa', mastercard: 'Mastercard', amex: 'Amex', discover: 'Discover' };
    const cardBrand = brandMap[card.brand] || card.brand || 'Card';

    user.paymentMethods.push({
      nickname: nickname?.trim() || `${cardBrand} ending in ${card.last4}`,
      cardBrand,
      last4: card.last4,
      expMonth: card.exp_month,
      expYear: card.exp_year,
      isDefault,
      stripePaymentMethodId: paymentMethodId
    });

    await user.save();
    console.log('✅ Payment method saved via Stripe for:', user.email);
    res.json(user.paymentMethods);
  } catch (error) {
    console.error('❌ Error saving payment method:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Delete payment method
router.delete('/payment-methods/:cardId', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const card = user.paymentMethods.id(req.params.cardId);
    if (!card) return res.status(404).json({ message: 'Payment method not found' });

    // Detach from Stripe if it has a Stripe ID
    if (card.stripePaymentMethodId) {
      try {
        await stripe.paymentMethods.detach(card.stripePaymentMethodId);
      } catch (stripeErr) {
        console.error('⚠️ Could not detach from Stripe (may already be detached):', stripeErr.message);
      }
    }

    const wasDefault = card.isDefault;
    card.deleteOne();

    // If deleted card was default, make the first remaining card default
    if (wasDefault && user.paymentMethods.length > 0) {
      user.paymentMethods[0].isDefault = true;
    }

    await user.save();
    console.log('✅ Payment method removed for:', user.email);
    res.json(user.paymentMethods);
  } catch (error) {
    console.error('❌ Error removing payment method:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Set default payment method
router.patch('/payment-methods/:cardId/default', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    user.paymentMethods.forEach(pm => { pm.isDefault = false; });
    const card = user.paymentMethods.id(req.params.cardId);
    if (!card) return res.status(404).json({ message: 'Payment method not found' });
    card.isDefault = true;

    await user.save();
    res.json(user.paymentMethods);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
