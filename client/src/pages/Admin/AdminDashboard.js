import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

// A stat card. If `to` is provided, clicking it navigates to that admin tab
// (with a hover lift so it reads as clickable). Cards without `to` stay static.
const StatCard = ({ label, value, sublabel, to }) => {
  const navigate = useNavigate();
  const [hover, setHover] = useState(false);
  const clickable = !!to;
  return (
    <div
      className="admin-stat-card"
      onClick={clickable ? () => navigate(to) : undefined}
      onMouseEnter={clickable ? () => setHover(true) : undefined}
      onMouseLeave={clickable ? () => setHover(false) : undefined}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onKeyDown={clickable ? (e) => { if (e.key === 'Enter') navigate(to); } : undefined}
      title={clickable ? 'View details' : undefined}
      style={clickable ? {
        cursor: 'pointer',
        transition: 'box-shadow 0.12s ease, transform 0.12s ease',
        transform: hover ? 'translateY(-1px)' : 'none',
        // Green outline ring on hover (matches the platform green). Uses box-shadow
        // so there's no layout shift, and the ring sits just outside the card edge.
        boxShadow: hover ? '0 0 0 2px #10b981, 0 4px 14px rgba(16,185,129,0.25)' : undefined
      } : undefined}
    >
      <div className="label">{label}</div>
      <div className="value">{value}</div>
      {sublabel && <div className="sublabel">{sublabel}</div>}
    </div>
  );
};

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n || 0);

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

const AdminDashboard = () => {
  const { user: me } = useAuth();
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/admin/stats');
      setStats(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <AdminLayout title="Admin Dashboard" subtitle="Overview of platform activity" onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}
      {me?.isSuperAdmin && <LateFeeToggle />}
      {loading && <div className="admin-empty">Loading...</div>}
      {stats && (
        <>
          <h3 style={{ marginBottom: '0.75rem', color: '#374151' }}>Bookings</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total" value={stats.bookings.total} to="/admin/bookings" />
            <StatCard label="Today" value={stats.bookings.today} to="/admin/bookings" />
            <StatCard label="This Week" value={stats.bookings.thisWeek} to="/admin/bookings" />
            <StatCard label="This Month" value={stats.bookings.thisMonth} to="/admin/bookings" />
            <StatCard label="Currently Active" value={stats.bookings.active} sublabel="In progress now" to="/admin/bookings?status=active" />
          </div>

          <h3 style={{ margin: '1.5rem 0 0.75rem', color: '#374151' }}>Revenue</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Booked" value={formatCurrency(stats.revenue.total)} sublabel="All paid bookings" />
            <StatCard label="Platform Revenue" value={formatCurrency(stats.revenue.platform)} sublabel="Fees collected" />
          </div>

          <h3 style={{ margin: '1.5rem 0 0.75rem', color: '#374151' }}>Users & Fleet</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Users" value={stats.users.total} to="/admin/users" />
            <StatCard label="Drivers" value={stats.users.drivers} to="/admin/users?type=driver" />
            <StatCard label="Hosts" value={stats.users.hosts} to="/admin/users?type=host" />
            <StatCard label="Vehicles" value={stats.vehicles.total} sublabel={`${stats.vehicles.active} active`} to="/admin/vehicles" />
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;
