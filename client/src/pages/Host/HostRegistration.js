import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ImageUpload from '../../components/ImageUpload';
import axios from 'axios';
import API_URL from '../../config/api';
import './HostRegistration.css';

const HostRegistration = () => {
  const { user, updateUserType, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profileImage, setProfileImage] = useState(user?.profileImage || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // If user is already a host, redirect to dashboard
  if (user && (user.userType === 'host' || user.userType === 'both')) {
    navigate('/host/dashboard');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // Update profile image if changed
      if (profileImage && profileImage !== user?.profileImage) {
        const token = localStorage.getItem('token');
        await axios.put(`${API_URL}/api/users/profile`, { profileImage }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      // Upgrade user to 'both' (driver + host)
      await updateUserType('both');

      // Refresh user data
      await refreshUser();

      // Navigate to host dashboard
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register as host. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div>
      <Navbar />
      <div className="host-reg-page">
        <div className="host-reg-container">
          <div className="host-reg-card">
            <div className="host-reg-header">
              <h1 className="host-reg-title">Become a Host</h1>
              <p className="host-reg-subtitle">
                Start earning money by listing your vehicle on <span style={{ color: '#00FF66', fontWeight: 'bold' }}>UFS</span>
              </p>
            </div>

            <div className="host-reg-benefits">
              <div className="host-reg-benefit">
                <span className="host-reg-benefit-icon">$</span>
                <div>
                  <h3>Earn Extra Income</h3>
                  <p>Set your own prices and availability. Earn money when you're not using your car.</p>
                </div>
              </div>
              <div className="host-reg-benefit">
                <span className="host-reg-benefit-icon">&#x2714;</span>
                <div>
                  <h3>Insurance Protection</h3>
                  <p>Every rental is covered with comprehensive insurance options for peace of mind.</p>
                </div>
              </div>
              <div className="host-reg-benefit">
                <span className="host-reg-benefit-icon">&#x2605;</span>
                <div>
                  <h3>Keep Driving Too</h3>
                  <p>Your driver account stays active. Switch between hosting and renting anytime.</p>
                </div>
              </div>
            </div>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit} className="host-reg-form">
              <div className="host-reg-photo-section">
                <h3>Profile Photo or Business Logo</h3>
                <p>This will be displayed on your vehicle listings to help renters recognize you.</p>
                <ImageUpload
                  label="Your Photo / Logo"
                  value={profileImage}
                  onChange={(url) => setProfileImage(url)}
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary host-reg-submit"
                disabled={loading}
              >
                {loading ? 'Setting up your host account...' : 'Register as Host'}
              </button>
            </form>

            <p className="host-reg-note">
              By registering as a host, you agree to our hosting terms. You can manage your tax information and payouts from your host dashboard after registration.
            </p>
          </div>
        </div>
      </div>
      <Footer />
    </div>
  );
};

export default HostRegistration;
