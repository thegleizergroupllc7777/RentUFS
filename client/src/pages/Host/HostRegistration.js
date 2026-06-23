import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import ImageUpload from '../../components/ImageUpload';
import axios from 'axios';
import API_URL from '../../config/api';
import './HostRegistration.css';

// Insurance agreement gate. ON by default — insurance is live, so new hosts
// must check the three acknowledgments + sign before listing. Can be switched
// OFF by setting REACT_APP_HOST_AGREEMENT_ENABLED to 'false' (safety override).
const HOST_AGREEMENT_ENABLED = process.env.REACT_APP_HOST_AGREEMENT_ENABLED !== 'false';

const HostRegistration = () => {
  const { user, updateUserType, refreshUser } = useAuth();
  const navigate = useNavigate();
  const [profileImage, setProfileImage] = useState(user?.profileImage || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Host insurance agreement state (only used when the gate is enabled).
  const [ackPrimary, setAckPrimary] = useState(false);
  const [ackLimits, setAckLimits] = useState(false);
  const [ackCap, setAckCap] = useState(false);
  const [signature, setSignature] = useState('');
  const agreementComplete = ackPrimary && ackLimits && ackCap && signature.trim().length >= 2;

  // If user is already a host, redirect to dashboard
  if (user && (user.userType === 'host' || user.userType === 'both')) {
    navigate('/host/dashboard');
    return null;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // When the agreement gate is on, all three boxes + a signature are required.
    if (HOST_AGREEMENT_ENABLED && !agreementComplete) {
      setError('Please check all three insurance acknowledgments and type your full legal name to sign.');
      setLoading(false);
      return;
    }

    try {
      const token = localStorage.getItem('token');

      // Update profile image if changed
      if (profileImage && profileImage !== user?.profileImage) {
        await axios.put(`${API_URL}/api/users/profile`, { profileImage }, {
          headers: { Authorization: `Bearer ${token}` }
        });
      }

      // Save the signed insurance agreement before upgrading to host.
      if (HOST_AGREEMENT_ENABLED) {
        await axios.put(`${API_URL}/api/users/host-agreement`, {
          signature: signature.trim(),
          acknowledgedPrimaryInsurance: ackPrimary,
          acknowledgedCoverageLimits: ackLimits,
          acknowledgedCatastrophicCap: ackCap
        }, {
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
                  <span className="host-reg-zero-commission">Zero Commission</span>
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

              {HOST_AGREEMENT_ENABLED && (
                <div className="host-reg-agreement" style={{ marginTop: '1.5rem', padding: '1rem', border: '1px solid #2a2a2a', borderRadius: '8px', background: '#0d0d0d' }}>
                  <h3 style={{ marginTop: 0 }}>Insurance Acknowledgment</h3>
                  <p style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                    Please read and acknowledge the following before listing your vehicle. See the full{' '}
                    <a href="https://rentufs.com/owner-agreement" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981' }}>Owner Agreement</a>.
                  </p>

                  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', margin: '0.9rem 0', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={ackPrimary} onChange={(e) => setAckPrimary(e.target.checked)} style={{ marginTop: '0.2rem' }} />
                    <span><strong>Primary Insurance Requirement.</strong> I understand I must maintain my own personal or commercial auto insurance policy at all times. RentUFS's insurance is not a replacement for my primary insurance. If I fail to maintain it, RentUFS will not provide coverage and any claim will be denied.</span>
                  </label>

                  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', margin: '0.9rem 0', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={ackLimits} onChange={(e) => setAckLimits(e.target.checked)} style={{ marginTop: '0.2rem' }} />
                    <span><strong>Coverage Limitations.</strong> I understand RentUFS's auto liability coverage applies only during the rental period and provides the minimum limits required by state law. No PIP, MedPay, UM, or UIM coverage is included unless required by law.</span>
                  </label>

                  <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', margin: '0.9rem 0', cursor: 'pointer', fontSize: '0.9rem' }}>
                    <input type="checkbox" checked={ackCap} onChange={(e) => setAckCap(e.target.checked)} style={{ marginTop: '0.2rem' }} />
                    <span><strong>Catastrophic Loss Cap.</strong> I understand that if a major event damages multiple vehicles stored at a single location, the total payout for that location is capped at $300,000. Storing vehicles at different locations can reduce this risk.</span>
                  </label>

                  <div style={{ marginTop: '1rem' }}>
                    <label className="form-label" htmlFor="host-signature">Sign by typing your full legal name *</label>
                    <input
                      id="host-signature"
                      type="text"
                      value={signature}
                      onChange={(e) => setSignature(e.target.value)}
                      placeholder="Your full legal name"
                      maxLength={100}
                      style={{ width: '100%', padding: '0.6rem 0.8rem', borderRadius: '6px', border: '1px solid #2a2a2a', background: '#000', color: '#fff', fontFamily: 'cursive', fontSize: '1.1rem' }}
                    />
                    <p style={{ color: '#6b7280', fontSize: '0.8rem', marginTop: '0.4rem' }}>
                      By typing your name you electronically sign this acknowledgment, dated today.
                    </p>
                  </div>
                </div>
              )}

              <button
                type="submit"
                className="btn btn-primary host-reg-submit"
                disabled={loading || (HOST_AGREEMENT_ENABLED && !agreementComplete)}
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
