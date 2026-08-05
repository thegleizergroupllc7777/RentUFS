// ─────────────────────────────────────────────────────────────────────────────
// Driver verification (ClearDrive / TeqMobility "Driver Vetting")
//
// Driver-facing endpoints that let a logged-in renter run the ClearDrive
// license + selfie identity check and read their result. This is ADDITIVE and
// self-contained:
//   • It only ever reads/writes the new driverLicense.clearDrive* fields.
//   • It NEVER touches booking, payment, insurance, or toll code.
//   • The "is verification required?" switch defaults OFF, and /config
//     fail-safes to OFF on any error, so the booking flow can never be blocked
//     by a bug in here.
// ─────────────────────────────────────────────────────────────────────────────

const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const SystemState = require('../models/SystemState');
const clearDrive = require('../utils/clearDrive');

const router = express.Router();

// Is the "drivers must be verified to book" requirement switched ON?
// Defaults OFF — nothing is enforced until the owner flips it on.
const isVerificationRequired = async () => {
  const doc = await SystemState.findOne({ key: 'clearDriveVerification' });
  return !!(doc && String(doc.value).toLowerCase() === 'on');
};

// GET /api/verification/config
// Tells the client whether verification is required right now. Fail-safe: any
// error reports NOT required, so a hiccup here can never block booking.
router.get('/config', auth, async (req, res) => {
  try {
    const configured = clearDrive.isConfigured();
    // FAIL-OPEN: the gate is only "on" when the owner switch is ON *and*
    // ClearDrive is actually working. If the key is missing or the service is
    // down, we report NOT required so drivers can never be locked out of booking
    // by something they can't fix.
    const enabled = configured && (await isVerificationRequired());
    res.json({ enabled, configured });
  } catch (err) {
    res.json({ enabled: false, configured: false });
  }
});

// POST /api/verification/start
// Create/refresh this driver's ClearDrive applicant and return the verification
// URL they complete (license photo + live selfie). Uses the PERSONAL flow so any
// renter can finish it (no gig-account login required).
router.post('/start', auth, async (req, res) => {
  try {
    if (!clearDrive.isConfigured()) {
      return res.status(400).json({ message: 'Verification is not set up yet. Please try again later.' });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const dl = user.driverLicense || {};
    const created = await clearDrive.createApplicant({
      email: user.email,
      firstname: user.firstName,
      lastname: user.lastName,
      dl_number: dl.licenseNumber || undefined,
      dl_state: dl.state || undefined,
      dl_expiration: dl.expirationDate ? new Date(dl.expirationDate).toISOString().slice(0, 10) : undefined,
      birth_date: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().slice(0, 10) : undefined,
      external_id: user._id.toString()
    });
    // Resolve which applicant to verify. Normally we just created them. But if
    // this driver was already set up on a prior attempt, ClearDrive rejects the
    // duplicate with "already exists" — in that case reuse their EXISTING
    // applicant (looked up by the same external_id) and hand them a fresh link,
    // instead of dead-ending them on the error.
    let applicant_id;
    if (created.success) {
      applicant_id = created.applicant?.id;
    } else if (/already exists/i.test(created.error || '')) {
      const existing = await clearDrive.getLatestVerification({ external_id: user._id.toString() });
      applicant_id = existing.success ? existing.applicant?.id : null;
    } else {
      return res.status(400).json({ message: created.error || 'Could not start verification', code: created.code });
    }
    if (!applicant_id) {
      return res.status(400).json({ message: 'Could not start verification. Please contact support.' });
    }
    const urlRes = await clearDrive.createVerificationUrl({ applicant_id, flow: 'PERSONAL' });
    if (!urlRes.success) {
      return res.status(400).json({ message: urlRes.error || 'Could not create verification link', code: urlRes.code });
    }

    user.driverLicense = user.driverLicense || {};
    user.driverLicense.clearDriveApplicantId = applicant_id;
    user.driverLicense.clearDriveStatus = 'IN_PROGRESS';
    await user.save();

    res.json({ success: true, url: urlRes.url });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// GET /api/verification/status
// Read this driver's latest ClearDrive result and stamp their profile verified
// when it PASSES. Safe to call anytime; it only updates the clearDrive* fields.
router.get('/status', auth, async (req, res) => {
  try {
    if (!clearDrive.isConfigured()) {
      return res.json({ status: 'NOT_CONFIGURED', verified: false });
    }
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const result = await clearDrive.getLatestVerification({ external_id: user._id.toString() });
    if (!result.success) {
      return res.status(400).json({ message: result.error });
    }
    const status = result.status || 'NOT_STARTED';
    user.driverLicense = user.driverLicense || {};
    user.driverLicense.clearDriveStatus = status;
    if (String(status).toUpperCase() === 'PASSED') {
      user.driverLicense.clearDriveVerified = true;
      user.driverLicense.clearDriveCheckedAt = new Date();
    }
    await user.save();

    res.json({ status, verified: user.driverLicense.clearDriveVerified === true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
