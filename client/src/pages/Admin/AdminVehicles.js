import React, { useCallback, useEffect, useState } from 'react';
import axios from '../../config/axios';
import AdminLayout from './AdminLayout';

const formatDate = (d) => (d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—');
const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

const AdminVehicles = () => {
  const [vehicles, setVehicles] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [editVehicle, setEditVehicle] = useState(null);
  const limit = 25;

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get('/api/admin/vehicles', {
        params: { search, availability, page, limit }
      });
      setVehicles(data.vehicles);
      setTotal(data.total);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to load vehicles');
    } finally {
      setLoading(false);
    }
  }, [search, availability, page]);

  useEffect(() => {
    load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / limit));

  const toggleAvailability = async (vehicle) => {
    setError('');
    try {
      await axios.patch(`/api/admin/vehicles/${vehicle._id}`, { availability: !vehicle.availability });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update');
    }
  };

  return (
    <AdminLayout title="Vehicles" subtitle="All listings on the platform">
      {error && <div className="admin-error">{error}</div>}

      <div className="admin-toolbar">
        <input
          type="search"
          placeholder="Search by make, model, or location..."
          value={search}
          onChange={(e) => { setPage(1); setSearch(e.target.value); }}
        />
        <select value={availability} onChange={(e) => { setPage(1); setAvailability(e.target.value); }}>
          <option value="">All vehicles</option>
          <option value="true">Available only</option>
          <option value="false">Hidden only</option>
        </select>
        <button className="admin-btn" onClick={load} disabled={loading}>{loading ? 'Loading...' : 'Refresh'}</button>
      </div>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <thead>
            <tr>
              <th>Vehicle</th>
              <th>Host</th>
              <th>Location</th>
              <th>Pricing</th>
              <th>Available</th>
              <th>Listed</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {vehicles.length === 0 && !loading && (
              <tr><td colSpan="7"><div className="admin-empty">No vehicles found.</div></td></tr>
            )}
            {vehicles.map((v) => (
              <tr key={v._id}>
                <td>
                  <strong>{v.year} {v.make} {v.model}</strong>
                  <div className="muted">{v.type} · {v.seats} seats</div>
                </td>
                <td>
                  {v.host ? `${v.host.firstName} ${v.host.lastName}` : '—'}
                  <div className="muted">{v.host?.email}</div>
                </td>
                <td>
                  {v.location?.city}{v.location?.state ? `, ${v.location.state}` : ''}
                </td>
                <td>
                  {formatCurrency(v.pricePerDay)}/day
                  {v.pricePerWeek ? <div className="muted">{formatCurrency(v.pricePerWeek)}/wk</div> : null}
                </td>
                <td>
                  <span className={`badge ${v.availability ? 'active-acct' : 'deactivated'}`}>
                    {v.availability ? 'yes' : 'no'}
                  </span>
                </td>
                <td>{formatDate(v.createdAt)}</td>
                <td>
                  <button className="admin-btn" onClick={() => setEditVehicle(v)}>Edit</button>
                  <button className="admin-btn" onClick={() => toggleAvailability(v)}>
                    {v.availability ? 'Hide' : 'Show'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="admin-pagination">
          <span>Showing {vehicles.length === 0 ? 0 : (page - 1) * limit + 1}-{Math.min(page * limit, total)} of {total}</span>
          <div>
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>Prev</button>
            <span style={{ margin: '0 0.5rem' }}>Page {page} of {totalPages}</span>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>Next</button>
          </div>
        </div>
      </div>

      {editVehicle && (
        <EditVehicleModal vehicle={editVehicle} onClose={() => setEditVehicle(null)} onSaved={() => { setEditVehicle(null); load(); }} />
      )}
    </AdminLayout>
  );
};

const EditVehicleModal = ({ vehicle, onClose, onSaved }) => {
  const [form, setForm] = useState({
    make: vehicle.make || '',
    model: vehicle.model || '',
    year: vehicle.year || '',
    pricePerDay: vehicle.pricePerDay || 0,
    pricePerWeek: vehicle.pricePerWeek || 0,
    pricePerMonth: vehicle.pricePerMonth || 0
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await axios.patch(`/api/admin/vehicles/${vehicle._id}`, form);
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
        <h2>Edit vehicle</h2>
        {error && <div className="admin-error">{error}</div>}
        <div className="field">
          <label>Make</label>
          <input value={form.make} onChange={(e) => setForm({ ...form, make: e.target.value })} />
        </div>
        <div className="field">
          <label>Model</label>
          <input value={form.model} onChange={(e) => setForm({ ...form, model: e.target.value })} />
        </div>
        <div className="field">
          <label>Year</label>
          <input type="number" value={form.year} onChange={(e) => setForm({ ...form, year: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Price / day</label>
          <input type="number" min="0" step="0.01" value={form.pricePerDay} onChange={(e) => setForm({ ...form, pricePerDay: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Price / week</label>
          <input type="number" min="0" step="0.01" value={form.pricePerWeek} onChange={(e) => setForm({ ...form, pricePerWeek: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label>Price / month</label>
          <input type="number" min="0" step="0.01" value={form.pricePerMonth} onChange={(e) => setForm({ ...form, pricePerMonth: Number(e.target.value) })} />
        </div>
        <div className="admin-modal-actions">
          <button className="admin-btn" onClick={onClose} disabled={busy}>Cancel</button>
          <button className="admin-btn primary" onClick={submit} disabled={busy}>{busy ? 'Saving...' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
};

export default AdminVehicles;
