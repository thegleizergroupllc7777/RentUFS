import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import './Host.css';

const HostDashboard = () => {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchVehicles();
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

          {vehicles.length === 0 ? (
            <div className="empty-state">
              <h2>No vehicles listed yet</h2>
              <p>Start earning by listing your first vehicle</p>
              <Link to="/host/add-vehicle">
                <button className="btn btn-primary mt-3">List Your First Car</button>
              </Link>
            </div>
          ) : (
            <div className="host-vehicles-grid">
              {vehicles.map(vehicle => (
                <div key={vehicle._id} className="host-vehicle-card">
                  <div className="host-vehicle-image">
                    {vehicle.images?.[0] ? (
                      <img src={vehicle.images[0]} alt={`${vehicle.make} ${vehicle.model}`} />
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
          )}
        </div>
      </div>
    </div>
  );
};

export default HostDashboard;
