import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, CardElement, useStripe, useElements } from '@stripe/react-stripe-js';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import { PayoutsContent } from '../Host/Payouts';
import '../Host/Payouts.css';
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
  const canBeHost = user?.userType === 'host' || user?.userType === 'both';
  const activeMode = localStorage.getItem('activeMode') || 'driver';
  const isHost = canBeHost && activeMode === 'host';
  const defaultTab = searchParams.get('tab') || 'profile';
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [payoutsOpened, setPayoutsOpened] = useState(defaultTab === 'payouts');

  const [loading, setLoading] = useState(false);
  const [profileData, setProfileData] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    profileImage: '',
    dateOfBirth: '',
    address: {
      street: '',
      apt: '',
      city: '',
      state: '',
      zipCode: ''
    }
  });
  const [message, setMessage] = useState({ type: '', text: '' });

  // Profile photo state
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const pollRef = useRef(null);
  const [showCamera, setShowCamera] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const [phoneSession, setPhoneSession] = useState(null);
  const [phoneQrUrl, setPhoneQrUrl] = useState('');

  // Email change state
  const [emailEditing, setEmailEditing] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [emailStep, setEmailStep] = useState('edit');
  const [emailLoading, setEmailLoading] = useState(false);

  // Tax info state (hosts only)
  const [taxInfo, setTaxInfo] = useState(null);
  const [taxLoading, setTaxLoading] = useState(true);
  const [taxLoadError, setTaxLoadError] = useState('');
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxFormData, setTaxFormData] = useState({ accountType: 'individual', taxId: '', legalFirstName: '', legalLastName: '', legalAddress: { street: '', city: '', state: '', zipCode: '' }, businessName: '', dba: '', businessAddress: { street: '', city: '', state: '', zipCode: '' } });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMessage, setTaxMessage] = useState('');
  const [displayPreference, setDisplayPreference] = useState('personal');
  const [displayPrefSaving, setDisplayPrefSaving] = useState(false);

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

  // Integrations state
  const [tollspotActive, setTollspotActive] = useState(false);
  const [tollspotPending, setTollspotPending] = useState(false);
  const [tollspotConnectedAt, setTollspotConnectedAt] = useState(null);
  const [tollspotLoading, setTollspotLoading] = useState(false);

  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        email: user.email || '',
        profileImage: user.profileImage || '',
        dateOfBirth: user.dateOfBirth ? new Date(user.dateOfBirth).toISOString().split('T')[0] : '',
        address: {
          street: user.address?.street || '',
          apt: user.address?.apt || '',
          city: user.address?.city || '',
          state: user.address?.state || '',
          zipCode: user.address?.zipCode || ''
        }
      });
      if (isHost) {
        fetchTaxInfo();
        fetchIntegrationsStatus();
      }
      fetchPaymentMethods();
      fetchLicenseData();
    }
  }, [user]);

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

  // Fetch TollSpot status on initial load (for sidebar badge)
  const fetchIntegrationsStatus = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/users/integrations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTollspotActive(res.data.tollspot?.active || false);
      setTollspotConnectedAt(res.data.tollspot?.connectedAt || null);
    } catch (err) {
      console.error('❌ Error fetching integrations:', err);
    }
  };

  // Refresh TollSpot status when integrations tab is opened
  useEffect(() => {
    if (activeTab === 'integrations' && isHost) {
      fetchIntegrationsStatus();
    }
  }, [activeTab, isHost]);

  const handleTollspotToggle = async () => {
    if (tollspotActive) {
      // Deactivating — save to backend
      setTollspotLoading(true);
      try {
        const token = localStorage.getItem('token');
        const res = await axios.put(`${API_URL}/api/users/integrations/tollspot`, {
          active: false
        }, { headers: { Authorization: `Bearer ${token}` } });
        setTollspotActive(res.data.active);
        setTollspotConnectedAt(res.data.connectedAt);
        setTollspotPending(false);
      } catch (err) {
        console.error('❌ Error toggling TollSpot:', err);
      } finally {
        setTollspotLoading(false);
      }
    } else if (tollspotPending) {
      // Already pending — toggle off the pending state
      setTollspotPending(false);
    } else {
      // Activating — open TollSpot but don't mark as connected yet
      setTollspotPending(true);
      if (user?._id) {
        window.open(
          `http://app3052.tollspot.app/?partnerId=public_5dee9706-bd2a-4ff8-8181-8973761bfb06&hostId=${user._id}`,
          '_blank'
        );
      }
    }
  };

  const handleTollspotConfirm = async () => {
    setTollspotLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await axios.put(`${API_URL}/api/users/integrations/tollspot`, {
        active: true
      }, { headers: { Authorization: `Bearer ${token}` } });
      setTollspotActive(res.data.active);
      setTollspotConnectedAt(res.data.connectedAt);
      setTollspotPending(false);
    } catch (err) {
      console.error('❌ Error confirming TollSpot:', err);
    } finally {
      setTollspotLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    setSearchParams({ tab });
    if (tab === 'payouts') setPayoutsOpened(true);
  };

  // === Profile functions ===
  const handleProfileImageChange = async (base64Image) => {
    if (!base64Image) return;
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      await updateProfileImage(base64Image);
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

  // Camera functions for profile photo
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setShowCamera(false);
  }, []);

  useEffect(() => {
    return () => {
      if (streamRef.current) streamRef.current.getTracks().forEach(track => track.stop());
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startCamera = async (deviceId = null) => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      // Get list of available cameras
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = devices.filter(d => d.kind === 'videoinput');
      setCameras(videoDevices);

      // Build video constraints
      let videoConstraints = { width: { ideal: 1280 }, height: { ideal: 720 } };

      if (deviceId) {
        // Use specific device
        videoConstraints.deviceId = { exact: deviceId };
      } else if (videoDevices.length > 0) {
        // Try front camera first for profile photos (facingMode: user)
        videoConstraints.facingMode = { ideal: 'user' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      streamRef.current = stream;
      setShowCamera(true);

      // Find the index of the current camera
      const currentTrack = stream.getVideoTracks()[0];
      const currentDeviceId = currentTrack?.getSettings()?.deviceId;
      const idx = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
      if (idx !== -1) setCurrentCameraIndex(idx);

      setTimeout(() => {
        if (videoRef.current) videoRef.current.srcObject = stream;
      }, 50);
    } catch (err) {
      console.error('Camera access error:', err);
      setMessage({ type: 'error', text: 'Could not access camera. Try uploading a photo instead.' });
    }
  };

  // Switch between available cameras
  const switchCamera = () => {
    if (cameras.length < 2) return; // Need at least 2 cameras to switch
    const nextIndex = (currentCameraIndex + 1) % cameras.length;
    setCurrentCameraIndex(nextIndex);
    startCamera(cameras[nextIndex].deviceId);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const MAX_WIDTH = 1200;
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(video, 0, 0, width, height);
    stopCamera();
    const base64 = canvas.toDataURL('image/jpeg', 0.7);
    handleProfileImageChange(base64);
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      setMessage({ type: 'error', text: 'Please select an image file' });
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setMessage({ type: 'error', text: 'Image must be less than 10MB' });
      return;
    }
    // Compress the image
    const reader = new FileReader();
    reader.onload = (ev) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let w = img.width, h = img.height;
        if (w > 1200) { h = Math.round((h * 1200) / w); w = 1200; }
        if (h > 900) { w = Math.round((w * 900) / h); h = 900; }
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        handleProfileImageChange(base64);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const startPhoneUpload = async () => {
    try {
      const res = await axios.post(`${API_URL}/api/upload/create-session`, { photoSlot: 'Profile Photo' });
      const { sessionId, qrUrl } = res.data;
      setPhoneSession(sessionId);
      setPhoneQrUrl(qrUrl);
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await axios.get(`${API_URL}/api/upload/session/${sessionId}`);
          if (pollRes.data.images && pollRes.data.images.length > 0) {
            const latestImage = pollRes.data.images[pollRes.data.images.length - 1];
            handleProfileImageChange(latestImage);
            closePhoneUpload();
          }
        } catch (err) {
          if (err.response?.status === 404) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 2000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to create upload session. Please try again.' });
    }
  };

  const closePhoneUpload = () => {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (phoneSession) axios.delete(`${API_URL}/api/upload/session/${phoneSession}`).catch(() => {});
    setPhoneSession(null);
    setPhoneQrUrl('');
  };

  const handleAddressSelect = useCallback((addressData) => {
    setProfileData(prev => ({
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

  const handleProfileUpdate = async (e) => {
    e.preventDefault();
    setLoading(true);
    setMessage({ type: '', text: '' });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API_URL}/api/users/profile`, {
        firstName: profileData.firstName,
        lastName: profileData.lastName,
        phone: profileData.phone,
        dateOfBirth: profileData.dateOfBirth || undefined,
        address: profileData.address
      }, { headers: { Authorization: `Bearer ${token}` } });
      setUser(response.data);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setMessage({ type: 'error', text: error.response?.data?.message || 'Failed to update profile' });
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
    setTaxLoading(true);
    setTaxLoadError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users/host-tax-info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = response.data;
      setTaxInfo(data);
      setDisplayPreference(data.displayPreference || 'personal');
      // Pre-fill form with server data (SSN is never returned, always empty)
      setTaxFormData({
        accountType: data.accountType || 'individual',
        taxId: '',
        legalFirstName: data.legalFirstName || '',
        legalLastName: data.legalLastName || '',
        legalAddress: data.legalAddress || { street: '', city: '', state: '', zipCode: '' },
        businessName: data.businessName || '',
        dba: data.dba || '',
        businessAddress: data.businessAddress || { street: '', city: '', state: '', zipCode: '' }
      });
    } catch (error) {
      console.error('❌ Error fetching tax info:', error);
      setTaxLoadError('Failed to load tax information. Please refresh the page.');
      setTaxInfo(null);
    } finally {
      setTaxLoading(false);
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
      const payload = {
        accountType: taxFormData.accountType,
        legalFirstName: taxFormData.legalFirstName,
        legalLastName: taxFormData.legalLastName,
        legalAddress: taxFormData.legalAddress,
        businessName: taxFormData.businessName,
        dba: taxFormData.dba,
        businessAddress: taxFormData.businessAddress
      };
      // Only include taxId if SSN is NOT locked (first-time submission)
      if (!taxInfo?.taxIdLocked) {
        payload.taxId = taxFormData.taxId;
      }
      const response = await axios.put(`${API_URL}/api/users/host-tax-info`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      setTaxMessage('Tax information saved successfully');
      setShowTaxForm(false);
      setTaxFormData(prev => ({ ...prev, taxId: '' }));
    } catch (error) {
      setTaxMessage(error.response?.data?.message || 'Failed to save tax information');
    } finally {
      setTaxSaving(false);
    }
  };

  const handleDisplayPreferenceChange = async (pref) => {
    setDisplayPrefSaving(true);
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/users/host-display-preference`, { displayPreference: pref }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setDisplayPreference(pref);
      setTaxMessage('Display preference updated successfully');
    } catch (error) {
      setTaxMessage(error.response?.data?.message || 'Failed to update display preference');
    } finally {
      setDisplayPrefSaving(false);
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
        <h3 style={{ color: '#fff', marginBottom: '1.5rem', fontWeight: '600' }}>Profile Photo</h3>

        {/* Hidden elements */}
        <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileSelect} style={{ display: 'none' }} />
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Camera viewfinder */}
        {showCamera && (
          <div style={{ position: 'relative', marginBottom: '1rem', borderRadius: '0.75rem', overflow: 'hidden' }}>
            <video ref={videoRef} autoPlay playsInline muted
              style={{ width: '100%', maxHeight: '400px', objectFit: 'cover', display: 'block', borderRadius: '0.75rem' }} />
            <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.7)', position: 'absolute', bottom: 0, left: 0, right: 0 }}>
              <button type="button" onClick={switchCamera}
                style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: '50%', width: '44px', height: '44px', fontSize: '1.2rem', cursor: 'pointer' }}>
                🔄
              </button>
              <button type="button" onClick={capturePhoto}
                style={{ background: '#fff', border: '3px solid #10b981', borderRadius: '50%', width: '56px', height: '56px', cursor: 'pointer' }}>
                <span style={{ display: 'block', width: '40px', height: '40px', background: '#10b981', borderRadius: '50%', margin: 'auto' }}></span>
              </button>
              <button type="button" onClick={stopCamera}
                style={{ background: '#374151', color: '#fff', border: 'none', borderRadius: '50%', width: '44px', height: '44px', fontSize: '1.2rem', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
          </div>
        )}

        {/* QR Code for phone upload */}
        {phoneQrUrl && !showCamera && (
          <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
            <p style={{ color: '#e5e7eb', fontWeight: '600', marginBottom: '0.75rem' }}>Scan with your phone</p>
            <div style={{ display: 'inline-block', padding: '1rem', background: '#fff', borderRadius: '0.75rem' }}>
              <QRCodeSVG value={phoneQrUrl} size={180} bgColor="#ffffff" fgColor="#000000" level="M" />
            </div>
            <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginTop: '0.75rem' }}>
              Open your phone's camera and point it at this QR code.
            </p>
            <button type="button" onClick={closePhoneUpload}
              style={{ marginTop: '0.75rem', padding: '0.5rem 1.5rem', background: '#374151', color: '#e5e7eb', border: 'none', borderRadius: '0.5rem', cursor: 'pointer', fontSize: '0.85rem' }}>
              Close QR Code
            </button>
          </div>
        )}

        {/* Circle preview */}
        {!showCamera && !phoneQrUrl && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
            <div style={{
              width: '180px', height: '180px', borderRadius: '50%',
              border: '4px solid #10b981',
              overflow: 'hidden', marginBottom: '1.5rem',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: profileData.profileImage ? 'transparent' : '#1a1a2e'
            }}>
              {profileData.profileImage ? (
                <img src={getImageUrl(profileData.profileImage)} alt="Profile"
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={(e) => { e.target.style.display = 'none'; }} />
              ) : (
                <span style={{ fontSize: '3rem', color: '#6b7280' }}>
                  {user?.firstName?.charAt(0)?.toUpperCase() || '?'}
                </span>
              )}
            </div>

            {/* Buttons row */}
            <div style={{ display: 'flex', gap: '0.75rem', width: '100%', maxWidth: '400px', marginBottom: '0.75rem' }}>
              <button type="button" onClick={() => startCamera()}
                style={{
                  flex: 1, padding: '0.75rem 1rem', borderRadius: '0.5rem',
                  background: '#3b82f6', color: '#fff', border: 'none',
                  fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer'
                }}>
                Take Selfie
              </button>
              <button type="button" onClick={() => fileInputRef.current?.click()}
                style={{
                  flex: 1, padding: '0.75rem 1rem', borderRadius: '0.5rem',
                  background: 'transparent', color: '#10b981', border: '2px solid #10b981',
                  fontSize: '0.9rem', fontWeight: '600', cursor: 'pointer'
                }}>
                Upload Photo
              </button>
            </div>
            <button type="button" onClick={startPhoneUpload}
              style={{
                width: '100%', maxWidth: '400px', padding: '0.75rem 1rem', borderRadius: '0.5rem',
                background: '#1a1a2e', color: '#e5e7eb', border: '1px solid #374151',
                fontSize: '0.9rem', fontWeight: '500', cursor: 'pointer'
              }}>
              📱 Upload from Phone
            </button>
          </div>
        )}

        {loading && <p style={{ color: '#9ca3af', textAlign: 'center', marginTop: '0.5rem' }}>Saving profile photo...</p>}
        <p style={{ fontSize: '0.875rem', color: '#9ca3af', textAlign: 'center', marginTop: '1rem' }}>
          Your photo will be shown to {isHost ? 'drivers when they book your vehicles' : 'hosts when you book their vehicles'}
        </p>
      </div>

      {/* Profile Info Form */}
      <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
        <h3 style={{ marginBottom: '1.5rem', color: '#fff' }}>Personal Information</h3>
        <form onSubmit={handleProfileUpdate}>
          <div className="form-group">
            <label className="form-label">First Name</label>
            <input type="text" className="form-input" value={profileData.firstName}
              onChange={(e) => setProfileData(prev => ({ ...prev, firstName: e.target.value.replace(/[^a-zA-Z\s\-'.]/g, '') }))} maxLength="30" required />
          </div>
          <div className="form-group">
            <label className="form-label">Last Name</label>
            <input type="text" className="form-input" value={profileData.lastName}
              onChange={(e) => setProfileData(prev => ({ ...prev, lastName: e.target.value.replace(/[^a-zA-Z\s\-'.]/g, '') }))} maxLength="30" required />
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
                    placeholder="Enter new email address" maxLength="100" style={{ flex: 1 }} />
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
              onChange={(e) => {
                const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
                let formatted = '';
                if (digits.length > 0) formatted = '(' + digits.slice(0, 3);
                if (digits.length >= 3) formatted += ') ';
                if (digits.length > 3) formatted += digits.slice(3, 6);
                if (digits.length >= 6) formatted += '-';
                if (digits.length > 6) formatted += digits.slice(6, 10);
                setProfileData(prev => ({ ...prev, phone: formatted }));
              }} placeholder="(555) 123-4567" maxLength="14" />
          </div>
          <div className="form-group">
            <label className="form-label">Date of Birth</label>
            <input type="date" className="form-input" value={profileData.dateOfBirth}
              onChange={(e) => setProfileData(prev => ({ ...prev, dateOfBirth: e.target.value }))}
              max={new Date(new Date().setFullYear(new Date().getFullYear() - 21)).toISOString().split('T')[0]} />
            {!profileData.dateOfBirth && (
              <p style={{ fontSize: '0.85rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                Required for insurance coverage on rentals
              </p>
            )}
          </div>

          <div style={{ borderTop: '1px solid #333', paddingTop: '1.5rem', marginTop: '1rem' }}>
            <h4 style={{ marginBottom: '1rem', color: '#e5e7eb', fontSize: '1rem' }}>Home Address</h4>
            <div className="form-group">
              <label className="form-label">Street Address</label>
              <AddressAutocomplete
                value={profileData.address.street}
                onChange={(e) => setProfileData(prev => ({ ...prev, address: { ...prev.address, street: e.target.value } }))}
                onPlaceSelect={handleAddressSelect}
                placeholder="Start typing an address..."
                className="form-input"
                maxLength="60"
              />
            </div>
            <div className="form-group">
              <label className="form-label">Apt / Suite / Unit</label>
              <input type="text" className="form-input" value={profileData.address.apt}
                onChange={(e) => setProfileData(prev => ({ ...prev, address: { ...prev.address, apt: e.target.value } }))}
                placeholder="Apt 4B, Suite 200, etc." maxLength="10" />
            </div>
            <div className="form-row">
              <div className="form-group">
                <label className="form-label">City</label>
                <input type="text" className="form-input" value={profileData.address.city}
                  onChange={(e) => setProfileData(prev => ({ ...prev, address: { ...prev.address, city: e.target.value.replace(/[^a-zA-Z\s\-'.]/g, '') } }))}
                  placeholder="New York" maxLength="35" />
              </div>
              <div className="form-group">
                <label className="form-label">State</label>
                <input type="text" className="form-input" value={profileData.address.state}
                  onChange={(e) => setProfileData(prev => ({ ...prev, address: { ...prev.address, state: e.target.value } }))}
                  placeholder="NY" maxLength="2" />
              </div>
            </div>
            <div className="form-group" style={{ maxWidth: '200px' }}>
              <label className="form-label">Zip Code</label>
              <input type="text" className="form-input" value={profileData.address.zipCode}
                onChange={(e) => setProfileData(prev => ({ ...prev, address: { ...prev.address, zipCode: e.target.value.replace(/\D/g, '') } }))}
                placeholder="10001" maxLength="5" />
            </div>
          </div>

          <button type="submit" className="btn btn-primary" disabled={loading} style={{ width: '100%', marginTop: '1rem' }}>
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </form>
      </div>
    </>
  );

  const renderTaxTab = () => {
    // Loading state - don't show anything until we know the server state
    if (taxLoading) {
      return (
        <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333', textAlign: 'center' }}>
          <p style={{ color: '#9ca3af' }}>Loading tax information...</p>
        </div>
      );
    }

    // Error state - fetch failed, don't show form (prevents out-of-sync issues)
    if (taxLoadError) {
      return (
        <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
          <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>Tax Information</h3>
          <div style={{ padding: '1rem', borderRadius: '0.5rem', background: '#7f1d1d', border: '1px solid #ef4444', marginBottom: '1rem' }}>
            <p style={{ color: '#fca5a5', margin: 0 }}>{taxLoadError}</p>
          </div>
          <button onClick={fetchTaxInfo} className="btn btn-primary" style={{ width: '100%' }}>
            Retry
          </button>
        </div>
      );
    }

    const ssnLocked = !!(taxInfo?.taxIdLocked);
    const hasData = !!(taxInfo?.taxIdLast4);

    return (
      <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
        <h3 style={{ marginBottom: '0.5rem', color: '#fff' }}>Tax Information</h3>
        <p style={{ fontSize: '0.85rem', color: '#9ca3af', marginBottom: '1.5rem' }}>
          Manage your tax details for 1099 reporting and payouts.
        </p>

        {/* Status Banner */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '1rem', borderRadius: '0.5rem', marginBottom: '1.5rem',
          background: hasData ? '#064e3b' : '#78350f',
          border: `1px solid ${hasData ? '#10b981' : '#f59e0b'}`
        }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: '700', fontSize: '0.9rem', flexShrink: 0,
            background: hasData ? '#10b981' : '#f59e0b', color: '#000'
          }}>
            {hasData ? '\u2713' : '!'}
          </div>
          <span style={{ fontSize: '0.9rem', color: hasData ? '#a7f3d0' : '#fde68a' }}>
            {hasData ? 'Tax information is on file' : 'Tax information required for payouts'}
          </span>
        </div>

        {/* Saved Details (shown when not editing) */}
        {hasData && !showTaxForm && (
          <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid #333' }}>
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
              {taxInfo.accountType === 'individual' && taxInfo.legalAddress?.street && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Legal Address</span>
                  <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                    {taxInfo.legalAddress.street}<br />
                    {taxInfo.legalAddress.city}{taxInfo.legalAddress.state ? `, ${taxInfo.legalAddress.state}` : ''} {taxInfo.legalAddress.zipCode}
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
              {taxInfo.accountType === 'business' && taxInfo.businessAddress?.street && (
                <div>
                  <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Business Address</span>
                  <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                    {taxInfo.businessAddress.street}<br />
                    {taxInfo.businessAddress.city}{taxInfo.businessAddress.state ? `, ${taxInfo.businessAddress.state}` : ''} {taxInfo.businessAddress.zipCode}
                  </p>
                </div>
              )}
              <div>
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  {taxInfo.accountType === 'individual' ? 'SSN' : 'EIN'}
                </span>
                <p style={{ fontSize: '0.95rem', color: '#f9fafb', fontWeight: '500', margin: '0.15rem 0 0' }}>
                  ****{taxInfo.taxIdLast4}
                  <span style={{ fontSize: '0.75rem', color: '#f59e0b', marginLeft: '0.5rem' }}>(locked)</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Display Preference */}
        {hasData && !showTaxForm && (
          <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1.25rem', marginBottom: '1.5rem', border: '1px solid #333' }}>
            <h4 style={{ color: '#e5e7eb', fontSize: '0.95rem', marginBottom: '0.25rem' }}>Listing Display Name</h4>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1rem' }}>
              Choose what drivers see on your vehicle listings.
            </p>
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button type="button" disabled={displayPrefSaving}
                onClick={() => handleDisplayPreferenceChange('personal')}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                  border: displayPreference === 'personal' ? '2px solid #10b981' : '2px solid #333',
                  background: displayPreference === 'personal' ? 'rgba(16,185,129,0.1)' : 'transparent',
                  color: '#e5e7eb', fontWeight: '500', fontSize: '0.85rem',
                  opacity: displayPrefSaving ? 0.6 : 1
                }}>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Personal Name</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{user?.firstName} {user?.lastName?.charAt(0)}.</div>
              </button>
              <button type="button"
                disabled={displayPrefSaving || !taxInfo?.businessName}
                onClick={() => handleDisplayPreferenceChange('business')}
                style={{
                  flex: 1, padding: '0.75rem', borderRadius: '8px', cursor: 'pointer',
                  border: displayPreference === 'business' ? '2px solid #10b981' : '2px solid #333',
                  background: displayPreference === 'business' ? 'rgba(16,185,129,0.1)' : 'transparent',
                  color: taxInfo?.businessName ? '#e5e7eb' : '#4b5563', fontWeight: '500', fontSize: '0.85rem',
                  opacity: (displayPrefSaving || !taxInfo?.businessName) ? 0.6 : 1
                }}>
                <div style={{ fontWeight: '600', marginBottom: '0.25rem' }}>Business Name</div>
                <div style={{ fontSize: '0.75rem', color: '#9ca3af' }}>{taxInfo?.businessName || 'Add business info first'}</div>
              </button>
            </div>
          </div>
        )}

        {/* Success/error message outside form */}
        {taxMessage && !showTaxForm && (
          <p style={{ fontSize: '0.85rem', color: taxMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '1rem' }}>{taxMessage}</p>
        )}

        {/* Add/Update button */}
        {!showTaxForm && (
          <button onClick={() => { setShowTaxForm(true); setTaxMessage(''); }}
            className={`btn ${hasData ? 'btn-secondary' : 'btn-primary'}`} style={{ width: '100%' }}>
            {hasData ? 'Update Tax Information' : 'Add Tax Information'}
          </button>
        )}

        {/* ===== THE FORM ===== */}
        {showTaxForm && (
          <form onSubmit={handleSaveTaxInfo}>
            {/* Account Type */}
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
                    onChange={() => setTaxFormData(prev => ({ ...prev, accountType: 'individual' }))}
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
                    onChange={() => setTaxFormData(prev => ({ ...prev, accountType: 'business' }))}
                    style={{ accentColor: '#10b981' }} />
                  <div>
                    <span style={{ fontWeight: '600', color: '#e5e7eb', fontSize: '0.9rem' }}>Business / LLC</span>
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', margin: 0 }}>Company EIN</p>
                  </div>
                </label>
              </div>
            </div>

            {/* Business fields */}
            {taxFormData.accountType === 'business' && (
              <>
                <div className="form-group">
                  <label className="form-label">Business Name *</label>
                  <input type="text" className="form-input" value={taxFormData.businessName}
                    onChange={(e) => setTaxFormData(prev => ({ ...prev, businessName: e.target.value }))}
                    placeholder="e.g., United Fleet Services LLC" required />
                </div>
                <div className="form-group">
                  <label className="form-label">DBA (Doing Business As)</label>
                  <input type="text" className="form-input" value={taxFormData.dba}
                    onChange={(e) => setTaxFormData(prev => ({ ...prev, dba: e.target.value }))}
                    placeholder="e.g., UFS Car Rentals" />
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Optional. Enter if your business operates under a different name.
                  </p>
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontWeight: '600', fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Business Address *</label>
                  <div className="form-group">
                    <input type="text" className="form-input" value={taxFormData.businessAddress.street}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, businessAddress: { ...prev.businessAddress, street: e.target.value } }))}
                      placeholder="Street address" maxLength={60} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                    <div className="form-group">
                      <input type="text" className="form-input" value={taxFormData.businessAddress.city}
                        onChange={(e) => setTaxFormData(prev => ({ ...prev, businessAddress: { ...prev.businessAddress, city: e.target.value.replace(/[^a-zA-Z\s\-'.]/g, '') } }))}
                        placeholder="City" maxLength={35} required />
                    </div>
                    <div className="form-group">
                      <input type="text" className="form-input" value={taxFormData.businessAddress.state}
                        onChange={(e) => setTaxFormData(prev => ({ ...prev, businessAddress: { ...prev.businessAddress, state: e.target.value.toUpperCase() } }))}
                        placeholder="State" maxLength={2} required />
                    </div>
                  </div>
                  <div className="form-group" style={{ maxWidth: '50%' }}>
                    <input type="text" className="form-input" value={taxFormData.businessAddress.zipCode}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, businessAddress: { ...prev.businessAddress, zipCode: e.target.value.replace(/\D/g, '') } }))}
                      placeholder="ZIP Code" maxLength={5} required />
                  </div>
                </div>
              </>
            )}

            {/* Individual fields */}
            {taxFormData.accountType === 'individual' && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div className="form-group">
                    <label className="form-label">Legal First Name *</label>
                    <input type="text" className="form-input" value={taxFormData.legalFirstName}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, legalFirstName: e.target.value }))}
                      placeholder="First name as on tax return" required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Legal Last Name *</label>
                    <input type="text" className="form-input" value={taxFormData.legalLastName}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, legalLastName: e.target.value }))}
                      placeholder="Last name as on tax return" required />
                  </div>
                </div>
                <div style={{ marginBottom: '1.25rem' }}>
                  <label style={{ display: 'block', fontWeight: '600', fontSize: '0.9rem', color: '#d1d5db', marginBottom: '0.75rem' }}>Legal Address *</label>
                  <div className="form-group">
                    <input type="text" className="form-input" value={taxFormData.legalAddress.street}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, legalAddress: { ...prev.legalAddress, street: e.target.value } }))}
                      placeholder="Street address" maxLength={60} required />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input type="text" className="form-input" value={taxFormData.legalAddress.city}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, legalAddress: { ...prev.legalAddress, city: e.target.value.replace(/[^a-zA-Z\s\-'.]/g, '') } }))}
                      placeholder="City" maxLength={35} required />
                    <input type="text" className="form-input" value={taxFormData.legalAddress.state}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, legalAddress: { ...prev.legalAddress, state: e.target.value.toUpperCase() } }))}
                      placeholder="State" maxLength={2} required />
                  </div>
                  <div style={{ maxWidth: '50%' }}>
                    <input type="text" className="form-input" value={taxFormData.legalAddress.zipCode}
                      onChange={(e) => setTaxFormData(prev => ({ ...prev, legalAddress: { ...prev.legalAddress, zipCode: e.target.value.replace(/\D/g, '') } }))}
                      placeholder="ZIP Code" maxLength={5} required />
                  </div>
                </div>
              </>
            )}

            {/* SSN / EIN - locked if already submitted */}
            <div className="form-group">
              <label className="form-label">
                {taxFormData.accountType === 'individual' ? 'Social Security Number (SSN) *' : 'Employer ID Number (EIN) *'}
              </label>
              {ssnLocked ? (
                <div>
                  <input type="text" className="form-input"
                    value={`****${taxInfo.taxIdLast4}`}
                    disabled
                    style={{ backgroundColor: '#1a1a2e', color: '#6b7280', cursor: 'not-allowed' }} />
                  <p style={{ fontSize: '0.75rem', color: '#f59e0b', marginTop: '0.25rem' }}>
                    Locked after submission. Contact support to update.
                  </p>
                </div>
              ) : (
                <div>
                  <input type="text" className="form-input" value={taxFormData.taxId}
                    onChange={handleTaxIdInput}
                    placeholder={taxFormData.accountType === 'individual' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                    maxLength={taxFormData.accountType === 'individual' ? 11 : 10}
                    required />
                  <p style={{ fontSize: '0.75rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Stored securely. Only the last 4 digits will be visible. Cannot be changed after saving.
                  </p>
                </div>
              )}
            </div>

            {/* Error/success message inside form */}
            {taxMessage && (
              <p style={{ fontSize: '0.85rem', color: taxMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '0.75rem' }}>{taxMessage}</p>
            )}

            {/* Buttons */}
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

        {/* IRS Info */}
        <div style={{ marginTop: '1.5rem', padding: '1rem', background: '#111', borderRadius: '0.5rem', border: '1px solid #333' }}>
          <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0, lineHeight: '1.5' }}>
            The IRS requires platforms to report earnings via Form 1099-K for hosts earning over $600/year.
            Your tax ID is encrypted and stored securely.
          </p>
        </div>
      </div>
    );
  };

  const renderReportsTab = () => {
    const summary = reportData?.summary || {};
    const vehicleStats = reportData?.vehicleStats || [];
    const recentBookings = reportData?.recentBookings || [];

    const hostEarnings = summary.hostEarnings || 0;
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

    const periodLabels = (() => {
      const now = new Date();
      const EST_OFFSET = 5;
      const fmt = (d, includeYear) => {
        const est = new Date(d.getTime() - EST_OFFSET * 60 * 60 * 1000);
        return includeYear
          ? `${est.getUTCMonth() + 1}/${est.getUTCDate()}/${est.getUTCFullYear()}`
          : `${est.getUTCMonth() + 1}/${est.getUTCDate()}`;
      };
      const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
      const dow = nowEST.getUTCDay();
      const daysSinceMon = dow === 0 ? 6 : dow - 1;
      const wStart = new Date(Date.UTC(nowEST.getUTCFullYear(), nowEST.getUTCMonth(), nowEST.getUTCDate() - daysSinceMon, EST_OFFSET, 0, 0, 0));
      const wEnd = new Date(wStart.getTime() + 7 * 86400000 - 1);
      const y = nowEST.getUTCFullYear(), m = nowEST.getUTCMonth();
      const mStart = new Date(Date.UTC(y, m, 1, EST_OFFSET));
      const mEnd = new Date(Date.UTC(y, m + 1, 1, EST_OFFSET) - 1);
      const yStart = new Date(Date.UTC(y, 0, 1, EST_OFFSET));
      const yEnd = new Date(Date.UTC(y + 1, 0, 1, EST_OFFSET) - 1);
      return {
        week: `This Week (${fmt(wStart)} – ${fmt(wEnd)})`,
        month: `This Month (${fmt(mStart)} – ${fmt(mEnd)})`,
        year: `This Year (${fmt(yStart, true)} – ${fmt(yEnd, true)})`
      };
    })();

    return (
    <div style={{ background: '#000', borderRadius: '1rem', padding: '2rem', border: '1px solid #333' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
        <div>
          <h3 style={{ marginBottom: '0.25rem', color: '#fff', fontSize: '1.25rem' }}>Your Earnings</h3>
          <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
            How your vehicles are performing
          </p>
        </div>
        <Link to="/host/reports" style={{ fontSize: '0.85rem', color: '#10b981', textDecoration: 'none', fontWeight: '500' }}>
          View Full Reports
        </Link>
      </div>

      {/* Period Selector */}
      <div style={{ display: 'flex', gap: '0.35rem', marginBottom: '1.5rem', background: '#111', borderRadius: '8px', padding: '0.25rem' }}>
        {[
          { value: 'week', label: 'Week' },
          { value: 'month', label: 'Month' },
          { value: 'year', label: 'Year' }
        ].map(p => (
          <button key={p.value} onClick={() => setReportPeriod(p.value)}
            style={{
              flex: 1, padding: '0.5rem 0.75rem', borderRadius: '6px', fontSize: '0.85rem', fontWeight: '600', cursor: 'pointer',
              border: 'none',
              background: reportPeriod === p.value ? '#10b981' : 'transparent',
              color: reportPeriod === p.value ? '#000' : '#9ca3af',
              transition: 'all 0.2s'
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
          {/* Hero Earnings Card */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(16,185,129,0.04) 100%)',
            borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid rgba(16,185,129,0.25)',
            marginBottom: '1rem', textAlign: 'center'
          }}>
            <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 0.35rem 0', fontWeight: '500' }}>
              You earned {periodLabels[reportPeriod] ? periodLabels[reportPeriod].toLowerCase() : ''}
            </p>
            <p style={{ fontSize: '2.25rem', fontWeight: '800', color: '#10b981', margin: '0 0 0.25rem 0', letterSpacing: '-0.02em' }}>
              ${hostEarnings.toFixed(2)}
            </p>
            <p style={{ fontSize: '0.8rem', color: '#6b7280', margin: 0 }}>
              from {confirmedBookings} completed booking{confirmedBookings !== 1 ? 's' : ''}
            </p>
          </div>

          {/* Key Stats Row */}
          <div style={{ display: 'grid', gridTemplateColumns: pendingRevenue > 0 ? 'repeat(4, 1fr)' : 'repeat(3, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '0.85rem 0.75rem', border: '1px solid #222' }}>
              <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0 0 0.3rem 0', fontWeight: '500' }}>Total Bookings</p>
              <p style={{ fontSize: '1.35rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>{totalBookings}</p>
            </div>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '0.85rem 0.75rem', border: '1px solid #222' }}>
              <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0 0 0.3rem 0', fontWeight: '500' }}>Avg / Booking</p>
              <p style={{ fontSize: '1.35rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>${avgPerBooking.toFixed(0)}</p>
            </div>
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '0.85rem 0.75rem', border: '1px solid #222' }}>
              <p style={{ fontSize: '0.7rem', color: '#6b7280', margin: '0 0 0.3rem 0', fontWeight: '500' }}>Rental Days</p>
              <p style={{ fontSize: '1.35rem', fontWeight: '700', color: '#f9fafb', margin: 0 }}>{totalDaysBooked}</p>
            </div>
            {pendingRevenue > 0 && (
              <div style={{ background: '#111', borderRadius: '0.5rem', padding: '0.85rem 0.75rem', border: '1px solid #332800' }}>
                <p style={{ fontSize: '0.7rem', color: '#f59e0b', margin: '0 0 0.3rem 0', fontWeight: '500' }}>Pending</p>
                <p style={{ fontSize: '1.35rem', fontWeight: '700', color: '#f59e0b', margin: 0 }}>${pendingRevenue.toFixed(0)}</p>
              </div>
            )}
          </div>

          {/* Booking Breakdown - visual bar */}
          {totalBookings > 0 && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #222', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 0.75rem 0', fontWeight: '500' }}>Booking Breakdown</p>
              {/* Progress bar */}
              <div style={{ height: '8px', borderRadius: '4px', background: '#222', overflow: 'hidden', marginBottom: '0.75rem', display: 'flex' }}>
                {confirmedBookings > 0 && (
                  <div style={{ width: `${(confirmedBookings / totalBookings) * 100}%`, background: '#10b981', transition: 'width 0.3s' }} />
                )}
                {cancelledBookings > 0 && (
                  <div style={{ width: `${(cancelledBookings / totalBookings) * 100}%`, background: '#ef4444', transition: 'width 0.3s' }} />
                )}
              </div>
              <div style={{ display: 'flex', gap: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#10b981' }} />
                  <span style={{ fontSize: '0.8rem', color: '#d1d5db' }}>Confirmed / Active</span>
                  <span style={{ fontSize: '0.8rem', color: '#10b981', fontWeight: '700', marginLeft: '0.25rem' }}>{confirmedBookings}</span>
                </div>
                {cancelledBookings > 0 && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ef4444' }} />
                    <span style={{ fontSize: '0.8rem', color: '#d1d5db' }}>Cancelled</span>
                    <span style={{ fontSize: '0.8rem', color: '#ef4444', fontWeight: '700', marginLeft: '0.25rem' }}>{cancelledBookings}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Vehicle Earnings */}
          {vehicleStats.length > 0 && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #222', marginBottom: '1.5rem' }}>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 0.75rem 0', fontWeight: '500' }}>Earnings by Vehicle — {periodLabels[reportPeriod] || ''}</p>
              <div className="reports-scroll-container" style={{ display: 'flex', flexDirection: 'column', gap: '0', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.75rem' }}>
                {[...vehicleStats].sort((a, b) => (b.hostEarnings || b.totalRevenue || 0) - (a.hostEarnings || a.totalRevenue || 0)).map((v, i) => (
                  <div key={v.vehicleId || i} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.65rem 0',
                    borderBottom: i < vehicleStats.length - 1 ? '1px solid #222' : 'none'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.9rem', color: '#f9fafb', fontWeight: '600', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {v.vehicleNickname}
                      </p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.15rem 0 0' }}>
                        {v.confirmedBookings} booking{v.confirmedBookings !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <span style={{ fontSize: '1rem', fontWeight: '700', color: '#10b981', flexShrink: 0, marginLeft: '1rem' }}>
                      ${(v.hostEarnings || v.totalRevenue || 0).toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recent Bookings */}
          {recentBookings.length > 0 && (
            <div style={{ background: '#111', borderRadius: '0.5rem', padding: '1rem', border: '1px solid #222' }}>
              <p style={{ fontSize: '0.8rem', color: '#9ca3af', margin: '0 0 0.75rem 0', fontWeight: '500' }}>Recent Activity — {periodLabels[reportPeriod] || ''}</p>
              <div className="reports-scroll-container" style={{ display: 'flex', flexDirection: 'column', gap: '0', maxHeight: '400px', overflowY: 'auto', paddingRight: '0.75rem' }}>
                {recentBookings.map((b, i) => (
                  <div key={b.id} style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    padding: '0.6rem 0',
                    borderBottom: i < recentBookings.length - 1 ? '1px solid #222' : 'none'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: '0.85rem', color: '#f9fafb', margin: 0 }}>{b.vehicleNickname}</p>
                      <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: '0.15rem 0 0' }}>
                        {b.reservationId ? `${b.reservationId} · ` : ''}{b.driverName} &middot; {b.totalDays} day{b.totalDays !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
                      <span style={{
                        fontSize: '0.65rem', padding: '0.2rem 0.5rem', borderRadius: '4px', fontWeight: '600', textTransform: 'uppercase',
                        background: statusColors[b.status] || '#6b7280', color: '#fff'
                      }}>
                        {b.status}
                      </span>
                      <span style={{ fontSize: '0.9rem', fontWeight: '600', color: b.paymentStatus === 'paid' ? '#10b981' : '#f59e0b' }}>
                        ${Number(b.totalPrice || 0).toFixed(2)}
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
                  Required: Take a clear selfie of your face to verify your identity
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
          Your cards are securely stored by Stripe and can be used for faster checkout.
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

  const handleRemoveHostAccount = async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/users/account/remove-host`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
      localStorage.setItem('activeMode', 'driver');
      setSettingsMessage('Host account removed. You are now a driver only.');
      setSettingsAction(null);
    } catch (err) {
      setSettingsError(err.response?.data?.message || 'Failed to remove host account.');
    } finally {
      setSettingsLoading(false);
    }
  };

  const handleRemoveDriverAccount = async () => {
    setSettingsLoading(true);
    setSettingsError('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/users/account/remove-driver`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUser(response.data);
      localStorage.setItem('activeMode', 'host');
      setSettingsMessage('Driver account removed. You are now a host only.');
      setSettingsAction(null);
    } catch (err) {
      setSettingsError(err.response?.data?.message || 'Failed to remove driver account.');
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

      {/* Remove Host / Driver Account - only for users with both */}
      {user?.userType === 'both' && (
        <>
          {/* Remove Host Account */}
          <div style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#f97316', marginBottom: '0.5rem' }}>Remove Host Account</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: '1.5' }}>
              Remove your host account and keep your driver account active. Your vehicle listings will be hidden
              from the marketplace. Your driver profile and booking history will remain intact.
            </p>

            {settingsAction === 'remove-host' ? (
              <div style={{
                background: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid #f97316',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <p style={{ color: '#fb923c', fontWeight: '600', marginBottom: '0.75rem' }}>
                  Are you sure you want to remove your host account?
                </p>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
                  Your vehicle listings will be hidden. You can register as a host again later if you change your mind.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={handleRemoveHostAccount}
                    disabled={settingsLoading}
                    style={{
                      background: '#f97316',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '0.375rem',
                      fontWeight: '600',
                      cursor: settingsLoading ? 'not-allowed' : 'pointer',
                      opacity: settingsLoading ? 0.6 : 1
                    }}
                  >
                    {settingsLoading ? 'Processing...' : 'Yes, Remove Host Account'}
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
                onClick={() => { setSettingsAction('remove-host'); setSettingsError(''); setSettingsMessage(''); }}
                style={{
                  background: 'transparent',
                  color: '#f97316',
                  border: '1px solid #f97316',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Remove Host Account
              </button>
            )}
          </div>

          {/* Remove Driver Account */}
          <div style={{ background: '#111', borderRadius: '0.75rem', padding: '1.5rem', border: '1px solid #333', marginBottom: '1.5rem' }}>
            <h3 style={{ color: '#f97316', marginBottom: '0.5rem' }}>Remove Driver Account</h3>
            <p style={{ color: '#9ca3af', fontSize: '0.875rem', marginBottom: '1rem', lineHeight: '1.5' }}>
              Remove your driver account and keep your host account active. You will no longer be able to
              rent vehicles from other hosts. Your vehicle listings and host earnings will remain intact.
            </p>

            {settingsAction === 'remove-driver' ? (
              <div style={{
                background: 'rgba(249, 115, 22, 0.1)',
                border: '1px solid #f97316',
                borderRadius: '0.5rem',
                padding: '1rem'
              }}>
                <p style={{ color: '#fb923c', fontWeight: '600', marginBottom: '0.75rem' }}>
                  Are you sure you want to remove your driver account?
                </p>
                <p style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '1rem' }}>
                  You will no longer be able to rent vehicles. You can register as a driver again later if you change your mind.
                </p>
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                  <button
                    onClick={handleRemoveDriverAccount}
                    disabled={settingsLoading}
                    style={{
                      background: '#f97316',
                      color: '#fff',
                      border: 'none',
                      padding: '0.5rem 1.25rem',
                      borderRadius: '0.375rem',
                      fontWeight: '600',
                      cursor: settingsLoading ? 'not-allowed' : 'pointer',
                      opacity: settingsLoading ? 0.6 : 1
                    }}
                  >
                    {settingsLoading ? 'Processing...' : 'Yes, Remove Driver Account'}
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
                onClick={() => { setSettingsAction('remove-driver'); setSettingsError(''); setSettingsMessage(''); }}
                style={{
                  background: 'transparent',
                  color: '#f97316',
                  border: '1px solid #f97316',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  fontWeight: '600',
                  cursor: 'pointer'
                }}
              >
                Remove Driver Account
              </button>
            )}
          </div>
        </>
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
  const tollspotNeedsAttention = isHost && tollspotActive === false;

  const isDriver = user?.userType === 'driver' || user?.userType === 'both';

  const tabs = [
    { id: 'profile', label: 'My Profile' },
    { id: 'license', label: "Driver's License" },
    { id: 'payment', label: 'Payment Methods' },
    ...(isHost ? [
      { id: 'integrations', label: 'Integrations', alert: tollspotNeedsAttention },
      { id: 'tax', label: 'Tax Settings', alert: taxNeedsAttention },
      { id: 'payouts', label: 'Payouts' },
      { id: 'reports', label: 'Reports' }
    ] : []),
    { id: 'settings', label: 'Settings' }
  ];

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container" style={{ maxWidth: '900px' }}>
          <h1 className="page-title" style={{ position: 'sticky', top: '60px', zIndex: 10, background: '#111111', paddingTop: '1rem', paddingBottom: '1rem', margin: 0 }}>My Profile</h1>

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
              top: '140px'
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
              {activeTab === 'license' && renderLicenseTab()}
              {activeTab === 'integrations' && (
                <div>
                  <h2 style={{ color: '#fff', marginBottom: '0.5rem' }}>Integrations</h2>
                  <p style={{ color: '#9ca3af', marginBottom: '1.5rem', fontSize: '0.95rem' }}>
                    Connect third-party services to enhance your hosting experience.
                  </p>

                  {/* TollSpot Integration Card */}
                  <div style={{
                    background: '#111',
                    border: tollspotActive ? '1px solid #10b981' : tollspotPending ? '1px solid #f59e0b' : '1px solid #333',
                    borderRadius: '0.75rem',
                    padding: '1.5rem',
                    transition: 'border-color 0.2s'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                          <h3 style={{ color: '#fff', margin: 0, fontSize: '1.1rem' }}>TollSpot</h3>
                          {tollspotActive && (
                            <span style={{
                              background: 'rgba(16,185,129,0.15)',
                              color: '#10b981',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>Connected</span>
                          )}
                          {tollspotPending && !tollspotActive && (
                            <span style={{
                              background: 'rgba(245,158,11,0.15)',
                              color: '#f59e0b',
                              fontSize: '0.7rem',
                              fontWeight: '600',
                              padding: '2px 8px',
                              borderRadius: '9999px',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px'
                            }}>Pending Setup</span>
                          )}
                        </div>
                        <p style={{ color: '#9ca3af', margin: '0 0 0.75rem', fontSize: '0.9rem', lineHeight: '1.5' }}>
                          Automated toll management for your fleet. TollSpot tracks and processes toll charges for your rental vehicles so you don't have to.
                        </p>
                        {tollspotActive && tollspotConnectedAt && (
                          <p style={{ color: '#6b7280', margin: 0, fontSize: '0.8rem' }}>
                            Connected on {new Date(tollspotConnectedAt).toLocaleDateString()}
                          </p>
                        )}
                        {tollspotPending && !tollspotActive && (
                          <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <button
                              onClick={handleTollspotConfirm}
                              disabled={tollspotLoading}
                              style={{
                                background: '#10b981',
                                color: '#fff',
                                border: 'none',
                                padding: '0.5rem 1rem',
                                borderRadius: '0.375rem',
                                fontSize: '0.85rem',
                                fontWeight: '600',
                                cursor: tollspotLoading ? 'wait' : 'pointer',
                                opacity: tollspotLoading ? 0.6 : 1
                              }}
                            >
                              Confirm Connection
                            </button>
                            <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>
                              Complete setup on TollSpot, then confirm here
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Toggle Switch */}
                      <button
                        onClick={handleTollspotToggle}
                        disabled={tollspotLoading}
                        style={{
                          position: 'relative',
                          width: '50px',
                          height: '28px',
                          borderRadius: '14px',
                          border: 'none',
                          background: tollspotActive ? '#10b981' : tollspotPending ? '#f59e0b' : '#333',
                          cursor: tollspotLoading ? 'wait' : 'pointer',
                          transition: 'background 0.2s',
                          flexShrink: 0,
                          marginTop: '2px',
                          opacity: tollspotLoading ? 0.6 : 1
                        }}
                        aria-label={tollspotActive ? 'Deactivate TollSpot' : tollspotPending ? 'Cancel TollSpot setup' : 'Activate TollSpot'}
                      >
                        <span style={{
                          position: 'absolute',
                          top: '3px',
                          left: (tollspotActive || tollspotPending) ? '25px' : '3px',
                          width: '22px',
                          height: '22px',
                          borderRadius: '50%',
                          background: '#fff',
                          transition: 'left 0.2s',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.3)'
                        }} />
                      </button>
                    </div>
                  </div>
                </div>
              )}
              {activeTab === 'payment' && renderPaymentTab()}
              {activeTab === 'tax' && isHost && renderTaxTab()}
              {payoutsOpened && isHost && <div style={{ display: activeTab === 'payouts' ? 'block' : 'none' }}><PayoutsContent /></div>}
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
