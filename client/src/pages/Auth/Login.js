import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import './Auth.css';

const Login = () => {
  const [formData, setFormData] = useState({
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [deactivatedInfo, setDeactivatedInfo] = useState(null);
  const [reactivating, setReactivating] = useState(false);
  const [googleNewUserCredential, setGoogleNewUserCredential] = useState(null);
  const [googleLoading, setGoogleLoading] = useState(false);

  const { login, googleLogin, reactivateAndLogin } = useAuth();
  const navigate = useNavigate();

  const routeByUserType = (userData) => {
    if (userData.userType === 'host') {
      navigate('/host/dashboard');
    } else if (userData.userType === 'both') {
      const savedMode = localStorage.getItem('activeMode');
      navigate(savedMode === 'host' ? '/host/dashboard' : '/marketplace');
    } else {
      navigate('/marketplace');
    }
  };

  const handleGoogleCredential = async (credential, userType) => {
    setError('');
    setGoogleLoading(true);
    try {
      const result = await googleLogin(credential, userType);
      if (result.needsUserType) {
        // Brand new Google user — prompt for driver/host/both
        setGoogleNewUserCredential(credential);
        return;
      }
      routeByUserType(result);
    } catch (err) {
      if (err.deactivated) {
        setDeactivatedInfo({ token: err.token, user: err.user });
      } else {
        setError(err.response?.data?.message || 'Google sign-in failed');
      }
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setDeactivatedInfo(null);
    setLoading(true);

    try {
      const userData = await login(formData.email, formData.password);

      // Explicitly ask the browser to save the credential. Needed for
      // React SPA logins because preventDefault() + History API navigation
      // doesn't reliably trigger the browser's heuristic save prompt.
      if (window.PasswordCredential) {
        try {
          const cred = new window.PasswordCredential({
            id: formData.email,
            password: formData.password,
            name: `${userData.firstName || ''} ${userData.lastName || ''}`.trim() || formData.email,
          });
          await navigator.credentials.store(cred);
        } catch (credErr) {
          // Credential storage is a nicety — silently continue if it fails
        }
      }

      routeByUserType(userData);
    } catch (err) {
      if (err.deactivated) {
        setDeactivatedInfo({ token: err.token, user: err.user });
      } else {
        setError(err.response?.data?.message || 'Failed to login');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleReactivate = async () => {
    setReactivating(true);
    setError('');
    try {
      await reactivateAndLogin(deactivatedInfo.token);
      navigate('/marketplace');
    } catch (err) {
      setError('Failed to reactivate account. Please try again.');
    } finally {
      setReactivating(false);
    }
  };

  return (
    <div>
      <Navbar />
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            <h1 className="auth-title">Welcome Back</h1>
            <p className="auth-subtitle">Login to your <span style={{color: '#10b981', fontWeight: 'bold'}}>RentUFS</span> account</p>

            {error && <div className="error-message">{error}</div>}

            {deactivatedInfo ? (
              <div style={{
                backgroundColor: '#1c1c1c',
                border: '1px solid #f59e0b',
                borderRadius: '0.5rem',
                padding: '1.5rem',
                marginBottom: '1rem',
                textAlign: 'center'
              }}>
                <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>⚠️</div>
                <h3 style={{ color: '#f59e0b', marginBottom: '0.5rem' }}>Account Deactivated</h3>
                <p style={{ color: '#9ca3af', marginBottom: '1rem', fontSize: '0.875rem' }}>
                  Your account was deactivated. Would you like to reactivate it?
                </p>
                <button
                  onClick={handleReactivate}
                  className="btn btn-primary"
                  style={{ width: '100%', marginBottom: '0.75rem' }}
                  disabled={reactivating}
                >
                  {reactivating ? 'Reactivating...' : 'Reactivate My Account'}
                </button>
                <button
                  onClick={() => { setDeactivatedInfo(null); localStorage.removeItem('token'); }}
                  className="btn"
                  style={{ width: '100%', border: '1px solid #6b7280', color: '#6b7280', background: 'transparent' }}
                >
                  Cancel
                </button>
              </div>
            ) : googleNewUserCredential ? (
              <div style={{ textAlign: 'center' }}>
                <h3 style={{ color: '#10b981', marginBottom: '0.5rem' }}>One last step</h3>
                <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  How will you use RentUFS?
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {[
                    { value: 'driver', label: 'Rent cars (Driver)' },
                    { value: 'host', label: 'List my car (Host)' },
                    { value: 'both', label: 'Both' }
                  ].map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className="btn btn-primary"
                      style={{ width: '100%' }}
                      disabled={googleLoading}
                      onClick={() => handleGoogleCredential(googleNewUserCredential, opt.value)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="btn"
                    style={{ width: '100%', border: '1px solid #6b7280', color: '#6b7280', background: 'transparent' }}
                    disabled={googleLoading}
                    onClick={() => setGoogleNewUserCredential(null)}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem' }}>
                  <GoogleLogin
                    onSuccess={(credentialResponse) => handleGoogleCredential(credentialResponse.credential)}
                    onError={() => setError('Google sign-in failed. Please try again.')}
                    theme="filled_black"
                    text="signin_with"
                    shape="rectangular"
                    width="320"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#374151' }} />
                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>or</span>
                  <div style={{ flex: 1, height: '1px', background: '#374151' }} />
                </div>
                <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    className="form-input"
                    value={formData.email}
                    onChange={handleChange}
                    maxLength="100"
                    autoComplete="username"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Password</label>
                  <div className="password-input-wrapper">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      className="form-input"
                      value={formData.password}
                      onChange={handleChange}
                      maxLength="40"
                      autoComplete="current-password"
                      required
                    />
                    <button
                      type="button"
                      className="password-toggle-btn"
                      onClick={() => setShowPassword(!showPassword)}
                      tabIndex={-1}
                    >
                      {showPassword ? '🙈' : '👁'}
                    </button>
                  </div>
                </div>

                <div style={{ textAlign: 'right', marginBottom: '16px' }}>
                  <Link to="/forgot-password" className="auth-link" style={{ fontSize: '14px' }}>
                    Forgot Password?
                  </Link>
                </div>

                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ width: '100%' }}
                  disabled={loading}
                >
                  {loading ? 'Logging in...' : 'Login'}
                </button>
                </form>
              </>
            )}

            <p className="auth-footer">
              Don't have an account?{' '}
              <Link to="/register" className="auth-link">
                Sign up
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
