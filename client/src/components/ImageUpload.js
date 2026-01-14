import React, { useState, useRef } from 'react';
import axios from 'axios';
import './ImageUpload.css';

const ImageUpload = ({ label, value, onChange, required = false }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileInputRef = useRef(null);

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadError(''); // Clear previous errors

    // Validate file type
    if (!file.type.startsWith('image/')) {
      const errorMsg = 'Please select an image file (JPG, PNG, etc.)';
      setUploadError(errorMsg);
      alert(errorMsg);
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      const errorMsg = 'Image size must be less than 5MB';
      setUploadError(errorMsg);
      alert(errorMsg);
      return;
    }

    setUploading(true);

    try {
      const token = localStorage.getItem('token');

      if (!token) {
        throw new Error('You must be logged in to upload images. Please log in and try again.');
      }

      console.log(`Starting upload for ${label}...`);

      const formData = new FormData();
      formData.append('image', file);

      const response = await axios.post('/api/upload/image', formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('Upload response:', response.data);

      if (response.data.success) {
        // Convert relative path to full URL
        const imageUrl = `${window.location.origin}${response.data.imageUrl}`;
        console.log(`✅ Image uploaded successfully for ${label}:`, imageUrl);
        onChange(imageUrl);
        setUploadError('');
      } else {
        throw new Error('Upload failed - no success response');
      }
    } catch (error) {
      console.error('Upload error details:', error);
      const errorMsg = error.response?.data?.message || error.message || 'Failed to upload image. Please try again.';
      setUploadError(errorMsg);
      alert(`Upload failed: ${errorMsg}`);
    } finally {
      setUploading(false);
    }
  };

  const handleClear = () => {
    onChange('');
    setUploadError('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="image-upload-container">
      <label className="form-label">
        {label} {required && <span style={{ color: '#ef4444' }}>*</span>}
      </label>

      <div className="file-upload-section">
        {/* Single file input that works for both camera and file selection */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
          id={`file-input-${label}`}
        />

        <label htmlFor={`file-input-${label}`} className="file-upload-btn" style={{ width: '100%' }}>
          {uploading ? (
            <span>📤 Uploading...</span>
          ) : value ? (
            <span>✅ Change Photo</span>
          ) : (
            <span>📸 Choose Photo</span>
          )}
        </label>

        <p className="upload-hint">
          Select a photo from your device or camera (Max 5MB)
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
