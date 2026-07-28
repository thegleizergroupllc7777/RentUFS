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
const tollRoutes = require('./routes/tolls');
const chargeRoutes = require('./routes/charges');
const adminRoutes = require('./routes/admin');
const smsRoutes = require('./routes/sms');
const verificationRoutes = require('./routes/verification');
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
app.use('/api/tolls', tollRoutes);
app.use('/api/charges', chargeRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/sms', smsRoutes);
app.use('/api/verification', verificationRoutes);

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
if (!process.env.TEQMOBILITY_API_KEY) {
  console.warn('⚠️  TEQMOBILITY_API_KEY not set — TeqMobility insurance integration disabled');
} else {
  console.log('🛡️ TeqMobility: API key configured, base URL:', process.env.TEQMOBILITY_API_URL || 'https://insurance.sandbox.teqmobility.com');
}
if (!process.env.TOLLSPOT_API_KEY) {
  console.warn('⚠️  TOLLSPOT_API_KEY not set — TollSpot toll management integration disabled');
} else {
  console.log('🛣️ TollSpot: API key configured, base URL:', process.env.TOLLSPOT_BASE_URL || 'https://api.tollspot.com');
}
if (!process.env.TOLLSPOT_WEBHOOK_SECRET) {
  console.warn('⚠️  TOLLSPOT_WEBHOOK_SECRET not set — TollSpot inbound endpoints (reservations/charges) disabled');
}

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/rentufs', {
  serverSelectionTimeoutMS: 15000,
  socketTimeoutMS: 45000,
})
  .then(async () => {
    console.log('✅ Connected to MongoDB');
    // Start the return reminder scheduler after DB connection
    startReturnReminderScheduler(10); // Check every 10 minutes

    // One-time backfill: set tripCount from completed bookings
    try {
      const Booking = require('./models/Booking');
      const Vehicle = require('./models/Vehicle');
      const counts = await Booking.aggregate([
        { $match: { status: 'completed' } },
        { $group: { _id: '$vehicle', count: { $sum: 1 } } }
      ]);
      if (counts.length > 0) {
        const bulkOps = counts.map(c => ({
          updateOne: {
            filter: { _id: c._id },
            update: { $set: { tripCount: c.count } }
          }
        }));
        const result = await Vehicle.bulkWrite(bulkOps);
        console.log(`✅ Backfilled tripCount for ${result.modifiedCount} vehicles`);
      }
    } catch (err) {
      console.error('⚠️ tripCount backfill error:', err.message);
    }

    // One-time backfill: generate SEO slugs for vehicles that don't have one.
    // Idempotent — only touches vehicles where slug is missing.
    try {
      const Vehicle = require('./models/Vehicle');
      const { buildVehicleSlug } = require('./utils/vehicleSlug');
      const needSlug = await Vehicle.find({ $or: [{ slug: null }, { slug: { $exists: false } }] })
        .select('_id year make model location')
        .lean();
      if (needSlug.length > 0) {
        const ops = needSlug.map(v => ({
          updateOne: { filter: { _id: v._id }, update: { $set: { slug: buildVehicleSlug(v) } } }
        }));
        const result = await Vehicle.bulkWrite(ops);
        console.log(`✅ Backfilled slug for ${result.modifiedCount} vehicles`);
      }
    } catch (err) {
      console.error('⚠️ slug backfill error:', err.message);
    }

    // One-time backfill: assign reservationId to bookings missing one
    try {
      const bookingsCol = mongoose.connection.db.collection('bookings');
      const countersCol = mongoose.connection.db.collection('counters');
      const missing = await bookingsCol.find({
        $or: [{ reservationId: null }, { reservationId: { $exists: false } }, { reservationId: '' }]
      }).sort({ createdAt: 1 }).toArray();
      if (missing.length > 0) {
        for (const booking of missing) {
          const counter = await countersCol.findOneAndUpdate(
            { _id: 'reservationId' },
            { $inc: { seq: 1 } },
            { upsert: true, returnDocument: 'after' }
          );
          await bookingsCol.updateOne(
            { _id: booking._id },
            { $set: { reservationId: `RUFS-${counter.seq.toString().padStart(5, '0')}` } }
          );
        }
        console.log(`✅ Backfilled reservationId for ${missing.length} bookings`);
      }
    } catch (err) {
      console.error('⚠️ reservationId backfill error:', err.message);
    }
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// Health check
app.get('/api/health', async (req, res) => {
  const emailConfigured = !!(process.env.SENDGRID_API_KEY || process.env.EMAIL_SERVICE || process.env.SMTP_HOST);
  const emailProvider = process.env.SENDGRID_API_KEY ? 'sendgrid' :
                        process.env.EMAIL_SERVICE ? process.env.EMAIL_SERVICE :
                        process.env.SMTP_HOST ? 'smtp' : 'none';

  const teqMobilityConfigured = !!process.env.TEQMOBILITY_API_KEY;
  const teqMobilityUrl = process.env.TEQMOBILITY_API_URL || 'https://insurance.sandbox.teqmobility.com';

  const tollspotConfigured = !!process.env.TOLLSPOT_API_KEY;
  const tollspotUrl = process.env.TOLLSPOT_BASE_URL || 'https://api.tollspot.com';

  const result = {
    status: 'ok',
    message: 'RentUFS API is running',
    email: {
      configured: emailConfigured,
      provider: emailProvider,
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@rentufs.com',
      clientUrl: process.env.CLIENT_URL || 'http://localhost:3000'
    },
    teqMobility: {
      configured: teqMobilityConfigured,
      baseUrl: teqMobilityUrl,
      connected: false
    },
    tollspot: {
      configured: tollspotConfigured,
      baseUrl: tollspotUrl
    }
  };

  // If TeqMobility is configured, test the connection
  if (teqMobilityConfigured) {
    try {
      const { isConfigured } = require('./utils/teqmobility');
      result.teqMobility.apiKeyPresent = isConfigured();
      result.teqMobility.connected = true;
    } catch (err) {
      result.teqMobility.error = err.message;
    }
  }

  res.json(result);
});

// Dynamic sitemap.xml for SEO — lists public pages + every available vehicle
// so search engines can discover listings. Read-only; never affects app flows.
app.get('/sitemap.xml', async (req, res) => {
  try {
    const Vehicle = require('./models/Vehicle');
    const base = (process.env.CLIENT_URL || 'https://app.rentufs.com').replace(/\/$/, '');

    // Static public pages
    const staticUrls = ['', '/marketplace', '/login', '/register'];

    // Available vehicles only (one URL per listing). Prefer the SEO slug;
    // fall back to _id for any vehicle that doesn't have one yet.
    const vehicles = await Vehicle.find({ availability: true })
      .select('_id slug updatedAt')
      .limit(5000)
      .lean();

    const esc = (s) => String(s).replace(/&/g, '&amp;');
    const urlTag = (loc, lastmod) =>
      `  <url><loc>${esc(loc)}</loc>${lastmod ? `<lastmod>${new Date(lastmod).toISOString().split('T')[0]}</lastmod>` : ''}</url>`;

    const urls = [
      ...staticUrls.map(p => urlTag(`${base}${p}`)),
      ...vehicles.map(v => urlTag(`${base}/vehicle/${v.slug || v._id}`, v.updatedAt))
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>`;

    res.set('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error('❌ Error generating sitemap:', err.message);
    res.status(500).send('Error generating sitemap');
  }
});

// Serve React frontend in production
if (process.env.NODE_ENV === 'production') {
  const fs = require('fs');
  const clientBuild = path.join(__dirname, '..', 'client', 'build');
  const indexPath = path.join(clientBuild, 'index.html');

  if (fs.existsSync(indexPath)) {
    app.use(express.static(clientBuild));

    // SPA catch-all: any non-API route serves index.html so React Router handles it
    app.get('*', (req, res) => {
      res.sendFile(indexPath);
    });
  } else {
    console.warn('⚠️  client/build/index.html not found — frontend will not be served from this process');
    console.warn('   If deploying frontend separately, this is expected. Otherwise run: npm run build');

    // Catch-all returns a helpful JSON response instead of ENOENT errors
    app.get('*', (req, res) => {
      if (req.path.startsWith('/api/')) return; // API routes already handled above
      res.status(503).json({
        message: 'Frontend not available on this server',
        hint: 'The React frontend may be deployed as a separate service. Check your CLIENT_URL configuration.'
      });
    });
  }
}

const PORT = process.env.PORT || 5000;
const HOST = '0.0.0.0';
app.listen(PORT, HOST, () => {
  console.log(`🚗 RentUFS server running on http://${HOST}:${PORT}`);
});
