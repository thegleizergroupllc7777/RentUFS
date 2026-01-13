# RentUFS - Car Rental Marketplace

A full-stack peer-to-peer car rental marketplace similar to Turo, connecting vehicle owners (hosts) with renters (drivers).

## Features

### For Drivers
- Browse available vehicles with advanced filtering
- View detailed vehicle information and host profiles
- Book vehicles with date selection
- Manage bookings and trip history
- Leave reviews and ratings

### For Hosts
- List and manage vehicles
- Set pricing and availability
- Manage booking requests
- Accept or decline reservations
- Track vehicle statistics and earnings

### General Features
- User authentication with JWT
- Dual role support (user can be both driver and host)
- Real-time booking status updates
- Review and rating system
- Responsive design for mobile and desktop

## Tech Stack

### Frontend
- **React** - UI framework
- **React Router** - Navigation
- **Axios** - HTTP client
- **CSS3** - Styling

### Backend
- **Node.js** - Runtime environment
- **Express** - Web framework
- **MongoDB** - Database
- **Mongoose** - ODM
- **JWT** - Authentication
- **bcryptjs** - Password hashing

## Installation

### Prerequisites
- Node.js (v14 or higher)
- MongoDB (v4.4 or higher)
- npm or yarn

### 1. Clone the repository
```bash
git clone <repository-url>
cd RentUFS
```

### 2. Install dependencies

#### Backend dependencies
```bash
npm install
```

#### Frontend dependencies
```bash
cd client
npm install
cd ..
```

Or install all at once:
```bash
npm run install-all
```

### 3. Environment Configuration

Create a `.env` file in the root directory:

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/rentufs
JWT_SECRET=your_secure_jwt_secret_key
NODE_ENV=development
```

**Important:** Change `JWT_SECRET` to a secure random string in production.

### 4. Start MongoDB

Make sure MongoDB is running on your system:

```bash
# On macOS with Homebrew
brew services start mongodb-community

# On Linux with systemd
sudo systemctl start mongod

# Or run directly
mongod
```

### 5. Run the application

#### Development mode (runs both server and client)
```bash
npm run dev
```

This will start:
- Backend server on http://localhost:5000
- Frontend development server on http://localhost:3000

#### Run separately

**Backend only:**
```bash
npm run server
```

**Frontend only:**
```bash
npm run client
```

### 6. Build for production

```bash
npm run build
```

This creates an optimized production build in `client/build/`.

## Project Structure

```
RentUFS/
├── client/                 # React frontend
│   ├── public/
│   └── src/
│       ├── components/     # Reusable components
│       ├── context/        # React context (Auth)
│       ├── pages/          # Page components
│       │   ├── Auth/       # Login, Register
│       │   ├── Driver/     # Driver-side pages
│       │   └── Host/       # Host-side pages
│       ├── App.js
│       └── index.js
├── server/                 # Express backend
│   ├── models/            # Mongoose models
│   ├── routes/            # API routes
│   ├── middleware/        # Custom middleware
│   └── index.js           # Server entry point
├── .env.example           # Environment variables template
├── .gitignore
├── package.json
└── README.md
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `GET /api/auth/me` - Get current user

### Vehicles
- `GET /api/vehicles` - Get all vehicles (with filters)
- `GET /api/vehicles/:id` - Get vehicle by ID
- `GET /api/vehicles/host/my-vehicles` - Get host's vehicles
- `POST /api/vehicles` - Create vehicle (host only)
- `PUT /api/vehicles/:id` - Update vehicle
- `DELETE /api/vehicles/:id` - Delete vehicle

### Bookings
- `POST /api/bookings` - Create booking
- `GET /api/bookings/my-bookings` - Get user's bookings (driver)
- `GET /api/bookings/host-bookings` - Get host's bookings
- `PATCH /api/bookings/:id/status` - Update booking status

### Reviews
- `POST /api/reviews` - Create review
- `GET /api/reviews/vehicle/:vehicleId` - Get vehicle reviews
- `GET /api/reviews/user/:userId` - Get user reviews

### Users
- `GET /api/users/:id` - Get user profile
- `PUT /api/users/profile` - Update user profile

## Usage Guide

### For Drivers

1. **Sign Up/Login**
   - Create an account or login
   - Select "Rent cars (Driver)" as user type

2. **Browse Vehicles**
   - Navigate to "Browse Cars"
   - Use filters to find the perfect vehicle
   - Filter by type, location, price, and seats

3. **Book a Vehicle**
   - Click on a vehicle to view details
   - Select dates and enter a message
   - Submit booking request
   - Wait for host confirmation

4. **Manage Bookings**
   - View all bookings in "My Bookings"
   - Check booking status
   - Cancel pending bookings if needed

### For Hosts

1. **Sign Up as Host**
   - Create an account
   - Select "List my car (Host)" as user type

2. **List a Vehicle**
   - Go to "Host Dashboard"
   - Click "Add New Vehicle"
   - Fill in vehicle details, location, and pricing
   - Submit listing

3. **Manage Vehicles**
   - View all vehicles in dashboard
   - Edit vehicle information
   - Toggle availability
   - Delete listings

4. **Manage Bookings**
   - View booking requests in "View Bookings"
   - Review renter information
   - Confirm or decline requests
   - Update booking status (active, completed)

## Default User Roles

Users can select their role during registration:
- **Driver** - Can only rent vehicles
- **Host** - Can only list vehicles
- **Both** - Can rent and list vehicles

## Database Models

### User
- Email, password (hashed)
- First name, last name, phone
- User type (driver/host/both)
- Rating and review count

### Vehicle
- Make, model, year
- Type, transmission, seats
- Description, features
- Location (city, state, address)
- Price per day
- Host reference
- Rating and review count

### Booking
- Vehicle and user references
- Start and end dates
- Total price and days
- Status (pending/confirmed/active/completed/cancelled)
- Message from renter

### Review
- Rating (1-5)
- Comment
- Reviewer and reviewee references
- Vehicle reference
- Review type

## Security Features

- Password hashing with bcryptjs
- JWT-based authentication
- Protected API routes
- Input validation
- CORS enabled

## Future Enhancements

- Payment integration (Stripe)
- Image upload functionality
- Advanced search with maps
- Real-time messaging between hosts and drivers
- Insurance verification
- Email notifications
- Calendar integration for availability
- Mobile app
- Admin dashboard
- Analytics and reporting

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Open a pull request

## License

MIT License

## Support

For issues and questions, please open an issue on GitHub.

## Authors

Built with the Claude Agent SDK
