import React, { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import API_URL from '../config/api';
import { resolveImageUrl } from './ImageUpload';
import './VehicleInspection.css';

const PHOTO_POSITIONS = [
  { key: 'frontView', label: 'Front View', instruction: 'Take a photo of the front of the vehicle' },
  { key: 'backView', label: 'Back View', instruction: 'Take a photo of the back of the vehicle' },
  { key: 'leftSide', label: 'Left Side', instruction: 'Take a photo of the left side of the vehicle' },
  { key: 'rightSide', label: 'Right Side', instruction: 'Take a photo of the right side of the vehicle' }
];

// Shrink a picked image file down to a JPEG (max 1200px wide, 0.7 quality) in the
// browser before upload — same as the in-app camera. This keeps big iPhone photos
// under the server's 5MB limit AND converts Apple's HEIC format to JPEG, so a
// renter can pick any photo from their camera roll and it uploads reliably.
// Rejects if the browser can't decode the image (caller falls back to the original).
const shrinkImageFile = (file) => new Promise((resolve, reject) => {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.onload = () => {
    URL.revokeObjectURL(url);
    const MAX_WIDTH = 1200;
    let width = img.naturalWidth || img.width;
    let height = img.naturalHeight || img.height;
    if (!width || !height) { reject(new Error('Could not read image dimensions')); return; }
    if (width > MAX_WIDTH) {
      height = Math.round((height * MAX_WIDTH) / width);
      width = MAX_WIDTH;
    }
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    canvas.getContext('2d').drawImage(img, 0, 0, width, height);
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not process image'))),
      'image/jpeg',
      0.7
    );
  };
  img.onerror = () => {
    URL.revokeObjectURL(url);
    reject(new Error('Could not read image'));
  };
  img.src = url;
});

