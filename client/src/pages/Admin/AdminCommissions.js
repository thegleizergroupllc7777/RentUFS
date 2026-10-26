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

  // GPS Leaders host-interest tally (owner only). Read-only partner metric.
  const [gps, setGps] = useState(null);

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

  const loadGps = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/admin/gps-leaders-interest');
      setGps(data);
    } catch (err) { /* non-blocking partner metric */ }
  }, []);

  useEffect(() => {
    if (me) load();
  }, [load, me]);

  useEffect(() => {
    if (me?.isSuperAdmin) loadGps();
  }, [loadGps, me]);

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

  const salespeople = data?.salespeople || [];
  const monthLabel = MONTHS.find((x) => x.value === month)?.label || month;
  // The owner sees every salesperson; a staff admin sees only their own days
  // (the server scopes the data, so this only tweaks the wording).
  const isOwner = !!me?.isSuperAdmin;

  return (
    <AdminLayout title="Commissions" subtitle={isOwner ? 'Monthly salesperson commission days — owner only' : 'Your commission days by month'} onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-toolbar">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((mo) => <option key={mo.value} value={mo.value}>{mo.label}</option>)}
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button className="admin-btn primary" onClick={downloadCsv} disabled={loading || salespeople.length === 0}>⬇ Download CSV</button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', margin: '0 0 1rem', fontSize: '0.85rem', color: '#bbb' }}>
        💼 <strong>{isOwner ? `Commission days for ${monthLabel}.` : `Your commission days for ${monthLabel}.`}</strong> {isOwner
          ? 'Booked days of paid bookings for each host, grouped by the salesperson who referred them. Cancelled and refunded bookings are excluded.'
          : 'Booked days of paid bookings from the hosts you referred. Cancelled and refunded bookings are excluded.'}
        <br />
        <strong>No rate is shown on purpose</strong> — {isOwner
          ? 'you and your salesperson agree on the per-day rate; multiply it by the days below when you pay.'
          : 'your per-day rate is arranged with the owner. This just tracks your days so there are no surprises at month-end.'}
      </div>

      {/* GPS Leaders — host interest (owner only). Read-only partner metric:
          hosts who clicked through to GPS Leaders from the Integrations tab.
          Separate from commissions; GPS Leaders receives none of your data. */}
      {isOwner && (
        <div style={{ margin: '0 0 1.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', margin: '0 0 0.4rem' }}>
            <h3 style={{ color: '#374151', margin: 0 }}>
              🛰️ GPS Leaders — host interest{' '}
              {gps && gps.totalHosts > 0 && (
                <span style={{ color: '#10b981' }}>({gps.totalHosts} host{gps.totalHosts === 1 ? '' : 's'} · {gps.totalClicks} click{gps.totalClicks === 1 ? '' : 's'})</span>
              )}
            </h3>
            <button className="admin-btn" onClick={loadGps}>Refresh</button>
          </div>
          <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 0.75rem' }}>
            Hosts who clicked through to the GPS Leaders partner page from their Integrations tab — interest only. GPS Leaders receives none of your data.
          </p>
          {/* Cap the height so a long list scrolls inside the card instead of
              stretching the whole page. Header stays pinned while you scroll. */}
          <div className="admin-table-wrap" style={{ maxHeight: '340px', overflowY: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  {['Host', 'Contact', 'Clicks', 'First clicked', 'Last clicked'].map((h) => (
                    <th key={h} style={{ position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(!gps || gps.rows.length === 0) && (
                  <tr><td colSpan="5"><div className="admin-empty">No hosts have clicked GPS Leaders yet.</div></td></tr>
                )}
                {gps && gps.rows.map((r) => (
                  <tr key={r.id}>
                    <td><strong>{r.name}</strong></td>
                    <td>{r.email}{r.phone ? <div style={{ fontSize: '0.8rem', color: '#6b7280' }}>{r.phone}</div> : null}</td>
                    <td><strong>{r.clickCount}</strong></td>
                    <td>{r.firstClickedAt ? new Date(r.firstClickedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                    <td>{r.lastClickedAt ? new Date(r.lastClickedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

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
