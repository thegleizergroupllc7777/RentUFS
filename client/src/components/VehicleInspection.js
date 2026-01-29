import React, { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import axios from 'axios';
import API_URL from '../config/api';
import './VehicleInspection.css';

const PHOTO_POSITIONS = [
  { key: 'frontView', label: 'Front View', instruction: 'Take a photo of the front of the vehicle' },
  { key: 'backView', label: 'Back View', instruction: 'Take a photo of the back of the vehicle' },
  { key: 'leftSide', label: 'Left Side', instruction: 'Take a photo of the left side of the vehicle' },
  { key: 'rightSide', label: 'Right Side', instruction: 'Take a photo of the right side of the vehicle' }
];

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
  const fileInputRef = useRef(null);

  // Phone upload state
  const [phoneSession, setPhoneSession] = useState(null);
  const [phoneQrUrl, setPhoneQrUrl] = useState('');
  const pollRef = useRef(null);

  const currentPosition = PHOTO_POSITIONS[currentStep];
  const allPhotosUploaded = Object.values(photos).every(photo => photo !== null);

  // Clean up polling on unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

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
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    // Validate file size (max 5MB to match server limit)
    if (file.size > 5 * 1024 * 1024) {
      setError('Image size must be less than 5MB');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');

      // Create FormData for proper file upload
      const formData = new FormData();
      formData.append('image', file);

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

      setPhotos(prev => ({
        ...prev,
        [currentPosition.key]: imageUrl
      }));

      // Auto-advance to next step if not on last photo
      if (currentStep < PHOTO_POSITIONS.length - 1) {
        setTimeout(() => setCurrentStep(currentStep + 1), 500);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
    }

    // Reset file input
    e.target.value = '';
  };

  const handleCameraCapture = () => {
    fileInputRef.current?.click();
  };

  const handleRetakePhoto = (key) => {
    const stepIndex = PHOTO_POSITIONS.findIndex(p => p.key === key);
    setCurrentStep(stepIndex);
    setPhotos(prev => ({ ...prev, [key]: null }));
  };

  // Phone upload: create session and show QR code
  const startPhoneUpload = useCallback(async () => {
    setError('');
    try {
      const positionLabel = PHOTO_POSITIONS[currentStep]?.label || 'Inspection Photo';
      const res = await axios.post(`${API_URL}/api/upload/create-session`, {
        photoSlot: positionLabel
      });
      const { sessionId, qrUrl } = res.data;
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
            const latestBase64 = pollRes.data.images[pollRes.data.images.length - 1];

            // Convert base64 from phone to a server file URL
            try {
              setUploading(true);
              const imageUrl = await uploadBase64AsFile(latestBase64);

              setPhotos(prev => ({
                ...prev,
                [PHOTO_POSITIONS[currentStep]?.key]: imageUrl
              }));

              // Auto-advance after receiving photo
              setCurrentStep(prev => {
                if (prev < PHOTO_POSITIONS.length - 1) {
                  return prev + 1;
                }
                return prev;
              });
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
      setError('Failed to create upload session. Please try again.');
    }
  }, [currentStep]);

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
          <strong>{booking.vehicle?.year} {booking.vehicle?.make} {booking.vehicle?.model}</strong>
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

            {photos[currentPosition.key] ? (
              <div className="photo-preview">
                <img src={photos[currentPosition.key]} alt={currentPosition.label} />
                <button
                  className="btn btn-secondary retake-btn"
                  onClick={() => handleRetakePhoto(currentPosition.key)}
                >
                  Retake Photo
                </button>
              </div>
            ) : phoneQrUrl ? (
              /* QR Code for phone upload */
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
                  Open your phone's camera and point it at this QR code.
                  Photos you take will appear here automatically.
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
            ) : (
              <div className="capture-area">
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  ref={fileInputRef}
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />
                <div className="inspection-upload-options">
                  <button
                    className="capture-button"
                    onClick={handleCameraCapture}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <span className="uploading">Uploading...</span>
                    ) : (
                      <>
                        <span className="camera-icon">📷</span>
                        <span>Take Photo</span>
                      </>
                    )}
                  </button>
                  <button
                    className="inspection-phone-btn"
                    onClick={startPhoneUpload}
                    disabled={uploading}
                  >
                    <span className="phone-icon">📱</span>
                    <span>Upload from Phone</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Photo thumbnails */}
        <div className="inspection-thumbnails">
          {PHOTO_POSITIONS.map((pos) => (
            <div
              key={pos.key}
              className={`thumbnail ${photos[pos.key] ? 'has-photo' : ''} ${currentStep === PHOTO_POSITIONS.findIndex(p => p.key === pos.key) ? 'active' : ''}`}
              onClick={() => setCurrentStep(PHOTO_POSITIONS.findIndex(p => p.key === pos.key))}
            >
              {photos[pos.key] ? (
                <img src={photos[pos.key]} alt={pos.label} />
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

        {error && <div className="inspection-error">{error}</div>}

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
