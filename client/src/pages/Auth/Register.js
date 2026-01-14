import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import './Auth.css';

const Register = () => {
  const [step, setStep] = useState(1); // 1 = user registration, 2 = vehicle details
  const [formData, setFormData] = useState({
    email: '',
    password: '',
    firstName: '',
    lastName: '',
    phone: '',
    dateOfBirth: '',
    userType: 'driver',
    driverLicense: {
      licenseNumber: '',
      state: '',
      expirationDate: ''
    }
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
    const { name, value } = e.target;

    if (name.startsWith('driverLicense.')) {
      const licenseField = name.split('.')[1];
      setFormData({
        ...formData,
        driverLicense: {
          ...formData.driverLicense,
          [licenseField]: value
        }
      });
    } else {
      setFormData({
        ...formData,
        [name]: value
      });
    }
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

    // Validate age for drivers and both (must be at least 21)
    if ((formData.userType === 'driver' || formData.userType === 'both') && formData.dateOfBirth) {
      const birthDate = new Date(formData.dateOfBirth);
      const today = new Date();
      const age = today.getFullYear() - birthDate.getFullYear();
      const monthDiff = today.getMonth() - birthDate.getMonth();
      const dayDiff = today.getDate() - birthDate.getDate();

      // Calculate exact age
      const exactAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;

      if (exactAge < 21) {
        setError('You must be at least 21 years old to register as a driver.');
        setLoading(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
    }

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
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleVehicleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate that at least Photo 1 is uploaded
    if (!vehicleData.image1 || vehicleData.image1.trim() === '') {
      setError('Please upload at least one photo (Photo 1 is required)');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    try {
      const token = localStorage.getItem('token');

      // Prepare vehicle data with coordinates and images
      const images = [
        vehicleData.image1,
        vehicleData.image2,
        vehicleData.image3,
        vehicleData.image4
      ].filter(img => img && img.trim() !== ''); // Only include non-empty image URLs

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
          zipCode: vehicleData.zipCode
        }
      };

      await axios.post('/api/vehicles', vehiclePayload, {
        headers: { Authorization: `Bearer ${token}` }
      });

      // Navigate to host dashboard after adding vehicle
      navigate('/host/dashboard');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create vehicle listing. Please try again.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
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
                    <label className="form-label">Date of Birth {(formData.userType === 'driver' || formData.userType === 'both') && '*'}</label>
                    <input
                      type="date"
                      name="dateOfBirth"
                      className="form-input"
                      value={formData.dateOfBirth}
                      onChange={handleChange}
                      max={new Date(new Date().setFullYear(new Date().getFullYear() - 21)).toISOString().split('T')[0]}
                      required={(formData.userType === 'driver' || formData.userType === 'both')}
                    />
                    {(formData.userType === 'driver' || formData.userType === 'both') && (
                      <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        You must be at least 21 years old to rent vehicles
                      </p>
                    )}
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

                  {/* Driver License Information - Only for drivers and both */}
                  {(formData.userType === 'driver' || formData.userType === 'both') && (
                    <>
                      <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '1.5rem', marginTop: '1rem' }}>
                        <h3 style={{ fontSize: '1.1rem', marginBottom: '1rem', color: '#1f2937' }}>
                          Driver's License Information
                        </h3>

                        <div className="form-group">
                          <label className="form-label">License Number *</label>
                          <input
                            type="text"
                            name="driverLicense.licenseNumber"
                            className="form-input"
                            value={formData.driverLicense.licenseNumber}
                            onChange={handleChange}
                            placeholder="e.g., D1234567"
                            required
                          />
                        </div>

                        <div className="form-row">
                          <div className="form-group">
                            <label className="form-label">State *</label>
                            <input
                              type="text"
                              name="driverLicense.state"
                              className="form-input"
                              value={formData.driverLicense.state}
                              onChange={handleChange}
                              placeholder="e.g., CA"
                              maxLength="2"
                              required
                            />
                          </div>

                          <div className="form-group">
                            <label className="form-label">Expiration Date *</label>
                            <input
                              type="date"
                              name="driverLicense.expirationDate"
                              className="form-input"
                              value={formData.driverLicense.expirationDate}
                              onChange={handleChange}
                              min={new Date().toISOString().split('T')[0]}
                              required
                            />
                          </div>
                        </div>

                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.5rem' }}>
                          ℹ️ Your license information is required to rent vehicles and will be verified for your safety.
                        </p>
                      </div>
                    </>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%', marginTop: '1.5rem' }}
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

                  <h3 style={{ marginTop: '1.5rem', marginBottom: '1rem', fontSize: '1.1rem' }}>Vehicle Photos</h3>

                  <ImageUpload
                    label="Photo 1"
                    value={vehicleData.image1}
                    onChange={(url) => setVehicleData({ ...vehicleData, image1: url })}
                    required={true}
                  />

                  <ImageUpload
                    label="Photo 2"
                    value={vehicleData.image2}
                    onChange={(url) => setVehicleData({ ...vehicleData, image2: url })}
                    required={false}
                  />

                  <ImageUpload
                    label="Photo 3"
                    value={vehicleData.image3}
                    onChange={(url) => setVehicleData({ ...vehicleData, image3: url })}
                    required={false}
                  />

                  <ImageUpload
                    label="Photo 4"
                    value={vehicleData.image4}
                    onChange={(url) => setVehicleData({ ...vehicleData, image4: url })}
                    required={false}
                  />

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

                  <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
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
