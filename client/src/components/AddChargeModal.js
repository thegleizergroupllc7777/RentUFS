import React, { useState } from 'react';
import axiosInstance from '../config/axios';

const CHARGE_TYPE_LABELS = {
  citation: 'Traffic Citation / Moving Violation',
  parking_ticket: 'Parking Ticket',
  manual_toll: 'Manual Toll',
  late_return: 'Late Return Fee',
  cleaning: 'Cleaning Fee',
  fuel: 'Fuel Charge',
  smoking_violation: 'Smoking Violation',
  other: 'Other'
};

const MAX_AMOUNT = 150;

/**
 * AddChargeModal - host-facing form to bill a renter for an incidental charge
 * (citation, parking ticket, cleaning, etc.). Renter is auto-charged after a
 * 3-day notice period unless the host waives it.
 *
 * Props:
 *   bookingId - the booking the charge is being added to
 *   onClose - callback to close the modal
 *   onCreated - callback fired after a successful create (parent can refresh)
 */
const AddChargeModal = ({ bookingId, onClose, onCreated }) => {
  const today = new Date().toISOString().slice(0, 10);
  const [chargeType, setChargeType] = useState('parking_ticket');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [dateIncurred, setDateIncurred] = useState(today);
  const [proofImage, setProofImage] = useState('');
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleProofUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('image', file);
      const response = await axiosInstance.post('/api/upload/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (response.data?.imageUrl) {
        setProofImage(response.data.imageUrl);
      } else {
        setError('Upload failed — no URL returned');
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to upload proof image');
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const numericAmount = parseFloat(amount);
    if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
      setError('Enter a valid amount');
      return;
    }
    if (numericAmount > MAX_AMOUNT) {
      setError(`Amount cannot exceed $${MAX_AMOUNT}. Contact support for larger charges.`);
      return;
    }
    if (!description.trim()) {
      setError('Description is required');
      return;
    }
    if (!proofImage) {
      setError('Proof image is required');
      return;
    }

    setSubmitting(true);
    try {
      await axiosInstance.post('/api/charges', {
        bookingId,
        chargeType,
        amount: numericAmount,
        description: description.trim(),
        proofImage,
        dateIncurred
      });
      if (onCreated) onCreated();
      onClose();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create charge');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center',
      zIndex: 1100, padding: '1rem'
    }}>
      <div style={{
        background: 'white', borderRadius: '1rem', padding: '1.5rem',
        maxWidth: '520px', width: '100%', maxHeight: '90vh', overflow: 'auto'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h2 style={{ margin: 0, color: '#1f2937', fontSize: '1.25rem' }}>Add Charge</h2>
          <button
            onClick={onClose}
            disabled={submitting}
            style={{
              background: 'none', border: 'none', fontSize: '1.5rem',
              cursor: submitting ? 'not-allowed' : 'pointer',
              color: '#6b7280', padding: '0.25rem'
            }}
          >
            &times;
          </button>
        </div>

        <p style={{ margin: '0 0 1rem', fontSize: '0.85rem', color: '#6b7280' }}>
          The renter will be notified and auto-charged in 3 days unless you waive it.
          Maximum ${MAX_AMOUNT} per charge.
        </p>

        {error && (
          <div style={{
            padding: '0.75rem', borderRadius: '0.5rem',
            background: '#fef2f2', color: '#991b1b',
            border: '1px solid #fecaca', marginBottom: '1rem',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
              Type
            </label>
            <select
              value={chargeType}
              onChange={(e) => setChargeType(e.target.value)}
              required
              style={{
                width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
                border: '1px solid #d1d5db', fontSize: '0.95rem', background: 'white'
              }}
            >
              {Object.entries(CHARGE_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
              Amount ($)
            </label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              max={MAX_AMOUNT}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              placeholder="e.g., 75.00"
              style={{
                width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
                border: '1px solid #d1d5db', fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
              Date Incurred
            </label>
            <input
              type="date"
              value={dateIncurred}
              onChange={(e) => setDateIncurred(e.target.value)}
              max={today}
              required
              style={{
                width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
                border: '1px solid #d1d5db', fontSize: '0.95rem'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              required
              maxLength={500}
              placeholder="Describe what happened (location, ticket #, etc.)"
              rows={3}
              style={{
                width: '100%', padding: '0.5rem', borderRadius: '0.375rem',
                border: '1px solid #d1d5db', fontSize: '0.95rem', resize: 'vertical', fontFamily: 'inherit'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.25rem', fontWeight: 600, fontSize: '0.875rem', color: '#374151' }}>
              Proof Image
            </label>
            <p style={{ margin: '0 0 0.5rem', fontSize: '0.8rem', color: '#6b7280' }}>
              Upload a photo or scan of the citation, receipt, or evidence.
            </p>
            {proofImage ? (
              <div style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.5rem', border: '1px solid #d1d5db', borderRadius: '0.375rem',
                background: '#f9fafb'
              }}>
                <img
                  src={proofImage}
                  alt="Proof"
                  style={{ width: '60px', height: '60px', objectFit: 'cover', borderRadius: '0.25rem' }}
                />
                <span style={{ flex: 1, fontSize: '0.85rem', color: '#10b981', fontWeight: 600 }}>
                  Uploaded
                </span>
                <button
                  type="button"
                  onClick={() => setProofImage('')}
                  disabled={submitting}
                  style={{
                    padding: '0.25rem 0.75rem', background: 'transparent',
                    color: '#6b7280', border: '1px solid #d1d5db',
                    borderRadius: '0.25rem', cursor: 'pointer', fontSize: '0.8rem'
                  }}
                >
                  Replace
                </button>
              </div>
            ) : (
              <input
                type="file"
                accept="image/*"
                onChange={handleProofUpload}
                disabled={uploading}
                style={{
                  width: '100%', padding: '0.5rem',
                  border: '1px dashed #d1d5db', borderRadius: '0.375rem',
                  fontSize: '0.875rem'
                }}
              />
            )}
            {uploading && (
              <p style={{ margin: '0.25rem 0 0', fontSize: '0.8rem', color: '#6b7280' }}>
                Uploading...
              </p>
            )}
          </div>

          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{
                flex: 1, padding: '0.625rem', borderRadius: '0.5rem',
                background: '#f3f4f6', color: '#374151',
                border: '1px solid #d1d5db', cursor: submitting ? 'not-allowed' : 'pointer',
                fontWeight: 600
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || uploading}
              style={{
                flex: 1, padding: '0.625rem', borderRadius: '0.5rem',
                background: submitting || uploading ? '#86efac' : '#10b981',
                color: 'white', border: 'none',
                cursor: submitting || uploading ? 'not-allowed' : 'pointer',
                fontWeight: 600
              }}
            >
              {submitting ? 'Submitting...' : 'Submit Charge'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default AddChargeModal;
