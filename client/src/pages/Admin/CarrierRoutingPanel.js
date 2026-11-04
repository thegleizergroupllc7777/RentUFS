import React, { useEffect, useState, useCallback } from 'react';
import axios from '../../config/axios';

// Owner-only control for which insurance carrier (TeqMobility or Rentid/Vishal)
// insures a rental, by state. Lives on the Insurance admin page. Default is OFF
// — everything stays on TeqMobility (today's behavior). Collapsed by default so
// it doesn't clutter the reconciliation view.

const card = { background: '#111', border: '1px solid #333', borderRadius: 12, padding: '16px 18px', margin: '0 0 1.25rem' };
const label = { fontSize: '0.72rem', color: '#9aa1ac', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 };
const input = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #3a3a3a', background: '#1a1a1a', color: '#eee', fontSize: '0.9rem', boxSizing: 'border-box' };
const btn = (primary) => ({ padding: '8px 16px', borderRadius: 8, border: primary ? 'none' : '1px solid #3a3a3a', background: primary ? '#10b981' : '#1a1a1a', color: primary ? '#04210f' : '#ddd', fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer' });

const parseStates = (str) =>
  String(str || '').split(/[\s,]+/).map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z]{2}$/.test(s));

export default function CarrierRoutingPanel() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [enabled, setEnabled] = useState(false);
  const [mode, setMode] = useState('split');
  const [teqStatesStr, setTeqStatesStr] = useState('');
  const [vishalStatesStr, setVishalStatesStr] = useState('');
  const [vishalPlanId, setVishalPlanId] = useState('');
  const [rentidConfigured, setRentidConfigured] = useState(false);

  const [plans, setPlans] = useState(null); // null = not tested yet
  const [testing, setTesting] = useState(false);
  const [coverageTest, setCoverageTest] = useState(null);
  const [runningTest, setRunningTest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const { data } = await axios.get('/api/admin/carrier-routing');
      const s = data.settings || {};
      setEnabled(!!s.enabled);
      setMode(s.mode === 'all_vishal' ? 'all_vishal' : 'split');
      setTeqStatesStr((s.teqStates || []).join(', '));
      setVishalStatesStr((s.vishalStates || []).join(', '));
      setVishalPlanId(s.vishalPlanId || '');
      setRentidConfigured(!!data.rentidConfigured);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to load carrier settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setSaving(true); setErr(''); setMsg('');
    try {
      const payload = {
        enabled,
        mode,
        teqStates: parseStates(teqStatesStr),
        vishalStates: parseStates(vishalStatesStr),
        vishalPlanId: vishalPlanId || null
      };
      const { data } = await axios.put('/api/admin/carrier-routing', payload);
      const s = data.settings || {};
      setTeqStatesStr((s.teqStates || []).join(', '));
      setVishalStatesStr((s.vishalStates || []).join(', '));
      setMsg('Saved. Applies to NEW coverage only — active policies are untouched.');
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const testConnection = async () => {
    setTesting(true); setErr(''); setMsg('');
    try {
      const { data } = await axios.get('/api/admin/rentid/plans');
      if (!data.configured) { setErr('Rentid is not configured yet (RENTID_API_KEY not set on the server).'); setPlans([]); return; }
      if (data.ok === false) { setErr('Rentid connection failed: ' + (data.error || 'unknown')); setPlans([]); return; }
      setPlans(data.plans || []);
      setMsg(`✓ Connected to Rentid — ${data.plans?.length || 0} plan(s) available.`);
    } catch (e) {
      setErr(e.response?.data?.message || 'Connection test failed');
    } finally {
      setTesting(false);
    }
  };

  const syncStates = async () => {
    if (!vishalPlanId) { setErr('Pick a plan first.'); return; }
    setErr(''); setMsg('');
    try {
      const { data } = await axios.post('/api/admin/carrier-routing/sync-vishal-states', { planId: vishalPlanId });
      setVishalStatesStr((data.settings?.vishalStates || []).join(', '));
      setMsg(`✓ Pulled Vishal's covered states: ${(data.settings?.vishalStates || []).join(', ') || '(none)'}`);
    } catch (e) {
      setErr(e.response?.data?.message || 'Failed to sync states');
    }
  };

  const runCoverageTest = async () => {
    if (!vishalPlanId) { setErr('Pick a plan first.'); return; }
    setRunningTest(true); setErr(''); setMsg(''); setCoverageTest(null);
    try {
      const { data } = await axios.post('/api/admin/rentid/test-coverage', { planId: vishalPlanId });
      setCoverageTest(data);
    } catch (e) {
      setErr(e.response?.data?.message || 'Coverage test failed');
    } finally {
      setRunningTest(false);
    }
  };

  const statusChip = !enabled
    ? { text: 'OFF · all TeqMobility (today)', color: '#9aa1ac', bg: '#1a1a1a' }
    : mode === 'all_vishal'
      ? { text: 'ON · All Vishal', color: '#04210f', bg: '#10b981' }
      : { text: 'ON · Split', color: '#04210f', bg: '#10b981' };

  return (
    <div style={card}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, cursor: 'pointer' }} onClick={() => setOpen((o) => !o)}>
        <div style={{ fontWeight: 800, color: '#fff', fontSize: '1rem' }}>🛡️ Insurance Carrier Routing</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '4px 10px', borderRadius: 999, color: statusChip.color, background: statusChip.bg }}>{statusChip.text}</span>
          <span style={{ color: '#9aa1ac' }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      {open && (
        <div style={{ marginTop: 14, borderTop: '1px solid #262626', paddingTop: 14 }}>
          {err && <div className="admin-error" style={{ marginBottom: 10 }}>{err}</div>}
          {msg && <div style={{ background: 'rgba(16,185,129,.12)', border: '1px solid rgba(16,185,129,.35)', color: '#34d399', borderRadius: 8, padding: '8px 12px', fontSize: '0.82rem', marginBottom: 10 }}>{msg}</div>}
          {loading && <div style={{ color: '#9aa1ac' }}>Loading…</div>}

          {/* Master switch */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ color: '#eee', fontWeight: 700 }}>Carrier routing</div>
              <div style={{ color: '#888', fontSize: '0.8rem' }}>OFF = everything on TeqMobility (exactly like today). This is the safe default.</div>
            </div>
            <button style={btn(enabled)} onClick={() => setEnabled((v) => !v)}>{enabled ? 'ON' : 'OFF'}</button>
          </div>

          {enabled && (
            <>
              {/* Mode */}
              <div style={{ marginBottom: 14 }}>
                <div style={label}>Mode</div>
                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <button style={btn(mode === 'split')} onClick={() => setMode('split')}>Split (both coexist)</button>
                  <button style={btn(mode === 'all_vishal')} onClick={() => setMode('all_vishal')}>All Vishal</button>
                </div>
                <div style={{ color: '#888', fontSize: '0.8rem', marginTop: 6 }}>
                  {mode === 'split'
                    ? 'TeqMobility keeps its states; Vishal only takes new states it covers. Overlap stays TeqMobility.'
                    : 'Vishal wherever it covers; states Vishal doesn’t cover fall back to TeqMobility (never blocked).'}
                </div>
              </div>

              {/* Rentid connection + plan */}
              <div style={{ marginBottom: 14, background: '#0d1522', border: '1px solid #243049', borderRadius: 10, padding: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                  <div style={{ color: '#cfe0ff', fontWeight: 700, fontSize: '0.9rem' }}>Rentid (Vishal) connection</div>
                  <button style={btn(false)} onClick={testConnection} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button>
                </div>
                <div style={{ color: rentidConfigured ? '#34d399' : '#f59e0b', fontSize: '0.8rem', marginBottom: 8 }}>
                  {rentidConfigured ? '✓ API key is set on the server.' : '⚠ API key not set yet (RENTID_API_KEY). Sandbox testing needs it.'}
                </div>
                {Array.isArray(plans) && plans.length > 0 && (
                  <div>
                    <div style={label}>Plan</div>
                    <select style={input} value={vishalPlanId} onChange={(e) => setVishalPlanId(e.target.value)}>
                      <option value="">— pick a plan —</option>
                      {plans.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.id.slice(0, 10)}…) — covers {p.coverage_areas.join(', ') || 'none'}</option>
                      ))}
                    </select>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                      <button style={btn(false)} onClick={syncStates} disabled={!vishalPlanId}>Pull Vishal’s covered states →</button>
                      <button style={btn(false)} onClick={runCoverageTest} disabled={!vishalPlanId || runningTest}>{runningTest ? 'Testing…' : '🧪 Run sandbox coverage test'}</button>
                    </div>
                    {coverageTest && (
                      <div style={{ marginTop: 10, background: '#0a0f0a', border: `1px solid ${coverageTest.ok ? '#1f6f45' : '#6f1f1f'}`, borderRadius: 8, padding: 10 }}>
                        <div style={{ fontWeight: 700, color: coverageTest.ok ? '#34d399' : '#f87171', marginBottom: 6, fontSize: '0.85rem' }}>
                          {coverageTest.ok ? '✓ Sandbox coverage test passed' : '✗ Sandbox coverage test had an issue'} {coverageTest.state ? `(${coverageTest.state})` : ''}
                        </div>
                        {(coverageTest.steps || []).map((s, i) => (
                          <div key={i} style={{ fontSize: '0.8rem', color: s.ok ? '#9fdfbf' : '#f0a0a0', padding: '2px 0' }}>
                            {s.ok ? '✓' : '✗'} {s.step} <span style={{ color: '#666' }}>— {s.detail}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* State lists */}
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ flex: '1 1 240px' }}>
                  <div style={label}>TeqMobility states</div>
                  <input style={input} value={teqStatesStr} onChange={(e) => setTeqStatesStr(e.target.value)} placeholder="e.g. CA, NY, NJ" />
                  <div style={{ color: '#666', fontSize: '0.72rem', marginTop: 4 }}>2-letter codes, comma-separated.</div>
                </div>
                <div style={{ flex: '1 1 240px' }}>
                  <div style={label}>Vishal states</div>
                  <input style={input} value={vishalStatesStr} onChange={(e) => setVishalStatesStr(e.target.value)} placeholder="e.g. GA, TX, FL" />
                  <div style={{ color: '#666', fontSize: '0.72rem', marginTop: 4 }}>Use “Pull Vishal’s covered states” above to fill from Rentid.</div>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button style={btn(true)} onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
            <span style={{ color: '#666', fontSize: '0.78rem' }}>Changes apply to NEW coverage only — active policies keep their carrier until the trip ends.</span>
          </div>
        </div>
      )}
    </div>
  );
}
