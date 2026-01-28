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

  useEffect(() => {
    if (user) {
      setProfileData({
        firstName: user.firstName || '',
        lastName: user.lastName || '',
        phone: user.phone || '',
        email: user.email || '',
        profileImage: user.profileImage || ''
      });
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
                <input
                  type="email"
                  className="form-input"
                  value={profileData.email}
                  disabled
                  style={{ background: '#1a1a1a', cursor: 'not-allowed', color: '#6b7280' }}
                />
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
