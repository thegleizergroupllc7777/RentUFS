import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../config/axios';
import getImageUrl from '../../config/imageUrl';
import AdminLayout from './AdminLayout';
import LastActiveBadge from '../../components/LastActiveBadge';
import { useAuth } from '../../context/AuthContext';

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
// Trip dates are stored as midnight UTC of the selected day — format in UTC so a
// browser east of UTC doesn't show the previous day (matches the customer view).
const formatTripDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
// Full timestamp (date + time) for audit/legal proof, e.g. the e-signature time.
const formatDateTime = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const StatTile = ({ label, value, sublabel }) => (
  <div className="admin-stat-card">
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    {sublabel && <div className="sublabel">{sublabel}</div>}
  </div>
);

// Read-only mirror of what a host sees as their weekly pending payout on their
// OWN portal — shown beside the Owner Payout Control so the owner can compare
// "what they see" vs. "what's owed." Fetches the admin mirror endpoint; no writes.
const HostPortalMirror = ({ userId }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  useEffect(() => {
    let alive = true;
    axios.get(`/api/admin/hosts/${userId}/portal-payout-view`)
      .then(({ data }) => { if (alive) { setData(data); setLoading(false); } })
      .catch(() => { if (alive) { setErr('Could not load the host view.'); setLoading(false); } });
    return () => { alive = false; };
  }, [userId]);
  return (
    <div style={{ flex: '1 1 320px', minWidth: 0 }}>
      <div style={{ color: '#7c3aed', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
        What this host sees
      </div>
      <div style={{ background: '#faf5ff', border: '1px solid #e9d5ff', borderRadius: 10, padding: '12px 14px' }}>
        <div style={{ display: 'inline-block', background: '#ede9fe', color: '#6d28d9', fontSize: '0.7rem', fontWeight: 700, padding: '3px 9px', borderRadius: 6, marginBottom: 8 }}>🔎 Mirror of their portal</div>
        {loading ? (
          <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Loading their view…</div>
        ) : err ? (
          <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>{err}</div>
        ) : (
          <>
            <div style={{ fontSize: '0.9rem', color: '#111827', marginBottom: '0.5rem' }}>
              Their portal shows: <strong>{formatCurrency(data.total)}</strong>
            </div>
            {data.items && data.items.length > 0 ? (
              <div style={{ fontSize: '0.82rem', color: '#374151' }}>
                {data.items.map((it, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '0.15rem 0' }}>
                    <span>{it.reservationId} · {it.vehicle} <span style={{ color: '#9ca3af' }}>({it.note})</span></span>
                    <span>{formatCurrency(it.amount)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: '0.82rem', color: '#9ca3af' }}>Nothing pending on their view.</div>
            )}
          </>
        )}
        <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: 10, lineHeight: 1.5 }}>
          Read-only mirror of the host's own weekly payout screen. Can differ from "owed" on the left — that's expected; this shows exactly what they see.
        </div>
      </div>
    </div>
  );
};

const AdminUserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState({ asDriver: [], asHost: [] });
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [insuranceRate, setInsuranceRate] = useState('');
  const [savingRate, setSavingRate] = useState(false);
  const [rateInfo, setRateInfo] = useState('');
  const [fullCovRate, setFullCovRate] = useState('');
  const [savingFullCov, setSavingFullCov] = useState(false);
  const [fullCovInfo, setFullCovInfo] = useState('');
  const [coverageType, setCoverageType] = useState('FULL_COVERAGE');
  const [savingCoverage, setSavingCoverage] = useState(false);
  const [coverageInfo, setCoverageInfo] = useState('');
  const [savingUserType, setSavingUserType] = useState(false);
  const [payout, setPayout] = useState(null);
  const [payoutLoading, setPayoutLoading] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payoutMsg, setPayoutMsg] = useState('');
  const [waiveAmount, setWaiveAmount] = useState('');
  const [waiving, setWaiving] = useState(false);
  const [withholdAmount, setWithholdAmount] = useState('');
  const [withholding, setWithholding] = useState(false);
  const [salespeople, setSalespeople] = useState([]);
  const [savingReferredBy, setSavingReferredBy] = useState(false);
  const [referredByInfo, setReferredByInfo] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [u, b, v, s] = await Promise.all([
        axios.get(`/api/admin/users/${id}`),
        axios.get(`/api/admin/users/${id}/bookings`),
        axios.get(`/api/admin/users/${id}/vehicles`),
        axios.get(`/api/admin/users/${id}/stats`)
      ]);
      setUser(u.data);
      setBookings(b.data);
      setVehicles(v.data.vehicles);
      setStats(s.data);
      const rate = u.data?.hostInfo?.customInsuranceRate;
      setInsuranceRate(rate != null ? String(rate) : '');
      const fc = u.data?.hostInfo?.customFullCoverageRate;
      setFullCovRate(fc != null ? String(fc) : '');
      setCoverageType(u.data?.hostInfo?.coverageType || 'FULL_COVERAGE');
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Master-admin only: load what this host is currently owed (read-only preview).
  const loadPayoutPreview = useCallback(async () => {
    setPayoutLoading(true);
    setPayoutMsg('');
    try {
      const { data } = await axios.get(`/api/admin/hosts/${id}/payout-preview`);
      setPayout(data);
    } catch (err) {
      setPayout(null);
    } finally {
      setPayoutLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (me?.isSuperAdmin && user && (user.userType === 'host' || user.userType === 'both')) {
      loadPayoutPreview();
    }
  }, [me, user, loadPayoutPreview]);

  // Owner-only: load the list of salespeople (admins) for the "Referred by" dropdown.
  useEffect(() => {
    if (me?.isSuperAdmin && user && (user.userType === 'host' || user.userType === 'both')) {
      axios.get('/api/admin/salespeople')
        .then(({ data }) => setSalespeople(data || []))
        .catch(() => setSalespeople([]));
    }
  }, [me, user]);

  // Owner-only: set/clear which salesperson referred this host.
  const handleSetReferredBy = async (value) => {
    setSavingReferredBy(true);
    setError('');
    setReferredByInfo('');
    try {
      await axios.patch(`/api/admin/users/${id}/referred-by`, { referredBy: value || null });
      setReferredByInfo(value ? 'Referring salesperson saved.' : 'Referring salesperson cleared.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to set referring salesperson');
    } finally {
      setSavingReferredBy(false);
    }
  };

  const handlePayNow = async () => {
    if (!payout) return;
    const amount = payout.net || 0;
    if (amount <= 0) return;
    if (!window.confirm(`Pay ${payout.hostName} ${formatCurrency(amount)} now?\n\nThis sends a REAL Stripe transfer and cannot be undone. Already-paid bookings are never paid twice.`)) return;
    setPaying(true);
    setPayoutMsg('');
    setError('');
    try {
      const { data } = await axios.post(`/api/admin/hosts/${id}/pay-now`);
      setPayoutMsg(data.message || 'Payout sent.');
      await loadPayoutPreview();
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Payout failed');
    } finally {
      setPaying(false);
    }
  };

  // Owner-only: forgive some or all of a host's cancellation penalty. Sends the
  // typed amount, or nothing (= waive all). Only changes the penalty balance —
  // no money moves. Refreshes the payout preview so the new "owed" shows at once.
  const handleWaivePenalty = async () => {
    if (!payout) return;
    const raw = (waiveAmount || '').trim();
    const amt = raw === '' ? null : Number(raw);
    if (raw !== '' && (isNaN(amt) || amt <= 0)) {
      setError('Enter a valid amount to give back, or leave it blank to give back the full penalty.');
      return;
    }
    const confirmText = raw === ''
      ? `Release the ENTIRE ${formatCurrency(payout.penaltyDeducted)} held from ${payout.hostName || 'this host'}?\n\nThis only releases the held amount — no money is transferred.`
      : `Release ${formatCurrency(amt)} of the amount held from ${payout.hostName || 'this host'}?\n\nThis only releases the held amount — no money is transferred.`;
    if (!window.confirm(confirmText)) return;
    setWaiving(true);
    setPayoutMsg('');
    setError('');
    try {
      const { data } = await axios.post(`/api/admin/hosts/${id}/waive-penalty`, raw === '' ? {} : { amount: amt });
      setPayoutMsg(data.message || 'Penalty waived.');
      setWaiveAmount('');
      await loadPayoutPreview();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to waive penalty');
    } finally {
      setWaiving(false);
    }
  };

  // Owner-only: hold an amount from this host's next payout. Adds to the same
  // "held" balance the payout already deducts — no money moves here, and it's
  // fully reversible with "Give back". Refreshes the preview so "owed" updates.
  const handleWithhold = async () => {
    if (!payout) return;
    const amt = Number((withholdAmount || '').trim());
    if (isNaN(amt) || amt <= 0) {
      setError('Enter a valid dollar amount to withhold.');
      return;
    }
    if (!window.confirm(`Withhold ${formatCurrency(amt)} from ${payout.hostName || 'this host'}'s next payout?\n\nNo money moves now — it's held from their payout and can be released anytime with "Give back".`)) return;
    setWithholding(true);
    setPayoutMsg('');
    setError('');
    try {
      const { data } = await axios.post(`/api/admin/hosts/${id}/withhold`, { amount: amt });
      setPayoutMsg(data.message || 'Amount withheld.');
      setWithholdAmount('');
      await loadPayoutPreview();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to withhold');
    } finally {
      setWithholding(false);
    }
  };

  const performAction = async (endpoint) => {
    setError('');
    const confirmMsgs = {
      demote: 'Are you sure you want to remove admin access from this user?',
      promote: 'Make this user an admin? They will get full admin access.',
      suspend: 'Suspend this account? The user will not be able to log in until reactivated.'
    };
    if (confirmMsgs[endpoint] && !window.confirm(confirmMsgs[endpoint])) return;
    try {
      await axios.post(`/api/admin/users/${id}/${endpoint}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  const saveFullCoverageRate = async () => {
    setSavingFullCov(true);
    setError('');
    setFullCovInfo('');
    try {
      await axios.patch(`/api/admin/users/${id}`, {
        customFullCoverageRate: fullCovRate.trim() === '' ? null : fullCovRate.trim()
      });
      setFullCovInfo(
        fullCovRate.trim() === ''
          ? 'Custom Full Coverage rate cleared — host uses the standard $33/day.'
          : `Custom Full Coverage rate set to $${Number(fullCovRate).toFixed(2)}/day.`
      );
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save Full Coverage rate');
    } finally {
      setSavingFullCov(false);
    }
  };

  const saveInsuranceRate = async () => {
    setSavingRate(true);
    setError('');
    setRateInfo('');
    try {
      await axios.patch(`/api/admin/users/${id}`, {
        customInsuranceRate: insuranceRate.trim() === '' ? null : insuranceRate.trim()
      });
      setRateInfo(
        insuranceRate.trim() === ''
          ? 'Custom rate cleared — host uses the default rate.'
          : `Custom insurance rate set to $${Number(insuranceRate).toFixed(2)}/day.`
      );
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save insurance rate');
    } finally {
      setSavingRate(false);
    }
  };

  const saveCoverageType = async (newType) => {
    setSavingCoverage(true);
    setError('');
    setCoverageInfo('');
    try {
      await axios.patch(`/api/admin/users/${id}`, { coverageType: newType });
      setCoverageType(newType);
      setCoverageInfo(
        newType === 'LIABILITY'
          ? 'Coverage set to Liability only for this host’s fleet.'
          : 'Coverage set to Full Coverage for this host’s fleet.'
      );
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save coverage type');
    } finally {
      setSavingCoverage(false);
    }
  };

  const saveUserType = async (newType) => {
    setSavingUserType(true);
    setError('');
    try {
      await axios.patch(`/api/admin/users/${id}`, { userType: newType });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update user type');
    } finally {
      setSavingUserType(false);
    }
  };

  return (
    <AdminLayout title={user ? `${user.firstName} ${user.lastName}` : 'User'} subtitle={user?.email}>
      {error && <div className="admin-error">{error}</div>}
      {loading && <div className="admin-empty">Loading...</div>}
      {user && (
        <>
          {/* Go back to the exact filtered/scrolled list you came from. Fall
              back to a plain Users list if this page was opened directly. */}
          <button className="admin-btn" onClick={() => { if (window.history.length > 1) navigate(-1); else navigate('/admin/users'); }} style={{ marginBottom: '1rem' }}>← Back to users</button>

          {/* Last active — admin-only glance at whether this person is around. */}
          <div style={{ marginBottom: '1rem' }}><LastActiveBadge date={user.lastActiveAt} /></div>

          {/* Profile + quick actions */}
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: 0, color: '#111827' }}>Profile</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                <ProfileRow label="Phone" value={user.phone || '—'} />
                <ProfileRow label="User type" value={
                  <select
                    value={user.userType}
                    onChange={(e) => saveUserType(e.target.value)}
                    disabled={savingUserType}
                    style={{ padding: '0.3rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  >
                    <option value="driver">Driver</option>
                    <option value="host">Host</option>
                    <option value="both">Both (host + driver)</option>
                  </select>
                } />
                <ProfileRow label="Role" value={<span className={`badge ${user.role}`}>{user.role}</span>} />
                <ProfileRow label="Status" value={
                  <span className={`badge ${user.accountStatus === 'active' ? 'active-acct' : 'deactivated'}`}>
                    {user.accountStatus || 'unset'}
                  </span>
                } />
                <ProfileRow label="Joined" value={formatDate(user.createdAt)} />
                <ProfileRow label="Stripe customer" value={user.stripeCustomerId ? '✓ on file' : '—'} />
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {user.accountStatus === 'active' ? (
                  <button className="admin-btn danger" onClick={() => performAction('suspend')}>Suspend account</button>
                ) : (
                  <button className="admin-btn" onClick={() => performAction('reactivate')}>Reactivate account</button>
                )}
                {me?.isSuperAdmin && (
                  user.role === 'admin' ? (
                    <button className="admin-btn" onClick={() => performAction('demote')}>Revoke admin</button>
                  ) : (
                    <button className="admin-btn" onClick={() => performAction('promote')}>Make admin</button>
                  )
                )}
              </div>

              {/* Custom insurance rate (host override) — only relevant for hosts */}
              {(user.userType === 'host' || user.userType === 'both') && (
              <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #e5e7eb' }}>
                {/* Custom Full Coverage rate (host override) — sits on top of Liability. */}
                <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                  Custom Full Coverage rate (per day)
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#6b7280' }}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={fullCovRate}
                    onChange={(e) => setFullCovRate(e.target.value)}
                    placeholder="Default 33"
                    style={{ width: '120px', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>/day</span>
                  <button className="admin-btn" onClick={saveFullCoverageRate} disabled={savingFullCov}>
                    {savingFullCov ? 'Saving...' : 'Save rate'}
                  </button>
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                  Negotiated Full Coverage rate for this host only. Leave blank for the standard $33/day. Applies to all of this host's Full Coverage rentals going forward.
                </div>
                {fullCovInfo && <div style={{ color: '#059669', fontSize: '0.8rem', marginTop: '0.4rem' }}>{fullCovInfo}</div>}

                <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '1.25rem 0 0.5rem' }}>
                  Custom liability rate (per day)
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ color: '#6b7280' }}>$</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={insuranceRate}
                    onChange={(e) => setInsuranceRate(e.target.value)}
                    placeholder="Default 25"
                    style={{ width: '120px', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                  />
                  <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>/day</span>
                  <button className="admin-btn" onClick={saveInsuranceRate} disabled={savingRate}>
                    {savingRate ? 'Saving...' : 'Save rate'}
                  </button>
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                  Only applies when coverage type is Liability (VIP override). Leave blank for the standard $25 liability rate. (Full Coverage uses its own rate above.)
                </div>
                {rateInfo && <div style={{ color: '#059669', fontSize: '0.8rem', marginTop: '0.4rem' }}>{rateInfo}</div>}

                <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', margin: '1rem 0 0.5rem' }}>
                  Insurance coverage type
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                  <select
                    value={coverageType}
                    onChange={(e) => saveCoverageType(e.target.value)}
                    disabled={savingCoverage}
                    style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', minWidth: '180px' }}
                  >
                    <option value="FULL_COVERAGE">Full Coverage (AL + Comp & Collision)</option>
                    <option value="LIABILITY">Liability Only</option>
                  </select>
                  {savingCoverage && <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Saving...</span>}
                </div>
                <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                  Applies to all of this host's vehicles. Sent to the insurer when coverage starts. Default is Full Coverage.
                </div>
                {coverageInfo && <div style={{ color: '#059669', fontSize: '0.8rem', marginTop: '0.4rem' }}>{coverageInfo}</div>}

                {/* Owner-only: which salesperson referred this host. Credits the host's
                    booking days to that salesperson in the Commissions report. */}
                {me?.isSuperAdmin && (
                  <div style={{ marginTop: '1.25rem', paddingTop: '1.25rem', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                      Referred by (salesperson) — owner only
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <select
                        value={(user.referredBy?._id || user.referredBy) || ''}
                        onChange={(e) => handleSetReferredBy(e.target.value)}
                        disabled={savingReferredBy}
                        style={{ padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.375rem', minWidth: '220px' }}
                      >
                        <option value="">— Not referred —</option>
                        {salespeople.map((sp) => (
                          <option key={sp.id} value={sp.id}>{sp.name}</option>
                        ))}
                      </select>
                      {savingReferredBy && <span style={{ color: '#6b7280', fontSize: '0.8rem' }}>Saving…</span>}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                      Credits this host's booking days to the selected salesperson in the Commissions report.
                    </div>
                    {referredByInfo && <div style={{ color: '#059669', fontSize: '0.8rem', marginTop: '0.4rem' }}>{referredByInfo}</div>}
                  </div>
                )}
              </div>
              )}
            </div>
          </div>

          {/* Driver's license */}
          <h3 style={{ color: '#374151' }}>Driver's license</h3>
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginBottom: '1rem' }}>
              <ProfileRow label="License number" value={user.driverLicense?.licenseNumber || '—'} />
              <ProfileRow label="State" value={user.driverLicense?.state || '—'} />
              <ProfileRow label="Expiration" value={formatDate(user.driverLicense?.expirationDate)} />
              <ProfileRow label="Verified" value={
                <span className={`badge ${user.driverLicense?.verified ? 'active-acct' : 'deactivated'}`}>
                  {user.driverLicense?.verified ? 'verified' : 'not verified'}
                </span>
              } />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1rem' }}>
              <LicenseImage label="License photo" src={user.driverLicense?.licenseImage} />
              <LicenseImage label="Verification selfie" src={user.driverLicense?.verificationSelfie} />
            </div>
          </div>

          {/* Stripe payouts — whether the host can actually receive money */}
          {(user.userType === 'host' || user.userType === 'both') && (
            <>
              <h3 style={{ color: '#374151' }}>Stripe payouts</h3>
              <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <ProfileRow label="Payout account" value={
                    <span className={`badge ${user.stripeConnectAccountId ? 'active-acct' : 'deactivated'}`}>
                      {user.stripeConnectAccountId ? 'connected' : 'not connected'}
                    </span>
                  } />
                  <ProfileRow label="Onboarding" value={
                    <span className={`badge ${user.stripeConnectOnboardingComplete ? 'active-acct' : 'deactivated'}`}>
                      {user.stripeConnectOnboardingComplete ? 'complete' : 'incomplete'}
                    </span>
                  } />
                  <ProfileRow label="Payouts enabled" value={
                    <span className={`badge ${user.stripeConnectPayoutsEnabled ? 'active-acct' : 'deactivated'}`}>
                      {user.stripeConnectPayoutsEnabled ? 'yes' : 'no'}
                    </span>
                  } />
                  <ProfileRow label="Charges enabled" value={
                    <span className={`badge ${user.stripeConnectChargesEnabled ? 'active-acct' : 'deactivated'}`}>
                      {user.stripeConnectChargesEnabled ? 'yes' : 'no'}
                    </span>
                  } />
                </div>
                {!user.stripeConnectPayoutsEnabled && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#b45309' }}>
                    ⚠️ This host can't receive payouts yet — they still need to finish their Stripe payout setup.
                  </div>
                )}

                {/* Owner-only "Pay host now" control. Hidden from regular admins;
                    the backend also enforces super-admin, so it can't be triggered otherwise. */}
                {me?.isSuperAdmin && (
                  <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'flex', gap: '1.75rem', flexWrap: 'wrap', alignItems: 'flex-start' }}>
                    <div style={{ flex: '1 1 400px', minWidth: 0 }}>
                    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
                      Owner payout control
                    </div>
                    {payoutLoading ? (
                      <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>Calculating what's owed…</div>
                    ) : payout ? (
                      <>
                        <div style={{ fontSize: '0.9rem', color: '#111827', marginBottom: '0.5rem' }}>
                          Currently owed: <strong>{formatCurrency(payout.net)}</strong>
                          {payout.penaltyDeducted > 0 && (
                            <span style={{ color: '#6b7280' }}> (gross {formatCurrency(payout.gross)} − {formatCurrency(payout.penaltyDeducted)} held)</span>
                          )}
                        </div>
                        {/* Waive-penalty control — forgive some/all of the host's
                            cancellation penalty. Only shows when a penalty exists.
                            Blank = waive all; type an amount to waive part. */}
                        {payout.penaltyDeducted > 0 && (
                          <div style={{ margin: '0 0 0.75rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                              <span style={{ fontSize: '0.82rem', color: '#374151' }}>Give back to host&nbsp;$</span>
                              <input
                                type="number" step="0.01" min="0"
                                placeholder={`all (${(payout.penaltyDeducted || 0).toFixed(2)})`}
                                value={waiveAmount}
                                onChange={(e) => setWaiveAmount(e.target.value)}
                                style={{ width: '120px', padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                              />
                              <button className="admin-btn" onClick={handleWaivePenalty} disabled={waiving}>
                                {waiving ? 'Giving back…' : 'Give back'}
                              </button>
                            </div>
                            <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '0.3rem' }}>
                              Leave blank to release the full held amount, or enter an amount (e.g. 1.50) to release part. Releases held funds only — no money moves.
                            </div>
                          </div>
                        )}
                        {/* Withhold control — hold an amount from this host's next
                            payout. Always available. Reuses the same held balance
                            the payout already deducts; reversible with "Give back".
                            No money moves — netted at payout time. */}
                        <div style={{ margin: '0 0 0.75rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '0.82rem', color: '#374151' }}>Withhold from host&nbsp;$</span>
                            <input
                              type="number" step="0.01" min="0"
                              placeholder="e.g. 31"
                              value={withholdAmount}
                              onChange={(e) => setWithholdAmount(e.target.value)}
                              style={{ width: '120px', padding: '0.35rem 0.5rem', border: '1px solid #d1d5db', borderRadius: '6px', fontSize: '0.85rem' }}
                            />
                            <button className="admin-btn" onClick={handleWithhold} disabled={withholding}>
                              {withholding ? 'Withholding…' : 'Withhold'}
                            </button>
                          </div>
                          <div style={{ color: '#9ca3af', fontSize: '0.72rem', marginTop: '0.3rem' }}>
                            Holds this amount from their next payout. Not shown to the host. Release anytime with "Give back".
                          </div>
                        </div>
                        {payout.lineItems && payout.lineItems.length > 0 ? (
                          <div style={{ fontSize: '0.82rem', color: '#374151', marginBottom: '0.75rem' }}>
                            {payout.lineItems.map((li, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: '440px', padding: '0.15rem 0' }}>
                                <span>{li.reservationId} · {li.vehicle} <span style={{ color: '#9ca3af' }}>({li.note})</span></span>
                                <span>{formatCurrency(li.amount)}</span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div style={{ fontSize: '0.82rem', color: '#9ca3af', marginBottom: '0.75rem' }}>No eligible earnings to pay right now.</div>
                        )}
                        <button
                          className="admin-btn primary"
                          onClick={handlePayNow}
                          disabled={paying || !payout.payoutsEnabled || (payout.net || 0) <= 0}
                        >
                          {paying ? 'Sending…' : `Pay ${payout.hostName || 'host'} ${formatCurrency(payout.net)} now`}
                        </button>
                        <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                          Sends a real Stripe transfer immediately. Already-paid bookings are never paid twice. Funds must be settled to "available" in Stripe for the transfer to go through.
                        </div>
                        {payoutMsg && <div style={{ color: '#059669', fontSize: '0.85rem', marginTop: '0.4rem' }}>{payoutMsg}</div>}
                      </>
                    ) : (
                      <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>Payout preview unavailable.</div>
                    )}
                    </div>
                    <HostPortalMirror userId={user._id} />
                  </div>
                )}
              </div>
            </>
          )}

          {/* Host insurance agreement — proof the host signed the acknowledgment */}
          {(user.userType === 'host' || user.userType === 'both') && (
            <>
              <h3 style={{ color: '#374151' }}>Host insurance agreement</h3>
              <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                {user.hostAgreement?.signed ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      <ProfileRow label="Status" value={<span className="badge active-acct">signed</span>} />
                      <ProfileRow label="Signed on" value={formatDateTime(user.hostAgreement.signedAt)} />
                      <ProfileRow label="Signature" value={<span style={{ fontFamily: 'cursive', fontSize: '1.15rem', color: '#111827' }}>{user.hostAgreement.signature || '—'}</span>} />
                      <ProfileRow label="Version" value={user.hostAgreement.version || '—'} />
                      <ProfileRow label="Signed from (IP)" value={user.hostAgreement.ipAddress || '—'} />
                    </div>
                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#374151', display: 'grid', gap: '0.6rem' }}>
                      <div>{user.hostAgreement.acknowledgedPrimaryInsurance ? '✅' : '—'} <strong>Primary Insurance Requirement:</strong> I understand that I must maintain my own personal or commercial auto insurance policy at all times. RentUFS's insurance is not a replacement for my primary insurance. If I fail to maintain my required insurance, RentUFS will not provide coverage and any claim will be denied.</div>
                      <div>{user.hostAgreement.acknowledgedCoverageLimits ? '✅' : '—'} <strong>Coverage Limitations:</strong> I understand and agree that RentUFS's auto liability coverage applies only during the rental period and provides the minimum limits required by state law. No PIP, MedPay, UM, or UIM coverage is included unless required by law.</div>
                      <div>{user.hostAgreement.acknowledgedCatastrophicCap ? '✅' : '—'} <strong>Catastrophic Loss Cap:</strong> I understand that if a major event damages multiple vehicles stored at a single location, the total payout for that location is capped at $300,000. Storing vehicles at different locations can reduce this risk.</div>
                    </div>
                  </>
                ) : (
                  <div className="admin-empty">Not signed yet.</div>
                )}
              </div>
            </>
          )}

          {/* Liability-Only consent — proof the host accepted liability-only coverage.
              Shown only when this host is set to LIABILITY. */}
          {(user.userType === 'host' || user.userType === 'both') && coverageType === 'LIABILITY' && (
            <>
              <h3 style={{ color: '#374151' }}>Liability-Only consent</h3>
              <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                {user.liabilityConsent?.consented ? (
                  <>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                      <ProfileRow label="Status" value={<span className="badge active-acct">consented</span>} />
                      <ProfileRow label="Consented on" value={formatDateTime(user.liabilityConsent.consentedAt)} />
                      <ProfileRow label="Signature" value={<span style={{ fontFamily: 'cursive', fontSize: '1.15rem', color: '#111827' }}>{user.liabilityConsent.signature || '—'}</span>} />
                      <ProfileRow label="Version" value={user.liabilityConsent.version || '—'} />
                      <ProfileRow label="Signed from (IP)" value={user.liabilityConsent.ipAddress || '—'} />
                    </div>
                    <div style={{ marginTop: '1rem', fontSize: '0.85rem', color: '#374151', display: 'grid', gap: '0.6rem' }}>
                      {(user.liabilityConsent.agreedText || []).map((t, i) => (
                        <div key={i}>✅ {t}</div>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="admin-empty" style={{ color: '#92400e' }}>⏳ Pending host consent — this host is set to Liability-Only, awaiting their signed consent.</div>
                )}
              </div>
            </>
          )}

          {/* Stats */}
          {stats && (
            <>
              <h3 style={{ color: '#374151' }}>Activity</h3>
              <div className="admin-stats-grid">
                <StatTile label="Bookings as driver" value={stats.asDriver.paidBookings} sublabel="Paid only" />
                <StatTile label="Total spent" value={formatCurrency(stats.asDriver.totalSpent)} />
                <StatTile label="Bookings as host" value={stats.asHost.paidBookings} />
                <StatTile label="Host earnings" value={formatCurrency(stats.asHost.totalEarned)} sublabel={`Gross ${formatCurrency(stats.asHost.grossBookings)}`} />
                <StatTile label="Vehicles listed" value={stats.asHost.vehicleCount} />
              </div>
            </>
          )}

          {/* Bookings as driver */}
          <h3 style={{ color: '#374151', marginTop: '1.5rem' }}>Bookings as driver ({bookings.asDriver.length})</h3>
          <BookingList bookings={bookings.asDriver} otherParty="host" navigate={navigate} />

          {/* Bookings as host */}
          <h3 style={{ color: '#374151', marginTop: '1.5rem' }}>Bookings as host ({bookings.asHost.length})</h3>
          <BookingList bookings={bookings.asHost} otherParty="driver" navigate={navigate} />

          {/* Vehicles — capped height so a long list scrolls in its own box
              instead of stretching the whole page. */}
          <h3 style={{ color: '#374151', marginTop: '1.5rem' }}>Vehicles ({vehicles.length})</h3>
          <div className="admin-table-wrap" style={{ maxHeight: '300px', overflowY: 'auto' }}>
            {vehicles.length === 0 ? (
              <div className="admin-empty">No vehicles listed.</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Location</th>
                    <th>Price/day</th>
                    <th>Available</th>
                    <th>Listed</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v._id}>
                      <td><strong>{v.year} {v.make} {v.model}</strong></td>
                      <td>{v.location?.city}{v.location?.state ? `, ${v.location.state}` : ''}</td>
                      <td>{formatCurrency(v.pricePerDay)}</td>
                      <td><span className={`badge ${v.availability ? 'active-acct' : 'deactivated'}`}>{v.availability ? 'yes' : 'no'}</span></td>
                      <td>{formatDate(v.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
};

const ProfileRow = ({ label, value }) => (
  <div>
    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ color: '#111827', marginTop: '0.25rem' }}>{value}</div>
  </div>
);

// Renders a license/selfie image; click to open full-size in a new tab.
const LicenseImage = ({ label, src }) => (
  <div>
    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>{label}</div>
    {src ? (
      <a href={getImageUrl(src)} target="_blank" rel="noopener noreferrer">
        <img
          src={getImageUrl(src)}
          alt={label}
          style={{ width: '100%', maxHeight: '180px', objectFit: 'contain', borderRadius: '0.5rem', border: '1px solid #e5e7eb', background: '#f9fafb' }}
        />
      </a>
    ) : (
      <div style={{ width: '100%', height: '120px', borderRadius: '0.5rem', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.8rem' }}>
        Not uploaded
      </div>
    )}
  </div>
);

const BookingList = ({ bookings, otherParty, navigate }) => {
  if (bookings.length === 0) {
    return <div className="admin-table-wrap"><div className="admin-empty">No bookings.</div></div>;
  }
  return (
    // Capped height so a long booking list scrolls in its own box instead of
    // stretching the whole page. The header row stays pinned while you scroll.
    <div className="admin-table-wrap" style={{ maxHeight: '300px', overflowY: 'auto' }}>
      <table className="admin-table">
        <thead style={{ position: 'sticky', top: 0, zIndex: 1 }}>
          <tr>
            <th>Reservation</th>
            <th>Vehicle</th>
            <th>{otherParty === 'host' ? 'Host' : 'Driver'}</th>
            <th>Dates</th>
            <th>Total</th>
            <th>Status</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/bookings/${b._id}`)}>
              <td><strong>{b.reservationId || b._id.slice(-6)}</strong></td>
              <td>{b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : '—'}</td>
              <td>{b[otherParty] ? `${b[otherParty].firstName} ${b[otherParty].lastName}` : '—'}</td>
              <td>{formatTripDate(b.startDate)} → {formatTripDate(b.endDate)}</td>
              <td>{formatCurrency(b.totalPrice)}</td>
              <td><span className={`badge ${b.status}`}>{b.status}</span></td>
              <td><span className={`badge ${b.paymentStatus}`}>{b.paymentStatus}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminUserDetail;
