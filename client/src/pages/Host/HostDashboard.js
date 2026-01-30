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
    } catch (error) {
      console.error('Error fetching tax info:', error);
      setTaxInfo({ accountType: 'individual', taxIdLast4: '', businessName: '', hasSubmitted: false });
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

          {/* Tax Info Link */}
          <div style={{
            background: taxInfo?.hasSubmitted ? '#111' : '#1a1200',
            border: `1px solid ${taxInfo?.hasSubmitted ? '#333' : '#fde68a'}`,
            borderRadius: '12px',
            padding: '1rem 1.5rem',
            marginBottom: '1.5rem',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#f9fafb', marginBottom: '0.25rem' }}>
                Tax Information
              </h3>
              {taxInfo?.hasSubmitted ? (
                <p style={{ fontSize: '0.85rem', color: '#9ca3af', margin: 0 }}>
                  {taxInfo.accountType === 'business' ? `Business: ${taxInfo.businessName} | ` : 'Individual | '}
                  {taxInfo.accountType === 'individual' ? 'SSN' : 'EIN'} ending in ****{taxInfo.taxIdLast4}
                </p>
              ) : (
                <p style={{ fontSize: '0.85rem', color: '#fbbf24', margin: 0 }}>
                  Please add your tax information for 1099 reporting and payouts.
                </p>
              )}
            </div>
            <Link to="/host/tax-settings">
              <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                {taxInfo?.hasSubmitted ? 'Manage' : 'Add Tax Info'}
              </button>
            </Link>
          </div>

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
