import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';
import { useAuth } from '../../context/AuthContext';

const USER_TYPES = ['driver', 'host', 'both'];
const ROLES = ['user', 'admin'];

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');

// Build a one-line address for the Users list so admins can locate people by
// area without opening each profile. Uses the home address, falling back to a
// business/legal address (for business hosts). Returns '' when none on file.
const formatAddress = (u) => {
  const home = u.address || {};
  const hi = u.hostInfo || {};
  const addr = (home.street || home.city || home.state)
    ? home
    : (hi.businessAddress?.street ? hi.businessAddress
      : (hi.legalAddress?.street ? hi.legalAddress : null));
  if (!addr) return '';
  return [addr.street, addr.apt, addr.city, addr.state, addr.zipCode].filter(Boolean).join(', ');
};

// The host's business identity to show under their name, so an LLC can be
// eyeballed without opening the profile. Prefers the business/LLC name, then a
// DBA. Returns '' for hosts who never entered one (and for plain drivers).
const formatBusiness = (u) => {
  const hi = u.hostInfo || {};
  return hi.businessName || hi.dba || '';
};

const AdminUsers = () => {
  const { user: me } = useAuth();
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  // All the filters below are seeded from the URL so that when you open a
  // profile and press Back, the list comes back exactly how you left it —
  // same filter, same page — instead of resetting to "All types". This is what
  // keeps you from losing your place. (e.g. /admin/users?type=host&page=2)
  const [searchParams, setSearchParams] = useSearchParams();
  const initialType = USER_TYPES.includes(searchParams.get('type')) ? searchParams.get('type') : '';
  const initialRole = ROLES.includes(searchParams.get('role')) ? searchParams.get('role') : '';
  const initialStatus = ['active', 'deactivated'].includes(searchParams.get('status')) ? searchParams.get('status') : '';
  const [page, setPage] = useState(Math.max(1, parseInt(searchParams.get('page'), 10) || 1));
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [userType, setUserType] = useState(initialType);
  const [role, setRole] = useState(initialRole);
  const [accountStatus, setAccountStatus] = useState(initialStatus);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editUser, setEditUser] = useState(null);
  const navigate = useNavigate();
  const limit = 25;
  // Only restore the saved scroll position once per visit to this list.
  const scrollRestored = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/admin/users', {
        params: { search, userType, role, accountStatus, page, limit }
      });
      setUsers(data.users);
      setTotal(data.total);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [search, userType, role, accountStatus, page]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the web address in step with the current filters/page (quietly, with
  // `replace` so it doesn't spam the Back button). When you later press Back
  // from a profile, the browser returns to this same address and the filters
  // come right back — that's the fix for "the filter resets and I lose my spot".
  useEffect(() => {
    const params = {};
    if (search) params.search = search;
    if (userType) params.type = userType;
    if (role) params.role = role;
    if (accountStatus) params.status = accountStatus;
    if (page > 1) params.page = String(page);
    setSearchParams(params, { replace: true });
  }, [search, userType, role, accountStatus, page, setSearchParams]);

  // After the list finishes loading, scroll back to roughly where you were when
  // you clicked into a profile. Runs once per visit, then forgets, so normal
  // refreshes/pagination don't yank the page around.
  useEffect(() => {
    // Wait until the rows are actually on screen — otherwise the page is still
    // short and the scroll can't reach where you were.
    if (loading || scrollRestored.current || users.length === 0) return;
    const saved = sessionStorage.getItem('adminUsersScroll');
    if (saved != null) {
      scrollRestored.current = true;
      const y = parseInt(saved, 10) || 0;
      sessionStorage.removeItem('adminUsersScroll');
      requestAnimationFrame(() => window.scrollTo(0, y));
    }
  }, [loading, users.length]);

  // Remember how far down the list you'd scrolled, then open the profile.
  const openUser = (userId) => {
    sessionStorage.setItem('adminUsersScroll', String(window.scrollY));
    navigate(`/admin/users/${userId}`);
  };

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const performAction = async (userId, endpoint) => {
    setError('');
    const confirmMsgs = {
      demote: 'Are you sure you want to remove admin access from this user?',
      promote: 'Make this user an admin? They will get full admin access.',
      suspend: 'Suspend this account? The user will not be able to log in until reactivated.'
    };
    if (confirmMsgs[endpoint] && !window.confirm(confirmMsgs[endpoint])) return;
    try {
      await axios.post(`/api/admin/users/${userId}/${endpoint}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Action failed');
    }
  };

  return (
    <AdminLayout title="Users" subtitle="All accounts on the platform" onRefresh={load}>
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search by name, business, email, or phone..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select value={userType} onChange={(e) => { setPage(1); setUserType(e.target.value); }}>
          <option value="">All types</option>
          {USER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <select value={role} onChange={(e) => { setPage(1); setRole(e.target.value); }}>
          <option value="">All roles</option>
          {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
        <select value={accountStatus} onChange={(e) => { setPage(1); setAccountStatus(e.target.value); }}>
          <option value="">All accounts</option>
          <option value="active">active</option>
          <option value="deactivated">deactivated</option>
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Phone</th>
              <th>Type</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.length === 0 && !loading && (
              <tr><td colSpan="8"><div className="admin-empty">No users found.</div></td></tr>
            )}
            {users.map((u) => {
              const address = formatAddress(u);
              const business = formatBusiness(u);
              return (
              <tr key={u._id} style={{ cursor: 'pointer' }} onClick={(e) => {
                if (e.target.closest('button')) return;
                openUser(u._id);
              }}>
                <td>
                  <strong>{u.firstName} {u.lastName}</strong>
                  {business && (
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem', fontWeight: 600 }}>{business}</div>
                  )}
                  {address && (
                    <div style={{ fontSize: '0.78rem', color: '#6b7280', marginTop: '0.2rem' }}>{address}</div>
                  )}
                </td>
                <td>{u.email}</td>
                <td>{u.phone || '—'}</td>
                <td>{u.userType}</td>
                <td><span className={`badge ${u.role}`}>{u.role}</span></td>
                <td>
                  <span className={`badge ${u.accountStatus === 'active' ? 'active-acct' : 'deactivated'}`}>
                    {u.accountStatus}
                  </span>
                </td>
                <td>{formatDate(u.createdAt)}</td>
                <td>
                  <button className="admin-btn" onClick={() => setEditUser(u)}>Edit</button>
                  {u.accountStatus === 'active' ? (
                    <button className="admin-btn danger" onClick={() => performAction(u._id, 'suspend')}>Suspend</button>
                  ) : (
                    <button className="admin-btn" onClick={() => performAction(u._id, 'reactivate')}>Reactivate</button>
                  )}
                  {me?.isSuperAdmin && (
                    u.role === 'admin' ? (
                      <button className="admin-btn" onClick={() => performAction(u._id, 'demote')}>Demote</button>
                    ) : (
                      <button className="admin-btn" onClick={() => performAction(u._id, 'promote')}>Make admin</button>
                    )
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>

        <div className="admin-pagination">
          <span>Showing {users.length === 0 ? 0 : (page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}</span>
          <div>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <span style={{ margin: '0 0.5rem' }}>Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
      </div>

      {editUser && (
        <EditUserModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => { setEditUser(null); load(); }} />
      )}
    </AdminLayout>
  );
};

const EditUserModal = ({ user, onClose, onSaved }) => {
  const [form, setForm] = useState({
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    email: user.email || '',
    phone: user.phone || '',
    userType: user.userType || 'driver'
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await axios.patch(`/api/admin/users/${user._id}`, form);
      onSaved();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="admin-modal-backdrop" onClick={onClose}>
      <div className="admin-modal" onClick={(e) => e.stopPropagation()}>
        <h2>Edit user</h2>
        {error && <div className="admin-error">{error}</div>}
        <div className="field">
          <label>First name</label>
          <input value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </div>
        <div className="field">
          <label>Last name</label>
          <input value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </div>
        <div className="field">
          <label>Email</label>
          <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </div>
        <div className="field">
          <label>Phone</label>
          <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="field">
          <label>User type</label>
          <select value={form.userType} onChange={(e) => setForm({ ...form, userType: e.target.value })}>
            {USER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default AdminUsers;
