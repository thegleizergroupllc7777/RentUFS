import React, { useState, useEffect, useMemo } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ChatBox from '../../components/ChatBox';
import TollCharges from '../../components/TollCharges';
import AddChargeModal from '../../components/AddChargeModal';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
import { formatPhone } from '../../utils/formatPhone';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Host.css';

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
  const datePart = str.split('T')[0];
  return new Date(datePart + 'T00:00:00');
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

const HostBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current'); // current, upcoming, past
  const [openChatBookingId, setOpenChatBookingId] = useState(null);
  const [unreadCounts, setUnreadCounts] = useState({});

  // Switch vehicle modal state
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [switchReason, setSwitchReason] = useState('');
  const [switching, setSwitching] = useState(false);

  // Expanded past booking state
  const [expandedPastBookingId, setExpandedPastBookingId] = useState(null);

  // Past bookings rental type sub-filter
  const [pastTimeFilter, setPastTimeFilter] = useState('all');

  // Insurance card modal state
  const [insuranceCardModal, setInsuranceCardModal] = useState({ open: false, booking: null });
  const [tollChargesBookingId, setTollChargesBookingId] = useState(null);
  const [addChargeBookingId, setAddChargeBookingId] = useState(null);

  // Complete reservation modal state
  const [showCompleteModal, setShowCompleteModal] = useState(false);
  const [completeBooking, setCompleteBooking] = useState(null);

  // Cancel reservation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelBooking, setCancelBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

  // SMS reminder state
  const [sendingReminder, setSendingReminder] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    const headers = { Authorization: `Bearer ${token}` };

    // Fetch bookings and unread counts in parallel
    Promise.all([
      axios.get(`${API_URL}/api/bookings/host-bookings`, { headers }),
      axios.get(`${API_URL}/api/messages/unread/per-booking?role=host`, { headers }).catch(() => ({ data: { counts: {} } }))
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

  const fetchUnreadCounts = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) return;
      const response = await axios.get(`${API_URL}/api/messages/unread/per-booking?role=host`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setUnreadCounts(response.data.counts || {});
    } catch (error) {
      // Silently fail
    }
  };

  const fetchBookings = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/bookings/host-bookings`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setBookings(response.data);
    } catch (error) {
      console.error('Error fetching bookings:', error);
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

  // Send SMS extension reminder to driver
  const handleSendReminder = async (bookingId) => {
    setSendingReminder(bookingId);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/bookings/${bookingId}/send-extension-reminder`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(response.data.message || 'Reminder sent!');
    } catch (error) {
      const msg = error.response?.data?.message || 'Failed to send reminder';
      alert(msg);
    } finally {
      setSendingReminder(null);
    }
  };

  // Open complete reservation confirmation modal
  const handleOpenCompleteModal = (booking) => {
    setCompleteBooking(booking);
    setShowCompleteModal(true);
  };

  const handleConfirmComplete = async () => {
    if (!completeBooking) return;
    await handleUpdateStatus(completeBooking._id, 'completed');
    setShowCompleteModal(false);
    setCompleteBooking(null);
  };

  // Open cancel reservation modal
  const handleOpenCancelModal = (booking) => {
    setCancelBooking(booking);
    setCancelReason('');
    setShowCancelModal(true);
  };

  // Confirm cancellation with refund
  const handleConfirmCancel = async () => {
    if (!cancelBooking) return;
    setCancelling(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/bookings/${cancelBooking._id}/host-cancel`, {
        reason: cancelReason
      }, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.data.success) {
        const refundMsg = response.data.refund?.id
          ? `A full refund has been initiated.`
          : (cancelBooking.paymentStatus === 'paid' ? 'Refund processing may be pending.' : '');
        alert(`Reservation cancelled successfully. ${refundMsg}`);
      }

      setShowCancelModal(false);
      setCancelBooking(null);
      fetchBookings();
    } catch (error) {
      console.error('Error cancelling booking:', error);
      alert(error.response?.data?.message || 'Failed to cancel reservation');
    } finally {
      setCancelling(false);
    }
  };

  // Open switch vehicle modal and fetch available vehicles
  const handleOpenSwitchModal = async (booking) => {
    setSelectedBooking(booking);
    setShowSwitchModal(true);
    setLoadingVehicles(true);
    setSwitchReason('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/bookings/${booking._id}/available-vehicles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setAvailableVehicles(response.data.availableVehicles || []);
    } catch (error) {
      console.error('Error fetching available vehicles:', error);
      alert(error.response?.data?.message || 'Failed to fetch available vehicles');
      setShowSwitchModal(false);
    } finally {
      setLoadingVehicles(false);
    }
  };

  // Close switch vehicle modal
  const handleCloseSwitchModal = () => {
    setShowSwitchModal(false);
    setSelectedBooking(null);
    setAvailableVehicles([]);
    setSwitchReason('');
    setSwitching(false);
  };

  // Switch vehicle for booking
  const handleSwitchVehicle = async (newVehicleId) => {
    if (!selectedBooking) return;

    const selectedVehicle = availableVehicles.find(v => v._id === newVehicleId);
    const vehicleName = selectedVehicle
      ? (selectedVehicle.nickname || `${selectedVehicle.year} ${selectedVehicle.make} ${selectedVehicle.model}`)
      : 'the selected vehicle';

    const confirmed = window.confirm(
      `Switch to ${vehicleName}?\n\nThe booking price will remain the same at $${Number(selectedBooking.totalPrice).toFixed(2)}.`
    );
    if (!confirmed) return;

    setSwitching(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.patch(
        `${API_URL}/api/bookings/${selectedBooking._id}/switch-vehicle`,
        {
          newVehicleId,
          reason: switchReason || 'Vehicle switched by host'
        },
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );

      alert(response.data.message || 'Vehicle switched successfully!');

      handleCloseSwitchModal();
      fetchBookings();
    } catch (error) {
      console.error('Error switching vehicle:', error);
      alert(error.response?.data?.message || 'Failed to switch vehicle');
    } finally {
      setSwitching(false);
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

  // Categorize bookings into current, upcoming, and past (memoized)
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
      } else if (booking.status === 'active') {
        current.push(booking);
      } else if ((booking.status === 'pending' || booking.status === 'confirmed') && endStr >= todayStr) {
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

  // Check if a booking is overdue (past return date/time)
  // Only active bookings (actually started) can be overdue
  const isOverdue = (booking) => {
    if (booking.status !== 'active') return false;

    const now = new Date();
    const endDate = toLocalDate(booking.endDate);

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
                  className={activeTab === 'upcoming' ? 'tab-active' : 'tab'}
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
                  className={activeTab === 'past' ? 'tab-active' : 'tab'}
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
                  <p>No {activeTab} bookings.</p>
                </div>
              ) : activeTab === 'past' ? (
                /* Compact list view for past bookings */
                <>
                {/* Time-based sub-filters */}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  marginBottom: '1rem',
                  flexWrap: 'wrap'
                }}>
                  {(() => {
                    const now = new Date();
                    const todayStr = toLocalDateStr(now);
                    // Start of this week (Sunday)
                    const weekStart = new Date(now);
                    weekStart.setDate(now.getDate() - now.getDay());
                    const weekStartStr = toLocalDateStr(weekStart);
                    // Start of this month
                    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                    const monthStartStr = toLocalDateStr(monthStart);

                    const getBookingCompletedStr = (b) => {
                      return toLocalDateStr(toLocalDate(b.updatedAt || b.endDate));
                    };

                    const filters = [
                      { key: 'all', label: 'All' },
                      { key: 'today', label: 'Today' },
                      { key: 'week', label: 'This Week' },
                      { key: 'month', label: 'This Month' }
                    ];

                    return filters.map(({ key, label }) => {
                      const count = key === 'all'
                        ? past.length
                        : past.filter(b => {
                            const completedStr = getBookingCompletedStr(b);
                            if (key === 'today') return completedStr === todayStr;
                            if (key === 'week') return completedStr >= weekStartStr && completedStr <= todayStr;
                            if (key === 'month') return completedStr >= monthStartStr && completedStr <= todayStr;
                            return true;
                          }).length;
                      return (
                        <button
                          key={key}
                          onClick={() => setPastTimeFilter(key)}
                          style={{
                            padding: '0.4rem 1rem',
                            borderRadius: '9999px',
                            border: pastTimeFilter === key ? '2px solid #10b981' : '1px solid #4b5563',
                            background: pastTimeFilter === key ? '#10b981' : 'transparent',
                            color: pastTimeFilter === key ? '#000' : '#9ca3af',
                            cursor: 'pointer',
                            fontWeight: '600',
                            fontSize: '0.85rem'
                          }}
                        >
                          {label} ({count})
                        </button>
                      );
                    });
                  })()}
                </div>
                {(() => {
                  const now = new Date();
                  const todayStr = toLocalDateStr(now);
                  const weekStart = new Date(now);
                  weekStart.setDate(now.getDate() - now.getDay());
                  const weekStartStr = toLocalDateStr(weekStart);
                  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
                  const monthStartStr = toLocalDateStr(monthStart);

                  const getBookingCompletedStr = (b) => toLocalDateStr(toLocalDate(b.updatedAt || b.endDate));

                  const filtered = activeBookings.filter(b => {
                    if (pastTimeFilter === 'all') return true;
                    const completedStr = getBookingCompletedStr(b);
                    if (pastTimeFilter === 'today') return completedStr === todayStr;
                    if (pastTimeFilter === 'week') return completedStr >= weekStartStr && completedStr <= todayStr;
                    if (pastTimeFilter === 'month') return completedStr >= monthStartStr && completedStr <= todayStr;
                    return true;
                  });
                  const filterLabel = pastTimeFilter === 'all' ? '' : pastTimeFilter === 'today' ? 'today\'s' : pastTimeFilter === 'week' ? 'this week\'s' : 'this month\'s';
                  return filtered.length === 0 ? (
                  <div className="empty-state">
                    <p>No {filterLabel} past bookings.</p>
                  </div>
                ) : (
                <div className="compact-bookings-list">
                  {filtered
                    .map(booking => (
                    <div key={booking._id} style={{ position: 'relative' }}>
                      {/* Unread message indicator for compact row */}
                      {unreadCounts[booking._id] > 0 && (
                        <div style={{
                          background: 'linear-gradient(90deg, #10b981, #059669)',
                          color: 'white',
                          padding: '0.4rem 1rem',
                          borderRadius: '0.5rem 0.5rem 0 0',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          fontWeight: '600',
                          fontSize: '0.8rem'
                        }}>
                          <span>
                            {unreadCounts[booking._id]} new message{unreadCounts[booking._id] > 1 ? 's' : ''} from driver
                            {' '}&middot;{' '}
                            <span style={{ fontFamily: 'monospace', fontSize: '0.75rem' }}>
                              {booking.reservationId || `#${booking._id.slice(-8).toUpperCase()}`}
                            </span>
                          </span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const isOpening = openChatBookingId !== booking._id;
                                setOpenChatBookingId(isOpening ? booking._id : null);
                                if (isOpening) {
                                  setUnreadCounts(prev => ({ ...prev, [booking._id]: 0 }));
                                }
                              }}
                              style={{
                                background: 'rgba(255,255,255,0.3)',
                                border: 'none',
                                color: 'white',
                                padding: '0.2rem 0.6rem',
                                borderRadius: '9999px',
                                fontSize: '0.7rem',
                                fontWeight: '700',
                                cursor: 'pointer'
                              }}
                            >
                              {openChatBookingId === booking._id ? 'Close Chat' : 'View Messages'}
                            </button>
                            <span style={{
                              background: 'rgba(255,255,255,0.3)',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '9999px',
                              fontSize: '0.7rem'
                            }}>NEW</span>
                          </div>
                        </div>
                      )}
                      <div
                        className="compact-booking-row"
                        style={{
                          cursor: 'pointer',
                          ...(unreadCounts[booking._id] > 0 ? {
                            border: '2px solid #10b981',
                            borderTop: 'none',
                            boxShadow: '0 0 12px rgba(16, 185, 129, 0.3)',
                            borderRadius: '0 0 0.5rem 0.5rem'
                          } : {}),
                          ...(expandedPastBookingId === booking._id ? {
                            background: '#1a2332',
                            borderBottom: 'none',
                            borderRadius: '0.5rem 0.5rem 0 0'
                          } : {})
                        }}
                        onClick={() => setExpandedPastBookingId(
                          expandedPastBookingId === booking._id ? null : booking._id
                        )}
                      >
                        {/* Vehicle thumbnail + driver avatar */}
                        <div className="compact-booking-images">
                          <div className="compact-booking-thumb">
                            {booking.vehicle?.images?.[0] ? (
                              <img
                                src={booking.vehicle.images[0]}
                                alt={`${booking.vehicle?.make} ${booking.vehicle?.model}`}
                              />
                            ) : (
                              <span>No Img</span>
                            )}
                          </div>
                          <div className="compact-booking-avatar">
                            {booking.driver?.profileImage ? (
                              <img
                                src={booking.driver.profileImage}
                                alt={`${booking.driver?.firstName}`}
                              />
                            ) : (
                              <span>{booking.driver?.firstName?.charAt(0) || '?'}</span>
                            )}
                          </div>
                        </div>

                        {/* Reservation ID */}
                        <div className="compact-booking-id">
                          {booking.reservationId || `#${booking._id.slice(-8).toUpperCase()}`}
                        </div>

                        {/* Vehicle name */}
                        <div className="compact-booking-vehicle">
                          {booking.vehicle?.nickname || `${booking.vehicle?.year} ${booking.vehicle?.make} ${booking.vehicle?.model}`}
                        </div>

                        {/* Renter */}
                        <div className="compact-booking-renter">
                          {booking.driver?.firstName} {booking.driver?.lastName}
                        </div>

                        {/* Dates */}
                        <div className="compact-booking-dates">
                          {toLocalDate(booking.startDate).toLocaleDateString()} - {toLocalDate(booking.endDate).toLocaleDateString()}
                        </div>

                        {/* Rental type */}
                        {(() => {
                          const inferredType = (() => {
                            if (booking.rentalType && booking.rentalType !== 'daily') return booking.rentalType;
                            if (booking.rentalType === 'daily') return 'daily';
                            const days = booking.totalDays || 1;
                            if (days >= 28) return 'monthly';
                            if (days >= 7) return 'weekly';
                            return 'daily';
                          })();
                          return (
                        <div style={{
                          fontSize: '0.7rem',
                          fontWeight: '600',
                          textTransform: 'uppercase',
                          color: inferredType === 'monthly' ? '#a78bfa' : inferredType === 'weekly' ? '#38bdf8' : '#10b981',
                          letterSpacing: '0.05em',
                          minWidth: '55px',
                          textAlign: 'center'
                        }}>
                          {inferredType}
                        </div>
                          );
                        })()}

                        {/* Duration & Price */}
                        <div className="compact-booking-price">
                          {booking.totalDays}d &middot; ${Number(booking.totalPrice).toFixed(2)}
                        </div>

                        {/* Status badge */}
                        <div
                          className="compact-booking-status"
                          style={{ backgroundColor: getStatusColor(booking.status) }}
                        >
                          {booking.status}
                        </div>
                      </div>

                      {/* Expanded booking details */}
                      {expandedPastBookingId === booking._id && (
                        <div style={{
                          background: '#1a2332',
                          borderRadius: '0 0 0.5rem 0.5rem',
                          padding: '1.25rem',
                          borderTop: '1px solid #2d3748',
                          marginTop: '-1px'
                        }}>
                          <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                            {/* Left: Booking details */}
                            <div style={{ flex: '1 1 300px' }}>
                              <div style={{
                                display: 'grid',
                                gridTemplateColumns: '1fr 1fr',
                                gap: '0.75rem',
                                fontSize: '0.875rem'
                              }}>
                                <div>
                                  <span style={{ color: '#9ca3af' }}>Pickup:</span>
                                  <div style={{ color: '#fff', fontWeight: '500' }}>
                                    {toLocalDate(booking.startDate).toLocaleDateString()} at {formatTime(booking.pickupTime)}
                                  </div>
                                </div>
                                <div>
                                  <span style={{ color: '#9ca3af' }}>Return:</span>
                                  <div style={{ color: '#fff', fontWeight: '500' }}>
                                    {toLocalDate(booking.endDate).toLocaleDateString()} by {formatTime(booking.dropoffTime)}
                                  </div>
                                </div>
                                <div>
                                  <span style={{ color: '#9ca3af' }}>Duration:</span>
                                  <div style={{ color: '#fff', fontWeight: '500' }}>{booking.totalDays} day{booking.totalDays !== 1 ? 's' : ''}</div>
                                </div>
                                <div>
                                  <span style={{ color: '#9ca3af' }}>Rate:</span>
                                  <div style={{ color: '#fff', fontWeight: '500' }}>${Number(booking.pricePerUnit || booking.pricePerDay).toFixed(2)}/{booking.rentalType === 'weekly' ? 'week' : booking.rentalType === 'monthly' ? 'month' : 'day'}</div>
                                </div>
                                <div>
                                  <span style={{ color: '#9ca3af' }}>Total Price:</span>
                                  <div style={{ color: '#10b981', fontWeight: '600', fontSize: '1rem' }}>${Number(booking.totalPrice).toFixed(2)}</div>
                                </div>
                                <div>
                                  <span style={{ color: '#9ca3af' }}>Payment:</span>
                                  <div style={{
                                    color: booking.paymentStatus === 'paid' ? '#10b981' : '#f59e0b',
                                    fontWeight: '500'
                                  }}>
                                    {booking.paymentStatus === 'paid' ? 'Paid' : booking.paymentStatus}
                                  </div>
                                </div>
                              </div>

                              {booking.insurance && booking.insurance.type && (
                                <div style={{ marginTop: '0.75rem', fontSize: '0.875rem' }}>
                                  <span style={{ color: '#9ca3af' }}>Insurance:</span>
                                  <span style={{ color: '#fff', marginLeft: '0.5rem' }}>
                                    {booking.insurance.type === 'carshare' ? 'Liability Coverage' : 'Full Coverage'} (${booking.insurance.price})
                                  </span>
                                </div>
                              )}

                              {booking.extensions && booking.extensions.length > 0 && (
                                <div style={{
                                  marginTop: '0.75rem',
                                  padding: '0.5rem 0.75rem',
                                  background: 'rgba(16, 185, 129, 0.1)',
                                  borderRadius: '0.375rem',
                                  fontSize: '0.875rem',
                                  color: '#10b981'
                                }}>
                                  Extended {booking.extensions.length} time{booking.extensions.length > 1 ? 's' : ''}
                                </div>
                              )}
                            </div>

                            {/* Right: Driver info */}
                            <div style={{
                              flex: '0 0 auto',
                              minWidth: '200px',
                              padding: '0.75rem',
                              background: '#0f1923',
                              borderRadius: '0.5rem',
                              fontSize: '0.875rem'
                            }}>
                              <div style={{ color: '#9ca3af', marginBottom: '0.5rem', fontWeight: '600' }}>Driver</div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
                                <div style={{
                                  width: '40px',
                                  height: '40px',
                                  borderRadius: '50%',
                                  overflow: 'hidden',
                                  flexShrink: 0,
                                  background: '#e5e7eb'
                                }}>
                                  {booking.driver?.profileImage ? (
                                    <img
                                      src={getImageUrl(booking.driver.profileImage)}
                                      alt={booking.driver?.firstName}
                                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                    />
                                  ) : (
                                    <div style={{
                                      width: '100%', height: '100%',
                                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                                      color: '#6b7280', fontSize: '1rem', fontWeight: '600'
                                    }}>
                                      {booking.driver?.firstName?.[0]?.toUpperCase() || '?'}
                                    </div>
                                  )}
                                </div>
                                <div style={{ color: '#fff', fontWeight: '500' }}>
                                  {booking.driver?.firstName} {booking.driver?.lastName}
                                </div>
                              </div>
                              {booking.driver?.phone && (
                                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{formatPhone(booking.driver.phone)}</div>
                              )}
                              {booking.driver?.email && (
                                <div style={{ color: '#9ca3af', fontSize: '0.8rem' }}>{booking.driver.email}</div>
                              )}
                            </div>
                          </div>

                          {/* Action buttons */}
                          <div style={{
                            display: 'flex',
                            gap: '0.75rem',
                            marginTop: '1rem',
                            paddingTop: '1rem',
                            borderTop: '1px solid #2d3748'
                          }}>
                            <Link to={`/host/reservation/${booking._id}`}>
                              <button className="btn btn-secondary" style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}>
                                View Reservation
                              </button>
                            </Link>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setTollChargesBookingId(booking._id);
                              }}
                              className="btn btn-secondary"
                              style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem', background: '#6366f1', color: 'white', border: 'none' }}
                            >
                              Tolls & Charges
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                const isOpening = openChatBookingId !== booking._id;
                                setOpenChatBookingId(isOpening ? booking._id : null);
                                if (isOpening) {
                                  setUnreadCounts(prev => ({ ...prev, [booking._id]: 0 }));
                                }
                              }}
                              className="btn btn-secondary"
                              style={{
                                fontSize: '0.8rem',
                                padding: '0.4rem 0.75rem',
                                background: openChatBookingId === booking._id ? '#059669' : '#10b981',
                                color: '#000',
                                border: 'none'
                              }}
                            >
                              {openChatBookingId === booking._id ? 'Close Chat' : 'Message Driver'}
                            </button>
                          </div>

                          {/* Chat Box */}
                          {openChatBookingId === booking._id && user && (
                            <div style={{ marginTop: '0.75rem' }}>
                              <ChatBox
                                bookingId={booking._id}
                                currentUserId={user._id || user.id}
                                otherUserName={`${booking.driver?.firstName || ''} ${booking.driver?.lastName || ''}`.trim()}
                                currentRole="host"
                                onClose={() => setOpenChatBookingId(null)}
                              />
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
                );
                })()}
                </>
              ) : (
                /* Full card view for current and upcoming bookings */
                <div className="bookings-list">
                  {activeBookings.map(booking => (
                <div
                  key={booking._id}
                  className="booking-card host-booking-card"
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
                        {unreadCounts[booking._id]} new message{unreadCounts[booking._id] > 1 ? 's' : ''} from driver
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
                        {getOverdueInfo(booking)} - Renter should extend or return immediately!
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
                        Reservation expired - Driver never picked up the vehicle.
                      </span>
                      <span style={{ fontSize: '1.25rem' }}>⚠</span>
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
                      marginRight: '0.5rem',
                      backgroundColor: '#f3f4f6'
                    }}>
                      {booking.vehicle?.images?.[0] ? (
                        <img
                          src={getImageUrl(booking.vehicle.images[0])}
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
                    {/* Driver photo */}
                    <div style={{
                      width: '100px',
                      height: '100px',
                      borderRadius: '0.5rem',
                      overflow: 'hidden',
                      flexShrink: 0,
                      marginRight: '1rem',
                      backgroundColor: '#f3f4f6',
                      border: '2px solid #10b981'
                    }}>
                      {booking.driver?.profileImage ? (
                        <img
                          src={booking.driver.profileImage}
                          alt={`${booking.driver.firstName} ${booking.driver.lastName}`}
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
                          {booking.driver?.firstName?.[0]?.toUpperCase() || '?'}
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
                        {booking.vehicle?.nickname || `${booking.vehicle?.year} ${booking.vehicle?.make} ${booking.vehicle?.model}`}
                      </h3>
                      <p className="text-gray">
                        Renter: {booking.driver?.firstName} {booking.driver?.lastName}
                      </p>
                      <p className="text-gray text-sm">
                        Email: {booking.driver?.email} | Phone: {formatPhone(booking.driver?.phone)}
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
                  </div>

                  {booking.message && (
                    <div className="booking-message">
                      <strong>Renter's message:</strong>
                      <p>{booking.message}</p>
                    </div>
                  )}

                  <div className="host-booking-actions">
                    <Link to={`/host/reservation/${booking._id}`}>
                      <button className="btn btn-secondary">View Reservation</button>
                    </Link>

                    {booking.status === 'pending' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(booking._id, 'confirmed')}
                          className="btn btn-success"
                        >
                          Confirm Booking
                        </button>
                        {(!booking.vehicleSwitchHistory || booking.vehicleSwitchHistory.length === 0) && (
                          <button
                            onClick={() => handleOpenSwitchModal(booking)}
                            className="btn btn-secondary"
                            style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                          >
                            Switch Vehicle
                          </button>
                        )}
                        <button
                          onClick={() => handleUpdateStatus(booking._id, 'cancelled')}
                          className="btn btn-danger"
                        >
                          Decline
                        </button>
                      </>
                    )}

                    {booking.status === 'confirmed' && (
                      <>
                        {(!booking.vehicleSwitchHistory || booking.vehicleSwitchHistory.length === 0) && (
                          <button
                            onClick={() => handleOpenSwitchModal(booking)}
                            className="btn btn-secondary"
                            style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                          >
                            Switch Vehicle
                          </button>
                        )}
                        {new Date(booking.endDate) < new Date() && (
                          <button
                            onClick={() => handleOpenCompleteModal(booking)}
                            className="btn btn-success"
                          >
                            Complete Reservation
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenCancelModal(booking)}
                          className="btn btn-danger"
                        >
                          Cancel Reservation
                        </button>
                      </>
                    )}

                    <button
                      onClick={() => setTollChargesBookingId(booking._id)}
                      className="btn btn-secondary"
                      style={{ background: '#6366f1', color: 'white', border: 'none' }}
                    >
                      Tolls & Charges
                    </button>

                    {booking.status === 'active' && (
                      <>
                        {booking.insurance?.type && booking.insurance.type !== 'none' && (
                          <button
                            onClick={() => setInsuranceCardModal({ open: true, booking })}
                            className="btn btn-secondary"
                            style={{ background: '#0ea5e9', color: 'white', border: 'none' }}
                          >
                            View Insurance Card
                          </button>
                        )}
                        {isOverdue(booking) && (
                          <button
                            onClick={() => handleSendReminder(booking._id)}
                            disabled={sendingReminder === booking._id}
                            className="btn btn-secondary"
                            style={{ background: '#f59e0b', color: '#000', border: 'none' }}
                          >
                            {sendingReminder === booking._id ? 'Sending...' : 'Send Reminder'}
                          </button>
                        )}
                        <button
                          onClick={() => handleOpenCompleteModal(booking)}
                          className="btn btn-success"
                        >
                          Complete Reservation
                        </button>
                        <button
                          onClick={() => handleOpenCancelModal(booking)}
                          className="btn btn-danger"
                        >
                          Cancel Reservation
                        </button>
                      </>
                    )}

                    {booking.status !== 'cancelled' && (
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
                        {openChatBookingId === booking._id ? 'Close Chat' : 'Message Driver'}
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
                    )}
                  </div>

                  {/* Chat Box */}
                  {openChatBookingId === booking._id && user && (
                    <ChatBox
                      bookingId={booking._id}
                      currentUserId={user._id || user.id}
                      otherUserName={`${booking.driver?.firstName || ''} ${booking.driver?.lastName || ''}`.trim()}
                      currentRole="host"
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

      {/* Insurance Card Modal */}
      {insuranceCardModal.open && insuranceCardModal.booking && (
        <InsuranceCardModal
          booking={insuranceCardModal.booking}
          onClose={() => setInsuranceCardModal({ open: false, booking: null })}
          onBookingUpdate={(updatedTeqMobility) => {
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

      {/* Toll Charges Modal */}
      {tollChargesBookingId && (
        <TollCharges
          bookingId={tollChargesBookingId}
          onClose={() => setTollChargesBookingId(null)}
          isHost={true}
          onAddCharge={() => setAddChargeBookingId(tollChargesBookingId)}
        />
      )}

      {/* Add Charge Modal */}
      {addChargeBookingId && (
        <AddChargeModal
          bookingId={addChargeBookingId}
          onClose={() => setAddChargeBookingId(null)}
          onCreated={() => setTollChargesBookingId(addChargeBookingId)}
        />
      )}

      {/* Add Charge Modal */}
      {addChargeBookingId && (
        <AddChargeModal
          bookingId={addChargeBookingId}
          onClose={() => setAddChargeBookingId(null)}
          onCreated={() => setTollChargesBookingId(addChargeBookingId)}
        />
      )}

      {/* Complete Reservation Confirmation Modal */}
      {showCompleteModal && completeBooking && (
        <div className="modal-overlay" onClick={() => setShowCompleteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '450px' }}>
            <h2 style={{ color: '#10b981', marginTop: 0 }}>Complete Reservation</h2>
            <p>Are you sure you want to complete this reservation?</p>

            <div style={{
              background: '#1a1a1a',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              border: '1px solid #333'
            }}>
              <p style={{ margin: '0.25rem 0', fontWeight: '600' }}>
                {completeBooking.reservationId || completeBooking._id.slice(-8).toUpperCase()}
              </p>
              <p style={{ margin: '0.25rem 0' }}>
                {completeBooking.vehicle?.nickname || `${completeBooking.vehicle?.year} ${completeBooking.vehicle?.make} ${completeBooking.vehicle?.model}`}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#9ca3af' }}>
                Renter: {completeBooking.driver?.firstName} {completeBooking.driver?.lastName}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#10b981', fontWeight: '600' }}>
                Total: ${Number(completeBooking.totalPrice).toFixed(2)}
              </p>
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCompleteModal(false)}
                className="btn btn-secondary"
              >
                Go Back
              </button>
              <button
                onClick={handleConfirmComplete}
                className="btn btn-success"
              >
                Yes, Complete Reservation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Cancel Reservation Modal */}
      {showCancelModal && cancelBooking && (
        <div className="modal-overlay" onClick={() => !cancelling && setShowCancelModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <h2 style={{ color: '#dc2626', marginTop: 0 }}>Cancel Reservation</h2>
            <p>Are you sure you want to cancel this reservation?</p>

            <div style={{
              background: '#1a1a1a',
              padding: '1rem',
              borderRadius: '0.5rem',
              marginBottom: '1rem',
              border: '1px solid #333'
            }}>
              <p style={{ margin: '0.25rem 0', fontWeight: '600' }}>
                {cancelBooking.reservationId || cancelBooking._id.slice(-8).toUpperCase()}
              </p>
              <p style={{ margin: '0.25rem 0' }}>
                {cancelBooking.vehicle?.nickname || `${cancelBooking.vehicle?.year} ${cancelBooking.vehicle?.make} ${cancelBooking.vehicle?.model}`}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#9ca3af' }}>
                Renter: {cancelBooking.driver?.firstName} {cancelBooking.driver?.lastName}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#10b981', fontWeight: '600' }}>
                Total: ${Number(cancelBooking.totalPrice).toFixed(2)}
              </p>
            </div>

            {cancelBooking.paymentStatus === 'paid' && (
              <div style={{
                background: '#fef2f2',
                padding: '0.75rem 1rem',
                borderRadius: '0.5rem',
                marginBottom: '1rem',
                border: '1px solid #fecaca',
                color: '#dc2626',
                fontSize: '0.9rem'
              }}>
                A full refund of <strong>${Number(cancelBooking.totalPrice).toFixed(2)}</strong> will be processed to the driver's original payment method.
              </div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '600' }}>
                Reason for cancellation (optional):
              </label>
              <textarea
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="e.g. Vehicle maintenance required, scheduling conflict..."
                style={{
                  width: '100%',
                  minHeight: '80px',
                  padding: '0.75rem',
                  borderRadius: '0.5rem',
                  border: '1px solid #333',
                  background: '#1a1a1a',
                  color: '#e5e7eb',
                  resize: 'vertical',
                  fontFamily: 'inherit',
                  fontSize: '0.9rem'
                }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button
                onClick={() => setShowCancelModal(false)}
                className="btn btn-secondary"
                disabled={cancelling}
              >
                Keep Reservation
              </button>
              <button
                onClick={handleConfirmCancel}
                className="btn btn-danger"
                disabled={cancelling}
              >
                {cancelling ? 'Cancelling...' : 'Cancel & Refund'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Switch Vehicle Modal */}
      {showSwitchModal && (
        <div className="switch-modal-overlay" onClick={handleCloseSwitchModal}>
          <div className="switch-modal" onClick={(e) => e.stopPropagation()}>
            <div className="switch-modal-header">
              <h2>Switch Vehicle</h2>
              <button className="switch-modal-close" onClick={handleCloseSwitchModal}>
                &times;
              </button>
            </div>

            {selectedBooking && (
              <div className="switch-modal-body">
                <div className="current-booking-info">
                  <h3>Current Booking</h3>
                  <p><strong>Reservation:</strong> {selectedBooking.reservationId}</p>
                  <p><strong>Vehicle:</strong> {selectedBooking.vehicle?.nickname || `${selectedBooking.vehicle?.year} ${selectedBooking.vehicle?.make} ${selectedBooking.vehicle?.model}`}</p>
                  <p><strong>Dates:</strong> {toLocalDate(selectedBooking.startDate).toLocaleDateString()} - {toLocalDate(selectedBooking.endDate).toLocaleDateString()}</p>
                  <p><strong>Current Price:</strong> ${Number(selectedBooking.totalPrice).toFixed(2)}</p>
                </div>

                <div className="switch-reason-section">
                  <label htmlFor="switchReason">Reason for Switch (optional):</label>
                  <input
                    type="text"
                    id="switchReason"
                    value={switchReason}
                    onChange={(e) => setSwitchReason(e.target.value)}
                    placeholder="e.g., Vehicle needs maintenance"
                    className="switch-reason-input"
                  />
                </div>

                <div className="available-vehicles-section">
                  <h3>Available Vehicles</h3>
                  {loadingVehicles ? (
                    <p className="loading-text">Loading available vehicles...</p>
                  ) : availableVehicles.length === 0 ? (
                    <p className="no-vehicles-text">No other vehicles available for these dates.</p>
                  ) : (
                    <div className="available-vehicles-list">
                      {availableVehicles.map((vehicle) => (
                        <div key={vehicle._id} className="available-vehicle-card">
                          <div className="available-vehicle-image">
                            {vehicle.images?.[0] ? (
                              <img src={getImageUrl(vehicle.images[0])} alt={`${vehicle.make} ${vehicle.model}`} />
                            ) : (
                              <div className="no-image-placeholder">No Image</div>
                            )}
                          </div>
                          <div className="available-vehicle-info">
                            <h4>{vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}</h4>
                            <p className="vehicle-type">{vehicle.type} | {vehicle.seats} seats</p>
                            <p><strong>Rate:</strong> ${vehicle.pricePerDay}/day</p>
                          </div>
                          <button
                            className="btn btn-primary switch-btn"
                            onClick={() => handleSwitchVehicle(vehicle._id)}
                            disabled={switching}
                          >
                            {switching ? 'Switching...' : 'Select'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default HostBookings;
