import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import PullToRefresh from '../../components/PullToRefresh';
import ChatBox from '../../components/ChatBox';
import RentalAgreement from '../../components/RentalAgreement';
import TollCharges from '../../components/TollCharges';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import { formatPhone } from '../../utils/formatPhone';
import { formatTimeWithZone } from '../../utils/timezones';
import './Host.css';

const formatDate = (dateVal) => {
  if (!dateVal) return '';
  const str = typeof dateVal === 'string' ? dateVal : dateVal.toISOString();
  const datePart = str.split('T')[0];
  return new Date(datePart + 'T00:00:00').toLocaleDateString();
};

// Format time to include AM/PM
const formatTime = (time) => {
  if (!time) return '10:00 AM';
  // If time already has AM/PM, return as-is
  if (/am|pm/i.test(time)) return time;
  // Parse HH:MM format and add AM/PM
  const [hours, minutes] = time.split(':').map(Number);
  const period = hours >= 12 ? 'PM' : 'AM';
  const hour12 = hours % 12 || 12;
  return `${hour12}:${minutes.toString().padStart(2, '0')} ${period}`;
};

const PHOTO_LABELS = {
  frontView: 'Front View',
  backView: 'Back View',
  leftSide: 'Left Side',
  rightSide: 'Right Side'
};

const InspectionPhotos = ({ title, inspection, completedLabel }) => {
  if (!inspection?.completed) {
    return (
      <div style={{
        background: '#1a1a1a',
        border: '1px dashed #333',
        borderRadius: '12px',
        padding: '1.5rem',
        marginBottom: '1.5rem',
        textAlign: 'center'
      }}>
        <h3 style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>{title}</h3>
        <p style={{ color: '#4b5563', fontSize: '0.8125rem', margin: 0 }}>
          {completedLabel}
        </p>
      </div>
    );
  }

  return (
    <div style={{
      background: '#1a1a1a',
      border: '1px solid #333',
      borderRadius: '12px',
      padding: '1.5rem',
      marginBottom: '1.5rem'
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h3 style={{ color: '#fff', margin: 0, fontSize: '1.125rem' }}>{title}</h3>
        {inspection.completedAt && (
          <span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>
            {new Date(inspection.completedAt).toLocaleString()}
          </span>
        )}
      </div>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '0.75rem'
      }}>
        {Object.entries(PHOTO_LABELS).map(([key, label]) => (
          <div key={key} style={{ textAlign: 'center' }}>
            {inspection.photos?.[key] ? (
              <div>
                <img
                  src={getImageUrl(inspection.photos[key])}
                  alt={label}
                  style={{
                    width: '100%',
                    height: '140px',
                    objectFit: 'cover',
                    borderRadius: '0.5rem',
                    border: '1px solid #333'
                  }}
                />
                <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.25rem' }}>{label}</div>
              </div>
            ) : (
              <div style={{
                width: '100%',
                height: '140px',
                background: '#0f1923',
                borderRadius: '0.5rem',
                border: '1px solid #333',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#4b5563',
                fontSize: '0.75rem'
              }}>
                No photo
              </div>
            )}
          </div>
        ))}
      </div>
      {inspection.notes && (
        <div style={{ marginTop: '0.75rem', padding: '0.75rem', background: '#0f1923', borderRadius: '0.5rem' }}>
          <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginBottom: '0.25rem' }}>Notes:</div>
          <div style={{ color: '#fff', fontSize: '0.875rem' }}>{inspection.notes}</div>
        </div>
      )}
    </div>
  );
};

