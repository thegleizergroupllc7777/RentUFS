import React, { useState, useRef, useCallback, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import API_URL from '../config/api';
import getImageUrl from '../config/imageUrl';
import './ImageUpload.css';

// Compress an image file and return as a Blob
// Resizes to max 1200px and compresses as JPEG quality 0.7
// Result is typically 100-300KB instead of 3-5MB
const compressImage = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 1200;
        const MAX_HEIGHT = 900;

        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH) {
          height = Math.round((height * MAX_WIDTH) / width);
          width = MAX_WIDTH;
        }
        if (height > MAX_HEIGHT) {
          width = Math.round((width * MAX_HEIGHT) / height);
          height = MAX_HEIGHT;
        }

        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob((blob) => {
          if (!blob) return reject(new Error('Failed to compress image'));
          const sizeKB = Math.round(blob.size / 1024);
          console.log(`📸 Compressed image: ${img.width}x${img.height} → ${width}x${height}, ~${sizeKB}KB`);
          resolve(blob);
        }, 'image/jpeg', 0.7);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

// Upload a Blob to the server and return the URL path
// Uses authenticated endpoint when logged in, public endpoint otherwise (e.g. during registration)
const uploadToServer = async (blob, filename) => {
  const formData = new FormData();
  formData.append('image', blob, filename || 'photo.jpg');
  const token = localStorage.getItem('token');
  const endpoint = token ? '/api/upload/image' : '/api/upload/image-public';
  const response = await axios.post(`${API_URL}${endpoint}`, formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.data.success) throw new Error('Upload failed');
  return response.data.imageUrl;
};

// Convert a base64 data URL to a Blob
const base64ToBlob = (base64) => {
  const parts = base64.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bytes = atob(parts[1]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const ImageUpload = ({ label, value, onChange, required = false }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
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

    if (file.size > 10 * 1024 * 1024) {
      const errorMsg = 'Image size must be less than 10MB';
      setUploadError(errorMsg);
      alert(errorMsg);
      return;
    }

    setUploading(true);
    try {
      const blob = await compressImage(file);
      const imageUrl = await uploadToServer(blob, file.name);
      console.log(`✅ Image uploaded for ${label}: ${imageUrl}`);
      onChange(imageUrl);
      setUploadError('');
    } catch (err) {
      console.error('Upload failed:', err);
      setUploadError('Failed to upload image. Please try again.');
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

  const startCamera = async (deviceId = null) => {
    setUploadError('');

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
        // Try rear camera first on mobile (facingMode), fall back to first available
        videoConstraints.facingMode = { ideal: 'environment' };
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);

      // Find the index of the current camera
      const currentTrack = stream.getVideoTracks()[0];
      const currentDeviceId = currentTrack?.getSettings()?.deviceId;
      const idx = videoDevices.findIndex(d => d.deviceId === currentDeviceId);
      if (idx !== -1) setCurrentCameraIndex(idx);

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

    // Resize capture to max 1200px
    const MAX_WIDTH = 1200;
    let width = video.videoWidth;
    let height = video.videoHeight;
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }

    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, width, height);

    stopCamera();
    setUploading(true);

    try {
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));
      const imageUrl = await uploadToServer(blob, 'camera-photo.jpg');
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

      // Use server-provided URL (uses CLIENT_URL env var or request origin for production)
      setPhoneQrUrl(qrUrl);

      // Start polling for uploaded images
      let lastCount = 0;
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await axios.get(`${API_URL}/api/upload/session/${sessionId}`);
          if (pollRes.data.images && pollRes.data.images.length > lastCount) {
            // Process ALL new images since last poll, not just the latest
            const newImages = pollRes.data.images.slice(lastCount);
            lastCount = pollRes.data.images.length;

            for (const image of newImages) {
              try {
                if (image.startsWith('data:')) {
                  // Legacy base64 format - convert and upload
                  const blob = base64ToBlob(image);
                  const imageUrl = await uploadToServer(blob, 'phone-photo.jpg');
                  console.log(`✅ Phone photo uploaded: ${imageUrl}`);
                  onChange(imageUrl);
                } else {
                  // Cloudinary URL - use directly
                  console.log(`✅ Phone photo ready: ${image}`);
                  onChange(image);
                }
              } catch (uploadErr) {
                console.error('Failed to process phone image:', uploadErr);
              }
            }
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
                  <span>📤 Processing...</span>
                ) : value ? (
                  <span>📷 Take New Photo</span>
                ) : (
                  <span>📷 Use Camera</span>
                )}
              </button>

              <label htmlFor={`file-input-${label}`} className="file-upload-btn" style={{ flex: '1', minWidth: '140px' }}>
                {uploading ? (
                  <span>📤 Processing...</span>
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
          Use camera, select from computer, or scan QR code with your phone (Max 10MB, auto-compressed)
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

// Named export for resolving image URLs (used by EditVehicle)
export const resolveImageUrl = getImageUrl;

export default ImageUpload;
