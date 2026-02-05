import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axiosInstance from '../../config/axios';
import Navbar from '../../components/Navbar';
import Footer from '../../components/Footer';
import './Payouts.css';

const Payouts = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

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

    // Check for onboarding completion
    if (searchParams.get('onboarding') === 'complete') {
      setSuccessMessage('Payout account setup complete! You can now receive payouts.');
      // Remove query param
      navigate('/host/payouts', { replace: true });
    }
  }, [fetchData, searchParams, navigate]);

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

  const handleTransferAll = async () => {
    if (!window.confirm('Transfer all eligible earnings to your bank account?')) {
      return;
    }

    try {
      setProcessing(true);
      setError('');

      const res = await axiosInstance.post('/api/connect/transfer-all-eligible');
      setSuccessMessage(res.data.message);

      // Refresh data
      await fetchData();
    } catch (err) {
      console.error('Error transferring:', err);
      setError(err.response?.data?.message || 'Failed to transfer earnings');
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
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  if (loading) {
    return (
      <div className="payouts-page">
        <Navbar />
        <div className="payouts-container">
          <div className="loading-spinner">Loading...</div>
        </div>
        <Footer />
      </div>
    );
  }

  return (
    <div className="payouts-page">
      <Navbar />
      <div className="payouts-container">
        <div className="payouts-header">
          <h1>Payouts</h1>
          <p>Manage your earnings and payout settings</p>
        </div>

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
                <li>7-day hold after trip completion for security</li>
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
                <span className="earnings-note">Past 7-day hold</span>
              </div>
              <div className="earnings-item">
                <span className="earnings-label">Total Paid Out</span>
                <span className="earnings-amount">{formatCurrency(payoutHistory?.totalPaidOut)}</span>
                <span className="earnings-note">{payoutHistory?.payouts?.length || 0} payouts</span>
              </div>
            </div>

            {pendingPayouts?.totalEligible > 0 && accountStatus?.payoutsEnabled && (
              <button
                className="btn btn-primary transfer-btn"
                onClick={handleTransferAll}
                disabled={processing}
              >
                {processing ? 'Processing...' : `Transfer ${formatCurrency(pendingPayouts.totalEligible)} Now`}
              </button>
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
                  <table className="payouts-table">
                    <thead>
                      <tr>
                        <th>Reservation</th>
                        <th>Vehicle</th>
                        <th>Driver</th>
                        <th>Trip End</th>
                        <th>Eligible Date</th>
                        <th>Amount</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pendingPayouts?.pendingBookings?.map(booking => (
                        <tr key={booking.id}>
                          <td>{booking.reservationId}</td>
                          <td>{booking.vehicle}</td>
                          <td>{booking.driver}</td>
                          <td>{formatDate(booking.endDate)}</td>
                          <td>{formatDate(booking.payoutEligibleDate)}</td>
                          <td className="amount">{formatCurrency(booking.hostEarnings)}</td>
                          <td>
                            <span className={`status-badge ${new Date(booking.payoutEligibleDate) <= new Date() ? 'eligible' : 'pending'}`}>
                              {new Date(booking.payoutEligibleDate) <= new Date() ? 'Eligible' : 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
                  <table className="payouts-table">
                    <thead>
                      <tr>
                        <th>Reservation</th>
                        <th>Vehicle</th>
                        <th>Driver</th>
                        <th>Payout Date</th>
                        <th>Amount</th>
                      </tr>
                    </thead>
                    <tbody>
                      {payoutHistory?.payouts?.map(payout => (
                        <tr key={payout.id}>
                          <td>{payout.reservationId}</td>
                          <td>{payout.vehicle}</td>
                          <td>{payout.driver}</td>
                          <td>{formatDate(payout.payoutDate)}</td>
                          <td className="amount">{formatCurrency(payout.payoutAmount)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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
              <h4>7-Day Hold</h4>
              <p>Funds are held for 7 days to allow for any damage claims or disputes.</p>
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
      <Footer />
    </div>
  );
};

export default Payouts;
