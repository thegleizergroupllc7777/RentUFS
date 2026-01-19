import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import api from '../../utils/api';
import Navbar from '../../components/Navbar';
import './Host.css';
import './HostEarnings.css';

const HostEarnings = () => {
  const [earnings, setEarnings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedPeriod, setSelectedPeriod] = useState('month');

  useEffect(() => {
    fetchEarnings();
  }, []);

  const fetchEarnings = async () => {
    try {
      setLoading(true);
      const response = await api.get('/bookings/host-earnings');
      setEarnings(response.data);
      setError(null);
    } catch (err) {
      setError('Failed to load earnings data');
      console.error('Error fetching earnings:', err);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const getVehicleEarningsByPeriod = (vehicle) => {
    switch (selectedPeriod) {
      case 'today':
        return vehicle.todayEarnings;
      case 'week':
        return vehicle.weekEarnings;
      case 'month':
        return vehicle.monthEarnings;
      case 'total':
      default:
        return vehicle.totalEarnings;
    }
  };

  const getPeriodLabel = () => {
    switch (selectedPeriod) {
      case 'today':
        return "Today's";
      case 'week':
        return "This Week's";
      case 'month':
        return "This Month's";
      case 'total':
      default:
        return 'All Time';
    }
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="page">
          <div className="container">
            <div className="loading-state">Loading earnings data...</div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Navbar />
        <div className="page">
          <div className="container">
            <div className="error-state">{error}</div>
          </div>
        </div>
      </div>
    );
  }

  const { summary, vehicleEarnings } = earnings || { summary: {}, vehicleEarnings: [] };

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container">
      <div className="host-header">
        <h1>Earnings Dashboard</h1>
        <div className="host-actions">
          <Link to="/host/dashboard" className="btn btn-secondary">
            My Vehicles
          </Link>
          <Link to="/host/bookings" className="btn btn-secondary">
            Bookings
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="earnings-summary-grid">
        <div className="earnings-card earnings-card-primary">
          <div className="earnings-card-label">Total Earnings</div>
          <div className="earnings-card-value">{formatCurrency(summary.totalEarnings)}</div>
          <div className="earnings-card-meta">{summary.completedTrips || 0} completed trips</div>
        </div>
        <div className="earnings-card">
          <div className="earnings-card-label">Today</div>
          <div className="earnings-card-value">{formatCurrency(summary.todayEarnings)}</div>
        </div>
        <div className="earnings-card">
          <div className="earnings-card-label">This Week</div>
          <div className="earnings-card-value">{formatCurrency(summary.weekEarnings)}</div>
        </div>
        <div className="earnings-card">
          <div className="earnings-card-label">This Month</div>
          <div className="earnings-card-value">{formatCurrency(summary.monthEarnings)}</div>
        </div>
      </div>

      {/* Pending Earnings */}
      {summary.pendingEarnings > 0 && (
        <div className="pending-earnings-banner">
          <span className="pending-icon">&#8987;</span>
          <span>
            <strong>{formatCurrency(summary.pendingEarnings)}</strong> pending from {summary.activeBookings || 0} active booking(s)
          </span>
        </div>
      )}

      {/* Vehicle Earnings Section */}
      <div className="section-header">
        <h2>Earnings by Vehicle</h2>
        <div className="period-filter">
          <button
            className={`period-btn ${selectedPeriod === 'today' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('today')}
          >
            Today
          </button>
          <button
            className={`period-btn ${selectedPeriod === 'week' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('week')}
          >
            Week
          </button>
          <button
            className={`period-btn ${selectedPeriod === 'month' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('month')}
          >
            Month
          </button>
          <button
            className={`period-btn ${selectedPeriod === 'total' ? 'active' : ''}`}
            onClick={() => setSelectedPeriod('total')}
          >
            All Time
          </button>
        </div>
      </div>

      {vehicleEarnings.length === 0 ? (
        <div className="empty-state">
          <p>No earnings data yet. Complete some trips to see your vehicle performance!</p>
          <Link to="/host/add-vehicle" className="btn btn-primary">
            Add a Vehicle
          </Link>
        </div>
      ) : (
        <div className="vehicle-earnings-list">
          {vehicleEarnings.map((vehicle) => (
            <div key={vehicle.vehicleId} className="vehicle-earnings-card">
              <div className="vehicle-earnings-image">
                {vehicle.image ? (
                  <img src={vehicle.image} alt={`${vehicle.make} ${vehicle.model}`} />
                ) : (
                  <div className="no-image">No Image</div>
                )}
              </div>
              <div className="vehicle-earnings-info">
                <h3 className="vehicle-earnings-title">
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </h3>
                <div className="vehicle-earnings-stats">
                  <div className="stat-item">
                    <span className="stat-label">{getPeriodLabel()} Earnings</span>
                    <span className="stat-value stat-value-highlight">
                      {formatCurrency(getVehicleEarningsByPeriod(vehicle))}
                    </span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Total Earnings</span>
                    <span className="stat-value">{formatCurrency(vehicle.totalEarnings)}</span>
                  </div>
                  <div className="stat-item">
                    <span className="stat-label">Completed Trips</span>
                    <span className="stat-value">{vehicle.tripCount}</span>
                  </div>
                  {vehicle.pendingEarnings > 0 && (
                    <div className="stat-item">
                      <span className="stat-label">Pending</span>
                      <span className="stat-value stat-value-pending">
                        {formatCurrency(vehicle.pendingEarnings)}
                      </span>
                    </div>
                  )}
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

export default HostEarnings;
