import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import ChatBox from '../../components/ChatBox';
import RentalAgreement from '../../components/RentalAgreement';
import TollCharges from '../../components/TollCharges';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Driver.css';

// Convert a date string to local display
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

const ReservationDetail = () => {
  const { bookingId } = useParams();
  const navigate = useNavigate();
  // eslint-disable-next-line no-unused-vars
  const { user } = useAuth();

  const [booking, setBooking] = useState(null);
  const [vehicle, setVehicle] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAgreement, setShowAgreement] = useState(false);
  const [showChat, setShowChat] = useState(false);

  useEffect(() => {
    fetchBookingDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const fetchBookingDetails = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        navigate('/login');
        return;
      }

      const headers = { Authorization: `Bearer ${token}` };

      // Fetch all bookings and find the matching one
      const response = await axios.get(`${API_URL}/api/bookings/my-bookings`, { headers });
      const found = response.data.find(b => b._id === bookingId);

      if (!found) {
        setError('Reservation not found');
        setLoading(false);
        return;
      }

      setBooking(found);

      // Fetch full vehicle details
      if (found.vehicle?._id) {
        try {
          const vehicleRes = await axios.get(`${API_URL}/api/vehicles/${found.vehicle._id}`);
          setVehicle(vehicleRes.data);
        } catch (err) {
          // Vehicle might have been deleted, use booking's populated vehicle data
          setVehicle(found.vehicle);
        }
      }
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

  const buildTransactionHistory = () => {
    if (!booking) return [];
    const transactions = [];

    // Calculate extension totals to determine original booking values
    const extensionDaysTotal = booking.extensions?.reduce((sum, ext) => sum + (ext.days || 0), 0) || 0;
    const extensionCostTotal = booking.extensions?.reduce((sum, ext) => sum + (ext.cost || 0), 0) || 0;

    // Original booking values (before any extensions)
    const originalDays = booking.totalDays - extensionDaysTotal;
    const platformFeePerDay = booking.platformFeePerDay || 1.50;
    const originalPlatformFee = originalDays * platformFeePerDay;
    const originalTotalPrice = booking.totalPrice - extensionCostTotal;
    const originalRentalCost = originalTotalPrice - originalPlatformFee - (booking.insurance?.totalCost || 0);

    // Initial booking
    transactions.push({
      date: booking.createdAt,
      type: 'Booking Created',
      description: `${booking.rentalType === 'daily' ? `${originalDays} day(s)` : booking.rentalType === 'weekly' ? `${booking.quantity || 1} week(s)` : `${booking.quantity || 1} month(s)`} rental`,
      amount: originalRentalCost > 0 ? originalRentalCost : originalTotalPrice
    });

    // Platform fee (original, not including extensions)
    if (originalPlatformFee > 0) {
      transactions.push({
        date: booking.createdAt,
        type: 'Platform Fee',
        description: `$${platformFeePerDay.toFixed(2)}/day x ${originalDays} day${originalDays !== 1 ? 's' : ''}`,
        amount: originalPlatformFee
      });
    }

    // Insurance
    if (booking.insurance?.totalCost > 0) {
      transactions.push({
        date: booking.createdAt,
        type: 'Insurance',
        description: booking.insurance.type === 'carshare' ? 'Liability Coverage' : 'Full Coverage',
        amount: booking.insurance.totalCost
      });
    }

    // Processing fee (driver's half of Stripe fee)
    if (booking.driverProcessingFee > 0) {
      transactions.push({
        date: booking.createdAt,
        type: 'Processing Fee',
        description: 'Card processing fee',
        amount: booking.driverProcessingFee
      });
    }

    // Extensions
    if (booking.extensions?.length > 0) {
      booking.extensions.forEach((ext, i) => {
        transactions.push({
          date: ext.extendedAt,
          type: 'Extension',
          description: `Extended by ${ext.days} day(s)`,
          amount: ext.cost
        });
      });
    }

    // Agreement amendments
    if (booking.agreement?.amendments?.length > 0) {
      booking.agreement.amendments.forEach((amendment) => {
        if (amendment.type === 'vehicle_swap') {
          transactions.push({
            date: amendment.acknowledgedAt,
            type: 'Vehicle Swap',
            description: amendment.description || 'Vehicle changed',
            amount: amendment.additionalCost || 0
          });
        }
      });
    }

    return transactions;
  };

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px' }}>
          Loading reservation...
        </div>
      </div>
    );
  }

  if (error || !booking) {
    return (
      <div>
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px' }}>
          <p style={{ color: '#ef4444' }}>{error || 'Reservation not found'}</p>
          <button className="btn btn-primary" onClick={() => navigate('/my-bookings')} style={{ marginTop: '1rem' }}>
            Back to My Reservations
          </button>
        </div>
      </div>
    );
  }

  const vehicleData = vehicle || booking.vehicle;
  const transactions = buildTransactionHistory();
  const totalSpent = transactions.reduce((sum, t) => sum + (t.amount || 0), 0);

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container">
          <button
            onClick={() => navigate('/my-bookings')}
            style={{
              background: 'none',
              border: 'none',
              color: '#10b981',
              cursor: 'pointer',
              fontSize: '1rem',
              padding: '0',
              marginBottom: '1.5rem',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem'
            }}
          >
            &larr; Back to My Reservations
          </button>

          {/* Reservation Header */}
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: '2rem',
            flexWrap: 'wrap',
            gap: '1rem'
          }}>
            <div>
              <h1 style={{ color: '#fff', margin: '0 0 0.5rem 0', fontSize: '1.75rem' }}>
                {vehicleData?.nickname || `${vehicleData?.year} ${vehicleData?.make} ${vehicleData?.model}`}
              </h1>
              {vehicleData?.nickname && (
                <p style={{ color: '#9ca3af', margin: '0 0 0.5rem 0' }}>
                  {vehicleData?.year} {vehicleData?.make} {vehicleData?.model}
                </p>
              )}
              <span style={{
                fontFamily: 'monospace',
                background: '#1a1a1a',
                border: '1px solid #333',
                padding: '0.25rem 0.75rem',
                borderRadius: '0.375rem',
                color: '#9ca3af',
                fontSize: '0.875rem'
              }}>
                {booking.reservationId || booking._id.slice(-8).toUpperCase()}
              </span>
            </div>
            <div style={{
              background: getStatusColor(booking.status),
              color: '#fff',
              padding: '0.375rem 1rem',
              borderRadius: '2rem',
              fontWeight: '600',
              fontSize: '0.875rem',
              textTransform: 'capitalize'
            }}>
              {booking.status}
            </div>
          </div>

          <div className="vehicle-detail">
            {/* Left Column - Vehicle Info */}
            <div className="vehicle-detail-main">
              {/* Vehicle Images */}
              <div className="vehicle-images" style={{ marginBottom: '1.5rem' }}>
                {vehicleData?.images?.length > 0 ? (
                  vehicleData.images.map((img, index) => (
                    <img key={index} src={getImageUrl(img)} alt={`${vehicleData.make} ${vehicleData.model}`} />
                  ))
                ) : (
                  <div className="vehicle-placeholder-large">No Images Available</div>
                )}
              </div>

              {/* Vehicle Specs */}
              <div className="vehicle-specs" style={{ marginBottom: '1.5rem' }}>
                <div className="spec-item"><strong>Type:</strong> {vehicleData?.type}</div>
                <div className="spec-item"><strong>Seats:</strong> {vehicleData?.seats}</div>
                <div className="spec-item"><strong>Transmission:</strong> {vehicleData?.transmission}</div>
                {vehicleData?.tripCount > 0 && (
                  <div className="spec-item"><strong>Trips:</strong> {vehicleData.tripCount}</div>
                )}
              </div>

              {/* Description */}
              {vehicleData?.description && (
                <div className="vehicle-section" style={{ marginBottom: '1.5rem' }}>
                  <h2>Description</h2>
                  <p>{vehicleData.description}</p>
                </div>
              )}

              {/* Features */}
              {vehicleData?.features?.length > 0 && (
                <div className="vehicle-section" style={{ marginBottom: '1.5rem' }}>
                  <h2>Features</h2>
                  <ul className="features-list">
                    {vehicleData.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Host Info */}
              <div className="vehicle-section">
                <h2>Hosted by {vehicleData?.host?.hostInfo?.displayPreference === 'business' && vehicleData?.host?.hostInfo?.businessName
                  ? vehicleData.host.hostInfo.businessName
                  : `${booking.host?.firstName || vehicleData?.host?.firstName || ''} ${booking.host?.lastName || vehicleData?.host?.lastName || ''}`}</h2>
                {vehicleData?.host?.rating > 0 && (
                  <p>Host rating: {vehicleData.host.rating.toFixed(1)} ({vehicleData.host.reviewCount} reviews)</p>
                )}
              </div>

              {/* Rental Agreement */}
              {booking.agreement?.signed && (
                <div className="vehicle-section" style={{ marginTop: '1.5rem' }}>
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

            {/* Right Column - Reservation & Transactions */}
            <aside className="booking-sidebar">
              {/* Reservation Details Card */}
              <div style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '1.5rem'
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
                    <span style={{ color: '#fff' }}>
                      ${booking.pricePerDay}/{booking.rentalType === 'weekly' ? 'week' : booking.rentalType === 'monthly' ? 'month' : 'day'}
                    </span>
                  </div>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    borderTop: '1px solid #333',
                    paddingTop: '0.75rem',
                    marginTop: '0.5rem'
                  }}>
                    <span style={{ color: '#fff', fontWeight: '600' }}>Total</span>
                    <span style={{ color: '#10b981', fontWeight: '700', fontSize: '1.125rem' }}>${(booking.totalPrice || 0).toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
                    <span style={{ color: '#9ca3af' }}>Payment</span>
                    <span style={{
                      color: booking.paymentStatus === 'paid' ? '#10b981' : booking.paymentStatus === 'refunded' ? '#f59e0b' : '#9ca3af',
                      fontWeight: '600',
                      textTransform: 'capitalize'
                    }}>
                      {booking.paymentStatus}
                    </span>
                  </div>
                </div>
              </div>

              {/* Message Host */}
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
                    {showChat ? 'Close Chat' : 'Message Host'}
                  </button>
                  {showChat && user && (
                    <div style={{ marginTop: '0.75rem' }}>
                      <ChatBox
                        bookingId={booking._id}
                        currentUserId={user._id || user.id}
                        otherUserName={`${booking.host?.firstName || ''} ${booking.host?.lastName || ''}`.trim()}
                        currentRole="driver"
                        onClose={() => setShowChat(false)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Transaction History Card */}
              <div style={{
                background: '#1a1a1a',
                border: '1px solid #333',
                borderRadius: '12px',
                padding: '1.5rem',
                marginBottom: '1.5rem'
              }}>
                <h3 style={{ color: '#fff', margin: '0 0 1rem 0', fontSize: '1.125rem' }}>Transaction History</h3>

                {transactions.length > 0 ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                    {transactions.map((txn, index) => (
                      <div key={index} style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'flex-start',
                        paddingBottom: index < transactions.length - 1 ? '0.75rem' : 0,
                        borderBottom: index < transactions.length - 1 ? '1px solid #262626' : 'none'
                      }}>
                        <div>
                          <div style={{
                            color: txn.type === 'Extension' ? '#3b82f6' : txn.type === 'Vehicle Swap' ? '#f59e0b' : '#fff',
                            fontWeight: '600',
                            fontSize: '0.875rem'
                          }}>
                            {txn.type}
                          </div>
                          <div style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{txn.description}</div>
                          <div style={{ color: '#6b7280', fontSize: '0.6875rem', marginTop: '0.125rem' }}>
                            {formatDate(txn.date)}
                          </div>
                        </div>
                        <div style={{
                          color: txn.amount > 0 ? '#fff' : '#6b7280',
                          fontWeight: '600',
                          fontSize: '0.875rem',
                          whiteSpace: 'nowrap'
                        }}>
                          {txn.amount > 0 ? `$${txn.amount.toFixed(2)}` : '-'}
                        </div>
                      </div>
                    ))}

                    {/* Total */}
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      borderTop: '1px solid #333',
                      paddingTop: '0.75rem',
                      marginTop: '0.25rem'
                    }}>
                      <span style={{ color: '#fff', fontWeight: '700' }}>Total Spent</span>
                      <span style={{ color: '#10b981', fontWeight: '700', fontSize: '1rem' }}>${totalSpent.toFixed(2)}</span>
                    </div>
                  </div>
                ) : (
                  <p style={{ color: '#6b7280', fontSize: '0.875rem' }}>No transactions yet.</p>
                )}
              </div>

              {/* Toll Charges */}
              {['active', 'completed'].includes(booking.status) && (
                <TollCharges bookingId={booking._id} embedded={true} />
              )}
              {!['active', 'completed'].includes(booking.status) && (
                <div style={{
                  background: '#1a1a1a',
                  border: '1px dashed #333',
                  borderRadius: '12px',
                  padding: '1.5rem',
                  textAlign: 'center'
                }}>
                  <h3 style={{ color: '#6b7280', margin: '0 0 0.5rem 0', fontSize: '1rem' }}>Tolls & Charges</h3>
                  <p style={{ color: '#4b5563', fontSize: '0.8125rem', margin: 0 }}>
                    Toll charges will appear here once the trip is active.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReservationDetail;
