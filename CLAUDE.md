# CLAUDE.md - AI Assistant Guide for RentUFS

This document provides comprehensive guidance for AI assistants working with the RentUFS codebase.

## Project Overview

**RentUFS** is a full-stack peer-to-peer car rental marketplace (similar to Turo) that connects vehicle owners (hosts) with renters (drivers). It features a React frontend and Node.js/Express backend with MongoDB database.

## Technology Stack

### Backend
- **Node.js** with **Express 4.18** - Web framework
- **MongoDB** with **Mongoose 8.0** - Database and ODM
- **JWT (jsonwebtoken 9.0)** - Authentication
- **bcryptjs** - Password hashing
- **Stripe 20.1** - Payment processing
- **Multer 1.4** - Image uploads
- **Nodemailer 6.9** - Email notifications
- **Axios** - HTTP client for external APIs

### Frontend
- **React 18.2** - UI framework
- **React Router DOM 6.20** - Client-side routing
- **Axios** - HTTP client
- **@react-google-maps/api** - Map integration
- **@stripe/react-stripe-js** - Stripe payment components
- **CSS3** - Styling (no CSS framework)

## Quick Start Commands

```bash
# Install all dependencies (root + client)
npm run install-all

# Run both frontend and backend in development
npm run dev

# Run backend only (port 5000)
npm run server

# Run frontend only (port 3000)
npm run client

# Build frontend for production
npm run build
```

## Project Structure

```
RentUFS/
├── client/                          # React frontend
│   ├── public/                      # Static assets
│   └── src/
│       ├── components/              # Reusable UI components
│       │   ├── Navbar.js            # Navigation with auth state
│       │   ├── Footer.js
│       │   ├── PrivateRoute.js      # Route protection
│       │   ├── ImageUpload.js       # Image upload utility
│       │   ├── VehicleInspection.js # Pickup/return inspection
│       │   ├── InsuranceSelection.js
│       │   ├── MapView.js           # Google Maps integration
│       │   └── *.css                # Component styles
│       ├── context/
│       │   └── AuthContext.js       # Authentication state
│       ├── config/
│       │   ├── api.js               # API URL configuration
│       │   └── axios.js             # Axios instance with interceptors
│       ├── data/                    # Static reference data
│       │   ├── vehicleModels.js     # Make/model lookup
│       │   └── vehicleFeatures.js   # Feature options
│       ├── pages/
│       │   ├── Home.js              # Landing page
│       │   ├── Auth/                # Login, Register, Password reset
│       │   ├── Driver/              # Marketplace, VehicleDetail, MyBookings
│       │   ├── Host/                # Dashboard, AddVehicle, HostBookings
│       │   └── Payment/             # Checkout, Success, Cancel
│       ├── App.js                   # Main component with routes
│       └── index.js                 # React entry point
│
├── server/                          # Express backend
│   ├── models/                      # Mongoose schemas
│   │   ├── User.js                  # User accounts
│   │   ├── Vehicle.js               # Vehicle listings
│   │   ├── Booking.js               # Reservations
│   │   └── Review.js                # Ratings/reviews
│   ├── routes/                      # API endpoints
│   │   ├── auth.js                  # Authentication
│   │   ├── vehicles.js              # Vehicle CRUD & search
│   │   ├── bookings.js              # Booking management
│   │   ├── payment.js               # Stripe integration
│   │   ├── reviews.js               # Review system
│   │   ├── insurance.js             # Insurance options
│   │   ├── upload.js                # Image uploads
│   │   ├── users.js                 # User profiles
│   │   └── reports.js               # Analytics
│   ├── middleware/
│   │   └── auth.js                  # JWT verification middleware
│   ├── utils/
│   │   ├── emailService.js          # Email templates & sending
│   │   └── geocoding.js             # Google Maps API
│   ├── uploads/                     # Local image storage
│   └── index.js                     # Server entry point
│
├── package.json                     # Root scripts and backend deps
├── render.yaml                      # Render deployment config
└── *.md                             # Documentation files
```

## Key Entry Points

| File | Purpose |
|------|---------|
| `server/index.js` | Express server setup, MongoDB connection, route registration |
| `client/src/index.js` | React app initialization |
| `client/src/App.js` | Main component with all route definitions |
| `client/src/context/AuthContext.js` | Global authentication state |
| `client/src/config/axios.js` | Axios instance with token injection |

## API Routes Reference