const VehicleInspection = ({ booking, type, onComplete, onCancel }) => {
  const [photos, setPhotos] = useState({
    frontView: null,
    backView: null,
    leftSide: null,
    rightSide: null
  });
  const [currentStep, setCurrentStep] = useState(0);
  const [notes, setNotes] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const galleryInputRef = useRef(null);
  // Key to force re-mount of file inputs on iOS to prevent freeze
  const [inputKey, setInputKey] = useState(0);
  // Ref to track currentStep for use in async handlers (avoids stale closures)
  const currentStepRef = useRef(0);

  // Webcam state
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameras, setCameras] = useState([]);
  const [currentCameraIndex, setCurrentCameraIndex] = useState(0);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  // Phone upload state
  const [phoneSession, setPhoneSession] = useState(null);
  const [phoneQrUrl, setPhoneQrUrl] = useState('');
  const [phoneLoading, setPhoneLoading] = useState(false);
  const pollRef = useRef(null);

  const currentPosition = PHOTO_POSITIONS[currentStep];
  const allPhotosUploaded = Object.values(photos).every(photo => photo !== null);

  // Keep currentStepRef in sync with currentStep state
  useEffect(() => {
    currentStepRef.current = currentStep;
  }, [currentStep]);

  // Clean up polling and camera on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  // Stop camera stream
  const stopCamera = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    setCameraOpen(false);
  }, []);

  // Start camera with getUserMedia
  const startCamera = async (deviceId = null) => {
    setError('');

    try {
      // Stop any existing stream
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

      // Small delay to ensure video element is mounted
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }, 50);
    } catch (err) {
      console.error('Camera access error:', err);
      if (err.name === 'NotAllowedError') {
        setError('Camera access denied. Please allow camera access in your browser settings.');
      } else if (err.name === 'NotFoundError') {
        setError('No camera found on this device. Use "Choose from Computer" or "Upload from Phone" instead.');
      } else {
        setError('Could not access camera. Use "Choose from Computer" or "Upload from Phone" instead.');
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

  // Capture photo from video stream
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

    // Capture the step at the time of capture
    const stepAtCapture = currentStepRef.current;
    const posKey = PHOTO_POSITIONS[stepAtCapture]?.key;

    try {
      const token = localStorage.getItem('token');
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.7));

      const formData = new FormData();
      formData.append('image', blob, 'camera-photo.jpg');

      const response = await axios.post(
        `${API_URL}/api/upload/image`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      const imageUrl = response.data.imageUrl.startsWith('http')
        ? response.data.imageUrl
        : `${API_URL}${response.data.imageUrl}`;

      if (posKey) {
        setPhotos(prev => ({
          ...prev,
          [posKey]: imageUrl
        }));
      }

      // Auto-advance to next step if not on last photo
      if (stepAtCapture < PHOTO_POSITIONS.length - 1) {
        setCurrentStep(stepAtCapture + 1);
      }
    } catch (err) {
      console.error('Camera upload failed:', err);
      setError('Failed to upload photo. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  // Convert a base64 data URL to a Blob for FormData upload
  const base64ToBlob = (base64) => {
    const parts = base64.split(';base64,');
    const contentType = parts[0].split(':')[1];
    const raw = atob(parts[1]);
    const arr = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) {
      arr[i] = raw.charCodeAt(i);
    }
    return new Blob([arr], { type: contentType });
  };

  // Upload a base64 image to the server and return the file URL
  const uploadBase64AsFile = async (base64Data) => {
    const token = localStorage.getItem('token');
    const blob = base64ToBlob(base64Data);
    const formData = new FormData();
    formData.append('image', blob, 'phone-upload.jpg');

    const response = await axios.post(
      `${API_URL}/api/upload/image`,
      formData,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      }
    );

    const imageUrl = response.data.imageUrl.startsWith('http')
      ? response.data.imageUrl
      : `${API_URL}${response.data.imageUrl}`;
    return imageUrl;
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file || uploading) return;

    // Clear input value immediately so the same input can be reused on mobile
    // This must happen before any state updates to avoid destroying the input mid-read
    e.target.value = null;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Capture the step at the time the user clicked, before any async work
    const stepAtCapture = currentStepRef.current;
    const posKey = PHOTO_POSITIONS[stepAtCapture]?.key;

    setUploading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      // Shrink + convert to JPEG first so big or HEIC iPhone photos upload
      // reliably. If the browser can't decode the file (rare), fall back to the
      // original — and only then enforce the 5MB server limit.
      let uploadBlob;
      let uploadName = 'return-photo.jpg';
      try {
        uploadBlob = await shrinkImageFile(file);
      } catch (shrinkErr) {
        if (file.size > 5 * 1024 * 1024) {
          setError('This photo couldn’t be resized. Please use the in-app camera, or pick a smaller photo.');
          return;
        }
        uploadBlob = file;
        uploadName = file.name || 'return-photo.jpg';
      }

      // Create FormData for proper file upload
      const formData = new FormData();
      formData.append('image', uploadBlob, uploadName);

      const response = await axios.post(
        `${API_URL}/api/upload/image`,
        formData,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'multipart/form-data'
          }
        }
      );

      // Update photos state with the uploaded URL
      // The server returns imageUrl, construct full URL
      const imageUrl = response.data.imageUrl.startsWith('http')
        ? response.data.imageUrl
        : `${API_URL}${response.data.imageUrl}`;

      // Update photos and step separately (not nested) to avoid batching issues
      if (posKey) {
        setPhotos(prev => ({
          ...prev,
          [posKey]: imageUrl
        }));
      }

      // Auto-advance to next step if not on last photo
      if (stepAtCapture < PHOTO_POSITIONS.length - 1) {
        setCurrentStep(stepAtCapture + 1);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      // Force re-mount file inputs AFTER upload completes to reset iOS camera state
      setInputKey(prev => prev + 1);
    }
  };

  const handleCameraCapture = () => {
    if (uploading) return;
    startCamera();
  };

  const handleGalleryPick = () => {
    if (uploading) return;
    galleryInputRef.current?.click();
  };

  const handleRetakePhoto = (key) => {
    const stepIndex = PHOTO_POSITIONS.findIndex(p => p.key === key);
    setCurrentStep(stepIndex);
    setPhotos(prev => ({ ...prev, [key]: null }));
  };

  // Phone upload: create session and show QR code
  const startPhoneUpload = useCallback(async () => {
    if (phoneLoading) return;
    setError('');
    setPhoneLoading(true);
    try {
      const positionLabel = PHOTO_POSITIONS[currentStep]?.label || 'Inspection Photo';
      console.log('📱 Creating upload session for:', positionLabel);
      const res = await axios.post(`${API_URL}/api/upload/create-session`, {
        photoSlot: positionLabel
      });
      console.log('📱 Session created:', res.data);
      const { sessionId } = res.data;
      // Build QR URL from the current browser origin and pass API URL so the phone
      // knows where to send uploads regardless of frontend/backend domain setup
      const qrUrl = `${window.location.origin}/mobile-upload/${sessionId}?api=${encodeURIComponent(API_URL)}`;
      setPhoneSession(sessionId);
      setPhoneQrUrl(qrUrl);

      // Start polling for uploaded images
      if (pollRef.current) clearInterval(pollRef.current);
      let lastCount = 0;
      pollRef.current = setInterval(async () => {
        try {
          const pollRes = await axios.get(`${API_URL}/api/upload/session/${sessionId}`);
          if (pollRes.data.images && pollRes.data.images.length > lastCount) {
            lastCount = pollRes.data.images.length;
            const latestImage = pollRes.data.images[pollRes.data.images.length - 1];

            // Phone upload now returns server URLs directly
            try {
              setUploading(true);
              const imageUrl = latestImage;

              // Use ref to get current step and update photos/step separately
              const step = currentStepRef.current;
              const posKey = PHOTO_POSITIONS[step]?.key;
              if (posKey) {
                setPhotos(prev => ({
                  ...prev,
                  [posKey]: imageUrl
                }));
              }

              if (step < PHOTO_POSITIONS.length - 1) {
                setCurrentStep(step + 1);
              } else {
                // All 4 photos received - close the QR session
                setPhoneQrUrl('');
                setPhoneSession(null);
                if (pollRef.current) {
                  clearInterval(pollRef.current);
                  pollRef.current = null;
                }
              }
            } catch (uploadErr) {
              setError('Failed to process phone photo. Please try again.');
            } finally {
              setUploading(false);
            }
          }
        } catch (err) {
          if (err.response?.status === 404) {
            clearInterval(pollRef.current);
            pollRef.current = null;
          }
        }
      }, 2000);
    } catch (err) {
      console.error('📱 Failed to create session:', err);
      setError('Failed to create upload session: ' + (err.response?.data?.message || err.message));
    } finally {
      setPhoneLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, phoneLoading]);

  const closePhoneUpload = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (phoneSession) {
      axios.delete(`${API_URL}/api/upload/session/${phoneSession}`).catch(() => {});
    }
    setPhoneSession(null);
    setPhoneQrUrl('');
  }, [phoneSession]);

  const handleSubmit = async () => {
    if (!allPhotosUploaded) {
      setError('Please upload all 4 photos before submitting');
      return;
    }

    setSubmitting(true);
    setError('');

    // Close any open phone session
    closePhoneUpload();

    try {
      const token = localStorage.getItem('token');
      const endpoint = type === 'pickup'
        ? `${API_URL}/api/bookings/${booking._id}/start-inspection`
        : `${API_URL}/api/bookings/${booking._id}/return-inspection`;

      const response = await axios.post(
        endpoint,
        { photos, notes },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.success) {
        onComplete(response.data);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to submit inspection');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="inspection-modal-overlay">
      <div className="inspection-modal">
        <div className="inspection-header">
          <h2>{type === 'pickup' ? 'Start Reservation' : 'Return Vehicle'}</h2>
          <p className="inspection-subtitle">
            {type === 'pickup'
              ? 'Take 4 photos of the vehicle before starting your trip'
              : 'Take 4 photos of the vehicle to complete your return'
            }
          </p>
        </div>

        <div className="inspection-vehicle-info">
          <strong>{booking.vehicle?.nickname || `${booking.vehicle?.year} ${booking.vehicle?.make} ${booking.vehicle?.model}`}</strong>
        </div>

        {/* Progress indicator */}
        <div className="inspection-progress">
          {PHOTO_POSITIONS.map((pos, index) => (
            <div
              key={pos.key}
              className={`progress-step ${photos[pos.key] ? 'completed' : ''} ${currentStep === index ? 'active' : ''}`}
              onClick={() => setCurrentStep(index)}
            >
              <div className="progress-dot">
                {photos[pos.key] ? '✓' : index + 1}
              </div>
              <span className="progress-label">{pos.label}</span>
            </div>
          ))}
        </div>

        {/* Photo capture area */}
        {!allPhotosUploaded && (
          <div className="inspection-capture">
            <div className="capture-instruction">
              <h3>{currentPosition.label}</h3>
              <p>{currentPosition.instruction}</p>
            </div>

            {/* Hidden canvas for photo capture */}
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {cameraOpen ? (
              /* Webcam viewfinder */
              <div className="inspection-camera-viewfinder">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="inspection-camera-video"
                />
                <div className="inspection-camera-controls">
                  <button
                    type="button"
                    className="inspection-camera-btn inspection-camera-switch"
                    onClick={switchCamera}
                    title="Switch camera"
                  >
                    🔄
                  </button>
                  <button
                    type="button"
                    className="inspection-camera-btn inspection-camera-capture"
                    onClick={capturePhoto}
                    disabled={uploading}
                    title="Take photo"
                  >
                    <span className="inspection-capture-circle"></span>
                  </button>
                  <button
                    type="button"
                    className="inspection-camera-btn inspection-camera-close"
                    onClick={stopCamera}
                    title="Close camera"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ) : phoneQrUrl ? (
              /* QR Code for phone upload - stays open for all photos */
              <div className="inspection-phone-qr">
                <p className="inspection-qr-title">Scan with your phone to upload</p>
                <div className="inspection-qr-wrapper">
                  <QRCodeSVG
                    value={phoneQrUrl}
                    size={180}
                    bgColor="#ffffff"
                    fgColor="#000000"
                    level="M"
                  />
                </div>
                <p className="inspection-qr-hint">
                  Upload photos from your phone. They will fill in automatically.
                  <br />
                  <strong>{Object.values(photos).filter(p => p !== null).length} of 4 photos received</strong>
                </p>
                {uploading && (
                  <div className="inspection-qr-receiving">
                    Processing photo from phone...
                  </div>
                )}
                <button
                  className="btn btn-secondary"
                  onClick={closePhoneUpload}
                  style={{ marginTop: '0.75rem', width: '100%' }}
                >
                  Close QR Code
                </button>
              </div>
            ) : photos[currentPosition.key] ? (
              <div className="photo-preview">
                <img src={resolveImageUrl(photos[currentPosition.key])} alt={currentPosition.label} />
                <button
                  className="btn btn-secondary retake-btn"
                  onClick={() => handleRetakePhoto(currentPosition.key)}
                >
                  Retake Photo
                </button>
              </div>
            ) : (
              <div className="capture-area">
                {/* File input for gallery selection */}
                <input
                  key={`gallery-${inputKey}`}
                  type="file"
                  accept="image/*"
                  ref={galleryInputRef}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <div className="inspection-upload-options">
                  <button
                    className="inspection-upload-btn inspection-upload-btn--camera"
                    onClick={handleCameraCapture}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <span>Uploading...</span>
                    ) : (
                      <>
                        <span className="upload-btn-icon">📷</span>
                        <span>Use Camera</span>
                      </>
                    )}
                  </button>
                  <button
                    className="inspection-upload-btn inspection-upload-btn--computer"
                    onClick={handleGalleryPick}
                    disabled={uploading}
                  >
                    <span className="upload-btn-icon">📁</span>
                    <span>Take Photo or Choose File</span>
                  </button>
                </div>
                <button
                  className="inspection-upload-btn inspection-upload-btn--phone"
                  onClick={startPhoneUpload}
                  disabled={uploading || phoneLoading}
                >
                  {phoneLoading ? (
                    <span>Loading...</span>
                  ) : (
                    <>
                      <span className="upload-btn-icon">📱</span>
                      <span>Scan QR — use another phone</span>
                    </>
                  )}
                </button>
                <p className="inspection-upload-hint">
                  Use your camera, take a photo or choose a file, or scan the QR code to upload from another phone (Max 5MB, auto-compressed)
                </p>
              </div>
            )}
          </div>
        )}

        {error && <div className="inspection-error">{error}</div>}

        {/* Photo thumbnails */}
        <div className="inspection-thumbnails">
          {PHOTO_POSITIONS.map((pos) => (
            <div
              key={pos.key}
              className={`thumbnail ${photos[pos.key] ? 'has-photo' : ''} ${currentStep === PHOTO_POSITIONS.findIndex(p => p.key === pos.key) ? 'active' : ''}`}
              onClick={() => setCurrentStep(PHOTO_POSITIONS.findIndex(p => p.key === pos.key))}
            >
              {photos[pos.key] ? (
                <img src={resolveImageUrl(photos[pos.key])} alt={pos.label} />
              ) : (
                <div className="thumbnail-placeholder">
                  <span className="camera-icon">📷</span>
                </div>
              )}
              <span className="thumbnail-label">{pos.label}</span>
            </div>
          ))}
        </div>

        {/* Notes section */}
        {allPhotosUploaded && (
          <div className="inspection-notes">
            <label>Additional Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Note any existing damage or concerns..."
              rows={3}
            />
          </div>
        )}

        {/* Actions */}
        <div className="inspection-actions">
          <button
            className="btn btn-secondary"
            onClick={() => {
              closePhoneUpload();
              onCancel();
            }}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            className="btn btn-primary"
            onClick={handleSubmit}
            disabled={!allPhotosUploaded || submitting}
          >
            {submitting
              ? 'Submitting...'
              : type === 'pickup'
                ? 'Start Reservation'
                : 'Complete Return'
            }
          </button>
        </div>
      </div>
    </div>
  );
};

export default VehicleInspection;
