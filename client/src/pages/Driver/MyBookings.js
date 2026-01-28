import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import Navbar from '../../components/Navbar';
import VehicleInspection from '../../components/VehicleInspection';
import API_URL from '../../config/api';
import './Driver.css';

// Initialize Stripe
const stripeKey = process.env.REACT_APP_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

// Extension Payment Form Component
const ExtensionPaymentForm = ({ bookingId, extensionDays, extensionCost, onSuccess, onCancel }) => {
  const stripe = useStripe();
  const elements = useElements();
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!stripe || !elements) return;

    setProcessing(true);
    setError('');

    try {
      const { error: submitError, paymentIntent } = await stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      if (submitError) {
        setError(submitError.message);
        setProcessing(false);
        return;
      }

      if (paymentIntent && paymentIntent.status === 'succeeded') {
        // Confirm extension on backend
        const token = localStorage.getItem('token');
        const response = await axios.post(
          `${API_URL}/api/payment/confirm-extension-payment`,
          {
            paymentIntentId: paymentIntent.id,
            bookingId,
            extensionDays
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );

        if (response.data.success) {
          onSuccess(response.data);
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Payment failed');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <PaymentElement />
      {error && <div style={{ marginTop: '1rem', color: '#ef4444', fontSize: '0.875rem' }}>{error}</div>}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '1.5rem' }}>
        <button
          type="button"
          onClick={onCancel}
          className="btn btn-secondary"
          disabled={processing}
          style={{ flex: 1 }}
        >
          Cancel
        </button>
        <button
          type="submit"
          className="btn btn-primary"
          disabled={!stripe || processing}
          style={{ flex: 1 }}
        >
          {processing ? 'Processing...' : `Pay $${extensionCost.toFixed(2)}`}
        </button>
      </div>
    </form>
  );
};

const MyBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current');
  const [extendModal, setExtendModal] = useState({ open: false, booking: null });
  const [extensionDays, setExtensionDays] = useState(1);
  const [extensionClientSecret, setExtensionClientSecret] = useState(null);
  const [extensionLoading, setExtensionLoading] = useState(false);
  const [extensionError, setExtensionError] = useState('');
  const [extensionDetails, setExtensionDetails] = useState(null);
  const [inspectionModal, setInspectionModal] = useState({ open: false, booking: null, type: null });
  const [reconciling, setReconciling] = useState({});
  const [registrationModal, setRegistrationModal] = useState({ open: false, booking: null });

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

  const openExtendModal = (booking) => {
    setExtendModal({ open: true, booking });
    setExtensionDays(1);
    setExtensionClientSecret(null);
    setExtensionError('');
    setExtensionDetails(null);
  };

  const closeExtendModal = () => {
    setExtendModal({ open: false, booking: null });
    setExtensionDays(1);
    setExtensionClientSecret(null);
    setExtensionError('');
    setExtensionDetails(null);
  };

  const handleExtensionRequest = async () => {
    if (!extendModal.booking) return;

    setExtensionLoading(true);
    setExtensionError('');

    try {
      const token = localStorage.getItem('token');

      // First check availability
      await axios.post(
        `${API_URL}/api/bookings/${extendModal.booking._id}/extend`,
        { extensionDays },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      // Create payment intent for extension
      const paymentResponse = await axios.post(
        `${API_URL}/api/payment/create-extension-payment`,
        {
          bookingId: extendModal.booking._id,
          extensionDays
        },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setExtensionClientSecret(paymentResponse.data.clientSecret);
      setExtensionDetails(paymentResponse.data.extensionDetails);
    } catch (error) {
      setExtensionError(error.response?.data?.message || 'Failed to process extension request');
    } finally {
      setExtensionLoading(false);
    }
  };

  const handleExtensionSuccess = (data) => {
    alert(data.message);
    closeExtendModal();
    fetchBookings();
  };

  const openInspectionModal = (booking, type) => {
    setInspectionModal({ open: true, booking, type });
  };

  const closeInspectionModal = () => {
    setInspectionModal({ open: false, booking: null, type: null });
  };

  const handleInspectionComplete = (data) => {
    alert(data.message);
    closeInspectionModal();
    fetchBookings();
  };

  const handleReconcilePayment = async (bookingId) => {
    setReconciling(prev => ({ ...prev, [bookingId]: true }));
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/payment/reconcile/${bookingId}`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (response.data.reconciled) {
        alert('Payment found and booking updated! You can now start your reservation.');
        fetchBookings();
      } else if (response.data.success && !response.data.reconciled) {
        alert('Booking is already marked as paid.');
      } else {
        alert('No payment found for this booking. Please complete the payment process.');
      }
    } catch (error) {
      console.error('Error reconciling payment:', error);
      alert(error.response?.data?.message || 'Failed to check payment status');
    } finally {
      setReconciling(prev => ({ ...prev, [bookingId]: false }));
    }
  };

  // Check if a booking needs payment reconciliation
  const needsPaymentCheck = (booking) => {
    return booking.status === 'confirmed' && booking.paymentStatus !== 'paid';
  };

  const canStartReservation = (booking) => {
    // Can start if: confirmed, paid, pickup inspection not done, and within rental period
    // Use UTC dates to avoid timezone issues
    const now = new Date();
    const startDate = new Date(booking.startDate);
    const todayStr = now.toISOString().split('T')[0];
    const startStr = startDate.toISOString().split('T')[0];
    return booking.status === 'confirmed' &&
           booking.paymentStatus === 'paid' &&
           !booking.pickupInspection?.completed &&
           startStr <= todayStr;
  };

  const canReturnVehicle = (booking) => {
    // Can return if: active and pickup inspection was done
    return booking.status === 'active' && booking.pickupInspection?.completed;
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

  const categorizeBookings = () => {
    // Use UTC date strings to avoid timezone issues
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];

    const current = bookings.filter(booking => {
      const startDate = new Date(booking.startDate);
      const endDate = new Date(booking.endDate);
      const startStr = startDate.toISOString().split('T')[0];
      const endStr = endDate.toISOString().split('T')[0];
      // Current = active rentals where we're within the rental period
      // Include both 'active' and 'confirmed' status (confirmed = paid, ready for pickup)
      return startStr <= todayStr && endStr >= todayStr &&
             (booking.status === 'active' || booking.status === 'confirmed');
    });

    const upcoming = bookings.filter(booking => {
      const startDate = new Date(booking.startDate);
      const startStr = startDate.toISOString().split('T')[0];
      // Upcoming = future bookings that are pending or confirmed
      return startStr > todayStr && (booking.status === 'pending' || booking.status === 'confirmed');
    });

    const past = bookings.filter(booking => {
      const endDate = new Date(booking.endDate);
      const endStr = endDate.toISOString().split('T')[0];
      // Past = ended rentals or cancelled/completed
      return endStr < todayStr || booking.status === 'completed' || booking.status === 'cancelled';
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
  const canExtend = (booking) => {
    return ['active', 'confirmed'].includes(booking.status) && booking.paymentStatus === 'paid';
  };

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
                    <div
                      key={booking._id}
                      className="booking-card"
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
                            {getOverdueInfo(booking)} - Please extend or return immediately!
                          </span>
                          <span style={{ fontSize: '1.25rem' }}>!</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '1.5rem' }}>
                        {/* Vehicle Image */}
                        <div style={{
                          width: '140px',
                          height: '100px',
                          flexShrink: 0,
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                          background: '#f3f4f6'
                        }}>
                          {booking.vehicle?.images && booking.vehicle.images.length > 0 ? (
                            <img
                              src={booking.vehicle.images[0]}
                              alt={`${booking.vehicle?.year} ${booking.vehicle?.make} ${booking.vehicle?.model}`}
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
                              fontSize: '2rem'
                            }}>
                              🚗
                            </div>
                          )}
                        </div>

                        {/* Booking Info */}
                        <div style={{ flex: 1 }}>
                          <div className="booking-header">
                            <div>
                              <div style={{
                                display: 'inline-block',
                                background: '#f3f4f6',
                                padding: '0.25rem 0.5rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.75rem',
                                fontWeight: '600',
                                color: '#6b7280',
                                marginBottom: '0.5rem',
                                fontFamily: 'monospace'
                              }}>
                                {booking.reservationId || `#${booking._id.slice(-8).toUpperCase()}`}
                              </div>
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
                        <div className="booking-detail-item">
                          <strong>Rate:</strong> ${booking.pricePerDay}/day
                        </div>
                      </div>

                      {booking.extensions && booking.extensions.length > 0 && (
                        <div style={{
                          marginTop: '1rem',
                          padding: '0.75rem',
                          background: '#ecfdf5',
                          borderRadius: '0.5rem',
                          fontSize: '0.875rem'
                        }}>
                          <strong style={{ color: '#059669' }}>Extended {booking.extensions.length} time(s)</strong>
                        </div>
                      )}

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

                        {canStartReservation(booking) && (
                          <button
                            onClick={() => openInspectionModal(booking, 'pickup')}
                            className="btn btn-primary"
                            style={{ background: '#10b981' }}
                          >
                            Start Reservation
                          </button>
                        )}

                        {canReturnVehicle(booking) && (
                          <button
                            onClick={() => openInspectionModal(booking, 'return')}
                            className="btn btn-primary"
                            style={{ background: '#f59e0b' }}
                          >
                            Return Vehicle
                          </button>
                        )}

                        {booking.status === 'active' && booking.vehicle?.registrationImage && (
                          <button
                            onClick={() => setRegistrationModal({ open: true, booking })}
                            className="btn btn-secondary"
                            style={{ background: '#8b5cf6', color: 'white', border: 'none' }}
                          >
                            View Registration
                          </button>
                        )}

                        {canExtend(booking) && (
                          <button
                            onClick={() => openExtendModal(booking)}
                            className="btn btn-primary"
                            style={{ background: '#3b82f6' }}
                          >
                            Extend Rental
                          </button>
                        )}

                        {booking.status === 'pending' && (
                          <button
                            onClick={() => handleCancelBooking(booking._id)}
                            className="btn btn-danger"
                          >
                            Cancel Booking
                          </button>
                        )}

                        {needsPaymentCheck(booking) && (
                          <button
                            onClick={() => handleReconcilePayment(booking._id)}
                            className="btn btn-secondary"
                            disabled={reconciling[booking._id]}
                            style={{ background: '#f59e0b', color: 'white', border: 'none' }}
                          >
                            {reconciling[booking._id] ? 'Checking...' : 'Check Payment Status'}
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

      {/* Extension Modal */}
      {extendModal.open && extendModal.booking && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '2rem',
            maxWidth: '500px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{ marginBottom: '1.5rem', color: '#1f2937' }}>Extend Your Rental</h2>

            <div style={{ marginBottom: '1.5rem', padding: '1rem', background: '#f9fafb', borderRadius: '0.5rem' }}>
              <p style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#1f2937' }}>
                {extendModal.booking.vehicle?.year} {extendModal.booking.vehicle?.make} {extendModal.booking.vehicle?.model}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                Current return: {new Date(extendModal.booking.endDate).toLocaleDateString()}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                Daily rate: ${extendModal.booking.pricePerDay}
              </p>
            </div>

            {!extensionClientSecret ? (
              <>
                <div style={{ marginBottom: '1.5rem' }}>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500', color: '#1f2937' }}>
                    How many days would you like to extend?
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <button
                      onClick={() => setExtensionDays(Math.max(1, extensionDays - 1))}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      -
                    </button>
                    <span style={{ fontSize: '1.5rem', fontWeight: '600', minWidth: '3rem', textAlign: 'center', color: '#1f2937' }}>
                      {extensionDays}
                    </span>
                    <button
                      onClick={() => setExtensionDays(Math.min(30, extensionDays + 1))}
                      className="btn btn-secondary"
                      style={{ padding: '0.5rem 1rem' }}
                    >
                      +
                    </button>
                    <span style={{ color: '#4b5563' }}>day(s)</span>
                  </div>
                </div>

                <div style={{
                  padding: '1rem',
                  background: '#eff6ff',
                  borderRadius: '0.5rem',
                  marginBottom: '1.5rem'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#1e40af' }}>New return date:</span>
                    <span style={{ fontWeight: '600', color: '#1e3a8a' }}>
                      {new Date(new Date(extendModal.booking.endDate).getTime() + extensionDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ color: '#1e40af' }}>Extension cost:</span>
                    <span style={{ fontWeight: '600', color: '#059669', fontSize: '1.25rem' }}>
                      ${(extensionDays * extendModal.booking.pricePerDay).toFixed(2)}
                    </span>
                  </div>
                </div>

                {extensionError && (
                  <div style={{
                    padding: '0.75rem',
                    background: '#fef2f2',
                    color: '#dc2626',
                    borderRadius: '0.5rem',
                    marginBottom: '1rem',
                    fontSize: '0.875rem'
                  }}>
                    {extensionError}
                  </div>
                )}

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={closeExtendModal}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleExtensionRequest}
                    className="btn btn-primary"
                    disabled={extensionLoading}
                    style={{ flex: 1 }}
                  >
                    {extensionLoading ? 'Processing...' : 'Continue to Payment'}
                  </button>
                </div>
              </>
            ) : (
              <>
                {stripePromise && extensionDetails && (
                  <Elements
                    stripe={stripePromise}
                    options={{
                      clientSecret: extensionClientSecret,
                      appearance: { theme: 'stripe' }
                    }}
                  >
                    <ExtensionPaymentForm
                      bookingId={extendModal.booking._id}
                      extensionDays={extensionDays}
                      extensionCost={extensionDetails.extensionCost}
                      onSuccess={handleExtensionSuccess}
                      onCancel={closeExtendModal}
                    />
                  </Elements>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Vehicle Inspection Modal */}
      {inspectionModal.open && inspectionModal.booking && (
        <VehicleInspection
          booking={inspectionModal.booking}
          type={inspectionModal.type}
          onComplete={handleInspectionComplete}
          onCancel={closeInspectionModal}
        />
      )}

      {/* Registration Modal */}
      {registrationModal.open && registrationModal.booking && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            background: 'white',
            borderRadius: '1rem',
            padding: '1.5rem',
            maxWidth: '600px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ margin: 0, color: '#1f2937' }}>Vehicle Registration</h2>
              <button
                onClick={() => setRegistrationModal({ open: false, booking: null })}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '1.5rem',
                  cursor: 'pointer',
                  color: '#6b7280'
                }}
              >
                x
              </button>
            </div>
            <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
              {registrationModal.booking.vehicle?.year} {registrationModal.booking.vehicle?.make} {registrationModal.booking.vehicle?.model}
            </p>
            <div style={{
              borderRadius: '0.5rem',
              overflow: 'hidden',
              background: '#f3f4f6'
            }}>
              <img
                src={registrationModal.booking.vehicle?.registrationImage}
                alt="Vehicle Registration"
                style={{
                  width: '100%',
                  height: 'auto',
                  display: 'block'
                }}
              />
            </div>
            <button
              onClick={() => setRegistrationModal({ open: false, booking: null })}
              className="btn btn-secondary"
              style={{ width: '100%', marginTop: '1rem' }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookings;
