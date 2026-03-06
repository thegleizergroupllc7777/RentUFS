const express = require('express');
const crypto = require('crypto');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_your_key_here');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { sendEmailVerificationCode } = require('../utils/emailService');

const router = express.Router();

// Helper: resolve relative profile image path to full URL
function resolveProfileImage(user, req) {
  const userObj = typeof user.toObject === 'function' ? user.toObject() : { ...user };
  if (userObj.profileImage && userObj.profileImage.startsWith('/uploads/')) {
    const protocol = req.headers['x-forwarded-proto'] || req.protocol;
    const host = req.headers['x-forwarded-host'] || req.get('host');
    userObj.profileImage = `${protocol}://${host}${userObj.profileImage}`;
  }
  return userObj;
}

// Helper: get or create Stripe customer for a user
const getOrCreateStripeCustomer = async (user) => {
  // If user already has a Stripe customer ID, verify it still exists
  // (handles live/test key switches where the customer won't exist in the other mode)
  if (user.stripeCustomerId) {
    try {
      await stripe.customers.retrieve(user.stripeCustomerId);
      return user.stripeCustomerId;
    } catch (err) {
      console.log(`⚠️ Stripe customer ${user.stripeCustomerId} not found (likely key mode switch), creating new one`);
    }
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

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, phone, userType, profileImage, address, dateOfBirth } = req.body;

    const user = await User.findById(req.user._id);

    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (phone) user.phone = phone;
    if (userType) user.userType = userType;
    if (profileImage) user.profileImage = profileImage;
    if (dateOfBirth) user.dateOfBirth = new Date(dateOfBirth);
    if (address) {
      user.address = {
        street: address.street?.trim() || '',
        apt: address.apt?.trim() || '',
        city: address.city?.trim() || '',
        state: address.state?.trim() || '',
        zipCode: address.zipCode?.trim() || ''
      };
    }

    await user.save();

    res.json(resolveProfileImage(user, req));
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

    res.json(resolveProfileImage(user, req));
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
    // Auth middleware already loaded the user, but we need the full document (with password for save)
    const user = await User.findById(req.user._id);
    if (!user) {
      console.error('❌ host-tax-info: User not found for id:', req.user._id);
      return res.status(404).json({ message: 'User not found' });
    }

    const hostInfo = user.hostInfo || {};
    const acctType = hostInfo.accountType || 'individual';
    const taxIdLocked = !!(hostInfo.taxIdLocked);

    // Auto-fix: if taxIdLast4 exists but flag was never set (old data), set it now
    // Wrapped in try-catch so auto-fix failure never breaks the GET response
    let isLocked = taxIdLocked;
    if (!taxIdLocked && hostInfo.taxIdLast4) {
      const storedDigits = hostInfo.taxId ? hostInfo.taxId.replace(/\D/g, '') : '';
      if (storedDigits.length === 9) {
        try {
          user.set('hostInfo.taxIdLocked', true);
          await user.save();
          isLocked = true;
          console.log('🔒 Auto-locked tax ID for user:', user.email);
        } catch (saveErr) {
          console.error('⚠️ Auto-fix save failed (non-fatal):', saveErr.message);
          // Still treat as locked since the data qualifies
          isLocked = true;
        }
      }
    }

    res.json({
      accountType: acctType,
      legalFirstName: hostInfo.legalFirstName || '',
      legalLastName: hostInfo.legalLastName || '',
      legalAddress: hostInfo.legalAddress || { street: '', city: '', state: '', zipCode: '' },
      taxIdLast4: hostInfo.taxIdLast4 || '',
      taxIdLocked: isLocked,
      businessName: hostInfo.businessName || '',
      dba: hostInfo.dba || '',
      businessAddress: hostInfo.businessAddress || { street: '', city: '', state: '', zipCode: '' },
      displayPreference: hostInfo.displayPreference || 'personal',
      hasSubmitted: isLocked
    });
  } catch (error) {
    console.error('❌ Error fetching host tax info:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update host display preference
router.put('/host-display-preference', auth, async (req, res) => {
  try {
    const { displayPreference } = req.body;
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (!['host', 'both'].includes(user.userType)) {
      return res.status(403).json({ message: 'Only hosts can update display preference' });
    }

    if (!['personal', 'business'].includes(displayPreference)) {
      return res.status(400).json({ message: 'Display preference must be "personal" or "business"' });
    }

    // Business display requires business name to be set
    if (displayPreference === 'business') {
      const hostInfo = user.hostInfo || {};
      if (!hostInfo.businessName) {
        return res.status(400).json({ message: 'You must add a business name in tax settings before selecting business display' });
      }
    }

    user.set('hostInfo.displayPreference', displayPreference);
    await user.save();

    res.json({ displayPreference, message: 'Display preference updated successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Update host tax info
router.put('/host-tax-info', auth, async (req, res) => {
  try {
    const { accountType, taxId, legalFirstName, legalLastName, legalAddress, businessName, dba, businessAddress } = req.body;
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

    const ssnIsLocked = !!(user.hostInfo?.taxIdLocked);

    // --- Handle SSN/EIN ---
    let finalTaxIdDigits;
    if (ssnIsLocked) {
      // SSN is locked. The frontend should NOT send a taxId field at all.
      // If it does, silently ignore it (don't reject - just use the existing one).
      finalTaxIdDigits = (user.hostInfo.taxId || '').replace(/\D/g, '');
    } else {
      // First-time submission - taxId is required
      if (!taxId || !taxId.trim()) {
        return res.status(400).json({
          message: accountType === 'individual'
            ? 'Social Security Number is required'
            : 'Business Tax ID (EIN) is required'
        });
      }
      const digits = taxId.replace(/\D/g, '');
      if (digits.length !== 9) {
        return res.status(400).json({
          message: accountType === 'individual'
            ? 'Please enter a valid 9-digit Social Security Number'
            : 'Please enter a valid 9-digit EIN (XX-XXXXXXX)'
        });
      }
      finalTaxIdDigits = digits;
    }

    // --- Validate name/address (always required, always editable) ---
    if (accountType === 'individual') {
      if (!legalFirstName || !legalFirstName.trim()) {
        return res.status(400).json({ message: 'Legal first name is required' });
      }
      if (!legalLastName || !legalLastName.trim()) {
        return res.status(400).json({ message: 'Legal last name is required' });
      }
      if (!legalAddress || !legalAddress.street?.trim() || !legalAddress.city?.trim() || !legalAddress.state?.trim() || !legalAddress.zipCode?.trim()) {
        return res.status(400).json({ message: 'Complete legal address is required' });
      }
    }

    if (accountType === 'business') {
      if (!businessName || !businessName.trim()) {
        return res.status(400).json({ message: 'Business name is required for business accounts' });
      }
      if (!businessAddress || !businessAddress.street?.trim() || !businessAddress.city?.trim() || !businessAddress.state?.trim() || !businessAddress.zipCode?.trim()) {
        return res.status(400).json({ message: 'Complete business address is required for business accounts' });
      }
    }

    // --- Save everything ---
    user.set('hostInfo.accountType', accountType);
    user.set('hostInfo.taxId', finalTaxIdDigits);
    user.set('hostInfo.taxIdLast4', finalTaxIdDigits.slice(-4));
    user.set('hostInfo.taxIdLocked', true);

    if (!user.hostInfo?.displayPreference) {
      user.set('hostInfo.displayPreference', 'personal');
    }

    if (accountType === 'individual') {
      user.set('hostInfo.legalFirstName', legalFirstName.trim());
      user.set('hostInfo.legalLastName', legalLastName.trim());
      user.set('hostInfo.legalAddress', {
        street: legalAddress.street?.trim() || '',
        city: legalAddress.city?.trim() || '',
        state: legalAddress.state?.trim() || '',
        zipCode: legalAddress.zipCode?.trim() || ''
      });
      user.set('hostInfo.businessName', '');
      user.set('hostInfo.dba', '');
      user.set('hostInfo.businessAddress', { street: '', city: '', state: '', zipCode: '' });
    } else {
      user.set('hostInfo.businessName', businessName.trim());
      user.set('hostInfo.dba', dba ? dba.trim() : '');
      user.set('hostInfo.businessAddress', {
        street: businessAddress.street?.trim() || '',
        city: businessAddress.city?.trim() || '',
        state: businessAddress.state?.trim() || '',
        zipCode: businessAddress.zipCode?.trim() || ''
      });
      user.set('hostInfo.legalFirstName', '');
      user.set('hostInfo.legalLastName', '');
      user.set('hostInfo.legalAddress', { street: '', city: '', state: '', zipCode: '' });
    }

    await user.save();

    console.log('✅ Host tax info saved for:', user.email, '- Type:', accountType, '- Last4:', finalTaxIdDigits.slice(-4));

    res.json({
      accountType,
      legalFirstName: user.hostInfo.legalFirstName || '',
      legalLastName: user.hostInfo.legalLastName || '',
      legalAddress: user.hostInfo.legalAddress || { street: '', city: '', state: '', zipCode: '' },
      taxIdLast4: finalTaxIdDigits.slice(-4),
      taxIdLocked: true,
      businessName: user.hostInfo.businessName || '',
      dba: user.hostInfo.dba || '',
      businessAddress: user.hostInfo.businessAddress || { street: '', city: '', state: '', zipCode: '' },
      displayPreference: user.hostInfo.displayPreference || 'personal',
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

    // All user types can save license info (hosts need it for insurance integration)

    const existing = user.driverLicense ? user.driverLicense.toObject() : {};
    user.driverLicense = {
      ...existing,
      licenseNumber: licenseNumber || existing.licenseNumber,
      state: state || existing.state,
      expirationDate: expirationDate ? new Date(expirationDate) : existing.expirationDate,
      licenseImage: licenseImage !== undefined ? licenseImage : existing.licenseImage,
      verificationSelfie: verificationSelfie !== undefined ? verificationSelfie : existing.verificationSelfie,
      faceMatchScore: typeof faceMatchScore === 'number' ? faceMatchScore : existing.faceMatchScore,
      faceVerified: typeof faceVerified === 'boolean' ? faceVerified : existing.faceVerified
    };

    // Auto-verify when all required license documents and info are provided
    const dl = user.driverLicense;
    if (dl.licenseNumber && dl.state && dl.expirationDate && dl.licenseImage && dl.verificationSelfie) {
      dl.verified = true;
      dl.faceVerified = true;
    }

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

// ==========================================
// Account Management (Deactivate / Delete)
// ==========================================

// Remove host account (downgrade from 'both' to 'driver')
router.post('/account/remove-host', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.userType !== 'both') {
      return res.status(400).json({ message: 'You do not have a host account to remove.' });
    }

    // Check for active host bookings
    const Booking = require('../models/Booking');
    const now = new Date();
    const activeHostBookings = await Booking.countDocuments({
      host: user._id,
      status: { $in: ['active', 'confirmed', 'pending'] },
      endDate: { $gte: now }
    });

    if (activeHostBookings > 0) {
      return res.status(400).json({
        message: `You have ${activeHostBookings} active host booking(s). Please complete or cancel all host bookings before removing your host account.`
      });
    }

    // Set all vehicles to unavailable
    const Vehicle = require('../models/Vehicle');
    await Vehicle.updateMany(
      { host: user._id },
      { availability: false }
    );

    // Downgrade to driver only
    user.userType = 'driver';
    await user.save();

    console.log(`✅ Host account removed for: ${user.email} (now driver only)`);
    res.json(user);
  } catch (error) {
    console.error('❌ Error removing host account:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Remove driver account (downgrade from 'both' to 'host')
router.post('/account/remove-driver', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (user.userType !== 'both') {
      return res.status(400).json({ message: 'You do not have a driver account to remove.' });
    }

    // Check for active driver bookings
    const Booking = require('../models/Booking');
    const now = new Date();
    const activeDriverBookings = await Booking.countDocuments({
      driver: user._id,
      status: { $in: ['active', 'confirmed', 'pending'] },
      endDate: { $gte: now }
    });

    if (activeDriverBookings > 0) {
      return res.status(400).json({
        message: `You have ${activeDriverBookings} active driver booking(s). Please complete or cancel all driver bookings before removing your driver account.`
      });
    }

    // Downgrade to host only
    user.userType = 'host';
    await user.save();

    console.log(`✅ Driver account removed for: ${user.email} (now host only)`);
    res.json(user);
  } catch (error) {
    console.error('❌ Error removing driver account:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Deactivate account (soft disable - can be reactivated on login)
router.post('/account/deactivate', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.accountStatus = 'deactivated';
    user.deactivatedAt = new Date();
    await user.save();

    console.log(`⚠️ Account deactivated: ${user.email}`);
    res.json({ message: 'Account has been deactivated. You can reactivate it by logging in again.' });
  } catch (error) {
    console.error('❌ Error deactivating account:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Reactivate account (called during login if account is deactivated)
router.post('/account/reactivate', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.accountStatus = 'active';
    user.deactivatedAt = undefined;
    await user.save();

    console.log(`✅ Account reactivated: ${user.email}`);
    res.json({ message: 'Account has been reactivated.' });
  } catch (error) {
    console.error('❌ Error reactivating account:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Permanently delete account
router.delete('/account/delete', auth, async (req, res) => {
  try {
    const { confirmation } = req.body;

    if (confirmation !== 'DELETE') {
      return res.status(400).json({ message: 'Please type DELETE to confirm account deletion.' });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Auto-complete stale bookings whose end date has passed
    const Booking = require('../models/Booking');
    const now = new Date();
    await Booking.updateMany(
      {
        $or: [{ driver: user._id }, { host: user._id }],
        status: { $in: ['active', 'confirmed'] },
        endDate: { $lt: now }
      },
      { status: 'completed' }
    );

    // Auto-cancel stale pending bookings whose start date has passed
    await Booking.updateMany(
      {
        $or: [{ driver: user._id }, { host: user._id }],
        status: 'pending',
        startDate: { $lt: now }
      },
      { status: 'cancelled' }
    );

    // Check for truly active bookings (current or future, not expired)
    const activeBookings = await Booking.countDocuments({
      $or: [{ driver: user._id }, { host: user._id }],
      status: { $in: ['active', 'confirmed', 'pending'] },
      endDate: { $gte: now }
    });

    if (activeBookings > 0) {
      return res.status(400).json({
        message: `You have ${activeBookings} active booking(s). Please complete or cancel all bookings before deleting your account.`
      });
    }

    // Set vehicles to unavailable
    const Vehicle = require('../models/Vehicle');
    await Vehicle.updateMany(
      { host: user._id },
      { availability: false }
    );

    // Delete the user
    await User.findByIdAndDelete(user._id);

    console.log(`🗑️ Account permanently deleted: ${user.email}`);
    res.json({ message: 'Account has been permanently deleted.' });
  } catch (error) {
    console.error('❌ Error deleting account:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get integration status
router.get('/integrations', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    res.json({
      tollspot: {
        active: user.integrations?.tollspot?.active || false,
        connectedAt: user.integrations?.tollspot?.connectedAt || null,
        signedUp: user.integrations?.tollspot?.signedUp || false,
        signupUrl: process.env.TOLLSPOT_SIGNUP_URL || null
      }
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Toggle TollSpot integration
router.put('/integrations/tollspot', auth, async (req, res) => {
  try {
    const { active } = req.body;
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!['host', 'both'].includes(user.userType)) {
      return res.status(403).json({ message: 'Only hosts can manage integrations' });
    }

    user.set('integrations.tollspot.active', !!active);
    if (active && !user.integrations?.tollspot?.connectedAt) {
      user.set('integrations.tollspot.connectedAt', new Date());
    }
    if (!active) {
      user.set('integrations.tollspot.connectedAt', null);
    }

    await user.save();
    console.log(`✅ TollSpot integration ${active ? 'activated' : 'deactivated'} for: ${user.email}`);

    res.json({
      active: user.integrations.tollspot.active,
      connectedAt: user.integrations.tollspot.connectedAt
    });
  } catch (error) {
    console.error('❌ Error toggling TollSpot integration:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Mark TollSpot signup as completed
router.put('/integrations/tollspot/signed-up', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!['host', 'both'].includes(user.userType)) {
      return res.status(403).json({ message: 'Only hosts can manage integrations' });
    }

    user.set('integrations.tollspot.signedUp', true);
    await user.save();
    console.log(`✅ TollSpot signup confirmed for: ${user.email}`);

    res.json({ signedUp: true });
  } catch (error) {
    console.error('❌ Error confirming TollSpot signup:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Get user profile by ID — MUST be last: /:id is a catch-all that would shadow
// named GET routes like /host-tax-info, /driver-license, /payment-methods
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

module.exports = router;
