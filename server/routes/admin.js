const express = require('express');
const router = express.Router();
const adminAuth = require('../middleware/adminAuth');

router.get('/ping', adminAuth, (req, res) => {
  res.json({
    ok: true,
    message: 'Admin access confirmed',
    user: {
      id: req.user._id,
      email: req.user.email,
      role: req.user.role
    }
  });
});

module.exports = router;
