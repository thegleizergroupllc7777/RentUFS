import React, { useState, useRef } from 'react';
import axios from 'axios';
import './ImageUpload.css';

const ImageUpload = ({ label, value, onChange, required = false }) => {
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const cameraInputRef = useRef(null);
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
      console.log('File details:', { name: file.name, size: file.size, type: file.type });

      const formData = new FormData();
      formData.append('image', file);

      const response = await axios.post('/api/upload/image', formData, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('📦 Full response object:', response);
      console.log('📊 Response status:', response.status);
      console.log('📄 Response data:', JSON.stringify(response.data));
      console.log('✓ Response data.success:', response.data.success, '(type:', typeof response.data.success, ')');
      console.log('🔗 Response data.imageUrl:', response.data.imageUrl);

      // Check for authentication/authorization errors first
      if (response.status === 401 || response.status === 403) {
        throw new Error('Please log in to upload images. Your session may have expired.');
      }

      // More flexible validation - check if response looks successful
      const hasSuccessField = response.data && (
        response.data.success === true ||
        response.data.success === 'true' ||
        response.data.success === 1
      );
      const hasImageUrl = response.data && response.data.imageUrl;
      const isStatusOk = response.status === 200 || response.status === 201;

      console.log('🔍 Validation checks:');
      console.log('  - Status OK (200/201)?', isStatusOk);
      console.log('  - Has success field?', hasSuccessField);
      console.log('  - Has imageUrl?', hasImageUrl);

      // Accept if status is OK and we have an imageUrl (even if success field is missing/wrong type)
      if (isStatusOk && hasImageUrl) {
        // Convert relative path to full URL
        const imageUrl = `${window.location.origin}${response.data.imageUrl}`;
        console.log(`✅ Image uploaded successfully for ${label}:`, imageUrl);
        onChange(imageUrl);
        setUploadError('');

        // Clear file inputs
        if (cameraInputRef.current) cameraInputRef.current.value = '';
        if (fileInputRef.current) fileInputRef.current.value = '';
      } else {
        console.error('❌ Response validation failed!');
        console.error('Full response:', JSON.stringify(response, null, 2));

        const errorDetails = [];
        if (!isStatusOk) errorDetails.push(`Status: ${response.status}`);
        if (!hasSuccessField) errorDetails.push(`Success field invalid: ${response.data?.success}`);
        if (!hasImageUrl) errorDetails.push('No imageUrl in response');

        throw new Error(response.data?.message || `Upload failed: ${errorDetails.join(', ')}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      console.error('Error response:', error.response);
      console.error('Error message:', error.message);

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
          Use camera or select from your computer (Max 5MB)
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
