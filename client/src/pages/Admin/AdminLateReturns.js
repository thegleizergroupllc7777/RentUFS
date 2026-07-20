import React, { useCallback, useEffect, useState } from 'react';
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

  // The auto-charge ON/OFF switch is owner-only; staff admins see the overdue
  // list (and charged amounts) so they can chase renters, but can't flip charging.
  const isOwner = !!me?.isSuperAdmin;

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
    </AdminLayout>
  );
};

export default AdminLateReturns;
