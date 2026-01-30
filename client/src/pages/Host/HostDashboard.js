import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Host.css';

const HostDashboard = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taxInfo, setTaxInfo] = useState(null);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxFormData, setTaxFormData] = useState({ accountType: 'individual', taxId: '', businessName: '' });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMessage, setTaxMessage] = useState('');

  useEffect(() => {
    fetchVehicles();
    fetchTaxInfo();
  }, []);

  const fetchVehicles = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/vehicles/host/my-vehicles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setVehicles(response.data);
    } catch (error) {
      console.error('Error fetching vehicles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (vehicleId) => {
    if (!window.confirm('Are you sure you want to delete this vehicle?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.delete(`${API_URL}/api/vehicles/${vehicleId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchVehicles();
    } catch (error) {
      console.error('Error deleting vehicle:', error);
      alert('Failed to delete vehicle');
    }
  };

  const toggleAvailability = async (vehicleId, currentAvailability) => {
    try {
      const token = localStorage.getItem('token');
      await axios.put(`${API_URL}/api/vehicles/${vehicleId}`, {
        availability: !currentAvailability
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchVehicles();
    } catch (error) {
      console.error('Error updating availability:', error);
      alert('Failed to update availability');
    }
  };

  const fetchTaxInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users/host-tax-info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      if (response.data.hasSubmitted) {
        setTaxFormData({
          accountType: response.data.accountType,
          taxId: '',
          businessName: response.data.businessName || ''
        });
      }
    } catch (error) {
      console.error('Error fetching tax info:', error);
    }
  };

  const formatSSN = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const formatEIN = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  };

  const handleTaxIdInput = (e) => {
    const formatted = taxFormData.accountType === 'individual' ? formatSSN(e.target.value) : formatEIN(e.target.value);
    setTaxFormData({ ...taxFormData, taxId: formatted });
  };

  const handleSaveTaxInfo = async (e) => {
    e.preventDefault();
    setTaxSaving(true);
    setTaxMessage('');
    try {
      const token = localStorage.getItem('token');
      const response = await axios.put(`${API_URL}/api/users/host-tax-info`, taxFormData, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      setTaxMessage('Tax information saved successfully');
      setShowTaxForm(false);
      setTaxFormData({ ...taxFormData, taxId: '' });
    } catch (error) {
      setTaxMessage(error.response?.data?.message || 'Failed to save tax information');
    } finally {
      setTaxSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="host-page">
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px', color: '#1f2937' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="host-page">
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="host-header">
            <h1 className="page-title">My Vehicles</h1>
            <div className="host-actions">
              <Link to="/host/reports">
                <button className="btn btn-secondary">View Reports</button>
              </Link>
              <Link to="/host/bookings">
                <button className="btn btn-secondary">View Bookings</button>
              </Link>
              <Link to="/host/add-vehicle">
                <button className="btn btn-primary">Add New Vehicle</button>
              </Link>
            </div>
          </div>

          {/* Tax Info Section */}
          {taxInfo && (
            <div style={{
              background: taxInfo.hasSubmitted ? '#f0fdf4' : '#fffbeb',
              border: `1px solid ${taxInfo.hasSubmitted ? '#bbf7d0' : '#fde68a'}`,
              borderRadius: '12px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>
                    Tax Information
                  </h3>
                  {taxInfo.hasSubmitted ? (
                    <p style={{ fontSize: '0.85rem', color: '#6b7280', margin: 0 }}>
                      {taxInfo.accountType === 'business' ? `Business: ${taxInfo.businessName} | ` : 'Individual | '}
                      {taxInfo.accountType === 'individual' ? 'SSN' : 'EIN'} ending in ****{taxInfo.taxIdLast4}
                    </p>
                  ) : (
                    <p style={{ fontSize: '0.85rem', color: '#92400e', margin: 0 }}>
                      Please add your tax information for 1099 reporting and payouts.
                    </p>
                  )}
                </div>
                <button
                  onClick={() => { setShowTaxForm(!showTaxForm); setTaxMessage(''); }}
                  className="btn btn-secondary"
                  style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}
                >
                  {showTaxForm ? 'Cancel' : taxInfo.hasSubmitted ? 'Update' : 'Add Tax Info'}
                </button>
              </div>

              {taxMessage && !showTaxForm && (
                <p style={{ fontSize: '0.85rem', color: '#10b981', marginTop: '0.5rem', marginBottom: 0 }}>{taxMessage}</p>
              )}

              {showTaxForm && (
                <form onSubmit={handleSaveTaxInfo} style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontWeight: '600', fontSize: '0.9rem', color: '#374151', marginBottom: '0.5rem' }}>Account Type</label>
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                      <label style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.75rem',
                        border: taxFormData.accountType === 'individual' ? '2px solid #10b981' : '2px solid #d1d5db',
                        borderRadius: '8px', cursor: 'pointer',
                        background: taxFormData.accountType === 'individual' ? '#f0fdf4' : '#fff'
                      }}>
                        <input type="radio" value="individual" checked={taxFormData.accountType === 'individual'}
                          onChange={() => setTaxFormData({ accountType: 'individual', taxId: '', businessName: '' })}
                          style={{ accentColor: '#10b981' }} />
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1f2937' }}>Individual</span>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Personal SSN</p>
                        </div>
                      </label>
                      <label style={{
                        flex: 1, display: 'flex', alignItems: 'center', gap: '0.5rem',
                        padding: '0.6rem 0.75rem',
                        border: taxFormData.accountType === 'business' ? '2px solid #10b981' : '2px solid #d1d5db',
                        borderRadius: '8px', cursor: 'pointer',
                        background: taxFormData.accountType === 'business' ? '#f0fdf4' : '#fff'
                      }}>
                        <input type="radio" value="business" checked={taxFormData.accountType === 'business'}
                          onChange={() => setTaxFormData({ accountType: 'business', taxId: '', businessName: '' })}
                          style={{ accentColor: '#10b981' }} />
                        <div>
                          <span style={{ fontWeight: '600', fontSize: '0.9rem', color: '#1f2937' }}>Business / LLC</span>
                          <p style={{ fontSize: '0.75rem', color: '#6b7280', margin: 0 }}>Company EIN</p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {taxFormData.accountType === 'business' && (
                    <div style={{ marginBottom: '1rem' }}>
                      <label style={{ display: 'block', fontWeight: '600', fontSize: '0.9rem', color: '#374151', marginBottom: '0.35rem' }}>Business Name</label>
                      <input type="text" value={taxFormData.businessName}
                        onChange={(e) => setTaxFormData({ ...taxFormData, businessName: e.target.value })}
                        placeholder="e.g., United Fleet Services LLC"
                        style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', background: '#fff', color: '#374151' }}
                        required />
                    </div>
                  )}

                  <div style={{ marginBottom: '1rem' }}>
                    <label style={{ display: 'block', fontWeight: '600', fontSize: '0.9rem', color: '#374151', marginBottom: '0.35rem' }}>
                      {taxFormData.accountType === 'individual' ? 'Social Security Number (SSN)' : 'Employer ID Number (EIN)'}
                    </label>
                    <input type="text" value={taxFormData.taxId}
                      onChange={handleTaxIdInput}
                      placeholder={taxFormData.accountType === 'individual' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                      maxLength={taxFormData.accountType === 'individual' ? 11 : 10}
                      style={{ width: '100%', padding: '0.6rem 0.75rem', border: '1px solid #d1d5db', borderRadius: '8px', fontSize: '0.9rem', background: '#fff', color: '#374151' }}
                      required />
                    <p style={{ fontSize: '0.75rem', color: '#9ca3af', marginTop: '0.25rem' }}>
                      Stored securely. Only the last 4 digits will be visible on your account.
                    </p>
                  </div>

                  {taxMessage && (
                    <p style={{ fontSize: '0.85rem', color: taxMessage.includes('success') ? '#10b981' : '#ef4444', marginBottom: '0.75rem' }}>{taxMessage}</p>
                  )}

                  <button type="submit" className="btn btn-primary" disabled={taxSaving}
                    style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}>
                    {taxSaving ? 'Saving...' : 'Save Tax Information'}
                  </button>
                </form>
              )}
            </div>
          )}

          {vehicles.length === 0 ? (
            <div className="empty-state">
              <h2>No vehicles listed yet</h2>
              <p>Start earning by listing your first vehicle</p>
              <Link to="/host/add-vehicle">
                <button className="btn btn-primary mt-3">List Your First Car</button>
              </Link>
            </div>
          ) : (
            (() => {
              // Group vehicles by zip code
              const grouped = {};
              vehicles.forEach(v => {
                const zip = v.location?.zipCode || 'No Zip Code';
                if (!grouped[zip]) grouped[zip] = [];
                grouped[zip].push(v);
              });
              const sortedZips = Object.keys(grouped).sort((a, b) => {
                if (a === 'No Zip Code') return 1;
                if (b === 'No Zip Code') return -1;
                return a.localeCompare(b);
              });

              return sortedZips.map(zip => (
                <div key={zip} style={{ marginBottom: '2rem' }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    marginBottom: '1rem',
                    paddingBottom: '0.5rem',
                    borderBottom: '2px solid #10b981'
                  }}>
                    <span style={{
                      background: '#10b981',
                      color: '#000',
                      padding: '0.25rem 0.75rem',
                      borderRadius: '0.375rem',
                      fontWeight: '700',
                      fontSize: '1rem'
                    }}>
                      {zip}
                    </span>
                    {(() => {
                      const loc = grouped[zip][0]?.location;
                      const cityState = [loc?.city, loc?.state].filter(Boolean).join(', ');
                      return cityState ? (
                        <span style={{ color: '#4b5563', fontSize: '0.95rem', fontWeight: '500' }}>
                          {cityState}
                        </span>
                      ) : null;
                    })()}
                    <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                      {grouped[zip].length} vehicle{grouped[zip].length !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="host-vehicles-grid">
                    {grouped[zip].map(vehicle => (
                <div key={vehicle._id} className="host-vehicle-card">
                  <div className="host-vehicle-image">
                    {vehicle.images?.[0] ? (
                      <img src={getImageUrl(vehicle.images[0])} alt={`${vehicle.make} ${vehicle.model}`} />
                    ) : (
                      <div className="vehicle-placeholder">No Image</div>
                    )}
                    <div className={`availability-badge ${vehicle.availability ? 'available' : 'unavailable'}`}>
                      {vehicle.availability ? 'Available' : 'Unavailable'}
                    </div>
                  </div>

                  <div className="host-vehicle-info">
                    <h3 className="host-vehicle-title">
                      {vehicle.year} {vehicle.make} {vehicle.model}
                    </h3>

                    <div className="host-vehicle-stats">
                      <div className="stat-item">
                        <span className="stat-label">Pricing</span>
                        <span className="stat-value" style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.9rem' }}>
                          <div>${vehicle.pricePerDay}/day</div>
                          {vehicle.pricePerWeek && <div style={{ fontSize: '0.85rem' }}>${vehicle.pricePerWeek}/week</div>}
                          {vehicle.pricePerMonth && <div style={{ fontSize: '0.85rem' }}>${vehicle.pricePerMonth}/month</div>}
                        </span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Trips</span>
                        <span className="stat-value">{vehicle.tripCount}</span>
                      </div>
                      <div className="stat-item">
                        <span className="stat-label">Rating</span>
                        <span className="stat-value">
                          {vehicle.rating > 0 ? `⭐ ${vehicle.rating.toFixed(1)}` : 'No ratings'}
                        </span>
                      </div>
                    </div>

                    <div className="host-vehicle-actions">
                      <Link to={`/vehicle/${vehicle._id}`}>
                        <button className="btn-action">View</button>
                      </Link>
                      <Link to={`/host/edit-vehicle/${vehicle._id}`}>
                        <button className="btn-action">Edit</button>
                      </Link>
                      <button
                        onClick={() => toggleAvailability(vehicle._id, vehicle.availability)}
                        className="btn-action"
                      >
                        {vehicle.availability ? 'Mark Unavailable' : 'Mark Available'}
                      </button>
                      <button
                        onClick={() => handleDelete(vehicle._id)}
                        className="btn-action btn-action-danger"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                    ))}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      </div>
    </div>
  );
};

export default HostDashboard;
