import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import './Host.css';

const HostBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchBookings();
  }, []);

  const fetchBookings = async () => {
    try {
      const response = await axios.get('/api/bookings/host-bookings');
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (bookingId, newStatus) => {
    try {
      await axios.patch(`/api/bookings/${bookingId}/status`, {
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
            <div className="bookings-list">
              {bookings.map(booking => (
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
        </div>
      </div>
    </div>
  );
};

export default HostBookings;
