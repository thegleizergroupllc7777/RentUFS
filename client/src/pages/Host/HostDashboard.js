import React, { useState, useEffect, useMemo } from 'react';
import { Link, useLocation } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Host.css';

const HostDashboard = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [taxInfo, setTaxInfo] = useState(null);
  const [tollspotActive, setTollspotActive] = useState(null);
  const [rentedVehicleIds, setRentedVehicleIds] = useState(new Set());
  const [viewMode, setViewMode] = useState(() => localStorage.getItem('hostVehicleView') || 'grid');
  const location = useLocation();

  const handleViewChange = (mode) => {
    setViewMode(mode);
    localStorage.setItem('hostVehicleView', mode);
  };

  useEffect(() => {
    fetchDashboardData();
    fetchTaxInfo();
    fetchIntegrations();
  }, [location.key]);

  const fetchDashboardData = async () => {
    try {
      const token = localStorage.getItem('token');
      const [vehiclesRes, bookingsRes] = await Promise.all([
        axios.get(`${API_URL}/api/vehicles/host/my-vehicles`, {
          headers: { Authorization: `Bearer ${token}` }
        }),
        axios.get(`${API_URL}/api/bookings/host-bookings`, {
          headers: { Authorization: `Bearer ${token}` }
        })
      ]);

      setVehicles(vehiclesRes.data);

      // Only count bookings as rented if the rental period has started and hasn't fully passed
      // Use date-string comparison to avoid UTC/timezone shift issues
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
      const activeBookings = bookingsRes.data.filter(b => {
        if (!['confirmed', 'active'].includes(b.status)) return false;
        // Extract YYYY-MM-DD from the ISO string to avoid timezone conversion
        const startStr = typeof b.startDate === 'string' ? b.startDate.split('T')[0] : new Date(b.startDate).toISOString().split('T')[0];
        const endStr = typeof b.endDate === 'string' ? b.endDate.split('T')[0] : new Date(b.endDate).toISOString().split('T')[0];
        // Vehicle is only rented if the rental period has started (startDate <= today) and not yet ended
        return startStr <= todayStr && endStr >= todayStr;
      });
      const ids = new Set(activeBookings.map(b => {
        const id = typeof b.vehicle === 'object' ? b.vehicle._id : b.vehicle;
        return String(id);
      }));
      setRentedVehicleIds(ids);
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
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
      fetchDashboardData();
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
      fetchDashboardData();
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

  const fetchIntegrations = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await axios.get(`${API_URL}/api/users/integrations`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTollspotActive(res.data.tollspot?.active || false);
    } catch (error) {
      console.error('Error fetching integrations:', error);
      setTollspotActive(false);
    }
  };

  // Memoize vehicle grouping by zip code to avoid recalculating on every render
  const groupedVehicles = useMemo(() => {
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
    return { grouped, sortedZips };
  }, [vehicles]);

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
              <Link to="/host/bookings">
                <button className="btn btn-secondary">View Bookings</button>
              </Link>
              <Link to="/host/add-vehicle">
                <button className="btn btn-primary">Add New Vehicle</button>
              </Link>
            </div>
          </div>

          {/* Tax Info Link - only show until host submits tax info */}
          {taxInfo && !taxInfo.hasSubmitted && (
            <div style={{
              background: '#1a1200',
              border: '1px solid #fde68a',
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
                <p style={{ fontSize: '0.85rem', color: '#fbbf24', margin: 0 }}>
                  Please add your tax information for 1099 reporting and payouts.
                </p>
              </div>
              <Link to="/driver/profile?tab=tax">
                <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                  Add Tax Info
                </button>
              </Link>
            </div>
          )}

          {/* TollSpot Integration Banner - only show when not connected */}
          {tollspotActive !== null && !tollspotActive && (
            <div style={{
              background: '#001a1a',
              border: '1px solid #5eead4',
              borderRadius: '12px',
              padding: '1rem 1.5rem',
              marginBottom: '1.5rem',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h3 style={{ fontSize: '1rem', fontWeight: '600', color: '#f9fafb', marginBottom: '0.25rem' }}>
                  TollSpot Integration
                </h3>
                <p style={{ fontSize: '0.85rem', color: '#5eead4', margin: 0 }}>
                  Sign up with TollSpot for easier toll management on your rental vehicles.
                </p>
              </div>
              <Link to="/driver/profile?tab=integrations">
                <button className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
                  Set Up TollSpot
                </button>
              </Link>
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
            <>
              {/* View Toggle */}
              <div className="view-toggle">
                <button
                  className={`view-toggle-btn ${viewMode === 'grid' ? 'active' : ''}`}
                  onClick={() => handleViewChange('grid')}
                  title="Grid view"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                    <rect x="0" y="0" width="8" height="8" rx="1.5" />
                    <rect x="10" y="0" width="8" height="8" rx="1.5" />
                    <rect x="0" y="10" width="8" height="8" rx="1.5" />
                    <rect x="10" y="10" width="8" height="8" rx="1.5" />
                  </svg>
                </button>
                <button
                  className={`view-toggle-btn ${viewMode === 'list' ? 'active' : ''}`}
                  onClick={() => handleViewChange('list')}
                  title="List view"
                >
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
                    <rect x="0" y="1" width="18" height="4" rx="1.5" />
                    <rect x="0" y="7" width="18" height="4" rx="1.5" />
                    <rect x="0" y="13" width="18" height="4" rx="1.5" />
                  </svg>
                </button>
              </div>

              {groupedVehicles.sortedZips.map(zip => (
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
                      const loc = groupedVehicles.grouped[zip][0]?.location;
                      const cityState = [loc?.city, loc?.state].filter(Boolean).join(', ');
                      return cityState ? (
                        <span style={{ color: '#4b5563', fontSize: '0.95rem', fontWeight: '500' }}>
                          {cityState}
                        </span>
                      ) : null;
                    })()}
                    <span style={{ color: '#9ca3af', fontSize: '0.9rem' }}>
                      {groupedVehicles.grouped[zip].length} vehicle{groupedVehicles.grouped[zip].length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Grid View */}
                  {viewMode === 'grid' && (
                  <div className="host-vehicles-grid">
                    {groupedVehicles.grouped[zip].map(vehicle => (
                <div key={vehicle._id} className={`host-vehicle-card ${rentedVehicleIds.has(String(vehicle._id)) ? 'rented' : ''}`}>
                  <div className="host-vehicle-image">
                    {vehicle.images?.[0] ? (
                      <img src={getImageUrl(vehicle.images[0])} alt={`${vehicle.make} ${vehicle.model}`} />
                    ) : (
                      <div className="vehicle-placeholder">No Image</div>
                    )}
                    {rentedVehicleIds.has(String(vehicle._id)) && <div className="rented-overlay"></div>}
                    <div className={`availability-badge ${rentedVehicleIds.has(String(vehicle._id)) ? 'rented' : vehicle.availability ? 'available' : 'unavailable'}`}>
                      {rentedVehicleIds.has(String(vehicle._id)) ? 'Rented' : vehicle.availability ? 'Available' : 'Unavailable'}
                    </div>
                  </div>

                  <div className="host-vehicle-info">
                    <h3 className="host-vehicle-title">
                      {vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                    </h3>
                    {vehicle.nickname && (
                      <p style={{ color: '#9ca3af', fontSize: '0.85rem', margin: '0.25rem 0 0 0' }}>
                        {vehicle.year} {vehicle.make} {vehicle.model}
                      </p>
                    )}

                    {vehicle.tollspot?.status && vehicle.tollspot.status !== 'none' && (
                      <div style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '0.35rem',
                        marginTop: '0.35rem',
                        padding: '0.2rem 0.6rem',
                        borderRadius: '0.375rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        background: vehicle.tollspot.status === 'registered' ? '#064e3b' : '#1a1a2e',
                        color: vehicle.tollspot.status === 'registered' ? '#34d399' : '#93c5fd',
                        border: `1px solid ${vehicle.tollspot.status === 'registered' ? '#10b981' : '#3b82f6'}`
                      }}>
                        <span style={{ fontSize: '0.7rem' }}>
                          {vehicle.tollspot.status === 'registered' ? '\u2713' : '\u25CB'}
                        </span>
                        Tolls: {vehicle.tollspot.status === 'pre_registered' ? 'Registering' :
                                vehicle.tollspot.status === 'registered' ? 'Active' :
                                vehicle.tollspot.status === 'unregister_scheduled' ? 'Removing' : vehicle.tollspot.status}
                      </div>
                    )}

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
                    </div>
                  </div>
                </div>
                    ))}
                  </div>
                  )}

                  {/* List View */}
                  {viewMode === 'list' && (
                  <div className="host-vehicles-list">
                    {groupedVehicles.grouped[zip].map(vehicle => {
                      const isRented = rentedVehicleIds.has(String(vehicle._id));
                      return (
                    <div key={vehicle._id} className={`host-vehicle-card-list ${isRented ? 'rented' : ''}`}>
                      <div className="list-vehicle-image">
                        {vehicle.images?.[0] ? (
                          <img src={getImageUrl(vehicle.images[0])} alt={`${vehicle.make} ${vehicle.model}`} />
                        ) : (
                          <div className="vehicle-placeholder">No Image</div>
                        )}
                        {isRented && <div className="rented-overlay"></div>}
                        <div className={`availability-badge ${isRented ? 'rented' : vehicle.availability ? 'available' : 'unavailable'}`}>
                          {isRented ? 'Rented' : vehicle.availability ? 'Available' : 'Unavailable'}
                        </div>
                      </div>

                      <div className="list-vehicle-content">
                        <div className="list-vehicle-header">
                          <div>
                            <h3 className="host-vehicle-title" style={{ marginBottom: '0.25rem' }}>
                              {vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
                            </h3>
                            {vehicle.nickname && (
                              <p style={{ color: '#9ca3af', fontSize: '0.75rem', margin: 0 }}>
                                {vehicle.year} {vehicle.make} {vehicle.model}
                              </p>
                            )}
                          </div>
                          <div className="list-vehicle-pricing">
                            <span className="list-price-main">${vehicle.pricePerDay}/day</span>
                            {vehicle.pricePerWeek && <span className="list-price-sub">${vehicle.pricePerWeek}/wk</span>}
                            {vehicle.pricePerMonth && <span className="list-price-sub">${vehicle.pricePerMonth}/mo</span>}
                          </div>
                        </div>

                        <div className="list-vehicle-meta">
                          <span>{vehicle.type}</span>
                          <span>{vehicle.transmission}</span>
                          <span>{vehicle.seats} seats</span>
                          <span>{vehicle.tripCount} trip{vehicle.tripCount !== 1 ? 's' : ''}</span>
                          <span>{vehicle.rating > 0 ? `${vehicle.rating.toFixed(1)} rating` : 'No ratings'}</span>
                          {vehicle.tollspot?.status && vehicle.tollspot.status !== 'none' && (
                            <span style={{
                              color: vehicle.tollspot.status === 'registered' ? '#34d399' : '#93c5fd',
                              fontWeight: '600'
                            }}>
                              Tolls: {vehicle.tollspot.status === 'pre_registered' ? 'Registering' :
                                      vehicle.tollspot.status === 'registered' ? 'Active' :
                                      vehicle.tollspot.status === 'unregister_scheduled' ? 'Removing' : vehicle.tollspot.status}
                            </span>
                          )}
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
                        </div>
                      </div>
                    </div>
                      );
                    })}
                  </div>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostDashboard;
