import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

// Owner-only page: total collision exposure across the fleet, from the
// host-entered vehicle values. READ-ONLY — it only reads the aggregation from
// /api/admin/fleet-value; it never changes bookings, payments, or coverage.
// "Max exposure" per band = the priciest car in that band minus the $3,500 host
// deductible = the most WE would pay on a single total loss in that band.
const AdminFleetValue = () => {
  const { user: me } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [openBand, setOpenBand] = useState(null); // which band row is expanded
  const [showMissing, setShowMissing] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/admin/fleet-value');
      setData(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load fleet value');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (me?.isSuperAdmin) load();
  }, [load, me]);

  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: '14px', padding: '20px 22px' };
  const lbl = { fontSize: '12px', letterSpacing: '.04em', textTransform: 'uppercase', color: '#6b7280', margin: '0 0 8px' };
  const big = { fontSize: '1.9rem', fontWeight: 800, color: '#111827', lineHeight: 1 };
  const hint = { fontSize: '12px', color: '#6b7280', marginTop: '8px' };

  const maxBandExposure = data ? Math.max(1, ...data.bands.map((b) => b.maxExposure)) : 1;

  return (
    <AdminLayout title="Fleet Market Value" subtitle="Total collision exposure across your fleet, from host-entered vehicle values.">
      {!me?.isSuperAdmin ? (
        <div className="admin-empty">Owner access required.</div>
      ) : loading ? (
        <div className="admin-empty">Loading fleet value…</div>
      ) : error ? (
        <div className="admin-empty" style={{ color: '#b91c1c' }}>{error}</div>
      ) : !data ? null : (
        <>
          {/* Stat cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: '16px', marginBottom: '18px' }}>
            <div style={{ ...card, background: '#0b1220', border: '1px solid #0b1220' }}>
              <p style={{ ...lbl, color: '#93c5a9' }}>Total Fleet Value</p>
              <div style={{ ...big, color: '#fff' }}>{formatCurrency(data.totalValue)}</div>
              <div style={{ ...hint, color: '#9aa4b2' }}>
                {data.count} vehicle{data.count === 1 ? '' : 's'}
                {data.missingValueCount ? (
                  <> · <span onClick={() => setShowMissing((s) => !s)} style={{ cursor: 'pointer', textDecoration: 'underline', color: '#fbbf24' }}>{data.missingValueCount} missing a value {showMissing ? '▾' : '▸'}</span></>
                ) : ''}
              </div>
            </div>
            <div style={card}>
              <p style={lbl}>Average per Car</p>
              <div style={big}>{formatCurrency(data.avg)}</div>
              <div style={hint}>median {formatCurrency(data.median)}</div>
            </div>
            <div style={card}>
              <p style={lbl}>Highest</p>
              <div style={big}>{formatCurrency(data.highest?.value)}</div>
              <div style={hint}>{data.highest?.label || '—'}</div>
            </div>
            <div style={card}>
              <p style={lbl}>Lowest</p>
              <div style={big}>{formatCurrency(data.lowest?.value)}</div>
              <div style={hint}>{data.lowest?.label || '—'}</div>
            </div>
          </div>

          {/* Band breakdown */}
          <div style={{ ...card, padding: '18px 22px' }}>
            <h3 style={{ margin: '0 0 12px', fontSize: '1rem', color: '#374151' }}>Breakdown by value band</h3>
            <div className="admin-table-wrap" style={{ border: 'none', boxShadow: 'none', padding: 0 }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={thStyle}>Value band</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}># Cars</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Total value</th>
                    <th style={{ ...thStyle, textAlign: 'right' }}>Max exposure per car*</th>
                    <th style={thStyle}></th>
                  </tr>
                </thead>
                <tbody>
                  {data.bands.map((b, i) => {
                    const amber = i >= 2; // first two bands = safer/green, top two = pricier/amber
                    const barColor = amber ? '#f59e0b' : '#10b981';
                    const w = Math.round((b.maxExposure / maxBandExposure) * 160);
                    const open = openBand === i;
                    return (
                      <React.Fragment key={b.label}>
                        <tr onClick={() => b.count && setOpenBand(open ? null : i)} style={{ cursor: b.count ? 'pointer' : 'default' }}>
                          <td style={{ ...tdStyle, color: amber ? '#b45309' : '#065f46', fontWeight: 700 }}>{b.count ? (open ? '▾ ' : '▸ ') : ''}{b.label}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{b.count}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{formatCurrency(b.totalValue)}</td>
                          <td style={{ ...tdStyle, textAlign: 'right' }}>{b.count ? `up to ${formatCurrency(b.maxExposure)}` : '—'}</td>
                          <td style={tdStyle}><span style={{ display: 'inline-block', height: '8px', borderRadius: '4px', background: barColor, width: `${w}px`, verticalAlign: 'middle' }} /></td>
                        </tr>
                        {open && b.cars && b.cars.length > 0 && (
                          <tr>
                            <td colSpan={5} style={{ padding: '4px 8px 14px', background: '#f9fafb' }}>
                              <div style={b.cars.length > 8 ? { maxHeight: '340px', overflowY: 'auto' } : undefined}>
                              {b.cars.map((c, ci) => (
                                <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 6px', borderBottom: '1px solid #eef2f7', fontSize: '13.5px' }}>
                                  <span style={{ color: '#111827', fontWeight: 600 }}>{c.label}{c.odometer != null && <span style={{ color: '#9ca3af', fontSize: '11px', fontWeight: 400 }}> · {c.odometer.toLocaleString()} mi</span>}</span>
                                  <span style={{ fontWeight: 700, color: '#111827' }}>{formatCurrency(c.value)}</span>
                                </div>
                              ))}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td style={{ ...tdStyle, fontWeight: 800, borderTop: '2px solid #111827', borderBottom: 'none' }}>Total</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, borderTop: '2px solid #111827', borderBottom: 'none' }}>{data.count}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', fontWeight: 800, borderTop: '2px solid #111827', borderBottom: 'none' }}>{formatCurrency(data.totalValue)}</td>
                    <td style={{ ...tdStyle, textAlign: 'right', borderTop: '2px solid #111827', borderBottom: 'none' }}>—</td>
                    <td style={{ ...tdStyle, borderTop: '2px solid #111827', borderBottom: 'none' }}></td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '12px' }}>
              *Max exposure = the priciest car in that band − your {formatCurrency(data.deductible)} host deductible = the most YOU could pay on a single total loss.
              &nbsp;•&nbsp; <b style={{ color: '#065f46' }}>Green</b> = low exposure, safe to self-insure
              &nbsp;•&nbsp; <b style={{ color: '#b45309' }}>Amber</b> = pricier cars, maybe keep with Nick.
            </p>
          </div>

          {showMissing && data.missingCars && data.missingCars.length > 0 && (
            <div style={{ ...card, padding: '18px 22px', marginTop: '16px' }}>
              <h3 style={{ margin: '0 0 4px', fontSize: '1rem', color: '#374151' }}>Cars missing a value ({data.missingCars.length})</h3>
              <p style={{ fontSize: '12px', color: '#6b7280', margin: '0 0 12px' }}>Not counted in the totals above. Add a value to include them.</p>
              {data.missingCars.map((c, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 6px', borderBottom: '1px solid #eef2f7', fontSize: '13.5px' }}>
                  <span>{c.label} <span style={{ color: '#9ca3af', fontSize: '12px' }}>· {c.host}</span></span>
                  <span style={{ fontWeight: 700, color: c.provider === 'Wheelbase' ? '#b45309' : '#6b7280' }}>{c.provider}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
};

const thStyle = { textAlign: 'left', padding: '10px 8px', fontSize: '11px', letterSpacing: '.05em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700, borderBottom: '1px solid #e5e7eb' };
const tdStyle = { textAlign: 'left', padding: '11px 8px', fontSize: '14px', borderBottom: '1px solid #e5e7eb', color: '#111827' };

export default AdminFleetValue;
