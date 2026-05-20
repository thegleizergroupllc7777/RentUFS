const auth = require('./auth');

const adminAuth = (req, res, next) => {
  auth(req, res, (err) => {
    if (err) return next(err);
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Admin access required' });
    }
    next();
  });
};

module.exports = adminAuth;
