import React, { useCallback, useEffect, useRef, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

// ── TeqMobility bill reconciliation (100% client-side) ──────────────────────
// Everything below runs in the browser only. It READS the TeqMobility invoice
// CSV the owner uploads and COMPARES its day counts against the coverage days
// already on this page. It never uploads the file anywhere, never writes to the
// server, and never touches a booking, payment, coverage, or toll. Worst case:
// it shows a wrong number on screen. It cannot move money or change any data.

// Normalize a name/vehicle for matching: lowercase, collapse whitespace, trim.
const norm = (s) => String(s == null ? '' : s).toLowerCase().replace(/\s+/g, ' ').trim();

// Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes ("")
// and commas/newlines inside quotes. Returns an array of string arrays.
const parseCsv = (text) => {
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else { field += c; }
    } else if (c === '"') { inQuotes = true; }
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\r') { /* skip */ }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else { field += c; }
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
};

// Turn the TeqMobility CSV text into a reconciliation against `pageRows` (your
// coverage rows) and your `yourTotal` days. Pure function — no side effects.
const reconcileTeq = (text, pageRows, yourTotal) => {
  const grid = parseCsv(text).filter((r) => r.some((c) => String(c).trim() !== ''));
  if (grid.length < 2) throw new Error('That file has no rows to read.');

  const header = grid[0].map(norm);
  const findCol = (needles) => header.findIndex((h) => needles.some((n) => h.includes(n)));
  const driverCol = findCol(['driver']);
  const daysCol = findCol(['days']);
  const vehicleCol = findCol(['vehicle']);
  if (driverCol < 0 || daysCol < 0) {
    throw new Error("Couldn't find a 'Driver' and 'Days' column in that file. Is it the TeqMobility invoice CSV?");
  }

  // Aggregate TeqMobility days by driver (and by driver+vehicle for tighter matching).
  const byDriver = new Map();
  const byDriverVeh = new Map();
  let teqTotal = 0;
  for (let i = 1; i < grid.length; i++) {
    const cols = grid[i];
    const driver = norm(cols[driverCol]);
    if (!driver) continue;
    const days = parseInt(String(cols[daysCol] || '').replace(/[^0-9-]/g, ''), 10) || 0;
    const veh = vehicleCol >= 0 ? norm(cols[vehicleCol]) : '';
    teqTotal += days;
    byDriver.set(driver, (byDriver.get(driver) || 0) + days);
    const key = `${driver}|${veh}`;
    byDriverVeh.set(key, (byDriverVeh.get(key) || 0) + days);
  }

  // Compare each of your rows to the TeqMobility totals.
  const pageDrivers = new Set(pageRows.map((r) => norm(r.driver)));
  const recon = pageRows.map((r) => {
    const dn = norm(r.driver);
    const vk = `${dn}|${norm(r.vehicle)}`;
    const teqDays = byDriverVeh.has(vk) ? byDriverVeh.get(vk) : (byDriver.has(dn) ? byDriver.get(dn) : null);
    const yourDays = Number(r.days) || 0;
    let status, diff = null;
    if (teqDays == null) { status = 'missing'; }
    else { diff = yourDays - teqDays; status = diff === 0 ? 'match' : (diff > 0 ? 'ahead' : 'short'); }
    return { ...r, yourDays, teqDays, diff, status };
  });

  // TeqMobility drivers that don't appear anywhere in your rows.
  const extra = [];
  byDriver.forEach((days, driver) => { if (!pageDrivers.has(driver)) extra.push({ driver, days }); });

  const counts = { match: 0, ahead: 0, short: 0, missing: 0 };
  recon.forEach((r) => { counts[r.status] = (counts[r.status] || 0) + 1; });

  return { recon, extra, teqTotal, yourTotal: yourTotal || 0, net: (yourTotal || 0) - teqTotal, counts };
};

