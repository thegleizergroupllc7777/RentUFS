import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Landing point for the marketing site's "Dashboard" button
// (app.rentufs.com/dashboard). Sends each signed-in user to the page that makes
// sense for them; a logged-out visitor goes to Login.
//   • Host / Both  -> Host Dashboard
//   • Driver       -> My Bookings
const DashboardRedirect = () => {
  const { user, loading } = useAuth();

  // Wait for auth to resolve so we don't bounce a logged-in user to Login.
  if (loading) return null;

  if (!user) return <Navigate to="/login" replace />;

  const type = user.userType;
  if (type === 'host' || type === 'both') {
    return <Navigate to="/host/dashboard" replace />;
  }
  return <Navigate to="/my-bookings" replace />;
};

export default DashboardRedirect;
