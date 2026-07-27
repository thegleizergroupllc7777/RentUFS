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

  const loadStatus = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await axios.get('/api/admin/cleardrive/status');
      setStatus(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load status');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (me) loadStatus(); }, [me, loadStatus]);

  const runTest = async () => {
    setStarting(true); setError(''); setResult(null); setTest(null);
    try {
      const { data } = await axios.post('/api/admin/cleardrive/test-start', {});
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

          {/* Run test */}
          <div style={card}>
            <h3 style={{ marginTop: 0 }}>1. Run a test verification</h3>
            <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Creates a throwaway test driver and generates the verification link. No booking or payment is involved.</p>
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