// Visual style per reconciliation status.
const STATUS_STYLE = {
  match: { bg: 'rgba(16,185,129,.14)', fg: '#10b981', label: '✓ Match' },
  ahead: { bg: 'rgba(47,155,255,.14)', fg: '#3aa0ff', label: '▲ You ahead' },
  short: { bg: 'rgba(239,68,68,.16)', fg: '#f87171', label: '⚠ Short' },
  missing: { bg: 'rgba(245,158,11,.16)', fg: '#fbbf24', label: '• Not on bill' }
};

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
  // TeqMobility bill reconciliation state (client-side only).
  const [teq, setTeq] = useState(null);          // reconciliation result, or null
  const [teqFile, setTeqFile] = useState('');    // uploaded file name, for display
  const [teqError, setTeqError] = useState('');
  const fileRef = useRef(null);

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

  // Read + compare the TeqMobility invoice entirely in the browser. Nothing is
  // uploaded or saved; this only sets on-screen state.
  const handleTeqFile = (e) => {
    const file = e.target.files && e.target.files[0];
    if (fileRef.current) fileRef.current.value = ''; // allow re-selecting the same file
    if (!file) return;
    setTeqError('');
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const result = reconcileTeq(String(reader.result || ''), data?.rows || [], data?.totalDays || 0);
        setTeq(result);
        setTeqFile(file.name);
      } catch (err) {
        setTeq(null);
        setTeqFile('');
        setTeqError(err.message || 'Could not read that file.');
      }
    };
    reader.onerror = () => setTeqError('Could not read that file.');
    reader.readAsText(file);
  };

  // Any change of month invalidates a loaded reconciliation (different invoice).
  const changeMonth = (value) => {
    setMonth(value);
    setTeq(null);
    setTeqFile('');
    setTeqError('');
  };

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
        <select value={month} onChange={(e) => changeMonth(e.target.value)}>
          {MONTHS.map((mo) => <option key={mo.value} value={mo.value}>{mo.label}</option>)}
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
        <button className="admin-btn primary" onClick={downloadCsv} disabled={loading || rows.length === 0}>⬇ Download CSV</button>
        <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleTeqFile} style={{ display: 'none' }} />
        <button
          className="admin-btn"
          onClick={() => fileRef.current && fileRef.current.click()}
          disabled={loading || rows.length === 0}
          title="Compare the TeqMobility invoice CSV against your coverage days — read-only"
          style={{ background: '#1f6feb', borderColor: '#1f6feb', color: '#fff' }}
        >⬆ Upload TeqMobility Bill</button>
      </div>

      {teqError && <div className="admin-error" style={{ marginBottom: '1rem' }}>{teqError}</div>}

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

      {/* TeqMobility bill reconciliation — appears only after a file is uploaded.
          Read-only: compares the invoice's days to your coverage days on screen. */}
      {teq && (
        <div style={{ margin: '0 0 1.5rem' }}>
          <h2 style={{ fontSize: '1.05rem', margin: '0 0 2px', color: '#fff' }}>
            🧾 TeqMobility Bill reconciliation
          </h2>
          <div style={{ color: '#9aa1ac', fontSize: '0.82rem', margin: '0 0 12px' }}>
            {teqFile ? <>Uploaded: <strong style={{ color: '#cbd2da' }}>{teqFile}</strong> · </> : null}
            matched by driver &amp; vehicle ·{' '}
            <span style={{ color: '#10b981', fontWeight: 700 }}>{teq.counts.match} match</span> ·{' '}
            <span style={{ color: '#3aa0ff', fontWeight: 700 }}>{teq.counts.ahead} ahead</span> ·{' '}
            <span style={{ color: '#f87171', fontWeight: 700 }}>{teq.counts.short} short</span>
            {teq.counts.missing ? <> · <span style={{ color: '#fbbf24', fontWeight: 700 }}>{teq.counts.missing} not on bill</span></> : null}
          </div>

          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Reservation</th>
                  <th>Vehicle</th>
                  <th>Driver</th>
                  <th style={{ textAlign: 'center' }}>Your days</th>
                  <th style={{ textAlign: 'center' }}>TeqMobility days</th>
                  <th style={{ textAlign: 'center' }}>Result</th>
                </tr>
              </thead>
              <tbody>
                {teq.recon.map((r) => {
                  const st = STATUS_STYLE[r.status] || STATUS_STYLE.match;
                  const label = r.status === 'ahead' ? `${st.label} +${r.diff}`
                    : r.status === 'short' ? `${st.label} ${Math.abs(r.diff)}`
                      : st.label;
                  return (
                    <tr key={r.id} style={r.status === 'short' ? { background: 'rgba(239,68,68,.06)' } : undefined}>
                      <td><strong>{r.reservationId}</strong></td>
                      <td>{r.vehicle}</td>
                      <td>{r.driver || '—'}</td>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{r.yourDays}</td>
                      <td style={{ textAlign: 'center', fontWeight: 800 }}>{r.teqDays == null ? '—' : r.teqDays}</td>
                      <td style={{ textAlign: 'center' }}>
                        <span style={{ display: 'inline-block', background: st.bg, color: st.fg, fontWeight: 800, fontSize: '0.72rem', padding: '4px 10px', borderRadius: 999, whiteSpace: 'nowrap' }}>{label}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Bottom line */}
          <div style={{ marginTop: 14, background: '#111', border: '1px solid #333', borderRadius: 12, padding: '16px 18px', display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 26, flexWrap: 'wrap' }}>
              <div><div style={{ fontSize: '0.72rem', color: '#9aa1ac', fontWeight: 700 }}>YOUR TOTAL</div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>{teq.yourTotal}</div></div>
              <div><div style={{ fontSize: '0.72rem', color: '#9aa1ac', fontWeight: 700 }}>TEQMOBILITY TOTAL</div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff' }}>{teq.teqTotal}</div></div>
              <div><div style={{ fontSize: '0.72rem', color: '#9aa1ac', fontWeight: 700 }}>NET</div><div style={{ fontSize: '1.6rem', fontWeight: 800, color: teq.net < 0 ? '#f87171' : '#10b981' }}>{teq.net === 0 ? 'even' : teq.net > 0 ? `+${teq.net} ahead` : `short ${Math.abs(teq.net)} days`}</div></div>
            </div>
            <div style={{
              background: teq.net < 0 ? 'rgba(239,68,68,.15)' : 'rgba(16,185,129,.15)',
              border: `1px solid ${teq.net < 0 ? 'rgba(239,68,68,.4)' : 'rgba(16,185,129,.4)'}`,
              color: teq.net < 0 ? '#f87171' : '#10b981', borderRadius: 10, padding: '10px 16px', fontSize: '0.85rem', fontWeight: 700, maxWidth: 460
            }}>
              {teq.net < 0
                ? <>🚩 Short <strong style={{ color: '#fff' }}>{Math.abs(teq.net)} days</strong>
                    {teq.counts.short === 1
                      ? <> — all from <strong style={{ color: '#fff' }}>{teq.recon.find((r) => r.status === 'short')?.driver}</strong>.</>
                      : <> across {teq.counts.short} {teq.counts.short === 1 ? 'trip' : 'trips'} (the red rows).</>}
                  </>
                : teq.net > 0
                  ? <>✅ You collected <strong style={{ color: '#fff' }}>{teq.net} more days</strong> than the bill — fully covered.</>
                  : <>✅ Exact match — you and TeqMobility agree on every day.</>}
            </div>
          </div>

          {teq.extra.length > 0 && (
            <div style={{ marginTop: 10, background: 'rgba(245,158,11,.1)', border: '1px solid rgba(245,158,11,.35)', borderRadius: 10, padding: '10px 14px', fontSize: '0.82rem', color: '#fbbf24' }}>
              ⚠️ On the TeqMobility bill but not in this month's tab (worth a look — different month, or a name that didn't match):{' '}
              {teq.extra.map((x, i) => <span key={x.driver}>{i > 0 ? ', ' : ''}<strong>{x.driver}</strong> ({x.days}d)</span>)}
            </div>
          )}

          <div style={{ marginTop: 8, fontSize: '0.75rem', color: '#777' }}>
            Read-only comparison — your file is never uploaded or saved, and nothing here touches a booking, payment, coverage, or toll.
          </div>
        </div>
      )}

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
