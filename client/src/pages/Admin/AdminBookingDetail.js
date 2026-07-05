import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from '../../config/axios';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import AdminLayout from './AdminLayout';
import RentalAgreement from '../../components/RentalAgreement';
import { formatTime } from '../../utils/formatTime';
import { useAuth } from '../../context/AuthContext';

const STATUS_OPTIONS = ['awaiting_payment', 'pending', 'confirmed', 'active', 'completed', 'cancelled'];

const formatDate = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
// Trip dates (pickup/return) are stored as midnight UTC of the selected day, so
// format them in UTC — otherwise a browser east of UTC shows the previous day.
const formatDateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const toDateInput = (d) => (d ? new Date(d).toISOString().split('T')[0] : '');

const ActionRow = ({ action }) => {
  const desc = describeAction(action);
  return (
    <tr>
      <td style={{ whiteSpace: 'nowrap' }}>{formatDate(action.timestamp)}</td>
      <td>{action.adminEmail || '—'}</td>
      <td><span className={`badge ${action.action.includes('fail') ? 'cancelled' : 'confirmed'}`}>{action.action}</span></td>
      <td>{desc}</td>
    </tr>
  );
};

const describeAction = (a) => {
  const d = a.details || {};
  switch (a.action) {
    case 'status_changed':
      return `${d.from} → ${d.to}${d.note ? ` (${d.note})` : ''}`;
    case 'dates_changed':
      return `${formatDateOnly(d.previousStart)}–${formatDateOnly(d.previousEnd)} → ${formatDateOnly(d.newStart)}–${formatDateOnly(d.newEnd)} (${d.newTotalDays} day${d.newTotalDays !== 1 ? 's' : ''})${d.note ? ` — ${d.note}` : ''}`;
    case 'extended':
      return `+${d.extensionDays} day${d.extensionDays !== 1 ? 's' : ''} → ${formatDateOnly(d.newEndDate)}${d.charged ? ` · charged ${formatCurrency(d.amount)}` : ' · no charge'}${d.reason ? ` (${d.reason})` : ''}`;
    case 'charged':
      return `${formatCurrency(d.amount)} — ${d.description || 'manual charge'}`;
    case 'charge_failed':
      return `${formatCurrency(d.amount || d.attemptedAmount)} — ${d.error || d.status || 'failed'}`;
    case 'refunded':
      return `${d.amount ? formatCurrency(d.amount) : 'full refund'}${d.reason ? ` — ${d.reason}` : ''}`;
    default:
      return JSON.stringify(d);
  }
};

const AdminBookingDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user: me } = useAuth();
  const [booking, setBooking] = useState(null);
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(true);
  const [extendOpen, setExtendOpen] = useState(false);
  const [chargeOpen, setChargeOpen] = useState(false);
  const [datesOpen, setDatesOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [agreementOpen, setAgreementOpen] = useState(false);
  const [cardUploading, setCardUploading] = useState(false);
  const [coverageIdInput, setCoverageIdInput] = useState('');
  const [savingCoverageId, setSavingCoverageId] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(`/api/admin/bookings/${id}`);
      setBooking(data);
      // Chat history is non-critical — don't fail the page if it errors
      try {
        const msgRes = await axios.get(`/api/admin/bookings/${id}/messages`);
        setMessages(msgRes.data.messages || []);
      } catch (_) {
        setMessages([]);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load booking');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const flash = (msg) => {
    setInfo(msg);
    setTimeout(() => setInfo(''), 4000);
  };

  // Manual rescue: upload an insurance card PDF/image. Stored permanently on
  // Cloudinary, then shows in admin, host and driver views.
  const handleCardUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset so the same file can be re-selected later
    if (!file) return;
    setError('');
    setCardUploading(true);
    try {
      const formData = new FormData();
      formData.append('card', file);
      // Override the instance's default JSON content-type; axios 1.x fills in the
      // multipart boundary automatically when given a FormData body.
      await axios.post(`/api/bookings/${booking._id}/insurance-card/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      flash('Insurance card uploaded successfully.');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload insurance card');
    } finally {
      setCardUploading(false);
    }
  };

  // Owner-only: record the real TeqMobility Coverage ID so this booking reconciles
  // in the insurance billing tab. Writes only this one reference field.
  const handleSaveCoverageId = async () => {
    const coverageId = coverageIdInput.trim();
    if (!coverageId) return;
    setError('');
    setSavingCoverageId(true);
    try {
      await axios.patch(`/api/admin/bookings/${id}/coverage-id`, { coverageId });
      flash('Coverage ID saved — this booking will now reconcile in Insurance Billing.');
      setCoverageIdInput('');
      await load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to save Coverage ID');
    } finally {
      setSavingCoverageId(false);
    }
  };

  return (
    <AdminLayout title={booking ? `Booking ${booking.reservationId || booking._id.slice(-6)}` : 'Booking'} subtitle={booking ? `Created ${formatDate(booking.createdAt)}` : ''}>
      {error && <div className="admin-error">{error}</div>}
      {info && <div className="admin-error" style={{ background: '#d1fae5', color: '#065f46' }}>{info}</div>}
      {loading && <div className="admin-empty">Loading...</div>}

      {booking && (
        <>
          <button className="admin-btn" onClick={() => navigate('/admin/bookings')} style={{ marginBottom: '1rem' }}>← Back to bookings</button>

          {/* Header tile */}
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827' }}>
                  {booking.vehicle ? `${booking.vehicle.year} ${booking.vehicle.make} ${booking.vehicle.model}` : '—'}
                </div>
                <div style={{ color: '#6b7280', marginTop: '0.25rem' }}>
                  {formatDateOnly(booking.startDate)} → {formatDateOnly(booking.endDate)} · {booking.totalDays} day{booking.totalDays !== 1 ? 's' : ''}
                </div>
                <div style={{ color: '#6b7280', marginTop: '0.15rem', fontSize: '0.9rem' }}>
                  Pick-up {formatTime(booking.pickupTime)} · Drop-off {formatTime(booking.dropoffTime || booking.pickupTime)}
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#111827' }}>{formatCurrency(booking.totalPrice)}</div>
                <div style={{ marginTop: '0.5rem' }}>
                  <span className={`badge ${booking.status}`}>{booking.status}</span>{' '}
                  <span className={`badge ${booking.paymentStatus}`}>{booking.paymentStatus}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Parties */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <PartyCard label="Driver" person={booking.driver} navigate={navigate} />
            <PartyCard label="Host" person={booking.host} navigate={navigate} />
            {/* Cancellation card — read-only, sits beside the Driver/Host cards.
                Red outline so it stands out as an alert. Shows WHO cancelled
                (host/driver/admin), when, the fee charged, the reason, and — for
                host cancellations — the host's total outstanding penalty balance
                (deducted from their future payouts). All values already live on
                the booking/host record; this only displays them. */}
            {booking.status === 'cancelled' && (
              <div className="admin-table-wrap" style={{ padding: '1.25rem', border: '2px solid #dc2626', background: '#fef2f2' }}>
                <div style={{ color: '#dc2626', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.75rem', fontWeight: 700 }}>Cancellation</div>
                <div style={{ display: 'grid', gap: '0.65rem' }}>
                  <Field label="Cancelled by" value={booking.cancelledBy ? booking.cancelledBy.charAt(0).toUpperCase() + booking.cancelledBy.slice(1) : 'Unknown'} />
                  <Field label="When" value={formatDate(booking.cancelledAt)} />
                  <Field label="Fee charged" value={formatCurrency(booking.cancellationFee)} />
                  <Field label="Reason" value={booking.cancellationReason || '—'} />
                  {booking.cancelledBy === 'host' && (
                    <>
                      <Field label="Penalty (this cancellation)" value={formatCurrency(1.50 * (booking.totalDays || 1))} />
                      <Field label="Host's total penalty owed" value={formatCurrency(booking.host?.cancellationPenaltyBalance)} />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <h3 style={{ color: '#374151' }}>Admin actions</h3>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem' }}>
            <button className="admin-btn primary" onClick={() => setExtendOpen(true)}>Extend booking</button>
            <button className="admin-btn" onClick={() => setDatesOpen(true)}>Edit dates</button>
            <button className="admin-btn" onClick={() => setStatusOpen(true)}>Change status</button>
            <button className="admin-btn" onClick={() => setChargeOpen(true)}>Manual charge</button>
            {booking.paymentStatus === 'paid' && (
              <button className="admin-btn danger" onClick={() => setRefundOpen(true)}>Issue refund</button>
            )}
          </div>

          {/* Pricing breakdown */}
          <h3 style={{ color: '#374151' }}>Pricing</h3>
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
              <Field label="Price/day" value={formatCurrency(booking.pricePerDay)} />
              {/* Show the FULL rental including any extensions (original subtotal +
                  each extension's rental), so an extended trip's rental visibly ties
                  out to host earnings. Display-only — stored values are unchanged. */}
              <Field label="Rental subtotal" value={formatCurrency((booking.rentalSubtotal || 0) + (booking.extensions || []).reduce((sum, ext) => sum + (ext.rental || 0), 0))} />
              <Field label="Platform fee (driver)" value={formatCurrency(booking.platformFee)} />
              <Field label="Platform fee (host)" value={formatCurrency(booking.hostPlatformFee)} />
              <Field label="Insurance" value={formatCurrency(booking.insurance?.totalCost)} />
              <Field label="Processing fee" value={formatCurrency(booking.driverProcessingFee)} />
              {/* For a cancelled/refunded booking these show the ACTUAL outcome
                  (host earned nothing, platform kept only the fee) instead of the
                  projected trip amounts. Display-only — the stored values and all
                  reports are unchanged. */}
              <Field label="Host earnings" value={formatCurrency((booking.paymentStatus === 'refunded' || booking.paymentStatus === 'partial_refund') ? 0 : booking.hostEarnings)} />
              <Field label="Platform revenue" value={formatCurrency((booking.paymentStatus === 'refunded' || booking.paymentStatus === 'partial_refund') ? (booking.cancellationFee || 0) : booking.platformRevenue)} />
            </div>

            {/* Spell out how platform revenue is composed, so both $1.50/day fees
                (driver + host) and the insurance are visible at a glance. Shown for
                normal paid/active bookings (not refunded ones, which display the
                cancellation outcome above). Display-only — derived from stored values. */}
            {!(booking.paymentStatus === 'refunded' || booking.paymentStatus === 'partial_refund') && (
              <div style={{ marginTop: '0.75rem', fontSize: '0.8rem', color: '#6b7280' }}>
                Platform revenue = Platform fee (driver) {formatCurrency(booking.platformFee)} + Platform fee (host) {formatCurrency(booking.hostPlatformFee)} + Insurance {formatCurrency(booking.insurance?.totalCost)}
              </div>
            )}

            {/* Refund line — shown only for cancelled/refunded bookings: the amount
                sent back to the driver. Read-only, derived from booking values. */}
            {(booking.paymentStatus === 'refunded' || booking.paymentStatus === 'partial_refund') && (
              <div style={{ marginTop: '1rem', paddingTop: '1rem', borderTop: '1px solid #e5e7eb', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '0.75rem' }}>
                <Field label="Refunded to driver" value={`-${formatCurrency(Math.max(0, (booking.totalPrice || 0) - (booking.cancellationFee || 0)))}`} />
              </div>
            )}
          </div>

          {/* Rental agreement — the renter's signed trip contract (proof).
              Read-only: the agreement data is already saved on the booking.
              The "View" button expands the full living contract (same read-only
              document the host sees) — admins can review every term, always current. */}
          <h3 style={{ color: '#374151' }}>Rental agreement</h3>
          <div className="admin-table-wrap" style={{ marginBottom: agreementOpen ? '0.75rem' : '1.5rem', padding: '1.25rem', position: 'relative' }}>
            <button
              className="admin-btn"
              onClick={() => setAgreementOpen((o) => !o)}
              style={{ position: 'absolute', top: '1rem', right: '1rem' }}
            >
              {agreementOpen ? 'Hide' : 'View'}
            </button>
            {booking.agreement?.signed ? (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem' }}>
                  <Field label="Status" value={<span className="badge active-acct">signed</span>} />
                  <Field label="Signed by" value={booking.agreement.driverSignature || (booking.driver ? `${booking.driver.firstName} ${booking.driver.lastName}` : '—')} />
                  <Field label="Signed on" value={formatDate(booking.agreement.signedAt)} />
                </div>
                {booking.agreement.driverAddressAtSigning && (booking.agreement.driverAddressAtSigning.street || booking.agreement.driverAddressAtSigning.city) && (
                  <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#374151' }}>
                    <span style={{ color: '#6b7280' }}>Address at signing: </span>
                    {[booking.agreement.driverAddressAtSigning.street, booking.agreement.driverAddressAtSigning.apt, booking.agreement.driverAddressAtSigning.city, booking.agreement.driverAddressAtSigning.state, booking.agreement.driverAddressAtSigning.zipCode].filter(Boolean).join(', ')}
                  </div>
                )}
                {booking.agreement.signatureImage && (
                  <div style={{ marginTop: '1rem' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>Signature</div>
                    <img src={booking.agreement.signatureImage} alt="Renter signature" style={{ maxWidth: '320px', maxHeight: '120px', background: '#fff', border: '1px solid #e5e7eb', borderRadius: '6px', padding: '4px' }} />
                  </div>
                )}
              </>
            ) : (
              <div className="admin-empty">Not signed yet.</div>
            )}
          </div>

          {/* Full living contract — same read-only document the renter and host
              see, rendered live from the booking. Only loads when expanded. */}
          {agreementOpen && (
            <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem', background: '#fff' }}>
              <RentalAgreement bookingId={booking._id} readOnly={true} />
            </div>
          )}

          {/* Inspection photos */}
          <h3 style={{ color: '#374151' }}>Inspection photos</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
            <InspectionPhotos label="Pickup inspection" inspection={booking.pickupInspection} />
            <InspectionPhotos label="Return inspection" inspection={booking.returnInspection} />
          </div>

          {/* Insurance card */}
          {booking.insurance?.type && booking.insurance.type !== 'none' && (
            <>
              <h3 style={{ color: '#374151' }}>Insurance card</h3>
              <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
                {/* Always show the button for insured bookings — clicking it pulls
                    the card LIVE from TeqMobility (works via the coverage ID or the
                    VIN), so admin can always retrieve it on demand. The status line
                    below uses an explicit color so it's readable on the light admin
                    background (the old "muted" text was white-on-white/invisible).
                    Display-only — no insurance/TeqMobility logic touched. */}
                <a
                  href={`${API_URL}/api/bookings/${booking._id}/insurance-card?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="admin-btn primary"
                  style={{ textDecoration: 'none', display: 'inline-block' }}
                >
                  View insurance card →
                </a>
                <div style={{ marginTop: '0.6rem', fontSize: '0.85rem', color: '#6b7280' }}>
                  Coverage status: {booking.teqMobility?.status || (booking.teqMobility?.coverageId ? 'active' : 'pending')}
                  {booking.teqMobility?.cardCloudinaryUrl
                    ? ' — card saved permanently.'
                    : ' — pulls the card live from TeqMobility when opened.'}
                </div>

                {/* Manual rescue: upload the card PDF (e.g. downloaded from TeqMobility)
                    if the automatic copy was ever lost. Stored permanently. */}
                <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid #e5e7eb' }}>
                  <label
                    htmlFor="card-upload-input"
                    style={{
                      display: 'inline-block', cursor: cardUploading ? 'default' : 'pointer',
                      fontSize: '0.85rem', color: '#0ea5e9', fontWeight: 600,
                      opacity: cardUploading ? 0.6 : 1
                    }}
                  >
                    {cardUploading ? 'Uploading…' : '⬆ Upload insurance card (PDF or image)'}
                  </label>
                  <input
                    id="card-upload-input"
                    type="file"
                    accept="application/pdf,image/png,image/jpeg"
                    onChange={handleCardUpload}
                    disabled={cardUploading}
                    style={{ display: 'none' }}
                  />
                  <div style={{ marginTop: '0.35rem', fontSize: '0.78rem', color: '#9ca3af' }}>
                    Use this to attach a card manually if the automatic one isn't showing.
                  </div>
                </div>

                {/* Owner-only: record the real TeqMobility Coverage ID so this booking
                    reconciles in Insurance Billing. Writes only the reference number —
                    does not call TeqMobility or change the policy. */}
                {me?.isSuperAdmin && (
                  <div style={{ marginTop: '0.9rem', paddingTop: '0.9rem', borderTop: '1px solid #e5e7eb' }}>
                    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.4rem' }}>
                      TeqMobility Coverage ID (owner only)
                    </div>
                    <div style={{ fontSize: '0.82rem', color: '#374151', marginBottom: '0.4rem' }}>
                      Current: {booking.teqMobility?.coverageId
                        ? <strong>{booking.teqMobility.coverageId}</strong>
                        : <span style={{ color: '#9ca3af' }}>not recorded</span>}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        value={coverageIdInput}
                        onChange={(e) => setCoverageIdInput(e.target.value)}
                        placeholder="Paste Coverage ID from TeqMobility"
                        style={{ width: '260px', padding: '0.4rem 0.6rem', border: '1px solid #d1d5db', borderRadius: '0.375rem' }}
                      />
                      <button
                        className="admin-btn"
                        onClick={handleSaveCoverageId}
                        disabled={savingCoverageId || !coverageIdInput.trim()}
                      >
                        {savingCoverageId ? 'Saving…' : 'Save Coverage ID'}
                      </button>
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.75rem', marginTop: '0.4rem' }}>
                      Records the real ID from TeqMobility so this booking reconciles in Insurance Billing. Does not change the policy.
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {/* Chat history */}
          <h3 style={{ color: '#374151' }}>Chat history ({messages.length})</h3>
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
            {messages.length === 0 ? (
              <div className="admin-empty">No messages for this reservation.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', maxHeight: '420px', overflowY: 'auto' }}>
                {messages.map((m) => (
                  <div key={m._id} style={{ borderLeft: `3px solid ${m.senderRole === 'host' ? '#10b981' : '#3b82f6'}`, paddingLeft: '0.75rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                      <strong style={{ color: '#374151' }}>
                        {m.sender ? `${m.sender.firstName} ${m.sender.lastName}` : 'Unknown'}
                      </strong>{' '}
                      <span style={{ textTransform: 'uppercase', fontSize: '0.65rem' }}>({m.senderRole})</span>
                      {' · '}{formatDate(m.createdAt)}
                    </div>
                    <div style={{ color: '#111827', marginTop: '0.15rem' }}>{m.text}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Extensions */}
          {booking.extensions && booking.extensions.length > 0 && (
            <>
              <h3 style={{ color: '#374151' }}>Extensions ({booking.extensions.length})</h3>
              <div className="admin-table-wrap" style={{ marginBottom: '1.5rem' }}>
                <table className="admin-table">
                  <thead>
                    <tr><th>Date</th><th>Days</th><th>Cost</th><th>New end</th><th>Payment</th></tr>
                  </thead>
                  <tbody>
                    {booking.extensions.map((e, i) => (
                      <tr key={i}>
                        <td>{formatDate(e.extendedAt)}</td>
                        <td>+{e.days}</td>
                        <td>{formatCurrency(e.cost)}</td>
                        <td>{formatDateOnly(e.newEndDate)}</td>
                        <td className="muted">{e.paymentId || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Activity log */}
          <h3 style={{ color: '#374151' }}>Admin activity log ({(booking.adminActions || []).length})</h3>
          <div className="admin-table-wrap">
            {(!booking.adminActions || booking.adminActions.length === 0) ? (
              <div className="admin-empty">No admin actions recorded yet.</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr><th>When</th><th>Admin</th><th>Action</th><th>Details</th></tr>
                </thead>
                <tbody>
                  {[...booking.adminActions].reverse().map((a, i) => <ActionRow key={i} action={a} />)}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {extendOpen && (
        <ExtendModal booking={booking} onClose={() => setExtendOpen(false)} onSaved={(msg) => { setExtendOpen(false); flash(msg); load(); }} onError={setError} />
      )}
      {chargeOpen && (
        <ChargeModal booking={booking} onClose={() => setChargeOpen(false)} onSaved={(msg) => { setChargeOpen(false); flash(msg); load(); }} onError={setError} />
      )}
      {datesOpen && (
        <DatesModal booking={booking} onClose={() => setDatesOpen(false)} onSaved={(msg) => { setDatesOpen(false); flash(msg); load(); }} onError={setError} />
      )}
      {statusOpen && (
        <StatusModal booking={booking} onClose={() => setStatusOpen(false)} onSaved={(msg) => { setStatusOpen(false); flash(msg); load(); }} onError={setError} />
      )}
      {refundOpen && (
        <RefundModal booking={booking} onClose={() => setRefundOpen(false)} onSaved={(msg) => { setRefundOpen(false); flash(msg); load(); }} onError={setError} />
      )}
    </AdminLayout>
  );
};

const Field = ({ label, value }) => (
  <div>
    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ color: '#111827', marginTop: '0.25rem', fontWeight: 500 }}>{value}</div>
  </div>
);

// Renders the 4 inspection photos (front/back/left/right) for a pickup or
// return inspection. Click any photo to view it full-size in a new tab.
const InspectionPhotos = ({ label, inspection }) => {
  const photos = inspection?.photos || {};
  const views = [
    { key: 'frontView', label: 'Front' },
    { key: 'backView', label: 'Back' },
    { key: 'leftSide', label: 'Left side' },
    { key: 'rightSide', label: 'Right side' }
  ];
  const hasAny = views.some(v => photos[v.key]);

  return (
    <div className="admin-table-wrap" style={{ padding: '1.25rem' }}>
      <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>
        {label}
      </div>
      {inspection?.completed ? (
        <div style={{ color: '#059669', fontSize: '0.8rem', marginBottom: '0.75rem' }}>
          Completed {formatDate(inspection.completedAt)}
        </div>
      ) : (
        <div style={{ color: '#9ca3af', fontSize: '0.8rem', marginBottom: '0.75rem' }}>Not completed</div>
      )}
      {hasAny ? (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          {views.map(v => (
            <div key={v.key}>
              <div style={{ color: '#6b7280', fontSize: '0.7rem', marginBottom: '0.25rem' }}>{v.label}</div>
              {photos[v.key] ? (
                <a href={getImageUrl(photos[v.key])} target="_blank" rel="noopener noreferrer">
                  <img
                    src={getImageUrl(photos[v.key])}
                    alt={`${label} ${v.label}`}
                    style={{ width: '100%', height: '110px', objectFit: 'cover', borderRadius: '0.375rem', border: '1px solid #e5e7eb' }}
                  />
                </a>
              ) : (
                <div style={{ width: '100%', height: '110px', borderRadius: '0.375rem', background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '0.75rem' }}>
                  No photo
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="muted">No photos uploaded.</div>
      )}
      {inspection?.notes && (
        <div style={{ marginTop: '0.75rem', fontSize: '0.85rem', color: '#374151' }}>
          <strong>Notes:</strong> {inspection.notes}
        </div>
      )}
    </div>
  );
};

const PartyCard = ({ label, person, navigate }) => (
  <div className="admin-table-wrap" style={{ padding: '1.25rem' }}>
    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>{label}</div>
    {person ? (
      <>
        <div style={{ fontWeight: 600, fontSize: '1.05rem', color: '#111827' }}>
          {person.firstName} {person.lastName}
        </div>
        <div style={{ color: '#6b7280', fontSize: '0.875rem', marginTop: '0.25rem' }}>{person.email}</div>
        <div style={{ color: '#6b7280', fontSize: '0.875rem' }}>{person.phone || '—'}</div>
        <button className="admin-btn" style={{ marginTop: '0.75rem' }} onClick={() => navigate(`/admin/users/${person._id}`)}>View profile →</button>
      </>
    ) : <div className="muted">—</div>}
  </div>
);

const ExtendModal = ({ booking, onClose, onSaved, onError }) => {
  const [days, setDays] = useState(1);
  const [charge, setCharge] = useState(true);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const estimatedCost = (days || 0) * (booking.pricePerDay || 0);

  const submit = async () => {
    setBusy(true);
    setLocalError('');
    try {
      const { data } = await axios.post(`/api/admin/bookings/${booking._id}/extend`, {
        extensionDays: Number(days),
        charge,
        reason: reason || undefined
      });
      onSaved(data.charged ? `Extended by ${days} day(s) and charged ${data.amount.toFixed(2)}.` : `Extended by ${days} day(s) — no charge.`);
    } catch (err) {
      const msg = err.response?.data?.error || err.response?.data?.message || 'Extension failed';
      setLocalError(msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Extend booking</h2>
        <p className="muted" style={{ fontSize: '0.85rem', color: '#6b7280' }}>{booking.reservationId || booking._id}</p>
        {localError && <div className="admin-error">{localError}</div>}
        <div className="field">
          <label>Extension days</label>
          <input type="number" min="1" max="60" value={days} onChange={(e) => setDays(e.target.value)} />
        </div>
        <div className="field">
          <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
            <input type="checkbox" checked={charge} onChange={(e) => setCharge(e.target.checked)} />
            <span>Auto-charge driver via Stripe (~{formatCurrency(estimatedCost)} estimate, final amount includes fees)</span>
          </label>
          {!charge && (
            <div style={{ background: '#fef3c7', color: '#92400e', padding: '0.6rem', borderRadius: 6, marginTop: '0.5rem', fontSize: '0.85rem' }}>
              No charge will be made. Use for goodwill credit, manual reconciliation, or typo fixes.
            </div>
          )}
        </div>
        <div className="field">
          <label>Reason / note (optional)</label>
          <textarea rows="2" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. driver returning car 2 days late, charging for late return" />
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Processing...' : (charge ? 'Extend & charge' : 'Extend (no charge)')}</button>
        </div>
      </div>
    </div>
  );
};

const ChargeModal = ({ booking, onClose, onSaved }) => {
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    setBusy(true);
    setLocalError('');
    try {
      await axios.post(`/api/admin/bookings/${booking._id}/charge`, {
        amount: Number(amount),
        description: description || 'Manual admin charge'
      });
      onSaved(`Charged ${formatCurrency(Number(amount))}.`);
    } catch (err) {
      setLocalError(err.response?.data?.message || 'Charge failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Manual charge</h2>
        <p className="muted" style={{ fontSize: '0.85rem', color: '#6b7280' }}>Charges the driver's saved payment method.</p>
        {localError && <div className="admin-error">{localError}</div>}
        <div className="field">
          <label>Amount (USD)</label>
          <input type="number" min="0.50" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <div className="field">
          <label>Description</label>
          <input type="text" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Late return fee, cleaning fee, damage" />
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Charging...' : 'Charge'}</button>
        </div>
      </div>
    </div>
  );
};

const DatesModal = ({ booking, onClose, onSaved }) => {
  const [startDate, setStartDate] = useState(toDateInput(booking.startDate));
  const [endDate, setEndDate] = useState(toDateInput(booking.endDate));
  const [pickupTime, setPickupTime] = useState(booking.pickupTime || '10:00');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    setBusy(true);
    setLocalError('');
    try {
      await axios.patch(`/api/admin/bookings/${booking._id}/dates`, { startDate, endDate, pickupTime, note: note || undefined });
      onSaved('Dates updated.');
    } catch (err) {
      setLocalError(err.response?.data?.message || 'Failed to update dates');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit booking dates</h2>
        <p className="muted" style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          Changes the start/end dates &amp; time without charging. Use Extend if you want to charge for added days. The driver is emailed the update.
        </p>
        {localError && <div className="admin-error">{localError}</div>}
        <div className="field">
          <label>Start date</label>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="field">
          <label>End date</label>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
        <div className="field">
          <label>Pickup time</label>
          <input type="time" value={pickupTime} onChange={(e) => setPickupTime(e.target.value)} />
          <p className="muted" style={{ fontSize: '0.78rem', color: '#9ca3af', marginTop: '0.25rem' }}>
            Return time matches pickup time (24-hour rentals).
          </p>
        </div>
        <div className="field">
          <label>Note (optional)</label>
          <textarea rows="2" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving...' : 'Save dates'}</button>
        </div>
      </div>
    </div>
  );
};

const StatusModal = ({ booking, onClose, onSaved }) => {
  const [status, setStatus] = useState(booking.status);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    setBusy(true);
    setLocalError('');
    try {
      await axios.patch(`/api/admin/bookings/${booking._id}/status`, { status, note: note || undefined });
      onSaved(`Status updated to ${status}.`);
    } catch (err) {
      setLocalError(err.response?.data?.message || 'Failed to update status');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Change status</h2>
        {localError && <div className="admin-error">{localError}</div>}
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {status === 'cancelled' && (
          <div className="field">
            <label>Cancellation note (optional)</label>
            <textarea rows="2" value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
        )}
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

const RefundModal = ({ booking, onClose, onSaved }) => {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [localError, setLocalError] = useState('');

  const submit = async () => {
    setBusy(true);
    setLocalError('');
    try {
      const body = {};
      if (amount && Number(amount) > 0) body.amount = Number(amount);
      await axios.post(`/api/admin/bookings/${booking._id}/refund`, body);
      onSaved(amount ? `Refunded ${formatCurrency(Number(amount))}.` : 'Full refund issued.');
    } catch (err) {
      setLocalError(err.response?.data?.message || 'Refund failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Issue refund</h2>
        <p className="muted" style={{ fontSize: '0.85rem', color: '#6b7280' }}>Total {formatCurrency(booking.totalPrice)}</p>
        {localError && <div className="admin-error">{localError}</div>}
        <div className="field">
          <label>Amount (leave blank for full refund)</label>
          <input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={`Full: ${booking.totalPrice}`} />
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn danger" onClick={submit} disabled={busy}>{busy ? 'Processing...' : 'Issue refund'}</button>
        </div>
      </div>
    </div>
  );
};

export default AdminBookingDetail;
