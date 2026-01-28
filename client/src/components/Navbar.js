import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout, updateUserType } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  // Active mode determines which UI to show (separate from userType which tracks capabilities)
  const [activeMode, setActiveMode] = useState(() => {
    return localStorage.getItem('activeMode') || 'driver';
  });

  // Sync activeMode with userType on login/change
  useEffect(() => {
    if (user) {
      const savedMode = localStorage.getItem('activeMode');
      if (user.userType === 'driver') {
        setActiveMode('driver');
        localStorage.setItem('activeMode', 'driver');
      } else if (user.userType === 'host') {
        setActiveMode('host');
        localStorage.setItem('activeMode', 'host');
      } else if (user.userType === 'both') {
        // For 'both' users, keep their saved preference or default to driver
        setActiveMode(savedMode === 'host' ? 'host' : 'driver');
      }
    }
  }, [user]);

  const handleLogout = () => {
    logout();
    localStorage.removeItem('activeMode');
    navigate('/');
  };

  const handleSwitchToHost = async () => {
    setSwitching(true);
    try {
      if (user.userType === 'both') {
        // User already has host capabilities, just switch mode
        setActiveMode('host');
        localStorage.setItem('activeMode', 'host');
        navigate('/host/dashboard');
      } else {
        // User needs to become a host (will be set to 'both')
        await updateUserType('host');
        setActiveMode('host');
        localStorage.setItem('activeMode', 'host');
        navigate('/host/dashboard');
      }
    } catch (error) {
      console.error('Failed to switch to host:', error);
    } finally {
      setSwitching(false);
    }
  };

  const handleSwitchToDriver = async () => {
    setSwitching(true);
    try {
      if (user.userType === 'both') {
        // User already has driver capabilities, just switch mode
        setActiveMode('driver');
        localStorage.setItem('activeMode', 'driver');
        navigate('/my-bookings');
      } else {
        // User needs to become a driver (will be set to 'both')
        await updateUserType('driver');
        setActiveMode('driver');
        localStorage.setItem('activeMode', 'driver');
        navigate('/my-bookings');
      }
    } catch (error) {
      console.error('Failed to switch to driver:', error);
    } finally {
      setSwitching(false);
    }
  };

  // Determine what to show based on activeMode
  const isHostMode = user && activeMode === 'host';
  const isDriverMode = !user || activeMode === 'driver';
  const canSwitch = user && user.userType === 'both';

  return (
    <nav className="navbar">
      <div className="container navbar-content">
        <Link to="/" className="navbar-logo">
          UFS
        </Link>

        <div className="navbar-links">
          {!user && (
            <>
              <Link to="/marketplace" className="navbar-link">
                Browse Cars
              </Link>
              <Link to="/login" className="navbar-link">
                Login
              </Link>
              <Link to="/register">
                <button className="btn btn-primary">Sign Up</button>
              </Link>
            </>
          )}

          {user && isDriverMode && (
            <>
              <Link to="/marketplace" className="navbar-link">
                Browse Cars
              </Link>
              <Link to="/my-bookings" className="navbar-link">
                My Bookings
              </Link>
              {canSwitch ? (
                <button
                  onClick={handleSwitchToHost}
                  className="btn btn-secondary"
                  disabled={switching}
                  style={{ marginRight: '10px', fontSize: '0.875rem' }}
                >
                  {switching ? 'Switching...' : 'Switch to Host'}
                </button>
              ) : (
                <button
                  onClick={handleSwitchToHost}
                  className="btn btn-secondary"
                  disabled={switching}
                  style={{ marginRight: '10px', fontSize: '0.875rem' }}
                >
                  {switching ? 'Switching...' : 'Become a Host'}
                </button>
              )}
            </>
          )}

          {user && isHostMode && (
            <>
              <Link to="/host/dashboard" className="navbar-link">
                Host Dashboard
              </Link>
              {canSwitch && (
                <button
                  onClick={handleSwitchToDriver}
                  className="btn btn-secondary"
                  disabled={switching}
                  style={{ marginRight: '10px', fontSize: '0.875rem' }}
                >
                  {switching ? 'Switching...' : 'Switch to Driver'}
                </button>
              )}
            </>
          )}

          {user && (
            <>
              <Link to="/driver/profile" className="navbar-link" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                {user.profileImage ? (
                  <img
                    src={user.profileImage}
                    alt="Profile"
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      objectFit: 'cover',
                      border: '2px solid #10b981'
                    }}
                  />
                ) : null}
                {user.firstName}
              </Link>

              <button onClick={handleLogout} className="btn btn-secondary">
                Logout
              </button>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
