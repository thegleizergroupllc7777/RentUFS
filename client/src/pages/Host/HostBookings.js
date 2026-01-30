import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import ChatBox from '../../components/ChatBox';
import { useAuth } from '../../context/AuthContext';
import { formatTime } from '../../utils/formatTime';
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

const HostBookings = () => {
  const { user } = useAuth();
  const [bookings, setBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('current'); // current, upcoming, past
  const [openChatBookingId, setOpenChatBookingId] = useState(null);

  // Switch vehicle modal state
  const [showSwitchModal, setShowSwitchModal] = useState(false);
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [switchReason, setSwitchReason] = useState('');
  const [switching, setSwitching] = useState(false);

  // Cancel reservation modal state
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelBooking, setCancelBooking] = useState(null);
  const [cancelReason, setCancelReason] = useState('');
  const [cancelling, setCancelling] = useState(false);

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

      alert(`Vehicle switched successfully! ${response.data.booking.priceDifference !== 0
        ? `Price ${response.data.booking.priceDifference > 0 ? 'increased' : 'decreased'} by $${Math.abs(response.data.booking.priceDifference).toFixed(2)}`
        : 'Price remains the same.'}`);

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

  // Categorize bookings into current, upcoming, and past
  const categorizeBookings = () => {
    const todayStr = toLocalDateStr(new Date());

    const current = bookings.filter(booking => {
      const startStr = toLocalDateStr(toLocalDate(booking.startDate));
      const endStr = toLocalDateStr(toLocalDate(booking.endDate));
      return startStr <= todayStr && endStr >= todayStr &&
             (booking.status === 'active' || booking.status === 'confirmed');
    });

    const upcoming = bookings.filter(booking => {
      const startStr = toLocalDateStr(toLocalDate(booking.startDate));
      return startStr > todayStr && (booking.status === 'pending' || booking.status === 'confirmed');
    });

    const past = bookings.filter(booking => {
      const endStr = toLocalDateStr(toLocalDate(booking.endDate));
      return endStr < todayStr || booking.status === 'completed' || booking.status === 'cancelled';
    });

    return { current, upcoming, past };
  };

  const { current, upcoming, past } = categorizeBookings();

  // Check if a booking is overdue (past return date/time)
  const isOverdue = (booking) => {
    if (!['active', 'confirmed'].includes(booking.status)) return false;

    const now = new Date();
    const endDate = toLocalDate(booking.endDate);

    const dropoffTime = booking.dropoffTime || '10:00';
    const [hours, minutes] = dropoffTime.split(':').map(Number);
    endDate.setHours(hours, minutes, 0, 0);

    return now > endDate;
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
              ) : activeTab === 'past' ? (
                /* Compact list view for past bookings */
                <div className="compact-bookings-list">
                  {activeBookings.map(booking => (
                    <Link
                      to={`/vehicle/${booking.vehicle?._id}`}
                      key={booking._id}
                      className="compact-booking-row"
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
                        {booking.vehicle?.year} {booking.vehicle?.make} {booking.vehicle?.model}
                      </div>

                      {/* Renter */}
                      <div className="compact-booking-renter">
                        {booking.driver?.firstName} {booking.driver?.lastName}
                      </div>

                      {/* Dates */}
                      <div className="compact-booking-dates">
                        {toLocalDate(booking.startDate).toLocaleDateString()} - {toLocalDate(booking.endDate).toLocaleDateString()}
                      </div>

                      {/* Duration & Price */}
                      <div className="compact-booking-price">
                        {booking.totalDays}d &middot; ${booking.totalPrice}
                      </div>

                      {/* Status badge */}
                      <div
                        className="compact-booking-status"
                        style={{ backgroundColor: getStatusColor(booking.status) }}
                      >
                        {booking.status}
                      </div>
                    </Link>
                  ))}
                </div>
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
                          onClick={() => handleOpenSwitchModal(booking)}
                          className="btn btn-secondary"
                          style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                        >
                          Switch Vehicle
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
                      <>
                        <button
                          onClick={() => handleOpenSwitchModal(booking)}
                          className="btn btn-secondary"
                          style={{ backgroundColor: '#6366f1', borderColor: '#6366f1' }}
                        >
                          Switch Vehicle
                        </button>
                        <button
                          onClick={() => handleOpenCancelModal(booking)}
                          className="btn btn-danger"
                        >
                          Cancel Reservation
                        </button>
                      </>
                    )}

                    {booking.status === 'active' && (
                      <>
                        <button
                          onClick={() => handleUpdateStatus(booking._id, 'completed')}
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

                    {['confirmed', 'active'].includes(booking.status) && (
                      <button
                        onClick={() => setOpenChatBookingId(openChatBookingId === booking._id ? null : booking._id)}
                        className="btn btn-secondary"
                        style={{
                          background: openChatBookingId === booking._id ? '#059669' : '#10b981',
                          color: '#000',
                          border: 'none'
                        }}
                      >
                        {openChatBookingId === booking._id ? 'Close Chat' : 'Message Driver'}
                      </button>
                    )}
                  </div>

                  {/* Chat Box */}
                  {openChatBookingId === booking._id && user && (
                    <ChatBox
                      bookingId={booking._id}
                      currentUserId={user._id || user.id}
                      otherUserName={`${booking.driver?.firstName || ''} ${booking.driver?.lastName || ''}`.trim()}
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
                {cancelBooking.vehicle?.year} {cancelBooking.vehicle?.make} {cancelBooking.vehicle?.model}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#9ca3af' }}>
                Renter: {cancelBooking.driver?.firstName} {cancelBooking.driver?.lastName}
              </p>
              <p style={{ margin: '0.25rem 0', color: '#10b981', fontWeight: '600' }}>
                Total: ${cancelBooking.totalPrice}
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
                A full refund of <strong>${cancelBooking.totalPrice}</strong> will be processed to the driver's original payment method.
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
                  <p><strong>Vehicle:</strong> {selectedBooking.vehicle?.year} {selectedBooking.vehicle?.make} {selectedBooking.vehicle?.model}</p>
                  <p><strong>Dates:</strong> {toLocalDate(selectedBooking.startDate).toLocaleDateString()} - {toLocalDate(selectedBooking.endDate).toLocaleDateString()}</p>
                  <p><strong>Current Price:</strong> ${selectedBooking.totalPrice}</p>
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
                            <h4>{vehicle.year} {vehicle.make} {vehicle.model}</h4>
                            <p className="vehicle-type">{vehicle.type} | {vehicle.seats} seats</p>
                            <div className="price-comparison">
                              <p><strong>New Price:</strong> ${vehicle.newTotalPrice}</p>
                              <p className={`price-diff ${vehicle.priceDifference > 0 ? 'increase' : vehicle.priceDifference < 0 ? 'decrease' : 'same'}`}>
                                {vehicle.priceDifference > 0 ? `+$${vehicle.priceDifference.toFixed(2)}` :
                                 vehicle.priceDifference < 0 ? `-$${Math.abs(vehicle.priceDifference).toFixed(2)}` :
                                 'Same price'}
                              </p>
                            </div>
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
