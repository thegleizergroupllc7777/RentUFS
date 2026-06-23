import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import HostAgreementGate from './HostAgreementGate';

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

  // Existing hosts who never signed the insurance acknowledgment get a one-time
  // blocking prompt before they can use any host page. New hosts already signed
  // during "Become a Host", so this passes through for them.
  return <HostAgreementGate>{children}</HostAgreementGate>;
};

export default HostRoute;
