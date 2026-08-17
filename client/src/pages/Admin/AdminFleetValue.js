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
  // Self-insurance calculator (collision only) — all client-side math on assumptions.
  const [calcOpen, setCalcOpen] = useState(false);
  const [calcIn, setCalcIn] = useState({ cars: 20, days: 22, perDay: 20, ded: 3500, freq: 6, cost: 4000 });
  useEffect(() => { if (data && data.count) setCalcIn((s) => ({ ...s, cars: data.count })); }, [data]);

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

  // Self-insurance calculator: derived numbers (collision only) + card styles.
  const ocL = { fontSize: '11px', textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280', fontWeight: 700, marginBottom: '6px' };
  const ocN = { fontSize: '1.5rem', fontWeight: 800, color: '#111827', lineHeight: 1 };
  const keptMonth = calcIn.cars * calcIn.days * calcIn.perDay;
  const keptYear = keptMonth * 12;
  const claimsYear = calcIn.freq * calcIn.cost;
  const netYear = keptYear - claimsYear;
  const badMonth = keptMonth - 2 * calcIn.cost;
  const breakEven = calcIn.cost > 0 ? Math.round(keptYear / calcIn.cost) : 0;
  const reserve = Math.max(15000, calcIn.cost * 4);

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

          {/* Self-insurance calculator — button expands the client-side tool. */}
          <div style={{ marginTop: '16px' }}>
            <button className="admin-btn" onClick={() => setCalcOpen((o) => !o)} style={{ borderColor: '#10b981', color: '#065f46', background: '#ecfdf5', fontWeight: 700 }}>
              🧮 Self-Insurance Calculator {calcOpen ? '▾' : '▸'}
            </button>
          </div>
          {calcOpen && (
            <div style={{ ...card, padding: '22px 24px', marginTop: '12px' }}>
              <h3 style={{ margin: '0 0 2px', fontSize: '1.15rem', color: '#111827' }}>Self-Insurance Calculator</h3>
              <p style={{ color: '#6b7280', fontSize: '13px', margin: '0 0 18px' }}>Collision only — liability stays insured. Pre-loaded from your fleet; adjust to test scenarios.</p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '26px' }}>
                <div>
                  {[
                    { key: 'cars', label: 'Active cars', min: 1, max: 200, step: 1, fmt: (v) => v },
                    { key: 'days', label: 'Days rented / month (per car)', min: 1, max: 30, step: 1, fmt: (v) => v },
                    { key: 'perDay', label: '$ kept per rental-day', min: 1, max: 40, step: 1, fmt: (v) => `$${v}` },
                    { key: 'ded', label: 'Host deductible', min: 0, max: 7500, step: 250, fmt: (v) => formatCurrency(v) },
                    { key: 'freq', label: 'Claims / year (over deductible)', min: 0, max: 40, step: 1, fmt: (v) => v },
                    { key: 'cost', label: 'Avg cost to you per claim', min: 1000, max: 15000, step: 250, fmt: (v) => formatCurrency(v) }
                  ].map((s) => (
                    <div key={s.key} style={{ marginBottom: '14px' }}>
                      <label style={{ display: 'block', fontSize: '12px', textTransform: 'uppercase', letterSpacing: '.04em', color: '#6b7280', fontWeight: 700, marginBottom: '5px' }}>{s.label}</label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <input type="range" min={s.min} max={s.max} step={s.step} value={calcIn[s.key]} onChange={(e) => setCalcIn((st) => ({ ...st, [s.key]: Number(e.target.value) }))} style={{ flex: 1, accentColor: '#10b981' }} />
                        <span style={{ minWidth: '72px', textAlign: 'right', fontWeight: 700, fontSize: '14px' }}>{s.fmt(calcIn[s.key])}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div style={{ gridColumn: '1 / -1', background: '#0b1220', borderRadius: '12px', padding: '14px 16px' }}>
                      <div style={{ ...ocL, color: '#93c5a9' }}>Net profit / year</div>
                      <div style={{ fontSize: '1.6rem', fontWeight: 800, color: '#fff', lineHeight: 1 }}>{formatCurrency(netYear)}</div>
                    </div>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}><div style={ocL}>Premium kept / year</div><div style={{ ...ocN, color: '#065f46' }}>{formatCurrency(keptYear)}</div></div>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}><div style={ocL}>Claims cost / year</div><div style={{ ...ocN, color: '#b45309' }}>{formatCurrency(claimsYear)}</div></div>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}><div style={ocL}>Worst single month</div><div style={ocN}>{badMonth >= 0 ? '+' : '−'}{formatCurrency(Math.abs(badMonth))}</div></div>
                    <div style={{ border: '1px solid #e5e7eb', borderRadius: '12px', padding: '14px 16px' }}><div style={ocL}>Break-even claims/yr</div><div style={ocN}>{breakEven}</div></div>
                  </div>
                  <div style={{ marginTop: '16px', padding: '12px 16px', borderRadius: '10px', fontSize: '13.5px', fontWeight: 600, ...(netYear > 50000 ? { background: '#ecfdf5', color: '#065f46' } : netYear > 0 ? { background: '#fffbeb', color: '#92400e' } : { background: '#fef2f2', color: '#b91c1c' }) }}>
                    {netYear > 50000 ? 'Strong: profitable well beyond any realistic claim rate.' : netYear > 0 ? 'Positive, but thinner — watch your claim rate and hold a solid reserve.' : 'Losing money at this claim rate — self-insurance not worth it here.'}
                  </div>
                  <p style={{ fontSize: '12px', color: '#6b7280', marginTop: '14px', lineHeight: 1.6 }}>
                    Suggested reserve: <b>~{formatCurrency(reserve)}</b> to absorb a bad cluster of claims. Liability stays with your carrier — this is collision only. Estimates only, not financial advice.
                  </p>
                </div>
              </div>
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
