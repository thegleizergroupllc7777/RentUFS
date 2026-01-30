import React, { useState, useRef, useCallback, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import API_URL from '../config/api';
import getImageUrl from '../config/imageUrl';
import './ImageUpload.css';

const ImageUpload = ({ label, value, onChange, required = false }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const [phoneSession, setPhoneSession] = useState(null);
  const [phoneQrUrl, setPhoneQrUrl] = useState('');
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const pollRef = useRef(null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const uploadFileToServer = async (file) => {
    const formData = new FormData();
    formData.append('image', file);
    const token = localStorage.getItem('token');
    const headers = { 'Content-Type': 'multipart/form-data' };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const endpoint = token ? '/api/upload/image' : '/api/upload/image-public';
    const res = await axios.post(`${API_URL}${endpoint}`, formData, { headers });
    return res.data.imageUrl;
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadError('');

    if (!file.type.startsWith('image/')) {
      const errorMsg = 'Please select an image file (JPG, PNG, etc.)';
      setUploadError(errorMsg);
      alert(errorMsg);
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      const errorMsg = 'Image size must be less than 5MB';
      setUploadError(errorMsg);
      alert(errorMsg);
      return;
    }

    setUploading(true);
    console.log(`📤 Uploading ${label} to server...`);

    try {
      const imageUrl = await uploadFileToServer(file);
      console.log(`✅ Image uploaded successfully for ${label}: ${imageUrl}`);
      onChange(imageUrl);
      setUploadError('');
    } catch (err) {
      console.error('Upload failed:', err);
      const errorMsg = err.response?.data?.message || 'Failed to upload image. Please try again.';
      setUploadError(errorMsg);
      alert(errorMsg);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }, []);

  const startCamera = async (mode) => {
    setUploadError('');
    const useMode = mode || facingMode;

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: useMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);

      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError') {
        setUploadError('Camera access denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setUploadError('No camera found on this device. Use "Choose from Computer" or "Upload from Phone" instead.');
      } else {
        setUploadError('Could not access camera. Use "Choose from Computer" or "Upload from Phone" instead.');
      }
    }
  };

  const switchCamera = () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    startCamera(newMode);
  };

  const capturePhoto = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    stopCamera();
    setUploading(true);

    try {
      // Convert canvas to blob and upload to server
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
      const file = new File([blob], `camera-${Date.now()}.jpg`, { type: 'image/jpeg' });
      const imageUrl = await uploadFileToServer(file);
      console.log(`✅ Camera photo uploaded for ${label}: ${imageUrl}`);
      onChange(imageUrl);
    } catch (err) {
      console.error('Camera upload failed:', err);
      setUploadError('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Phone upload: create session and show QR code
  const startPhoneUpload = async () => {
    setUploadError('');
    try {
      const res = await axios.post(`${API_URL}/api/upload/create-session`, {
        photoSlot: label
      });
      const { sessionId, qrUrl } = res.data;
      setPhoneSession(sessionId);

      // Use server-provided URL (uses CLIENT_URL env var for production)
      setPhoneQrUrl(qrUrl);

      // Start polling for uploaded images
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await axios.get(`${API_URL}/api/upload/session/${sessionId}`);
          if (pollRes.data.images && pollRes.data.images.length > 0) {
            // Use the latest image
            const latestImage = pollRes.data.images[pollRes.data.images.length - 1];
            onChange(latestImage);
            // Keep polling in case they upload more - the latest will be used
          }
        } catch (err) {
          // Session expired or error - stop polling
          if (err.response?.status === 404) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 2000);
    } catch (err) {
      setUploadError('Failed to create upload session. Please try again.');
    }
  };

  const closePhoneUpload = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    // Clean up session on server
    if (phoneSession) {
      axios.delete(`${API_URL}/api/upload/session/${phoneSession}`).catch(() => {});
    }
    setPhoneSession(null);
    setPhoneQrUrl('');
  };

  const handleClear = () => {
    onChange('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    stopCamera();
    closePhoneUpload();
  };

  return (
    <div className="image-upload-container">
      <label className="form-label">
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>

      <div className="file-upload-section">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id={`file-input-${label}`}
        />

        {/* Hidden canvas for photo capture */}
        <canvas ref={canvasRef} style={{ display: 'none' }} />

        {/* Camera viewfinder */}
        {cameraOpen && (
          <div className="camera-viewfinder">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="camera-video"
            />
            <div className="camera-controls">
              <button
                type="button"
                className="camera-control-btn camera-switch-btn"
                onClick={switchCamera}
                title="Switch camera"
              >
                🔄
              </button>
              <button
                type="button"
                className="camera-control-btn camera-capture-btn"
                onClick={capturePhoto}
                title="Take photo"
              >
                <span className="capture-circle"></span>
              </button>
              <button
                type="button"
                className="camera-control-btn camera-close-btn"
                onClick={stopCamera}
                title="Close camera"
              >
                ✕
              </button>
            </div>
          </div>
        )}

        {/* QR Code for phone upload */}
        {phoneQrUrl && !cameraOpen && (
          <div className="phone-upload-qr">
            <p className="qr-title">Scan with your phone</p>
            <div className="qr-code-wrapper">
              <QRCodeSVG
                value={phoneQrUrl}
                size={180}
                bgColor="#ffffff"
                fgColor="#000000"
                level="M"
              />
            </div>
            <p className="qr-instruction">
              Open your phone's camera and point it at this QR code.
              Photos you take will appear here automatically.
            </p>
            {value && (
              <div className="qr-received">
                ✅ Photo received from phone!
              </div>
            )}
            <button
              type="button"
              className="qr-close-btn"
              onClick={closePhoneUpload}
            >
              Close QR Code
            </button>
          </div>
        )}

        {!cameraOpen && !phoneQrUrl && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="file-upload-btn"
                style={{ flex: '1', minWidth: '140px', border: 'none', textAlign: 'center' }}
                onClick={() => startCamera()}
                disabled={uploading}
              >
                {uploading ? (
                  <span>📤 Uploading...</span>
                ) : value ? (
                  <span>📷 Take New Photo</span>
                ) : (
                  <span>📷 Use Camera</span>
                )}
              </button>

              <label htmlFor={`file-input-${label}`} className="file-upload-btn" style={{ flex: '1', minWidth: '140px' }}>
                {uploading ? (
                  <span>📤 Uploading...</span>
                ) : value ? (
                  <span>💻 Choose Different</span>
                ) : (
                  <span>💻 Choose from Computer</span>
                )}
              </label>
            </div>

            <button
              type="button"
              className="phone-upload-btn"
              onClick={startPhoneUpload}
              disabled={uploading}
            >
              📱 Upload from Phone
            </button>
          </>
        )}

        <p className="upload-hint">
          Use camera, select from computer, or scan QR code with your phone (Max 5MB)
        </p>

        {uploadError && (
          <div style={{
            marginTop: '0.5rem',
            padding: '0.5rem',
            backgroundColor: '#fee2e2',
            color: '#dc2626',
            borderRadius: '0.375rem',
            fontSize: '0.875rem'
          }}>
            ❌ {uploadError}
          </div>
        )}
      </div>

      {/* Image Preview */}
      {value && (
        <div className="image-preview-container">
          <div className="image-preview">
            <img src={getImageUrl(value)} alt="Preview" onError={(e) => {
              e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150"><rect fill="%23ddd" width="200" height="150"/><text x="50%" y="50%" fill="%23999" text-anchor="middle" dy=".3em">Image unavailable</text></svg>';
            }} />
            <button
              type="button"
              className="remove-image-btn"
              onClick={handleClear}
              title="Remove image"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
