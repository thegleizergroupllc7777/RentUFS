import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

// Commissions start tracking when the platform went live. Adjust if needed.
const COMMISSION_START_YEAR = 2026;
const COMMISSION_START_MONTH = 6; // June

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Selectable months from the start month up to the current month.
const buildMonths = () => {
  const now = new Date();
  const list = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  if (y < COMMISSION_START_YEAR || (y === COMMISSION_START_YEAR && m < COMMISSION_START_MONTH)) {
    y = COMMISSION_START_YEAR;
    m = COMMISSION_START_MONTH;
  }
  while (y > COMMISSION_START_YEAR || (y === COMMISSION_START_YEAR && m >= COMMISSION_START_MONTH)) {
    list.push({ value: `${y}-${String(m).padStart(2, '0')}`, label: `${MONTH_NAMES[m - 1]} ${y}` });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return list;
};

// Trip dates are stored as midnight UTC of the selected day — format in UTC so a
// browser east of UTC doesn't show the previous day (matches the bookings view).
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');

// Owner-only: monthly salesperson commission report. Shows total booked DAYS of
// paid bookings (cancelled/refunded excluded), grouped by the salesperson who
// referred each host. Days only — the owner settles the per-day rate directly.
const AdminCommissions = () => {
  const { user: me } = useAuth();
  const MONTHS = buildMonths();
  const [month, setMonth] = useState(MONTHS[0]?.value || '');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!month) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/admin/commissions', { params: { month } });
      setData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load commissions');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (me?.isSuperAdmin) load();
  }, [load, me]);

  const downloadCsv = () => {
    if (!data) return;
    const headers = ['Salesperson', 'Host', 'Reservation', 'Vehicle', 'Days', 'Trip Start', 'Trip End', 'Status'];
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    (data.salespeople || []).forEach((sp) => {
      (sp.rows || []).forEach((r) => {
        lines.push([sp.salesperson, r.host, r.reservationId, r.vehicle, r.days, fmtDate(r.startDate), fmtDate(r.endDate), r.status].map(esc).join(','));
      });
    });
    lines.push('');
    lines.push(['', '', '', '', 'TOTAL DAYS', data.totalDays].map(esc).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentufs-commissions-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Belt-and-suspenders: nav link and server already gate this, but guard the
  // page too so a regular admin who guesses the URL sees nothing.
  if (!me?.isSuperAdmin) {
    return (
      <AdminLayout title="Commissions" subtitle="Owner only">
        <div className="admin-error">This page is restricted to the platform owner.</div>
      </AdminLayout>
    );
  }

  const salespeople = data?.salespeople || [];
  const monthLabel = MONTHS.find((x) => x.value === month)?.label || month;

  return (
    <AdminLayout title="Commissions" subtitle="Monthly salesperson commission days — owner only" onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-toolbar">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((mo) => <option key={mo.value} value={mo.value}>{mo.label}</option>)}
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button className="admin-btn primary" onClick={downloadCsv} disabled={loading || salespeople.length === 0}>⬇ Download CSV</button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', margin: '0 0 1rem', fontSize: '0.85rem', color: '#bbb' }}>
        💼 <strong>Commission days for {monthLabel}.</strong> Booked days of paid bookings for each host, grouped by the salesperson who referred them. Cancelled and refunded bookings are excluded.
        <br />
        <strong>No rate is shown on purpose</strong> — you and your salesperson agree on the per-day rate; multiply it by the days below when you pay.
      </div>

      {/* Summary — total days per salesperson + grand total */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '0 0 1.25rem' }}>
        {salespeople.map((sp) => (
          <div key={sp.salespersonId} style={{ flex: '1 1 200px', background: '#111', border: '1px solid #333', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: '0.8rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{sp.salesperson}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', lineHeight: 1.1, marginTop: 4 }}>{sp.days}</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>commission days · {sp.rentals} {sp.rentals === 1 ? 'rental' : 'rentals'}</div>
          </div>
        ))}
        <div style={{ flex: '1 1 200px', background: '#10b981', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontSize: '0.8rem', color: '#04331f', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Total</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#04331f', lineHeight: 1.1, marginTop: 4 }}>{data?.totalDays || 0}</div>
          <div style={{ fontSize: '0.8rem', color: '#04331f' }}>commission days</div>
        </div>
      </div>

      {salespeople.length === 0 && !loading && (
        <div className="admin-table-wrap"><div className="admin-empty">No commission days for {monthLabel}. (Tag a host with a referring salesperson on their profile to start tracking.)</div></div>
      )}

      {/* Detail per salesperson — the proof behind each total */}
      {salespeople.map((sp) => (
        <div key={sp.salespersonId} style={{ marginBottom: '1.5rem' }}>
          <h3 style={{ color: '#374151', marginBottom: '0.5rem' }}>{sp.salesperson} — {sp.days} day{sp.days === 1 ? '' : 's'}</h3>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Host</th>
                  <th>Reservation</th>
                  <th>Vehicle</th>
                  <th>Days</th>
                  <th>Trip</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {sp.rows.map((r, i) => (
                  <tr key={`${sp.salespersonId}-${i}`}>
                    <td>{r.host}</td>
                    <td><strong>{r.reservationId}</strong></td>
                    <td>{r.vehicle}</td>
                    <td><strong>{r.days}</strong></td>
                    <td>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                    <td>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </AdminLayout>
  );
};

export default AdminCommissions;
