import React, { useState, useEffect } from 'react';
import axiosInstance from '../config/axios';

/**
 * TollCharges - displays toll charges for a booking
 * Props:
 *   bookingId - the booking ID to fetch tolls for
 *   onClose - callback to close the modal (only used in modal mode)
 *   embedded - if true, renders inline instead of as a modal overlay
 *   isHost - if true, shows the "+ Add Charge" action in the header
 *   onAddCharge - callback fired when the host clicks "+ Add Charge"
 */
const TollCharges = ({ bookingId, onClose, embedded = false, isHost = false, onAddCharge }) => {
  const [charges, setCharges] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (bookingId) {
      fetchTollCharges();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId]);

  const fetchTollCharges = async () => {
    try {
      setLoading(true);
      setError('');
      const response = await axiosInstance.get(`/api/tolls/charges/${bookingId}`);
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

  const content = (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', gap: '0.75rem' }}>
        <h2 style={{
          margin: 0,
          color: embedded ? '#fff' : '#1f2937',
          fontSize: embedded ? '1rem' : '1.25rem'
        }}>
          Tolls & Charges
        </h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          {isHost && onAddCharge && (
            <button
              onClick={onAddCharge}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.25rem',
                padding: embedded ? '0.25rem 0.6rem' : '0.35rem 0.75rem',
                borderRadius: '0.375rem',
                background: '#f59e0b', color: '#000', border: 'none',
                cursor: 'pointer', fontWeight: 600,
                fontSize: embedded ? '0.75rem' : '0.85rem'
              }}
            >
              <span style={{ fontSize: '1.05em', lineHeight: 1 }}>+</span> Add Charge
            </button>
          )}
          {!embedded && onClose && (
            <button
              onClick={onClose}
              style={{
                background: 'none', border: 'none', fontSize: '1.5rem',
                cursor: 'pointer', color: '#6b7280', padding: '0.25rem'
              }}
            >
              &times;
            </button>
          )}
        </div>
      </div>

      {loading && (
        <div style={{ textAlign: 'center', padding: embedded ? '1rem' : '2rem', color: '#6b7280' }}>
          Loading toll charges...
        </div>
      )}

      {error && (
        <div style={{
          padding: '1rem', borderRadius: '0.5rem',
          background: embedded ? 'rgba(239,68,68,0.1)' : '#fef2f2',
          color: embedded ? '#f87171' : '#991b1b',
          border: `1px solid ${embedded ? '#7f1d1d' : '#fecaca'}`,
          marginBottom: '1rem',
          fontSize: embedded ? '0.8125rem' : undefined
        }}>
          {error}
        </div>
      )}

      {!loading && !error && charges.length === 0 && (
        <div style={{
          textAlign: 'center', padding: embedded ? '1rem' : '2rem',
          color: '#6b7280',
          background: embedded ? 'transparent' : '#f9fafb',
          borderRadius: '0.5rem'
        }}>
          <p style={{ fontSize: embedded ? '0.875rem' : '1.1rem', fontWeight: '600', marginBottom: '0.5rem' }}>No toll charges found</p>
          <p style={{ fontSize: embedded ? '0.75rem' : '0.85rem', margin: 0 }}>
            Toll charges may take up to 60 days to appear after the trip ends.
          </p>
        </div>
      )}

      {!loading && !error && charges.length > 0 && (
        <>
          {/* Summary */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '0.75rem 1rem',
            background: embedded ? 'rgba(16,185,129,0.1)' : '#f0fdf4',
            borderRadius: '0.5rem',
            border: `1px solid ${embedded ? '#10b981' : '#bbf7d0'}`,
            marginBottom: '1rem'
          }}>
            <span style={{ color: embedded ? '#34d399' : '#166534', fontWeight: '600', fontSize: embedded ? '0.85rem' : undefined }}>
              {total} toll{total !== 1 ? 's' : ''}
            </span>
            <span style={{ color: embedded ? '#34d399' : '#166534', fontWeight: '700', fontSize: embedded ? '1rem' : '1.1rem' }}>
              Total: ${totalAmount.toFixed(2)}
            </span>
          </div>

          {/* Charge list */}
          <div className="transaction-scroll" style={{
            display: 'flex', flexDirection: 'column', gap: '0.75rem',
            maxHeight: '400px', overflowY: 'auto', paddingRight: '0.75rem'
          }}>
            {charges.map((charge, idx) => (
              <div key={charge.id || idx} style={{
                padding: '0.75rem 1rem', borderRadius: '0.5rem',
                border: `1px solid ${embedded ? '#333' : '#e5e7eb'}`,
                background: embedded ? '#111' : '#fafafa'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: '600', color: embedded ? '#fff' : '#1f2937', fontSize: '0.95rem' }}>
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
                        background: charge.transaction_type === 'VIOLATION' ? (embedded ? 'rgba(239,68,68,0.1)' : '#fef2f2') : (embedded ? 'rgba(59,130,246,0.1)' : '#f0f9ff'),
                        color: charge.transaction_type === 'VIOLATION' ? (embedded ? '#f87171' : '#991b1b') : (embedded ? '#93c5fd' : '#1e40af'),
                        border: `1px solid ${charge.transaction_type === 'VIOLATION' ? (embedded ? '#7f1d1d' : '#fecaca') : (embedded ? '#1e3a5f' : '#bfdbfe')}`
                      }}>
                        {charge.transaction_type}
                      </span>
                    )}
                  </div>
                  <span style={{
                    fontWeight: '700', fontSize: '1.05rem',
                    color: charge.transaction_type === 'VIOLATION' ? '#dc2626' : (embedded ? '#fff' : '#1f2937')
                  }}>
                    ${(charge.amount || 0).toFixed(2)}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {!embedded && (
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
      )}
    </>
  );

  // Embedded mode: render inline with dark theme styling
  if (embedded) {
    return (
      <div style={{
        background: '#1a1a1a',
        border: '1px solid #333',
        borderRadius: '12px',
        padding: '1.5rem'
      }}>
        {content}
      </div>
    );
  }

  // Modal mode: render as overlay
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
        {content}
      </div>
    </div>
  );
};

export default TollCharges;
