import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import './Host.css';

const HostReports = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('month');
  const [customRange, setCustomRange] = useState({ startDate: '', endDate: '' });
  const [reportData, setReportData] = useState(null);

  useEffect(() => {
    fetchReports();
  }, [period]);

  const fetchReports = async () => {
    setLoading(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      let url = `${API_URL}/api/reports/host?period=${period}`;

      if (period === 'custom' && customRange.startDate && customRange.endDate) {
        url = `${API_URL}/api/reports/host?startDate=${customRange.startDate}&endDate=${customRange.endDate}`;
      }

      const response = await axios.get(url, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setReportData(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to fetch reports');
    } finally {
      setLoading(false);
    }
  };

  const handleCustomRangeSubmit = (e) => {
    e.preventDefault();
    if (customRange.startDate && customRange.endDate) {
      fetchReports();
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="page">
          <div className="container">
            <div className="loading-spinner">
              <div className="spinner"></div>
              <p>Loading reports...</p>
            </div>
          </div>
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
            <h1 className="page-title">Reports & Analytics</h1>
            <div className="host-actions">
              <Link to="/host/dashboard">
                <button className="btn btn-secondary">Back to Dashboard</button>
              </Link>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {/* Period Filter */}
          <div className="reports-filter-section">
            <div className="period-buttons">
              <button
                className={`period-btn ${period === 'today' ? 'active' : ''}`}
                onClick={() => setPeriod('today')}
              >
                Today
              </button>
              <button
                className={`period-btn ${period === 'week' ? 'active' : ''}`}
                onClick={() => setPeriod('week')}
              >
                Last 7 Days
              </button>
              <button
                className={`period-btn ${period === 'month' ? 'active' : ''}`}
                onClick={() => setPeriod('month')}
              >
                Last 30 Days
              </button>
              <button
                className={`period-btn ${period === 'year' ? 'active' : ''}`}
                onClick={() => setPeriod('year')}
              >
                Last Year
              </button>
              <button
                className={`period-btn ${period === 'all' ? 'active' : ''}`}
                onClick={() => setPeriod('all')}
              >
                All Time
              </button>
              <button
                className={`period-btn ${period === 'custom' ? 'active' : ''}`}
                onClick={() => setPeriod('custom')}
              >
                Custom
              </button>
            </div>

            {period === 'custom' && (
              <form onSubmit={handleCustomRangeSubmit} className="custom-range-form">
                <div className="form-group">
                  <label>Start Date</label>
                  <input
                    type="date"
                    value={customRange.startDate}
                    onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value })}
                    className="form-control"
                  />
                </div>
                <div className="form-group">
                  <label>End Date</label>
                  <input
                    type="date"
                    value={customRange.endDate}
                    onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value })}
                    className="form-control"
                  />
                </div>
                <button type="submit" className="btn btn-primary">Apply</button>
              </form>
            )}
          </div>

          {reportData && (
            <>
              {/* Summary Cards */}
              <div className="reports-summary-grid">
                <div className="summary-card">
                  <div className="summary-icon revenue-icon">$</div>
                  <div className="summary-content">
                    <h3>Total Revenue</h3>
                    <p className="summary-value">{formatCurrency(reportData.summary.totalRevenue)}</p>
                    <span className="summary-sub">From paid bookings</span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-icon pending-icon">$</div>
                  <div className="summary-content">
                    <h3>Pending Revenue</h3>
                    <p className="summary-value pending">{formatCurrency(reportData.summary.pendingRevenue)}</p>
                    <span className="summary-sub">
                      {reportData.summary.pendingBookingsCount || 0} active (last 7 days)
                      {reportData.summary.abandonedPendingCount > 0 && (
                        <span style={{ display: 'block', marginTop: '4px', color: '#9ca3af' }}>
                          +{reportData.summary.abandonedPendingCount} abandoned ({formatCurrency(reportData.summary.abandonedPendingRevenue || 0)})
                        </span>
                      )}
                    </span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-icon bookings-icon">#</div>
                  <div className="summary-content">
                    <h3>Total Bookings</h3>
                    <p className="summary-value">{reportData.summary.totalBookings}</p>
                    <span className="summary-sub">
                      {reportData.summary.confirmedBookings} confirmed, {reportData.summary.cancelledBookings} cancelled
                    </span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-icon days-icon">D</div>
                  <div className="summary-content">
                    <h3>Days Booked</h3>
                    <p className="summary-value">{reportData.summary.totalDaysBooked}</p>
                    <span className="summary-sub">
                      Avg: {formatCurrency(reportData.summary.averageBookingValue)} per booking
                    </span>
                  </div>
                </div>
              </div>

              {/* Revenue Chart */}
              {reportData.dailyRevenue && reportData.dailyRevenue.length > 0 && (
                <div className="reports-section">
                  <h2 className="section-title">Daily Revenue</h2>
                  <div className="revenue-chart">
                    <div className="chart-container">
                      {reportData.dailyRevenue.slice(-30).map((day, index) => {
                        const maxRevenue = Math.max(...reportData.dailyRevenue.map(d => d.revenue), 1);
                        const height = (day.revenue / maxRevenue) * 100;
                        return (
                          <div key={index} className="chart-bar-container">
                            <div
                              className="chart-bar"
                              style={{ height: `${Math.max(height, 2)}%` }}
                              title={`${day.date}: ${formatCurrency(day.revenue)}`}
                            >
                              {day.revenue > 0 && (
                                <span className="bar-tooltip">{formatCurrency(day.revenue)}</span>
                              )}
                            </div>
                            <span className="chart-label">
                              {new Date(day.date).getDate()}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Per-Vehicle Stats */}
              <div className="reports-section">
                <h2 className="section-title">Performance by Vehicle</h2>
                {reportData.vehicleStats.length === 0 ? (
                  <div className="empty-state">
                    <p>No vehicle data for this period</p>
                  </div>
                ) : (
                  <div className="vehicle-stats-grid">
                    {reportData.vehicleStats.map((vehicle) => (
                      <div key={vehicle.vehicleId} className="vehicle-stat-card">
                        <div className="vehicle-stat-header">
                          {vehicle.vehicleImage ? (
                            <img src={vehicle.vehicleImage} alt={vehicle.vehicleName} className="vehicle-stat-image" />
                          ) : (
                            <div className="vehicle-stat-image-placeholder">No Image</div>
                          )}
                          <div className="vehicle-stat-info">
                            <h3>{vehicle.vehicleName}</h3>
                            <p>{vehicle.totalBookings} bookings ({vehicle.confirmedBookings} confirmed)</p>
                          </div>
                        </div>
                        <div className="vehicle-stat-metrics">
                          <div className="metric">
                            <span className="metric-label">Revenue</span>
                            <span className="metric-value">{formatCurrency(vehicle.totalRevenue)}</span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Pending</span>
                            <span className="metric-value pending">{formatCurrency(vehicle.pendingRevenue)}</span>
                          </div>
                          <div className="metric">
                            <span className="metric-label">Days Rented</span>
                            <span className="metric-value">{vehicle.totalDays}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Bookings */}
              <div className="reports-section">
                <h2 className="section-title">Recent Bookings</h2>
                {reportData.recentBookings.length === 0 ? (
                  <div className="empty-state">
                    <p>No bookings for this period</p>
                  </div>
                ) : (
                  <div className="recent-bookings-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Vehicle</th>
                          <th>Driver</th>
                          <th>Dates</th>
                          <th>Amount</th>
                          <th>Status</th>
                          <th>Payment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reportData.recentBookings.map((booking) => (
                          <tr key={booking.id}>
                            <td>{booking.vehicleName}</td>
                            <td>{booking.driverName}</td>
                            <td>
                              {formatDate(booking.startDate)} - {formatDate(booking.endDate)}
                              <br />
                              <small>({booking.totalDays} days)</small>
                            </td>
                            <td>{formatCurrency(booking.totalPrice)}</td>
                            <td>
                              <span className={`status-badge status-${booking.status}`}>
                                {booking.status}
                              </span>
                            </td>
                            <td>
                              <span className={`status-badge payment-${booking.paymentStatus}`}>
                                {booking.paymentStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostReports;
