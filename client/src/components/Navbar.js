import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <nav className="navbar">
      <div className="container navbar-content">
        <Link to="/" className="navbar-logo">
          RentUFS
        </Link>

        <div className="navbar-links">
          <Link to="/marketplace" className="navbar-link">
            Browse Cars
          </Link>

          {user ? (
            <>
              {(user.userType === 'host' || user.userType === 'both') && (
                <Link to="/host/dashboard" className="navbar-link">
                  Host Dashboard
                </Link>
              )}

              {(user.userType === 'driver' || user.userType === 'both') && (
                <Link to="/my-bookings" className="navbar-link">
                  My Bookings
                </Link>
              )}

              <span className="navbar-link">
                Hi, {user.firstName}
              </span>

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
