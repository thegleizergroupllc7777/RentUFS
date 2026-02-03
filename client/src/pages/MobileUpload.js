import React, { useState, useRef, useMemo } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import API_URL from '../config/api';

const MobileUpload = () => {
  const { sessionId } = useParams();
  const [searchParams] = useSearchParams();
  // Use the API URL passed via QR code query param if available, otherwise fall back to config
  const uploadApiUrl = useMemo(() => {
    const paramApi = searchParams.get('api');
    return paramApi ? decodeURIComponent(paramApi) : API_URL;
  }, [searchParams]);
  const [uploading, setUploading] = useState(false);
  const [uploaded, setUploaded] = useState(0);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    // Validate all files first
    const invalidFile = files.find(f => !f.type.startsWith('image/'));
    if (invalidFile) {
      setError('Please select only image files');
      return;
    }

    const oversizedFile = files.find(f => f.size > 5 * 1024 * 1024);
    if (oversizedFile) {
      setError(`"${oversizedFile.name}" is over 5MB. Please select smaller images.`);
      return;
    }

    setUploading(true);
    setError('');

    let successCount = 0;
    let lastError = null;

    // Upload files one at a time to avoid overwhelming the server
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append('image', file);

        const res = await axios.post(
          `${uploadApiUrl}/api/upload/mobile/${sessionId}`,
          formData,
          { headers: { 'Content-Type': 'multipart/form-data' } }
        );

        successCount++;
        setUploaded(res.data.count);
      } catch (err) {
        if (err.response?.status === 404) {
          lastError = 'Session expired. Please generate a new QR code on your computer.';
          break; // Stop uploading if session expired
        } else {
          lastError = `Failed to upload "${file.name}". ${files.length > 1 ? `${successCount} of ${files.length} uploaded.` : 'Please try again.'}`;
        }
      }
    }

    if (lastError) {
      setError(lastError);
    }

    // Clear inputs
    if (fileInputRef.current) fileInputRef.current.value = '';
    if (cameraInputRef.current) cameraInputRef.current.value = '';
    setUploading(false);
  };

  if (done) {
    return (
      <div style={styles.container}>
        <div style={styles.card}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>✅</div>
          <h2 style={styles.title}>All Done!</h2>
          <p style={styles.subtitle}>
            Your photos have been sent to your computer. You can close this page.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.logo}>RentUFS</h1>
        <h2 style={styles.title}>Upload Vehicle Photos</h2>
        <p style={styles.subtitle}>
          Take a photo or choose from your gallery. Photos will appear on your computer automatically.
        </p>

        {uploaded > 0 && (
          <div style={styles.successBanner}>
            ✅ {uploaded} photo{uploaded !== 1 ? 's' : ''} uploaded
          </div>
        )}

        {error && (
          <div style={styles.errorBanner}>
            ❌ {error}
          </div>
        )}

        {/* Hidden inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleUpload}
          style={{ display: 'none' }}
          id="camera-input"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleUpload}
          style={{ display: 'none' }}
          id="gallery-input"
        />

        <div style={styles.buttonGroup}>
          <label htmlFor="camera-input" style={{
            ...styles.button,
            ...styles.cameraButton,
            opacity: uploading ? 0.6 : 1,
            pointerEvents: uploading ? 'none' : 'auto'
          }}>
            {uploading ? '📤 Uploading...' : '📷 Take Photo'}
          </label>

          <label htmlFor="gallery-input" style={{
            ...styles.button,
            ...styles.galleryButton,
            opacity: uploading ? 0.6 : 1,
            pointerEvents: uploading ? 'none' : 'auto'
          }}>
            {uploading ? '📤 Uploading...' : '🖼️ Select Photos'}
          </label>
        </div>

        {uploaded > 0 && (
          <button
            onClick={() => setDone(true)}
            style={{ ...styles.button, ...styles.doneButton, marginTop: '1.5rem' }}
          >
            ✓ Done Uploading
          </button>
        )}

        <p style={styles.hint}>
          Select multiple photos at once from your gallery, or take them one at a time with the camera.
        </p>
      </div>
    </div>
  );
};

const styles = {
  container: {
    minHeight: '100vh',
    background: '#000',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
  },
  card: {
    background: '#111',
    borderRadius: '16px',
    padding: '2rem',
    maxWidth: '400px',
    width: '100%',
    textAlign: 'center',
    border: '1px solid #222'
  },
  logo: {
    color: '#10b981',
    fontSize: '1.5rem',
    fontWeight: 700,
    marginBottom: '0.5rem'
  },
  title: {
    color: '#fff',
    fontSize: '1.25rem',
    fontWeight: 600,
    marginBottom: '0.5rem'
  },
  subtitle: {
    color: '#9ca3af',
    fontSize: '0.9rem',
    marginBottom: '1.5rem',
    lineHeight: 1.5
  },
  buttonGroup: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem'
  },
  button: {
    display: 'block',
    width: '100%',
    padding: '1rem',
    borderRadius: '12px',
    border: 'none',
    fontSize: '1.1rem',
    fontWeight: 600,
    cursor: 'pointer',
    textAlign: 'center',
    textDecoration: 'none',
    boxSizing: 'border-box'
  },
  cameraButton: {
    background: '#10b981',
    color: '#fff'
  },
  galleryButton: {
    background: '#1f2937',
    color: '#fff',
    border: '1px solid #374151'
  },
  doneButton: {
    background: '#3b82f6',
    color: '#fff'
  },
  successBanner: {
    background: '#064e3b',
    color: '#6ee7b7',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.95rem',
    fontWeight: 500
  },
  errorBanner: {
    background: '#7f1d1d',
    color: '#fca5a5',
    padding: '0.75rem',
    borderRadius: '8px',
    marginBottom: '1rem',
    fontSize: '0.95rem'
  },
  hint: {
    color: '#6b7280',
    fontSize: '0.8rem',
    marginTop: '1.5rem',
    lineHeight: 1.4
  }
};

export default MobileUpload;
