import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

// Insurance billing only starts when the TeqMobility contract is signed —
// there is nothing to bill before coverage existed, so never offer earlier
// months. Change these two numbers if the contract effective date changes.
const INSURANCE_START_YEAR = 2026;  // contract effective year
const INSURANCE_START_MONTH = 6;    // contract effective month (6 = June)

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// Build the list of selectable months from the contract start up to the current
// month. If the contract start is in the future, show just that start month.
const buildMonths = () => {
  const now = new Date();
  const list = [];
  let y = now.getFullYear();
  let m = now.getMonth() + 1;
  // If we're still before the contract starts, anchor on the start month itself
  // so the dropdown is never empty.
  if (y < INSURANCE_START_YEAR || (y === INSURANCE_START_YEAR && m < INSURANCE_START_MONTH)) {
    y = INSURANCE_START_YEAR;
    m = INSURANCE_START_MONTH;
  }
  while (y > INSURANCE_START_YEAR || (y === INSURANCE_START_YEAR && m >= INSURANCE_START_MONTH)) {
    list.push({
      value: `${y}-${String(m).padStart(2, '0')}`,
      label: `${MONTH_NAMES[m - 1]} ${y}`
    });
    m -= 1;
    if (m === 0) { m = 12; y -= 1; }
  }
  return list;
};

// Trip dates are stored as midnight UTC of the selected day, so format them in UTC —
// otherwise a browser east of UTC shows the previous day (matches the bookings view).
const fmtDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : '—');

// Owner-only page: monthly TeqMobility insurance reconciliation. Shows total
// COVERAGE DAYS (split Basic vs Premium) plus the line-by-line list so the owner
// can match the provider's invoice. Read-only — no rates, no dollars, no edits.
const AdminInsurance = () => {
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
      const { data } = await axios.get('/api/admin/insurance-billing', { params: { month } });
      setData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load insurance billing');
    } finally {
      setLoading(false);
    }
  }, [month]);

  useEffect(() => {
    if (me?.isSuperAdmin) load();
  }, [load, me]);

  const downloadCsv = () => {
    if (!data) return;
    const headers = ['Reservation', 'Vehicle', 'Driver', 'State', 'Coverage', 'Days', 'Trip Start', 'Trip End', 'Status', 'Coverage Activated'];
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    (data.rows || []).forEach((r) => {
      lines.push([
        r.reservationId, r.vehicle, r.driver, r.state, r.tier, r.days,
        fmtDate(r.startDate), fmtDate(r.endDate), r.status, r.activated ? 'Yes' : 'No'
      ].map(esc).join(','));
    });
    lines.push('');
    lines.push(['', '', '', 'TOTAL DAYS', data.totalDays].map(esc).join(','));
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentufs-insurance-${month}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Belt-and-suspenders: the nav link and the server already gate this, but
  // guard the page too so a regular admin who guesses the URL sees nothing.
  if (!me?.isSuperAdmin) {
    return (
      <AdminLayout title="Insurance" subtitle="Owner only">
        <div className="admin-error">This page is restricted to the platform owner.</div>
      </AdminLayout>
    );
  }

  const summary = data?.summary || [];
  const rows = data?.rows || [];
  const monthLabel = MONTHS.find((x) => x.value === month)?.label || month;

  return (
    <AdminLayout title="Insurance Billing" subtitle="Monthly coverage days to reconcile with the insurance provider — owner only" onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-toolbar">
        <select value={month} onChange={(e) => setMonth(e.target.value)}>
          {MONTHS.map((mo) => <option key={mo.value} value={mo.value}>{mo.label}</option>)}
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button className="admin-btn primary" onClick={downloadCsv} disabled={loading || rows.length === 0}>⬇ Download CSV</button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', margin: '0 0 1rem', fontSize: '0.85rem', color: '#bbb' }}>
        💰 <strong>Coverage days for {monthLabel}.</strong> This is exactly what you owe the insurance provider — the big total below should match their invoice.
        Only reservations where coverage was <strong>actually activated</strong> appear here. Cancelled, refunded-but-never-activated, and test bookings are excluded because the provider never turned coverage on for them.
        <br />
        <strong>No prices are shown on purpose</strong> — rates can change, days don't. You and the provider agree on the <strong>days</strong>; the dollars are settled on your call.
      </div>

      {/* Summary — the big numbers you match against the invoice */}
      <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', margin: '0 0 1.25rem' }}>
        {summary.map((s) => (
          <div key={s.tier} style={{ flex: '1 1 180px', background: '#111', border: '1px solid #333', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: '0.8rem', color: '#10b981', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>{s.tier}</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#fff', lineHeight: 1.1, marginTop: 4 }}>{s.days}</div>
            <div style={{ fontSize: '0.8rem', color: '#888' }}>coverage days · {s.rentals} {s.rentals === 1 ? 'rental' : 'rentals'}</div>
          </div>
        ))}
        <div style={{ flex: '1 1 180px', background: '#10b981', borderRadius: 10, padding: '16px 18px' }}>
          <div style={{ fontSize: '0.8rem', color: '#04331f', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>Total</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#04331f', lineHeight: 1.1, marginTop: 4 }}>{data?.totalDays || 0}</div>
          <div style={{ fontSize: '0.8rem', color: '#04331f' }}>coverage days · {data?.totalRentals || 0} {(data?.totalRentals || 0) === 1 ? 'rental' : 'rentals'}</div>
        </div>
      </div>

      {/* Detail — the proof behind the totals */}
      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Reservation</th>
              <th>Vehicle</th>
              <th>Driver</th>
              <th>State</th>
              <th>Coverage</th>
              <th>Days</th>
              <th>Trip</th>
              <th>Status</th>
              <th>Activated</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !loading && (
              <tr><td colSpan="9"><div className="admin-empty">No covered reservations for {monthLabel}.</div></td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td><strong>{r.reservationId}</strong></td>
                <td>{r.vehicle}</td>
                <td>{r.driver || '—'}</td>
                <td>{r.state || '—'}</td>
                <td>{r.tier}</td>
                <td><strong>{r.days}</strong></td>
                <td>{fmtDate(r.startDate)} – {fmtDate(r.endDate)}</td>
                <td>{r.status}</td>
                <td>{r.activated ? '✓' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

export default AdminInsurance;
