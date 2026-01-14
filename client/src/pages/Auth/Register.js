import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import './Auth.css';

const Register = () => {
  const [step, setStep] = useState(1); // 1 = user registration, 2 = vehicle details
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    userType: 'driver'
  });
  const [vehicleData, setVehicleData] = useState({
    make: '',
    model: '',
    year: '',
    type: 'sedan',
    transmission: 'automatic',
    seats: '',
    description: '',
    pricePerDay: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    longitude: '',
    latitude: '',
    image1: '',
    image2: '',
    image3: '',
    image4: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleVehicleChange = (e) => {
    setVehicleData({
      ...vehicleData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await register(formData);

      // If user is host or both, show vehicle form
      if (formData.userType === 'host' || formData.userType === 'both') {
        setStep(2);
        setLoading(false);
      } else {
        // If just a driver, go to marketplace
        navigate('/marketplace');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to register');
      setLoading(false);
    }
  };

  const handleVehicleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const token = localStorage.getItem('token');

      // Prepare vehicle data with coordinates and images
      const images = [
        vehicleData.image1,
        vehicleData.image2,
        vehicleData.image3,
        vehicleData.image4
      ].filter(img => img.trim() !== ''); // Only include non-empty image URLs

      const vehiclePayload = {
        make: vehicleData.make,
        model: vehicleData.model,
        year: parseInt(vehicleData.year),
        type: vehicleData.type,
        transmission: vehicleData.transmission,
        seats: parseInt(vehicleData.seats),
        description: vehicleData.description,
        pricePerDay: parseFloat(vehicleData.pricePerDay),
        images: images.length > 0 ? images : undefined,
        location: {
          address: vehicleData.address,
          city: vehicleData.city,
          state: vehicleData.state,
          zipCode: vehicleData.zipCode,
          coordinates: vehicleData.longitude && vehicleData.latitude
            ? [parseFloat(vehicleData.longitude), parseFloat(vehicleData.latitude)]
            : undefined
        }
      };

      await axios.post('/api/vehicles', vehiclePayload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Navigate to host dashboard after adding vehicle
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create vehicle listing');
    } finally {
      setLoading(false);
    }
  };

  const skipVehicle = () => {
    navigate('/marketplace');
  };

  return (
    <div>
      <Navbar />
      <div className="auth-page">
        <div className="auth-container">
          <div className="auth-card">
            {step === 1 ? (
              <>
                <h1 className="auth-title">Create Account</h1>
                <p className="auth-subtitle">Join the <span style={{color: '#10b981', fontWeight: 'bold'}}>RentUFS</span> community</p>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleSubmit} className="auth-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">First Name</label>
                      <input
                        type="text"
                        name="firstName"
                        className="form-input"
                        value={formData.firstName}
                        onChange={handleChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Last Name</label>
                      <input
                        type="text"
                        name="lastName"
                        className="form-input"
                        value={formData.lastName}
                        onChange={handleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Email</label>
                    <input
                      type="email"
                      name="email"
                      className="form-input"
                      value={formData.email}
                      onChange={handleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Password</label>
                    <input
                      type="password"
                      name="password"
                      className="form-input"
                      value={formData.password}
                      onChange={handleChange}
                      required
                      minLength="6"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      className="form-input"
                      value={formData.phone}
                      onChange={handleChange}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">I want to</label>
                    <select
                      name="userType"
                      className="form-select"
                      value={formData.userType}
                      onChange={handleChange}
                    >
                      <option value="driver">Rent cars (Driver)</option>
                      <option value="host">List my car (Host)</option>
                      <option value="both">Both rent and list cars</option>
                    </select>
                  </div>

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={loading}
                  >
                    {loading ? 'Creating account...' : 'Sign Up'}
                  </button>
                </form>

                <p className="auth-footer">
                  Already have an account?{' '}
                  <Link to="/login" className="auth-link">
                    Login
                  </Link>
                </p>
              </>
            ) : (
              <>
                <h1 className="auth-title">List Your Vehicle</h1>
                <p className="auth-subtitle">Add your car details to start earning</p>

                {error && <div className="error-message">{error}</div>}

                <form onSubmit={handleVehicleSubmit} className="auth-form">
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Make</label>
                      <input
                        type="text"
                        name="make"
                        className="form-input"
                        placeholder="e.g., Toyota"
                        value={vehicleData.make}
                        onChange={handleVehicleChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Model</label>
                      <input
                        type="text"
                        name="model"
                        className="form-input"
                        placeholder="e.g., Camry"
                        value={vehicleData.model}
                        onChange={handleVehicleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Year</label>
                      <input
                        type="number"
                        name="year"
                        className="form-input"
                        placeholder="e.g., 2020"
                        min="1900"
                        max="2030"
                        value={vehicleData.year}
                        onChange={handleVehicleChange}
                        required
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Type</label>
                      <select
                        name="type"
                        className="form-select"
                        value={vehicleData.type}
                        onChange={handleVehicleChange}
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
                      <label className="form-label">Transmission</label>
                      <select
                        name="transmission"
                        className="form-select"
                        value={vehicleData.transmission}
                        onChange={handleVehicleChange}
                      >
                        <option value="automatic">Automatic</option>
                        <option value="manual">Manual</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Seats</label>
                      <input
                        type="number"
                        name="seats"
                        className="form-input"
                        placeholder="e.g., 5"
                        min="1"
                        max="15"
                        value={vehicleData.seats}
                        onChange={handleVehicleChange}
                        required
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Price Per Day ($)</label>
                    <input
                      type="number"
                      name="pricePerDay"
                      className="form-input"
                      placeholder="e.g., 50"
                      min="0"
                      step="0.01"
                      value={vehicleData.pricePerDay}
                      onChange={handleVehicleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Description</label>
                    <textarea
                      name="description"
                      className="form-textarea"
                      placeholder="Tell renters about your car..."
                      value={vehicleData.description}
                      onChange={handleVehicleChange}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ marginBottom: '0.5rem', display: 'block' }}>
                      Vehicle Photos (Add up to 4 images)
                    </label>
                    <p style={{ fontSize: '0.85rem', color: '#666', marginBottom: '0.75rem' }}>
                      📸 Paste image URLs below (e.g., from Imgur, Google Drive, or any image hosting service)
                    </p>

                    <div style={{ display: 'grid', gap: '0.75rem' }}>
                      <input
                        type="url"
                        name="image1"
                        className="form-input"
                        placeholder="Image 1 URL (required)"
                        value={vehicleData.image1}
                        onChange={handleVehicleChange}
                        required
                      />
                      <input
                        type="url"
                        name="image2"
                        className="form-input"
                        placeholder="Image 2 URL (optional)"
                        value={vehicleData.image2}
                        onChange={handleVehicleChange}
                      />
                      <input
                        type="url"
                        name="image3"
                        className="form-input"
                        placeholder="Image 3 URL (optional)"
                        value={vehicleData.image3}
                        onChange={handleVehicleChange}
                      />
                      <input
                        type="url"
                        name="image4"
                        className="form-input"
                        placeholder="Image 4 URL (optional)"
                        value={vehicleData.image4}
                        onChange={handleVehicleChange}
                      />
                    </div>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Address</label>
                    <input
                      type="text"
                      name="address"
                      className="form-input"
                      placeholder="Street address"
                      value={vehicleData.address}
                      onChange={handleVehicleChange}
                    />
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">City</label>
                      <input
                        type="text"
                        name="city"
                        className="form-input"
                        placeholder="City"
                        value={vehicleData.city}
                        onChange={handleVehicleChange}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">State</label>
                      <input
                        type="text"
                        name="state"
                        className="form-input"
                        placeholder="State"
                        value={vehicleData.state}
                        onChange={handleVehicleChange}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Zip Code</label>
                      <input
                        type="text"
                        name="zipCode"
                        className="form-input"
                        placeholder="Zip code"
                        value={vehicleData.zipCode}
                        onChange={handleVehicleChange}
                      />
                    </div>
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Longitude (Optional)</label>
                      <input
                        type="number"
                        name="longitude"
                        className="form-input"
                        placeholder="e.g., -122.4194"
                        step="any"
                        value={vehicleData.longitude}
                        onChange={handleVehicleChange}
                      />
                    </div>

                    <div className="form-group">
                      <label className="form-label">Latitude (Optional)</label>
                      <input
                        type="number"
                        name="latitude"
                        className="form-input"
                        placeholder="e.g., 37.7749"
                        step="any"
                        value={vehicleData.latitude}
                        onChange={handleVehicleChange}
                      />
                    </div>
                  </div>

                  <p className="text-sm text-gray" style={{ marginBottom: '1rem' }}>
                    💡 Tip: Get coordinates from <a href="https://www.latlong.net/" target="_blank" rel="noopener noreferrer" style={{ color: '#10b981' }}>LatLong.net</a> for map view
                  </p>

                  <div style={{ display: 'flex', gap: '1rem' }}>
                    <button
                      type="submit"
                      className="btn btn-primary"
                      style={{ flex: 1 }}
                      disabled={loading}
                    >
                      {loading ? 'Adding vehicle...' : 'Add Vehicle'}
                    </button>

                    <button
                      type="button"
                      onClick={skipVehicle}
                      className="btn btn-secondary"
                      style={{ flex: 1 }}
                      disabled={loading}
                    >
                      Skip for Now
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Register;
