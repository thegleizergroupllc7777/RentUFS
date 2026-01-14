import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import './Host.css';

const AddVehicle = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    type: 'sedan',
    transmission: 'automatic',
    seats: 5,
    description: '',
    features: '',
    pricePerDay: '',
    image1: '',
    image2: '',
    image3: '',
    image4: '',
    registrationImage: '',
    location: {
      address: '',
      city: '',
      state: '',
      zipCode: ''
    }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    const { name, value } = e.target;

    if (name.startsWith('location.')) {
      const locationField = name.split('.')[1];
      setFormData({
        ...formData,
        location: {
          ...formData.location,
          [locationField]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Debug: Log current form state
    console.log('Form submission - Current state:', {
      image1: formData.image1,
      image2: formData.image2,
      image3: formData.image3,
      image4: formData.image4,
      registrationImage: formData.registrationImage
    });

    // Validate that at least Photo 1 is uploaded
    if (!formData.image1 || formData.image1.trim() === '') {
      console.log('Validation failed: Photo 1 is missing');
      setError('Please upload at least one photo (Photo 1 is required)');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate that registration image is uploaded
    if (!formData.registrationImage || formData.registrationImage.trim() === '') {
      console.log('Validation failed: Registration image is missing');
      setError('Vehicle registration photo is required');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      // Prepare images array from individual image fields
      const images = [
        formData.image1,
        formData.image2,
        formData.image3,
        formData.image4
      ].filter(img => img && img.trim() !== ''); // Only include non-empty image URLs

      const vehicleData = {
        ...formData,
        features: formData.features.split(',').map(f => f.trim()).filter(f => f),
        images: images.length > 0 ? images : undefined,
        registrationImage: formData.registrationImage
      };

      // Remove image fields from formData before sending
      delete vehicleData.image1;
      delete vehicleData.image2;
      delete vehicleData.image3;
      delete vehicleData.image4;

      const token = localStorage.getItem('token');
      await axios.post('/api/vehicles', vehicleData, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      // Success! Navigate to dashboard
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to add vehicle. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="form-container">
            <h1 className="page-title">List a New Vehicle</h1>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit} className="vehicle-form">
              <div className="form-section">
                <h2 className="form-section-title">Vehicle Details</h2>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Make *</label>
                    <input
                      type="text"
                      name="make"
                      className="form-input"
                      value={formData.make}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Model *</label>
                    <input
                      type="text"
                      name="model"
                      className="form-input"
                      value={formData.model}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Year *</label>
                    <input
                      type="number"
                      name="year"
                      className="form-input"
                      value={formData.year}
                      onChange={handleChange}
                      min="1900"
                      max={new Date().getFullYear() + 1}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Vehicle Type *</label>
                    <select
                      name="type"
                      className="form-select"
                      value={formData.type}
                      onChange={handleChange}
                      required
                    >
                      <option value="sedan">Sedan</option>
                      <option value="suv">SUV</option>
                      <option value="truck">Truck</option>
                      <option value="van">Van</option>
                      <option value="convertible">Convertible</option>
                      <option value="coupe">Coupe</option>
                      <option value="wagon">Wagon</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Transmission *</label>
                    <select
                      name="transmission"
                      className="form-select"
                      value={formData.transmission}
                      onChange={handleChange}
                      required
                    >
                      <option value="automatic">Automatic</option>
                      <option value="manual">Manual</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Seats *</label>
                    <input
                      type="number"
                      name="seats"
                      className="form-input"
                      value={formData.seats}
                      onChange={handleChange}
                      min="1"
                      max="15"
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Description *</label>
                  <textarea
                    name="description"
                    className="form-textarea"
                    value={formData.description}
                    onChange={handleChange}
                    placeholder="Describe your vehicle..."
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Features (comma-separated)</label>
                  <input
                    type="text"
                    name="features"
                    className="form-input"
                    value={formData.features}
                    onChange={handleChange}
                    placeholder="Bluetooth, Backup Camera, GPS, etc."
                  />
                </div>
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Vehicle Photos</h2>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                  📸 Upload photos from your device
                </p>

                <ImageUpload
                  label="Photo 1"
                  value={formData.image1}
                  onChange={(url) => {
                    console.log('Photo 1 onChange called with:', url);
                    setFormData(prev => {
                      const newState = { ...prev, image1: url };
                      console.log('Photo 1 - New state:', newState);
                      return newState;
                    });
                    setError(''); // Clear error when photo is uploaded
                  }}
                  required={true}
                />

                <ImageUpload
                  label="Photo 2"
                  value={formData.image2}
                  onChange={(url) => {
                    setFormData(prev => ({ ...prev, image2: url }));
                    setError('');
                  }}
                  required={false}
                />

                <ImageUpload
                  label="Photo 3"
                  value={formData.image3}
                  onChange={(url) => {
                    setFormData(prev => ({ ...prev, image3: url }));
                    setError('');
                  }}
                  required={false}
                />

                <ImageUpload
                  label="Photo 4"
                  value={formData.image4}
                  onChange={(url) => {
                    setFormData(prev => ({ ...prev, image4: url }));
                    setError('');
                  }}
                  required={false}
                />

                {/* Photo upload status indicator */}
                {formData.image1 && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    backgroundColor: '#d1fae5',
                    color: '#065f46',
                    borderRadius: '0.5rem',
                    border: '1px solid #10b981'
                  }}>
                    ✅ Photo 1 uploaded successfully
                  </div>
                )}
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Vehicle Registration</h2>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                  📄 Upload a photo of your vehicle registration document for verification
                </p>

                <ImageUpload
                  label="Registration Document"
                  value={formData.registrationImage}
                  onChange={(url) => {
                    console.log('Registration image onChange called with:', url);
                    setFormData(prev => ({ ...prev, registrationImage: url }));
                    setError('');
                  }}
                  required={true}
                />

                {/* Registration upload status indicator */}
                {formData.registrationImage && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    backgroundColor: '#d1fae5',
                    color: '#065f46',
                    borderRadius: '0.5rem',
                    border: '1px solid #10b981'
                  }}>
                    ✅ Registration document uploaded successfully
                  </div>
                )}
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Location</h2>

                <div className="form-group">
                  <label className="form-label">Address</label>
                  <input
                    type="text"
                    name="location.address"
                    className="form-input"
                    value={formData.location.address}
                    onChange={handleChange}
                  />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">City *</label>
                    <input
                      type="text"
                      name="location.city"
                      className="form-input"
                      value={formData.location.city}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">State *</label>
                    <input
                      type="text"
                      name="location.state"
                      className="form-input"
                      value={formData.location.state}
                      onChange={handleChange}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Zip Code</label>
                  <input
                    type="text"
                    name="location.zipCode"
                    className="form-input"
                    value={formData.location.zipCode}
                    onChange={handleChange}
                  />
                </div>
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Pricing</h2>

                <div className="form-group">
                  <label className="form-label">Price Per Day ($) *</label>
                  <input
                    type="number"
                    name="pricePerDay"
                    className="form-input"
                    value={formData.pricePerDay}
                    onChange={handleChange}
                    min="1"
                    required
                  />
                </div>
              </div>

              <div className="form-actions">
                <button
                  type="button"
                  onClick={() => navigate('/host/dashboard')}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={loading}
                >
                  {loading ? 'Adding Vehicle...' : 'Add Vehicle'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AddVehicle;
