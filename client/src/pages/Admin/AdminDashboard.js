import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';

const StatCard = ({ label, value, sublabel }) => (
  <div className="admin-stat-card">
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    {sublabel && <div className="sublabel">{sublabel}</div>}
  </div>
);

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
            <StatCard label="Total" value={stats.bookings.total} />
            <StatCard label="Today" value={stats.bookings.today} />
            <StatCard label="This Week" value={stats.bookings.thisWeek} />
            <StatCard label="This Month" value={stats.bookings.thisMonth} />
            <StatCard label="Currently Active" value={stats.bookings.active} sublabel="In progress now" />
          </div>

          <h3 style={{ margin: '1.5rem 0 0.75rem', color: '#374151' }}>Revenue</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Booked" value={formatCurrency(stats.revenue.total)} sublabel="All paid bookings" />
            <StatCard label="Platform Revenue" value={formatCurrency(stats.revenue.platform)} sublabel="Fees collected" />
          </div>

          <h3 style={{ margin: '1.5rem 0 0.75rem', color: '#374151' }}>Users & Fleet</h3>
          <div className="admin-stats-grid">
            <StatCard label="Total Users" value={stats.users.total} />
            <StatCard label="Drivers" value={stats.users.drivers} />
            <StatCard label="Hosts" value={stats.users.hosts} />
            <StatCard label="Vehicles" value={stats.vehicles.total} sublabel={`${stats.vehicles.active} active`} />
          </div>
        </>
      )}
    </AdminLayout>
  );
};

export default AdminDashboard;