const HostReservationDetail = () => {
  const { user } = useAuth();
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAgreement, setShowAgreement] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [tooltipData, setTooltipData] = useState(null);
  const extWrapperRef = useRef(null);

  useEffect(() => {
    fetchBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const fetchBooking = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }

      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_URL}/api/bookings/${bookingId}`, { headers });
      setBooking(response.data);
    } catch (err) {
      if (err.response?.status === 404) {
        setError('Reservation not found');
      } else {
        setError(err.response?.data?.message || 'Failed to load reservation');
      }
    } finally {
      setLoading(false);
    }
  };

  // Send SMS extension reminder to driver
  const handleSendReminder = async () => {
    setSendingReminder(true);
    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(`${API_URL}/api/bookings/${bookingId}/send-extension-reminder`, {}, {
        headers: { Authorization: `Bearer ${token}` }
      });
      alert(response.data.message || 'Reminder sent!');
    } catch (err) {
      const msg = err.response?.data?.message || 'Failed to send reminder';
      alert(msg);
    } finally {
      setSendingReminder(false);
    }
  };

  // Check if booking is overdue (past return date/time)
  const isOverdue = () => {
    if (!booking || booking.status !== 'active') return false;
    const now = new Date();
    const endDate = new Date(booking.endDate);
    const datePart = (typeof booking.endDate === 'string' ? booking.endDate : booking.endDate.toISOString()).split('T')[0];
    const endLocal = new Date(datePart + 'T00:00:00');
    const dropoffTime = booking.dropoffTime || '10:00';
    const [hours, minutes] = dropoffTime.split(':').map(Number);
    endLocal.setHours(hours, minutes, 0, 0);
    return now > endLocal;
  };

  // Calculate how overdue a booking is
  const getOverdueInfo = () => {
    if (!booking) return '';
    const now = new Date();
    const datePart = (typeof booking.endDate === 'string' ? booking.endDate : booking.endDate.toISOString()).split('T')[0];
    const endLocal = new Date(datePart + 'T00:00:00');
    const dropoffTime = booking.dropoffTime || '10:00';
    const [hours, minutes] = dropoffTime.split(':').map(Number);
    endLocal.setHours(hours, minutes, 0, 0);
    const diffMs = now - endLocal;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);
    if (diffDays >= 1) return `${diffDays} day${diffDays > 1 ? 's' : ''} overdue`;
    return `${Math.max(1, diffHours)} hour${diffHours !== 1 ? 's' : ''} overdue`;
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'active': return '#3b82f6';
      case 'confirmed': return '#10b981';
      case 'pending': return '#f59e0b';
      case 'completed': return '#6b7280';
      case 'cancelled': return '#ef4444';
      default: return '#6b7280';
    }
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px' }}>Loading reservation...</div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div>
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px' }}>
          <p style={{ color: '#ef4444' }}>{error || 'Reservation not found'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/host/bookings')} style={{ marginTop: '1rem' }}>
            Back to Host Bookings
          </button>
        </div>
      </div>
    );
  }

  const vehicleData = booking.vehicle;

  return (
    <div>
      <Navbar />
      <PullToRefresh onRefresh={fetchBooking} />
      <div className="page">
        <div className="container">
          <button
            onClick={() => navigate('/host/bookings')}
            style={{
              background: 'none', border: 'none', color: '#10b981',
              cursor: 'pointer', fontSize: '1rem', padding: '0',
              marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem'
            }}
          >
            &larr; Back to Host Bookings
          </button>

          {/* Header */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start',
            marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem'
          }}>
            <div>
              <h1 style={{ color: '#fff', margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>
                {vehicleData?.nickname || `${vehicleData?.year} ${vehicleData?.make} ${vehicleData?.model}`}
              </h1>
              <span style={{
                fontFamily: 'monospace', background: '#1a1a1a', border: '1px solid #333',
                padding: '0.25rem 0.75rem', borderRadius: '0.375rem', color: '#9ca3af', fontSize: '0.875rem'
              }}>
                {booking.reservationId || booking._id.slice(-8).toUpperCase()}
              </span>
            </div>
            <div style={{
              background: getStatusColor(booking.status), color: '#fff',
              padding: '0.375rem 1rem', borderRadius: '2rem', fontWeight: '600',
              fontSize: '0.875rem', textTransform: 'capitalize'
            }}>
              {booking.status}
            </div>
          </div>

          {/* Overdue Warning Banner with Send Reminder */}
          {isOverdue() && (
            <div style={{
              background: 'linear-gradient(90deg, #ef4444, #dc2626)',
              color: 'white',
              padding: '1rem 1.25rem',
              marginBottom: '1.5rem',
              borderRadius: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '0.75rem'
            }}>
              <div>
                <div style={{ fontWeight: '700', fontSize: '1.05rem', marginBottom: '0.25rem' }}>
                  {getOverdueInfo()} - Renter should extend or return immediately!
                </div>
                <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>
                  Insurance coverage may no longer be active. Send the driver an SMS reminder to extend.
                </div>
              </div>
              <button
                onClick={handleSendReminder}
                disabled={sendingReminder}
                style={{
                  background: 'rgba(255,255,255,0.95)',
                  color: '#dc2626',
                  border: 'none',
                  padding: '0.6rem 1.25rem',
                  borderRadius: '0.5rem',
                  fontWeight: '700',
                  fontSize: '0.9rem',
                  cursor: sendingReminder ? 'not-allowed' : 'pointer',
                  whiteSpace: 'nowrap',
                  opacity: sendingReminder ? 0.7 : 1
                }}
              >
                {sendingReminder ? 'Sending...' : 'Send SMS Reminder'}
              </button>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '2rem', alignItems: 'start' }}>
            {/* Left Column - Inspection Photos */}
            <div>
              <InspectionPhotos
                title="Pickup Inspection"
                inspection={booking.pickupInspection}
                completedLabel="Pickup inspection not yet completed"
              />

              <InspectionPhotos
                title="Return Inspection"
                inspection={booking.returnInspection}
                completedLabel="Return inspection not yet completed"
              />

              {/* Rental Agreement */}
              {booking.agreement?.signed && (
                <div style={{ marginTop: '1.5rem' }}>
                  <button
                    onClick={() => setShowAgreement(!showAgreement)}
                    style={{
                      background: 'none', border: '1px solid #333', borderRadius: '0.5rem',
                      color: '#10b981', cursor: 'pointer', padding: '0.75rem 1rem',
                      width: '100%', fontSize: '1rem', fontWeight: '600',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center'
                    }}
                  >
                    <span>Rental Agreement</span>
                    <span style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                      Signed {new Date(booking.agreement.signedAt).toLocaleDateString()} {showAgreement ? '▲' : '▼'}
                    </span>
                  </button>
                  {showAgreement && (
                    <div style={{ marginTop: '1rem' }}>
                      <RentalAgreement bookingId={booking._id} readOnly={true} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Column - Reservation & Driver Info */}
            <div>
              {/* Driver Info */}
              <div style={{
                background: '#1a1a1a', border: '1px solid #333',
                borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem'
              }}>
                <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1.125rem' }}>Driver</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                  <div style={{
                    width: '48px', height: '48px', borderRadius: '50%',
                    overflow: 'hidden', flexShrink: 0, background: '#e5e7eb'
                  }}>
                    {booking.driver?.profileImage ? (
                      <img
                        src={getImageUrl(booking.driver.profileImage)}
                        alt={booking.driver?.firstName}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    ) : (
                      <div style={{
                        width: '100%', height: '100%', display: 'flex',
                        alignItems: 'center', justifyContent: 'center',
                        color: '#6b7280', fontSize: '1.125rem', fontWeight: '600'
                      }}>
                        {booking.driver?.firstName?.[0]?.toUpperCase() || '?'}
                      </div>
                    )}
                  </div>
                  <div>
                    <div style={{ color: '#fff', fontWeight: '600' }}>
                      {booking.driver?.firstName} {booking.driver?.lastName}
                    </div>
                  </div>
                </div>
                {booking.driver?.phone && (
                  <div style={{ color: '#9ca3af', fontSize: '0.8125rem', marginBottom: '0.25rem' }}>
                    {formatPhone(booking.driver.phone)}
                  </div>
                )}
                {booking.driver?.email && (
                  <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>
                    {booking.driver.email}
                  </div>
                )}
              </div>

              {/* Message Driver */}
              {booking.status !== 'cancelled' && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <button
                    onClick={() => setShowChat(!showChat)}
                    style={{
                      width: '100%',
                      padding: '0.75rem 1rem',
                      background: showChat ? '#059669' : '#10b981',
                      color: '#000',
                      border: 'none',
                      borderRadius: '12px',
                      fontSize: '1rem',
                      fontWeight: '600',
                      cursor: 'pointer'
                    }}
                  >
                    {showChat ? 'Close Chat' : 'Message Driver'}
                  </button>
                  {showChat && user && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <ChatBox
                        bookingId={booking._id}
                        currentUserId={user._id || user.id}
                        otherUserName={`${booking.driver?.firstName || ''} ${booking.driver?.lastName || ''}`.trim()}
                        currentRole="host"
                        onClose={() => setShowChat(false)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Reservation Details */}
              <div style={{
                background: '#1a1a1a', border: '1px solid #333',
                borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem'
              }}>
                <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1.125rem' }}>Reservation Details</h3>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
                  <div>
                    <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>PICKUP</div>
                    <div style={{ color: '#fff', fontSize: '0.9375rem' }}>{formatDate(booking.startDate)}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>at {formatTimeWithZone(booking.pickupTime, vehicleData?.location?.state)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>RETURN</div>
                    <div style={{ color: '#fff', fontSize: '0.9375rem' }}>{formatDate(booking.endDate)}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>by {formatTimeWithZone(booking.dropoffTime, vehicleData?.location?.state)}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #333', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#9ca3af' }}>Duration</span>
                    <span style={{ color: '#fff' }}>{booking.totalDays} day(s)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#9ca3af' }}>Rate</span>
                    <span style={{ color: '#fff' }}>${booking.pricePerUnit || booking.pricePerDay}/{booking.rentalType === 'weekly' ? 'week' : booking.rentalType === 'monthly' ? 'month' : 'day'}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#9ca3af' }}>Payment</span>
                    <span style={{
                      color: booking.paymentStatus === 'paid' ? '#10b981' : '#9ca3af',
                      fontWeight: '600', textTransform: 'capitalize'
                    }}>
                      {booking.paymentStatus}
                    </span>
                  </div>
                  {booking.insurance?.type && booking.insurance.type !== 'none' && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <span style={{ color: '#9ca3af' }}>Insurance</span>
                      <span style={{ color: '#fff' }}>
                        {booking.insurance.type === 'carshare' ? 'Liability Coverage' : 'Full Coverage'}
                        {booking.insurance.totalCost > 0 && ` ($${booking.insurance.totalCost.toFixed(2)})`}
                      </span>
                    </div>
                  )}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: '1px solid #333', paddingTop: '0.75rem', marginTop: '0.5rem'
                  }}>
                    <span style={{ color: '#fff', fontWeight: '600' }}>Total</span>
                    <span style={{ color: '#10b981', fontWeight: '700', fontSize: '1.125rem' }}>${(booking.totalPrice || 0).toFixed(2)}</span>
                  </div>
                  {booking.hostEarnings > 0 && (
                    <>
                      {booking.hostPlatformFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                          <span style={{ color: '#9ca3af' }}>Platform Fee</span>
                          <span style={{ color: '#9ca3af' }}>-${booking.hostPlatformFee.toFixed(2)}</span>
                        </div>
                      )}
                      {booking.hostProcessingFee > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                          <span style={{ color: '#9ca3af' }}>Processing Fee</span>
                          <span style={{ color: '#9ca3af' }}>-${booking.hostProcessingFee.toFixed(2)}</span>
                        </div>
                      )}
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                        <span style={{ color: '#9ca3af' }}>Your Earnings</span>
                        <span style={{ color: '#10b981', fontWeight: '600' }}>${booking.hostEarnings.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Extensions */}
              {booking.extensions?.length > 0 && (() => {
                // Host view: totalPrice already has platformFee & driverProcessingFee stripped by backend.
                // Extension cost fields still include those, so subtract them to get host-view extension costs.
                const extensionDaysTotal = booking.extensions.reduce((sum, ext) => sum + (ext.days || 0), 0);
                const extensionInsuranceTotal = booking.extensions.reduce((sum, ext) => {
                  if (ext.insurance != null) return sum + ext.insurance;
                  return sum + (ext.days || 0) * (booking.insurance?.costPerDay || 0);
                }, 0);
                // For host view, extension cost minus platform fee & processing fee = rental + insurance
                const extensionHostCostTotal = booking.extensions.reduce((sum, ext) => {
                  const extRental = ext.rental != null ? ext.rental : ext.rentalCost != null ? ext.rentalCost : (ext.days || 0) * (booking.pricePerDay || 0);
                  const extInsurance = ext.insurance != null ? ext.insurance : (ext.days || 0) * (booking.insurance?.costPerDay || 0);
                  return sum + extRental + extInsurance;
                }, 0);

                const originalDays = booking.totalDays - extensionDaysTotal;
                const originalTotalPrice = booking.totalPrice - extensionHostCostTotal;
                const originalInsuranceCost = Math.max(0, (booking.insurance?.totalCost || 0) - extensionInsuranceTotal);
                const bookingRental = Math.max(0, originalTotalPrice - originalInsuranceCost);
                const bookingDescription = booking.rentalType === 'daily' ? `${originalDays} day(s)` : booking.rentalType === 'weekly' ? `${booking.quantity || 1} week(s)` : `${booking.quantity || 1} month(s)`;

                return (
                <div style={{
                  background: '#1a1a1a', border: '1px solid #333',
                  borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem'
                }}>
                  <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1.125rem' }}>Transaction History</h3>
                  <div ref={extWrapperRef} style={{ position: 'relative' }}>
                    <div className="transaction-scroll" style={{
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.75rem',
                      maxHeight: '400px',
                      overflowY: 'auto',
                      paddingRight: '0.75rem'
                    }}>
                      {/* Initial Booking */}
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        paddingBottom: '0.75rem',
                        borderBottom: '1px solid #262626',
                        cursor: 'pointer'
                      }}
                        onMouseEnter={(e) => {
                          const wrapperRect = extWrapperRef.current.getBoundingClientRect();
                          const itemRect = e.currentTarget.getBoundingClientRect();
                          setTooltipData({
                            type: 'booking',
                            rental: bookingRental,
                            days: originalDays,
                            platformFee: 0,
                            insurance: originalInsuranceCost,
                            processingFee: 0,
                            total: originalTotalPrice,
                            top: itemRect.bottom - wrapperRect.top
                          });
                        }}
                        onMouseLeave={() => setTooltipData(null)}
                      >
                        <div>
                          <div style={{ color: '#fff', fontWeight: '600', fontSize: '0.875rem' }}>
                            Booking Created
                          </div>
                          <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{bookingDescription} rental</div>
                          <div style={{ color: '#6b7280', fontSize: '0.6875rem', marginTop: '0.125rem' }}>
                            {formatDate(booking.createdAt)}
                          </div>
                        </div>
                        <div style={{ color: '#fff', fontWeight: '600', fontSize: '0.875rem' }}>
                          ${originalTotalPrice.toFixed(2)}
                        </div>
                      </div>

                      {/* Extensions */}
                      {booking.extensions.map((ext, i) => {
                        const rental = ext.rental != null ? ext.rental : ext.rentalCost != null ? ext.rentalCost : ext.days * (booking.pricePerDay || 0);
                        const extInsurance = ext.insurance != null ? ext.insurance : ext.days * (booking.insurance?.costPerDay || 0);
                        const extHostCost = rental + extInsurance;

                        return (
                          <div key={i} style={{
                            display: 'flex', justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            paddingBottom: i < booking.extensions.length - 1 ? '0.75rem' : 0,
                            borderBottom: i < booking.extensions.length - 1 ? '1px solid #262626' : 'none',
                            cursor: 'pointer'
                          }}
                            onMouseEnter={(e) => {
                              const wrapperRect = extWrapperRef.current.getBoundingClientRect();
                              const itemRect = e.currentTarget.getBoundingClientRect();
                              setTooltipData({ type: 'extension', ext, rental, platformFee: 0, insurance: extInsurance, processingFee: 0, hostCost: extHostCost, top: itemRect.bottom - wrapperRect.top });
                            }}
                            onMouseLeave={() => setTooltipData(null)}
                          >
                            <div>
                              <div style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.875rem' }}>
                                +{ext.days} day(s)
                              </div>
                              <div style={{ color: '#6b7280', fontSize: '0.6875rem' }}>
                                {formatDate(ext.extendedAt)}
                              </div>
                            </div>
                            <div style={{ color: '#fff', fontWeight: '600', fontSize: '0.875rem' }}>
                              ${extHostCost.toFixed(2)}
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Tooltip rendered outside scroll container so it's not clipped */}
                    {tooltipData && (
                      <div className="extension-tooltip" style={{
                        top: tooltipData.top,
                        transform: 'translateY(8px)',
                        bottom: 'auto',
                        left: 0,
                        right: '0.75rem'
                      }}>
                        <div className="extension-tooltip-title">
                          {tooltipData.type === 'booking' ? 'Booking Breakdown' : 'Extension Breakdown'}
                        </div>
                        <div className="extension-tooltip-row">
                          <span>Rental</span>
                          <span>${tooltipData.rental.toFixed(2)}</span>
                        </div>
                        <div className="extension-tooltip-detail">
                          {tooltipData.type === 'booking'
                            ? `${tooltipData.days} day${tooltipData.days !== 1 ? 's' : ''} × $${(tooltipData.rental / tooltipData.days).toFixed(2)}/day`
                            : `${tooltipData.ext.days} day${tooltipData.ext.days !== 1 ? 's' : ''} × $${(tooltipData.rental / tooltipData.ext.days).toFixed(2)}/day`
                          }
                        </div>
                        {tooltipData.platformFee > 0 && (
                          <div className="extension-tooltip-row">
                            <span>Platform Fee</span>
                            <span>${tooltipData.platformFee.toFixed(2)}</span>
                          </div>
                        )}
                        {tooltipData.insurance > 0 && (
                          <div className="extension-tooltip-row">
                            <span>Insurance</span>
                            <span>${tooltipData.insurance.toFixed(2)}</span>
                          </div>
                        )}
                        {tooltipData.processingFee > 0 && (
                          <div className="extension-tooltip-row">
                            <span>Processing Fee</span>
                            <span>${tooltipData.processingFee.toFixed(2)}</span>
                          </div>
                        )}
                        <div className="extension-tooltip-divider"></div>
                        <div className="extension-tooltip-row extension-tooltip-total">
                          <span>Total</span>
                          <span>${tooltipData.type === 'booking' ? tooltipData.total.toFixed(2) : (tooltipData.hostCost || 0).toFixed(2)}</span>
                        </div>
                        {tooltipData.type === 'extension' && tooltipData.ext.newEndDate && (
                          <div className="extension-tooltip-enddate">
                            New End Date: {formatDate(tooltipData.ext.newEndDate)}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                );
              })()}

              {/* Toll Charges */}
              {['active', 'completed'].includes(booking.status) && (
                <TollCharges bookingId={booking._id} embedded={true} />
              )}
              {!['active', 'completed'].includes(booking.status) && (
                <div style={{
                  background: '#1a1a1a', border: '1px dashed #333',
                  borderRadius: '12px', padding: '1.5rem', textAlign: 'center'
                }}>
                  <h3 style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Tolls & Charges</h3>
                  <p style={{ color: '#4b5563', fontSize: '0.8125rem', margin: 0 }}>Toll charges will appear here once the trip is active.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostReservationDetail;
