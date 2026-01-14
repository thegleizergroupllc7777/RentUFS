import React, { useState, useRef } from 'react';
import axios from 'axios';
import './ImageUpload.css';

const ImageUpload = ({ label, value, onChange, required = false }) => {
  const [uploading, setUploading] = useState(false);
  const cameraInputRef = useRef(null);
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      alert('Image size must be less than 5MB');
      return;
    }

    setUploading(true);

    try {
      const formData = new FormData();
      formData.append('image', file);

      const token = localStorage.getItem('token');
      const response = await axios.post('/api/upload/image', formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.data.success) {
        // Convert relative path to full URL
        const imageUrl = `${window.location.origin}${response.data.imageUrl}`;
        console.log(`Image uploaded successfully for ${label}:`, imageUrl);
        onChange(imageUrl);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload image. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    onChange('');
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
              <span>📷 Take Photo</span>
            )}
          </label>

          <label htmlFor={`file-input-${label}`} className="file-upload-btn" style={{ flex: '1', minWidth: '140px' }}>
            {uploading ? (
              <span>📤 Uploading...</span>
            ) : value ? (
              <span>💻 Choose Different</span>
            ) : (
              <span>💻 Choose File</span>
            )}
          </label>
        </div>

        <p className="upload-hint">
          Take a photo with camera or choose from your device (Max 5MB)
        </p>
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
