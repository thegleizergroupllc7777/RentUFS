import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import { vehicleModels } from '../../data/vehicleModels';
import { getFeaturesByCategory } from '../../data/vehicleFeatures';
import API_URL from '../../config/api';
import './Host.css';

const BRANDS = [
  'Acura', 'Alfa Romeo', 'Audi', 'BMW', 'Buick', 'Cadillac', 'Chevrolet',
  'Chrysler', 'Dodge', 'Ferrari', 'Fiat', 'Ford', 'Genesis', 'GMC', 'Honda',
  'Hyundai', 'Infiniti', 'Jaguar', 'Jeep', 'Kia', 'Lamborghini', 'Land Rover',
  'Lexus', 'Lincoln', 'Maserati', 'Mazda', 'McLaren', 'Mercedes-Benz', 'Mini',
  'Mitsubishi', 'Nissan', 'Porsche', 'Ram', 'Rivian', 'Rolls-Royce', 'Subaru',
  'Tesla', 'Toyota', 'Volkswagen', 'Volvo'
];

const matchBrand = (decodedMake) => {
  if (!decodedMake) return '';
  const lower = decodedMake.toLowerCase().trim();
  return BRANDS.find(b => b.toLowerCase() === lower) || '';
};

const AddVehicle = () => {
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: new Date().getFullYear(),
    vin: '',
    type: 'sedan',
    transmission: 'automatic',
    seats: 5,
    description: '',
    features: [],
    pricePerDay: '',
    pricePerWeek: '',
    pricePerMonth: '',
    images: [],
    registrationImage: '',
    registrationExpiration: '',
    location: {
      address: '',
      city: '',
      state: '',
      zipCode: ''
    }
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState({});
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [zipLoading, setZipLoading] = useState(false);

  const handleZipLookup = async (zip) => {
    if (!/^\d{5}$/.test(zip)) return;
    setZipLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/vehicles/lookup-zip/${zip}`);
      setFormData(prev => ({
        ...prev,
        location: {
          ...prev.location,
          city: response.data.city,
          state: response.data.state
        }
      }));
    } catch (err) {
      // Silently fail - user can still type manually
    } finally {
      setZipLoading(false);
    }
  };

  const toggleCategory = (category) => {
    setExpandedCategories(prev => ({ ...prev, [category]: !prev[category] }));
  };

  const handleDecodeVin = async () => {
    const vin = formData.vin.trim().toUpperCase();
    if (vin.length !== 17) {
      setError('VIN must be exactly 17 characters');
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setVinLoading(true);
    setError('');

    try {
      const response = await axios.get(`${API_URL}/api/vehicles/decode-vin/${vin}`);
      const decoded = response.data;

      setFormData(prev => ({
        ...prev,
        vin: vin,
        make: matchBrand(decoded.make) || prev.make,
        model: decoded.model || prev.model,
        year: decoded.year || prev.year,
        type: decoded.type || prev.type,
        transmission: decoded.transmission || prev.transmission
      }));
      setVinDecoded(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to decode VIN. Please enter vehicle details manually.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setVinLoading(false);
    }
  };

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
    } else if (name === 'make') {
      // Reset model when brand changes
      setFormData({
        ...formData,
        make: value,
        model: ''
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
  };

  const handleFeatureToggle = (featureLabel) => {
    setFormData(prev => {
      const features = prev.features.includes(featureLabel)
        ? prev.features.filter(f => f !== featureLabel)
        : [...prev.features, featureLabel];
      return { ...prev, features };
    });
  };

  const featuresByCategory = getFeaturesByCategory();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate that at least 4 photos are uploaded
    if (!formData.images || formData.images.length < 4) {
      setError(`Please upload at least 4 photos (${formData.images?.length || 0} uploaded)`);
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
      const vehicleData = {
        ...formData,
        features: formData.features,
        images: formData.images.length > 0 ? formData.images : undefined,
        registrationImage: formData.registrationImage,
        pricePerWeek: formData.pricePerWeek !== '' ? formData.pricePerWeek : undefined,
        pricePerMonth: formData.pricePerMonth !== '' ? formData.pricePerMonth : undefined
      };

      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/vehicles`, vehicleData, {
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

                {/* VIN First - with decode button */}
                <div className="form-group">
                  <label className="form-label">VIN (Vehicle Identification Number) *</label>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <input
                      type="text"
                      name="vin"
                      className="form-input"
                      value={formData.vin}
                      onChange={(e) => {
                        handleChange(e);
                        setVinDecoded(false);
                      }}
                      placeholder="Enter 17-character VIN"
                      maxLength="17"
                      style={{ textTransform: 'uppercase', flex: 1 }}
                      required
                    />
                    <button
                      type="button"
                      onClick={handleDecodeVin}
                      disabled={vinLoading || formData.vin.length !== 17}
                      className="btn btn-primary"
                      style={{
                        whiteSpace: 'nowrap',
                        opacity: formData.vin.length !== 17 ? 0.5 : 1
                      }}
                    >
                      {vinLoading ? 'Decoding...' : 'Decode VIN'}
                    </button>
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Found on your dashboard or driver's door jamb. Enter VIN and click Decode to auto-fill vehicle details.
                  </p>
                  {vinDecoded && (
                    <div style={{
                      marginTop: '0.5rem',
                      padding: '0.75rem',
                      backgroundColor: '#d1fae5',
                      color: '#065f46',
                      borderRadius: '0.5rem',
                      border: '1px solid #10b981',
                      fontSize: '0.9rem'
                    }}>
                      VIN decoded successfully: {formData.year} {formData.make} {formData.model}. Please verify details below.
                    </div>
                  )}
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Make *</label>
                    <select
                      name="make"
                      className="form-select"
                      value={formData.make}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select a brand</option>
                      {BRANDS.map(brand => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Model *</label>
                    {vinDecoded && formData.model ? (
                      <input
                        type="text"
                        name="model"
                        className="form-input"
                        value={formData.model}
                        onChange={handleChange}
                        required
                      />
                    ) : (
                      <select
                        name="model"
                        className="form-select"
                        value={formData.model}
                        onChange={handleChange}
                        required
                        disabled={!formData.make}
                      >
                        <option value="">
                          {formData.make ? 'Select a model' : 'Select brand first'}
                        </option>
                        {formData.make && vehicleModels[formData.make]?.map(model => (
                          <option key={model} value={model}>{model}</option>
                        ))}
                      </select>
                    )}
                    {!formData.make && !vinDecoded && (
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Please select a brand first
                      </p>
                    )}
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

              </div>

              <div className="form-section">
                <h2 className="form-section-title">Vehicle Features</h2>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                  Select all features that apply to your vehicle
                </p>
                {formData.features.length > 0 && (
                  <div style={{
                    marginBottom: '1rem',
                    padding: '0.5rem 0.75rem',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '0.5rem',
                    border: '1px solid #bbf7d0',
                    fontSize: '0.85rem'
                  }}>
                    <strong style={{ color: '#166534' }}>{formData.features.length} selected:</strong>{' '}
                    <span style={{ color: '#15803d' }}>{formData.features.join(', ')}</span>
                  </div>
                )}

                {Object.entries(featuresByCategory).map(([category, features]) => {
                  const selectedCount = features.filter(f => formData.features.includes(f.label)).length;
                  const isExpanded = expandedCategories[category];
                  return (
                    <div key={category} style={{
                      marginBottom: '0.5rem',
                      border: '1px solid #e5e7eb',
                      borderRadius: '0.5rem',
                      overflow: 'hidden'
                    }}>
                      <button
                        type="button"
                        onClick={() => toggleCategory(category)}
                        style={{
                          width: '100%',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '0.75rem 1rem',
                          background: isExpanded ? '#f0fdf4' : '#f9fafb',
                          border: 'none',
                          cursor: 'pointer',
                          fontSize: '0.95rem',
                          fontWeight: '600',
                          color: '#374151'
                        }}
                      >
                        <span>{isExpanded ? '▼' : '▶'} {category}</span>
                        {selectedCount > 0 && (
                          <span style={{
                            backgroundColor: '#10b981',
                            color: 'white',
                            padding: '0.125rem 0.5rem',
                            borderRadius: '1rem',
                            fontSize: '0.75rem'
                          }}>
                            {selectedCount}
                          </span>
                        )}
                      </button>
                      {isExpanded && (
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                          gap: '0.375rem',
                          padding: '0.75rem 1rem'
                        }}>
                          {features.map(feature => (
                            <label
                              key={feature.id}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.375rem 0.5rem',
                                borderRadius: '0.375rem',
                                cursor: 'pointer',
                                backgroundColor: formData.features.includes(feature.label) ? '#d1fae5' : '#f9fafb',
                                border: formData.features.includes(feature.label) ? '1px solid #10b981' : '1px solid #e5e7eb',
                                transition: 'all 0.2s',
                                fontSize: '0.85rem'
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={formData.features.includes(feature.label)}
                                onChange={() => handleFeatureToggle(feature.label)}
                                style={{ accentColor: '#10b981' }}
                              />
                              <span style={{ color: '#374151' }}>{feature.label}</span>
                            </label>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Vehicle Photos</h2>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                  📸 Upload at least 4 photos of your vehicle
                </p>
                <p style={{ fontSize: '0.85rem', color: formData.images.length >= 4 ? '#10b981' : '#ef4444', marginBottom: '0.5rem', fontWeight: '500' }}>
                  {formData.images.length} / 4 minimum photos uploaded
                </p>
                {formData.images.length > 1 && (
                  <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1rem' }}>
                    Drag and drop photos to reorder. Photo #1 will be the main listing image.
                  </p>
                )}

                {/* Photo grid with drag-and-drop reorder */}
                {formData.images.length > 0 && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                    gap: '0.75rem',
                    marginBottom: '1rem'
                  }}>
                    {formData.images.map((img, idx) => (
                      <div
                        key={img}
                        draggable
                        onDragStart={(e) => {
                          setDragIndex(idx);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          setDragOverIndex(idx);
                        }}
                        onDragLeave={() => setDragOverIndex(null)}
                        onDrop={(e) => {
                          e.preventDefault();
                          if (dragIndex === null || dragIndex === idx) return;
                          setFormData(prev => {
                            const newImages = [...prev.images];
                            const [moved] = newImages.splice(dragIndex, 1);
                            newImages.splice(idx, 0, moved);
                            return { ...prev, images: newImages };
                          });
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        onDragEnd={() => {
                          setDragIndex(null);
                          setDragOverIndex(null);
                        }}
                        style={{
                          position: 'relative',
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                          border: dragOverIndex === idx ? '2px solid #10b981' : '2px solid #333',
                          aspectRatio: '4/3',
                          cursor: 'grab',
                          opacity: dragIndex === idx ? 0.4 : 1,
                          transform: dragOverIndex === idx ? 'scale(1.03)' : 'none',
                          transition: 'border 0.2s, opacity 0.2s, transform 0.2s'
                        }}
                      >
                        <img src={img} alt={`Vehicle photo ${idx + 1}`} style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                          pointerEvents: 'none'
                        }} />
                        <button
                          type="button"
                          onClick={() => {
                            setFormData(prev => ({
                              ...prev,
                              images: prev.images.filter((_, i) => i !== idx)
                            }));
                          }}
                          style={{
                            position: 'absolute',
                            top: '4px',
                            right: '4px',
                            background: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '50%',
                            width: '24px',
                            height: '24px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '14px',
                            fontWeight: 'bold'
                          }}
                        >
                          X
                        </button>
                        <div style={{
                          position: 'absolute',
                          bottom: '4px',
                          left: '4px',
                          background: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontSize: '0.75rem'
                        }}>
                          {idx + 1}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add photo using ImageUpload (camera, computer, phone) */}
                <ImageUpload
                  label="Add Vehicle Photos"
                  value=""
                  onChange={(url) => {
                    if (url) {
                      setFormData(prev => {
                        // Avoid duplicates from polling
                        if (prev.images.includes(url)) return prev;
                        return { ...prev, images: [...prev.images, url] };
                      });
                      setError('');
                    }
                  }}
                  required={false}
                />

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

                <div className="form-group" style={{ marginTop: '1rem' }}>
                  <label className="form-label">Registration Expiration Date *</label>
                  <input
                    type="date"
                    name="registrationExpiration"
                    className="form-input"
                    value={formData.registrationExpiration}
                    onChange={handleChange}
                    required
                  />
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    You will receive an email reminder 30 days before expiration
                  </p>
                </div>
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
                    placeholder="Street address (optional)"
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

                  <div className="form-group">
                    <label className="form-label">Zip Code *</label>
                    <input
                      type="text"
                      name="location.zipCode"
                      className="form-input"
                      value={formData.location.zipCode}
                      onChange={(e) => {
                        handleChange(e);
                        handleZipLookup(e.target.value.trim());
                      }}
                      placeholder="Auto-fills city & state"
                      maxLength="5"
                      required
                    />
                    {zipLoading && (
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Looking up city and state...
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Pricing</h2>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                  💵 Set your rental rates - at least the daily rate is required
                </p>

                <div className="form-group">
                  <label className="form-label">Price Per Day ($) *</label>
                  <input
                    type="number"
                    name="pricePerDay"
                    className="form-input"
                    value={formData.pricePerDay}
                    onChange={handleChange}
                    min="1"
                    step="0.01"
                    placeholder="e.g., 50"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Price Per Week ($)</label>
                  <input
                    type="number"
                    name="pricePerWeek"
                    className="form-input"
                    value={formData.pricePerWeek}
                    onChange={handleChange}
                    min="1"
                    step="0.01"
                    placeholder="e.g., 300 (optional - usually discounted)"
                  />
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Leave blank if you don't offer weekly rentals
                  </p>
                </div>

                <div className="form-group">
                  <label className="form-label">Price Per Month ($)</label>
                  <input
                    type="number"
                    name="pricePerMonth"
                    className="form-input"
                    value={formData.pricePerMonth}
                    onChange={handleChange}
                    min="1"
                    step="0.01"
                    placeholder="e.g., 1000 (optional - usually discounted)"
                  />
                  <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                    Leave blank if you don't offer monthly rentals
                  </p>
                </div>
              </div>

              {error && (
                <div className="error-message" style={{ marginBottom: '1rem' }}>
                  {error}
                </div>
              )}

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
