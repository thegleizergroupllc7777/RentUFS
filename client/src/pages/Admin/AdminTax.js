import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const currentYear = new Date().getFullYear();
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

// Owner-only page: host tax info + yearly NET earnings for 1099 filing.
// The "Net Earnings" column is the host's actual take-home (Gross − Platform
// Fee − Stripe Fee) — the same number on their dashboard and payouts.
const AdminTax = () => {
  const { user: me } = useAuth();
  const [year, setYear] = useState(currentYear);
  const [hosts, setHosts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState({}); // host id -> true

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setRevealed({});
    try {
      const { data } = await axios.get('/api/admin/tax-export', { params: { year } });
      setHosts(data.hosts || []);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load tax data');
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    if (me?.isSuperAdmin) load();
  }, [load, me]);

  const maskTaxId = (h) => {
    if (!h.taxIdLast4) return '—';
    return h.taxIdType === 'EIN' ? `••-•••${h.taxIdLast4}` : `•••-••-${h.taxIdLast4}`;
  };

  const downloadCsv = () => {
    const headers = [
      'Host Name', 'Business Name', 'Tax ID Type', 'Tax ID (full)',
      'Street', 'City', 'State', 'Zip', 'Email',
      'Gross Rental', 'Platform Fees', 'Stripe Fees', 'Net Earnings',
      'Paid Bookings', 'Account Status'
    ];
    const esc = (v) => {
      const s = String(v == null ? '' : v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(',')];
    hosts.forEach((h) => {
      lines.push([
        h.name, h.businessName, h.taxIdType, h.taxIdFull,
        h.street, h.city, h.state, h.zip, h.email,
        h.gross, h.platformFees, h.stripeFees, h.netEarnings,
        h.bookingCount, h.accountStatus
      ].map(esc).join(','));
    });
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rentufs-1099-${year}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Belt-and-suspenders: the nav link and the server already gate this, but
  // guard the page too so a regular admin who guesses the URL sees nothing.
  if (!me?.isSuperAdmin) {
    return (
      <AdminLayout title="Tax / 1099" subtitle="Owner only">
        <div className="admin-error">This page is restricted to the platform owner.</div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout title="Tax / 1099" subtitle="Host tax info & yearly earnings for 1099 filing — owner only">
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-toolbar">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button className="admin-btn primary" onClick={downloadCsv} disabled={loading || hosts.length === 0}>⬇ Download CSV</button>
      </div>

      <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: '10px 14px', margin: '0 0 1rem', fontSize: '0.85rem', color: '#bbb' }}>
        🔒 <strong>Sensitive — owner only.</strong> Tax IDs are masked on screen; click <em>Reveal</em> to view one.
        The downloaded CSV contains <strong>full SSN/EIN numbers</strong> — store it securely and delete it once filing is done.
        <br />
        <strong>Net Earnings</strong> = the host's actual take-home (Gross − Platform Fee − Stripe Fee) — the figure they're taxed on.
        Deactivated hosts are included so no tax data is ever lost.
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Host</th>
              <th>Tax ID</th>
              <th>Gross</th>
              <th>Platform Fee</th>
              <th>Stripe Fee</th>
              <th>Net Earnings</th>
              <th>Bookings</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {hosts.length === 0 && !loading && (
              <tr><td colSpan="8"><div className="admin-empty">No hosts found for {year}.</div></td></tr>
            )}
            {hosts.map((h) => (
              <tr key={h.id}>
                <td>
                  <strong>{h.name}</strong>
                  {h.businessName && <div style={{ fontSize: '0.8rem', color: '#888' }}>{h.businessName}</div>}
                  <div style={{ fontSize: '0.8rem', color: '#888' }}>{h.email}</div>
                  {(h.street || h.city) && (
                    <div style={{ fontSize: '0.8rem', color: '#888' }}>
                      {[h.street, h.city, h.state, h.zip].filter(Boolean).join(', ')}
                    </div>
                  )}
                </td>
                <td>
                  <span style={{ fontFamily: 'monospace' }}>
                    {revealed[h.id] ? (h.taxIdFull || '—') : maskTaxId(h)}
                  </span>
                  {h.taxIdFull && (
                    <button
                      className="admin-btn"
                      style={{ marginLeft: 8 }}
                      onClick={() => setRevealed((r) => ({ ...r, [h.id]: !r[h.id] }))}
                    >
                      {revealed[h.id] ? 'Hide' : 'Reveal'}
                    </button>
                  )}
                  <div style={{ fontSize: '0.75rem', color: '#888' }}>{h.taxIdType}</div>
                </td>
                <td>{formatCurrency(h.gross)}</td>
                <td>{formatCurrency(h.platformFees)}</td>
                <td>{formatCurrency(h.stripeFees)}</td>
                <td><strong>{formatCurrency(h.netEarnings)}</strong></td>
                <td>{h.bookingCount}</td>
                <td>
                  <span className={`badge ${h.accountStatus === 'active' ? 'active-acct' : 'deactivated'}`}>
                    {h.accountStatus}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminLayout>
  );
};

export default AdminTax;
