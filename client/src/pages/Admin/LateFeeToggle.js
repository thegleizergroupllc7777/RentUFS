import React, { useEffect, useState } from 'react';
import axios from '../../config/axios';

// Owner-only kill switch for automatic late-return charging. Flips instantly
// (stored server-side); no redeploy. Turning ON asks for a confirm first.
const LateFeeToggle = () => {
  const [charging, setCharging] = useState(null); // 'on' | 'off' | null (loading)
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  useEffect(() => {
    let alive = true;
    axios.get('/api/admin/late-fee-setting')
      .then(({ data }) => { if (alive) setCharging(data.charging); })
      .catch(() => { if (alive) setErr('Could not load the switch.'); });
    return () => { alive = false; };
  }, []);

  const flip = async () => {
    const next = charging === 'on' ? 'off' : 'on';
    if (next === 'on' && !window.confirm(
      'Turn automatic late-fee charging ON?\n\nRenters on NEW reservations who return late will be charged automatically ($5/day + insurance). You can switch this back OFF at any time.'
    )) return;
    setSaving(true); setErr('');
    try {
      const { data } = await axios.put('/api/admin/late-fee-setting', { charging: next });
      setCharging(data.charging);
    } catch (e) {
      setErr(e.response?.data?.message || 'Could not update the switch.');
    } finally {
      setSaving(false);
    }
  };

  const on = charging === 'on';
  return (
    <div style={{
      border: `1px solid ${on ? '#10b981' : '#d1d5db'}`,
      background: on ? '#ecfdf5' : '#f9fafb',
      borderRadius: 12, padding: '1rem 1.25rem', margin: '0 0 1.5rem',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap'
    }}>
      <div style={{ flex: '1 1 300px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{ fontSize: '1rem', fontWeight: 700, color: '#111827' }}>Automatic Late-Fee Charging</span>
          <span style={{
            fontSize: '0.72rem', fontWeight: 800, letterSpacing: '0.5px',
            padding: '0.15rem 0.5rem', borderRadius: 6,
            background: charging === null ? '#e5e7eb' : on ? '#10b981' : '#6b7280',
            color: charging === null ? '#6b7280' : '#fff'
          }}>{charging === null ? '…' : on ? 'ON' : 'OFF'}</span>
        </div>
        <p style={{ margin: '0.35rem 0 0', fontSize: '0.85rem', color: '#6b7280' }}>
          When ON, late returns on <strong>new reservations</strong> are charged automatically ($5/day + insurance).
          When OFF, nothing is charged. This is your emergency kill switch — flip it any time.
        </p>
        {err && <p style={{ margin: '0.4rem 0 0', fontSize: '0.8rem', color: '#dc2626' }}>{err}</p>}
      </div>
      <button
        onClick={flip}
        disabled={saving || charging === null}
        style={{
          padding: '0.55rem 1.25rem', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
          cursor: saving || charging === null ? 'wait' : 'pointer',
          border: 'none', minWidth: 130,
          background: on ? '#6b7280' : '#10b981', color: '#fff', opacity: saving ? 0.6 : 1
        }}
      >
        {saving ? 'Saving…' : on ? 'Switch OFF' : 'Switch ON'}
      </button>
    </div>
  );
};

export default LateFeeToggle;
