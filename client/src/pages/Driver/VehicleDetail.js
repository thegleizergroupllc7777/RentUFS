import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../../context/AuthContext';
import Navbar from '../../components/Navbar';
import DatePicker from '../../components/DatePicker';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import './Driver.css';

const formatTime12h = (time24) => {
  const h = parseInt(time24.split(':')[0], 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:00 ${ampm}`;
};

const VehicleDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [vehicle, setVehicle] = useState(null);
  const [reviews, setReviews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeBooking, setActiveBooking] = useState(null);
  const [isRented, setIsRented] = useState(false);
  const [bookingData, setBookingData] = useState({
    startDate: '',
    endDate: '',
    pickupTime: '10:00',
    dropoffTime: '10:00',
    rentalType: 'daily',
    quantity: 1,
    message: ''
  });
  const [bookingLoading, setBookingLoading] = useState(false);
  const [error, setError] = useState('');
  const [currentHour, setCurrentHour] = useState(new Date().getHours());

  // Refresh current hour every minute so time options stay accurate
  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentHour(new Date().getHours());
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  // Load Wheelbase/Outdoorsy booking SDK only when viewing a fleet vehicle
  useEffect(() => {
    if (!vehicle || vehicle.bookingProvider !== 'wheelbase') return;

    window.Outdoorsy = window.Outdoorsy || {};
    window.Outdoorsy.color = '10b981';

    const script = document.createElement('script');
    script.src = 'https://d3cuf6g1arkgx6.cloudfront.net/sdk/wheelbase.min.js';
    script.async = true;
    document.body.appendChild(script);

    return () => {
      if (document.body.contains(script)) {
        document.body.removeChild(script);
      }
    };
  }, [vehicle]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch vehicle and reviews in parallel
        const requests = [
          axios.get(`${API_URL}/api/vehicles/${id}`),
          axios.get(`${API_URL}/api/reviews/vehicle/${id}`)
        ];

        // Also fetch the user's own bookings if logged in (for the activeBooking banner)
        const token = localStorage.getItem('token');
        if (user && token) {
          requests.push(
            axios.get(`${API_URL}/api/bookings/my-bookings`, {
              headers: { Authorization: `Bearer ${token}` }
            })
          );
        }

        const results = await Promise.allSettled(requests);

        // Handle vehicle response — also drives the public "Rented" badge
        if (results[0].status === 'fulfilled') {
          const v = results[0].value.data;
          setVehicle(v);
          setIsRented(Boolean(v?.rentedNow));
        }

        // Handle reviews response
        if (results[1].status === 'fulfilled') {
          setReviews(results[1].value.data);
        }

        // Handle active booking response
        if (results[2]?.status === 'fulfilled') {
          const now = new Date();
          const currentBooking = results[2].value.data.find(booking => {
            if (booking.vehicle?._id !== id) return false;
            if (!['active', 'confirmed'].includes(booking.status)) return false;
            const endDate = new Date(booking.endDate);
            return endDate >= now;
          });
          if (currentBooking) {
            setActiveBooking(currentBooking);
          }
        }
      } catch (error) {
        console.error('Error fetching vehicle data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, user]);

  const handleBookingChange = (e) => {
    const { name, value } = e.target;
    setBookingData(prev => {
      const updated = { ...prev, [name]: value };
      // Drop-off time always matches pickup time (exact 24h/week/month rental)
      if (name === 'pickupTime') {
        updated.dropoffTime = value;
      }
      return updated;
    });
  };

  const handleRentalTypeChange = (e) => {
    const rentalType = e.target.value;
    setBookingData(prev => ({
      ...prev,
      rentalType,
      quantity: 1,
      startDate: prev.startDate,
      endDate: ''
    }));
  };

  // Convert Date to YYYY-MM-DD in local timezone (avoids UTC shift)
  const toLocalDateStr = (date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };

  // Calculate end date based on rental type and quantity
  const calculateEndDate = (startDate, rentalType, quantity) => {
    if (!startDate) return '';
    const start = new Date(startDate + 'T00:00:00'); // Force local timezone
    let end = new Date(start);
    const qty = parseInt(quantity, 10) || 1; // Ensure quantity is a number

    switch (rentalType) {
      case 'daily':
        end.setDate(start.getDate() + qty);
        break;
      case 'weekly':
        end.setDate(start.getDate() + (qty * 7));
        break;
      case 'monthly':
        end.setMonth(start.getMonth() + qty);
        break;
      default:
        end.setDate(start.getDate() + qty);
    }

    return toLocalDateStr(end);
  };

  // Update end date when start date, rental type, or quantity changes
  useEffect(() => {
    if (bookingData.startDate && bookingData.rentalType && bookingData.quantity) {
      const endDate = calculateEndDate(bookingData.startDate, bookingData.rentalType, bookingData.quantity);
      setBookingData(prev => ({ ...prev, endDate }));
    }
  }, [bookingData.startDate, bookingData.rentalType, bookingData.quantity]);

  const calculateTotal = () => {
    if (!vehicle || !bookingData.quantity) return 0;

    switch (bookingData.rentalType) {
      case 'daily':
        return bookingData.quantity * vehicle.pricePerDay;
      case 'weekly':
        return bookingData.quantity * (vehicle.pricePerWeek || vehicle.pricePerDay * 7);
      case 'monthly':
        return bookingData.quantity * (vehicle.pricePerMonth || vehicle.pricePerDay * 30);
      default:
        return bookingData.quantity * vehicle.pricePerDay;
    }
  };

  const getPriceLabel = () => {
    if (!vehicle) return '';
    switch (bookingData.rentalType) {
      case 'daily':
        return `$${vehicle.pricePerDay}/day`;
      case 'weekly':
        return `$${vehicle.pricePerWeek || vehicle.pricePerDay * 7}/week`;
      case 'monthly':
        return `$${vehicle.pricePerMonth || vehicle.pricePerDay * 30}/month`;
      default:
        return `$${vehicle.pricePerDay}/day`;
    }
  };

  const getQuantityLabel = () => {
    switch (bookingData.rentalType) {
      case 'daily':
        return 'Number of Days';
      case 'weekly':
        return 'Number of Weeks';
      case 'monthly':
        return 'Number of Months';
      default:
        return 'Duration';
    }
  };

  // Check if the selected start date is today
  const isStartDateToday = bookingData.startDate === toLocalDateStr(new Date());

  // Build the list of available pickup time options
  const availableTimeOptions = (() => {
    const allHours = Array.from({ length: 24 }, (_, i) => {
      const val = String(i).padStart(2, '0') + ':00';
      const h12 = i === 0 ? 12 : i > 12 ? i - 12 : i;
      const ampm = i >= 12 ? 'PM' : 'AM';
      return { value: val, label: `${h12}:00 ${ampm}` };
    });
    if (!isStartDateToday) return allHours;
    // Only show hours that are still in the future (at least next hour)
    return allHours.filter(opt => parseInt(opt.value) > currentHour);
  })();

  // Auto-advance pickupTime when the currently selected time is no longer available
  useEffect(() => {
    if (availableTimeOptions.length > 0) {
      const currentStillAvailable = availableTimeOptions.some(
        opt => opt.value === bookingData.pickupTime
      );
      if (!currentStillAvailable) {
        const next = availableTimeOptions[0].value;
        setBookingData(prev => ({ ...prev, pickupTime: next, dropoffTime: next }));
      }
    }
  }, [isStartDateToday, currentHour, bookingData.startDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleBooking = async (e) => {
    e.preventDefault();

    if (!user) {
      navigate('/login');
      return;
    }

    // Check if driver has a valid license on file
    if (!user.driverLicense?.licenseNumber || !user.driverLicense?.expirationDate) {
      setError('LICENSE_REQUIRED');
      return;
    }

    // Check if license is expired
    if (new Date(user.driverLicense.expirationDate) < new Date()) {
      setError('LICENSE_EXPIRED');
      return;
    }

    // Check if driver has a date of birth on file
    if (!user.dateOfBirth) {
      setError('DOB_REQUIRED');
      return;
    }

    // Check if driver has a complete home address on file (required for
    // rental agreement and insurance coverage)
    if (!user.address?.street || !user.address?.city || !user.address?.state || !user.address?.zipCode) {
      setError('ADDRESS_REQUIRED');
      return;
    }

    if (!bookingData.startDate) {
      setError('Please select a pick-up date');
      return;
    }

    // Prevent booking with a past pick-up time on today's date
    if (bookingData.startDate === toLocalDateStr(new Date())) {
      const selectedHour = parseInt(bookingData.pickupTime.split(':')[0], 10);
      if (selectedHour <= new Date().getHours()) {
        setError('Pick-up time has already passed. Please select a later time or a future date.');
        return;
      }
    }

    if (!bookingData.endDate) {
      setError('Unable to calculate end date. Please re-select your dates.');
      return;
    }

    setError('');
    setBookingLoading(true);

    try {
      const pickupDateTimeISO = new Date(
        `${bookingData.startDate}T${bookingData.pickupTime}:00`
      ).toISOString();

      const response = await axios.post(`${API_URL}/api/bookings`, {
        vehicleId: id,
        ...bookingData,
        pickupDateTimeISO
      });

      const bookingId = response.data._id;

      // Redirect to payment checkout page
      navigate(`/payment/checkout?booking_id=${bookingId}`);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create booking');
    } finally {
      setBookingLoading(false);
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

  if (!vehicle) {
    return (
      <div>
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px' }}>
          Vehicle not found
        </div>
      </div>
    );
  }

  const rentalSubtotal = calculateTotal();
  const platformFeePerDay = 1.50;
  const totalDaysForFee = bookingData.rentalType === 'weekly'
    ? (parseInt(bookingData.quantity, 10) || 1) * 7
    : bookingData.rentalType === 'monthly'
      ? (parseInt(bookingData.quantity, 10) || 1) * 30
      : (parseInt(bookingData.quantity, 10) || 1);
  const platformFee = platformFeePerDay * totalDaysForFee;
  const baseTotal = rentalSubtotal > 0 ? rentalSubtotal + platformFee : 0;

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="vehicle-detail">
            <div className="vehicle-detail-main">
              <h1 className="vehicle-detail-title">
                {vehicle.nickname || `${vehicle.year} ${vehicle.make} ${vehicle.model}`}
              </h1>
              {vehicle.nickname && (
                <p style={{ color: '#9ca3af', fontSize: '1rem', marginTop: '0.25rem' }}>
                  {vehicle.year} {vehicle.make} {vehicle.model}
                </p>
              )}

              <div className="vehicle-detail-header">
                <div>
                  {vehicle.rating > 0 && (
                    <span className="vehicle-rating">
                      ⭐ {vehicle.rating.toFixed(1)} ({vehicle.reviewCount} reviews)
                    </span>
                  )}
                  {vehicle.location?.city && (
                    <span className="vehicle-location">
                      📍 {vehicle.location.city}, {vehicle.location.state}
                    </span>
                  )}
                </div>
                <div className="vehicle-detail-price">
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 'bold', color: '#10b981' }}>
                      ${vehicle.pricePerDay}/day
                    </div>
                    {vehicle.pricePerWeek && (
                      <div style={{ fontSize: '1rem', color: '#6b7280' }}>
                        ${vehicle.pricePerWeek}/week
                      </div>
                    )}
                    {vehicle.pricePerMonth && (
                      <div style={{ fontSize: '1rem', color: '#6b7280' }}>
                        ${vehicle.pricePerMonth}/month
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="vehicle-images">
                {vehicle.images?.length > 0 ? (
                  vehicle.images.map((img, index) => (
                    <img key={index} src={getImageUrl(img)} alt={`${vehicle.make} ${vehicle.model}`} />
                  ))
                ) : (
                  <div className="vehicle-placeholder-large">No Images Available</div>
                )}
              </div>

              <div className="vehicle-specs">
                <div className="spec-item">
                  <strong>Type:</strong> {vehicle.type}
                </div>
                <div className="spec-item">
                  <strong>Seats:</strong> {vehicle.seats}
                </div>
                <div className="spec-item">
                  <strong>Transmission:</strong> {vehicle.transmission}
                </div>
                <div className="spec-item">
                  <strong>Trips:</strong> {vehicle.tripCount}
                </div>
              </div>

              <div className="vehicle-section">
                <h2>Description</h2>
                <p>{vehicle.description}</p>
              </div>

              {vehicle.features?.length > 0 && (
                <div className="vehicle-section">
                  <h2>Features</h2>
                  <ul className="features-list">
                    {vehicle.features.map((feature, index) => (
                      <li key={index}>{feature}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="vehicle-section">
                <h2>Hosted by {(() => {
                  const h = vehicle.host?.hostInfo;
                  if (h?.displayPreference === 'business' && h?.businessName) return h.businessName;
                  if (h?.displayPreference === 'dba' && h?.dba) return h.dba;
                  return `${vehicle.host?.firstName} ${vehicle.host?.lastName}`;
                })()}</h2>
                {vehicle.host?.rating > 0 && (
                  <p>Host Rating: ⭐ {vehicle.host.rating.toFixed(1)} ({vehicle.host.reviewCount} reviews)</p>
                )}
              </div>

              {reviews.length > 0 && (
                <div className="vehicle-section">
                  <h2>Reviews</h2>
                  <div className="reviews-list">
                    {reviews.map(review => (
                      <div key={review._id} className="review-item">
                        <div className="review-header">
                          <strong>{review.reviewer?.firstName}</strong>
                          <span className="review-rating">⭐ {review.rating}</span>
                        </div>
                        <p>{review.comment}</p>
                        <small className="text-gray">
                          {new Date(review.createdAt).toLocaleDateString()}
                        </small>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <aside className="booking-sidebar">
              <div className="booking-card">
                {user && vehicle.host && (user._id === vehicle.host._id || user._id === vehicle.host) ? (
                  <>
                    <h3>Your Vehicle</h3>
                    <div style={{
                      backgroundColor: '#064e3b',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      border: '1px solid #10b981'
                    }}>
                      <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Status:</strong>{' '}
                        <span style={{
                          display: 'inline-block',
                          background: isRented ? '#f59e0b' : vehicle.availability ? '#10b981' : '#ef4444',
                          color: isRented ? '#000' : 'white',
                          padding: '0.15rem 0.6rem',
                          borderRadius: '1rem',
                          fontSize: '0.75rem',
                          fontWeight: '600'
                        }}>
                          {isRented ? 'Rented' : vehicle.availability ? 'Available' : 'Unavailable'}
                        </span>
                      </div>
                      <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Daily Rate:</strong> ${vehicle.pricePerDay}
                      </div>
                      {vehicle.pricePerWeek && (
                        <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                          <strong style={{ color: '#6ee7b7' }}>Weekly Rate:</strong> ${vehicle.pricePerWeek}
                        </div>
                      )}
                      {vehicle.pricePerMonth && (
                        <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                          <strong style={{ color: '#6ee7b7' }}>Monthly Rate:</strong> ${vehicle.pricePerMonth}
                        </div>
                      )}
                      <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Trips:</strong> {vehicle.tripCount}
                      </div>
                      {vehicle.rating > 0 && (
                        <div style={{ color: '#ffffff' }}>
                          <strong style={{ color: '#6ee7b7' }}>Rating:</strong> ⭐ {vehicle.rating.toFixed(1)}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => navigate(`/host/edit-vehicle/${vehicle._id}`)}
                      className="btn btn-primary"
                      style={{ width: '100%', marginBottom: '0.5rem' }}
                    >
                      Edit Vehicle
                    </button>
                    <button
                      onClick={() => navigate('/host/dashboard')}
                      className="btn"
                      style={{
                        width: '100%',
                        backgroundColor: 'transparent',
                        border: '1px solid #10b981',
                        color: '#10b981',
                        padding: '0.625rem 1rem',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Back to Dashboard
                    </button>
                  </>
                ) : activeBooking ? (
                  <>
                    <h3>Your Current Reservation</h3>
                    <div style={{
                      backgroundColor: '#064e3b',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      border: '1px solid #10b981'
                    }}>
                      <div style={{
                        display: 'inline-block',
                        background: activeBooking.status === 'active' ? '#3b82f6' :
                                   activeBooking.status === 'pending' ? '#f59e0b' : '#10b981',
                        color: 'white',
                        padding: '0.25rem 0.75rem',
                        borderRadius: '1rem',
                        fontSize: '0.75rem',
                        fontWeight: '600',
                        marginBottom: '0.75rem',
                        textTransform: 'capitalize'
                      }}>
                        {activeBooking.status}
                      </div>
                      <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Reservation ID:</strong><br />
                        <span style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>
                          {activeBooking.reservationId || activeBooking._id.slice(-8).toUpperCase()}
                        </span>
                      </div>
                      <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Pickup:</strong><br />
                        {new Date(activeBooking.startDate.split('T')[0] + 'T00:00:00').toLocaleDateString()} at {formatTime12h(activeBooking.pickupTime || '10:00')}
                      </div>
                      <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Return:</strong><br />
                        {new Date(activeBooking.endDate.split('T')[0] + 'T00:00:00').toLocaleDateString()} by {formatTime12h(activeBooking.dropoffTime || '10:00')}
                      </div>
                      <div style={{ marginBottom: '0.5rem', color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Duration:</strong> {activeBooking.totalDays} day(s)
                      </div>
                      <div style={{ color: '#ffffff' }}>
                        <strong style={{ color: '#6ee7b7' }}>Total Price:</strong> ${Number(activeBooking.totalPrice).toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => navigate('/my-bookings')}
                      className="btn btn-primary"
                      style={{ width: '100%', marginBottom: '0.5rem' }}
                    >
                      Manage Reservation
                    </button>
                    <p style={{ fontSize: '0.75rem', color: '#6b7280', textAlign: 'center', margin: 0 }}>
                      Go to My Bookings to manage this reservation
                    </p>
                  </>
                ) : user && user.userType === 'host' ? (
                  <>
                    <h3>Want to rent this car?</h3>
                    <div style={{
                      backgroundColor: '#1a1a2e',
                      padding: '1rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      border: '1px solid #3b82f6'
                    }}>
                      <p style={{ color: '#93c5fd', margin: '0 0 0.75rem 0', fontSize: '0.95rem' }}>
                        You're currently signed in as a <strong>host</strong>. Host accounts can't rent vehicles.
                      </p>
                      <p style={{ color: '#9ca3af', margin: 0, fontSize: '0.85rem' }}>
                        Please contact support to enable renting on your account.
                      </p>
                    </div>
                    <button
                      onClick={() => navigate('/marketplace')}
                      className="btn"
                      style={{
                        width: '100%',
                        backgroundColor: 'transparent',
                        border: '1px solid #10b981',
                        color: '#10b981',
                        padding: '0.625rem 1rem',
                        borderRadius: '0.375rem',
                        cursor: 'pointer',
                        fontWeight: '600'
                      }}
                    >
                      Browse Marketplace
                    </button>
                  </>
                ) : vehicle.bookingProvider === 'wheelbase' ? (
                  <>
                    <h3>Book this car</h3>
                    <div style={{
                      backgroundColor: '#1a2e1a',
                      border: '1px solid #10b981',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      fontSize: '0.9rem',
                      color: '#e5e7eb'
                    }}>
                      <div style={{ marginBottom: '0.25rem' }}>
                        <strong style={{ color: '#6ee7b7' }}>Booking:</strong> {vehicle.year} {vehicle.make} {vehicle.model}
                        {vehicle.nickname ? ` (${vehicle.nickname})` : ''}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#9ca3af' }}>
                        Complete your booking below
                      </div>
                    </div>
                    <div
                      id="outdoorsy-book-now-container"
                      data-rental={vehicle.wheelbase?.rentalId}
                      data-color="10b981"
                    />
                  </>
                ) : (
                  <>
                    <h3>Book this car</h3>

                    {/* Show available pricing options */}
                <div style={{
                  backgroundColor: '#f0fdf4',
                  padding: '1rem',
                  borderRadius: '0.5rem',
                  marginBottom: '1rem',
                  border: '1px solid #bbf7d0'
                }}>
                  <div style={{ fontWeight: '600', marginBottom: '0.5rem', color: '#166534' }}>Available Rates:</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', fontSize: '0.95rem' }}>
                    <div style={{ color: '#15803d' }}>
                      <strong>${vehicle.pricePerDay}</strong>/day
                    </div>
                    {vehicle.pricePerWeek && (
                      <div style={{ color: '#15803d' }}>
                        <strong>${vehicle.pricePerWeek}</strong>/week
                      </div>
                    )}
                    {vehicle.pricePerMonth && (
                      <div style={{ color: '#15803d' }}>
                        <strong>${vehicle.pricePerMonth}</strong>/month
                      </div>
                    )}
                  </div>
                </div>

                {error && (error === 'LICENSE_REQUIRED' || error === 'LICENSE_EXPIRED' || error === 'DOB_REQUIRED' || error === 'ADDRESS_REQUIRED') ? (
                  <div style={{
                    background: 'rgba(239, 68, 68, 0.1)',
                    border: '1px solid #ef4444',
                    borderRadius: '0.5rem',
                    padding: '1rem',
                    marginBottom: '1rem'
                  }}>
                    <p style={{ color: '#ef4444', fontWeight: '600', margin: '0 0 0.5rem 0' }}>
                      {error === 'LICENSE_REQUIRED'
                        ? 'A valid driver\'s license is required to book a vehicle.'
                        : error === 'LICENSE_EXPIRED'
                        ? 'Your driver\'s license has expired.'
                        : error === 'ADDRESS_REQUIRED'
                        ? 'A complete home address is required to book a vehicle.'
                        : 'Your date of birth is required to book a vehicle.'}
                    </p>
                    <p style={{ color: '#9ca3af', margin: '0 0 0.75rem 0', fontSize: '0.875rem' }}>
                      {error === 'LICENSE_REQUIRED'
                        ? 'Please add your driver\'s license details before making a reservation.'
                        : error === 'LICENSE_EXPIRED'
                        ? 'Please update your license with a valid expiration date.'
                        : error === 'ADDRESS_REQUIRED'
                        ? 'Please add your street, city, state, and zip code in your profile before making a reservation.'
                        : 'Please add your date of birth in your profile before making a reservation.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => navigate((error === 'DOB_REQUIRED' || error === 'ADDRESS_REQUIRED') ? '/driver/profile?tab=profile' : '/driver/profile?tab=license')}
                      style={{
                        background: '#10b981',
                        color: '#000',
                        border: 'none',
                        padding: '0.5rem 1rem',
                        borderRadius: '0.375rem',
                        fontWeight: '600',
                        cursor: 'pointer',
                        fontSize: '0.875rem'
                      }}
                    >
                      {(error === 'DOB_REQUIRED' || error === 'ADDRESS_REQUIRED') ? 'Go to Profile' : 'Go to Driver\'s License'}
                    </button>
                  </div>
                ) : error ? (
                  <div className="error-message">{error}</div>
                ) : null}

                <form onSubmit={handleBooking}>
                  <div className="form-group">
                    <label className="form-label">Rental Type</label>
                    <select
                      name="rentalType"
                      className="form-select"
                      value={bookingData.rentalType}
                      onChange={handleRentalTypeChange}
                      required
                    >
                      <option value="daily">Daily (${vehicle.pricePerDay}/day)</option>
                      {vehicle.pricePerWeek && (
                        <option value="weekly">Weekly (${vehicle.pricePerWeek}/week)</option>
                      )}
                      {vehicle.pricePerMonth && (
                        <option value="monthly">Monthly (${vehicle.pricePerMonth}/month)</option>
                      )}
                    </select>
                  </div>

                  <div className="form-group">
                    <DatePicker
                      label="Pick-up Date"
                      name="startDate"
                      value={bookingData.startDate}
                      onChange={handleBookingChange}
                      min={(() => {
                        // If no hours left today (11 PM or later), set min to tomorrow
                        if (currentHour >= 23) {
                          const tomorrow = new Date();
                          tomorrow.setDate(tomorrow.getDate() + 1);
                          return toLocalDateStr(tomorrow);
                        }
                        return toLocalDateStr(new Date());
                      })()}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Pick-up Time</label>
                    {isStartDateToday && availableTimeOptions.length === 0 ? (
                      <div className="form-input" style={{ backgroundColor: '#f3f4f6', color: '#ef4444', cursor: 'default' }}>
                        No times available today — please pick a future date
                      </div>
                    ) : (
                      <select
                        name="pickupTime"
                        className="form-select"
                        value={bookingData.pickupTime}
                        onChange={handleBookingChange}
                      >
                        {availableTimeOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    )}
                  </div>

                  <div className="form-group">
                    <label className="form-label">{getQuantityLabel()}</label>
                    <select
                      name="quantity"
                      className="form-select"
                      value={bookingData.quantity}
                      onChange={handleBookingChange}
                      required
                    >
                      {(() => {
                        const max = bookingData.rentalType === 'monthly' ? 12 : bookingData.rentalType === 'weekly' ? 52 : 30;
                        const unit = bookingData.rentalType === 'monthly' ? 'month' : bookingData.rentalType === 'weekly' ? 'week' : 'day';
                        return Array.from({ length: max }, (_, i) => i + 1).map(n => (
                          <option key={n} value={n}>{n} {n === 1 ? unit : `${unit}s`}</option>
                        ));
                      })()}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Drop-off Time</label>
                    <div className="form-input" style={{
                      backgroundColor: '#f3f4f6',
                      color: '#374151',
                      cursor: 'default',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}>
                      <span>{(() => {
                        const h = parseInt(bookingData.pickupTime.split(':')[0], 10);
                        const ampm = h >= 12 ? 'PM' : 'AM';
                        const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                        return `${h12}:00 ${ampm}`;
                      })()}</span>
                      <span style={{ fontSize: '0.8rem', color: '#6b7280' }}>Same as pick-up</span>
                    </div>
                  </div>

                  {bookingData.startDate && bookingData.endDate && (
                    <div style={{
                      backgroundColor: '#1a2e1a',
                      border: '1px solid #10b981',
                      padding: '0.75rem',
                      borderRadius: '0.5rem',
                      marginBottom: '1rem',
                      fontSize: '0.9rem',
                      color: '#e5e7eb'
                    }}>
                      <div><strong>Pick-up:</strong> {new Date(bookingData.startDate + 'T00:00:00').toLocaleDateString()} at {formatTime12h(bookingData.pickupTime)}</div>
                      <div style={{ marginTop: '0.25rem' }}><strong>Return:</strong> {new Date(bookingData.endDate + 'T00:00:00').toLocaleDateString()} by {formatTime12h(bookingData.dropoffTime)}</div>
                    </div>
                  )}

                  <div className="form-group">
                    <label className="form-label">Message to Host (optional)</label>
                    <textarea
                      name="message"
                      className="form-textarea"
                      value={bookingData.message}
                      onChange={handleBookingChange}
                      placeholder="Tell the host about your trip..."
                      style={{ resize: 'none' }}
                    />
                  </div>

                  {baseTotal > 0 && (
                    <div className="booking-summary">
                      <div className="summary-row">
                        <span>
                          {getPriceLabel()} × {bookingData.quantity}
                        </span>
                        <span>${rentalSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="summary-row">
                        <span>Platform Fee ($1.50/day x {totalDaysForFee})</span>
                        <span>${platformFee.toFixed(2)}</span>
                      </div>
                      <div className="summary-total">
                        <strong>Estimated Total</strong>
                        <strong>${baseTotal.toFixed(2)}</strong>
                      </div>
                    </div>
                  )}

                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ width: '100%' }}
                    disabled={bookingLoading || !vehicle.availability}
                  >
                    {bookingLoading ? 'Processing...' : vehicle.availability ? 'Request to Book' : 'Not Available'}
                    </button>
                  </form>
                  </>
                )}
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VehicleDetail;
