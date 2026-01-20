import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import CheckoutForm from './CheckoutForm';
import InsuranceSelection from '../../components/InsuranceSelection';
import API_URL from '../../config/api';
import './Payment.css';

// Load Stripe with your publishable key
const stripeKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
const isValidStripeKey = stripeKey && (stripeKey.startsWith('pk_live_') || stripeKey.startsWith('pk_test_'));
const stripePromise = isValidStripeKey ? loadStripe(stripeKey) : null;

const Checkout = () => {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking_id');
  const navigate = useNavigate();

  const [clientSecret, setClientSecret] = useState('');
  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [insuranceSelected, setInsuranceSelected] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      setError('No booking ID provided');
      setLoading(false);
      return;
    }

    initializePayment();
  }, [bookingId]);

  const initializePayment = async () => {
    try {
      const token = localStorage.getItem('token');

      // Create payment intent
      const response = await axios.post(`${API_URL}/api/payment/create-payment-intent`,
        { bookingId },
        { headers: { Authorization: `Bearer ${token}` }}
      );

      setClientSecret(response.data.clientSecret);
      setBooking(response.data.booking);
    } catch (err) {
      console.error('Payment initialization error:', err.response?.data || err);
      setError(err.response?.data?.message || err.response?.data?.error || 'Failed to initialize payment');
    } finally {
      setLoading(false);
    }
  };

  const handlePaymentSuccess = async (paymentIntentId) => {
    try {
      const token = localStorage.getItem('token');

      // Confirm payment on server
      await axios.post(`${API_URL}/api/payment/confirm-payment`,
        { paymentIntentId, bookingId },
        { headers: { Authorization: `Bearer ${token}` }}
      );

      // Navigate to success page
      navigate(`/payment/success?payment_intent=${paymentIntentId}&booking_id=${bookingId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to confirm payment');
    }
  };

  const handlePaymentError = (error) => {
    console.error('Payment error:', error);
  };

  const handleInsuranceChange = async (updatedBooking) => {
    // Update local booking state with new insurance and total
    setBooking(prev => ({
      ...prev,
      insurance: updatedBooking.insurance,
      totalPrice: updatedBooking.totalPrice
    }));
    setInsuranceSelected(updatedBooking.insurance?.type !== 'none');

    // Refresh payment intent with new total
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/payment/create-payment-intent`,
        { bookingId },
        { headers: { Authorization: `Bearer ${token}` }}
      );
      setClientSecret(response.data.clientSecret);
    } catch (err) {
      console.error('Error refreshing payment intent:', err);
    }
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="payment-page">
          <div className="container">
            <div className="loading">
              <div className="spinner"></div>
              <p>Loading checkout...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (error && !booking) {
    return (
      <div>
        <Navbar />
        <div className="payment-page">
          <div className="container">
            <div className="error-message">{error}</div>
            <button onClick={() => navigate('/driver/my-bookings')} className="btn btn-primary">
              Back to My Bookings
            </button>
          </div>
        </div>
      </div>
    );
  }

  const appearance = {
    theme: 'stripe',
    variables: {
      colorPrimary: '#10b981',
    },
  };

  const options = {
    clientSecret,
    appearance,
  };

  return (
    <div>
      <Navbar />
      <div className="payment-page">
        <div className="container">
          <div className="checkout-container">
            <h1 className="page-title">Complete Your Booking</h1>

            {error && <div className="error-message">{error}</div>}

            <div className="booking-summary">
              <h2>Booking Summary</h2>

              <div className="summary-item">
                <span className="label">Reservation ID:</span>
                <span className="value" style={{ fontFamily: 'monospace', fontWeight: '600' }}>
                  {booking.reservationId || `#${booking._id?.slice(-8).toUpperCase()}`}
                </span>
              </div>

              <div className="summary-item">
                <span className="label">Vehicle:</span>
                <span className="value">
                  {booking.vehicle?.year} {booking.vehicle?.make} {booking.vehicle?.model}
                </span>
              </div>

              <div className="summary-item">
                <span className="label">Host:</span>
                <span className="value">
                  {booking.host?.firstName} {booking.host?.lastName}
                </span>
              </div>

              <div className="summary-item">
                <span className="label">Pickup Date:</span>
                <span className="value">
                  {new Date(booking.startDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>

              <div className="summary-item">
                <span className="label">Return Date:</span>
                <span className="value">
                  {new Date(booking.endDate).toLocaleDateString('en-US', {
                    weekday: 'short',
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric'
                  })}
                </span>
              </div>

              <div className="summary-item">
                <span className="label">Duration:</span>
                <span className="value">{booking.totalDays} days</span>
              </div>

              <div className="summary-item">
                <span className="label">Rental Type:</span>
                <span className="value" style={{ textTransform: 'capitalize' }}>
                  {booking.rentalType || 'daily'} ({booking.quantity || booking.totalDays} {booking.rentalType === 'weekly' ? 'week(s)' : booking.rentalType === 'monthly' ? 'month(s)' : 'day(s)'})
                </span>
              </div>

              <div className="summary-item">
                <span className="label">Rental subtotal:</span>
                <span className="value">
                  ${((booking.insurance?.totalCost ? booking.totalPrice - booking.insurance.totalCost : booking.totalPrice) || 0).toFixed(2)}
                </span>
              </div>

              {booking.insurance && booking.insurance.totalCost > 0 && (
                <div className="summary-item insurance">
                  <span className="label">Insurance ({booking.insurance.type}):</span>
                  <span className="value">${booking.insurance.totalCost.toFixed(2)}</span>
                </div>
              )}

              <div className="summary-item total">
                <span className="label">Total Amount:</span>
                <span className="value">${booking.totalPrice.toFixed(2)}</span>
              </div>
            </div>

            {/* Insurance Selection */}
            <InsuranceSelection
              bookingId={bookingId}
              totalDays={booking.totalDays}
              onInsuranceChange={handleInsuranceChange}
              initialSelection={booking.insurance?.type || 'none'}
            />

            {!isValidStripeKey && (
              <div className="error-message">
                Payment system configuration error. The Stripe publishable key is missing or invalid.
                Please contact support.
              </div>
            )}

            {clientSecret && isValidStripeKey && (
              <Elements options={options} stripe={stripePromise}>
                <CheckoutForm
                  booking={booking}
                  bookingId={bookingId}
                  onSuccess={handlePaymentSuccess}
                  onError={handlePaymentError}
                />
              </Elements>
            )}

            <div className="checkout-actions">
              <button
                onClick={() => navigate('/driver/my-bookings')}
                className="btn btn-secondary btn-cancel"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Checkout;
