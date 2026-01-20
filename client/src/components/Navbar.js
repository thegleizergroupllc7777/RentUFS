import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout, updateUserType } = useAuth();
  const navigate = useNavigate();
  const [switching, setSwitching] = useState(false);

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  const handleSwitchToHost = async () => {
    setSwitching(true);
    try {
      await updateUserType('host');
      navigate('/host/dashboard');
    } catch (error) {
      console.error('Failed to switch to host:', error);
    } finally {
      setSwitching(false);
    }
  };

  const handleSwitchToDriver = async () => {
    setSwitching(true);
    try {
      await updateUserType('driver');
      navigate('/my-bookings');
    } catch (error) {
      console.error('Failed to switch to driver:', error);
    } finally {
      setSwitching(false);
    }
  };

  return (
    <nav className="navbar">
      <div className="container navbar-content">
        <Link to="/" className="navbar-logo">
          🏎️ RentUFS
        </Link>

        <div className="navbar-links">
          <Link to="/marketplace" className="navbar-link">
            Browse Cars
          </Link>

          {user ? (
            <>
              {user.userType === 'host' && (
                <>
                  <Link to="/host/dashboard" className="navbar-link">
                    Host Dashboard
                  </Link>
                  <button
                    onClick={handleSwitchToDriver}
                    className="btn btn-secondary"
                    disabled={switching}
                    style={{ marginRight: '10px' }}
                  >
                    {switching ? 'Switching...' : 'Switch to Driver'}
                  </button>
                </>
              )}

              {user.userType === 'driver' && (
                <>
                  <Link to="/my-bookings" className="navbar-link">
                    My Bookings
                  </Link>
                  <button
                    onClick={handleSwitchToHost}
                    className="btn btn-secondary"
                    disabled={switching}
                    style={{ marginRight: '10px' }}
                  >
                    {switching ? 'Switching...' : 'Switch to Host'}
                  </button>
                </>
              )}

              {user.userType === 'both' && (
                <>
                  <Link to="/host/dashboard" className="navbar-link">
                    Host Dashboard
                  </Link>
                  <Link to="/my-bookings" className="navbar-link">
                    My Bookings
                  </Link>
                </>
              )}

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
          ) : (
            <>
              <Link to="/login" className="navbar-link">
                Login
              </Link>
              <Link to="/register">
                <button className="btn btn-primary">Sign Up</button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
};

export default Navbar;
