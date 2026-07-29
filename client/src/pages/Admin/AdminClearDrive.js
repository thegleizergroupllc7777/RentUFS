import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

// Owner-only SANDBOX test page for the ClearDrive driver-verification integration.
// It only calls the isolated /admin/cleardrive/* test endpoints — no booking, no
// payment, no real customer. Purely a place to confirm the connection works
// before ClearDrive is ever wired into the live booking flow.
const AdminClearDrive = () => {
  const { user: me } = useAuth();
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [starting, setStarting] = useState(false);
  const [checking, setChecking] = useState(false);
  const [test, setTest] = useState(null);      // { url, external_id }
  const [result, setResult] = useState(null);  // { status }
  const [error, setError] = useState('');
  const [flow, setFlow] = useState('PERSONAL'); // which verification flow to test; Personal finishes in sandbox (no gig login)
  const [masterEnabled, setMasterEnabled] = useState(null); // ONE master switch: two options + verification together
  const [masterSaving, setMasterSaving] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await axios.get('/api/admin/cleardrive/status');
      setStatus(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load status');
    } finally { setLoading(false); }
  }, []);

  const loadMaster = useCallback(async () => {
    try {
      const [v, t] = await Promise.all([
        axios.get('/api/admin/cleardrive-verification-setting'),
        axios.get('/api/admin/two-option-insurance-setting')
      ]);
      // Master is ON only when BOTH are on. The master toggle always sets them
      // together, so they stay in sync.
      setMasterEnabled(!!v.data.enabled && !!t.data.enabled);
    } catch (err) { /* non-blocking */ }
  }, []);

  useEffect(() => { if (me) { loadStatus(); loadMaster(); } }, [me, loadStatus, loadMaster]);

  const toggleMaster = async () => {
    const next = !masterEnabled;
    if (next && !window.confirm('Turn ON RentUFS Driver Vetting + Trip Protection?\n\nThis ONE switch does two things together:\n  1. Renters see BOTH Carshare and RideShare at checkout (Carshare = PERSONAL, RideShare = RIDESHARE, both $33).\n  2. Drivers must pass ClearDrive verification before they can book.\n\nActive/current reservations are NOT affected. Booking, payment, and tolls are untouched.\n\nFlip OFF anytime to instantly return to the single RideShare option with no verification — exactly like today.')) return;
    setMasterSaving(true);
    try {
      await Promise.all([
        axios.put('/api/admin/cleardrive-verification-setting', { enabled: next }),
        axios.put('/api/admin/two-option-insurance-setting', { enabled: next })
      ]);
      setMasterEnabled(next);
    } catch (err) {
      alert(err.response?.data?.message || 'Failed to update setting');
      loadMaster();
    } finally { setMasterSaving(false); }
  };

  const runTest = async () => {
    setStarting(true); setError(''); setResult(null); setTest(null);
    try {
      const { data } = await axios.post('/api/admin/cleardrive/test-start', { flow });
      setTest({ url: data.url, external_id: data.external_id });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not start test');
    } finally { setStarting(false); }
  };

  const checkResult = async () => {
    if (!test?.external_id) return;
    setChecking(true); setError('');
    try {
      const { data } = await axios.get('/api/admin/cleardrive/test-result', { params: { external_id: test.external_id } });
      setResult({ status: data.status });
    } catch (err) {
      setError(err.response?.data?.message || 'Could not check result');
    } finally { setChecking(false); }
  };

  const card = { background: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: '20px 22px', marginBottom: 18, maxWidth: 720 };
  const btn = { background: '#10b981', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 18px', fontWeight: 700, cursor: 'pointer' };

  return (
    <AdminLayout title="ClearDrive (Test)" subtitle="Sandbox-only test tool for driver verification — no bookings, no payments." onRefresh={loadStatus}>
      {!me?.isSuperAdmin ? (
        <div style={card}>Owner access required.</div>
      ) : (
        <>
          {error && <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', color: '#991b1b' }}>{error}</div>}

          {/* Status */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>Connection status</h3>
            {loading ? <p>Checking…</p> : status ? (
              <>
                <p style={{ margin: '6px 0' }}>
                  API key: {status.configured
                    ? <strong style={{ color: '#059669' }}>✅ Set — ready to test</strong>
                    : <strong style={{ color: '#b45309' }}>⚠️ Not set yet</strong>}
                </p>
                <p style={{ margin: '6px 0', color: '#6b7280', fontSize: '0.85rem' }}>Environment: {status.baseUrl}</p>
                <p style={{ margin: '6px 0', color: '#6b7280', fontSize: '0.85rem' }}>Flow: {status.flow}</p>
                {!status.configured && (
                  <div style={{ marginTop: 12, background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '12px 14px', fontSize: '0.9rem', color: '#92400e' }}>
                    To test, add an environment variable named <strong>CLEARDRIVE_API_KEY</strong> on Render (paste your sandbox key as the value), then redeploy and refresh this page. Your other keys are not affected.
                  </div>
                )}
              </>
            ) : <p>—</p>}
          </div>

          {/* ONE master switch — controls both the two options AND verification */}
          <div style={{ ...card, borderColor: masterEnabled ? '#a7f3d0' : '#e5e7eb' }}>
            <h3 style={{ marginTop: 0 }}>Master switch — Driver Vetting + Trip Protection</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>
              <strong>ON</strong> does two things together: (1) renters see BOTH <strong>Carshare</strong> and <strong>RideShare</strong> at checkout (Carshare → PERSONAL, RideShare → RIDESHARE, both $33), and (2) drivers must pass <strong>ClearDrive verification</strong> before they can book. <strong>OFF</strong> = single RideShare option + no verification — exactly like today. This is your kill switch: flip OFF anytime to instantly revert. Active reservations, booking, payment, and tolls are never affected.
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ fontWeight: 700, color: masterEnabled ? '#059669' : '#b45309' }}>
                {masterEnabled == null ? 'Loading…' : masterEnabled ? '🟢 ON — two options + verification' : '⚪ OFF — single option, no verification (today)'}
              </span>
              <button
                style={{ ...btn, background: masterEnabled ? '#dc2626' : '#10b981', opacity: (masterSaving || masterEnabled == null) ? 0.6 : 1 }}
                onClick={toggleMaster}
                disabled={masterSaving || masterEnabled == null}
              >
                {masterSaving ? 'Saving…' : masterEnabled ? 'Switch OFF' : 'Switch ON'}
              </button>
            </div>
          </div>

          {/* Run test */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>1. Run a test verification</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Creates a throwaway test driver and generates the verification link. No booking or payment is involved.</p>
            <div style={{ marginBottom: 14 }}>
              <label style={{ display: 'block', fontWeight: 600, fontSize: '0.9rem', marginBottom: 6 }}>Test flow:</label>
              <select value={flow} onChange={(e) => setFlow(e.target.value)} style={{ padding: '9px 12px', borderRadius: 8, border: '1px solid #d1d5db', fontSize: '0.95rem', minWidth: 240 }}>
                <option value="PERSONAL">Personal — license + selfie (finishes in sandbox)</option>
                <option value="RIDESHARE">Ride Share — also connects a gig account (Uber/Lyft)</option>
              </select>
              {flow === 'RIDESHARE' && (
                <p style={{ margin: '8px 0 0', fontSize: '0.8rem', color: '#b45309' }}>
                  Note: Ride Share asks you to connect a real Uber/Lyft account, which can't be completed in the sandbox. Use Personal to see a full pass.
                </p>
              )}
            </div>
            <button style={{ ...btn, opacity: (status?.configured && !starting) ? 1 : 0.5 }} onClick={runTest} disabled={!status?.configured || starting}>
              {starting ? 'Starting…' : '▶ Run Test Verification'}
            </button>
            {test?.url && (
              <div style={{ marginTop: 14 }}>
                <p style={{ margin: '0 0 8px', fontWeight: 600 }}>✅ Verification link created — open it to try the license + selfie flow:</p>
                <a href={test.url} target="_blank" rel="noopener noreferrer" style={{ ...btn, display: 'inline-block', textDecoration: 'none', background: '#2563eb' }}>Open Verification Screen ↗</a>
              </div>
            )}
          </div>

          {/* Check result */}
          {test?.url && (
            <div style={card}>
              <h3 style={{ marginTop: 0 }}>2. Check the result</h3>
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>After you complete (or start) the verification in that screen, check the result here.</p>
              <button style={{ ...btn, background: '#111827', opacity: checking ? 0.6 : 1 }} onClick={checkResult} disabled={checking}>
                {checking ? 'Checking…' : '↻ Check Result'}
              </button>
              {result && (
                <p style={{ marginTop: 12, fontSize: '1.1rem' }}>
                  Status: <strong style={{ color: result.status === 'PASSED' ? '#059669' : result.status === 'FAILED' ? '#dc2626' : '#b45309' }}>{result.status}</strong>
                </p>
              )}
            </div>
          )}
        </>
      )}
    </AdminLayout>
  );
};

export default AdminClearDrive;
