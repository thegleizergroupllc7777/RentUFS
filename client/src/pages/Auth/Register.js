import React, { useState, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { GoogleLogin } from '@react-oauth/google';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import { vehicleModels } from '../../data/vehicleModels';
import API_URL from '../../config/api';
import './Auth.css';

const Register = () => {
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') === 'host' ? 'host' : 'driver';
  const [step, setStep] = useState(1); // 1 = user registration, 2 = vehicle details
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    dateOfBirth: '',
    userType: initialType,
    profileImage: '',
    address: {
      street: '',
      apt: '',
      city: '',
      state: '',
      zipCode: ''
    },
    driverLicense: {
      licenseNumber: '',
      state: '',
      expirationDate: '',
      licenseImage: '',
      verificationSelfie: ''
    }
  });
  const [vehicleData, setVehicleData] = useState({
    vin: '',
    make: '',
    model: '',
    year: '',
    type: 'sedan',
    transmission: 'automatic',
    seats: '',
    description: '',
    pricePerDay: '',
    pricePerWeek: '',
    pricePerMonth: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    image1: '',
    image2: '',
    image3: '',
    image4: '',
    registrationImage: ''
  });
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);
  const [vinDecodedData, setVinDecodedData] = useState(null);
  const [vinMismatch, setVinMismatch] = useState(null);
  const [faceVerification, setFaceVerification] = useState(null);
  const [licenseOcrResult, setLicenseOcrResult] = useState(null);
  const [emailOtp, setEmailOtp] = useState({
    sent: false,
    verified: false,
    code: '',
    sending: false,
    verifying: false,
    error: '',
    cooldown: 0
  });

  const handleFaceVerificationResult = useCallback((result) => {
    setFaceVerification(result);
  }, []);

  const handleOcrResult = useCallback((result) => {
    setLicenseOcrResult(result);
  }, []);

  // Email OTP handlers
  const handleSendOtp = async () => {
    const email = formData.email.trim();
    if (!email) {
      setEmailOtp(prev => ({ ...prev, error: 'Please enter your email first.' }));
      return;
    }
    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailOtp(prev => ({ ...prev, error: 'Please enter a valid email address.' }));
      return;
    }

    setEmailOtp(prev => ({ ...prev, sending: true, error: '' }));
    try {
      await axios.post(`${API_URL}/api/auth/send-otp`, { email });
      setEmailOtp(prev => ({ ...prev, sent: true, sending: false, cooldown: 60 }));

      // Start cooldown timer
      const interval = setInterval(() => {
        setEmailOtp(prev => {
          if (prev.cooldown <= 1) {
            clearInterval(interval);
            return { ...prev, cooldown: 0 };
          }
          return { ...prev, cooldown: prev.cooldown - 1 };
        });
      }, 1000);
    } catch (err) {
      setEmailOtp(prev => ({
        ...prev,
        sending: false,
        error: err.response?.data?.message || 'Failed to send verification code.'
      }));
    }
  };

  const handleVerifyOtp = async () => {
    const code = emailOtp.code.trim();
    if (!code || code.length !== 6) {
      setEmailOtp(prev => ({ ...prev, error: 'Please enter the 6-digit code.' }));
      return;
    }

    setEmailOtp(prev => ({ ...prev, verifying: true, error: '' }));
    try {
      await axios.post(`${API_URL}/api/auth/verify-otp`, { email: formData.email.trim(), code });
      setEmailOtp(prev => ({ ...prev, verified: true, verifying: false }));
    } catch (err) {
      setEmailOtp(prev => ({
        ...prev,
        verifying: false,
        error: err.response?.data?.message || 'Invalid verification code.'
      }));
    }
  };

  const handleDecodeVin = async () => {
    const vin = vehicleData.vin.trim().toUpperCase();
    if (vin.length !== 17) {
      setError('VIN must be exactly 17 characters');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    setVinLoading(true);
    setError('');
    try {
      const response = await axios.get(`${API_URL}/api/vehicles/decode-vin/${vin}`);
      const decoded = response.data;
      setVehicleData(prev => ({
        ...prev,
        vin: vin,
        make: decoded.make || prev.make,
        model: decoded.model || prev.model,
        year: decoded.year || prev.year,
        type: decoded.type || prev.type,
        transmission: decoded.transmission || prev.transmission
      }));
      setVinDecoded(true);
      setVinDecodedData({
        make: decoded.make || '',
        model: decoded.model || '',
        year: decoded.year || null
      });
      setVinMismatch(null);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to decode VIN. Please enter vehicle details manually.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setVinLoading(false);
    }
  };

  const { register, googleLogin } = useAuth();
  const navigate = useNavigate();
  const [googleLoading, setGoogleLoading] = useState(false);
  const [googleNewUserCredential, setGoogleNewUserCredential] = useState(null);

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

  // Google sign-up — click Google first, then pick Driver/Host/Both on a
  // clean follow-up screen (same flow as Login). Existing Google users are
  // signed in immediately without being asked again.
  const handleGoogleCredential = async (credential, userType) => {
    setError('');
    setGoogleLoading(true);
    try {
      const result = await googleLogin(credential, userType);
      if (result.needsUserType) {
        setGoogleNewUserCredential(credential);
        return;
      }
      routeByUserType(result);
    } catch (err) {
      setError(err.response?.data?.message || 'Google sign-up failed');
    } finally {
      setGoogleLoading(false);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.startsWith('driverLicense.')) {
      const licenseField = name.split('.')[1];
      setFormData({
        ...formData,
        driverLicense: {
          ...formData.driverLicense,
          [licenseField]: value
        }
      });
    } else if (name.startsWith('address.')) {
      const addressField = name.split('.')[1];
      let sanitized = value;
      if (addressField === 'zipCode') {
        sanitized = value.replace(/\D/g, '');
      } else if (addressField === 'city') {
        sanitized = value.replace(/[^a-zA-Z\s\-'.]/g, '');
      }
      setFormData({
        ...formData,
        address: {
          ...formData.address,
          [addressField]: sanitized
        }
      });
    } else if (name === 'phone') {
      const digits = value.replace(/\D/g, '').slice(0, 10);
      let formatted = '';
      if (digits.length > 0) formatted = '(' + digits.slice(0, 3);
      if (digits.length >= 3) formatted += ') ';
      if (digits.length > 3) formatted += digits.slice(3, 6);
      if (digits.length >= 6) formatted += '-';
      if (digits.length > 6) formatted += digits.slice(6, 10);
      setFormData({
        ...formData,
        phone: formatted
      });
    } else if (name === 'email') {
      setFormData({ ...formData, email: value });
      // Reset OTP state when email changes
      if (emailOtp.sent || emailOtp.verified) {
        setEmailOtp({ sent: false, verified: false, code: '', sending: false, verifying: false, error: '', cooldown: 0 });
      }
      return;
    } else if (name === 'firstName' || name === 'lastName') {
      const sanitized = value.replace(/[^a-zA-Z\s\-'.]/g, '');
      setFormData({
        ...formData,
        [name]: sanitized
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const getPasswordStrength = (password) => {
    if (!password) return { level: 0, label: '', color: '' };
    const checks = [
      password.length >= 8,
      /[A-Z]/.test(password),
      /[a-z]/.test(password),
      /[0-9]/.test(password),
      /[^A-Za-z0-9]/.test(password)
    ];
    const passed = checks.filter(Boolean).length;
    if (password.length < 8) return { level: 1, label: 'Weak', color: '#ef4444', checks };
    if (passed <= 2) return { level: 1, label: 'Weak', color: '#ef4444', checks };
    if (passed === 3) return { level: 2, label: 'Fair', color: '#f59e0b', checks };
    if (passed === 4) return { level: 3, label: 'Good', color: '#84cc16', checks };
    return { level: 4, label: 'Strong', color: '#10b981', checks };
  };

  const passwordStrength = getPasswordStrength(formData.password);

  const handleAddressSelect = useCallback((addressData) => {
    setFormData(prev => ({
      ...prev,
      address: {
        ...prev.address,
        street: addressData.street,
        city: addressData.city,
        state: addressData.state,
        zipCode: addressData.zipCode
      }
    }));
  }, []);

  const handleVehicleChange = (e) => {
    const { name, value } = e.target;

    if (name === 'make') {
      // Reset model when brand changes
      setVehicleData({
        ...vehicleData,
        make: value,
        model: ''
      });
    } else {
      setVehicleData({
        ...vehicleData,
        [name]: value
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate email is verified via OTP
    if (!emailOtp.verified) {
      setError('Please verify your email address before registering.');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate password strength (must be at least Fair)
    if (passwordStrength.level < 2) {
      setError('Password is too weak. It must be at least 8 characters and include a mix of uppercase, lowercase, and numbers.');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate passwords match
    if (formData.password !== confirmPassword) {
      setError('Passwords do not match. Please re-enter your password.');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Require Terms of Service acceptance
    if (!acceptedTerms) {
      setError('You must agree to the Terms of Service to create an account.');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      // License/address are collected later in the Profile page. Submit
      // minimal registration data here.
      const registrationData = {
        ...formData,
        smsConsent: { granted: smsOptIn }
      };

      await register(registrationData);

      // Explicitly ask the browser to save the credential. Needed for
      // React SPA signups because preventDefault() + History API navigation
      // doesn't reliably trigger the browser's heuristic save prompt.
      if (window.PasswordCredential) {
        try {
          const cred = new window.PasswordCredential({
            id: formData.email,
            password: formData.password,
            name: `${formData.firstName || ''} ${formData.lastName || ''}`.trim() || formData.email,
          });
          await navigator.credentials.store(cred);
        } catch (credErr) {
          // Credential storage is a nicety — silently continue if it fails
        }
      }

      // If user is host, go to host dashboard
      if (formData.userType === 'host') {
        navigate('/host/dashboard');
      } else {
        // If just a driver, go to driver dashboard
        navigate('/driver/my-bookings');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleVehicleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate VIN
    if (!vehicleData.vin || vehicleData.vin.trim().length !== 17) {
      setError('Please enter a valid 17-character VIN');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Block submission if VIN-decoded data doesn't match entered data
    if (vinDecodedData) {
      const mismatches = [];
      if (vinDecodedData.make && vehicleData.make && vinDecodedData.make.toLowerCase() !== vehicleData.make.toLowerCase()) {
        mismatches.push(`Make: VIN says "${vinDecodedData.make}" but you selected "${vehicleData.make}"`);
      }
      if (vinDecodedData.year && vehicleData.year && String(vinDecodedData.year) !== String(vehicleData.year)) {
        mismatches.push(`Year: VIN says "${vinDecodedData.year}" but you entered "${vehicleData.year}"`);
      }
      if (mismatches.length > 0) {
        setError(`Vehicle details don't match VIN. ${mismatches.join('. ')}. Please correct the fields or re-enter the VIN.`);
        setVinMismatch(mismatches);
        setLoading(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

    // Validate that at least Photo 1 is uploaded
    if (!vehicleData.image1 || vehicleData.image1.trim() === '') {
      setError('Please upload at least one photo (Photo 1 is required)');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate that registration image is uploaded
    if (!vehicleData.registrationImage || vehicleData.registrationImage.trim() === '') {
      setError('Vehicle registration photo is required');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      const token = localStorage.getItem('token');

      // Prepare vehicle data with coordinates and images
      const images = [
        vehicleData.image1,
        vehicleData.image2,
        vehicleData.image3,
        vehicleData.image4
      ].filter(img => img && img.trim() !== ''); // Only include non-empty image URLs

      const vehiclePayload = {
        vin: vehicleData.vin.trim().toUpperCase(),
        make: vehicleData.make,
        model: vehicleData.model,
        year: parseInt(vehicleData.year),
        type: vehicleData.type,
        transmission: vehicleData.transmission,
        seats: parseInt(vehicleData.seats),
        description: vehicleData.description,
        pricePerDay: parseFloat(vehicleData.pricePerDay),
        pricePerWeek: vehicleData.pricePerWeek ? parseFloat(vehicleData.pricePerWeek) : undefined,
        pricePerMonth: vehicleData.pricePerMonth ? parseFloat(vehicleData.pricePerMonth) : undefined,
        images: images.length > 0 ? images : undefined,
        registrationImage: vehicleData.registrationImage,
        location: {
          address: vehicleData.address,
          city: vehicleData.city,
          state: vehicleData.state,
          zipCode: vehicleData.zipCode
        }
      };

      await axios.post(`${API_URL}/api/vehicles`, vehiclePayload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Navigate to host dashboard after adding vehicle
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create vehicle listing. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  const skipVehicle = () => {
    navigate('/host/dashboard');
  };

  return (
    <div>
      <Navbar />
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            {step === 1 ? (
              <>
                <h1 className="auth-title">Create Account</h1>
                <p className="auth-subtitle">Join the <span style={{color: '#10b981', fontWeight: 'bold'}}>RentUFS</span> community</p>

                {error && <div className="error-message">{error}</div>}

                {googleNewUserCredential ? (
                  <div style={{ textAlign: 'center' }}>
                    <h3 style={{ color: '#10b981', marginBottom: '0.5rem' }}>One last step</h3>
                    <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                      How will you use RentUFS?
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                      {[
                        { value: 'driver', label: 'Rent cars (Driver)' },
                        { value: 'host', label: 'List my car (Host)' }
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
                    onError={() => setError('Google sign-up failed. Please try again.')}
                    theme="filled_black"
                    text="signup_with"
                    shape="rectangular"
                    width="320"
                  />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', margin: '1rem 0' }}>
                  <div style={{ flex: 1, height: '1px', background: '#374151' }} />
                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>or sign up with email</span>
                  <div style={{ flex: 1, height: '1px', background: '#374151' }} />
                </div>

                <form onSubmit={handleSubmit} className="auth-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">First Name</label>
                      <input
                        type="text"
                        name="firstName"
                        className="form-input"
                        value={formData.firstName}
                        onChange={handleChange}
                        maxLength="30"
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Last Name</label>
                      <input
                        type="text"
                        name="lastName"
                        className="form-input"
                        value={formData.lastName}
                        onChange={handleChange}
                        maxLength="30"
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <div className="email-otp-row">
                      <input
                        type="email"
                        name="email"
                        className="form-input"
                        value={formData.email}
                        onChange={handleChange}
                        maxLength="100"
                        autoComplete="email"
                        required
                        disabled={emailOtp.verified}
                      />
                      {!emailOtp.verified && (
                        <button
                          type="button"
                          className="otp-send-btn"
                          onClick={handleSendOtp}
                          disabled={emailOtp.sending || emailOtp.cooldown > 0 || !formData.email.trim()}
                        >
                          {emailOtp.sending ? 'Sending...' : emailOtp.cooldown > 0 ? `Resend (${emailOtp.cooldown}s)` : emailOtp.sent ? 'Resend Code' : 'Send Code'}
                        </button>
                      )}
                    </div>

                    {emailOtp.sent && !emailOtp.verified && (
                      <div className="otp-verify-section">
                        <p className="otp-instruction">Enter the 6-digit code sent to {formData.email}</p>
                        <div className="otp-input-row">
                          <input
                            type="text"
                            className="form-input otp-code-input"
                            value={emailOtp.code}
                            onChange={(e) => {
                              const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                              setEmailOtp(prev => ({ ...prev, code: val, error: '' }));
                            }}
                            placeholder="000000"
                            maxLength="6"
                          />
                          <button
                            type="button"
                            className="otp-verify-btn"
                            onClick={handleVerifyOtp}
                            disabled={emailOtp.verifying || emailOtp.code.length !== 6}
                          >
                            {emailOtp.verifying ? 'Verifying...' : 'Verify'}
                          </button>
                        </div>
                      </div>
                    )}

                    {emailOtp.verified && (
                      <div className="otp-verified-badge">
                        <span className="otp-verified-icon">&#10003;</span> Email Verified
                      </div>
                    )}

                    {emailOtp.error && (
                      <p className="otp-error">{emailOtp.error}</p>
                    )}
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
                        minLength="8"
                        maxLength="40"
                        autoComplete="new-password"
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
                    {formData.password && (
                      <div className="password-strength">
                        <div className="password-strength-bar">
                          {[1, 2, 3, 4].map(i => (
                            <div key={i} className="password-strength-segment" style={{
                              backgroundColor: i <= passwordStrength.level ? passwordStrength.color : '#333'
                            }} />
                          ))}
                        </div>
                        <span className="password-strength-label" style={{ color: passwordStrength.color }}>
                          {passwordStrength.label}
                        </span>
                        <div className="password-strength-checks">
                          <span style={{ color: formData.password.length >= 8 ? '#10b981' : '#6b7280' }}>8 character min</span>
                          <span style={{ color: /[A-Z]/.test(formData.password) ? '#10b981' : '#6b7280' }}>1 uppercase</span>
                          <span style={{ color: /[a-z]/.test(formData.password) ? '#10b981' : '#6b7280' }}>1 lowercase</span>
                          <span style={{ color: /[0-9]/.test(formData.password) ? '#10b981' : '#6b7280' }}>1 number</span>
                          <span style={{ color: /[^A-Za-z0-9]/.test(formData.password) ? '#10b981' : '#6b7280' }}>1 special character</span>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Confirm Password</label>
                    <div className="password-input-wrapper">
                      <input
                        type={showConfirmPassword ? 'text' : 'password'}
                        className="form-input"
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        required
                        minLength="8"
                        maxLength="40"
                      />
                      <button
                        type="button"
                        className="password-toggle-btn"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? '🙈' : '👁'}
                      </button>
                    </div>
                    {confirmPassword && (
                      <div className={`password-match ${formData.password === confirmPassword ? 'match' : 'no-match'}`}>
                        {formData.password === confirmPassword ? 'Passwords match' : 'Passwords do not match'}
                      </div>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone *</label>
                    <input
                      type="tel"
                      name="phone"
                      className="form-input"
                      value={formData.phone}
                      onChange={handleChange}
                      placeholder="(555) 555-5555"
                      maxLength="14"
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">I want to</label>
                    <select
                      name="userType"
                      className="form-select"
                      value={formData.userType}
                      onChange={handleChange}
                    >
                      <option value="driver">Rent cars (Driver)</option>
                      <option value="host">List my car (Host)</option>
                    </select>
                  </div>

                  {/* Profile Picture / Business Logo */}
                  {formData.userType === 'host' && (
                    <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '1.5rem', marginTop: '1rem' }}>
                      <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#1f2937' }}>
                        Profile Picture or Business Logo
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                        Upload a photo of yourself or your business logo. This is displayed on your vehicle listings.
                      </p>
                      <ImageUpload
                        label="Your Photo / Logo"
                        value={formData.profileImage}
                        onChange={(url) => setFormData(prev => ({ ...prev, profileImage: url }))}
                      />
                    </div>
                  )}

                  {formData.userType === 'driver' && (
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '1rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem', border: '1px solid #e5e7eb' }}>
                      ℹ️ You'll add your date of birth, driver's license, and home address from your Profile page after signing up. This only takes a minute and is required before you can book a vehicle. You must be at least 21 to rent.
                    </p>
                  )}

                  <div className="form-group terms-accept-group" style={{ marginTop: '1.5rem' }}>
                    <label className="terms-accept-label">
                      <input
                        type="checkbox"
                        className="terms-accept-checkbox"
                        checked={acceptedTerms}
                        onChange={(e) => setAcceptedTerms(e.target.checked)}
                      />
                      <span>
                        I have read and agree to the{' '}
                        <a href="https://rentufs.com/terms-of-service" target="_blank" rel="noopener noreferrer" className="auth-link">
                          Terms of Service
                        </a>
                        .
                      </span>
                    </label>
                  </div>

                  <div className="form-group terms-accept-group" style={{ marginTop: '0.75rem' }}>
                    <label className="terms-accept-label">
                      <input
                        type="checkbox"
                        className="terms-accept-checkbox"
                        checked={smsOptIn}
                        onChange={(e) => setSmsOptIn(e.target.checked)}
                      />
                      <span>
                        I agree to receive SMS from RentUFS for booking
                        confirmations, reservation reminders, trip updates,
                        host notifications, and account/security alerts. Msg
                        frequency varies. Msg &amp; data rates may apply.
                        Reply STOP to opt out, HELP for help.{' '}
                        <Link to="/sms-terms" target="_blank" rel="noopener noreferrer" className="auth-link">
                          SMS Terms
                        </Link>
                        {' · '}
                        <a href="https://rentufs.com/privacy" target="_blank" rel="noopener noreferrer" className="auth-link">
                          Privacy Policy
                        </a>
                        . <em>(Optional)</em>
                      </span>
                    </label>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1rem' }}
                    disabled={loading || !acceptedTerms}
                  >
                    {loading ? 'Creating account...' : 'Sign Up'}
                  </button>
                </form>

                <p className="auth-footer">
                  Already have an account?{' '}
                  <Link to="/login" className="auth-link">
                    Login
                  </Link>
                </p>
                </>
                )}
              </>
            ) : (
              <>
                <h1 className="auth-title">List Your Vehicle</h1>
                <p className="auth-subtitle">Add your car details to start earning</p>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleVehicleSubmit} className="auth-form">
                  {/* VIN with decode */}
                  <div className="form-group">
                    <label className="form-label">VIN (Vehicle Identification Number) *</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        name="vin"
                        className="form-input"
                        value={vehicleData.vin}
                        onChange={(e) => {
                          handleVehicleChange(e);
                          setVinDecoded(false);
                          setVinDecodedData(null);
                          setVinMismatch(null);
                        }}
                        placeholder="Enter 17-character VIN"
                        maxLength="17"
                        style={{ textTransform: 'uppercase', flex: 1 }}
                        required
                      />
                      <button
                        type="button"
                        onClick={handleDecodeVin}
                        disabled={vinLoading || vehicleData.vin.length !== 17}
                        className="btn btn-primary"
                        style={{
                          whiteSpace: 'nowrap',
                          opacity: vehicleData.vin.length !== 17 ? 0.5 : 1
                        }}
                      >
                        {vinLoading ? 'Decoding...' : 'Decode VIN'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Enter VIN and click Decode to auto-fill vehicle details
                    </p>
                    {vinDecoded && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.75rem',
                        backgroundColor: '#d1fae5',
                        color: '#065f46',
                        borderRadius: '0.5rem',
                        border: '1px solid #10b981',
                        fontSize: '0.9rem'
                      }}>
                        VIN decoded: {vehicleData.year} {vehicleData.make} {vehicleData.model}. Make, model, and year are locked to match your VIN. To change them, clear the VIN field above.
                      </div>
                    )}
                    {vinMismatch && (
                      <div style={{
                        marginTop: '0.5rem',
                        padding: '0.75rem',
                        backgroundColor: '#fffbeb',
                        color: '#92400e',
                        borderRadius: '0.5rem',
                        border: '1px solid #f59e0b',
                        fontSize: '0.9rem'
                      }}>
                        {vinMismatch.map((msg, i) => <div key={i}>{msg}</div>)}
                      </div>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Make {vinDecodedData?.make && vinDecoded && <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 'normal' }}>VIN-verified</span>}</label>
                      <select
                        name="make"
                        className="form-select"
                        value={vehicleData.make}
                        onChange={handleVehicleChange}
                        required
                        disabled={!!(vinDecoded && vinDecodedData?.make)}
                        style={vinDecoded && vinDecodedData?.make ? { backgroundColor: '#f0fdf4', borderColor: '#10b981' } : {}}
                      >
                        <option value="">Select a brand</option>
                        <option value="Acura">Acura</option>
                        <option value="Alfa Romeo">Alfa Romeo</option>
                        <option value="Audi">Audi</option>
                        <option value="BMW">BMW</option>
                        <option value="Buick">Buick</option>
                        <option value="Cadillac">Cadillac</option>
                        <option value="Chevrolet">Chevrolet</option>
                        <option value="Chrysler">Chrysler</option>
                        <option value="Dodge">Dodge</option>
                        <option value="Ferrari">Ferrari</option>
                        <option value="Fiat">Fiat</option>
                        <option value="Ford">Ford</option>
                        <option value="Genesis">Genesis</option>
                        <option value="GMC">GMC</option>
                        <option value="Honda">Honda</option>
                        <option value="Hyundai">Hyundai</option>
                        <option value="Infiniti">Infiniti</option>
                        <option value="Jaguar">Jaguar</option>
                        <option value="Jeep">Jeep</option>
                        <option value="Kia">Kia</option>
                        <option value="Lamborghini">Lamborghini</option>
                        <option value="Land Rover">Land Rover</option>
                        <option value="Lexus">Lexus</option>
                        <option value="Lincoln">Lincoln</option>
                        <option value="Maserati">Maserati</option>
                        <option value="Mazda">Mazda</option>
                        <option value="McLaren">McLaren</option>
                        <option value="Mercedes-Benz">Mercedes-Benz</option>
                        <option value="Mini">Mini</option>
                        <option value="Mitsubishi">Mitsubishi</option>
                        <option value="Nissan">Nissan</option>
                        <option value="Porsche">Porsche</option>
                        <option value="Ram">Ram</option>
                        <option value="Rivian">Rivian</option>
                        <option value="Rolls-Royce">Rolls-Royce</option>
                        <option value="Subaru">Subaru</option>
                        <option value="Tesla">Tesla</option>
                        <option value="Toyota">Toyota</option>
                        <option value="Volkswagen">Volkswagen</option>
                        <option value="Volvo">Volvo</option>
                        <option value="Other">Other</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Model {vinDecodedData?.model && vinDecoded && <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 'normal' }}>VIN-verified</span>}</label>
                      {vinDecoded && vehicleData.model ? (
                        <input
                          type="text"
                          name="model"
                          className="form-input"
                          value={vehicleData.model}
                          readOnly={!!(vinDecoded && vinDecodedData?.model)}
                          style={vinDecoded && vinDecodedData?.model ? { backgroundColor: '#f0fdf4', borderColor: '#10b981' } : {}}
                          required
                        />
                      ) : (
                        <select
                          name="model"
                          className="form-select"
                          value={vehicleData.model}
                          onChange={handleVehicleChange}
                          required
                          disabled={!vehicleData.make}
                        >
                          <option value="">
                            {vehicleData.make ? 'Select a model' : 'Select brand first'}
                          </option>
                          {vehicleData.make && vehicleModels[vehicleData.make]?.map(model => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                      )}
                      {!vehicleData.make && !vinDecoded && (
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          Please select a brand first
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Year {vinDecodedData?.year && vinDecoded && <span style={{ color: '#10b981', fontSize: '0.8rem', fontWeight: 'normal' }}>VIN-verified</span>}</label>
                      <input
                        type="number"
                        name="year"
                        className="form-input"
                        placeholder="e.g., 2020"
                        min="1900"
                        max="2030"
                        value={vehicleData.year}
                        onChange={handleVehicleChange}
                        required
                        readOnly={!!(vinDecoded && vinDecodedData?.year)}
                        style={vinDecoded && vinDecodedData?.year ? { backgroundColor: '#f0fdf4', borderColor: '#10b981' } : {}}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Type</label>
                      <select
                        name="type"
                        className="form-select"
                        value={vehicleData.type}
                        onChange={handleVehicleChange}
                        required
                      >
                        <option value="sedan">Sedan</option>
                        <option value="suv">SUV</option>
                        <option value="truck">Truck</option>
                        <option value="van">Van</option>
                        <option value="convertible">Convertible</option>
                        <option value="coupe">Coupe</option>
                        <option value="wagon">Wagon</option>
                        <option value="other">Other</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Transmission</label>
                      <select
                        name="transmission"
                        className="form-select"
                        value={vehicleData.transmission}
                        onChange={handleVehicleChange}
                      >
                        <option value="automatic">Automatic</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Seats</label>
                      <input
                        type="number"
                        name="seats"
                        className="form-input"
                        placeholder="e.g., 5"
                        min="1"
                        max="15"
                        value={vehicleData.seats}
                        onChange={handleVehicleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Price Per Day ($)</label>
                    <input
                      type="number"
                      name="pricePerDay"
                      className="form-input"
                      placeholder="e.g., 50"
                      min="0"
                      step="0.01"
                      value={vehicleData.pricePerDay}
                      onChange={handleVehicleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Price Per Week ($)</label>
                    <input
                      type="number"
                      name="pricePerWeek"
                      className="form-input"
                      placeholder="e.g., 300 (optional)"
                      min="0"
                      step="0.01"
                      value={vehicleData.pricePerWeek}
                      onChange={handleVehicleChange}
                    />
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Leave blank if you don't offer weekly rentals
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Price Per Month ($)</label>
                    <input
                      type="number"
                      name="pricePerMonth"
                      className="form-input"
                      placeholder="e.g., 1000 (optional)"
                      min="0"
                      step="0.01"
                      value={vehicleData.pricePerMonth}
                      onChange={handleVehicleChange}
                    />
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Leave blank if you don't offer monthly rentals
                    </p>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      name="description"
                      className="form-textarea"
                      placeholder="Tell renters about your car..."
                      value={vehicleData.description}
                      onChange={handleVehicleChange}
                      required
                    />
                  </div>

                  <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.1rem' }}>Vehicle Photos</h3>

                  <ImageUpload
                    label="Photo 1"
                    value={vehicleData.image1}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image1: url }))}
                    required={true}
                  />

                  <ImageUpload
                    label="Photo 2"
                    value={vehicleData.image2}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image2: url }))}
                    required={false}
                  />

                  <ImageUpload
                    label="Photo 3"
                    value={vehicleData.image3}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image3: url }))}
                    required={false}
                  />

                  <ImageUpload
                    label="Photo 4"
                    value={vehicleData.image4}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image4: url }))}
                    required={false}
                  />

                  <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Vehicle Registration</h3>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                    📄 Upload a photo of your vehicle registration document for verification
                  </p>

                  <ImageUpload
                    label="Registration Document"
                    value={vehicleData.registrationImage}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, registrationImage: url }))}
                    required={true}
                  />

                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <input
                      type="text"
                      name="address"
                      className="form-input"
                      placeholder="Street address"
                      value={vehicleData.address}
                      onChange={handleVehicleChange}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input
                        type="text"
                        name="city"
                        className="form-input"
                        placeholder="City"
                        value={vehicleData.city}
                        onChange={handleVehicleChange}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">State</label>
                      <input
                        type="text"
                        name="state"
                        className="form-input"
                        placeholder="State"
                        value={vehicleData.state}
                        onChange={handleVehicleChange}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Zip Code</label>
                      <input
                        type="text"
                        name="zipCode"
                        className="form-input"
                        placeholder="Zip code"
                        value={vehicleData.zipCode}
                        onChange={handleVehicleChange}
                      />
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={loading}
                    >
                      {loading ? 'Adding vehicle...' : 'Add Vehicle'}
                    </button>

                    <button
                      type="button"
                      onClick={skipVehicle}
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      disabled={loading}
                    >
                      Skip for Now
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
