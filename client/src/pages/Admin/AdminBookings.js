import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';

const STATUS_OPTIONS = ['awaiting_payment', 'pending', 'confirmed', 'active', 'completed', 'cancelled'];
const PAYMENT_OPTIONS = ['pending', 'paid', 'refunded', 'partial_refund', 'failed', 'expired'];

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
// Trip dates are stored as midnight UTC of the selected day — format in UTC so a
// browser east of UTC doesn't show the previous day.
const formatTripDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const AdminBookings = () => {
  const [bookings, setBookings] = useState([]);
  const [total, setTotal] = useState(0);
  // Filters/page are seeded from the URL and kept in sync, so opening a booking
  // and pressing Back returns you to the same filtered/scrolled list instead of
  // resetting to "All statuses". (e.g. /admin/bookings?status=active&page=2)
  const [searchParams, setSearchParams] = useSearchParams();
  const initialStatus = STATUS_OPTIONS.includes(searchParams.get('status')) ? searchParams.get('status') : '';
  const initialPayment = PAYMENT_OPTIONS.includes(searchParams.get('payment')) ? searchParams.get('payment') : '';
  const [page, setPage] = useState(Math.max(1, parseInt(searchParams.get('page'), 10) || 1));
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [status, setStatus] = useState(initialStatus);
  const [paymentStatus, setPaymentStatus] = useState(initialPayment);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editBooking, setEditBooking] = useState(null);
  const [refundBooking, setRefundBooking] = useState(null);
  const navigate = useNavigate();
  const limit = 25;
  // Only restore the saved scroll position once per visit to this list.
  const scrollRestored = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/admin/bookings', {
        params: { search, status, paymentStatus, page, limit }
      });
      setBookings(data.bookings);
      setTotal(data.total);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load bookings');
    } finally {
      setLoading(false);
    }
  }, [search, status, paymentStatus, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the web address in step with the current filters/page (quietly, with
  // `replace`). When you press Back from a booking, the browser returns to this
  // same address and the filters come right back.
  useEffect(() => {
    const params = {};
    if (search) params.search = search;
    if (status) params.status = status;
    if (paymentStatus) params.payment = paymentStatus;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [search, status, paymentStatus, page, setSearchParams]);

  // After the list finishes loading, scroll back to roughly where you were when
  // you opened a booking. Runs once per visit, then forgets.
  useEffect(() => {
    if (loading || scrollRestored.current || bookings.length === 0) return;
    const saved = sessionStorage.getItem('adminBookingsScroll');
    if (saved != null) {
      scrollRestored.current = true;
      const y = parseInt(saved, 10) || 0;
      sessionStorage.removeItem('adminBookingsScroll');
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [loading, bookings.length]);

  // Remember how far down the list you'd scrolled, then open the booking.
  const openBooking = (bookingId) => {
    sessionStorage.setItem('adminBookingsScroll', String(window.scrollY));
    navigate(`/admin/bookings/${bookingId}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  return (
    <AdminLayout title="Bookings" subtitle="All reservations across the platform" onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search by reservation ID, driver, or host..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select value={status} onChange={(e) => { setPage(1); setStatus(e.target.value); }}>
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select value={paymentStatus} onChange={(e) => { setPage(1); setPaymentStatus(e.target.value); }}>
          <option value="">All payments</option>
          {PAYMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reservation</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>Host</th>
              <th>Dates</th>
              <th>Total</th>
              <th>Status</th>
              <th>Payment</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {bookings.length === 0 && !loading && (
              <tr><td colSpan="9"><div className="admin-empty">No bookings found.</div></td></tr>
            )}
            {bookings.map((b) => (
              <tr key={b._id} style={{ cursor: 'pointer' }} onClick={(e) => {
                if (e.target.closest('button')) return;
                openBooking(b._id);
              }}>
                <td>
                  <strong>{b.reservationId || b._id.slice(-6)}</strong>
                  <div className="muted">{formatDate(b.createdAt)}</div>
                </td>
                <td>
                  {b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : '—'}
                </td>
                <td>
                  {b.driver ? `${b.driver.firstName} ${b.driver.lastName}` : '—'}
                  <div className="muted">{b.driver?.email}</div>
                </td>
                <td>
                  {b.host ? `${b.host.firstName} ${b.host.lastName}` : '—'}
                  <div className="muted">{b.host?.email}</div>
                </td>
                <td>
                  {formatTripDate(b.startDate)} → {formatTripDate(b.endDate)}
                  <div className="muted">{b.totalDays} day{b.totalDays !== 1 ? 's' : ''}</div>
                </td>
                <td>{formatCurrency(b.totalPrice)}</td>
                <td><span className={`badge ${b.status}`}>{b.status}</span></td>
                <td><span className={`badge ${b.paymentStatus}`}>{b.paymentStatus}</span></td>
                <td>
                  <button className="admin-btn" onClick={() => setEditBooking(b)}>Edit</button>
                  {b.paymentStatus === 'paid' && (
                    <button className="admin-btn danger" onClick={() => setRefundBooking(b)}>Refund</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="admin-pagination">
          <span>Showing {(page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}</span>
          <div>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            {' '}
            <span style={{ margin: '0 0.5rem' }}>Page {page} of {totalPages}</span>
            {' '}
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
      </div>

      {editBooking && (
        <EditBookingModal booking={editBooking} onClose={() => setEditBooking(null)} onSaved={() => { setEditBooking(null); load(); }} />
      )}
      {refundBooking && (
        <RefundBookingModal booking={refundBooking} onClose={() => setRefundBooking(null)} onSaved={() => { setRefundBooking(null); load(); }} />
      )}
    </AdminLayout>
  );
};

const EditBookingModal = ({ booking, onClose, onSaved }) => {
  const [status, setStatus] = useState(booking.status);
  const [paymentStatus, setPaymentStatus] = useState(booking.paymentStatus || 'pending');
  // Pre-fill with the saved note so it persists (no longer disappears).
  const [note, setNote] = useState(booking.adminNote || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await axios.patch(`/api/admin/bookings/${booking._id}/status`, { status, paymentStatus, note });
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit booking</h2>
        <p className="muted" style={{ fontSize: '0.85rem', color: '#6b7280' }}>{booking.reservationId || booking._id}</p>
        {error && <div className="admin-error">{error}</div>}
        <div className="field">
          <label>Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Payment Status</label>
          <select value={paymentStatus} onChange={(e) => setPaymentStatus(e.target.value)}>
            {PAYMENT_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <small style={{ color: '#6b7280' }}>
            Record only — does not charge or refund. Use to reflect a refund already done in Stripe.
          </small>
        </div>
        <div className="field">
          <label>Note</label>
          <textarea rows="2" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g., Refunded via Stripe — 6/22, insurance not ready" />
          <small style={{ color: '#6b7280' }}>Saved on the booking — stays visible until you change it.</small>
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

const RefundBookingModal = ({ booking, onClose, onSaved }) => {
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      const body = {};
      if (amount && Number(amount) > 0) body.amount = Number(amount);
      await axios.post(`/api/admin/bookings/${booking._id}/refund`, body);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Refund failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Issue refund</h2>
        <p className="muted" style={{ fontSize: '0.85rem', color: '#6b7280' }}>
          {booking.reservationId || booking._id} — Total {formatCurrency(booking.totalPrice)}
        </p>
        {error && <div className="admin-error">{error}</div>}
        <div className="field">
          <label>Amount (USD) — leave blank for full refund</label>
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

export default AdminBookings;
