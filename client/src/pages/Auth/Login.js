import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

  const { login, reactivateAndLogin } = useAuth();
  const navigate = useNavigate();

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

      if (userData.userType === 'host' || userData.userType === 'both') {
        navigate('/host/dashboard');
      } else {
        navigate('/marketplace');
      }
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
            ) : (
              <form onSubmit={handleSubmit} className="auth-form">
                <div className="form-group">
                  <label className="form-label">Email</label>
                  <input
                    type="email"
                    name="email"
                    className="form-input"
                    value={formData.email}
                    onChange={handleChange}
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
