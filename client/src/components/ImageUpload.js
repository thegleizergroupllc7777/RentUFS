import React, { useState, useRef, useCallback } from 'react';
import './ImageUpload.css';

const ImageUpload = ({ label, value, onChange, required = false }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [facingMode, setFacingMode] = useState('environment');
  const fileInputRef = useRef(null);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadError('');

    // Validate file type
    if (!file.type.startsWith('image/')) {
      const errorMsg = 'Please select an image file (JPG, PNG, etc.)';
      setUploadError(errorMsg);
      alert(errorMsg);
      return;
    }

    // Validate file size (2MB for base64 to avoid huge strings)
    if (file.size > 2 * 1024 * 1024) {
      const errorMsg = 'Image size must be less than 2MB';
      setUploadError(errorMsg);
      alert(errorMsg);
      return;
    }

    setUploading(true);
    console.log(`Converting ${label} to base64...`);

    // Convert image to base64 - this works WITHOUT any server!
    const reader = new FileReader();

    reader.onloadend = () => {
      const base64String = reader.result;
      console.log(`✅ Image converted successfully for ${label}`);

      // Pass the base64 string directly
      onChange(base64String);
      setUploadError('');
      setUploading(false);

      // Clear file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    };

    reader.onerror = () => {
      console.error('Failed to read file');
      setUploadError('Failed to read image file');
      alert('Failed to read image file. Please try again.');
      setUploading(false);
    };

    // Start reading the file as base64
    reader.readAsDataURL(file);
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
      // Stop any existing stream first
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: useMode, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });

      streamRef.current = stream;
      setCameraOpen(true);

      // Need to wait for the video element to be rendered
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
        setUploadError('No camera found on this device. Please use "Choose from Computer" instead.');
      } else {
        setUploadError('Could not access camera. Please use "Choose from Computer" instead.');
      }
    }
  };

  const switchCamera = () => {
    const newMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newMode);
    startCamera(newMode);
  };

  const capturePhoto = () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    const base64 = canvas.toDataURL('image/jpeg', 0.85);
    onChange(base64);
    stopCamera();
  };

  const handleClear = () => {
    onChange('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    stopCamera();
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

        {!cameraOpen && (
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
        )}

        <p className="upload-hint">
          Use camera or select from your computer (Max 2MB)
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
            <img src={value} alt="Preview" onError={(e) => {
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
