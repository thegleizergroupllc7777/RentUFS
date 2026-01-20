import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import './Host.css';

const HostBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current'); // current, upcoming, past

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/bookings/host-bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (bookingId, newStatus) => {
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_URL}/api/bookings/${bookingId}/status`, {
        status: newStatus
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchBookings();
    } catch (error) {
      console.error('Error updating booking status:', error);
      alert('Failed to update booking status');
    }
  };

  const getStatusColor = (status) => {
    const colors = {
      pending: '#f59e0b',
      confirmed: '#10b981',
      active: '#3b82f6',
      completed: '#6b7280',
      cancelled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  // Categorize bookings into current, upcoming, and past
  const categorizeBookings = () => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const current = bookings.filter(booking => {
      const startDate = new Date(booking.startDate);
      const endDate = new Date(booking.endDate);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      // Include both active and confirmed bookings within the rental period
      return startDate <= now && endDate >= now &&
             (booking.status === 'active' || booking.status === 'confirmed');
    });

    const upcoming = bookings.filter(booking => {
      const startDate = new Date(booking.startDate);
      startDate.setHours(0, 0, 0, 0);
      return startDate > now && (booking.status === 'pending' || booking.status === 'confirmed');
    });

    const past = bookings.filter(booking => {
      const endDate = new Date(booking.endDate);
      endDate.setHours(23, 59, 59, 999);
      return endDate < now || booking.status === 'completed' || booking.status === 'cancelled';
    });

    return { current, upcoming, past };
  };

  const { current, upcoming, past } = categorizeBookings();

  // Check if a booking is overdue (past return date/time)
  const isOverdue = (booking) => {
    if (!['active', 'confirmed'].includes(booking.status)) return false;

    const now = new Date();
    const endDate = new Date(booking.endDate);

    // Parse dropoff time (default to 10:00 if not set)
    const dropoffTime = booking.dropoffTime || '10:00';
    const [hours, minutes] = dropoffTime.split(':').map(Number);
    endDate.setHours(hours, minutes, 0, 0);

    return now > endDate;
  };

  // Calculate how overdue a booking is
  const getOverdueInfo = (booking) => {
    const now = new Date();
    const endDate = new Date(booking.endDate);
    const dropoffTime = booking.dropoffTime || '10:00';
    const [hours, minutes] = dropoffTime.split(':').map(Number);
    endDate.setHours(hours, minutes, 0, 0);

    const diffMs = now - endDate;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays >= 1) {
      return `${diffDays} day${diffDays > 1 ? 's' : ''} overdue`;
    } else {
      return `${diffHours} hour${diffHours > 1 ? 's' : ''} overdue`;
    }
  };

  const getActiveBookings = () => {
    switch(activeTab) {
      case 'current':
        return current;
      case 'upcoming':
        return upcoming;
      case 'past':
        return past;
      default:
        return [];
    }
  };

  const activeBookings = getActiveBookings();

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
            <h1 className="page-title">Booking Requests</h1>
            <Link to="/host/dashboard">
              <button className="btn btn-secondary">Back to Dashboard</button>
            </Link>
          </div>

          {bookings.length === 0 ? (
            <div className="empty-state">
              <h2>No booking requests yet</h2>
              <p>Your booking requests will appear here</p>
              <Link to="/host/dashboard">
                <button className="btn btn-primary mt-3">View My Vehicles</button>
              </Link>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="tabs" style={{
                display: 'flex',
                gap: '1rem',
                marginBottom: '2rem',
                borderBottom: '2px solid #e5e7eb'
              }}>
                <button
                  onClick={() => setActiveTab('current')}
                  className={activeTab === 'current' ? 'tab-active' : 'tab'}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: activeTab === 'current' ? '#10b981' : 'transparent',
                    color: activeTab === 'current' ? 'white' : '#6b7280',
                    border: 'none',
                    borderRadius: '0.5rem 0.5rem 0 0',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '1rem'
                  }}
                >
                  Current ({current.length})
                </button>
                <button
                  onClick={() => setActiveTab('upcoming')}
                  className={activeTab === 'upcoming' ? 'tab-active' : 'tab'}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: activeTab === 'upcoming' ? '#10b981' : 'transparent',
                    color: activeTab === 'upcoming' ? 'white' : '#6b7280',
                    border: 'none',
                    borderRadius: '0.5rem 0.5rem 0 0',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '1rem'
                  }}
                >
                  Upcoming ({upcoming.length})
                </button>
                <button
                  onClick={() => setActiveTab('past')}
                  className={activeTab === 'past' ? 'tab-active' : 'tab'}
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: activeTab === 'past' ? '#10b981' : 'transparent',
                    color: activeTab === 'past' ? 'white' : '#6b7280',
                    border: 'none',
                    borderRadius: '0.5rem 0.5rem 0 0',
                    cursor: 'pointer',
                    fontWeight: '500',
                    fontSize: '1rem'
                  }}
                >
                  Past ({past.length})
                </button>
              </div>

              {/* Booking List */}
              {activeBookings.length === 0 ? (
                <div className="empty-state">
                  <p>No {activeTab} bookings.</p>
                </div>
              ) : (
                <div className="bookings-list">
                  {activeBookings.map(booking => (
                <div
                  key={booking._id}
                  className="booking-card host-booking-card"
                  style={isOverdue(booking) ? {
                    border: '3px solid #ef4444',
                    boxShadow: '0 0 10px rgba(239, 68, 68, 0.3)'
                  } : {}}
                >
                  {/* Overdue Warning Banner */}
                  {isOverdue(booking) && (
                    <div style={{
                      background: 'linear-gradient(90deg, #ef4444, #dc2626)',
                      color: 'white',
                      padding: '0.75rem 1rem',
                      marginBottom: '1rem',
                      borderRadius: '0.5rem',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      fontWeight: '600'
                    }}>
                      <span>
                        {getOverdueInfo(booking)} - Renter should extend or return immediately!
                      </span>
                      <span style={{ fontSize: '1.25rem' }}>!</span>
                    </div>
                  )}
                  <div className="booking-header">
                    {/* Vehicle thumbnail */}
                    <div style={{
                      width: '140px',
                      height: '100px',
                      borderRadius: '0.5rem',
                      overflow: 'hidden',
                      flexShrink: 0,
                      marginRight: '1rem',
                      backgroundColor: '#f3f4f6'
                    }}>
                      {booking.vehicle?.images?.[0] ? (
                        <img
                          src={booking.vehicle.images[0]}
                          alt={`${booking.vehicle.make} ${booking.vehicle.model}`}
                          style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'cover'
                          }}
                        />
                      ) : (
                        <div style={{
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: '#9ca3af',
                          fontSize: '0.875rem'
                        }}>
                          No Image
                        </div>
                      )}
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{
                        display: 'inline-block',
                        backgroundColor: '#f3f4f6',
                        padding: '0.25rem 0.5rem',
                        borderRadius: '0.25rem',
                        marginBottom: '0.5rem',
                        fontFamily: 'monospace',
                        fontSize: '0.875rem',
                        fontWeight: '600',
                        color: '#374151'
                      }}>
                        {booking.reservationId || `#${booking._id.slice(-8).toUpperCase()}`}
                      </div>
                      <h3 className="booking-vehicle">
                        {booking.vehicle?.year} {booking.vehicle?.make} {booking.vehicle?.model}
                      </h3>
                      <p className="text-gray">
                        Renter: {booking.driver?.firstName} {booking.driver?.lastName}
                      </p>
                      <p className="text-gray text-sm">
                        Email: {booking.driver?.email} | Phone: {booking.driver?.phone}
                      </p>
                    </div>
                    <div
                      className="booking-status"
                      style={{ backgroundColor: getStatusColor(booking.status) }}
                    >
                      {booking.status}
                    </div>
                  </div>

                  <div className="booking-details">
                    <div className="booking-detail-item">
                      <strong>Pickup:</strong>{' '}
                      {new Date(booking.startDate).toLocaleDateString()} at {booking.pickupTime || '10:00 AM'}
                    </div>
                    <div className="booking-detail-item">
                      <strong>Return:</strong>{' '}
                      {new Date(booking.endDate).toLocaleDateString()} by {booking.dropoffTime || '10:00 AM'}
                    </div>
                    <div className="booking-detail-item">
                      <strong>Duration:</strong> {booking.totalDays} days
                    </div>
                    <div className="booking-detail-item">
                      <strong>Total Price:</strong> ${booking.totalPrice}
                    </div>
                  </div>

                  {booking.message && (
                    <div className="booking-message">
                      <strong>Renter's message:</strong>
                      <p>{booking.message}</p>
                    </div>
                  )}

                  <div className="booking-actions">
                    <Link to={`/vehicle/${booking.vehicle?._id}`}>
                      <button className="btn btn-secondary">View Vehicle</button>
                    </Link>

                    {booking.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(booking._id, 'confirmed')}
                          className="btn btn-success"
                        >
                          Confirm Booking
                        </button>
                        <button
                          onClick={() => handleUpdateStatus(booking._id, 'cancelled')}
                          className="btn btn-danger"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {booking.status === 'confirmed' && (
                      <button
                        onClick={() => handleUpdateStatus(booking._id, 'active')}
                        className="btn btn-primary"
                      >
                        Mark as Active
                      </button>
                    )}

                    {booking.status === 'active' && (
                      <button
                        onClick={() => handleUpdateStatus(booking._id, 'completed')}
                        className="btn btn-success"
                      >
                        Complete Trip
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostBookings;
