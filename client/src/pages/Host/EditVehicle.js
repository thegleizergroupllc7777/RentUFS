import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ImageUpload, { resolveImageUrl } from '../../components/ImageUpload';
import AddressAutocomplete from '../../components/AddressAutocomplete';
import { vehicleModels } from '../../data/vehicleModels';
import { getFeaturesByCategory } from '../../data/vehicleFeatures';
import API_URL from '../../config/api';
import './Host.css';

// Upload a base64 image to the server and return the URL path
const uploadBase64ToServer = async (base64) => {
  const parts = base64.split(',');
  const mime = parts[0].match(/:(.*?);/)[1];
  const bytes = atob(parts[1]);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  const blob = new Blob([arr], { type: mime });

  const formPayload = new FormData();
  formPayload.append('image', blob, 'migrated-photo.jpg');
  const token = localStorage.getItem('token');
  const response = await axios.post(`${API_URL}/api/upload/image`, formPayload, {
    headers: {
      'Content-Type': 'multipart/form-data',
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }
  });
  if (!response.data.success) throw new Error('Upload failed');
  return response.data.imageUrl;
};

const EditVehicle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: '',
    vin: '',
    licensePlate: '',
    registrationState: '',
    type: 'sedan',
    transmission: 'automatic',
    seats: 5,
    odometer: '',
    vehicleValue: '',
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dragIndex, setDragIndex] = useState(null);
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const [zipLoading, setZipLoading] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [originalVin, setOriginalVin] = useState('');

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

  useEffect(() => {
    fetchVehicle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchVehicle = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/vehicles/${id}`);
      const vehicle = response.data;

      // Migrate any base64 images to server files so they aren't lost on save
      let images = vehicle.images || [];
      let registrationImage = vehicle.registrationImage || '';

      const migratePromises = images.map(async (img) => {
        if (typeof img === 'string' && img.startsWith('data:')) {
          try {
            const url = await uploadBase64ToServer(img);
            console.log('🔄 Migrated base64 vehicle image to file:', url);
            return url;
          } catch (err) {
            console.error('Failed to migrate image:', err);
            return img; // Keep original if migration fails
          }
        }
        return img;
      });

      if (typeof registrationImage === 'string' && registrationImage.startsWith('data:')) {
        try {
          registrationImage = await uploadBase64ToServer(registrationImage);
          console.log('🔄 Migrated base64 registration image to file:', registrationImage);
        } catch (err) {
          console.error('Failed to migrate registration image:', err);
        }
      }

      images = await Promise.all(migratePromises);

      // If any images were migrated, save the URLs back to the database immediately
      const hadBase64 = (vehicle.images || []).some(img => typeof img === 'string' && img.startsWith('data:')) ||
        (typeof vehicle.registrationImage === 'string' && vehicle.registrationImage.startsWith('data:'));
      if (hadBase64) {
        try {
          const token = localStorage.getItem('token');
          await axios.put(`${API_URL}/api/vehicles/${id}`, { images, registrationImage }, {
            headers: { Authorization: `Bearer ${token}` }
          });
          console.log('✅ Migrated images saved to database');
        } catch (err) {
          console.error('Failed to save migrated images:', err);
        }
      }

      setOriginalVin(vehicle.vin || '');
      setFormData({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        vin: vehicle.vin || '',
        licensePlate: vehicle.licensePlate || '',
        registrationState: vehicle.registrationState || '',
        type: vehicle.type,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        odometer: vehicle.odometer || '',
        vehicleValue: vehicle.vehicleValue || '',
        description: vehicle.description,
        features: vehicle.features || [],
        pricePerDay: vehicle.pricePerDay,
        pricePerWeek: vehicle.pricePerWeek || '',
        pricePerMonth: vehicle.pricePerMonth || '',
        images: images,
        registrationImage: registrationImage,
        registrationExpiration: vehicle.registrationExpiration ? vehicle.registrationExpiration.substring(0, 10) : '',
        location: vehicle.location || {
          address: '',
          city: '',
          state: '',
          zipCode: ''
        }
      });
    } catch (error) {
      console.error('Error fetching vehicle:', error);
      setError('Failed to load vehicle');
    } finally {
      setLoading(false);
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

  const handleLocationSelect = useCallback((addressData) => {
    setFormData(prev => ({
      ...prev,
      location: {
        ...prev.location,
        address: addressData.street,
        city: addressData.city,
        state: addressData.state,
        zipCode: addressData.zipCode
      }
    }));
  }, []);

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
    setSaving(true);

    try {
      // Convert any remaining base64 images to server files before saving
      let processedImages = formData.images;
      if (processedImages.length > 0) {
        processedImages = await Promise.all(
          processedImages.map(async (img) => {
            if (typeof img === 'string' && img.startsWith('data:')) {
              try {
                return await uploadBase64ToServer(img);
              } catch (err) {
                console.error('Failed to upload image before save:', err);
                return img;
              }
            }
            return img;
          })
        );
      }

      let regImage = formData.registrationImage;
      if (regImage && typeof regImage === 'string' && regImage.startsWith('data:')) {
        try {
          regImage = await uploadBase64ToServer(regImage);
        } catch (err) {
          console.error('Failed to upload registration image before save:', err);
        }
      }

      const vehicleData = {
        ...formData,
        features: formData.features,
        images: processedImages.length > 0 ? processedImages : undefined,
        registrationImage: regImage,
        pricePerWeek: formData.pricePerWeek !== '' ? formData.pricePerWeek : undefined,
        pricePerMonth: formData.pricePerMonth !== '' ? formData.pricePerMonth : undefined
      };

      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/vehicles/${id}`, vehicleData, {
        headers: { Authorization: `Bearer ${token}` },
        maxContentLength: Infinity,
        maxBodyLength: Infinity,
        timeout: 30000
      });
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || err.message || 'Failed to update vehicle');
      console.error('❌ Update vehicle error:', err.response?.status, err.response?.data || err.message);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm('Are you sure you want to permanently delete this vehicle? This action cannot be undone.')) {
      return;
    }
    setDeleting(true);
    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/vehicles/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to delete vehicle');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="form-container">
            <h1 className="page-title">Edit Vehicle</h1>

            {error && <div className="error-message">{error}</div>}

            <form onSubmit={handleSubmit} className="vehicle-form">
              <div className="form-section">
                <h2 className="form-section-title">Vehicle Details</h2>

                {formData.nickname && (
                  <div className="form-group">
                    <label className="form-label">Vehicle Nickname</label>
                    <input
                      type="text"
                      className="form-input"
                      value={formData.nickname}
                      disabled
                      style={{ backgroundColor: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }}
                    />
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Nickname cannot be changed after listing creation.
                    </p>
                  </div>
                )}

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
                      <option value="Acura">Acura</option>
                      <option value="Alfa Romeo">Alfa Romeo</option>
                      <option value="Audi">Audi</option>
                      <option value="BMW">BMW</option>
                      <option value="Buick">Buick</option>
                      <option value="Cadillac">Cadillac</option>
                      <option value="Chevrolet">Chevrolet</option>
                      <option value="Chrysler">Chrysler</option>
                      <option value="Dodge">Dodge</option>
                      <option value="Ferrari">Ferrari</option>
                      <option value="Fiat">Fiat</option>
                      <option value="Ford">Ford</option>
                      <option value="Genesis">Genesis</option>
                      <option value="GMC">GMC</option>
                      <option value="Honda">Honda</option>
                      <option value="Hyundai">Hyundai</option>
                      <option value="Infiniti">Infiniti</option>
                      <option value="Jaguar">Jaguar</option>
                      <option value="Jeep">Jeep</option>
                      <option value="Kia">Kia</option>
                      <option value="Lamborghini">Lamborghini</option>
                      <option value="Land Rover">Land Rover</option>
                      <option value="Lexus">Lexus</option>
                      <option value="Lincoln">Lincoln</option>
                      <option value="Maserati">Maserati</option>
                      <option value="Mazda">Mazda</option>
                      <option value="McLaren">McLaren</option>
                      <option value="Mercedes-Benz">Mercedes-Benz</option>
                      <option value="Mini">Mini</option>
                      <option value="Mitsubishi">Mitsubishi</option>
                      <option value="Nissan">Nissan</option>
                      <option value="Porsche">Porsche</option>
                      <option value="Ram">Ram</option>
                      <option value="Rivian">Rivian</option>
                      <option value="Rolls-Royce">Rolls-Royce</option>
                      <option value="Subaru">Subaru</option>
                      <option value="Tesla">Tesla</option>
                      <option value="Toyota">Toyota</option>
                      <option value="Volkswagen">Volkswagen</option>
                      <option value="Volvo">Volvo</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Model *</label>
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
                    {!formData.make && (
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
                    <label className="form-label">VIN (Vehicle Identification Number) *</label>
                    <input
                      type="text"
                      name="vin"
                      className="form-input"
                      value={formData.vin}
                      onChange={handleChange}
                      placeholder="17 characters"
                      maxLength="17"
                      style={{
                        textTransform: 'uppercase',
                        ...(originalVin && originalVin.length === 17 ? {
                          backgroundColor: '#f3f4f6',
                          color: '#6b7280',
                          cursor: 'not-allowed'
                        } : {})
                      }}
                      readOnly={!!(originalVin && originalVin.length === 17)}
                      required
                    />
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      {originalVin && originalVin.length === 17
                        ? 'VIN is locked and cannot be changed. To use a different VIN, create a new listing.'
                        : 'Found on dashboard or driver\'s door jamb'}
                    </p>
                  </div>

                </div>

                <div className="form-row">
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
                    <label className="form-label">Odometer *</label>
                    <input
                      type="number"
                      name="odometer"
                      className="form-input"
                      value={formData.odometer}
                      onChange={handleChange}
                      min="0"
                      max="200000"
                      placeholder="Enter mileage"
                      required
                    />
                    <span className="form-hint">Max: 200,000</span>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Vehicle Value *</label>
                    <input
                      type="number"
                      name="vehicleValue"
                      className="form-input"
                      value={formData.vehicleValue}
                      onChange={handleChange}
                      min="5000"
                      max="90000"
                      placeholder="Enter vehicle value"
                      required
                    />
                    <span className="form-hint">Min: $5,000 Max: $90,000</span>
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
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                  Select all features that apply to your vehicle
                </p>

                {Object.entries(featuresByCategory).map(([category, features]) => (
                  <div key={category} style={{ marginBottom: '1.5rem' }}>
                    <h3 style={{
                      fontSize: '1rem',
                      fontWeight: '600',
                      color: '#374151',
                      marginBottom: '0.75rem',
                      borderBottom: '1px solid #e5e7eb',
                      paddingBottom: '0.5rem'
                    }}>
                      {category}
                    </h3>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                      gap: '0.5rem'
                    }}>
                      {features.map(feature => (
                        <label
                          key={feature.id}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem',
                            padding: '0.5rem',
                            borderRadius: '0.375rem',
                            cursor: 'pointer',
                            backgroundColor: formData.features.includes(feature.label) ? '#d1fae5' : '#f9fafb',
                            border: formData.features.includes(feature.label) ? '1px solid #10b981' : '1px solid #e5e7eb',
                            transition: 'all 0.2s'
                          }}
                        >
                          <input
                            type="checkbox"
                            checked={formData.features.includes(feature.label)}
                            onChange={() => handleFeatureToggle(feature.label)}
                            style={{
                              width: '1rem',
                              height: '1rem',
                              accentColor: '#10b981'
                            }}
                          />
                          <span style={{ fontSize: '0.9rem', color: '#374151' }}>
                            {feature.label}
                          </span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}

                {formData.features.length > 0 && (
                  <div style={{
                    marginTop: '1rem',
                    padding: '0.75rem',
                    backgroundColor: '#f0fdf4',
                    borderRadius: '0.5rem',
                    border: '1px solid #bbf7d0'
                  }}>
                    <strong style={{ color: '#166534' }}>Selected features ({formData.features.length}):</strong>
                    <p style={{ marginTop: '0.5rem', color: '#15803d', fontSize: '0.9rem' }}>
                      {formData.features.join(', ')}
                    </p>
                  </div>
                )}
              </div>

              <div className="form-section">
                <h2 className="form-section-title">Vehicle Photos</h2>
                <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '0.5rem' }}>
                  📸 Upload photos of your vehicle
                </p>
                <p style={{ fontSize: '0.85rem', color: formData.images.length >= 4 ? '#10b981' : '#f59e0b', marginBottom: '0.5rem', fontWeight: '500' }}>
                  {formData.images.length} photo{formData.images.length !== 1 ? 's' : ''} uploaded
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
                    gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
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
                        <img src={resolveImageUrl(img)} alt={`Vehicle photo ${idx + 1}`} style={{
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
                  onChange={(url) => setFormData(prev => ({ ...prev, registrationImage: url }))}
                  required={true}
                />

                <div className="form-row" style={{ marginTop: '1rem' }}>
                  <div className="form-group" style={{ flex: '1' }}>
                    <label className="form-label">License Plate *</label>
                    <input
                      type="text"
                      name="licensePlate"
                      className="form-input"
                      value={formData.licensePlate}
                      onChange={handleChange}
                      placeholder="e.g., ABC1234"
                      style={{ textTransform: 'uppercase' }}
                      required
                    />
                  </div>
                  <div className="form-group" style={{ flex: '1' }}>
                    <label className="form-label">Registration State *</label>
                    <select
                      name="registrationState"
                      className="form-input"
                      value={formData.registrationState}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select State</option>
                      <option value="AZ">Arizona (AZ)</option>
                      <option value="CA">California (CA)</option>
                      <option value="CO">Colorado (CO) *</option>
                      <option value="CT">Connecticut (CT) *</option>
                      <option value="FL">Florida (FL)</option>
                      <option value="GA">Georgia (GA)</option>
                      <option value="IL">Illinois (IL)</option>
                      <option value="MD">Maryland (MD)</option>
                      <option value="NV">Nevada (NV) *</option>
                      <option value="PA">Pennsylvania (PA) *</option>
                      <option value="SC">South Carolina (SC) *</option>
                      <option value="TX">Texas (TX)</option>
                    </select>
                    <p style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      * Requires specific coverage — inquire for additional details
                    </p>
                  </div>
                </div>

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
                  <label className="form-label">Address *</label>
                  <AddressAutocomplete
                    value={formData.location.address}
                    onChange={(e) => setFormData(prev => ({ ...prev, location: { ...prev.location, address: e.target.value } }))}
                    onPlaceSelect={handleLocationSelect}
                    placeholder="Start typing an address..."
                    className="form-input"
                    maxLength="60"
                    required
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
                    <select
                      name="location.state"
                      className="form-input"
                      value={formData.location.state}
                      onChange={handleChange}
                      required
                    >
                      <option value="">Select State</option>
                      <option value="AZ">Arizona (AZ)</option>
                      <option value="CA">California (CA)</option>
                      <option value="CO">Colorado (CO)</option>
                      <option value="CT">Connecticut (CT)</option>
                      <option value="FL">Florida (FL)</option>
                      <option value="GA">Georgia (GA)</option>
                      <option value="IL">Illinois (IL)</option>
                      <option value="MD">Maryland (MD)</option>
                      <option value="NV">Nevada (NV)</option>
                      <option value="PA">Pennsylvania (PA)</option>
                      <option value="SC">South Carolina (SC)</option>
                      <option value="TX">Texas (TX)</option>
                    </select>
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
                  disabled={saving}
                >
                  {saving ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>

            {/* Danger Zone - Delete Vehicle */}
            <div style={{
              marginTop: '3rem',
              padding: '1.5rem',
              border: '1px solid #ef4444',
              borderRadius: '0.5rem',
              background: 'rgba(239, 68, 68, 0.05)'
            }}>
              <h3 style={{ color: '#ef4444', fontSize: '1rem', fontWeight: '600', marginBottom: '0.5rem' }}>
                Danger Zone
              </h3>
              <p style={{ color: '#6b7280', fontSize: '0.85rem', marginBottom: '1rem' }}>
                Permanently delete this vehicle listing. This action cannot be undone.
              </p>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                style={{
                  padding: '0.6rem 1.5rem',
                  background: 'transparent',
                  color: '#ef4444',
                  border: '1px solid #ef4444',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem',
                  fontWeight: '600',
                  cursor: deleting ? 'not-allowed' : 'pointer',
                  opacity: deleting ? 0.6 : 1,
                  transition: 'all 0.2s'
                }}
                onMouseEnter={(e) => { e.target.style.background = '#ef4444'; e.target.style.color = '#fff'; }}
                onMouseLeave={(e) => { e.target.style.background = 'transparent'; e.target.style.color = '#ef4444'; }}
              >
                {deleting ? 'Deleting...' : 'Delete This Vehicle'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditVehicle;
