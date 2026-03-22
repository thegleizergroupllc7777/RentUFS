import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Host.css';

const HostReports = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [period, setPeriod] = useState('month');
  const [customRange, setCustomRange] = useState({ startDate: '', endDate: '' });
  const [reportData, setReportData] = useState(null);
  const [openSections, setOpenSections] = useState({ income: true, bookings: false, fleet: false, recent: false });

  useEffect(() => {
    fetchReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const toggleSection = (section) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  const getPeriodLabel = () => {
    const now = new Date();
    const EST_OFFSET = 5;
    const fmt = (d, includeYear) => {
      const est = new Date(d.getTime() - EST_OFFSET * 60 * 60 * 1000);
      return includeYear
        ? `${est.getUTCMonth() + 1}/${est.getUTCDate()}/${est.getUTCFullYear()}`
        : `${est.getUTCMonth() + 1}/${est.getUTCDate()}`;
    };
    switch (period) {
      case 'today': return 'Today';
      case 'week': {
        const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
        const dow = nowEST.getUTCDay();
        const daysSinceMon = dow === 0 ? 6 : dow - 1;
        const start = new Date(Date.UTC(nowEST.getUTCFullYear(), nowEST.getUTCMonth(), nowEST.getUTCDate() - daysSinceMon, EST_OFFSET, 0, 0, 0));
        const end = new Date(start.getTime() + 7 * 86400000 - 1);
        return `This Week (${fmt(start)} – ${fmt(end)})`;
      }
      case 'month': {
        const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
        const y = nowEST.getUTCFullYear(), m = nowEST.getUTCMonth();
        const start = new Date(Date.UTC(y, m, 1, EST_OFFSET));
        const end = new Date(Date.UTC(y, m + 1, 1, EST_OFFSET) - 1);
        return `This Month (${fmt(start)} – ${fmt(end)})`;
      }
      case 'year': {
        const nowEST = new Date(now.getTime() - EST_OFFSET * 60 * 60 * 1000);
        const y = nowEST.getUTCFullYear();
        const start = new Date(Date.UTC(y, 0, 1, EST_OFFSET));
        const end = new Date(Date.UTC(y + 1, 0, 1, EST_OFFSET) - 1);
        return `This Year (${fmt(start, true)} – ${fmt(end, true)})`;
      }
      case 'custom': return 'Custom Range';
      default: return '';
    }
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
        <div className="container" style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div className="host-header">
            <h1 className="page-title">Reports & Analytics</h1>
            <div className="host-actions">
              <Link to="/driver/profile?tab=reports">
                <button className="btn btn-secondary">Back to Profile</button>
              </Link>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          {/* Period Filter */}
          <div className="report-period-bar">
            {['today', 'week', 'month', 'year', 'custom'].map(p => (
              <button
                key={p}
                className={`report-period-pill ${period === p ? 'active' : ''}`}
                onClick={() => setPeriod(p)}
              >
                {p === 'today' ? 'Today' : p === 'week' ? 'This Week' : p === 'month' ? 'This Month' : p === 'year' ? 'This Year' : 'Custom'}
              </button>
            ))}
          </div>

          {period === 'custom' && (
            <form onSubmit={handleCustomRangeSubmit} className="report-custom-range">
              <input
                type="date"
                value={customRange.startDate}
                onChange={(e) => setCustomRange({ ...customRange, startDate: e.target.value })}
                className="report-date-input"
              />
              <span style={{ color: '#9ca3af' }}>to</span>
              <input
                type="date"
                value={customRange.endDate}
                onChange={(e) => setCustomRange({ ...customRange, endDate: e.target.value })}
                className="report-date-input"
              />
              <button type="submit" className="btn btn-primary" style={{ padding: '0.5rem 1.25rem' }}>Apply</button>
            </form>
          )}

          {reportData && (
            <div className="report-accordion">

              {/* INCOME REPORTS */}
              <div className="report-accordion-item">
                <button className={`report-accordion-header ${openSections.income ? 'open' : ''}`} onClick={() => toggleSection('income')}>
                  <div className="report-accordion-title">
                    <span className="report-accordion-icon">$</span>
                    <span>Income Reports</span>
                  </div>
                  <span className="report-accordion-arrow">{openSections.income ? '\u25B2' : '\u25BC'}</span>
                </button>
                {openSections.income && (
                  <div className="report-accordion-body">
                    <p className="report-period-label">{getPeriodLabel()}</p>

                    <div className="report-income-grid">
                      <div className="report-income-card main">
                        <span className="report-income-label">Your Earnings</span>
                        <span className="report-income-amount">{formatCurrency(reportData.summary.hostEarnings || 0)}</span>
                        <span className="report-income-sub">
                          Rental income from {reportData.summary.confirmedBookings} booking{reportData.summary.confirmedBookings !== 1 ? 's' : ''}
                          {(reportData.summary.hostPlatformFees || 0) > 0 && (
                            <> (after {formatCurrency(reportData.summary.hostPlatformFees)} in platform fees)</>
                          )}
                        </span>
                      </div>
                      <div className="report-income-card">
                        <span className="report-income-label">Total Collected</span>
                        <span className="report-income-amount">{formatCurrency(reportData.summary.totalRevenue)}</span>
                        <span className="report-income-sub">Includes fees &amp; insurance</span>
                      </div>
                      <div className="report-income-card">
                        <span className="report-income-label">Platform (Fees + Insurance)</span>
                        <span className="report-income-amount" style={{ color: '#9ca3af' }}>{formatCurrency(reportData.summary.platformRevenue || 0)}</span>
                        <span className="report-income-sub">Retained by RentUFS</span>
                      </div>
                      <div className="report-income-card">
                        <span className="report-income-label">Pending</span>
                        <span className="report-income-amount pending">{formatCurrency(reportData.summary.pendingRevenue)}</span>
                        <span className="report-income-sub">{reportData.summary.pendingBookingsCount || 0} awaiting payment</span>
                      </div>
                      <div className="report-income-card">
                        <span className="report-income-label">Avg per Booking</span>
                        <span className="report-income-amount">{formatCurrency(reportData.summary.averageBookingValue)}</span>
                        <span className="report-income-sub">{reportData.summary.totalDaysBooked} total days booked</span>
                      </div>
                    </div>

                    {/* Revenue Chart - only show on Today tab */}
                    {period === 'today' && reportData.dailyRevenue && reportData.dailyRevenue.length > 0 && (
                      <div className="report-chart-section">
                        <h4 className="report-subsection-title">Daily Earnings</h4>
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
                  </div>
                )}
              </div>

              {/* BOOKING REPORTS */}
              <div className="report-accordion-item">
                <button className={`report-accordion-header ${openSections.bookings ? 'open' : ''}`} onClick={() => toggleSection('bookings')}>
                  <div className="report-accordion-title">
                    <span className="report-accordion-icon">#</span>
                    <span>Booking Reports</span>
                  </div>
                  <span className="report-accordion-arrow">{openSections.bookings ? '\u25B2' : '\u25BC'}</span>
                </button>
                {openSections.bookings && (
                  <div className="report-accordion-body">
                    <p className="report-period-label">{getPeriodLabel()}</p>

                    <div className="report-booking-stats">
                      <div className="report-stat-row">
                        <span className="report-stat-label">Total Bookings</span>
                        <span className="report-stat-value">{reportData.summary.totalBookings}</span>
                      </div>
                      <div className="report-stat-row">
                        <span className="report-stat-label">Confirmed / Active / Completed</span>
                        <span className="report-stat-value" style={{ color: '#10b981' }}>{reportData.summary.confirmedBookings}</span>
                      </div>
                      <div className="report-stat-row">
                        <span className="report-stat-label">Cancelled</span>
                        <span className="report-stat-value" style={{ color: '#ef4444' }}>{reportData.summary.cancelledBookings}</span>
                      </div>
                      <div className="report-stat-row">
                        <span className="report-stat-label">Total Days Booked</span>
                        <span className="report-stat-value">{reportData.summary.totalDaysBooked}</span>
                      </div>
                      {reportData.summary.abandonedPendingCount > 0 && (
                        <div className="report-stat-row">
                          <span className="report-stat-label">Incomplete Checkouts</span>
                          <span className="report-stat-value" style={{ color: '#9ca3af' }}>{reportData.summary.abandonedPendingCount}</span>
                        </div>
                      )}
                    </div>

                  </div>
                )}
              </div>

              {/* RECENT ACTIVITY */}
              <div className="report-accordion-item">
                <button className={`report-accordion-header ${openSections.recent ? 'open' : ''}`} onClick={() => toggleSection('recent')}>
                  <div className="report-accordion-title">
                    <span className="report-accordion-icon">&#9201;</span>
                    <span>Recent Activity</span>
                  </div>
                  <span className="report-accordion-arrow">{openSections.recent ? '\u25B2' : '\u25BC'}</span>
                </button>
                {openSections.recent && (
                  <div className="report-accordion-body">
                    {reportData.recentBookings.length === 0 ? (
                      <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>No recent activity for this period</p>
                    ) : (
                      <div className="report-bookings-list">
                        {reportData.recentBookings.map((booking) => (
                          <div key={booking.id} className="report-booking-row">
                            <div className="report-booking-info">
                              <span className="report-booking-vehicle">{booking.reservationId || 'No ID'}</span>
                              <span className="report-booking-detail">{booking.vehicleName} &middot; {booking.driverName} &middot; {booking.totalDays} day{booking.totalDays !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="report-booking-right">
                              <span className="report-booking-price">{formatCurrency(booking.totalPrice)}</span>
                              <div className="report-booking-badges">
                                <span className={`status-badge status-${booking.status}`}>{booking.status}</span>
                                <span className={`status-badge payment-${booking.paymentStatus}`}>{booking.paymentStatus}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* FLEET PERFORMANCE */}
              <div className="report-accordion-item">
                <button className={`report-accordion-header ${openSections.fleet ? 'open' : ''}`} onClick={() => toggleSection('fleet')}>
                  <div className="report-accordion-title">
                    <span className="report-accordion-icon">&#9881;</span>
                    <span>Fleet Performance</span>
                  </div>
                  <span className="report-accordion-arrow">{openSections.fleet ? '\u25B2' : '\u25BC'}</span>
                </button>
                {openSections.fleet && (
                  <div className="report-accordion-body">
                    <p className="report-period-label">{getPeriodLabel()}</p>

                    {reportData.vehicleStats.length === 0 ? (
                      <p style={{ color: '#9ca3af', textAlign: 'center', padding: '2rem 0' }}>No vehicle data for this period</p>
                    ) : (
                      <div className="report-fleet-list">
                        {reportData.vehicleStats.map((vehicle) => (
                          <div key={vehicle.vehicleId} className="report-fleet-card">
                            <div className="report-fleet-header">
                              {vehicle.vehicleImage ? (
                                <img src={getImageUrl(vehicle.vehicleImage)} alt={vehicle.vehicleName} className="report-fleet-img" />
                              ) : (
                                <div className="report-fleet-img-placeholder">No Image</div>
                              )}
                              <div className="report-fleet-info">
                                {vehicle.vehicleNickname && (
                                  <span className="report-fleet-nickname">"{vehicle.vehicleNickname}"</span>
                                )}
                                <span className="report-fleet-name">{vehicle.vehicleName}</span>
                                <span className="report-fleet-bookings">{vehicle.totalBookings} booking{vehicle.totalBookings !== 1 ? 's' : ''} ({vehicle.confirmedBookings} confirmed)</span>
                              </div>
                            </div>
                            <div className="report-fleet-metrics">
                              <div className="report-fleet-metric">
                                <span className="report-fleet-metric-label">Your Earnings</span>
                                <span className="report-fleet-metric-value">{formatCurrency(vehicle.hostEarnings || 0)}</span>
                                {(vehicle.hostPlatformFees || 0) > 0 && (
                                  <span className="report-fleet-metric-label" style={{ fontSize: '0.7rem', marginTop: '0.15rem' }}>({formatCurrency(vehicle.hostPlatformFees)} in fees)</span>
                                )}
                              </div>
                              <div className="report-fleet-metric">
                                <span className="report-fleet-metric-label">Total Collected</span>
                                <span className="report-fleet-metric-value" style={{ color: '#9ca3af' }}>{formatCurrency(vehicle.totalRevenue)}</span>
                              </div>
                              <div className="report-fleet-metric">
                                <span className="report-fleet-metric-label">Platform</span>
                                <span className="report-fleet-metric-value" style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{formatCurrency(vehicle.platformRevenue || 0)}</span>
                              </div>
                              <div className="report-fleet-metric">
                                <span className="report-fleet-metric-label">Pending</span>
                                <span className="report-fleet-metric-value" style={{ color: '#f59e0b' }}>{formatCurrency(vehicle.pendingRevenue)}</span>
                              </div>
                              <div className="report-fleet-metric">
                                <span className="report-fleet-metric-label">Days Rented</span>
                                <span className="report-fleet-metric-value">{vehicle.totalDays}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostReports;