### Authentication (`/api/auth`)
- `POST /register` - Register new user
- `POST /login` - User login, returns JWT token
- `GET /me` - Get authenticated user (requires auth)
- `POST /forgot-password` - Request password reset
- `POST /reset-password` - Reset password with token

### Vehicles (`/api/vehicles`)
- `GET /` - List vehicles (supports filters: type, location, price, seats, radius)
- `GET /geocode?address=...` - Geocode an address
- `GET /:id` - Get single vehicle
- `GET /host/my-vehicles` - Get host's vehicles (auth required)
- `POST /` - Create vehicle listing (auth required)
- `PUT /:id` - Update vehicle (auth required)
- `DELETE /:id` - Delete vehicle (auth required)

### Bookings (`/api/bookings`)
- `POST /` - Create booking request
- `GET /my-bookings` - Get driver's bookings
- `GET /host-bookings` - Get host's bookings
- `PATCH /:id/status` - Update booking status
- `GET /:id/extension-price` - Calculate extension pricing
- `POST /:id/extend` - Extend booking

### Payment (`/api/payment`)
- `POST /create-payment-intent` - Create Stripe payment intent
- `POST /create-checkout-session` - Create Stripe checkout session
- `GET /session-status` - Check payment status
- `POST /confirm-booking` - Finalize booking after payment

### Other Routes
- `POST /api/reviews` - Create review
- `GET /api/reviews/vehicle/:id` - Get vehicle reviews
- `POST /api/upload` - Upload images
- `GET /api/users/:id` - Get user profile
- `GET /api/reports/host-earnings` - Host earnings report
- `GET /api/health` - Health check

## Frontend Routes

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | Home | Landing page |
| `/login` | Login | User login |
| `/register` | Register | Multi-step registration |
| `/marketplace` | Marketplace | Browse vehicles with map |
| `/vehicle/:id` | VehicleDetail | Vehicle details & booking |
| `/my-bookings` | MyBookings | Driver's bookings |
| `/host/dashboard` | HostDashboard | Host's vehicle listings |
| `/host/add-vehicle` | AddVehicle | Create listing |
| `/host/edit-vehicle/:id` | EditVehicle | Modify listing |
| `/host/bookings` | HostBookings | Host's booking requests |
| `/host/reports` | HostReports | Analytics & earnings |
| `/payment/checkout` | Checkout | Payment page |
| `/payment/success` | Success | Payment confirmation |

## Database Models

### User
```javascript
{
  email: String (unique, required),
  password: String (hashed),
  firstName: String,
  lastName: String,
  phone: String,
  userType: 'driver' | 'host' | 'both',
  driverLicense: { number, state, expirationDate },
  profileImage: String,
  rating: Number,
  reviewCount: Number,
  resetPasswordToken: String,
  resetPasswordExpires: Date
}
```

### Vehicle
```javascript
{
  host: ObjectId (ref: User),
  make: String,
  model: String,
  year: Number,
  type: 'sedan' | 'suv' | 'truck' | 'van' | 'sports' | 'luxury' | 'electric',
  transmission: 'automatic' | 'manual',
  seats: Number,
  description: String,
  features: [String],
  location: { city, state, zipCode, address },
  geoLocation: { type: 'Point', coordinates: [lng, lat] }, // 2dsphere indexed
  pricePerDay: Number,
  pricePerWeek: Number,
  pricePerMonth: Number,
  images: [String],
  registrationImage: String,
  availability: Boolean,
  rating: Number,
  tripCount: Number
}
```

### Booking
```javascript
{
  reservationId: String (auto: RUFS-00001),
  vehicle: ObjectId (ref: Vehicle),
  driver: ObjectId (ref: User),
  host: ObjectId (ref: User),
  startDate: Date,
  endDate: Date,
  totalDays: Number,
  rentalType: 'daily' | 'weekly' | 'monthly',
  totalPrice: Number,
  status: 'pending' | 'confirmed' | 'active' | 'completed' | 'cancelled',
  paymentStatus: 'pending' | 'paid' | 'refunded',
  pickupInspection: { ... },
  returnInspection: { ... },
  insurance: { type, price, coverage },
  extensions: [{ ... }]
}
```

### Review
```javascript
{
  booking: ObjectId (ref: Booking),
  vehicle: ObjectId (ref: Vehicle),
  reviewer: ObjectId (ref: User),
  reviewee: ObjectId (ref: User),
  reviewType: 'driver-to-host' | 'host-to-driver' | 'vehicle',
  rating: Number (1-5),
  comment: String
}
```

