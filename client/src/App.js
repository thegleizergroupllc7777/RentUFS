import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import PrivateRoute from './components/PrivateRoute';

import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import ForgotPassword from './pages/Auth/ForgotPassword';
import ResetPassword from './pages/Auth/ResetPassword';
import Home from './pages/Home';

// Driver pages
import Marketplace from './pages/Driver/Marketplace';
import VehicleDetail from './pages/Driver/VehicleDetail';
import MyBookings from './pages/Driver/MyBookings';
import DriverProfile from './pages/Driver/Profile';

// Host pages
import HostDashboard from './pages/Host/HostDashboard';
import AddVehicle from './pages/Host/AddVehicle';
import EditVehicle from './pages/Host/EditVehicle';
import HostBookings from './pages/Host/HostBookings';
import HostReports from './pages/Host/HostReports';

// Payment pages
import Checkout from './pages/Payment/Checkout';
import PaymentSuccess from './pages/Payment/Success';
import PaymentCancel from './pages/Payment/Cancel';

// Mobile upload (QR code flow)
import MobileUpload from './pages/MobileUpload';

import './App.css';

function App() {
  return (
    <AuthProvider>
      <Router>
        <div className="App">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password/:token" element={<ResetPassword />} />

            {/* Driver Routes */}
            <Route path="/marketplace" element={<Marketplace />} />
            <Route path="/vehicle/:id" element={<VehicleDetail />} />
            <Route
              path="/my-bookings"
              element={
                <PrivateRoute>
                  <MyBookings />
                </PrivateRoute>
              }
            />

            {/* Host Routes */}
            <Route
              path="/host/dashboard"
              element={
                <PrivateRoute>
                  <HostDashboard />
                </PrivateRoute>
              }
            />
            <Route
              path="/host/add-vehicle"
              element={
                <PrivateRoute>
                  <AddVehicle />
                </PrivateRoute>
              }
            />
            <Route
              path="/host/edit-vehicle/:id"
              element={
                <PrivateRoute>
                  <EditVehicle />
                </PrivateRoute>
              }
            />
            <Route
              path="/host/bookings"
              element={
                <PrivateRoute>
                  <HostBookings />
                </PrivateRoute>
              }
            />
            <Route
              path="/host/reports"
              element={
                <PrivateRoute>
                  <HostReports />
                </PrivateRoute>
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

            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </div>
      </Router>
    </AuthProvider>
  );
}

export default App;
