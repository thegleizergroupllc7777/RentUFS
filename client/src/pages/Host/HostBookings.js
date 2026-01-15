import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import './Host.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

const HostBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current'); // current, upcoming, past

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/bookings/host-bookings`);
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (bookingId, newStatus) => {
    try {
      await axios.patch(`${API_URL}/api/bookings/${bookingId}/status`, {
        status: newStatus
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
                <div key={booking._id} className="booking-card host-booking-card">
                  <div className="booking-header">
                    <div>
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