## Environment Variables

### Backend (`.env` in root)
```env
# Database
MONGODB_URI=mongodb+srv://...

# Authentication
JWT_SECRET=your_secure_random_string

# Server
PORT=5000
NODE_ENV=development
CLIENT_URL=http://localhost:3000

# External Services
GOOGLE_MAPS_API_KEY=your_key
STRIPE_SECRET_KEY=sk_test_...

# Email (optional)
EMAIL_SERVICE=gmail
EMAIL_USER=email@gmail.com
EMAIL_PASSWORD=app_password
```

### Frontend
- `REACT_APP_API_URL` - Optional, auto-detected from `client/src/config/api.js`

## Code Conventions

### Backend
- **Module System**: CommonJS (`require`/`module.exports`)
- **Route Naming**: kebab-case (`/api/host-bookings`)
- **Function Naming**: camelCase (`geocodeAddress`)
- **Model Naming**: PascalCase (`User`, `Vehicle`)
- **Error Handling**: try-catch with `res.status(code).json({ message })`
- **Authentication**: Bearer token in Authorization header

### Frontend
- **Components**: Functional components with hooks
- **Component Naming**: PascalCase (`Navbar.js`, `MapView.js`)
- **Styling**: Separate `.css` files per component
- **State Management**: React Context for auth, local state otherwise
- **API Calls**: Use `axiosInstance` from `config/axios.js`

### Styling Patterns
- Black background (#000000)
- Green accent color (#10b981 or #00FF66)
- BEM-like CSS naming (`auth-page`, `auth-container`)
- Responsive design with max-width containers

## Common Development Tasks

### Adding a New API Endpoint
1. Create or modify route file in `server/routes/`
2. Add route registration in `server/index.js`
3. Add auth middleware if protected: `router.get('/path', auth, handler)`

### Adding a New Page
1. Create component in `client/src/pages/`
2. Add route in `client/src/App.js`
3. Use `PrivateRoute` wrapper for authenticated routes

### Adding a New Component
1. Create `ComponentName.js` in `client/src/components/`
2. Create `ComponentName.css` for styles
3. Import and use in pages

### Working with Authentication
```javascript
// Frontend - using auth context
import { useAuth } from '../context/AuthContext';
const { user, isAuthenticated, login, logout } = useAuth();

// Backend - protecting routes
const auth = require('../middleware/auth');
router.get('/protected', auth, (req, res) => {
  // req.user available here
});
```

### Working with Geolocation
```javascript
// Backend search with radius
const vehicles = await Vehicle.find({
  geoLocation: {
    $near: {
      $geometry: { type: 'Point', coordinates: [lng, lat] },
      $maxDistance: radiusInMeters
    }
  }
});
```

## Testing

No formal test suite exists. To add tests:
- Backend: Jest for unit/integration tests
- Frontend: React Testing Library
- Test files: `*.test.js` or `*.spec.js`

## Deployment

**Platform**: Render (configured in `render.yaml`)

**Two services**:
1. Backend API - Node.js web service on port 5000
2. Frontend - Static site from `client/build/`

**Build commands**:
- Backend: `npm install`
- Frontend: `cd client && npm install && npm run build`

## Important Notes for AI Assistants

1. **Always read files before editing** - Understand existing patterns first
2. **Use axios instance** - Don't create new axios imports, use `config/axios.js`
3. **Follow existing patterns** - Match the code style already in place
4. **Token in localStorage** - Auth token stored with key `'token'`
5. **Mongoose population** - Use `.populate('host')` for related data
6. **Console logging** - Use emoji prefixes for visibility (✅, ❌, 🚗, 📧)
7. **Error responses** - Always return `{ message: '...' }` for API errors
8. **CORS configured** - Backend allows CLIENT_URL origin
9. **Images in /uploads** - Served statically, stored with timestamp prefix
10. **Geospatial queries** - Vehicle.geoLocation has 2dsphere index

## File Size Reference

Largest files by complexity:
- `server/routes/bookings.js` (~466 lines) - Booking management
- `server/routes/vehicles.js` (~346 lines) - Vehicle CRUD
- `client/src/pages/Driver/Marketplace.js` (~600+ lines) - Main search UI
- `client/src/pages/Host/AddVehicle.js` (~400+ lines) - Multi-step form

## Git Workflow

- Main development through feature branches
- Auto-merge CI configured for Claude branches
- Commit messages should be descriptive
- Push to feature branch, create PR for review
