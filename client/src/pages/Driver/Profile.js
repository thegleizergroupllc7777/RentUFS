import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import './Driver.css';

const DriverProfile = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    profileImage: ''
  });
  const [showCamera, setShowCamera] = useState(false);
  const [stream, setStream] = useState(null);
  const [message, setMessage] = useState({ type: '', text: '' });

  // Email change state
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [emailStep, setEmailStep] = useState('edit'); // edit, verify
  const [emailLoading, setEmailLoading] = useState(false);

  // Tax info state (hosts only)
  const [taxInfo, setTaxInfo] = useState(null);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxFormData, setTaxFormData] = useState({ accountType: 'individual', taxId: '', businessName: '' });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMessage, setTaxMessage] = useState('');

  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        email: user.email || '',
        profileImage: user.profileImage || ''
      });
      // Fetch tax info for hosts
      if (user.userType === 'host' || user.userType === 'both') {
        fetchTaxInfo();
      }
    }
  }, [user]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      setStream(mediaStream);
      setShowCamera(true);

      // Wait for video element to be available
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 100);
    } catch (error) {
      console.error('Error accessing camera:', error);
      setMessage({ type: 'error', text: 'Could not access camera. Please allow camera permissions or upload a photo instead.' });
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    setShowCamera(false);
  };

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0);

      const imageDataUrl = canvas.toDataURL('image/jpeg', 0.8);
      uploadImage(imageDataUrl);
      stopCamera();
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Check file type
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }

    // Check file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be less than 5MB' });
      return;
    }

    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('image', file);

      const uploadResponse = await axios.post(
        `${API_URL}/api/upload/image`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const imageUrl = uploadResponse.data.url;
      await updateProfileImage(imageUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      setMessage({ type: 'error', text: 'Failed to upload image' });
    } finally {
      setLoading(false);
    }
  };

  const uploadImage = async (base64Image) => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');

      // Convert base64 to blob
      const response = await fetch(base64Image);
      const blob = await response.blob();
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });

      const formData = new FormData();
      formData.append('image', file);

      const uploadResponse = await axios.post(
        `${API_URL}/api/upload/image`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const imageUrl = uploadResponse.data.url;
      await updateProfileImage(imageUrl);
    } catch (error) {
      console.error('Error uploading image:', error);
      setMessage({ type: 'error', text: 'Failed to upload image' });
    } finally {
      setLoading(false);
    }
  };

  const updateProfileImage = async (imageUrl) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${API_URL}/api/users/profile-image`,
        { profileImage: imageUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setProfileData(prev => ({ ...prev, profileImage: imageUrl }));
      setUser(response.data);
      setMessage({ type: 'success', text: 'Profile photo updated successfully!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Failed to update profile photo' });
    }
  };

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });

    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(
        `${API_URL}/api/users/profile`,
        {
          firstName: profileData.firstName,
          lastName: profileData.lastName,
          phone: profileData.phone
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setUser(response.data);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: 'Failed to update profile' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestEmailChange = async () => {
    if (!newEmail || !newEmail.trim()) {
      setMessage({ type: 'error', text: 'Please enter a new email address' });
      return;
    }
    setEmailLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/users/request-email-change`,
        { newEmail: newEmail.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setEmailStep('verify');
      setMessage({ type: 'success', text: response.data.message });
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to send verification code' });
    } finally {
      setEmailLoading(false);
    }
  };

  const handleConfirmEmailChange = async () => {
    if (!verificationCode || !verificationCode.trim()) {
      setMessage({ type: 'error', text: 'Please enter the verification code' });
      return;
    }
    setEmailLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/users/confirm-email-change`,
        { code: verificationCode.trim() },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setProfileData(prev => ({ ...prev, email: response.data.user.email }));
      setUser(prev => ({ ...prev, email: response.data.user.email }));
      setMessage({ type: 'success', text: 'Email address updated successfully!' });
      setEmailEditing(false);
      setEmailStep('edit');
      setNewEmail('');
      setVerificationCode('');
    } catch (error) {
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to verify code' });
    } finally {
      setEmailLoading(false);
    }
  };

  // Tax info functions
  const fetchTaxInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users/host-tax-info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      if (response.data.hasSubmitted) {
        setTaxFormData({
          accountType: response.data.accountType,
          taxId: '',
          businessName: response.data.businessName || ''
        });
      }
    } catch (error) {
      console.error('Error fetching tax info:', error);
    }
  };

  const formatSSN = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const formatEIN = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  };

  const handleTaxIdInput = (e) => {
    const formatted = taxFormData.accountType === 'individual' ? formatSSN(e.target.value) : formatEIN(e.target.value);
    setTaxFormData({ ...taxFormData, taxId: formatted });
  };

  const handleSaveTaxInfo = async (e) => {
    e.preventDefault();
    setTaxSaving(true);
    setTaxMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API_URL}/api/users/host-tax-info`, taxFormData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      setTaxMessage('Tax information saved successfully!');
      setShowTaxForm(false);
      setTaxFormData(prev => ({ ...prev, taxId: '' }));
    } catch (error) {
      setTaxMessage(error.response?.data?.message || 'Failed to save tax information');
    } finally {
      setTaxSaving(false);
    }
  };

  const cancelEmailChange = () => {
    setEmailEditing(false);
    setEmailStep('edit');
    setNewEmail('');
    setVerificationCode('');
  };

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container" style={{ maxWidth: '600px' }}>
          <h1 className="page-title">My Profile</h1>

          {message.text && (
            <div style={{
              padding: '1rem',
              marginBottom: '1.5rem',
              borderRadius: '0.5rem',
              background: message.type === 'success' ? '#ecfdf5' : '#fef2f2',
              color: message.type === 'success' ? '#059669' : '#dc2626',
              fontWeight: '500'
            }}>
              {message.text}
            </div>
          )}

          {/* Profile Photo Section */}
          <div style={{
            background: '#000',
            borderRadius: '1rem',
            padding: '2rem',
            marginBottom: '1.5rem',
            border: '1px solid #333'
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: '#fff' }}>Profile Photo</h3>

            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
              {/* Current Photo or Placeholder */}
              <div style={{
                width: '150px',
                height: '150px',
                borderRadius: '50%',
                overflow: 'hidden',
                border: '4px solid #10b981',
                background: '#f3f4f6'
              }}>
                {profileData.profileImage ? (
                  <img
                    src={profileData.profileImage}
                    alt="Profile"
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                ) : (
                  <div style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '3rem',
                    color: '#9ca3af'
                  }}>
                    {profileData.firstName?.[0]?.toUpperCase() || '?'}
                  </div>
                )}
              </div>

              {/* Camera View */}
              {showCamera && (
                <div style={{
                  position: 'relative',
                  borderRadius: '1rem',
                  overflow: 'hidden',
                  background: '#000'
                }}>
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    style={{ width: '100%', maxWidth: '400px', display: 'block' }}
                  />
                  <div style={{
                    display: 'flex',
                    gap: '1rem',
                    justifyContent: 'center',
                    padding: '1rem'
                  }}>
                    <button
                      onClick={capturePhoto}
                      className="btn btn-primary"
                      style={{ background: '#10b981' }}
                    >
                      Take Photo
                    </button>
                    <button
                      onClick={stopCamera}
                      className="btn btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden canvas for photo capture */}
              <canvas ref={canvasRef} style={{ display: 'none' }} />

              {/* Upload Buttons */}
              {!showCamera && (
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                  <button
                    onClick={startCamera}
                    className="btn btn-primary"
                    disabled={loading}
                    style={{ background: '#3b82f6' }}
                  >
                    Take Selfie
                  </button>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="btn btn-secondary"
                    disabled={loading}
                  >
                    Upload Photo
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                  />
                </div>
              )}

              {loading && (
                <p style={{ color: '#9ca3af' }}>Uploading...</p>
              )}

              <p style={{ fontSize: '0.875rem', color: '#9ca3af', textAlign: 'center' }}>
                Your photo will be shown to hosts when you book their vehicles
              </p>
            </div>
          </div>

          {/* Profile Info Form */}
          <div style={{
            background: '#000',
            borderRadius: '1rem',
            padding: '2rem',
            border: '1px solid #333'
          }}>
            <h3 style={{ marginBottom: '1.5rem', color: '#fff' }}>Personal Information</h3>

            <form onSubmit={handleProfileUpdate}>
              <div className="form-group">
                <label className="form-label">First Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profileData.firstName}
                  onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Last Name</label>
                <input
                  type="text"
                  className="form-input"
                  value={profileData.lastName}
                  onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Email</label>
                {!emailEditing ? (
                  <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                    <input
                      type="email"
                      className="form-input"
                      value={profileData.email}
                      disabled
                      style={{ background: '#1a1a1a', cursor: 'not-allowed', color: '#6b7280', flex: 1 }}
                    />
                    <button
                      type="button"
                      onClick={() => { setEmailEditing(true); setNewEmail(''); setEmailStep('edit'); }}
                      style={{
                        background: 'none',
                        border: '1px solid #4b5563',
                        color: '#10b981',
                        padding: '0.5rem 1rem',
                        borderRadius: '6px',
                        cursor: 'pointer',
                        fontSize: '0.85rem',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Change
                    </button>
                  </div>
                ) : emailStep === 'edit' ? (
                  <div>
                    <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                      Current: <strong style={{ color: '#e5e7eb' }}>{profileData.email}</strong>
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="email"
                        className="form-input"
                        value={newEmail}
                        onChange={(e) => setNewEmail(e.target.value)}
                        placeholder="Enter new email address"
                        style={{ flex: 1 }}
                      />
                      <button
                        type="button"
                        onClick={handleRequestEmailChange}
                        disabled={emailLoading}
                        style={{
                          background: '#10b981',
                          border: 'none',
                          color: '#000',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          cursor: emailLoading ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          opacity: emailLoading ? 0.7 : 1
                        }}
                      >
                        {emailLoading ? 'Sending...' : 'Send Code'}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={cancelEmailChange}
                      style={{
                        background: 'none',
                        border: 'none',
                        color: '#6b7280',
                        fontSize: '0.85rem',
                        cursor: 'pointer',
                        marginTop: '0.5rem',
                        padding: 0
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div>
                    <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                      A 6-digit code was sent to <strong style={{ color: '#10b981' }}>{newEmail}</strong>
                    </p>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <input
                        type="text"
                        className="form-input"
                        value={verificationCode}
                        onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="Enter 6-digit code"
                        maxLength={6}
                        style={{
                          flex: 1,
                          letterSpacing: '0.3em',
                          textAlign: 'center',
                          fontSize: '1.2rem',
                          fontWeight: 'bold'
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleConfirmEmailChange}
                        disabled={emailLoading || verificationCode.length !== 6}
                        style={{
                          background: '#10b981',
                          border: 'none',
                          color: '#000',
                          padding: '0.5rem 1rem',
                          borderRadius: '6px',
                          cursor: (emailLoading || verificationCode.length !== 6) ? 'not-allowed' : 'pointer',
                          fontSize: '0.85rem',
                          fontWeight: '600',
                          whiteSpace: 'nowrap',
                          opacity: (emailLoading || verificationCode.length !== 6) ? 0.7 : 1
                        }}
                      >
                        {emailLoading ? 'Verifying...' : 'Verify'}
                      </button>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                      <button
                        type="button"
                        onClick={() => { setEmailStep('edit'); setVerificationCode(''); }}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6b7280',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Use different email
                      </button>
                      <button
                        type="button"
                        onClick={handleRequestEmailChange}
                        disabled={emailLoading}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#10b981',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Resend code
                      </button>
                      <button
                        type="button"
                        onClick={cancelEmailChange}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: '#6b7280',
                          fontSize: '0.85rem',
                          cursor: 'pointer',
                          padding: 0
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Phone Number</label>
                <input
                  type="tel"
                  className="form-input"
                  value={profileData.phone}
                  onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="(555) 123-4567"
                />
              </div>

              <button
                type="submit"
                className="btn btn-primary"
                disabled={loading}
                style={{ width: '100%', marginTop: '1rem' }}
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          </div>

          {/* Tax Information Section - Hosts Only */}
          {(user?.userType === 'host' || user?.userType === 'both') && taxInfo && (
            <div style={{
              background: '#000',
              borderRadius: '1rem',
              padding: '2rem',
              marginTop: '1.5rem',
              border: taxInfo.hasSubmitted ? '1px solid #333' : '2px solid #f59e0b'
            }}>
              <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>Tax Information</h3>

              {!taxInfo.hasSubmitted && (
                <div style={{
                  background: '#78350f',
                  border: '1px solid #f59e0b',
                  borderRadius: '0.5rem',
                  padding: '0.75rem 1rem',
                  marginBottom: '1.25rem',
                  fontSize: '0.85rem',
                  color: '#fde68a'
                }}>
                  Tax information is required before you can receive payouts. Funds will be withheld until this is completed.
                </div>
              )}

              {taxInfo.hasSubmitted && !showTaxForm && (
                <div style={{ marginBottom: '1rem' }}>
                  <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: '0.25rem 0' }}>
                    Account Type: <span style={{ color: '#e5e7eb', fontWeight: '500' }}>{taxInfo.accountType === 'business' ? 'Business / LLC' : 'Individual'}</span>
                  </p>
                  {taxInfo.accountType === 'business' && taxInfo.businessName && (
                    <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: '0.25rem 0' }}>
                      Business: <span style={{ color: '#e5e7eb', fontWeight: '500' }}>{taxInfo.businessName}</span>
                    </p>
                  )}
                  <p style={{ fontSize: '0.9rem', color: '#9ca3af', margin: '0.25rem 0' }}>
                    {taxInfo.accountType === 'individual' ? 'SSN' : 'EIN'}: <span style={{ color: '#e5e7eb', fontWeight: '500' }}>****{taxInfo.taxIdLast4}</span>
                  </p>
                  <p style={{ fontSize: '0.8rem', color: '#10b981', marginTop: '0.5rem' }}>
                    Tax information on file
                  </p>
                </div>
              )}

              {taxMessage && !showTaxForm && (
                <p style={{ fontSize: '0.85rem', color: taxMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '0.75rem' }}>{taxMessage}</p>
              )}

              {!showTaxForm && (
                <button
                  onClick={() => { setShowTaxForm(true); setTaxMessage(''); }}
                  className="btn btn-primary"
                  style={{ background: taxInfo.hasSubmitted ? '#4b5563' : '#10b981', width: '100%' }}
                >
                  {taxInfo.hasSubmitted ? 'Update Tax Information' : 'Add Tax Information'}
                </button>
              )}

              {showTaxForm && (
                <form onSubmit={handleSaveTaxInfo} style={{ marginTop: '0.5rem' }}>
                  <div className="form-group">
                    <label className="form-label">Account Type</label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <label style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.75rem',
                        border: taxFormData.accountType === 'individual' ? '2px solid #10b981' : '2px solid #333',
                        borderRadius: '8px', cursor: 'pointer',
                        background: taxFormData.accountType === 'individual' ? 'rgba(16,185,129,0.1)' : 'transparent'
                      }}>
                        <input type="radio" value="individual" checked={taxFormData.accountType === 'individual'}
                          onChange={() => setTaxFormData({ accountType: 'individual', taxId: '', businessName: '' })}
                          style={{ accentColor: '#10b981' }} />
                        <div>
                          <span style={{ fontWeight: '600', color: '#e5e7eb', fontSize: '0.9rem' }}>Individual</span>
                          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Personal SSN</p>
                        </div>
                      </label>
                      <label style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.75rem',
                        border: taxFormData.accountType === 'business' ? '2px solid #10b981' : '2px solid #333',
                        borderRadius: '8px', cursor: 'pointer',
                        background: taxFormData.accountType === 'business' ? 'rgba(16,185,129,0.1)' : 'transparent'
                      }}>
                        <input type="radio" value="business" checked={taxFormData.accountType === 'business'}
                          onChange={() => setTaxFormData({ accountType: 'business', taxId: '', businessName: '' })}
                          style={{ accentColor: '#10b981' }} />
                        <div>
                          <span style={{ fontWeight: '600', color: '#e5e7eb', fontSize: '0.9rem' }}>Business / LLC</span>
                          <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Company EIN</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {taxFormData.accountType === 'business' && (
                    <div className="form-group">
                      <label className="form-label">Business Name</label>
                      <input type="text" className="form-input"
                        value={taxFormData.businessName}
                        onChange={(e) => setTaxFormData({ ...taxFormData, businessName: e.target.value })}
                        placeholder="e.g., United Fleet Services LLC"
                        required />
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">
                      {taxFormData.accountType === 'individual' ? 'Social Security Number (SSN)' : 'Employer ID Number (EIN)'}
                    </label>
                    <input type="text" className="form-input"
                      value={taxFormData.taxId}
                      onChange={handleTaxIdInput}
                      placeholder={taxFormData.accountType === 'individual' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                      maxLength={taxFormData.accountType === 'individual' ? 11 : 10}
                      required />
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Stored securely. Only the last 4 digits will be visible.
                    </p>
                  </div>

                  {taxMessage && (
                    <p style={{ fontSize: '0.85rem', color: taxMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '0.75rem' }}>{taxMessage}</p>
                  )}

                  <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button type="submit" className="btn btn-primary" disabled={taxSaving}
                      style={{ flex: 1 }}>
                      {taxSaving ? 'Saving...' : 'Save Tax Information'}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={() => { setShowTaxForm(false); setTaxMessage(''); }}
                      style={{ flex: 0 }}>
                      Cancel
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}

          <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
            <button
              onClick={() => navigate('/driver/my-bookings')}
              className="btn btn-secondary"
            >
              Back to My Reservations
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverProfile;
