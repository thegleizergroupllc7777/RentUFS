import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config/api';

/**
 * TollCharges - displays toll charges for a booking
 * Props:
 *   bookingId - the booking ID to fetch tolls for
 *   onClose - callback to close the modal
 */
const TollCharges = ({ bookingId, onClose }) => {
  const [charges, setCharges] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchTollCharges();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const fetchTollCharges = async () => {
    try {
      setLoading(true);
      setError('');
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/tolls/charges/${bookingId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setCharges(response.data.data || []);
      setTotal(response.data.total || 0);
    } catch (err) {
      if (err.response?.status === 503) {
        setError('Toll management is not configured');
      } else {
        setError(err.response?.data?.message || 'Failed to load toll charges');
      }
    } finally {
      setLoading(false);
    }
  };

  const totalAmount = charges.reduce((sum, c) => sum + (c.amount || 0), 0);

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, padding: '1rem'
    }}>
      <div style={{
        background: 'white', borderRadius: '1rem', padding: '1.5rem',
        maxWidth: '600px', width: '100%', maxHeight: '80vh', overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#1f2937', fontSize: '1.25rem' }}>Toll Charges</h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', fontSize: '1.5rem',
              cursor: 'pointer', color: '#6b7280', padding: '0.25rem'
            }}
          >
            &times;
          </button>
        </div>

        {loading && (
          <div style={{ textAlign: 'center', padding: '2rem', color: '#6b7280' }}>
            Loading toll charges...
          </div>
        )}

        {error && (
          <div style={{
            padding: '1rem', borderRadius: '0.5rem', background: '#fef2f2',
            color: '#991b1b', border: '1px solid #fecaca', marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        {!loading && !error && charges.length === 0 && (
          <div style={{
            textAlign: 'center', padding: '2rem', color: '#6b7280',
            background: '#f9fafb', borderRadius: '0.5rem'
          }}>
            <p style={{ fontSize: '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No toll charges found</p>
            <p style={{ fontSize: '0.85rem' }}>
              Toll charges may take up to 60 days to appear after the trip ends.
            </p>
          </div>
        )}

        {!loading && !error && charges.length > 0 && (
          <>
            {/* Summary */}
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '0.75rem 1rem', background: '#f0fdf4', borderRadius: '0.5rem',
              border: '1px solid #bbf7d0', marginBottom: '1rem'
            }}>
              <span style={{ color: '#166534', fontWeight: '600' }}>
                {total} toll{total !== 1 ? 's' : ''}
              </span>
              <span style={{ color: '#166534', fontWeight: '700', fontSize: '1.1rem' }}>
                Total: ${totalAmount.toFixed(2)}
              </span>
            </div>

            {/* Charge list */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {charges.map((charge, idx) => (
                <div key={charge.id || idx} style={{
                  padding: '0.75rem 1rem', borderRadius: '0.5rem',
                  border: '1px solid #e5e7eb', background: '#fafafa'
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ margin: 0, fontWeight: '600', color: '#1f2937', fontSize: '0.95rem' }}>
                        {charge.exit_location || charge.agency || 'Toll Charge'}
                      </p>
                      {charge.entry_location && (
                        <p style={{ margin: '0.15rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                          From: {charge.entry_location}
                        </p>
                      )}
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                        {new Date(charge.exit_time || charge.posted_time).toLocaleDateString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
                        })}
                      </p>
                      {charge.transaction_type && (
                        <span style={{
                          display: 'inline-block', marginTop: '0.25rem',
                          padding: '0.1rem 0.5rem', borderRadius: '0.25rem',
                          fontSize: '0.7rem', fontWeight: '600',
                          background: charge.transaction_type === 'VIOLATION' ? '#fef2f2' : '#f0f9ff',
                          color: charge.transaction_type === 'VIOLATION' ? '#991b1b' : '#1e40af',
                          border: `1px solid ${charge.transaction_type === 'VIOLATION' ? '#fecaca' : '#bfdbfe'}`
                        }}>
                          {charge.transaction_type}
                        </span>
                      )}
                    </div>
                    <span style={{
                      fontWeight: '700', fontSize: '1.05rem',
                      color: charge.transaction_type === 'VIOLATION' ? '#dc2626' : '#1f2937'
                    }}>
                      ${(charge.amount || 0).toFixed(2)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
          <button
            onClick={onClose}
            style={{
              padding: '0.5rem 1.5rem', borderRadius: '0.5rem',
              background: '#374151', color: 'white', border: 'none',
              cursor: 'pointer', fontWeight: '600'
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default TollCharges;
