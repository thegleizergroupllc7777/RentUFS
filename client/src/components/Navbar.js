import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import API_URL from '../config/api';

const Navbar = () => {
  const { user, logout, updateUserType } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
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

  // Poll for unread messages
  useEffect(() => {
    if (!user) return;
    const fetchUnread = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;
        const response = await axios.get(`${API_URL}/api/messages/unread/count`, {
          headers: { Authorization: `Bearer ${token}` }
        });
        setUnreadCount(response.data.count || 0);
      } catch (error) {
        // Silently fail - don't disrupt nav
      }
    };
    fetchUnread();
    const interval = setInterval(fetchUnread, 15000); // Poll every 15 seconds
    return () => clearInterval(interval);
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
              {/* Message notification icon - links to bookings page */}
              {unreadCount > 0 && (
                <Link
                  to={isHostMode ? '/host/bookings' : '/my-bookings'}
                  className="navbar-link"
                  style={{ position: 'relative', display: 'flex', alignItems: 'center', marginRight: '0.25rem' }}
                  title={`${unreadCount} unread message${unreadCount > 1 ? 's' : ''}`}
                >
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                  </svg>
                  <span style={{
                    position: 'absolute',
                    top: '-6px',
                    right: '-8px',
                    background: '#ef4444',
                    color: '#fff',
                    fontSize: '0.6rem',
                    fontWeight: '700',
                    minWidth: '16px',
                    height: '16px',
                    borderRadius: '9999px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0 4px',
                    border: '2px solid #000',
                    lineHeight: '1',
                    animation: 'pulse 2s infinite'
                  }}>
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                </Link>
              )}
              <Link to="/driver/profile" className="navbar-link" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', position: 'relative' }}>
                <div style={{ position: 'relative' }}>
                  {user.profileImage ? (
                    <img
                      src={user.profileImage.startsWith('http') ? user.profileImage : `${API_URL}${user.profileImage}`}
                      alt="Profile"
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '50%',
                        objectFit: 'cover',
                        border: '2px solid #10b981'
                      }}
                    />
                  ) : (
                    <div style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '50%',
                      backgroundColor: '#10b981',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: 'white',
                      fontWeight: 'bold',
                      fontSize: '0.875rem',
                      border: '2px solid #10b981'
                    }}>
                      {user.firstName?.charAt(0)?.toUpperCase()}
                    </div>
                  )}
                </div>
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
