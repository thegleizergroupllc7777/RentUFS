const express = require('express');
const Booking = require('../models/Booking');
const User = require('../models/User');
const auth = require('../middleware/auth');

const router = express.Router();

// Get agreement data for a booking
router.get('/:bookingId', auth, async (req, res) => {
  try {
    const booking = await Booking.findById(req.params.bookingId)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone dateOfBirth address driverLicense')
      .populate('host', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only driver or host can view agreement
    const userId = req.user._id.toString();
    if (booking.driver._id.toString() !== userId && booking.host._id.toString() !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    res.json(booking);
  } catch (error) {
    console.error('❌ Error fetching agreement:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// Sign the rental agreement
router.post('/:bookingId/sign', auth, async (req, res) => {
  try {
    const { signature, address } = req.body;

    if (!signature || !signature.trim()) {
      return res.status(400).json({ message: 'Signature (typed full name) is required' });
    }

    if (!address || !address.street || !address.city || !address.state || !address.zipCode) {
      return res.status(400).json({ message: 'Complete address is required to sign the agreement' });
    }

    const booking = await Booking.findById(req.params.bookingId)
      .populate('vehicle')
      .populate('driver', 'firstName lastName email phone')
      .populate('host', 'firstName lastName email phone');

    if (!booking) {
      return res.status(404).json({ message: 'Booking not found' });
    }

    // Only the driver can sign
    if (booking.driver._id.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: 'Only the renter can sign the agreement' });
    }

    // Don't allow re-signing
    if (booking.agreement && booking.agreement.signed) {
      return res.status(400).json({ message: 'Agreement has already been signed' });
    }

    // Update agreement on booking
    booking.agreement = {
      signed: true,
      signedAt: new Date(),
      driverSignature: signature.trim(),
      driverAddressAtSigning: {
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zipCode: address.zipCode.trim()
      },
      amendments: []
    };

    await booking.save();

    // Also save address to user profile if they don't have one
    const user = await User.findById(req.user._id);
    if (user && (!user.address || !user.address.street)) {
      user.address = {
        street: address.street.trim(),
        city: address.city.trim(),
        state: address.state.trim(),
        zipCode: address.zipCode.trim()
      };
      await user.save();
    }

    console.log('✅ Rental agreement signed for booking:', booking.reservationId);

    res.json({
      message: 'Agreement signed successfully',
      agreement: booking.agreement
    });
  } catch (error) {
    console.error('❌ Error signing agreement:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
