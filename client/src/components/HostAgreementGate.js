import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from '../config/axios';
import { useAuth } from '../context/AuthContext';

// One-time gate for EXISTING hosts who registered before the insurance
// acknowledgment was required. The next time they open any host page, this
// blocking prompt asks them to review the Owner Agreement and sign — mirroring
// the "A New Owner Agreement is Available" flow. New hosts already sign during
// "Become a Host", so they pass straight through.
//
// Note: the Terms of Service is accepted at signup, so only ONE document (the
// Owner Agreement) is shown here.
const HostAgreementGate = ({ children }) => {
  const { user, refreshUser } = useAuth();
  const navigate = useNavigate();

  const [ackPrimary, setAckPrimary] = useState(false);
  const [ackLimits, setAckLimits] = useState(false);
  const [ackCap, setAckCap] = useState(false);
  const [signature, setSignature] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isHost = user && (user.userType === 'host' || user.userType === 'both');
  const needsToSign = isHost && !user?.hostAgreement?.signed;

  if (!needsToSign) return children;

  const complete = ackPrimary && ackLimits && ackCap && signature.trim().length >= 2;

  const handleSign = async () => {
    if (!complete) {
      setError('Please check all three acknowledgments and type your full legal name to sign.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await axios.put('/api/users/host-agreement', {
        signature: signature.trim(),
        acknowledgedPrimaryInsurance: ackPrimary,
        acknowledgedCoverageLimits: ackLimits,
        acknowledgedCatastrophicCap: ackCap
      });
      await refreshUser();
      // refreshUser updates user.hostAgreement.signed, so this gate unmounts.
    } catch (err) {
      setError(err.response?.data?.message || 'Could not save your signature. Please try again.');
      setSubmitting(false);
    }
  };

  const ackBox = { display: 'flex', gap: '0.6rem', alignItems: 'flex-start', margin: '0.9rem 0', cursor: 'pointer', fontSize: '0.92rem', color: '#4b3a00' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(0,0,0,0.75)', overflowY: 'auto', display: 'flex', justifyContent: 'center', alignItems: 'flex-start', padding: '2rem 1rem' }}>
      <div style={{ position: 'relative', background: '#fff', borderRadius: '12px', maxWidth: '720px', width: '100%', padding: '2rem', margin: 'auto', boxShadow: '0 10px 40px rgba(0,0,0,0.4)' }}>
        {/* Escape hatch — leaves the host area for the marketplace so the host is
            never stuck. The prompt returns whenever they re-enter a host page. */}
        <button
          onClick={() => navigate('/marketplace')}
          aria-label="Close and go to marketplace"
          style={{ position: 'absolute', top: '1rem', right: '1rem', background: 'transparent', border: 'none', fontSize: '1.4rem', lineHeight: 1, color: '#6b7280', cursor: 'pointer' }}
        >
          ✕
        </button>
        <h1 style={{ color: '#1e2a4a', marginTop: 0, fontSize: '1.8rem', paddingRight: '1.5rem' }}>A New Owner Agreement is Available</h1>
        <p style={{ color: '#c79100', fontWeight: 700 }}>
          You must agree to the updated Owner Agreement to continue using RentUFS services.
        </p>

        <p style={{ color: '#374151', marginBottom: '0.25rem' }}>Please review the following document:</p>
        <p style={{ margin: '0 0 1rem' }}>
          <a href="https://rentufs.com/owner-agreement" target="_blank" rel="noopener noreferrer" style={{ color: '#b91c1c', fontWeight: 600 }}>
            RentUFS Owner Agreement
          </a>
          <span style={{ color: '#b91c1c' }}> *</span>
        </p>
        <p style={{ color: '#374151', fontSize: '0.9rem' }}>
          By entering your signature you consent to sign the RentUFS Owner Agreement electronically.
        </p>

        <div style={{ border: '1px solid #f2c94c', background: '#fdf6e3', borderRadius: '10px', padding: '1rem 1.25rem', margin: '1.25rem 0' }}>
          <label style={ackBox}>
            <input type="checkbox" checked={ackPrimary} onChange={(e) => setAckPrimary(e.target.checked)} style={{ marginTop: '0.2rem' }} />
            <span><strong>Primary Insurance Requirement:</strong> I understand that I must maintain my own personal or commercial auto insurance policy at all times. RentUFS's insurance is not a replacement for my primary insurance. If I fail to maintain my required insurance, RentUFS will not provide coverage and any claim will be denied.</span>
          </label>
          <label style={ackBox}>
            <input type="checkbox" checked={ackLimits} onChange={(e) => setAckLimits(e.target.checked)} style={{ marginTop: '0.2rem' }} />
            <span><strong>Coverage Limitations:</strong> I understand and agree that RentUFS's auto liability coverage applies only during the rental period and provides the minimum limits required by state law. No PIP, MedPay, UM, or UIM coverage is included unless required by law.</span>
          </label>
          <label style={ackBox}>
            <input type="checkbox" checked={ackCap} onChange={(e) => setAckCap(e.target.checked)} style={{ marginTop: '0.2rem' }} />
            <span><strong>Catastrophic Loss Cap:</strong> I understand that if a major event damages multiple vehicles stored at a single location, the total payout for that location is capped at $300,000. Storing vehicles at different locations can reduce this risk.</span>
          </label>
        </div>

        <label htmlFor="host-gate-signature" style={{ display: 'block', color: '#374151', fontWeight: 600, marginBottom: '0.4rem' }}>
          Sign by typing your full legal name *
        </label>
        <input
          id="host-gate-signature"
          type="text"
          value={signature}
          onChange={(e) => setSignature(e.target.value)}
          placeholder="Your full legal name"
          maxLength={100}
          style={{ width: '100%', padding: '0.7rem 0.9rem', borderRadius: '6px', border: '1px solid #b91c1c', fontFamily: 'cursive', fontSize: '1.2rem', boxSizing: 'border-box' }}
        />

        {error && <p style={{ color: '#b91c1c', marginTop: '0.75rem' }}>{error}</p>}

        <button
          onClick={handleSign}
          disabled={submitting || !complete}
          style={{
            marginTop: '1.5rem', width: '100%', padding: '0.9rem', borderRadius: '8px', border: 'none',
            background: complete && !submitting ? '#b91c1c' : '#d1a3a3', color: '#fff', fontWeight: 700,
            fontSize: '1rem', cursor: complete && !submitting ? 'pointer' : 'not-allowed'
          }}
        >
          {submitting ? 'Saving...' : 'I Agree & Sign'}
        </button>

        <button
          onClick={() => navigate('/marketplace')}
          style={{ marginTop: '0.75rem', width: '100%', padding: '0.7rem', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', color: '#6b7280', fontWeight: 600, fontSize: '0.9rem', cursor: 'pointer' }}
        >
          Maybe later — back to Marketplace
        </button>
        <p style={{ marginTop: '0.6rem', marginBottom: 0, fontSize: '0.78rem', color: '#9ca3af', textAlign: 'center' }}>
          You'll need to sign this before you can list or manage vehicles.
        </p>
      </div>
    </div>
  );
};

export default HostAgreementGate;
