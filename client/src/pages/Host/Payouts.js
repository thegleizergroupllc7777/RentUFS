import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../config/axios';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import './Payouts.css';

// Expandable reservation detail card
const ReservationCard = ({ booking, formatCurrency, formatDate, isPaid }) => {
  const [expanded, setExpanded] = useState(false);
  const isEligible = !isPaid && new Date(booking.payoutEligibleDate) <= new Date();
  // For daily rentals, use pricePerDay × totalDays (legacy bookings have quantity defaulting to 1)
  const rentalSubtotal = booking.rentalSubtotal || (
    (!booking.rentalType || booking.rentalType === 'daily')
      ? (booking.pricePerDay || 0) * (booking.totalDays || 0)
      : (booking.pricePerUnit || booking.pricePerDay || 0) * (booking.quantity || booking.totalDays || 0)
  );

  return (
    <div className={`reservation-card ${expanded ? 'expanded' : ''}`}>
      <div className="reservation-card-header" onClick={() => setExpanded(!expanded)}>
        <div className="reservation-card-left">
          <span className="reservation-id">{booking.reservationId}</span>
          <span className="reservation-vehicle">
            {booking.vehicleNickname || booking.vehicle}
          </span>
        </div>
        <div className="reservation-card-right">
          <span className="reservation-amount">{formatCurrency(isPaid ? booking.payoutAmount : booking.hostEarnings)}</span>
          {isPaid ? (
            <span className="status-badge paid">Paid</span>
          ) : (
            <span className={`status-badge ${isEligible ? 'eligible' : 'pending'}`}>
              {isEligible ? 'Eligible' : 'Pending'}
            </span>
          )}
          <span className={`expand-arrow ${expanded ? 'rotated' : ''}`}>&#9662;</span>
        </div>
      </div>

      {expanded && (
        <div className="reservation-card-details">
          <div className="detail-section">
            <h4>Trip Details</h4>
            <div className="detail-row">
              <span className="detail-label">Driver</span>
              <span className="detail-value">{booking.driver}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Trip Dates</span>
              <span className="detail-value">{formatDate(booking.startDate)} - {formatDate(booking.endDate)}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Duration</span>
              <span className="detail-value">{booking.totalDays} day{booking.totalDays !== 1 ? 's' : ''}</span>
            </div>
            {isPaid && booking.payoutDate && (
              <div className="detail-row">
                <span className="detail-label">Paid On</span>
                <span className="detail-value">{formatDate(booking.payoutDate)}</span>
              </div>
            )}
            {!isPaid && (
              <div className="detail-row">
                <span className="detail-label">Completed</span>
                <span className="detail-value">{formatDate(booking.payoutEligibleDate)}</span>
              </div>
            )}
          </div>

          <div className="detail-section">
            <h4>Earnings Breakdown</h4>
            <div className="detail-row">
              <span className="detail-label">Rate</span>
              <span className="detail-value">{formatCurrency(booking.pricePerUnit || booking.pricePerDay)}/{booking.rentalType === 'weekly' ? 'week' : booking.rentalType === 'monthly' ? 'month' : 'day'}</span>
            </div>
            <div className="detail-row">
              <span className="detail-label">Rental Subtotal</span>
              <span className="detail-value">{formatCurrency(rentalSubtotal)}</span>
            </div>
            <div className="detail-row deduction">
              <span className="detail-label">Host Service Fee</span>
              <span className="detail-value">-{formatCurrency(booking.hostPlatformFee)}</span>
            </div>
            {booking.hostProcessingFee > 0 && (
              <div className="detail-row deduction">
                <span className="detail-label">Processing Fee</span>
                <span className="detail-value">-{formatCurrency(booking.hostProcessingFee)}</span>
              </div>
            )}
            <div className="detail-row total">
              <span className="detail-label">Your Earnings</span>
              <span className="detail-value">{formatCurrency(booking.hostEarnings)}</span>
            </div>
          </div>

          <div className="detail-section detail-section-note">
            <p>Your earnings are the rental subtotal minus the host service fee and processing fee.</p>
          </div>
        </div>
      )}
    </div>
  );
};

