import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import './Payment.css';

const PaymentSuccess = () => {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking_id');
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [booking, setBooking] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (bookingId) {
      fetchBooking();
    } else {
      setError('Invalid booking ID');
      setLoading(false);
    }
  }, [bookingId]);

  const fetchBooking = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/bookings/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      setBooking(response.data);
      setLoading(false);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load booking details');
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="payment-page">
          <div className="container">
            <div className="payment-status">
              <div className="spinner"></div>
              <h2>Loading...</h2>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div>
        <Navbar />
        <div className="payment-page">
          <div className="container">
            <div className="payment-status error">
              <div className="status-icon">❌</div>
              <h2>Error</h2>
              <p>{error}</p>
              <button onClick={() => navigate('/driver/my-bookings')} className="btn btn-primary">
                View My Bookings
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="payment-page">
        <div className="container">
          <div className="payment-status success">
            <div className="status-icon">✅</div>
            <h2>Payment Successful!</h2>
            <p className="success-message">
              Your booking has been confirmed. A confirmation email has been sent to your inbox.
            </p>

            <div className="booking-details">
              <h3>Booking Details</h3>
              <div className="detail-item">
                <span className="label">Vehicle:</span>
                <span className="value">
                  {booking.vehicle?.year} {booking.vehicle?.make} {booking.vehicle?.model}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Pickup Date:</span>
                <span className="value">
                  {new Date(booking.startDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Return Date:</span>
                <span className="value">
                  {new Date(booking.endDate).toLocaleDateString('en-US', {
                    weekday: 'long',
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>
              <div className="detail-item">
                <span className="label">Total Paid:</span>
                <span className="value">${booking.totalPrice.toFixed(2)}</span>
              </div>
              <div className="detail-item">
                <span className="label">Booking Status:</span>
                <span className="value status-badge confirmed">{booking.status}</span>
              </div>
            </div>

            <div className="next-steps">
              <h3>Next Steps</h3>
              <ol>
                <li>Check your email for booking confirmation and host contact details</li>
                <li>Contact the host to arrange pickup details</li>
                <li>Arrive on time for your pickup</li>
                <li>Enjoy your trip!</li>
              </ol>
            </div>

            <div className="action-buttons">
              <button
                onClick={() => navigate('/driver/my-bookings')}
                className="btn btn-primary"
              >
                View My Bookings
              </button>
              <button
                onClick={() => navigate('/marketplace')}
                className="btn btn-secondary"
              >
                Browse More Vehicles
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentSuccess;
