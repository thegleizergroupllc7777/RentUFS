import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { AuthProvider } from './context/AuthContext';
import { GoogleMapsProvider } from './context/GoogleMapsContext';
import PrivateRoute from './components/PrivateRoute';
import HostRoute from './components/HostRoute';
import AdminRoute from './components/AdminRoute';

import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';

// Driver pages
import Marketplace from './pages/Driver/Marketplace';
import VehicleDetail from './pages/Driver/VehicleDetail';
import HostStorefront from './pages/HostStorefront';
import MyBookings from './pages/Driver/MyBookings';
import ReservationDetail from './pages/Driver/ReservationDetail';
import DriverProfile from './pages/Driver/Profile';

// Host pages
import HostRegistration from './pages/Host/HostRegistration';
import HostDashboard from './pages/Host/HostDashboard';
import AddVehicle from './pages/Host/AddVehicle';
import EditVehicle from './pages/Host/EditVehicle';
import HostBookings from './pages/Host/HostBookings';
import HostReservationDetail from './pages/Host/HostReservationDetail';
import HostReports from './pages/Host/HostReports';
import HostTaxSettings from './pages/Host/HostTaxSettings';
import HostPayouts from './pages/Host/Payouts';

// Payment pages
import Checkout from './pages/Payment/Checkout';
import PaymentSuccess from './pages/Payment/Success';
import PaymentCancel from './pages/Payment/Cancel';

// Mobile upload (QR code flow)
import MobileUpload from './pages/MobileUpload';

// Legal / compliance pages
import SmsTerms from './pages/SmsTerms';

// Admin pages
import AdminDashboard from './pages/Admin/AdminDashboard';
import AdminBookings from './pages/Admin/AdminBookings';
import AdminBookingDetail from './pages/Admin/AdminBookingDetail';
import AdminUsers from './pages/Admin/AdminUsers';
import AdminUserDetail from './pages/Admin/AdminUserDetail';
import AdminVehicles from './pages/Admin/AdminVehicles';
import AdminBroadcast from './pages/Admin/AdminBroadcast';
import AdminTax from './pages/Admin/AdminTax';

import './App.css';

const GOOGLE_CLIENT_ID = process.env.REACT_APP_GOOGLE_CLIENT_ID || '';

function App() {
  return (
    <HelmetProvider>
    <GoogleOAuthProvider clientId={GOOGLE_CLIENT_ID}>
    <GoogleMapsProvider>
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            {/* Marketing/static pages live on Webflow at rentufs.com.
                The React app subdomain (app.rentufs.com) only serves the marketplace. */}
            <Route path="/" element={<Navigate to="/marketplace" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* Driver Routes */}
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/vehicle/:id" element={<VehicleDetail />} />
            {/* Public host storefront (shareable referral link) */}
            <Route path="/h/:hostId" element={<HostStorefront />} />
            <Route
              path="/my-bookings"
              element={
                <PrivateRoute>
                  <MyBookings />
                </PrivateRoute>
              }
            />
            <Route
              path="/reservation/:bookingId"
              element={
                <PrivateRoute>
                  <ReservationDetail />
                </PrivateRoute>
              }
            />

            {/* Host Registration (for drivers becoming hosts) */}
            <Route
              path="/host/register"
              element={
                <PrivateRoute>
                  <HostRegistration />
                </PrivateRoute>
              }
            />

            {/* Host Routes (requires host or both userType) */}
            <Route
              path="/host/dashboard"
              element={
                <HostRoute>
                  <HostDashboard />
                </HostRoute>
              }
            />
            <Route
              path="/host/add-vehicle"
              element={
                <HostRoute>
                  <AddVehicle />
                </HostRoute>
              }
            />
            <Route
              path="/host/edit-vehicle/:id"
              element={
                <HostRoute>
                  <EditVehicle />
                </HostRoute>
              }
            />
            <Route
              path="/host/bookings"
              element={
                <HostRoute>
                  <HostBookings />
                </HostRoute>
              }
            />
            <Route
              path="/host/reservation/:bookingId"
              element={
                <HostRoute>
                  <HostReservationDetail />
                </HostRoute>
              }
            />
            <Route
              path="/host/reports"
              element={
                <HostRoute>
                  <HostReports />
                </HostRoute>
              }
            />

            <Route
              path="/host/tax-settings"
              element={
                <HostRoute>
                  <HostTaxSettings />
                </HostRoute>
              }
            />
            <Route
              path="/host/payouts"
              element={
                <HostRoute>
                  <HostPayouts />
                </HostRoute>
              }
            />

            {/* Payment Routes */}
            <Route
              path="/payment/checkout"
              element={
                <PrivateRoute>
                  <Checkout />
                </PrivateRoute>
              }
            />
            <Route
              path="/payment/success"
              element={
                <PrivateRoute>
                  <PaymentSuccess />
                </PrivateRoute>
              }
            />
            <Route path="/payment/cancel" element={<PaymentCancel />} />
            <Route
              path="/driver/my-bookings"
              element={
                <PrivateRoute>
                  <MyBookings />
                </PrivateRoute>
              }
            />
            <Route
              path="/driver/profile"
              element={
                <PrivateRoute>
                  <DriverProfile />
                </PrivateRoute>
              }
            />

            {/* Mobile Upload (QR code from phone) */}
            <Route path="/mobile-upload/:sessionId" element={<MobileUpload />} />

            {/* SMS messaging terms — publicly visible, required for Twilio
                toll-free verification compliance. */}
            <Route path="/sms-terms" element={<SmsTerms />} />

            {/* Admin Routes */}
            <Route
              path="/admin"
              element={<AdminRoute><AdminDashboard /></AdminRoute>}
            />
            <Route
              path="/admin/bookings"
              element={<AdminRoute><AdminBookings /></AdminRoute>}
            />
            <Route
              path="/admin/bookings/:id"
              element={<AdminRoute><AdminBookingDetail /></AdminRoute>}
            />
            <Route
              path="/admin/users"
              element={<AdminRoute><AdminUsers /></AdminRoute>}
            />
            <Route
              path="/admin/users/:id"
              element={<AdminRoute><AdminUserDetail /></AdminRoute>}
            />
            <Route
              path="/admin/vehicles"
              element={<AdminRoute><AdminVehicles /></AdminRoute>}
            />
            <Route
              path="/admin/broadcast"
              element={<AdminRoute><AdminBroadcast /></AdminRoute>}
            />
            <Route
              path="/admin/tax"
              element={<AdminRoute><AdminTax /></AdminRoute>}
            />

            <Route path="*" element={<Navigate to="/marketplace" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
    </GoogleMapsProvider>
    </GoogleOAuthProvider>
    </HelmetProvider>
  );
}

export default App;
