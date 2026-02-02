import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Driver.css';

const stripeKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
const isValidStripeKey = stripeKey && (stripeKey.startsWith('pk_live_') || stripeKey.startsWith('pk_test_'));
const stripePromise = isValidStripeKey ? loadStripe(stripeKey) : null;

// Stripe card form component (must be inside Elements provider)
const StripeCardForm = ({ clientSecret, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [nickname, setNickname] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setSaving(true);
    setError('');

    try {
      const cardElement = elements.getElement(CardElement);
      const { error: stripeError, setupIntent } = await stripe.confirmCardSetup(
        clientSecret,
        { payment_method: { card: cardElement } }
      );

      if (stripeError) {
        setError(stripeError.message);
        setSaving(false);
        return;
      }

      if (setupIntent && setupIntent.payment_method) {
        // Save to our backend
        const token = localStorage.getItem('token');
        const response = await axios.post(`${API_URL}/api/users/payment-methods`, {
          paymentMethodId: setupIntent.payment_method,
          nickname: nickname.trim()
        }, { headers: { Authorization: `Bearer ${token}` } });

        onSuccess(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save card');
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #333' }}>
      <h4 style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.95rem' }}>Add New Card</h4>

      <div className="form-group">
        <label className="form-label">Nickname (optional)</label>
        <input type="text" className="form-input" value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="e.g., Personal Visa, Work Card" />
      </div>

      <div className="form-group">
        <label className="form-label">Card Details</label>
        <div style={{
          padding: '0.75rem',
          background: '#1a1a1a',
          border: '1px solid #333',
          borderRadius: '6px'
        }}>
          <CardElement options={{
            style: {
              base: {
                fontSize: '16px',
                color: '#e5e7eb',
                '::placeholder': { color: '#6b7280' },
              },
              invalid: { color: '#ef4444' },
            },
          }} />
        </div>
      </div>

      {error && (
        <p style={{ fontSize: '0.85rem', color: '#ef4444', marginBottom: '0.75rem' }}>{error}</p>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem' }}>
        <button type="submit" className="btn btn-primary" disabled={!stripe || saving} style={{ flex: 1 }}>
          {saving ? 'Saving...' : 'Save Card'}
        </button>
        <button type="button" className="btn btn-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>

      <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.75rem', lineHeight: '1.4' }}>
        Your card is securely stored by Stripe. We never see or store your full card number.
      </p>
    </form>
  );
};

const DriverProfile = () => {
  const { user, setUser, logout } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);

  const canBeHost = user?.userType === 'host' || user?.userType === 'both';
  const activeMode = localStorage.getItem('activeMode') || 'driver';
  const isHost = canBeHost && activeMode === 'host';
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
  const [taxFormData, setTaxFormData] = useState({ accountType: 'individual', taxId: '', legalFirstName: '', legalLastName: '', legalAddress: { street: '', city: '', state: '', zipCode: '' }, businessName: '', dba: '', businessAddress: { street: '', city: '', state: '', zipCode: '' } });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMessage, setTaxMessage] = useState('');

  // Driver license state
  const [licenseData, setLicenseData] = useState(null);
  const [showLicenseForm, setShowLicenseForm] = useState(false);
  const [licenseFormData, setLicenseFormData] = useState({ licenseNumber: '', state: '', expirationDate: '', licenseImage: '', verificationSelfie: '' });
  const [licenseSaving, setLicenseSaving] = useState(false);
  const [licenseMessage, setLicenseMessage] = useState('');

  // Payment methods state
  const [paymentMethods, setPaymentMethods] = useState([]);
  const [showCardForm, setShowCardForm] = useState(false);
  const [setupIntentSecret, setSetupIntentSecret] = useState('');
  const [cardMessage, setCardMessage] = useState('');

  // Reports state (hosts only)
  const [reportLoading, setReportLoading] = useState(false);
  const [reportPeriod, setReportPeriod] = useState('month');
  const [reportData, setReportData] = useState(null);
  const [reportError, setReportError] = useState('');

  // Settings state
  const [settingsAction, setSettingsAction] = useState(null); // 'deactivate' | 'delete'
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState('');
  const [settingsError, setSettingsError] = useState('');

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
      fetchPaymentMethods();
      fetchLicenseData();
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
          legalFirstName: response.data.legalFirstName || '',
          legalLastName: response.data.legalLastName || '',
          legalAddress: response.data.legalAddress || { street: '', city: '', state: '', zipCode: '' },
          businessName: response.data.businessName || '',
          dba: response.data.dba || '',
          businessAddress: response.data.businessAddress || { street: '', city: '', state: '', zipCode: '' }
        });
      }
    } catch (error) {
      console.error('Error fetching tax info:', error);
      setTaxInfo({ accountType: 'individual', taxIdLast4: '', businessName: '', dba: '', businessAddress: {}, hasSubmitted: false });
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
      const payload = { ...taxFormData };
      // Don't send taxId if it's locked (backend will reject it)
      if (taxInfo?.taxIdLocked) {
        delete payload.taxId;
      }
      const response = await axios.put(`${API_URL}/api/users/host-tax-info`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      setTaxMessage('Tax information saved successfully');
      setShowTaxForm(false);
      setTaxFormData({ ...taxFormData, taxId: '' });
      // Re-fetch to ensure consistency with backend
      await fetchTaxInfo();
    } catch (error) {
      setTaxMessage(error.response?.data?.message || 'Failed to save tax information');
    } finally {
      setTaxSaving(false);
    }
  };

  // === Driver license functions ===
  const fetchLicenseData = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users/driver-license`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLicenseData(response.data);
      setLicenseFormData({
        licenseNumber: response.data.licenseNumber || '',
        state: response.data.state || '',
        expirationDate: response.data.expirationDate ? response.data.expirationDate.split('T')[0] : '',
        licenseImage: response.data.licenseImage || '',
        verificationSelfie: response.data.verificationSelfie || ''
      });
    } catch (error) {
      console.error('Error fetching license data:', error);
    }
  };

  const handleSaveLicense = async (e) => {
    e.preventDefault();
    if (!licenseFormData.verificationSelfie) {
      setLicenseMessage('Please upload a verification selfie before saving');
      return;
    }
    setLicenseSaving(true);
    setLicenseMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API_URL}/api/users/driver-license`, licenseFormData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setLicenseData(response.data);
      setShowLicenseForm(false);
      setLicenseMessage('License information updated successfully');
    } catch (error) {
      setLicenseMessage(error.response?.data?.message || 'Error updating license');
    } finally {
      setLicenseSaving(false);
    }
  };

  // === Payment methods functions ===
  const fetchPaymentMethods = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users/payment-methods`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPaymentMethods(response.data);
    } catch (error) {
      console.error('Error fetching payment methods:', error);
    }
  };

  const handleShowCardForm = async () => {
    setCardMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/users/payment-methods/setup-intent`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSetupIntentSecret(response.data.clientSecret);
      setShowCardForm(true);
    } catch (error) {
      setCardMessage(error.response?.data?.message || 'Failed to initialize card setup');
    }
  };

  const handleCardSaved = (updatedMethods) => {
    setPaymentMethods(updatedMethods);
    setShowCardForm(false);
    setSetupIntentSecret('');
    setCardMessage('Card added successfully');
  };

  const handleDeleteCard = async (cardId) => {
    if (!window.confirm('Remove this payment method?')) return;
    try {
      const token = localStorage.getItem('token');
      const response = await axios.delete(`${API_URL}/api/users/payment-methods/${cardId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPaymentMethods(response.data);
      setCardMessage('Card removed');
    } catch (error) {
      setCardMessage(error.response?.data?.message || 'Error removing card');
    }
  };

  const handleSetDefault = async (cardId) => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(`${API_URL}/api/users/payment-methods/${cardId}/default`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setPaymentMethods(response.data);
    } catch (error) {
      setCardMessage(error.response?.data?.message || 'Error setting default');
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
            {taxInfo.accountType === 'individual' && (taxInfo.legalFirstName || taxInfo.legalLastName) && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legal Name</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                  {taxInfo.legalFirstName} {taxInfo.legalLastName}
                </p>
              </div>
            )}
            {taxInfo.accountType === 'individual' && taxInfo.legalAddress && taxInfo.legalAddress.street && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legal Address</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                  {taxInfo.legalAddress.street}
                  {taxInfo.legalAddress.city && <><br />{taxInfo.legalAddress.city}{taxInfo.legalAddress.state ? `, ${taxInfo.legalAddress.state}` : ''} {taxInfo.legalAddress.zipCode}</>}
                </p>
              </div>
            )}
            {taxInfo.accountType === 'business' && taxInfo.businessName && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Name</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>{taxInfo.businessName}</p>
              </div>
            )}
            {taxInfo.accountType === 'business' && taxInfo.dba && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>DBA</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>{taxInfo.dba}</p>
              </div>
            )}
            {taxInfo.accountType === 'business' && taxInfo.businessAddress && taxInfo.businessAddress.street && (
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Address</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                  {taxInfo.businessAddress.street}
                  {taxInfo.businessAddress.city && <><br />{taxInfo.businessAddress.city}{taxInfo.businessAddress.state ? `, ${taxInfo.businessAddress.state}` : ''} {taxInfo.businessAddress.zipCode}</>}
                </p>
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
                  onChange={() => setTaxFormData({ accountType: 'individual', taxId: '', businessName: '', dba: '', businessAddress: { street: '', city: '', state: '', zipCode: '' } })}
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
                  onChange={() => setTaxFormData({ accountType: 'business', taxId: '', businessName: '', dba: '', businessAddress: { street: '', city: '', state: '', zipCode: '' } })}
                  style={{ accentColor: '#10b981' }} />
                <div>
                  <span style={{ fontWeight: '600', color: '#e5e7eb', fontSize: '0.9rem' }}>Business / LLC</span>
                  <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Company EIN</p>
                </div>
              </label>
            </div>
          </div>

          {taxFormData.accountType === 'business' && (
            <>
              <div className="form-group">
                <label className="form-label">Business Name</label>
                <input type="text" className="form-input" value={taxFormData.businessName}
                  onChange={(e) => setTaxFormData({ ...taxFormData, businessName: e.target.value })}
                  placeholder="e.g., United Fleet Services LLC" required />
              </div>

              <div className="form-group">
                <label className="form-label">DBA (Doing Business As)</label>
                <input type="text" className="form-input" value={taxFormData.dba}
                  onChange={(e) => setTaxFormData({ ...taxFormData, dba: e.target.value })}
                  placeholder="e.g., UFS Car Rentals" />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Optional. Enter if your business operates under a different name.
                </p>
              </div>

              <div style={{ marginBottom: '1.25rem' }}>
                <label style={{ display: 'block', fontWeight: '600', fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Business Address *</label>
                <div className="form-group">
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>Street Address</label>
                  <input type="text" className="form-input" value={taxFormData.businessAddress.street}
                    onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, street: e.target.value } })}
                    placeholder="123 Main St, Suite 100" required />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>City</label>
                    <input type="text" className="form-input" value={taxFormData.businessAddress.city}
                      onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, city: e.target.value } })}
                      placeholder="City" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.8rem' }}>State</label>
                    <input type="text" className="form-input" value={taxFormData.businessAddress.state}
                      onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, state: e.target.value } })}
                      placeholder="State" maxLength={2} style={{ textTransform: 'uppercase' }} required />
                  </div>
                </div>
                <div className="form-group" style={{ maxWidth: '50%' }}>
                  <label className="form-label" style={{ fontSize: '0.8rem' }}>ZIP Code</label>
                  <input type="text" className="form-input" value={taxFormData.businessAddress.zipCode}
                    onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, zipCode: e.target.value } })}
                    placeholder="ZIP Code" maxLength={10} required />
                </div>
              </div>
            </>
          )}

          {/* Legal name and address for individuals */}
          {taxFormData.accountType === 'individual' && (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Legal First Name</label>
                  <input type="text" className="form-input" value={taxFormData.legalFirstName}
                    onChange={(e) => setTaxFormData({ ...taxFormData, legalFirstName: e.target.value })}
                    placeholder="First name as on tax return" required />
                </div>
                <div className="form-group">
                  <label className="form-label">Legal Last Name</label>
                  <input type="text" className="form-input" value={taxFormData.legalLastName}
                    onChange={(e) => setTaxFormData({ ...taxFormData, legalLastName: e.target.value })}
                    placeholder="Last name as on tax return" required />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Legal Address</label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input type="text" className="form-input" value={taxFormData.legalAddress.street}
                    onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, street: e.target.value } })}
                    placeholder="Street address" required />
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem' }}>
                    <input type="text" className="form-input" value={taxFormData.legalAddress.city}
                      onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, city: e.target.value } })}
                      placeholder="City" required />
                    <input type="text" className="form-input" value={taxFormData.legalAddress.state}
                      onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, state: e.target.value.toUpperCase() } })}
                      placeholder="State" maxLength={2} required />
                  </div>
                  <input type="text" className="form-input" value={taxFormData.legalAddress.zipCode}
                    onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, zipCode: e.target.value } })}
                    placeholder="ZIP Code" maxLength={10} required />
                </div>
              </div>
            </>
          )}

          <div className="form-group">
            <label className="form-label">
              {taxFormData.accountType === 'individual' ? 'Social Security Number (SSN)' : 'Employer ID Number (EIN)'}
            </label>
            {taxInfo?.taxIdLocked ? (
              <>
                <input type="text" className="form-input"
                  value={`****${taxInfo.taxIdLast4}`}
                  disabled
                  style={{ backgroundColor: '#1a1a2e', color: '#6b7280', cursor: 'not-allowed' }} />
                <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                  Your tax ID has been locked for security. Contact support if you need to change it.
                </p>
              </>
            ) : (
              <>
                <input type="text" className="form-input" value={taxFormData.taxId}
                  onChange={handleTaxIdInput}
                  placeholder={taxFormData.accountType === 'individual' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                  maxLength={taxFormData.accountType === 'individual' ? 11 : 10} required />
                <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                  Stored securely. Only the last 4 digits will be visible.
                </p>
              </>
            )}
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

  const renderReportsTab = () => {
    const summary = reportData?.summary || {};
    const vehicleStats = reportData?.vehicleStats || [];
    const recentBookings = reportData?.recentBookings || [];

    const totalEarnings = summary.totalRevenue || 0;
    const totalBookings = summary.totalBookings || 0;
    const confirmedBookings = summary.confirmedBookings || 0;
    const cancelledBookings = summary.cancelledBookings || 0;
    const pendingRevenue = summary.pendingRevenue || 0;
    const avgPerBooking = summary.averageBookingValue || 0;
    const totalDaysBooked = summary.totalDaysBooked || 0;

    const statusColors = {
      confirmed: '#10b981',
      active: '#3b82f6',
      completed: '#6b7280',
      cancelled: '#ef4444',
      pending: '#f59e0b'
    };

    return (
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
                ${totalEarnings.toFixed(2)}
              </p>
            </div>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Bookings</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>
                {totalBookings}
              </p>
            </div>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Avg per Booking</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>
                ${avgPerBooking.toFixed(2)}
              </p>
            </div>
          </div>

          {/* Additional Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #333', textAlign: 'center' }}>
              <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Days Booked</p>
              <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>
                {totalDaysBooked}
              </p>
            </div>
            {pendingRevenue > 0 && (
              <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #333', textAlign: 'center' }}>
                <p style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '0.25rem' }}>Pending Revenue</p>
                <p style={{ fontSize: '1.5rem', fontWeight: '700', color: '#f59e0b', margin: 0 }}>
                  ${pendingRevenue.toFixed(2)}
                </p>
              </div>
            )}
          </div>

          {/* Booking Status Breakdown */}
          {totalBookings > 0 && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Booking Status</h4>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {[
                  { label: 'Confirmed / Active', count: confirmedBookings, color: statusColors.confirmed },
                  { label: 'Cancelled', count: cancelledBookings, color: statusColors.cancelled }
                ].filter(s => s.count > 0).map(s => (
                  <div key={s.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', color: '#9ca3af' }}>{s.label}</span>
                    <span style={{ fontSize: '0.85rem', color: s.color, fontWeight: '600' }}>{s.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Vehicle Earnings */}
          {vehicleStats.length > 0 && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Earnings by Vehicle</h4>
              <div style={{ display: 'grid', gap: '0.75rem' }}>
                {vehicleStats.map((v, i) => (
                  <div key={v.vehicleId || i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: i < vehicleStats.length - 1 ? '1px solid #333' : 'none' }}>
                    <div>
                      <p style={{ fontSize: '0.9rem', color: '#f9fafb', fontWeight: '500', margin: 0 }}>
                        {v.vehicleName}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.15rem 0 0' }}>
                        {v.confirmedBookings} booking{v.confirmedBookings !== 1 ? 's' : ''} · {v.totalDays || 0} days
                      </p>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: '600', color: '#10b981' }}>
                      ${(v.totalRevenue || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Bookings */}
          {recentBookings.length > 0 && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1.25rem', border: '1px solid #333' }}>
              <h4 style={{ fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Recent Bookings</h4>
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                {recentBookings.slice(0, 5).map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.5rem 0', borderBottom: '1px solid #222' }}>
                    <div>
                      <p style={{ fontSize: '0.85rem', color: '#f9fafb', margin: 0 }}>{b.vehicleName}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.15rem 0 0' }}>
                        {b.driverName} · {b.totalDays} day{b.totalDays !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <p style={{ fontSize: '0.9rem', fontWeight: '600', color: b.paymentStatus === 'paid' ? '#10b981' : '#f59e0b', margin: 0 }}>
                        ${Number(b.totalPrice || 0).toFixed(2)}
                      </p>
                      <span style={{
                        fontSize: '0.65rem', padding: '0.15rem 0.4rem', borderRadius: '4px', fontWeight: '600', textTransform: 'uppercase',
                        background: statusColors[b.status] || '#6b7280', color: '#fff'
                      }}>
                        {b.status}
                      </span>
                    </div>
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
  };

  const renderLicenseTab = () => (
    <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
      <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>Driver's License</h3>
      <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
        View and update your driver's license information.
      </p>

      {licenseMessage && (
        <p style={{ fontSize: '0.85rem', color: licenseMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '1rem' }}>{licenseMessage}</p>
      )}

      {/* Current license info display */}
      {licenseData && licenseData.licenseNumber && !showLicenseForm && (
        <div style={{
          padding: '1.25rem', background: '#111', borderRadius: '0.75rem',
          border: '1px solid #333', marginBottom: '1.25rem'
        }}>
          <div style={{ display: 'grid', gap: '0.75rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>License Number</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>{licenseData.licenseNumber}</p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>State</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>{licenseData.state}</p>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Expiration Date</span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                  {licenseData.expirationDate ? new Date(licenseData.expirationDate).toLocaleDateString() : 'Not set'}
                </p>
              </div>
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Verification</span>
                <p style={{ fontSize: '0.95rem', fontWeight: '500', margin: '0.15rem 0 0', color: licenseData.faceVerified ? '#10b981' : '#f59e0b' }}>
                  {licenseData.faceVerified ? 'Verified' : 'Pending'}
                </p>
              </div>
            </div>
            {(licenseData.licenseImage || licenseData.verificationSelfie) && (
              <div style={{ display: 'grid', gridTemplateColumns: licenseData.licenseImage && licenseData.verificationSelfie ? '1fr 1fr' : '1fr', gap: '1rem' }}>
                {licenseData.licenseImage && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>License Photo</span>
                    <div style={{ marginTop: '0.5rem' }}>
                      <img src={getImageUrl(licenseData.licenseImage)} alt="Driver's License"
                        style={{ maxWidth: '200px', borderRadius: '8px', border: '1px solid #333' }}
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  </div>
                )}
                {licenseData.verificationSelfie && (
                  <div>
                    <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Verification Selfie</span>
                    <div style={{ marginTop: '0.5rem' }}>
                      <img src={getImageUrl(licenseData.verificationSelfie)} alt="Verification Selfie"
                        style={{ maxWidth: '200px', borderRadius: '8px', border: '1px solid #333' }}
                        onError={(e) => { e.target.style.display = 'none'; }} />
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!licenseData?.licenseNumber && !showLicenseForm && (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#111', borderRadius: '0.75rem', border: '1px solid #333', marginBottom: '1.25rem' }}>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: '0 0 0.25rem' }}>No license information on file</p>
          <p style={{ fontSize: '0.8rem', color: '#4b5563', margin: 0 }}>Add your driver's license details</p>
        </div>
      )}

      {!showLicenseForm && (
        <button onClick={() => { setShowLicenseForm(true); setLicenseMessage(''); }}
          className={`btn ${licenseData?.licenseNumber ? 'btn-secondary' : 'btn-primary'}`} style={{ width: '100%' }}>
          {licenseData?.licenseNumber ? 'Update License Information' : 'Add License Information'}
        </button>
      )}

      {showLicenseForm && (
        <form onSubmit={handleSaveLicense} style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #333' }}>
          <h4 style={{ color: '#d1d5db', marginBottom: '1rem', fontSize: '0.95rem' }}>
            {licenseData?.licenseNumber ? 'Update License' : 'Add License'}
          </h4>

          <div className="form-group">
            <label className="form-label">License Number</label>
            <input type="text" className="form-input" value={licenseFormData.licenseNumber}
              onChange={(e) => setLicenseFormData({ ...licenseFormData, licenseNumber: e.target.value })}
              placeholder="Enter license number" required />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div className="form-group">
              <label className="form-label">State</label>
              <input type="text" className="form-input" value={licenseFormData.state}
                onChange={(e) => setLicenseFormData({ ...licenseFormData, state: e.target.value.toUpperCase() })}
                placeholder="e.g., CA" maxLength={2} required style={{ textTransform: 'uppercase' }} />
            </div>
            <div className="form-group">
              <label className="form-label">Expiration Date</label>
              <input type="date" className="form-input" value={licenseFormData.expirationDate}
                onChange={(e) => setLicenseFormData({ ...licenseFormData, expirationDate: e.target.value })}
                required />
            </div>
          </div>

          <ImageUpload
            label="Driver's License Photo"
            value={licenseFormData.licenseImage}
            onChange={(url) => setLicenseFormData({ ...licenseFormData, licenseImage: url })}
          />

          {/* Selfie Verification Section */}
          <div style={{
            marginTop: '1.25rem',
            padding: '1.25rem',
            background: '#0a0a0a',
            borderRadius: '0.75rem',
            border: '1px solid #333'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: licenseFormData.verificationSelfie ? '#10b981' : '#f59e0b',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.8rem', fontWeight: '700', color: '#000', flexShrink: 0
              }}>
                {licenseFormData.verificationSelfie ? '\u2713' : '!'}
              </div>
              <div>
                <h4 style={{ color: '#d1d5db', margin: 0, fontSize: '0.95rem' }}>Selfie Verification</h4>
                <p style={{ color: '#6b7280', margin: '0.15rem 0 0', fontSize: '0.75rem' }}>
                  Required: Take a selfie to verify your identity matches your license
                </p>
              </div>
            </div>

            <ImageUpload
              label="Verification Selfie"
              value={licenseFormData.verificationSelfie}
              onChange={(url) => setLicenseFormData({ ...licenseFormData, verificationSelfie: url })}
            />

            <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.5rem', lineHeight: '1.4' }}>
              Your selfie will be compared to your driver's license photo for identity verification.
              Please ensure your face is clearly visible and well-lit.
            </p>
          </div>

          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
            <button type="submit" className="btn btn-primary" disabled={licenseSaving} style={{ flex: 1 }}>
              {licenseSaving ? 'Saving...' : 'Save License Info'}
            </button>
            <button type="button" className="btn btn-secondary" onClick={() => { setShowLicenseForm(false); setLicenseMessage(''); }}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );

  const renderPaymentTab = () => (
    <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
      <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>Payment Methods</h3>
      <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
        Manage your saved cards for faster checkout.
      </p>

      {cardMessage && (
        <p style={{ fontSize: '0.85rem', color: cardMessage.includes('success') || cardMessage.includes('removed') ? '#10b981' : '#ef4444', marginBottom: '1rem' }}>{cardMessage}</p>
      )}

      {/* Saved cards */}
      {paymentMethods.length > 0 && (
        <div style={{ display: 'grid', gap: '0.75rem', marginBottom: '1.5rem' }}>
          {paymentMethods.map(card => (
            <div key={card._id} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem', background: '#111', borderRadius: '0.75rem',
              border: card.isDefault ? '1px solid #10b981' : '1px solid #333'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <div style={{
                  width: '48px', height: '32px', borderRadius: '4px', background: '#222',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '0.65rem', fontWeight: '700', color: '#9ca3af', border: '1px solid #333'
                }}>
                  {card.cardBrand === 'Visa' ? 'VISA' : card.cardBrand === 'Mastercard' ? 'MC' : card.cardBrand === 'Amex' ? 'AMEX' : card.cardBrand === 'Discover' ? 'DISC' : 'CARD'}
                </div>
                <div>
                  <p style={{ fontSize: '0.9rem', color: '#f9fafb', fontWeight: '500', margin: 0 }}>
                    {card.nickname || `${card.cardBrand} ending in ${card.last4}`}
                  </p>
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.15rem 0 0' }}>
                    **** {card.last4} &middot; Expires {String(card.expMonth).padStart(2, '0')}/{card.expYear}
                    {card.isDefault && <span style={{ color: '#10b981', marginLeft: '0.5rem' }}>Default</span>}
                  </p>
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                {!card.isDefault && (
                  <button onClick={() => handleSetDefault(card._id)}
                    style={{ background: 'transparent', border: '1px solid #333', color: '#9ca3af', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                    Set Default
                  </button>
                )}
                <button onClick={() => handleDeleteCard(card._id)}
                  style={{ background: 'transparent', border: '1px solid #333', color: '#ef4444', padding: '0.35rem 0.75rem', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}>
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {paymentMethods.length === 0 && !showCardForm && (
        <div style={{ padding: '2rem', textAlign: 'center', background: '#111', borderRadius: '0.75rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
          <p style={{ fontSize: '0.9rem', color: '#6b7280', margin: '0 0 0.25rem' }}>No payment methods saved</p>
          <p style={{ fontSize: '0.8rem', color: '#4b5563', margin: 0 }}>Add a card for faster booking checkout</p>
        </div>
      )}

      {!showCardForm && (
        <button onClick={handleShowCardForm}
          className="btn btn-primary" style={{ width: '100%' }}>
          Add Payment Method
        </button>
      )}

      {showCardForm && setupIntentSecret && isValidStripeKey && (
        <Elements stripe={stripePromise} options={{
          clientSecret: setupIntentSecret,
          appearance: { theme: 'night', variables: { colorPrimary: '#10b981' } }
        }}>
          <StripeCardForm
            clientSecret={setupIntentSecret}
            onSuccess={handleCardSaved}
            onCancel={() => { setShowCardForm(false); setSetupIntentSecret(''); setCardMessage(''); }}
          />
        </Elements>
      )}

      {showCardForm && !isValidStripeKey && (
        <div style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #ef4444' }}>
          <p style={{ color: '#ef4444', margin: 0 }}>Payment system configuration error. Stripe key is missing or invalid.</p>
        </div>
      )}

      <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#111', borderRadius: '0.5rem', border: '1px solid #333' }}>
        <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
          Your cards are securely stored by Stripe and can be used for faster checkout when booking vehicles.
        </p>
      </div>
    </div>
  );

  // ==========================================
  // Settings Tab
  // ==========================================

  const handleDeactivateAccount = async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/users/account/deactivate`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setSettingsMessage('Account deactivated. You will be logged out.');
      setTimeout(() => {
        logout();
        navigate('/');
      }, 2000);
    } catch (err) {
      setSettingsError(err.response?.data?.message || 'Failed to deactivate account.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      setSettingsError('Please type DELETE to confirm.');
      return;
    }
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/users/account/delete`, {
        headers: { Authorization: `Bearer ${token}` },
        data: { confirmation: 'DELETE' }
      });
      setSettingsMessage('Account permanently deleted. Redirecting...');
      setTimeout(() => {
        logout();
        navigate('/');
      }, 2000);
    } catch (err) {
      setSettingsError(err.response?.data?.message || 'Failed to delete account.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const renderSettingsTab = () => (
    <div>
      <div style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
        <h2 style={{ color: '#fff', marginBottom: '0.5rem', fontSize: '1.25rem' }}>Account Settings</h2>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', margin: 0 }}>
          Manage your account status and preferences.
        </p>
      </div>

      {settingsMessage && (
        <div style={{
          background: 'rgba(16, 185, 129, 0.1)',
          border: '1px solid #10b981',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1rem',
          color: '#10b981'
        }}>
          {settingsMessage}
        </div>
      )}

      {settingsError && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid #ef4444',
          borderRadius: '0.5rem',
          padding: '1rem',
          marginBottom: '1rem',
          color: '#ef4444'
        }}>
          {settingsError}
        </div>
      )}

      {/* Deactivate Account */}
      <div style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
        <h3 style={{ color: '#f59e0b', marginBottom: '0.5rem' }}>Deactivate Account</h3>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: '1.5' }}>
          Temporarily disable your account. Your profile, listings, and booking history will be preserved.
          You can reactivate your account at any time by logging in again.
        </p>

        {settingsAction === 'deactivate' ? (
          <div style={{
            background: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid #f59e0b',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <p style={{ color: '#fbbf24', fontWeight: '600', marginBottom: '0.75rem' }}>
              Are you sure you want to deactivate your account?
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Your vehicle listings will become hidden from the marketplace.
              You can reactivate anytime by logging back in.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleDeactivateAccount}
                disabled={settingsLoading}
                style={{
                  background: '#f59e0b',
                  color: '#000',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  fontWeight: '600',
                  cursor: settingsLoading ? 'not-allowed' : 'pointer',
                  opacity: settingsLoading ? 0.6 : 1
                }}
              >
                {settingsLoading ? 'Processing...' : 'Yes, Deactivate'}
              </button>
              <button
                onClick={() => { setSettingsAction(null); setSettingsError(''); }}
                style={{
                  background: 'transparent',
                  color: '#9ca3af',
                  border: '1px solid #6b7280',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setSettingsAction('deactivate'); setSettingsError(''); setSettingsMessage(''); }}
            style={{
              background: 'transparent',
              color: '#f59e0b',
              border: '1px solid #f59e0b',
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Deactivate Account
          </button>
        )}
      </div>

      {/* Delete Account */}
      <div style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #dc2626' }}>
        <h3 style={{ color: '#ef4444', marginBottom: '0.5rem' }}>Delete Account</h3>
        <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: '1.5' }}>
          Permanently delete your account and all associated data. This action cannot be undone.
          Your vehicle listings will be removed and booking history will be lost.
        </p>

        {settingsAction === 'delete' ? (
          <div style={{
            background: 'rgba(239, 68, 68, 0.1)',
            border: '1px solid #ef4444',
            borderRadius: '0.5rem',
            padding: '1rem'
          }}>
            <p style={{ color: '#ef4444', fontWeight: '600', marginBottom: '0.75rem' }}>
              This action is permanent and cannot be reversed.
            </p>
            <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
              Type <strong style={{ color: '#ef4444' }}>DELETE</strong> below to confirm you want to permanently delete your account.
            </p>
            <input
              type="text"
              value={deleteConfirmation}
              onChange={(e) => setDeleteConfirmation(e.target.value)}
              placeholder='Type "DELETE" to confirm'
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                borderRadius: '0.375rem',
                border: '1px solid #ef4444',
                background: '#1a1a1a',
                color: '#fff',
                fontSize: '0.875rem',
                marginBottom: '1rem',
                boxSizing: 'border-box'
              }}
            />
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button
                onClick={handleDeleteAccount}
                disabled={settingsLoading || deleteConfirmation !== 'DELETE'}
                style={{
                  background: deleteConfirmation === 'DELETE' ? '#ef4444' : '#555',
                  color: '#fff',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  fontWeight: '600',
                  cursor: (settingsLoading || deleteConfirmation !== 'DELETE') ? 'not-allowed' : 'pointer',
                  opacity: (settingsLoading || deleteConfirmation !== 'DELETE') ? 0.6 : 1
                }}
              >
                {settingsLoading ? 'Deleting...' : 'Permanently Delete Account'}
              </button>
              <button
                onClick={() => { setSettingsAction(null); setDeleteConfirmation(''); setSettingsError(''); }}
                style={{
                  background: 'transparent',
                  color: '#9ca3af',
                  border: '1px solid #6b7280',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => { setSettingsAction('delete'); setSettingsError(''); setSettingsMessage(''); }}
            style={{
              background: 'transparent',
              color: '#ef4444',
              border: '1px solid #ef4444',
              padding: '0.5rem 1.25rem',
              borderRadius: '0.375rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            Delete Account
          </button>
        )}
      </div>
    </div>
  );

  const taxNeedsAttention = isHost && taxInfo && !taxInfo.hasSubmitted;

  const isDriver = user?.userType === 'driver' || user?.userType === 'both';

  const tabs = [
    { id: 'profile', label: 'My Profile' },
    ...(isDriver && !isHost ? [{ id: 'license', label: "Driver's License" }] : []),
    { id: 'payment', label: 'Payment Methods' },
    ...(isHost ? [
      { id: 'tax', label: 'Tax Settings', alert: taxNeedsAttention },
      { id: 'reports', label: 'Reports' }
    ] : []),
    { id: 'settings', label: 'Settings' }
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
              {activeTab === 'license' && isDriver && !isHost && renderLicenseTab()}
              {activeTab === 'payment' && renderPaymentTab()}
              {activeTab === 'tax' && isHost && renderTaxTab()}
              {activeTab === 'reports' && isHost && renderReportsTab()}
              {activeTab === 'settings' && renderSettingsTab()}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DriverProfile;
