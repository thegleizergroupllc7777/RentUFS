import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const HostRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return <div className="flex-center" style={{ minHeight: '100vh' }}>Loading...</div>;
  }

  if (!user) {
    return <Navigate to="/login" />;
  }

  // If user is not a host or both, redirect to host registration
  if (user.userType !== 'host' && user.userType !== 'both') {
    return <Navigate to="/host/register" />;
  }

  return children;
};

export default HostRoute;
