import React, { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import { vehicleModels } from '../../data/vehicleModels';
import './Host.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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
    pricePerWeek: '',
    pricePerMonth: '',
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchVehicle();
  }, [id]);

  const fetchVehicle = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/vehicles/${id}`);
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
        pricePerWeek: vehicle.pricePerWeek || '',
        pricePerMonth: vehicle.pricePerMonth || '',
        image1: vehicle.images?.[0] || '',
        image2: vehicle.images?.[1] || '',
        image3: vehicle.images?.[2] || '',
        image4: vehicle.images?.[3] || '',
        registrationImage: vehicle.registrationImage || '',
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

      await axios.put(`${API_URL}/api/vehicles/${id}`, vehicleData);
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
                  onChange={(url) => setFormData(prev => ({ ...prev, image1: url }))}
                  required={false}
                />

                <ImageUpload
                  label="Photo 2"
                  value={formData.image2}
                  onChange={(url) => setFormData(prev => ({ ...prev, image2: url }))}
                  required={false}
                />

                <ImageUpload
                  label="Photo 3"
                  value={formData.image3}
                  onChange={(url) => setFormData(prev => ({ ...prev, image3: url }))}
                  required={false}
                />

                <ImageUpload
                  label="Photo 4"
                  value={formData.image4}
                  onChange={(url) => setFormData(prev => ({ ...prev, image4: url }))}
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
