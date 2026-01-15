import React, { useState, useEffect } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import './Auth.css';

const ResetPassword = () => {
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const [tokenValid, setTokenValid] = useState(false);
  const [userEmail, setUserEmail] = useState('');

  const { token } = useParams();
  const navigate = useNavigate();
  const { verifyResetToken, resetPassword } = useAuth();

  useEffect(() => {
    const validateToken = async () => {
      try {
        const response = await verifyResetToken(token);
        setTokenValid(true);
        setUserEmail(response.email);
      } catch (err) {
        setError(err.response?.data?.message || 'Invalid or expired reset link');
        setTokenValid(false);
      } finally {
        setValidatingToken(false);
      }
    };

    validateToken();
  }, [token, verifyResetToken]);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (formData.password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    setLoading(true);

    try {
      await resetPassword(token, formData.password);
      setSuccess('Password has been reset successfully! Redirecting to login...');
      setTimeout(() => {
        navigate('/login');
      }, 2000);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to reset password');
    } finally {
      setLoading(false);
    }
  };

  if (validatingToken) {
    return (
      <div>
        <Navbar />
        <div className="auth-page">
          <div className="auth-container">
            <div className="auth-card">
              <h1 className="auth-title">Validating Reset Link</h1>
              <p className="auth-subtitle">Please wait...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!tokenValid) {
    return (
      <div>
        <Navbar />
        <div className="auth-page">
          <div className="auth-container">
            <div className="auth-card">
              <h1 className="auth-title">Invalid Reset Link</h1>
              <div className="error-message">{error}</div>
              <p className="auth-subtitle" style={{ marginTop: '16px' }}>
                The password reset link is invalid or has expired.
              </p>
              <Link to="/forgot-password" className="btn btn-primary" style={{ display: 'block', textAlign: 'center', marginTop: '20px', textDecoration: 'none' }}>
                Request New Reset Link
              </Link>
              <p className="auth-footer" style={{ marginTop: '16px' }}>
                <Link to="/login" className="auth-link">
                  Back to Login
                </Link>
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <h1 className="auth-title">Reset Password</h1>
            <p className="auth-subtitle">
              Enter a new password for {userEmail}
            </p>

            {error && <div className="error-message">{error}</div>}
            {success && (
              <div className="success-message" style={{
                backgroundColor: '#d4edda',
                color: '#155724',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '16px'
              }}>
                {success}
              </div>
            )}

            <form onSubmit={handleSubmit} className="auth-form">
              <div className="form-group">
                <label className="form-label">New Password</label>
                <input
                  type="password"
                  name="password"
                  className="form-input"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="Enter new password"
                  minLength="6"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Confirm New Password</label>
                <input
                  type="password"
                  name="confirmPassword"
                  className="form-input"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="Confirm new password"
                  minLength="6"
                  required
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={loading || success}
              >
                {loading ? 'Resetting...' : 'Reset Password'}
              </button>
            </form>

            <p className="auth-footer">
              Remember your password?{' '}
              <Link to="/login" className="auth-link">
                Back to Login
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
