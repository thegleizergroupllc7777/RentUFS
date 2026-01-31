import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Driver.css';

const DriverProfile = () => {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const isHost = user?.userType === 'host' || user?.userType === 'both';
  const defaultTab = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(defaultTab);

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
  const [emailStep, setEmailStep] = useState('edit');
  const [emailLoading, setEmailLoading] = useState(false);

  // Tax info state (hosts only)
  const [taxInfo, setTaxInfo] = useState(null);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxFormData, setTaxFormData] = useState({ accountType: 'individual', taxId: '', businessName: '' });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMessage, setTaxMessage] = useState('');

  // Reports state (hosts only)
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('month');
  const [reportData, setReportData] = useState(null);
  const [reportError, setReportError] = useState('');

  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        email: user.email || '',
        profileImage: user.profileImage || ''
      });
      if (isHost) {
        fetchTaxInfo();
      }
    }
  }, [user]);

  useEffect(() => {
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  useEffect(() => {
    if (activeTab === 'reports' && isHost && !reportData) {
      fetchReports();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'reports' && isHost) {
      fetchReports();
    }
  }, [reportPeriod]);

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
  };

  // === Profile functions ===
  const startCamera = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: 640, height: 480 }
      });
      setStream(mediaStream);
      setShowCamera(true);
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
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be less than 5MB' });
      return;
    }
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const formData = new FormData();
      formData.append('image', file);
      const uploadResponse = await axios.post(`${API_URL}/api/upload/image`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      await updateProfileImage(uploadResponse.data.url);
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
      const response = await fetch(base64Image);
      const blob = await response.blob();
      const file = new File([blob], 'selfie.jpg', { type: 'image/jpeg' });
      const formData = new FormData();
      formData.append('image', file);
      const uploadResponse = await axios.post(`${API_URL}/api/upload/image`, formData, {
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'multipart/form-data' }
      });
      await updateProfileImage(uploadResponse.data.url);
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
      const response = await axios.put(`${API_URL}/api/users/profile-image`, { profileImage: imageUrl }, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
      const response = await axios.put(`${API_URL}/api/users/profile`, {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phone: profileData.phone
      }, { headers: { Authorization: `Bearer ${token}` } });
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
      const response = await axios.post(`${API_URL}/api/users/request-email-change`, { newEmail: newEmail.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
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
      const response = await axios.post(`${API_URL}/api/users/confirm-email-change`, { code: verificationCode.trim() }, {
        headers: { Authorization: `Bearer ${token}` }
      });
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

  const cancelEmailChange = () => {
    setEmailEditing(false);
    setEmailStep('edit');
    setNewEmail('');
    setVerificationCode('');
  };

  // === Tax functions ===
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
      setTaxInfo({ accountType: 'individual', taxIdLast4: '', businessName: '', hasSubmitted: false });
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
      setTaxMessage('Tax information saved successfully');
      setShowTaxForm(false);
      setTaxFormData({ ...taxFormData, taxId: '' });
    } catch (error) {
      setTaxMessage(error.response?.data?.message || 'Failed to save tax information');
    } finally {
      setTaxSaving(false);
    }
  };

  // === Reports functions ===
  const fetchReports = async () => {
    setReportLoading(true);
    setReportError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/reports/host?period=${reportPeriod}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setReportData(response.data);
    } catch (error) {
      console.error('Error fetching reports:', error);
      setReportError('Failed to load reports');
    } finally {
      setReportLoading(false);
    }
  };

  // === Tab content renderers ===
  const renderProfileTab = () => (
    <>
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
          <div style={{
            width: '150px',
            height: '150px',
            borderRadius: '50%',
            overflow: 'hidden',
            border: '4px solid #10b981',
            background: '#f3f4f6'
          }}>
            {profileData.profileImage ? (
              <img src={profileData.profileImage} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '3rem', color: '#9ca3af' }}>
                {profileData.firstName?.[0]?.toUpperCase() || '?'}
              </div>
            )}
          </div>

          {showCamera && (
            <div style={{ position: 'relative', borderRadius: '1rem', overflow: 'hidden', background: '#000' }}>
              <video ref={videoRef} autoPlay playsInline style={{ width: '100%', maxWidth: '400px', display: 'block' }} />
              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', padding: '1rem' }}>
                <button onClick={capturePhoto} className="btn btn-primary" style={{ background: '#10b981' }}>Take Photo</button>
                <button onClick={stopCamera} className="btn btn-secondary">Cancel</button>
              </div>
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          {!showCamera && (
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', justifyContent: 'center' }}>
              <button onClick={startCamera} className="btn btn-primary" disabled={loading} style={{ background: '#3b82f6' }}>Take Selfie</button>
              <button onClick={() => fileInputRef.current?.click()} className="btn btn-secondary" disabled={loading}>Upload Photo</button>
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
            </div>
          )}
          {loading && <p style={{ color: '#9ca3af' }}>Uploading...</p>}
          <p style={{ fontSize: '0.875rem', color: '#9ca3af', textAlign: 'center' }}>
            Your photo will be shown to hosts when you book their vehicles
          </p>
        </div>
      </div>

      {/* Profile Info Form */}
      <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#fff' }}>Personal Information</h3>
        <form onSubmit={handleProfileUpdate}>
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input type="text" className="form-input" value={profileData.firstName}
              onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input type="text" className="form-input" value={profileData.lastName}
              onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value }))} required />
          </div>
          <div className="form-group">
            <label className="form-label">Email</label>
            {!emailEditing ? (
              <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                <input type="email" className="form-input" value={profileData.email} disabled
                  style={{ background: '#1a1a1a', cursor: 'not-allowed', color: '#6b7280', flex: 1 }} />
                <button type="button" onClick={() => { setEmailEditing(true); setNewEmail(''); setEmailStep('edit'); }}
                  style={{ background: 'none', border: '1px solid #4b5563', color: '#10b981', padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', fontSize: '0.85rem', whiteSpace: 'nowrap' }}>
                  Change
                </button>
              </div>
            ) : emailStep === 'edit' ? (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                  Current: <strong style={{ color: '#e5e7eb' }}>{profileData.email}</strong>
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="email" className="form-input" value={newEmail} onChange={(e) => setNewEmail(e.target.value)}
                    placeholder="Enter new email address" style={{ flex: 1 }} />
                  <button type="button" onClick={handleRequestEmailChange} disabled={emailLoading}
                    style={{ background: '#10b981', border: 'none', color: '#000', padding: '0.5rem 1rem', borderRadius: '6px', cursor: emailLoading ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap', opacity: emailLoading ? 0.7 : 1 }}>
                    {emailLoading ? 'Sending...' : 'Send Code'}
                  </button>
                </div>
                <button type="button" onClick={cancelEmailChange}
                  style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', marginTop: '0.5rem', padding: 0 }}>
                  Cancel
                </button>
              </div>
            ) : (
              <div>
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '0.5rem' }}>
                  A 6-digit code was sent to <strong style={{ color: '#10b981' }}>{newEmail}</strong>
                </p>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <input type="text" className="form-input" value={verificationCode}
                    onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="Enter 6-digit code" maxLength={6}
                    style={{ flex: 1, letterSpacing: '0.3em', textAlign: 'center', fontSize: '1.2rem', fontWeight: 'bold' }} />
                  <button type="button" onClick={handleConfirmEmailChange} disabled={emailLoading || verificationCode.length !== 6}
                    style={{ background: '#10b981', border: 'none', color: '#000', padding: '0.5rem 1rem', borderRadius: '6px', cursor: (emailLoading || verificationCode.length !== 6) ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: '600', whiteSpace: 'nowrap', opacity: (emailLoading || verificationCode.length !== 6) ? 0.7 : 1 }}>
                    {emailLoading ? 'Verifying...' : 'Verify'}
                  </button>
                </div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem' }}>
                  <button type="button" onClick={() => { setEmailStep('edit'); setVerificationCode(''); }}
                    style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}>Use different email</button>
                  <button type="button" onClick={handleRequestEmailChange} disabled={emailLoading}
                    style={{ background: 'none', border: 'none', color: '#10b981', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}>Resend code</button>
                  <button type="button" onClick={cancelEmailChange}
                    style={{ background: 'none', border: 'none', color: '#6b7280', fontSize: '0.85rem', cursor: 'pointer', padding: 0 }}>Cancel</button>
                </div>
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="form-label">Phone Number</label>
            <input type="tel" className="form-input" value={profileData.phone}
              onChange={(e) => setProfileData(prev => ({ ...prev, phone: e.target.value }))} placeholder="(555) 123-4567" />
          </div>
          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </>
  );

  const renderTaxTab = () => (
    <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
      <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>Tax Information</h3>
      <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
        Manage your tax details for 1099 reporting and payouts.
      </p>

      {/* Current Status */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem',
        background: taxInfo?.hasSubmitted ? '#064e3b' : '#78350f',
        border: `1px solid ${taxInfo?.hasSubmitted ? '#10b981' : '#f59e0b'}`
      }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontWeight: '700', fontSize: '0.9rem', flexShrink: 0,
          background: taxInfo?.hasSubmitted ? '#10b981' : '#f59e0b',
          color: '#000'
        }}>
          {taxInfo?.hasSubmitted ? '\u2713' : '!'}
        </div>
        <span style={{ fontSize: '0.9rem', color: taxInfo?.hasSubmitted ? '#a7f3d0' : '#fde68a' }}>
          {taxInfo?.hasSubmitted ? 'Tax information is on file' : 'Tax information required for payouts'}
        </span>
      </div>

      {/* Saved Details */}
      {taxInfo?.hasSubmitted && !showTaxForm && (
        <div style={{
          background: '#111', borderRadius: '0.5rem', padding: '1.25rem',
          marginBottom: '1.5rem', border: '1px solid #333'
        }}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div>
              <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Account Type</span>
              <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                {taxInfo.accountType === 'business' ? 'Business / LLC' : 'Individual'}
              </p>
            </div>
            {taxInfo.accountType === 'business' && taxInfo.businessName && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Name</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>{taxInfo.businessName}</p>
              </div>
            )}
            <div>
              <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {taxInfo.accountType === 'individual' ? 'SSN' : 'EIN'}
              </span>
              <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>****{taxInfo.taxIdLast4}</p>
            </div>
          </div>
        </div>
      )}

      {taxMessage && !showTaxForm && (
        <p style={{ fontSize: '0.85rem', color: taxMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '1rem' }}>{taxMessage}</p>
      )}

      {!showTaxForm && (
        <button onClick={() => { setShowTaxForm(true); setTaxMessage(''); }}
          className={`btn ${taxInfo?.hasSubmitted ? 'btn-secondary' : 'btn-primary'}`} style={{ width: '100%' }}>
          {taxInfo?.hasSubmitted ? 'Update Tax Information' : 'Add Tax Information'}
        </button>
      )}

      {showTaxForm && (
        <form onSubmit={handleSaveTaxInfo}>
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ display: 'block', fontWeight: '600', fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.5rem' }}>Account Type</label>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <label style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem',
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
                flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.75rem',
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
              <input type="text" className="form-input" value={taxFormData.businessName}
                onChange={(e) => setTaxFormData({ ...taxFormData, businessName: e.target.value })}
                placeholder="e.g., United Fleet Services LLC" required />
            </div>
          )}

          <div className="form-group">
            <label className="form-label">
              {taxFormData.accountType === 'individual' ? 'Social Security Number (SSN)' : 'Employer ID Number (EIN)'}
            </label>
            <input type="text" className="form-input" value={taxFormData.taxId}
              onChange={handleTaxIdInput}
              placeholder={taxFormData.accountType === 'individual' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
              maxLength={taxFormData.accountType === 'individual' ? 11 : 10} required />
            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
              Stored securely. Only the last 4 digits will be visible.
            </p>
          </div>

          {taxMessage && (
            <p style={{ fontSize: '0.85rem', color: taxMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '0.75rem' }}>{taxMessage}</p>
          )}

          <div style={{ display: 'flex', gap: '0.75rem' }}>
            <button type="submit" className="btn btn-primary" disabled={taxSaving} style={{ flex: 1 }}>
              {taxSaving ? 'Saving...' : 'Save Tax Information'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowTaxForm(false); setTaxMessage(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Info */}
      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#111', borderRadius: '0.5rem', border: '1px solid #333' }}>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
          The IRS requires platforms to report earnings via Form 1099-K for hosts earning over $600/year.
          Your tax ID is encrypted and stored securely.
        </p>
      </div>
    </div>
  );

  const renderReportsTab = () => (
    <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
      <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>Earnings & Reports</h3>
      <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
        View your earnings summary and booking analytics.
      </p>

      {/* Period Selector */}
      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.5rem', flexWrap: 'wrap' }}>
        {[
          { value: 'week', label: 'This Week' },
          { value: 'month', label: 'This Month' },
          { value: 'year', label: 'This Year' },
          { value: 'all', label: 'All Time' }
        ].map(p => (
          <button key={p.value} onClick={() => setReportPeriod(p.value)}
            style={{
              padding: '0.5rem 1rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '500', cursor: 'pointer',
              border: reportPeriod === p.value ? '1px solid #10b981' : '1px solid #333',
              background: reportPeriod === p.value ? 'rgba(16,185,129,0.1)' : 'transparent',
              color: reportPeriod === p.value ? '#10b981' : '#9ca3af'
            }}>
            {p.label}
          </button>
        ))}
      </div>

      {reportLoading ? (
        <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>Loading reports...</p>
      ) : reportError ? (
        <p style={{ color: '#ef4444', textAlign: 'center', padding: '2rem 0' }}>{reportError}</p>
      ) : reportData ? (
        <>
          {/* Summary Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Total Earnings</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#10b981', margin: 0 }}>
                ${(reportData.totalEarnings || 0).toFixed(2)}
              </p>
            </div>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Bookings</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>
                {reportData.totalBookings || 0}
              </p>
            </div>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Avg per Booking</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>
                ${(reportData.totalBookings > 0 ? (reportData.totalEarnings / reportData.totalBookings) : 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Booking Breakdown */}
          {reportData.bookingsByStatus && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Booking Status</h4>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {Object.entries(reportData.bookingsByStatus).map(([status, count]) => (
                  <div key={status} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#9ca3af', textTransform: 'capitalize' }}>{status}</span>
                    <span style={{ fontSize: '0.85rem', color: '#f9fafb', fontWeight: '600' }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicle Earnings */}
          {reportData.vehicleEarnings && reportData.vehicleEarnings.length > 0 && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #333' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Earnings by Vehicle</h4>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {reportData.vehicleEarnings.map((v, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < reportData.vehicleEarnings.length - 1 ? '1px solid #333' : 'none' }}>
                    <div>
                      <p style={{ fontSize: '0.9rem', color: '#f9fafb', fontWeight: '500', margin: 0 }}>
                        {v.year} {v.make} {v.model}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.15rem 0 0' }}>
                        {v.bookingCount} booking{v.bookingCount !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: '600', color: '#10b981' }}>
                      ${(v.earnings || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <p style={{ color: '#6b7280', textAlign: 'center', padding: '2rem 0' }}>No report data available.</p>
      )}
    </div>
  );

  const taxNeedsAttention = isHost && taxInfo && !taxInfo.hasSubmitted;

  const tabs = [
    { id: 'profile', label: 'My Profile' },
    ...(isHost ? [
      { id: 'tax', label: 'Tax Settings', alert: taxNeedsAttention },
      { id: 'reports', label: 'Reports' }
    ] : [])
  ];

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container" style={{ maxWidth: '900px' }}>
          <h1 className="page-title">My Profile</h1>

          <div style={{ display: 'flex', gap: '2rem', alignItems: 'flex-start' }}>
            {/* Sidebar */}
            <div style={{
              width: '200px',
              flexShrink: 0,
              background: '#000',
              borderRadius: '1rem',
              border: '1px solid #333',
              overflow: 'hidden',
              position: 'sticky',
              top: '100px'
            }}>
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => handleTabChange(tab.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    width: '100%',
                    padding: '1rem 1.25rem',
                    border: 'none',
                    borderLeft: activeTab === tab.id ? '3px solid #10b981' : '3px solid transparent',
                    background: activeTab === tab.id ? 'rgba(16,185,129,0.1)' : 'transparent',
                    color: activeTab === tab.id ? '#10b981' : '#9ca3af',
                    fontSize: '0.9rem',
                    fontWeight: activeTab === tab.id ? '600' : '400',
                    textAlign: 'left',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                    borderBottom: '1px solid #222'
                  }}
                >
                  {tab.label}
                  {tab.alert && (
                    <span style={{
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      padding: '2px 6px',
                      borderRadius: '9999px',
                      lineHeight: '1.2',
                      animation: 'pulse 2s infinite',
                      whiteSpace: 'nowrap'
                    }}>
                      Action Needed
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Main Content */}
            <div style={{ flex: 1, minWidth: 0 }}>
              {activeTab === 'profile' && renderProfileTab()}
              {activeTab === 'tax' && isHost && renderTaxTab()}
              {activeTab === 'reports' && isHost && renderReportsTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverProfile;
