import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { loadStripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js';
import { formatTime } from '../../utils/formatTime';
import { formatPhone } from '../../utils/formatPhone';
import Navbar from '../../components/Navbar';
import VehicleInspection from '../../components/VehicleInspection';
import ChatBox from '../../components/ChatBox';
import { useAuth } from '../../context/AuthContext';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Driver.css';

// Convert a Date to YYYY-MM-DD in local timezone (avoids UTC shift)
const toLocalDateStr = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// Parse a date string or ISO date to local midnight (avoids UTC shift)
const toLocalDate = (dateVal) => {
  const str = typeof dateVal === 'string' ? dateVal : dateVal.toISOString();
  // Extract just the date part YYYY-MM-DD and force local interpretation
  const datePart = str.split('T')[0];
  return new Date(datePart + 'T00:00:00');
};

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

// Insurance Card Modal — displays insurance card inline or retries fetching from provider
const InsuranceCardModal = ({ booking, onClose, onBookingUpdate }) => {
  const hasCard = !!(booking.teqMobility?.cardImage || booking.teqMobility?.cardUrl);
  const [retrying, setRetrying] = useState(false);
  const [retryError, setRetryError] = useState('');
  const [cardReady, setCardReady] = useState(hasCard);
  const [iframeLoading, setIframeLoading] = useState(hasCard);

  const token = localStorage.getItem('token');
  const cardSrc = `${API_URL}/api/bookings/${booking._id}/insurance-card?token=${encodeURIComponent(token)}`;

  // Auto-retry on mount if card isn't available yet
  useEffect(() => {
    if (!hasCard) {
      handleRetry();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    setRetryError('');
    try {
      const tkn = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/bookings/${booking._id}/retry-insurance`,
        {},
        { headers: { Authorization: `Bearer ${tkn}` } }
      );
      if (response.data.success && (response.data.teqMobility?.cardUrl || response.data.teqMobility?.cardImage)) {
        onBookingUpdate(response.data.teqMobility);
        setCardReady(true);
        setIframeLoading(true);
      } else {
        setRetryError(response.data.message || 'Could not retrieve insurance card from provider');
      }
    } catch (err) {
      setRetryError(err.response?.data?.message || 'Failed to contact insurance provider');
    } finally {
      setRetrying(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
    }}>
      <div style={{
        background: 'white', borderRadius: '1rem', padding: '1.5rem',
        maxWidth: cardReady ? '900px' : '450px', width: '100%', maxHeight: '90vh', overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#1f2937' }}>Insurance Card</h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>x</button>
        </div>
        <p style={{ color: '#6b7280', marginBottom: '1rem', fontSize: '0.875rem' }}>
          {booking.vehicle?.nickname || `${booking.vehicle?.year} ${booking.vehicle?.make} ${booking.vehicle?.model}`}
        </p>

        {cardReady ? (
          <div style={{ borderRadius: '0.5rem', overflow: 'hidden', background: '#f3f4f6' }}>
            {iframeLoading && (
              <div style={{ padding: '2rem', textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>&#128737;</div>
                <p style={{ color: '#374151', fontWeight: 600 }}>Loading Insurance Card...</p>
              </div>
            )}
            <iframe
              src={cardSrc}
              title="Insurance Card"
              style={{
                width: '100%',
                height: '70vh',
                border: 'none',
                display: iframeLoading ? 'none' : 'block'
              }}
              onLoad={() => setIframeLoading(false)}
            />
          </div>
        ) : (
          <div style={{ borderRadius: '0.5rem', background: '#f3f4f6', padding: '2rem', textAlign: 'center' }}>
            {retrying ? (
              <>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>&#128737;</div>
                <p style={{ color: '#374151', fontWeight: 600, marginBottom: '0.5rem' }}>Retrieving Insurance Card...</p>
                <p style={{ color: '#6b7280', fontSize: '0.85rem' }}>Contacting insurance provider</p>
              </>
            ) : (
              <>
                <p style={{ color: '#374151', fontWeight: 600, marginBottom: '0.5rem' }}>Insurance card not available yet</p>
                {retryError && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{retryError}</p>}
                <button onClick={handleRetry} className="btn btn-primary" style={{ background: '#0ea5e9', width: '100%' }}>
                  Retry — Fetch Insurance Card
                </button>
              </>
            )}
          </div>
        )}

        <button onClick={onClose} className="btn btn-secondary" style={{ width: '100%', marginTop: '0.75rem' }}>Close</button>
      </div>
    </div>
  );
};

const MyBookings = () => {
  const { user } = useAuth();
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
  const [insuranceCardModal, setInsuranceCardModal] = useState({ open: false, booking: null });
  const [openChatBookingId, setOpenChatBookingId] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [cancelModal, setCancelModal] = useState({ open: false, booking: null, fee: 0, loading: false, isLate: false });

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };

    // Fetch bookings and unread counts in parallel
    Promise.all([
      axios.get(`${API_URL}/api/bookings/my-bookings`, { headers }),
      axios.get(`${API_URL}/api/messages/unread/per-booking?role=driver`, { headers }).catch(() => ({ data: { counts: {} } }))
    ]).then(([bookingsRes, unreadRes]) => {
      setBookings(bookingsRes.data);
      setUnreadCounts(unreadRes.data.counts || {});
    }).catch(err => {
      console.error('Error fetching bookings:', err);
    }).finally(() => {
      setLoading(false);
    });

    const interval = setInterval(fetchUnreadCounts, 30000);
    return () => clearInterval(interval);
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
    }
  };

  const fetchUnreadCounts = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await axios.get(`${API_URL}/api/messages/unread/per-booking?role=driver`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUnreadCounts(response.data.counts || {});
    } catch (error) {
      // Silently fail
    }
  };

  const openCancelModal = async (booking) => {
    setCancelModal({ open: true, booking, fee: 0, loading: true, isLate: false });
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/bookings/${booking._id}/cancellation-fee`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCancelModal(prev => ({
        ...prev,
        fee: response.data.cancellationFee,
        isLate: response.data.isLateCancellation,
        loading: false
      }));
    } catch (error) {
      setCancelModal(prev => ({ ...prev, loading: false }));
    }
  };

  const handleConfirmCancel = async () => {
    if (!cancelModal.booking) return;
    setCancelModal(prev => ({ ...prev, loading: true }));
    try {
      const token = localStorage.getItem('token');
      await axios.patch(`${API_URL}/api/bookings/${cancelModal.booking._id}/status`, {
        status: 'cancelled'
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCancelModal({ open: false, booking: null, fee: 0, loading: false, isLate: false });
      fetchBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert('Failed to cancel booking');
      setCancelModal(prev => ({ ...prev, loading: false }));
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
    const todayStr = toLocalDateStr(new Date());
    const startStr = toLocalDateStr(toLocalDate(booking.startDate));
    const isConfirmed = booking.status === 'confirmed';
    const isPaid = booking.paymentStatus === 'paid';
    const inspectionNotDone = !booking.pickupInspection || !booking.pickupInspection.completed;
    const isStartDateReached = startStr <= todayStr;

    const result = isConfirmed && isPaid && inspectionNotDone && isStartDateReached;

    // Debug logging to help diagnose missing Start Reservation button
    if (isConfirmed && isPaid && !result) {
      console.log('🔍 canStartReservation debug for', booking.reservationId, {
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        pickupInspection: booking.pickupInspection,
        inspectionNotDone,
        startDate: booking.startDate,
        startStr,
        todayStr,
        isStartDateReached,
        result
      });
    }

    return result;
  };

  const canReturnVehicle = (booking) => {
    // Can return if: active and pickup inspection was done
    return booking.status === 'active' && booking.pickupInspection?.completed;
  };

  const getStatusLabel = (status) => {
    if (status === 'awaiting_payment') return 'Awaiting Payment';
    return status;
  };

  const getStatusColor = (status) => {
    const colors = {
      awaiting_payment: '#f97316',
      pending: '#f59e0b',
      confirmed: '#10b981',
      active: '#3b82f6',
      completed: '#6b7280',
      cancelled: '#ef4444'
    };
    return colors[status] || '#6b7280';
  };

  const { current, upcoming, past } = useMemo(() => {
    const todayStr = toLocalDateStr(new Date());

    const current = [];
    const upcoming = [];
    const past = [];

    // Single pass through bookings instead of 3 separate filter calls
    for (const booking of bookings) {
      const endStr = toLocalDateStr(toLocalDate(booking.endDate));

      if (booking.status === 'completed' || booking.status === 'cancelled') {
        past.push(booking);
      } else if (booking.status === 'active' && endStr >= todayStr) {
        current.push(booking);
      } else if (['awaiting_payment', 'pending', 'confirmed'].includes(booking.status) && endStr >= todayStr) {
        upcoming.push(booking);
      } else {
        past.push(booking);
      }
    }

    return { current, upcoming, past };
  }, [bookings]);

  // Calculate unread counts per tab
  const getTabUnreadCount = (tabBookings) => {
    return tabBookings.reduce((sum, b) => sum + (unreadCounts[b._id] || 0), 0);
  };
  const currentUnread = getTabUnreadCount(current);
  const upcomingUnread = getTabUnreadCount(upcoming);
  const pastUnread = getTabUnreadCount(past);

  // Auto-switch to tab with unread messages on first load
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false);
  useEffect(() => {
    if (hasAutoSwitched || Object.keys(unreadCounts).length === 0) return;
    if (currentUnread > 0) {
      setActiveTab('current');
      setHasAutoSwitched(true);
    } else if (upcomingUnread > 0) {
      setActiveTab('upcoming');
      setHasAutoSwitched(true);
    } else if (pastUnread > 0) {
      setActiveTab('past');
      setHasAutoSwitched(true);
    }
  }, [unreadCounts, hasAutoSwitched, currentUnread, upcomingUnread, pastUnread]);

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
    // Only allow extending bookings that have actually been started (active with pickup inspection done)
    return booking.status === 'active' && booking.paymentStatus === 'paid';
  };

  // Check if a booking is overdue (past return date/time)
  // Only active bookings (actually started) can be overdue
  const isOverdue = (booking) => {
    if (booking.status !== 'active') return false;

    const now = new Date();
    const endDate = toLocalDate(booking.endDate);

    // Parse dropoff time (default to 10:00 if not set)
    const dropoffTime = booking.dropoffTime || '10:00';
    const [hours, minutes] = dropoffTime.split(':').map(Number);
    endDate.setHours(hours, minutes, 0, 0);

    return now > endDate;
  };

  // Check if a confirmed booking was never picked up and is now expired
  const isExpiredUnstarted = (booking) => {
    if (booking.status !== 'confirmed') return false;
    const todayStr = toLocalDateStr(new Date());
    const endStr = toLocalDateStr(toLocalDate(booking.endDate));
    return endStr < todayStr;
  };

  // Calculate how overdue a booking is
  const getOverdueInfo = (booking) => {
    const now = new Date();
    const endDate = toLocalDate(booking.endDate);
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
                    fontSize: '1rem',
                    position: 'relative'
                  }}
                >
                  Current ({current.length})
                  {currentUnread > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      minWidth: '18px',
                      height: '18px',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      lineHeight: '1',
                      animation: 'pulse 2s infinite'
                    }}>
                      {currentUnread}
                    </span>
                  )}
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
                    fontSize: '1rem',
                    position: 'relative'
                  }}
                >
                  Upcoming ({upcoming.length})
                  {upcomingUnread > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      minWidth: '18px',
                      height: '18px',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      lineHeight: '1',
                      animation: 'pulse 2s infinite'
                    }}>
                      {upcomingUnread}
                    </span>
                  )}
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
                    fontSize: '1rem',
                    position: 'relative'
                  }}
                >
                  Past ({past.length})
                  {pastUnread > 0 && (
                    <span style={{
                      position: 'absolute',
                      top: '2px',
                      right: '2px',
                      background: '#ef4444',
                      color: '#fff',
                      fontSize: '0.65rem',
                      fontWeight: '700',
                      minWidth: '18px',
                      height: '18px',
                      borderRadius: '9999px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '0 4px',
                      lineHeight: '1',
                      animation: 'pulse 2s infinite'
                    }}>
                      {pastUnread}
                    </span>
                  )}
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
                      } : isExpiredUnstarted(booking) ? {
                        border: '3px solid #f59e0b',
                        boxShadow: '0 0 10px rgba(245, 158, 11, 0.3)'
                      } : unreadCounts[booking._id] > 0 ? {
                        border: '2px solid #10b981',
                        boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)'
                      } : {}}
                    >
                      {/* New Message Notification Banner */}
                      {unreadCounts[booking._id] > 0 && (
                        <div style={{
                          background: 'linear-gradient(90deg, #10b981, #059669)',
                          color: 'white',
                          padding: '0.5rem 1rem',
                          marginBottom: '1rem',
                          borderRadius: '0.5rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontWeight: '600',
                          fontSize: '0.875rem'
                        }}>
                          <span>
                            {unreadCounts[booking._id]} new message{unreadCounts[booking._id] > 1 ? 's' : ''} from host
                            {' '}&middot;{' '}
                            <span style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                              {booking.reservationId || `#${booking._id.slice(-8).toUpperCase()}`}
                            </span>
                          </span>
                          <span style={{
                            background: 'rgba(255,255,255,0.3)',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '9999px',
                            fontSize: '0.75rem'
                          }}>NEW</span>
                        </div>
                      )}
                      {/* Overdue Warning Banner - only for active (started) bookings */}
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
                      {/* Expired Unstarted Banner - confirmed booking that was never picked up */}
                      {isExpiredUnstarted(booking) && (
                        <div style={{
                          background: 'linear-gradient(90deg, #f59e0b, #d97706)',
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
                            Reservation expired - Vehicle was never picked up. Contact host for assistance.
                          </span>
                          <span style={{ fontSize: '1.25rem' }}>⚠</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', gap: '0.5rem' }}>
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
                              src={getImageUrl(booking.vehicle.images[0])}
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

                        {/* Host Photo */}
                        <div style={{
                          width: '100px',
                          height: '100px',
                          borderRadius: '0.5rem',
                          overflow: 'hidden',
                          flexShrink: 0,
                          backgroundColor: '#f3f4f6',
                          border: '2px solid #10b981'
                        }}>
                          {booking.host?.profileImage ? (
                            <img
                              src={getImageUrl(booking.host.profileImage)}
                              alt={`${booking.host?.firstName} ${booking.host?.lastName}`}
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
                              fontSize: '2rem',
                              background: '#e5e7eb'
                            }}>
                              {booking.host?.firstName?.[0]?.toUpperCase() || '?'}
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
                                {booking.vehicle?.nickname || `${booking.vehicle?.year} ${booking.vehicle?.make} ${booking.vehicle?.model}`}
                              </h3>
                              <p className="text-gray">
                                Host: {booking.host?.hostInfo?.displayPreference === 'business' && booking.host?.hostInfo?.businessName
                                  ? booking.host.hostInfo.businessName
                                  : `${booking.host?.firstName} ${booking.host?.lastName}`}
                              </p>
                            </div>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', alignItems: 'flex-end' }}>
                              <div
                                className="booking-status"
                                style={{ backgroundColor: getStatusColor(booking.status) }}
                              >
                                {getStatusLabel(booking.status)}
                              </div>
                              {booking.paymentStatus === 'paid' && (
                                <div style={{
                                  fontSize: '0.7rem',
                                  color: '#10b981',
                                  fontWeight: '600'
                                }}>
                                  Paid
                                </div>
                              )}
                              {booking.paymentStatus === 'pending' && (
                                <div style={{
                                  fontSize: '0.7rem',
                                  color: '#f59e0b',
                                  fontWeight: '600'
                                }}>
                                  Payment Pending
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="booking-details">
                        <div className="booking-detail-item">
                          <strong>Pickup:</strong>{' '}
                          {toLocalDate(booking.startDate).toLocaleDateString()} at {formatTime(booking.pickupTime)}
                        </div>
                        <div className="booking-detail-item">
                          <strong>Return:</strong>{' '}
                          {toLocalDate(booking.endDate).toLocaleDateString()} by {formatTime(booking.dropoffTime)}
                        </div>
                        <div className="booking-detail-item">
                          <strong>Duration:</strong> {booking.totalDays} days
                        </div>
                        <div className="booking-detail-item">
                          <strong>Total Price:</strong> ${Number(booking.totalPrice).toFixed(2)}
                        </div>
                        <div className="booking-detail-item">
                          <strong>Rate:</strong> ${Number(booking.pricePerDay).toFixed(2)}/day
                        </div>
                        {booking.insurance?.type && booking.insurance.type !== 'none' && (
                          <div className="booking-detail-item">
                            <strong>Insurance:</strong>{' '}
                            {booking.insurance.type === 'carshare' ? 'Car Share Coverage' :
                             booking.insurance.type === 'rideshare' ? 'Ride Share Coverage' :
                             booking.insurance.type.charAt(0).toUpperCase() + booking.insurance.type.slice(1) + ' Coverage'}
                            {booking.insurance.totalCost > 0 && ` ($${booking.insurance.totalCost.toFixed(2)})`}
                          </div>
                        )}
                      </div>

                      {/* Host Contact Info - Only shown when booking is confirmed/active and paid */}
                      {['confirmed', 'active'].includes(booking.status) && booking.paymentStatus === 'paid' && (
                        <div style={{
                          marginTop: '1rem',
                          padding: '1rem',
                          background: '#1e3a5f',
                          borderRadius: '0.5rem',
                          border: '1px solid #3b82f6'
                        }}>
                          <div style={{
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            color: '#93c5fd',
                            marginBottom: '0.75rem'
                          }}>
                            Host Contact Information
                          </div>
                          <div style={{ color: '#ffffff', fontSize: '0.9rem' }}>
                            <div style={{ marginBottom: '0.5rem' }}>
                              <strong style={{ color: '#93c5fd' }}>Name:</strong>{' '}
                              {booking.host?.firstName} {booking.host?.lastName}
                            </div>
                            {booking.host?.email && (
                              <div style={{ marginBottom: '0.5rem' }}>
                                <strong style={{ color: '#93c5fd' }}>Email:</strong>{' '}
                                <a href={`mailto:${booking.host.email}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                                  {booking.host.email}
                                </a>
                              </div>
                            )}
                            {booking.host?.phone && (
                              <div>
                                <strong style={{ color: '#93c5fd' }}>Phone:</strong>{' '}
                                <a href={`tel:${booking.host.phone}`} style={{ color: '#60a5fa', textDecoration: 'none' }}>
                                  {formatPhone(booking.host.phone)}
                                </a>
                              </div>
                            )}
                          </div>
                        </div>
                      )}

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
                        <Link to={`/reservation/${booking._id}`}>
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

                        {/* Fallback: show Start Reservation for active bookings that never had pickup inspection */}
                        {booking.status === 'active' && booking.paymentStatus === 'paid' &&
                         !booking.pickupInspection?.completed && (
                          <button
                            onClick={() => openInspectionModal(booking, 'pickup')}
                            className="btn btn-primary"
                            style={{ background: '#10b981' }}
                          >
                            Start Reservation
                          </button>
                        )}

                        {/* Show info when booking is confirmed+paid but start date not reached */}
                        {booking.status === 'confirmed' && booking.paymentStatus === 'paid' &&
                         !booking.pickupInspection?.completed &&
                         toLocalDateStr(toLocalDate(booking.startDate)) > toLocalDateStr(new Date()) && (
                          <div style={{
                            padding: '0.5rem 1rem',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid #10b981',
                            borderRadius: '0.5rem',
                            fontSize: '0.8rem',
                            color: '#10b981',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.5rem'
                          }}>
                            Start Reservation will be available on pickup day
                          </div>
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

                        {booking.status === 'active' && booking.insurance?.type && booking.insurance.type !== 'none' && (
                          <button
                            onClick={() => setInsuranceCardModal({ open: true, booking })}
                            className="btn btn-secondary"
                            style={{ background: '#0ea5e9', color: 'white', border: 'none' }}
                          >
                            View Insurance Card
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

                        {['awaiting_payment', 'pending', 'confirmed'].includes(booking.status) && (
                          <button
                            onClick={() => openCancelModal(booking)}
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

                      {/* Message Host - separate row for visibility */}
                      {booking.status !== 'cancelled' && (
                        <div style={{ marginTop: '0.75rem' }}>
                          <button
                            onClick={() => {
                              const isOpening = openChatBookingId !== booking._id;
                              setOpenChatBookingId(isOpening ? booking._id : null);
                              if (isOpening) {
                                setUnreadCounts(prev => ({ ...prev, [booking._id]: 0 }));
                              }
                            }}
                            className="btn btn-secondary"
                            style={{
                              background: openChatBookingId === booking._id ? '#059669' : '#10b981',
                              color: '#000',
                              border: 'none',
                              position: 'relative'
                            }}
                          >
                            {openChatBookingId === booking._id ? 'Close Chat' : 'Message Host'}
                            {unreadCounts[booking._id] > 0 && openChatBookingId !== booking._id && (
                              <span style={{
                                position: 'absolute',
                                top: '-8px',
                                right: '-8px',
                                background: '#ef4444',
                                color: '#fff',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                minWidth: '20px',
                                height: '20px',
                                borderRadius: '9999px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 5px',
                                border: '2px solid #1a1a2e',
                                lineHeight: '1',
                                animation: 'pulse 2s infinite'
                              }}>
                                {unreadCounts[booking._id]}
                              </span>
                            )}
                          </button>
                        </div>
                      )}

                      {/* Chat Box */}
                      {openChatBookingId === booking._id && user && (
                        <ChatBox
                          bookingId={booking._id}
                          currentUserId={user._id || user.id}
                          otherUserName={`${booking.host?.firstName || ''} ${booking.host?.lastName || ''}`.trim()}
                          currentRole="driver"
                          onClose={() => setOpenChatBookingId(null)}
                        />
                      )}
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
                {extendModal.booking.vehicle?.nickname || `${extendModal.booking.vehicle?.year} ${extendModal.booking.vehicle?.make} ${extendModal.booking.vehicle?.model}`}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                Current return: {toLocalDate(extendModal.booking.endDate).toLocaleDateString()}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#4b5563' }}>
                Daily rate: ${Number(extendModal.booking.pricePerDay).toFixed(2)}
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
                      {new Date(toLocalDate(extendModal.booking.endDate).getTime() + extensionDays * 24 * 60 * 60 * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#1e40af' }}>Rental ({extensionDays} day{extensionDays > 1 ? 's' : ''} × ${extendModal.booking.pricePerDay}):</span>
                    <span style={{ fontWeight: '500', color: '#1e3a8a' }}>
                      ${(extensionDays * extendModal.booking.pricePerDay).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#1e40af' }}>Platform fee ({extensionDays} day{extensionDays > 1 ? 's' : ''} × $1.50):</span>
                    <span style={{ fontWeight: '500', color: '#1e3a8a' }}>
                      ${(extensionDays * 1.50).toFixed(2)}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#1e40af' }}>Processing fee:</span>
                    <span style={{ fontWeight: '500', color: '#1e3a8a' }}>
                      ${(() => {
                        const base = extensionDays * extendModal.booking.pricePerDay + extensionDays * 1.50;
                        const fee = (0.029 * base + 0.30) / (1 - 0.029 / 2);
                        return (Math.ceil(fee * 100 / 2) / 100).toFixed(2);
                      })()}
                    </span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #bfdbfe', paddingTop: '0.5rem', marginTop: '0.25rem' }}>
                    <span style={{ color: '#1e40af', fontWeight: '600' }}>Total:</span>
                    <span style={{ fontWeight: '600', color: '#059669', fontSize: '1.25rem' }}>
                      ${(() => {
                        const base = extensionDays * extendModal.booking.pricePerDay + extensionDays * 1.50;
                        const fee = (0.029 * base + 0.30) / (1 - 0.029 / 2);
                        const driverFee = Math.ceil(fee * 100 / 2) / 100;
                        return (base + driverFee).toFixed(2);
                      })()}
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
              {registrationModal.booking.vehicle?.nickname || `${registrationModal.booking.vehicle?.year} ${registrationModal.booking.vehicle?.make} ${registrationModal.booking.vehicle?.model}`}
            </p>
            <div style={{
              borderRadius: '0.5rem',
              overflow: 'hidden',
              background: '#f3f4f6'
            }}>
              <img
                src={getImageUrl(registrationModal.booking.vehicle?.registrationImage)}
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

      {/* Insurance Card Modal */}
      {insuranceCardModal.open && insuranceCardModal.booking && (
        <InsuranceCardModal
          booking={insuranceCardModal.booking}
          onClose={() => setInsuranceCardModal({ open: false, booking: null })}
          onBookingUpdate={(updatedTeqMobility) => {
            // Update the booking in local state so the iframe shows
            setBookings(prev => prev.map(b =>
              b._id === insuranceCardModal.booking._id
                ? { ...b, teqMobility: updatedTeqMobility }
                : b
            ));
            setInsuranceCardModal(prev => ({
              ...prev,
              booking: { ...prev.booking, teqMobility: updatedTeqMobility }
            }));
          }}
        />
      )}

      {/* Cancellation Confirmation Modal */}
      {cancelModal.open && cancelModal.booking && (
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
            maxWidth: '450px',
            width: '100%'
          }}>
            <h2 style={{ marginBottom: '1rem', color: '#1f2937' }}>Cancel Booking</h2>

            <div style={{
              padding: '1rem',
              background: '#f9fafb',
              borderRadius: '0.5rem',
              marginBottom: '1.5rem'
            }}>
              <p style={{ fontWeight: '600', color: '#1f2937', marginBottom: '0.25rem' }}>
                {cancelModal.booking.vehicle?.nickname || `${cancelModal.booking.vehicle?.year} ${cancelModal.booking.vehicle?.make} ${cancelModal.booking.vehicle?.model}`}
              </p>
              <p style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                {cancelModal.booking.reservationId}
              </p>
            </div>

            {cancelModal.loading ? (
              <p style={{ color: '#6b7280', textAlign: 'center' }}>Checking cancellation policy...</p>
            ) : (
              <>
                {cancelModal.isLate ? (
                  <div style={{
                    padding: '1rem',
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    borderRadius: '0.5rem',
                    marginBottom: '1.5rem'
                  }}>
                    <p style={{ fontWeight: '600', color: '#dc2626', marginBottom: '0.5rem' }}>
                      Late Cancellation Fee: $5.00
                    </p>
                    <p style={{ fontSize: '0.875rem', color: '#991b1b' }}>
                      You are cancelling within 24 hours of your scheduled pickup. A $5.00 late cancellation fee will be charged to your account.
                    </p>
                  </div>
                ) : (
                  <div style={{
                    padding: '1rem',
                    background: '#f0fdf4',
                    border: '1px solid #bbf7d0',
                    borderRadius: '0.5rem',
                    marginBottom: '1.5rem'
                  }}>
                    <p style={{ fontSize: '0.875rem', color: '#166534' }}>
                      No cancellation fee applies. You are cancelling more than 24 hours before your pickup.
                    </p>
                  </div>
                )}

                <p style={{ color: '#4b5563', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
                  Are you sure you want to cancel this reservation?
                </p>

                <div style={{ display: 'flex', gap: '1rem' }}>
                  <button
                    onClick={() => setCancelModal({ open: false, booking: null, fee: 0, loading: false, isLate: false })}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                    disabled={cancelModal.loading}
                  >
                    Keep Booking
                  </button>
                  <button
                    onClick={handleConfirmCancel}
                    className="btn btn-danger"
                    style={{ flex: 1 }}
                    disabled={cancelModal.loading}
                  >
                    {cancelModal.loading ? 'Cancelling...' : cancelModal.isLate ? 'Cancel (Fee: $5.00)' : 'Cancel Booking'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default MyBookings;
