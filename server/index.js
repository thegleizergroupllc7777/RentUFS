require('dotenv').config();
const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');

const authRoutes = require('./routes/auth');
const vehicleRoutes = require('./routes/vehicles');
const bookingRoutes = require('./routes/bookings');
const reviewRoutes = require('./routes/reviews');
const userRoutes = require('./routes/users');
const uploadRoutes = require('./routes/upload');
const paymentRoutes = require('./routes/payment');
const reportRoutes = require('./routes/reports');
const insuranceRoutes = require('./routes/insurance');
const messageRoutes = require('./routes/messages');
const agreementRoutes = require('./routes/agreements');
const connectRoutes = require('./routes/connect');
const { startReturnReminderScheduler } = require('./utils/scheduler');

const app = express();

// Trust proxy (Render, Heroku, etc.) so req.protocol reflects the actual scheme
app.set('trust proxy', 1);

// Middleware
app.use(cors());

// Stripe webhook needs raw body - must be before express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));
app.use('/api/connect/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/vehicles', vehicleRoutes);
app.use('/api/bookings', bookingRoutes);
app.use('/api/reviews', reviewRoutes);
app.use('/api/users', userRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/insurance', insuranceRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/agreements', agreementRoutes);
app.use('/api/connect', connectRoutes);

// Validate critical environment variables
if (!process.env.MONGODB_URI) {
  console.warn('⚠️  MONGODB_URI not set — falling back to local MongoDB');
}
if (!process.env.JWT_SECRET) {
  console.warn('⚠️  JWT_SECRET not set — authentication will not work properly');
}
if (!process.env.GOOGLE_MAPS_API_KEY) {
  console.warn('⚠️  GOOGLE_MAPS_API_KEY not set — geocoding and map search disabled');
}
if (!process.env.STRIPE_SECRET_KEY) {
  console.warn('⚠️  STRIPE_SECRET_KEY not set — payment processing disabled');
}

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rentufs', {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
})
  .then(() => {
    console.log('✅ Connected to MongoDB');
    // Start the return reminder scheduler after DB connection
    startReturnReminderScheduler(10); // Check every 10 minutes
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Health check
app.get('/api/health', (req, res) => {
  const emailConfigured = !!(process.env.SENDGRID_API_KEY || process.env.EMAIL_SERVICE || process.env.SMTP_HOST);
  const emailProvider = process.env.SENDGRID_API_KEY ? 'sendgrid' :
                        process.env.EMAIL_SERVICE ? process.env.EMAIL_SERVICE :
                        process.env.SMTP_HOST ? 'smtp' : 'none';
  res.json({
    status: 'ok',
    message: 'RentUFS API is running',
    email: {
      configured: emailConfigured,
      provider: emailProvider,
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@rentufs.com',
      clientUrl: process.env.CLIENT_URL || 'http://localhost:3000'
    }
  });
});

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const clientBuild = path.join(__dirname, '..', 'client', 'build');
  app.use(express.static(clientBuild));

  // SPA catch-all: any non-API route serves index.html so React Router handles it
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuild, 'index.html'));
  });
}

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚗 RentUFS server running on http://${HOST}:${PORT}`);
});
