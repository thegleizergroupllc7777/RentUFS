import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const formatCurrency = (n) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const StatTile = ({ label, value, sublabel }) => (
  <div className="admin-stat-card">
    <div className="label">{label}</div>
    <div className="value">{value}</div>
    {sublabel && <div className="sublabel">{sublabel}</div>}
  </div>
);

const AdminUserDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [bookings, setBookings] = useState({ asDriver: [], asHost: [] });
  const [vehicles, setVehicles] = useState([]);
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [u, b, v, s] = await Promise.all([
        axios.get(`/api/admin/users/${id}`),
        axios.get(`/api/admin/users/${id}/bookings`),
        axios.get(`/api/admin/users/${id}/vehicles`),
        axios.get(`/api/admin/users/${id}/stats`)
      ]);
      setUser(u.data);
      setBookings(b.data);
      setVehicles(v.data.vehicles);
      setStats(s.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load user');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const performAction = async (endpoint) => {
    setError('');
    try {
      await axios.post(`/api/admin/users/${id}/${endpoint}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  return (
    <AdminLayout title={user ? `${user.firstName} ${user.lastName}` : 'User'} subtitle={user?.email}>
      {error && <div className="admin-error">{error}</div>}
      {loading && <div className="admin-empty">Loading...</div>}
      {user && (
        <>
          <button className="admin-btn" onClick={() => navigate('/admin/users')} style={{ marginBottom: '1rem' }}>← Back to users</button>

          {/* Profile + quick actions */}
          <div className="admin-table-wrap" style={{ marginBottom: '1.5rem' }}>
            <div style={{ padding: '1.25rem' }}>
              <h3 style={{ margin: 0, color: '#111827' }}>Profile</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
                <ProfileRow label="Phone" value={user.phone || '—'} />
                <ProfileRow label="User type" value={user.userType} />
                <ProfileRow label="Role" value={<span className={`badge ${user.role}`}>{user.role}</span>} />
                <ProfileRow label="Status" value={
                  <span className={`badge ${user.accountStatus === 'active' ? 'active-acct' : 'deactivated'}`}>
                    {user.accountStatus || 'unset'}
                  </span>
                } />
                <ProfileRow label="Joined" value={formatDate(user.createdAt)} />
                <ProfileRow label="Stripe customer" value={user.stripeCustomerId ? '✓ on file' : '—'} />
              </div>
              <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                {user.accountStatus === 'active' ? (
                  <button className="admin-btn danger" onClick={() => performAction('suspend')}>Suspend account</button>
                ) : (
                  <button className="admin-btn" onClick={() => performAction('reactivate')}>Reactivate account</button>
                )}
                {user.role === 'admin' ? (
                  <button className="admin-btn" onClick={() => performAction('demote')}>Revoke admin</button>
                ) : (
                  <button className="admin-btn" onClick={() => performAction('promote')}>Make admin</button>
                )}
              </div>
            </div>
          </div>

          {/* Stats */}
          {stats && (
            <>
              <h3 style={{ color: '#374151' }}>Activity</h3>
              <div className="admin-stats-grid">
                <StatTile label="Bookings as driver" value={stats.asDriver.paidBookings} sublabel="Paid only" />
                <StatTile label="Total spent" value={formatCurrency(stats.asDriver.totalSpent)} />
                <StatTile label="Bookings as host" value={stats.asHost.paidBookings} />
                <StatTile label="Host earnings" value={formatCurrency(stats.asHost.totalEarned)} sublabel={`Gross ${formatCurrency(stats.asHost.grossBookings)}`} />
                <StatTile label="Vehicles listed" value={stats.asHost.vehicleCount} />
              </div>
            </>
          )}

          {/* Bookings as driver */}
          <h3 style={{ color: '#374151', marginTop: '1.5rem' }}>Bookings as driver ({bookings.asDriver.length})</h3>
          <BookingList bookings={bookings.asDriver} otherParty="host" navigate={navigate} />

          {/* Bookings as host */}
          <h3 style={{ color: '#374151', marginTop: '1.5rem' }}>Bookings as host ({bookings.asHost.length})</h3>
          <BookingList bookings={bookings.asHost} otherParty="driver" navigate={navigate} />

          {/* Vehicles */}
          <h3 style={{ color: '#374151', marginTop: '1.5rem' }}>Vehicles ({vehicles.length})</h3>
          <div className="admin-table-wrap">
            {vehicles.length === 0 ? (
              <div className="admin-empty">No vehicles listed.</div>
            ) : (
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Vehicle</th>
                    <th>Location</th>
                    <th>Price/day</th>
                    <th>Available</th>
                    <th>Listed</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicles.map((v) => (
                    <tr key={v._id}>
                      <td><strong>{v.year} {v.make} {v.model}</strong></td>
                      <td>{v.location?.city}{v.location?.state ? `, ${v.location.state}` : ''}</td>
                      <td>{formatCurrency(v.pricePerDay)}</td>
                      <td><span className={`badge ${v.availability ? 'active-acct' : 'deactivated'}`}>{v.availability ? 'yes' : 'no'}</span></td>
                      <td>{formatDate(v.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </AdminLayout>
  );
};

const ProfileRow = ({ label, value }) => (
  <div>
    <div style={{ color: '#6b7280', fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
    <div style={{ color: '#111827', marginTop: '0.25rem' }}>{value}</div>
  </div>
);

const BookingList = ({ bookings, otherParty, navigate }) => {
  if (bookings.length === 0) {
    return <div className="admin-table-wrap"><div className="admin-empty">No bookings.</div></div>;
  }
  return (
    <div className="admin-table-wrap">
      <table className="admin-table">
        <thead>
          <tr>
            <th>Reservation</th>
            <th>Vehicle</th>
            <th>{otherParty === 'host' ? 'Host' : 'Driver'}</th>
            <th>Dates</th>
            <th>Total</th>
            <th>Status</th>
            <th>Payment</th>
          </tr>
        </thead>
        <tbody>
          {bookings.map((b) => (
            <tr key={b._id} style={{ cursor: 'pointer' }} onClick={() => navigate(`/admin/bookings/${b._id}`)}>
              <td><strong>{b.reservationId || b._id.slice(-6)}</strong></td>
              <td>{b.vehicle ? `${b.vehicle.year} ${b.vehicle.make} ${b.vehicle.model}` : '—'}</td>
              <td>{b[otherParty] ? `${b[otherParty].firstName} ${b[otherParty].lastName}` : '—'}</td>
              <td>{formatDate(b.startDate)} → {formatDate(b.endDate)}</td>
              <td>{formatCurrency(b.totalPrice)}</td>
              <td><span className={`badge ${b.status}`}>{b.status}</span></td>
              <td><span className={`badge ${b.paymentStatus}`}>{b.paymentStatus}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default AdminUserDetail;
