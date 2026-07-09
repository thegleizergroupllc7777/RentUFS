import React, { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

// Landing point for the marketing site's "Logout" button
// (app.rentufs.com/logout). Signs the user out — clearing the auth token AND the
// cross-subdomain rentufs_auth cookie — then returns them to the public site so
// its nav flips back to Login / Sign Up.
const Logout = () => {
  const { logout } = useAuth();

  useEffect(() => {
    logout();
    const host = window.location.hostname || '';
    if (host === 'rentufs.com' || host.endsWith('.rentufs.com')) {
      window.location.href = 'https://rentufs.com';
    } else {
      window.location.href = '/';
    }
    // Run once on mount; the redirect immediately leaves this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
};

export default Logout;
