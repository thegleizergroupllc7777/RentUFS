require('dotenv').config();
const express = require('express');
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
const { startReturnReminderScheduler } = require('./utils/scheduler');

const app = express();

// Middleware
app.use(cors());

// Stripe webhook needs raw body - must be before express.json()
app.use('/api/payment/webhook', express.raw({ type: 'application/json' }));

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use('/uploads', express.static('uploads'));

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

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rentufs')
  .then(() => {
    console.log('✅ Connected to MongoDB');
    // Start the return reminder scheduler after DB connection
    startReturnReminderScheduler(10); // Check every 10 minutes
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'RentUFS API is running' });
});

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚗 RentUFS server running on http://${HOST}:${PORT}`);
});
