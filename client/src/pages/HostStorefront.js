import React, { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from '../config/axios';
import Navbar from '../components/Navbar';

const formatCurrency = (n) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

// Public host storefront — shows one host's available cars, reached via the
// host's shareable referral link (/h/:hostId). Booking happens through the
// normal vehicle detail page, so nothing about the booking flow changes. This
// is purely a filtered, shareable view of the same marketplace catalog.
const HostStorefront = () => {
  const { hostId } = useParams();
  const [host, setHost] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await axios.get(`/api/vehicles/storefront/${hostId}`);
      setHost(data.host || null);
      setVehicles(data.vehicles || []);
    } catch (err) {
      setError(err.response?.data?.message || "Could not load this host's cars.");
    } finally {
      setLoading(false);
    }
  }, [hostId]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <Navbar />
      <div className="page">
        <div className="container" style={{ maxWidth: '1100px' }}>
          <h1 className="page-title" style={{ color: '#fff' }}>
            {host?.name ? `${host.name}'s Cars` : 'Available Cars'}
          </h1>
          <p style={{ color: '#9ca3af', marginTop: '-0.5rem' }}>
            Browse and book directly. Every trip is backed by insurance and 24/7 support.
          </p>

          {error && <div className="admin-error" style={{ marginTop: '1rem' }}>{error}</div>}

          {loading ? (
            <p style={{ color: '#9ca3af' }}>Loading...</p>
          ) : vehicles.length === 0 && !error ? (
            <p style={{ color: '#9ca3af' }}>No cars available from this host right now.</p>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
                gap: '1.25rem',
                marginTop: '1.5rem'
              }}
            >
              {vehicles.map((v) => (
                <Link
                  key={v._id}
                  to={`/vehicle/${v._id}`}
                  style={{
                    textDecoration: 'none',
                    background: '#000',
                    borderRadius: '0.75rem',
                    overflow: 'hidden',
                    border: '1px solid #1f2937',
                    display: 'block'
                  }}
                >
                  <div style={{ height: '160px', background: '#111', overflow: 'hidden', position: 'relative' }}>
                    {v.rentedNow && (
                      <div style={{
                        position: 'absolute', top: '0.5rem', left: '0.5rem', zIndex: 2,
                        background: '#f59e0b', color: '#000', fontWeight: 700,
                        fontSize: '0.75rem', padding: '0.2rem 0.6rem', borderRadius: '0.4rem'
                      }}>
                        Rented
                      </div>
                    )}
                    {v.images?.[0] && (
                      <img
                        src={v.images[0]}
                        alt={`${v.year} ${v.make} ${v.model}`}
                        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      />
                    )}
                  </div>
                  <div style={{ padding: '0.9rem' }}>
                    <div style={{ color: '#fff', fontWeight: 600 }}>
                      {v.nickname || `${v.year} ${v.make} ${v.model}`}
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: '0.85rem' }}>
                      {v.year} {v.make} {v.model}
                    </div>
                    <div style={{ color: '#10b981', fontWeight: 700, marginTop: '0.4rem' }}>
                      {formatCurrency(v.pricePerDay)}/day
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default HostStorefront;
