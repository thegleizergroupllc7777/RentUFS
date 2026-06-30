import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';

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

const AdminDashboard = () => {
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
      {loading && <div className="admin-empty">Loading...</div>}
      {stats && (
        <>
          <h3 style={{ marginBottom: '0.75rem', color: '#374151' }}>Bookings</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total" value={stats.bookings.total} to="/admin/bookings" />
            <StatCard label="Today" value={stats.bookings.today} to="/admin/bookings" />
            <StatCard label="This Week" value={stats.bookings.thisWeek} to="/admin/bookings" />
            <StatCard label="This Month" value={stats.bookings.thisMonth} to="/admin/bookings" />
            <StatCard label="Currently Active" value={stats.bookings.active} sublabel="In progress now" to="/admin/bookings" />
          </div>

          <h3 style={{ margin: '1.5rem 0 0.75rem', color: '#374151' }}>Revenue</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Booked" value={formatCurrency(stats.revenue.total)} sublabel="All paid bookings" />
            <StatCard label="Platform Revenue" value={formatCurrency(stats.revenue.platform)} sublabel="Fees collected" />
          </div>

          <h3 style={{ margin: '1.5rem 0 0.75rem', color: '#374151' }}>Users & Fleet</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Users" value={stats.users.total} to="/admin/users" />
            <StatCard label="Drivers" value={stats.users.drivers} to="/admin/users" />
            <StatCard label="Hosts" value={stats.users.hosts} to="/admin/users" />
            <StatCard label="Vehicles" value={stats.vehicles.total} sublabel={`${stats.vehicles.active} active`} to="/admin/vehicles" />
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;
