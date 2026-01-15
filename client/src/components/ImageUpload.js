import React, { useState, useRef } from 'react';
import './ImageUpload.css';

const ImageUpload = ({ label, value, onChange, required = false }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

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

      // Clear file inputs
      if (cameraInputRef.current) cameraInputRef.current.value = '';
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

  const handleClear = () => {
    onChange('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    if (cameraInputRef.current) {
      cameraInputRef.current.value = '';
    }
  };

  return (
    <div className="image-upload-container">
      <label className="form-label">
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>

      <div className="file-upload-section">
        {/* Camera input for mobile devices */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id={`camera-input-${label}`}
        />

        {/* File browser input for computer */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id={`file-input-${label}`}
        />

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label htmlFor={`camera-input-${label}`} className="file-upload-btn" style={{ flex: '1', minWidth: '140px' }}>
            {uploading ? (
              <span>📤 Uploading...</span>
            ) : value ? (
              <span>📷 Take New Photo</span>
            ) : (
              <span>📷 Use Camera</span>
            )}
          </label>

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
