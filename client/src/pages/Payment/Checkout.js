import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Elements } from '@stripe/react-stripe-js';
import { loadStripe } from '@stripe/stripe-js';
import axios from 'axios';
import { formatTime } from '../../utils/formatTime';
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
  const [, setInsuranceSelected] = useState(false);
  const [savedCards, setSavedCards] = useState([]);
  const [paymentMode, setPaymentMode] = useState('new'); // 'new' or 'saved'
  const [selectedCard, setSelectedCard] = useState(null);
  const [payingWithSaved, setPayingWithSaved] = useState(false);

  useEffect(() => {
    if (!bookingId) {
      setError('No booking ID provided');
      setLoading(false);
      return;
    }

    initializePayment();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      // Set saved cards if available
      if (response.data.savedCards && response.data.savedCards.length > 0) {
        setSavedCards(response.data.savedCards);
        setPaymentMode('saved');
        const defaultCard = response.data.savedCards.find(c => c.isDefault) || response.data.savedCards[0];
        setSelectedCard(defaultCard);
      }
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

  const handlePayWithSavedCard = async () => {
    if (!selectedCard) return;
    setPayingWithSaved(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/payment/create-payment-intent`,
        { bookingId, savedPaymentMethodId: selectedCard.stripePaymentMethodId },
        { headers: { Authorization: `Bearer ${token}` }}
      );

      if (response.data.paymentIntentStatus === 'succeeded') {
        await handlePaymentSuccess(response.data.paymentIntentId);
      } else if (response.data.paymentIntentStatus === 'requires_action') {
        // Need 3D Secure - fall back to Elements flow
        setClientSecret(response.data.clientSecret);
        setPaymentMode('new');
        setError('Additional authentication required. Please complete verification below.');
      } else {
        setError(`Payment status: ${response.data.paymentIntentStatus}. Please try a different card.`);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed. Please try a different card or enter new card details.');
    } finally {
      setPayingWithSaved(false);
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
      if (response.data.savedCards) {
        setSavedCards(response.data.savedCards);
      }
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
                  {(() => {
                    const d = new Date(booking.startDate);
                    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
                      .toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                  })()}
                  {booking.pickupTime ? ` at ${formatTime(booking.pickupTime)}` : ''}
                </span>
              </div>

              <div className="summary-item">
                <span className="label">Return Date:</span>
                <span className="value">
                  {(() => {
                    const d = new Date(booking.endDate);
                    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
                      .toLocaleDateString('en-US', {
                        weekday: 'short',
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      });
                  })()}
                  {` by ${formatTime(booking.dropoffTime || booking.pickupTime)}`}
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

            {/* Saved Cards Section */}
            {savedCards.length > 0 && (
              <div className="payment-form-section" style={{ marginBottom: '1.5rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0 }}>Payment Method</h3>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => setPaymentMode('saved')}
                      style={{
                        padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                        border: paymentMode === 'saved' ? '1px solid #10b981' : '1px solid #333',
                        background: paymentMode === 'saved' ? 'rgba(16,185,129,0.1)' : 'transparent',
                        color: paymentMode === 'saved' ? '#10b981' : '#9ca3af'
                      }}>
                      Saved Card
                    </button>
                    <button
                      onClick={() => setPaymentMode('new')}
                      style={{
                        padding: '0.4rem 0.8rem', borderRadius: '6px', fontSize: '0.8rem', cursor: 'pointer',
                        border: paymentMode === 'new' ? '1px solid #10b981' : '1px solid #333',
                        background: paymentMode === 'new' ? 'rgba(16,185,129,0.1)' : 'transparent',
                        color: paymentMode === 'new' ? '#10b981' : '#9ca3af'
                      }}>
                      New Card
                    </button>
                  </div>
                </div>

                {paymentMode === 'saved' && (
                  <div>
                    <div style={{ display: 'grid', gap: '0.5rem', marginBottom: '1rem' }}>
                      {savedCards.map(card => (
                        <label key={card._id} style={{
                          display: 'flex', alignItems: 'center', gap: '0.75rem',
                          padding: '0.75rem 1rem', borderRadius: '8px', cursor: 'pointer',
                          border: selectedCard?._id === card._id ? '2px solid #10b981' : '2px solid #333',
                          background: selectedCard?._id === card._id ? 'rgba(16,185,129,0.05)' : 'transparent'
                        }}>
                          <input
                            type="radio" name="savedCard"
                            checked={selectedCard?._id === card._id}
                            onChange={() => setSelectedCard(card)}
                            style={{ accentColor: '#10b981' }}
                          />
                          <div style={{
                            width: '42px', height: '28px', borderRadius: '4px', background: '#222',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: '0.6rem', fontWeight: '700', color: '#9ca3af', border: '1px solid #333',
                            flexShrink: 0
                          }}>
                            {card.cardBrand === 'Visa' ? 'VISA' : card.cardBrand === 'Mastercard' ? 'MC' : card.cardBrand === 'Amex' ? 'AMEX' : card.cardBrand === 'Discover' ? 'DISC' : 'CARD'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ color: '#e5e7eb', fontSize: '0.9rem', fontWeight: '500' }}>
                              {card.nickname || `${card.cardBrand} ending in ${card.last4}`}
                            </span>
                            <span style={{ color: '#6b7280', fontSize: '0.75rem', marginLeft: '0.5rem' }}>
                              **** {card.last4}
                            </span>
                          </div>
                          {card.isDefault && (
                            <span style={{ fontSize: '0.7rem', color: '#10b981', fontWeight: '600' }}>Default</span>
                          )}
                        </label>
                      ))}
                    </div>

                    <button
                      onClick={handlePayWithSavedCard}
                      disabled={!selectedCard || payingWithSaved}
                      className="btn btn-primary btn-pay"
                      style={{ width: '100%' }}
                    >
                      {payingWithSaved ? 'Processing payment...' : `Pay $${booking?.totalPrice?.toFixed(2)} with ${selectedCard?.cardBrand || 'Card'} ****${selectedCard?.last4 || ''}`}
                    </button>

                    <p className="payment-secure-notice" style={{ textAlign: 'center', marginTop: '0.75rem' }}>
                      Your payment is secure and encrypted
                    </p>
                  </div>
                )}
              </div>
            )}

            {!isValidStripeKey && (
              <div className="error-message">
                Payment system configuration error. The Stripe publishable key is missing or invalid.
                Please contact support.
              </div>
            )}

            {clientSecret && isValidStripeKey && (paymentMode === 'new' || savedCards.length === 0) && (
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
