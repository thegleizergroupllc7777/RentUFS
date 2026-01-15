import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import './Driver.css';

const MyBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current'); // current, upcoming, past

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/bookings/my-bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelBooking = async (bookingId) => {
    if (!window.confirm('Are you sure you want to cancel this booking?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_URL}/api/bookings/${bookingId}/status`, {
        status: 'cancelled'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      fetchBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking');
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

    const current = bookings.filter(booking => {
      const startDate = new Date(booking.startDate);
      const endDate = new Date(booking.endDate);
      return startDate <= now && endDate >= now && booking.status === 'active';
    });

    const upcoming = bookings.filter(booking => {
      const startDate = new Date(booking.startDate);
      return startDate > now && (booking.status === 'pending' || booking.status === 'confirmed');
    });

    const past = bookings.filter(booking => {
      const endDate = new Date(booking.endDate);
      return endDate < now || booking.status === 'completed' || booking.status === 'cancelled';
    });

    return { current, upcoming, past };
  };

  const { current, upcoming, past } = categorizeBookings();

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
          <h1 className="page-title">My Reservations</h1>

          {bookings.length === 0 ? (
            <div className="empty-state">
              <p>You haven't made any reservations yet.</p>
              <Link to="/marketplace">
                <button className="btn btn-primary mt-3">Browse Cars</button>
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
                  <p>No {activeTab} reservations.</p>
                </div>
              ) : (
                <div className="bookings-list">
                  {activeBookings.map(booking => (
                <div key={booking._id} className="booking-card">
                  <div className="booking-header">
                    <div>
                      <h3 className="booking-vehicle">
                        {booking.vehicle?.year} {booking.vehicle?.make} {booking.vehicle?.model}
                      </h3>
                      <p className="text-gray">
                        Host: {booking.host?.firstName} {booking.host?.lastName}
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
                      {new Date(booking.startDate).toLocaleDateString()}
                    </div>
                    <div className="booking-detail-item">
                      <strong>Return:</strong>{' '}
                      {new Date(booking.endDate).toLocaleDateString()}
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
                      <strong>Your message:</strong>
                      <p>{booking.message}</p>
                    </div>
                  )}

                  <div className="booking-actions">
                    <Link to={`/vehicle/${booking.vehicle?._id}`}>
                      <button className="btn btn-secondary">View Vehicle</button>
                    </Link>

                    {booking.status === 'pending' && (
                      <button
                        onClick={() => handleCancelBooking(booking._id)}
                        className="btn btn-danger"
                      >
                        Cancel Booking
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

export default MyBookings;
