import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import LateFeeToggle from './LateFeeToggle';
import { useAuth } from '../../context/AuthContext';

// Format the exact return moment in Eastern time (matches the charging engine).
const fmtDue = (d) => (d
  ? new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })
  : '—');

// Human-friendly "how late" from whole hours.
const fmtLate = (hoursLate) => {
  const h = Math.max(0, Math.floor(hoursLate || 0));
  const d = Math.floor(h / 24);
  const rem = h % 24;
  if (d >= 1) return `${d}d ${rem}h`;
  return `${h}h`;
};

// Owner-only command center: every currently-overdue rental across the platform,
// plus the master ON/OFF switch. Read-only list — no money moves from this page.
const AdminLateReturns = () => {
  const { user: me } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // The auto-charge ON/OFF switch is owner-only; staff admins see the overdue
  // list (and charged amounts) so they can chase renters, but can't flip charging.
  const isOwner = !!me?.isSuperAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/admin/late-returns');
      setRows(data.rows || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load late returns');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me) load();
  }, [load, me]);

  // ── Monthly late-return tally (OWNER-ONLY) ──
  // Read-only report: completed reservations returned past their paid return time
  // this month, tallied per host. Powered by GET /api/admin/late-return-tally.
  const monthOptions = useMemo(() => {
    const opts = [];
    const d = new Date();
    for (let i = 0; i < 12; i++) {
      const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleString('en-US', { month: 'long', year: 'numeric' });
      opts.push({ value, label });
      d.setMonth(d.getMonth() - 1);
    }
    return opts;
  }, []);

  const [tally, setTally] = useState(null);
  const [tallyMonth, setTallyMonth] = useState(monthOptions[0].value);
  const [tallyLoading, setTallyLoading] = useState(false);
  const [tallyError, setTallyError] = useState('');

  const loadTally = useCallback(async () => {
    setTallyLoading(true);
    setTallyError('');
    try {
      const { data } = await axios.get(`/api/admin/late-return-tally?month=${tallyMonth}`);
      setTally(data);
    } catch (err) {
      setTallyError(err.response?.data?.message || 'Failed to load late-return tally');
    } finally {
      setTallyLoading(false);
    }
  }, [tallyMonth]);

  useEffect(() => {
    if (me?.isSuperAdmin) loadTally();
  }, [loadTally, me]);

  return (
    <AdminLayout title="Late Returns" subtitle={isOwner ? 'Every overdue rental, plus your automatic late-fee switch' : 'Every overdue rental — reach out to get an extension'} onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}

      {/* Master ON/OFF kill switch — OWNER ONLY */}
      {isOwner && <LateFeeToggle />}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.75rem' }}>
        <h3 style={{ margin: 0, color: '#374151' }}>
          Currently overdue {rows.length > 0 && <span style={{ color: '#dc2626' }}>({rows.length})</span>}
        </h3>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reservation</th>
              <th>Vehicle</th>
              <th>Renter</th>
              <th>Host</th>
              <th>Was due</th>
              <th>Late</th>
              <th>Charged</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="8"><div className="admin-empty">No overdue rentals right now. 🎉</div></td></tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                style={{ cursor: 'pointer' }}
                title="Open this reservation"
                onClick={() => navigate(`/admin/bookings/${r.id}`)}
              >
                <td><strong>{r.reservationId || '—'}</strong></td>
                <td>{r.vehicle}</td>
                <td>{r.driver || '—'}{r.driverPhone ? <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{r.driverPhone}</div> : null}</td>
                <td>{r.host || '—'}{r.hostPhone ? <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{r.hostPhone}</div> : null}</td>
                <td>{fmtDue(r.returnMoment)}</td>
                <td><strong style={{ color: '#dc2626' }}>{fmtLate(r.hoursLate)}</strong></td>
                <td>{r.daysCharged > 0 ? `$${(r.totalCharged || 0).toFixed(2)} (${r.daysCharged}d)` : '—'}</td>
                <td>
                  {!r.eligible ? (
                    <span title="Booked before the late-fee policy went live — not subject to automatic charging" style={{ fontSize: '0.78rem', color: '#6b7280' }}>Not charged (pre-policy)</span>
                  ) : r.retryCount > 0 ? (
                    <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: 700 }}>⚠ Card retrying</span>
                  ) : r.daysCharged > 0 ? (
                    <span style={{ fontSize: '0.78rem', color: '#10b981', fontWeight: 700 }}>Charging</span>
                  ) : (
                    <span style={{ fontSize: '0.78rem', color: '#6b7280' }}>Pending</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Monthly late-return tally by host — OWNER ONLY ── */}
      {/* Read-only: completed reservations returned past their paid time, grouped */}
      {/* by host, so the owner can see how many overstay insurance days each host */}
      {/* clipped this month. No money moves from this view. */}
      {isOwner && (
        <div style={{ marginTop: '2.25rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 0.4rem', flexWrap: 'wrap', gap: '0.5rem' }}>
            <h3 style={{ margin: 0, color: '#374151' }}>
              Monthly late-return tally{' '}
              {tally && tally.totalOverstayDays > 0 && (
                <span style={{ color: '#dc2626' }}>({tally.totalOverstayDays} day{tally.totalOverstayDays === 1 ? '' : 's'})</span>
              )}
            </h3>
            <select
              value={tallyMonth}
              onChange={(e) => setTallyMonth(e.target.value)}
              disabled={tallyLoading}
              style={{ padding: '0.45rem 0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', background: '#fff', color: '#111827', fontSize: '0.9rem' }}
            >
              {monthOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <p style={{ margin: '0 0 0.75rem', color: '#6b7280', fontSize: '0.85rem' }}>
            Completed reservations returned <strong>after</strong> their paid return time, grouped by host — how many overstay insurance days each host's trips clipped this month. Read-only.
          </p>

          {tallyError && <div className="admin-error">{tallyError}</div>}

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Late reservations</th>
                  <th>Overstay days</th>
                </tr>
              </thead>
              <tbody>
                {(!tally || tally.rows.length === 0) && !tallyLoading && (
                  <tr><td colSpan="3"><div className="admin-empty">No late-closed reservations this month. 🎉</div></td></tr>
                )}
                {tally && tally.rows.map((r) => (
                  <tr key={r.hostId}>
                    <td><strong>{r.host}</strong>{r.hostPhone ? <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{r.hostPhone}</div> : null}</td>
                    <td>{r.lateReservations}</td>
                    <td><strong style={{ color: '#dc2626' }}>{r.overstayDays}</strong></td>
                  </tr>
                ))}
                {tally && tally.rows.length > 0 && (
                  <tr style={{ borderTop: '2px solid #e5e7eb', fontWeight: 700 }}>
                    <td>Total</td>
                    <td>{tally.totalLateReservations}</td>
                    <td style={{ color: '#dc2626' }}>{tally.totalOverstayDays}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminLateReturns;
