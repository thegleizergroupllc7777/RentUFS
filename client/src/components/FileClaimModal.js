import React, { useState } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import ImageUpload from './ImageUpload';

// Report-an-accident / file-a-claim form. Submits to POST /api/claims, which
// only emails the claims inbox — it does not touch bookings, payments,
// insurance, or tolls. Photos are optional so an upload hiccup can never block
// a report.
const FileClaimModal = ({ booking, onClose }) => {
  const [description, setDescription] = useState('');
  const [incidentDate, setIncidentDate] = useState('');
  const [location, setLocation] = useState('');
  const [photos, setPhotos] = useState(['', '', '']);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const vehicleName = booking?.vehicle?.nickname ||
    `${booking?.vehicle?.year || ''} ${booking?.vehicle?.make || ''} ${booking?.vehicle?.model || ''}`.trim() ||
    'this vehicle';
  const resId = booking?.reservationId || '';

  const setPhoto = (i, url) => setPhotos((p) => { const n = [...p]; n[i] = url; return n; });

  const submit = async () => {
    if (!description.trim()) { setError('Please describe what happened.'); return; }
    setBusy(true); setError('');
    try {
      const token = localStorage.getItem('token');
      await axios.post(`${API_URL}/api/claims`, {
        bookingId: booking._id,
        description: description.trim(),
        incidentDate,
        location,
        photos: photos.filter(Boolean)
      }, { headers: { Authorization: `Bearer ${token}` } });
      setDone(true);
    } catch (err) {
      setError(err.response?.data?.message || 'Could not submit your claim. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '1rem'
    }}>
      <div style={{ background: 'white', borderRadius: '1rem', padding: '1.5rem', maxWidth: '520px', width: '100%', maxHeight: '90vh', overflow: 'auto' }}>
        {done ? (
          <div style={{ textAlign: 'center', padding: '1rem 0' }}>
            <div style={{ fontSize: '3rem' }}>✅</div>
            <h2 style={{ color: '#111827', margin: '0.5rem 0' }}>Your claim has been submitted</h2>
            <p style={{ color: '#6b7280', margin: '0 0 1.25rem' }}>
              Our team has received your report and will reach out to you shortly.
            </p>
            <button onClick={onClose} className="btn btn-primary" style={{ background: '#10b981', width: '100%' }}>Close</button>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
              <h2 style={{ margin: 0, color: '#dc2626' }}>Report an Accident</h2>
              <button onClick={onClose} style={{ background: 'none', border: 'none', fontSize: '1.5rem', cursor: 'pointer', color: '#6b7280' }}>x</button>
            </div>
            <p style={{ color: '#6b7280', fontSize: '0.85rem', margin: '0 0 1rem' }}>
              Your safety comes first — if anyone is hurt, call 911. Then tell us what happened.
            </p>
            <div style={{ background: '#f3f4f6', border: '1px solid #e5e7eb', borderRadius: '0.5rem', padding: '0.6rem 0.8rem', fontSize: '0.85rem', color: '#374151', marginBottom: '1rem' }}>
              <strong>Trip:</strong> {vehicleName}{resId ? ` · ${resId}` : ''}
            </div>

            {error && (
              <div style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: '0.5rem', padding: '0.6rem 0.8rem', fontSize: '0.85rem', marginBottom: '0.75rem' }}>{error}</div>
            )}

            <div style={{ marginBottom: '0.85rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>What happened? *</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                placeholder="Describe the accident — other vehicles, injuries, police report #, anything useful…"
                style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem', fontFamily: 'inherit', resize: 'vertical' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.6rem', marginBottom: '0.85rem', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 45%' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>When</label>
                <input type="date" value={incidentDate} onChange={(e) => setIncidentDate(e.target.value)}
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }} />
              </div>
              <div style={{ flex: '1 1 45%' }}>
                <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>Where</label>
                <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="City / highway / address"
                  style={{ width: '100%', padding: '0.6rem', borderRadius: '0.5rem', border: '1px solid #d1d5db', fontSize: '0.9rem' }} />
              </div>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, color: '#374151', marginBottom: '0.35rem' }}>
                Photos of the damage (optional — but they really help)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                {[0, 1, 2].map((i) => (
                  <ImageUpload key={i} label="" value={photos[i]} onChange={(url) => setPhoto(i, url)} />
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', gap: '0.6rem' }}>
              <button onClick={onClose} disabled={busy} className="btn btn-secondary" style={{ flex: 1 }}>Cancel</button>
              <button onClick={submit} disabled={busy} className="btn btn-primary" style={{ flex: 2, background: '#dc2626', border: 'none' }}>
                {busy ? 'Submitting…' : 'Submit Claim'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default FileClaimModal;
