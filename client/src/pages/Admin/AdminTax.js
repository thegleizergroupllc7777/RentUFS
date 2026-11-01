import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const currentYear = new Date().getFullYear();
// RentUFS launched in 2026 — never offer years before there was any activity.
const LAUNCH_YEAR = 2026;
const YEARS = [];
for (let y = Math.max(currentYear, LAUNCH_YEAR); y >= LAUNCH_YEAR; y--) YEARS.push(y);

// Owner-only page: host tax info + yearly NET earnings for 1099 filing.
// The "Net Earnings" column is the host's actual take-home (Gross − Platform
// Fee − Stripe Fee) — the same number on their dashboard and payouts.
const AdminTax = () => {
  const { user: me } = useAuth();
  const [year, setYear] = useState(currentYear);
  const [hosts, setHosts] = useState([]);
  const [totalUpcomingPayout, setTotalUpcomingPayout] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [revealed, setRevealed] = useState({}); // host id -> true

  // Owner-only tax-ID correction modal.
  const [editHost, setEditHost] = useState(null);
  const [newTaxId, setNewTaxId] = useState('');
  const [editReason, setEditReason] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [editBusy, setEditBusy] = useState(false);
  const [editErr, setEditErr] = useState('');
  const [editMsg, setEditMsg] = useState('');

  // Label for the upcoming Monday payout run (today if it's Monday, else the
  // next Monday). Payouts run weekly on Monday. Display only.
  const nextMondayLabel = (() => {
    const d = new Date();
    const daysUntilMon = (1 - d.getDay() + 7) % 7; // 0 if today is Monday
    const mon = new Date(d);
    mon.setDate(d.getDate() + daysUntilMon);
    return mon.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  })();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setRevealed({});
    try {
      const { data } = await axios.get('/api/admin/tax-export', { params: { year } });
      setHosts(data.hosts || []);
      setTotalUpcomingPayout(data.totalUpcomingPayout || 0);
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
      'Paid Bookings', 'Upcoming Payout', 'Account Status'
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
        h.bookingCount, h.owed || 0, h.accountStatus
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

  const openEdit = (h) => {
    setEditHost(h); setNewTaxId(''); setEditReason(''); setConfirming(false); setEditErr('');
  };
  const closeEdit = () => { setEditHost(null); setConfirming(false); setEditErr(''); };

  const submitEdit = async () => {
    setEditErr(''); setEditBusy(true);
    try {
      const { data } = await axios.patch(`/api/admin/hosts/${editHost.id}/tax-id`, {
        taxId: newTaxId, reason: editReason
      });
      setEditMsg(`✅ ${editHost.name}'s tax ID updated (now ending ${data.taxIdLast4}). Previous value saved to history.`);
      closeEdit();
      load();
    } catch (err) {
      setEditErr(err.response?.data?.message || 'Failed to update tax ID.');
    } finally {
      setEditBusy(false);
    }
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
    <AdminLayout title="Tax / 1099" subtitle="Host tax info & yearly earnings for 1099 filing — owner only" onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}
      {editMsg && (
        <div style={{ background: '#ecfdf5', border: '1px solid #10b981', color: '#065f46', borderRadius: 8, padding: '10px 14px', margin: '0 0 1rem', display: 'flex', justifyContent: 'space-between', gap: 10 }}>
          <span>{editMsg}</span>
          <button onClick={() => setEditMsg('')} style={{ background: 'transparent', border: 'none', color: '#065f46', cursor: 'pointer', fontWeight: 700 }}>×</button>
        </div>
      )}

      <div className="admin-toolbar">
        <select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button className="admin-btn primary" onClick={downloadCsv} disabled={loading || hosts.length === 0}>⬇ Download CSV</button>
        {/* Next-Monday payout total — live, read-only sum of all hosts' owed. */}
        <div style={{ marginLeft: 'auto', background: '#10b981', borderRadius: 12, padding: '10px 18px', minWidth: 220, boxShadow: '0 1px 2px rgba(0,0,0,0.06)' }}>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.6px', textTransform: 'uppercase', fontWeight: 800, color: '#04331f' }}>🗓️ Next Monday Payout</div>
          <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#04331f', lineHeight: 1.1, marginTop: 2 }}>{formatCurrency(totalUpcomingPayout)}</div>
          <div style={{ fontSize: '0.74rem', color: '#065f46', marginTop: 2 }}>{nextMondayLabel} · total owed to all hosts</div>
        </div>
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
              <th>Upcoming Payout</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {hosts.length === 0 && !loading && (
              <tr><td colSpan="9"><div className="admin-empty">No hosts found for {year}.</div></td></tr>
            )}
            {hosts.map((h) => (
              <tr key={h.id}>
                <td>
                  {/* Clickable: opens the host's admin profile. */}
                  <Link to={`/admin/users/${h.id}`} style={{ color: '#111827', fontWeight: 700, textDecoration: 'none' }}>
                    {h.name}
                  </Link>
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
                  {/* Reveal + Edit side by side; Edit is red to stand out. */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                    {h.taxIdFull && (
                      <button
                        className="admin-btn"
                        onClick={() => setRevealed((r) => ({ ...r, [h.id]: !r[h.id] }))}
                      >
                        {revealed[h.id] ? 'Hide' : 'Reveal'}
                      </button>
                    )}
                    <button
                      className="admin-btn"
                      style={{ color: '#b91c1c', borderColor: '#fca5a5', fontWeight: 600 }}
                      onClick={() => openEdit(h)}
                    >
                      Edit
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#888', marginTop: 4 }}>{h.taxIdType}</div>
                </td>
                <td>{formatCurrency(h.gross)}</td>
                <td>{formatCurrency(h.platformFees)}</td>
                <td>{formatCurrency(h.stripeFees)}</td>
                <td><strong>{formatCurrency(h.netEarnings)}</strong></td>
                <td>{h.bookingCount}</td>
                <td>
                  {(h.owed || 0) > 0
                    ? <strong style={{ color: '#047857' }}>{formatCurrency(h.owed)}</strong>
                    : <span style={{ color: '#9ca3af' }}>{formatCurrency(0)}</span>}
                </td>
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

      {/* Owner-only tax-ID correction modal: enter new value + required reason,
          then a confirmation gate. Previous value is archived server-side. */}
      {editHost && (
        <div onClick={closeEdit} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: 24, maxWidth: 480, width: '100%', boxShadow: '0 10px 40px rgba(0,0,0,0.3)' }}>
            {!confirming ? (
              <>
                <h3 style={{ margin: '0 0 4px' }}>Change tax ID — {editHost.name}</h3>
                <p style={{ color: '#6b7280', fontSize: '0.84rem', margin: '0 0 16px', lineHeight: 1.5 }}>
                  Owner-only. The previous value is saved to history, and the host stays locked (they still can't change it themselves).
                </p>
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>New SSN / EIN (9 digits)</label>
                <input value={newTaxId} onChange={(e) => setNewTaxId(e.target.value)} placeholder="XXXXXXXXX" style={{ width: '100%', padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'monospace', marginBottom: 14, boxSizing: 'border-box' }} />
                <label style={{ display: 'block', fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>Documentation / reason <span style={{ color: '#dc2626' }}>(required)</span></label>
                <textarea value={editReason} onChange={(e) => setEditReason(e.target.value)} placeholder="e.g. Host emailed SS card + license on 11/1, verified." style={{ width: '100%', minHeight: 70, padding: '10px 12px', border: '1px solid #d1d5db', borderRadius: 8, fontFamily: 'inherit', resize: 'vertical', marginBottom: 6, boxSizing: 'border-box' }} />
                {editErr && <div style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '4px 0' }}>{editErr}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                  <button className="admin-btn" onClick={closeEdit}>Cancel</button>
                  <button className="admin-btn primary" onClick={() => {
                    setEditErr('');
                    if (newTaxId.replace(/\D/g, '').length !== 9) { setEditErr('Tax ID must be exactly 9 digits.'); return; }
                    if (!editReason.trim()) { setEditErr('A documentation reason is required.'); return; }
                    setConfirming(true);
                  }}>Continue</button>
                </div>
              </>
            ) : (
              <>
                <h3 style={{ margin: '0 0 8px', color: '#b45309' }}>⚠️ Confirm tax-ID change</h3>
                <p style={{ color: '#374151', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 16px' }}>
                  You're changing <strong>{editHost.name}</strong>'s tax ID to one ending in <strong>{newTaxId.replace(/\D/g, '').slice(-4)}</strong>. Confirm you've verified their documentation. This change is logged and the old value is saved to history.
                </p>
                {editErr && <div style={{ color: '#b91c1c', fontSize: '0.85rem', margin: '4px 0' }}>{editErr}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button className="admin-btn" onClick={() => setConfirming(false)} disabled={editBusy}>Back</button>
                  <button className="admin-btn primary" onClick={submitEdit} disabled={editBusy}>{editBusy ? 'Saving…' : 'Yes, change it'}</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </AdminLayout>
  );
};

export default AdminTax;
