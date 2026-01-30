import React, { useState, useRef, useCallback, useEffect } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import API_URL from '../config/api';
import './ImageUpload.css';

// Resolve image URL - handles relative paths, full URLs, and base64
const resolveImageUrl = (url) => {
  if (!url) return '';
  if (url.startsWith('data:')) return url; // base64
  if (url.startsWith('http')) return url; // already full URL
  if (url.startsWith('/uploads/')) return `${API_URL}${url}`; // relative path
  return url;
};

// Compress an image file/blob to a base64 data URL
// Resizes to max 1200px wide and compresses as JPEG quality 0.7
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

        // Scale down if larger than max
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

        // Compress as JPEG
        const base64 = canvas.toDataURL('image/jpeg', 0.7);
        const sizeKB = Math.round((base64.length * 3) / 4 / 1024);
        console.log(`📸 Compressed image: ${img.width}x${img.height} → ${width}x${height}, ~${sizeKB}KB`);
        resolve(base64);
      };
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = e.target.result;
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
};

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
      const base64 = await compressImage(file);
      console.log(`✅ Image compressed for ${label}`);
      onChange(base64);
      setUploadError('');
    } catch (err) {
      console.error('Compression failed:', err);
      setUploadError('Failed to process image. Please try again.');
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

    // Get compressed base64 directly from canvas
    const base64 = canvas.toDataURL('image/jpeg', 0.7);
    console.log(`✅ Camera photo captured for ${label}`);
    onChange(base64);
  };

  // Phone upload: create session and show QR code
  const startPhoneUpload = async () => {
    setUploadError('');
    try {
      const res = await axios.post(`${API_URL}/api/upload/create-session`, {
        photoSlot: label
      });
      const { sessionId } = res.data;
      setPhoneSession(sessionId);

      // Build QR URL from the current browser origin and pass API URL so the phone
      // knows where to send uploads regardless of frontend/backend domain setup
      setPhoneQrUrl(`${window.location.origin}/mobile-upload/${sessionId}?api=${encodeURIComponent(API_URL)}`);

      // Start polling for uploaded images
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await axios.get(`${API_URL}/api/upload/session/${sessionId}`);
          if (pollRes.data.images && pollRes.data.images.length > 0) {
            // Use the latest image - phone uploads store base64 now
            const latestImage = pollRes.data.images[pollRes.data.images.length - 1];
            onChange(latestImage);
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
            <img src={resolveImageUrl(value)} alt="Preview" onError={(e) => {
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

export { resolveImageUrl };
export default ImageUpload;
