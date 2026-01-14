import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import './Host.css';

const EditVehicle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [formData, setFormData] = useState({
    make: '',
    model: '',
    year: '',
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

  useEffect(() => {
    fetchVehicle();
  }, [id]);

  const fetchVehicle = async () => {
    try {
      const response = await axios.get(`/api/vehicles/${id}`);
      const vehicle = response.data;

      setFormData({
        make: vehicle.make,
        model: vehicle.model,
        year: vehicle.year,
        type: vehicle.type,
        transmission: vehicle.transmission,
        seats: vehicle.seats,
        description: vehicle.description,
        features: vehicle.features?.join(', ') || '',
        pricePerDay: vehicle.pricePerDay,
        image1: vehicle.images?.[0] || '',
        image2: vehicle.images?.[1] || '',
        image3: vehicle.images?.[2] || '',
        image4: vehicle.images?.[3] || '',
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
    setSaving(true);

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
        images: images.length > 0 ? images : undefined
      };

      // Remove image fields from formData before sending
      delete vehicleData.image1;
      delete vehicleData.image2;
      delete vehicleData.image3;
      delete vehicleData.image4;

      await axios.put(`/api/vehicles/${id}`, vehicleData);
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update vehicle');
    } finally {
      setSaving(false);
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
                  📸 Add up to 4 photos of your vehicle. Paste image URLs from Imgur, Google Drive, or any image hosting service.
                </p>

                <div className="form-group">
                  <label className="form-label">Photo 1</label>
                  <input
                    type="url"
                    name="image1"
                    className="form-input"
                    value={formData.image1}
                    onChange={handleChange}
                    placeholder="https://example.com/image1.jpg"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Photo 2</label>
                  <input
                    type="url"
                    name="image2"
                    className="form-input"
                    value={formData.image2}
                    onChange={handleChange}
                    placeholder="https://example.com/image2.jpg (optional)"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Photo 3</label>
                  <input
                    type="url"
                    name="image3"
                    className="form-input"
                    value={formData.image3}
                    onChange={handleChange}
                    placeholder="https://example.com/image3.jpg (optional)"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Photo 4</label>
                  <input
                    type="url"
                    name="image4"
                    className="form-input"
                    value={formData.image4}
                    onChange={handleChange}
                    placeholder="https://example.com/image4.jpg (optional)"
                  />
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
                  disabled={saving}
                >
                  {saving ? 'Saving Changes...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditVehicle;