// Embeddable payouts content (used both standalone and inside Profile sidebar)
const PayoutsContent = () => {
  const [loading, setLoading] = useState(true);
  const [accountStatus, setAccountStatus] = useState(null);
  const [pendingPayouts, setPendingPayouts] = useState(null);
  const [payoutHistory, setPayoutHistory] = useState(null);
  const [balance, setBalance] = useState({ available: 0, pending: 0 });
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [processing, setProcessing] = useState(false);
  const [activeTab, setActiveTab] = useState('pending');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statusRes, pendingRes, historyRes, balanceRes] = await Promise.all([
        axiosInstance.get('/api/connect/account-status'),
        axiosInstance.get('/api/connect/pending-payouts'),
        axiosInstance.get('/api/connect/payout-history'),
        axiosInstance.get('/api/connect/balance')
      ]);

      setAccountStatus(statusRes.data);
      setPendingPayouts(pendingRes.data);
      setPayoutHistory(historyRes.data);
      setBalance(balanceRes.data);
    } catch (err) {
      console.error('Error fetching payout data:', err);
      setError('Failed to load payout information');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleCreateAccount = async () => {
    try {
      setProcessing(true);
      setError('');

      // Create account
      await axiosInstance.post('/api/connect/create-account');

      // Get onboarding link
      const linkRes = await axiosInstance.post('/api/connect/onboarding-link');

      // Redirect to Stripe onboarding
      window.location.href = linkRes.data.url;
    } catch (err) {
      console.error('Error creating account:', err);
      setError(err.response?.data?.message || 'Failed to create payout account');
      setProcessing(false);
    }
  };

  const handleContinueOnboarding = async () => {
    try {
      setProcessing(true);
      setError('');

      const linkRes = await axiosInstance.post('/api/connect/onboarding-link');
      window.location.href = linkRes.data.url;
    } catch (err) {
      console.error('Error getting onboarding link:', err);
      setError(err.response?.data?.message || 'Failed to continue setup');
      setProcessing(false);
    }
  };

  const handleOpenDashboard = async () => {
    try {
      setProcessing(true);
      const linkRes = await axiosInstance.post('/api/connect/dashboard-link');
      window.open(linkRes.data.url, '_blank');
    } catch (err) {
      console.error('Error getting dashboard link:', err);
      setError(err.response?.data?.message || 'Failed to open dashboard');
    } finally {
      setProcessing(false);
    }
  };


  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount || 0);
  };

  const formatDate = (date) => {
    if (!date) return '-';
    // Parse to local midnight to avoid UTC-to-local timezone shift
    const str = typeof date === 'string' ? date : new Date(date).toISOString();
    const datePart = str.split('T')[0];
    return new Date(datePart + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="payouts-container">
        <div className="loading-spinner">Loading...</div>
      </div>
    );
  }

  return (
    <div className="payouts-container">
      {error && (
        <div className="payouts-alert payouts-alert-error">
          {error}
          <button onClick={() => setError('')} className="alert-close">x</button>
        </div>
      )}

      {successMessage && (
        <div className="payouts-alert payouts-alert-success">
          {successMessage}
          <button onClick={() => setSuccessMessage('')} className="alert-close">x</button>
        </div>
      )}

      {/* Account Status Card */}
      <div className="payouts-card account-status-card">
        <h2>Payout Account</h2>

        {accountStatus?.isPlatformOwner ? (
          <div className="account-active">
            <div className="account-status-badge">
              <span className="status-dot active"></span>
              Platform Owner - Payouts Active
            </div>
            <p style={{ color: '#9ca3af', margin: '1rem 0' }}>
              As the platform owner, all rental payments are deposited directly into your Stripe account.
              Manage your payouts and view transactions through your Stripe Dashboard.
            </p>
            <button
              className="btn btn-secondary dashboard-btn"
              onClick={() => window.open('https://dashboard.stripe.com', '_blank')}
            >
              Open Stripe Dashboard
            </button>
          </div>
        ) : !accountStatus?.hasAccount ? (
          <div className="setup-prompt">
            <div className="setup-icon">$</div>
            <h3>Set Up Payouts</h3>
            <p>Connect your bank account to receive earnings from your vehicle rentals.</p>
            <ul className="setup-benefits">
              <li>Weekly automatic payouts (every Monday)</li>
              <li>Earnings available after trip completion</li>
              <li>View earnings and payout history</li>
              <li>Secure bank account connection via Stripe</li>
            </ul>
            <button
              className="btn btn-primary setup-btn"
              onClick={handleCreateAccount}
              disabled={processing}
            >
              {processing ? 'Setting up...' : 'Set Up Payout Account'}
            </button>
          </div>
        ) : !accountStatus.onboardingComplete ? (
          <div className="setup-prompt">
            <div className="setup-icon pending">!</div>
            <h3>Complete Your Setup</h3>
            <p>Your payout account setup is incomplete. Please continue to add your bank account and verify your identity.</p>
            <button
              className="btn btn-primary setup-btn"
              onClick={handleContinueOnboarding}
              disabled={processing}
            >
              {processing ? 'Loading...' : 'Continue Setup'}
            </button>
          </div>
        ) : (
          <div className="account-active">
            <div className="account-status-badge">
              <span className="status-dot active"></span>
              Payouts {accountStatus.payoutsEnabled ? 'Enabled' : 'Pending Verification'}
            </div>

            <div className="balance-summary">
              <div className="balance-item">
                <span className="balance-label">Available Balance</span>
                <span className="balance-amount">{formatCurrency(balance.available)}</span>
              </div>
              <div className="balance-item">
                <span className="balance-label">Pending</span>
                <span className="balance-amount pending">{formatCurrency(balance.pending)}</span>
              </div>
            </div>

            {accountStatus.payoutSchedule && (
              <div className="payout-schedule">
                <span className="schedule-label">Payout Schedule:</span>
                <span className="schedule-value">
                  {accountStatus.payoutSchedule.interval === 'weekly'
                    ? `Weekly on ${accountStatus.payoutSchedule.weekly_anchor}s`
                    : accountStatus.payoutSchedule.interval}
                </span>
              </div>
            )}

            <button
              className="btn btn-secondary dashboard-btn"
              onClick={handleOpenDashboard}
              disabled={processing}
            >
              Open Stripe Dashboard
            </button>
          </div>
        )}
      </div>

      {/* Earnings Summary */}
      {accountStatus?.hasAccount && (
        <div className="payouts-card earnings-summary-card">
          <div className="earnings-grid">
            <div className="earnings-item">
              <span className="earnings-label">Pending Earnings</span>
              <span className="earnings-amount">{formatCurrency(pendingPayouts?.totalPending)}</span>
              <span className="earnings-note">{pendingPayouts?.pendingBookings?.length || 0} bookings</span>
            </div>
            <div className="earnings-item">
              <span className="earnings-label">Ready for Payout</span>
              <span className="earnings-amount highlight">{formatCurrency(pendingPayouts?.totalEligible)}</span>
              <span className="earnings-note">Completed trips</span>
            </div>
            <div className="earnings-item">
              <span className="earnings-label">Total Paid Out</span>
              <span className="earnings-amount">{formatCurrency(payoutHistory?.totalPaidOut)}</span>
              <span className="earnings-note">{payoutHistory?.payouts?.length || 0} payouts</span>
            </div>
          </div>

          {pendingPayouts?.totalEligible > 0 && accountStatus?.payoutsEnabled && (
            <p className="earnings-note">Payouts are processed automatically every Monday</p>
          )}
        </div>
      )}

      {/* Tabs for Pending/History */}
      {accountStatus?.hasAccount && (
        <div className="payouts-card">
          <div className="payouts-tabs">
            <button
              className={`tab-btn ${activeTab === 'pending' ? 'active' : ''}`}
              onClick={() => setActiveTab('pending')}
            >
              Pending ({pendingPayouts?.pendingBookings?.length || 0})
            </button>
            <button
              className={`tab-btn ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              History ({payoutHistory?.payouts?.length || 0})
            </button>
          </div>

          {activeTab === 'pending' && (
            <div className="payouts-list">
              {pendingPayouts?.pendingBookings?.length === 0 ? (
                <div className="empty-state">
                  <p>No pending payouts</p>
                  <span>Completed trips will appear here</span>
                </div>
              ) : (
                <div className="reservation-cards">
                  <p className="cards-hint">Tap a reservation to see the full breakdown</p>
                  {pendingPayouts.pendingBookings.map(booking => (
                    <ReservationCard
                      key={booking.id}
                      booking={booking}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                      isPaid={false}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'history' && (
            <div className="payouts-list">
              {payoutHistory?.payouts?.length === 0 ? (
                <div className="empty-state">
                  <p>No payout history</p>
                  <span>Completed payouts will appear here</span>
                </div>
              ) : (
                <div className="reservation-cards">
                  <p className="cards-hint">Tap a reservation to see the full breakdown</p>
                  {payoutHistory.payouts.map(payout => (
                    <ReservationCard
                      key={payout.id}
                      booking={payout}
                      formatCurrency={formatCurrency}
                      formatDate={formatDate}
                      isPaid={true}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Info Section */}
      <div className="payouts-info">
        <h3>How Payouts Work</h3>
        <div className="info-grid">
          <div className="info-item">
            <div className="info-icon">1</div>
            <h4>Trip Completes</h4>
            <p>When a rental ends and the vehicle is returned, your earnings are calculated.</p>
          </div>
          <div className="info-item">
            <div className="info-icon">2</div>
            <h4>Earnings Ready</h4>
            <p>Your earnings become available for payout immediately after trip completion.</p>
          </div>
          <div className="info-item">
            <div className="info-icon">3</div>
            <h4>Weekly Payout</h4>
            <p>Eligible funds are automatically transferred to your bank every Monday.</p>
          </div>
          <div className="info-item">
            <div className="info-icon">4</div>
            <h4>Bank Deposit</h4>
            <p>Funds typically arrive in your bank account within 2-3 business days.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// Standalone payouts page (with Navbar/Footer)
const Payouts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  useEffect(() => {
    // Check for onboarding completion and redirect to profile payouts tab
    if (searchParams.get('onboarding') === 'complete') {
      navigate('/profile?tab=payouts', { replace: true });
    } else {
      // Redirect standalone /host/payouts to profile payouts tab
      navigate('/profile?tab=payouts', { replace: true });
    }
  }, [searchParams, navigate]);

  return (
    <div className="payouts-page">
      <Navbar />
      <div className="payouts-container">
        <div className="loading-spinner">Redirecting...</div>
      </div>
      <Footer />
    </div>
  );
};

export { PayoutsContent };
export default Payouts;
