import React, { useState, useCallback } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ImageUpload from '../../components/ImageUpload';
import FaceVerification from '../../components/FaceVerification';
import { vehicleModels } from '../../data/vehicleModels';
import API_URL from '../../config/api';
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
    profileImage: '',
    driverLicense: {
      licenseNumber: '',
      state: '',
      expirationDate: '',
      licenseImage: '',
      verificationSelfie: ''
    }
  });
  const [vehicleData, setVehicleData] = useState({
    vin: '',
    make: '',
    model: '',
    year: '',
    type: 'sedan',
    transmission: 'automatic',
    seats: '',
    description: '',
    pricePerDay: '',
    pricePerWeek: '',
    pricePerMonth: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
    image1: '',
    image2: '',
    image3: '',
    image4: '',
    registrationImage: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [vinLoading, setVinLoading] = useState(false);
  const [vinDecoded, setVinDecoded] = useState(false);
  const [faceVerification, setFaceVerification] = useState(null);

  const handleFaceVerificationResult = useCallback((result) => {
    setFaceVerification(result);
  }, []);

  const handleDecodeVin = async () => {
    const vin = vehicleData.vin.trim().toUpperCase();
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
      setVehicleData(prev => ({
        ...prev,
        vin: vin,
        make: decoded.make || prev.make,
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
    const { name, value } = e.target;

    if (name === 'make') {
      // Reset model when brand changes
      setVehicleData({
        ...vehicleData,
        make: value,
        model: ''
      });
    } else {
      setVehicleData({
        ...vehicleData,
        [name]: value
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validate profile picture is uploaded
    if (!formData.profileImage || formData.profileImage.trim() === '') {
      setError('Please upload a profile picture to continue.');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

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

    // Validate license photo and verification selfie for drivers
    if (formData.userType === 'driver' || formData.userType === 'both') {
      if (!formData.driverLicense.licenseImage || formData.driverLicense.licenseImage.trim() === '') {
        setError('Please upload a photo of your driver\'s license.');
        setLoading(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }
      if (!formData.driverLicense.verificationSelfie || formData.driverLicense.verificationSelfie.trim() === '') {
        setError('Please upload a verification selfie holding your driver\'s license.');
        setLoading(false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
        return;
      }

      // Check face verification result
      if (faceVerification && !faceVerification.verified && faceVerification.reason !== 'error') {
        const proceed = window.confirm(
          'Face verification did not find a match between your selfie and driver\'s license photo. ' +
          'This may affect your account verification.\n\n' +
          'Do you still want to proceed with registration?'
        );
        if (!proceed) {
          setLoading(false);
          return;
        }
      }
    }

    try {
      // Include face verification score in registration data
      const registrationData = {
        ...formData,
        driverLicense: {
          ...formData.driverLicense,
          faceMatchScore: faceVerification?.score || null,
          faceVerified: faceVerification?.verified || false
        }
      };
      await register(registrationData);

      // If user is host or both, show vehicle form
      if (formData.userType === 'host' || formData.userType === 'both') {
        setStep(2);
        setLoading(false);
      } else {
        // If just a driver, go to driver dashboard
        navigate('/driver/my-bookings');
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

    // Validate VIN
    if (!vehicleData.vin || vehicleData.vin.trim().length !== 17) {
      setError('Please enter a valid 17-character VIN');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate that at least Photo 1 is uploaded
    if (!vehicleData.image1 || vehicleData.image1.trim() === '') {
      setError('Please upload at least one photo (Photo 1 is required)');
      setLoading(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    // Validate that registration image is uploaded
    if (!vehicleData.registrationImage || vehicleData.registrationImage.trim() === '') {
      setError('Vehicle registration photo is required');
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
        vin: vehicleData.vin.trim().toUpperCase(),
        make: vehicleData.make,
        model: vehicleData.model,
        year: parseInt(vehicleData.year),
        type: vehicleData.type,
        transmission: vehicleData.transmission,
        seats: parseInt(vehicleData.seats),
        description: vehicleData.description,
        pricePerDay: parseFloat(vehicleData.pricePerDay),
        pricePerWeek: vehicleData.pricePerWeek ? parseFloat(vehicleData.pricePerWeek) : undefined,
        pricePerMonth: vehicleData.pricePerMonth ? parseFloat(vehicleData.pricePerMonth) : undefined,
        images: images.length > 0 ? images : undefined,
        registrationImage: vehicleData.registrationImage,
        location: {
          address: vehicleData.address,
          city: vehicleData.city,
          state: vehicleData.state,
          zipCode: vehicleData.zipCode
        }
      };

      await axios.post(`${API_URL}/api/vehicles`, vehiclePayload, {
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
    navigate('/host/dashboard');
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

                  {/* Profile Picture Upload - Required */}
                  <div style={{ borderTop: '2px solid #e5e7eb', paddingTop: '1.5rem', marginTop: '1rem' }}>
                    <h3 style={{ fontSize: '1.1rem', marginBottom: '0.5rem', color: '#1f2937' }}>
                      Profile Picture *
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                      Upload a clear photo of yourself. This helps hosts and drivers identify you.
                    </p>
                    <ImageUpload
                      label="Your Photo"
                      value={formData.profileImage}
                      onChange={(url) => setFormData(prev => ({ ...prev, profileImage: url }))}
                      required={true}
                    />
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

                        <h4 style={{ fontSize: '1rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: '#1f2937' }}>
                          License Photo *
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                          Upload a clear photo of the front of your driver's license.
                        </p>
                        <ImageUpload
                          label="Driver's License Photo"
                          value={formData.driverLicense.licenseImage}
                          onChange={(url) => setFormData(prev => ({
                            ...prev,
                            driverLicense: { ...prev.driverLicense, licenseImage: url }
                          }))}
                          required={true}
                        />

                        <h4 style={{ fontSize: '1rem', marginTop: '1.5rem', marginBottom: '0.5rem', color: '#1f2937' }}>
                          Verification Selfie *
                        </h4>
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginBottom: '1rem' }}>
                          Take a selfie holding your driver's license next to your face. This helps us verify your identity.
                        </p>
                        <ImageUpload
                          label="Selfie with License"
                          value={formData.driverLicense.verificationSelfie}
                          onChange={(url) => setFormData(prev => ({
                            ...prev,
                            driverLicense: { ...prev.driverLicense, verificationSelfie: url }
                          }))}
                          required={true}
                        />

                        <FaceVerification
                          licenseImage={formData.driverLicense.licenseImage}
                          selfieImage={formData.driverLicense.verificationSelfie}
                          onVerificationResult={handleFaceVerificationResult}
                        />

                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '1rem' }}>
                          ℹ️ Your license information and photos are required to rent vehicles. Face verification compares your selfie to your license photo for identity confirmation.
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
                  {/* VIN with decode */}
                  <div className="form-group">
                    <label className="form-label">VIN (Vehicle Identification Number) *</label>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <input
                        type="text"
                        name="vin"
                        className="form-input"
                        value={vehicleData.vin}
                        onChange={(e) => {
                          handleVehicleChange(e);
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
                        disabled={vinLoading || vehicleData.vin.length !== 17}
                        className="btn btn-primary"
                        style={{
                          whiteSpace: 'nowrap',
                          opacity: vehicleData.vin.length !== 17 ? 0.5 : 1
                        }}
                      >
                        {vinLoading ? 'Decoding...' : 'Decode VIN'}
                      </button>
                    </div>
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Enter VIN and click Decode to auto-fill vehicle details
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
                        VIN decoded: {vehicleData.year} {vehicleData.make} {vehicleData.model}. Verify details below.
                      </div>
                    )}
                  </div>

                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Make</label>
                      <select
                        name="make"
                        className="form-select"
                        value={vehicleData.make}
                        onChange={handleVehicleChange}
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
                      <label className="form-label">Model</label>
                      {vinDecoded && vehicleData.model ? (
                        <input
                          type="text"
                          name="model"
                          className="form-input"
                          value={vehicleData.model}
                          onChange={handleVehicleChange}
                          required
                        />
                      ) : (
                        <select
                          name="model"
                          className="form-select"
                          value={vehicleData.model}
                          onChange={handleVehicleChange}
                          required
                          disabled={!vehicleData.make}
                        >
                          <option value="">
                            {vehicleData.make ? 'Select a model' : 'Select brand first'}
                          </option>
                          {vehicleData.make && vehicleModels[vehicleData.make]?.map(model => (
                            <option key={model} value={model}>{model}</option>
                          ))}
                        </select>
                      )}
                      {!vehicleData.make && !vinDecoded && (
                        <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                          Please select a brand first
                        </p>
                      )}
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
                    <label className="form-label">Price Per Week ($)</label>
                    <input
                      type="number"
                      name="pricePerWeek"
                      className="form-input"
                      placeholder="e.g., 300 (optional)"
                      min="0"
                      step="0.01"
                      value={vehicleData.pricePerWeek}
                      onChange={handleVehicleChange}
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
                      placeholder="e.g., 1000 (optional)"
                      min="0"
                      step="0.01"
                      value={vehicleData.pricePerMonth}
                      onChange={handleVehicleChange}
                    />
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                      Leave blank if you don't offer monthly rentals
                    </p>
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
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image1: url }))}
                    required={true}
                  />

                  <ImageUpload
                    label="Photo 2"
                    value={vehicleData.image2}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image2: url }))}
                    required={false}
                  />

                  <ImageUpload
                    label="Photo 3"
                    value={vehicleData.image3}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image3: url }))}
                    required={false}
                  />

                  <ImageUpload
                    label="Photo 4"
                    value={vehicleData.image4}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, image4: url }))}
                    required={false}
                  />

                  <h3 style={{ marginTop: '1.5rem', marginBottom: '0.5rem', fontSize: '1.1rem' }}>Vehicle Registration</h3>
                  <p style={{ fontSize: '0.9rem', color: '#666', marginBottom: '1rem' }}>
                    📄 Upload a photo of your vehicle registration document for verification
                  </p>

                  <ImageUpload
                    label="Registration Document"
                    value={vehicleData.registrationImage}
                    onChange={(url) => setVehicleData(prev => ({ ...prev, registrationImage: url }))}
                    required={true}
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
