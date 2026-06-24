import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import axios from '../../config/axios';
import API_URL from '../../config/api';
import getImageUrl from '../../config/imageUrl';
import AdminLayout from './AdminLayout';

const STATUS_OPTIONS = ['awaiting_payment', 'pending', 'confirmed', 'active', 'completed', 'cancelled'];

const formatDate = (d) => (d ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');
const formatDateOnly = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
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
              <Field label="Rental subtotal" value={formatCurrency(booking.rentalSubtotal)} />
              <Field label="Platform fee" value={formatCurrency(booking.platformFee)} />
              <Field label="Insurance" value={formatCurrency(booking.insurance?.totalCost)} />
              <Field label="Processing fee" value={formatCurrency(booking.driverProcessingFee)} />
              <Field label="Host earnings" value={formatCurrency(booking.hostEarnings)} />
              <Field label="Platform revenue" value={formatCurrency(booking.platformRevenue)} />
            </div>
          </div>

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
                {(booking.teqMobility?.cardUrl || booking.teqMobility?.cardImage) ? (
                  <a
                    href={`${API_URL}/api/bookings/${booking._id}/insurance-card?token=${encodeURIComponent(localStorage.getItem('token') || '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="admin-btn primary"
                    style={{ textDecoration: 'none', display: 'inline-block' }}
                  >
                    View insurance card →
                  </a>
                ) : (
                  <div className="muted">No insurance card on file yet (status: {booking.teqMobility?.status || 'none'}).</div>
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
