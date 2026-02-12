import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import RentalAgreement from '../../components/RentalAgreement';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import { formatPhone } from '../../utils/formatPhone';
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
  const { bookingId } = useParams();
  const navigate = useNavigate();

  const [booking, setBooking] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAgreement, setShowAgreement] = useState(false);

  useEffect(() => {
    fetchBooking();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const fetchBooking = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) { navigate('/login'); return; }

      const headers = { Authorization: `Bearer ${token}` };
      const response = await axios.get(`${API_URL}/api/bookings/host-bookings`, { headers });
      const found = response.data.find(b => b._id === bookingId);

      if (!found) {
        setError('Reservation not found');
        setLoading(false);
        return;
      }
      setBooking(found);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load reservation');
    } finally {
      setLoading(false);
    }
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
                    <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>at {formatTime(booking.pickupTime)}</div>
                  </div>
                  <div>
                    <div style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: '600', marginBottom: '0.25rem' }}>RETURN</div>
                    <div style={{ color: '#fff', fontSize: '0.9375rem' }}>{formatDate(booking.endDate)}</div>
                    <div style={{ color: '#9ca3af', fontSize: '0.8125rem' }}>by {formatTime(booking.dropoffTime)}</div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid #333', paddingTop: '0.75rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#9ca3af' }}>Duration</span>
                    <span style={{ color: '#fff' }}>{booking.totalDays} day(s)</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ color: '#9ca3af' }}>Rate</span>
                    <span style={{ color: '#fff' }}>${booking.pricePerDay}/day</span>
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
                      <span style={{ color: '#fff' }}>{booking.insurance.type === 'carshare' ? 'Liability Coverage' : 'Full Coverage'}</span>
                    </div>
                  )}
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    borderTop: '1px solid #333', paddingTop: '0.75rem', marginTop: '0.5rem'
                  }}>
                    <span style={{ color: '#fff', fontWeight: '600' }}>Total</span>
                    <span style={{ color: '#10b981', fontWeight: '700', fontSize: '1.125rem' }}>${booking.totalPrice}</span>
                  </div>
                  {booking.hostEarnings > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                      <span style={{ color: '#9ca3af' }}>Your Earnings</span>
                      <span style={{ color: '#10b981', fontWeight: '600' }}>${booking.hostEarnings.toFixed(2)}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Extensions */}
              {booking.extensions?.length > 0 && (
                <div style={{
                  background: '#1a1a1a', border: '1px solid #333',
                  borderRadius: '12px', padding: '1.5rem', marginBottom: '1.5rem'
                }}>
                  <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1.125rem' }}>Extensions</h3>
                  {booking.extensions.map((ext, i) => (
                    <div key={i} style={{
                      display: 'flex', justifyContent: 'space-between',
                      paddingBottom: i < booking.extensions.length - 1 ? '0.75rem' : 0,
                      borderBottom: i < booking.extensions.length - 1 ? '1px solid #262626' : 'none',
                      marginBottom: i < booking.extensions.length - 1 ? '0.75rem' : 0
                    }}>
                      <div>
                        <div style={{ color: '#3b82f6', fontWeight: '600', fontSize: '0.875rem' }}>
                          +{ext.days} day(s)
                        </div>
                        <div style={{ color: '#6b7280', fontSize: '0.6875rem' }}>
                          {formatDate(ext.extendedAt)}
                        </div>
                      </div>
                      <div style={{ color: '#fff', fontWeight: '600', fontSize: '0.875rem' }}>
                        ${ext.cost?.toFixed(2)}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Tolls placeholder */}
              <div style={{
                background: '#1a1a1a', border: '1px dashed #333',
                borderRadius: '12px', padding: '1.5rem', textAlign: 'center'
              }}>
                <h3 style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Tolls & Charges</h3>
                <p style={{ color: '#4b5563', fontSize: '0.8125rem', margin: 0 }}>Toll tracking coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostReservationDetail;
