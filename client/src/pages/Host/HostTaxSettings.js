import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import Navbar from '../../components/Navbar';
import API_URL from '../../config/api';
import './HostTaxSettings.css';

const HostTaxSettings = () => {
  const [taxInfo, setTaxInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [taxFormData, setTaxFormData] = useState({
    accountType: 'individual',
    taxId: '',
    legalFirstName: '',
    legalLastName: '',
    legalAddress: { street: '', city: '', state: '', zipCode: '' },
    businessName: '',
    businessAddress: { street: '', city: '', state: '', zipCode: '' }
  });
  const [taxSaving, setTaxSaving] = useState(false);
  const [taxMessage, setTaxMessage] = useState('');

  useEffect(() => {
    fetchTaxInfo();
  }, []);

  const fetchTaxInfo = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/users/host-tax-info`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      if (response.data.hasSubmitted) {
        setTaxFormData({
          accountType: response.data.accountType,
          taxId: '',
          legalFirstName: response.data.legalFirstName || '',
          legalLastName: response.data.legalLastName || '',
          legalAddress: response.data.legalAddress || { street: '', city: '', state: '', zipCode: '' },
          businessName: response.data.businessName || '',
          businessAddress: response.data.businessAddress || { street: '', city: '', state: '', zipCode: '' }
        });
      }
    } catch (error) {
      console.error('Error fetching tax info:', error);
      setTaxInfo({ accountType: 'individual', taxIdLast4: '', businessName: '', hasSubmitted: false });
    } finally {
      setLoading(false);
    }
  };

  const formatSSN = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 3) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
    return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
  };

  const formatEIN = (value) => {
    const digits = value.replace(/\D/g, '').slice(0, 9);
    if (digits.length <= 2) return digits;
    return `${digits.slice(0, 2)}-${digits.slice(2)}`;
  };

  const handleTaxIdInput = (e) => {
    const formatted = taxFormData.accountType === 'individual' ? formatSSN(e.target.value) : formatEIN(e.target.value);
    setTaxFormData({ ...taxFormData, taxId: formatted });
  };

  const handleSaveTaxInfo = async (e) => {
    e.preventDefault();
    setTaxSaving(true);
    setTaxMessage('');
    try {
      const token = localStorage.getItem('token');
      const payload = { ...taxFormData };
      // If no new taxId entered but one already exists on server, don't send empty taxId
      if (!payload.taxId || !payload.taxId.trim()) {
        delete payload.taxId;
      }
      const response = await axios.put(`${API_URL}/api/users/host-tax-info`, payload, {
        headers: { Authorization: `Bearer ${token}` }
      });
      setTaxInfo(response.data);
      setTaxMessage('Tax information saved successfully');
      setShowTaxForm(false);
      setTaxFormData(prev => ({ ...prev, taxId: '' }));
    } catch (error) {
      setTaxMessage(error.response?.data?.message || 'Failed to save tax information');
    } finally {
      setTaxSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="host-page">
        <Navbar />
        <div className="container" style={{ padding: '4rem 20px', color: '#1f2937' }}>
          Loading...
        </div>
      </div>
    );
  }

  return (
    <div className="host-page">
      <Navbar />
      <div className="page">
        <div className="container">
          <div className="tax-settings-header">
            <Link to="/host/dashboard" className="tax-back-link">
              &larr; Back to Dashboard
            </Link>
            <h1 className="page-title">Tax Settings</h1>
            <p className="tax-subtitle">
              Manage your tax information for 1099 reporting and payouts.
            </p>
          </div>

          {/* Current Tax Status */}
          <div className="tax-status-card">
            <div className="tax-status-header">
              <div className={`tax-status-indicator ${taxInfo?.hasSubmitted ? 'submitted' : 'pending'}`}>
                {taxInfo?.hasSubmitted ? '\u2713' : '!'}
              </div>
              <div>
                <h2 className="tax-status-title">
                  {taxInfo?.hasSubmitted ? 'Tax Information on File' : 'Tax Information Required'}
                </h2>
                <p className="tax-status-description">
                  {taxInfo?.hasSubmitted
                    ? 'Your tax details are saved and will be used for 1099 reporting.'
                    : 'Please add your tax information to receive payouts and for annual 1099 reporting.'}
                </p>
              </div>
            </div>

            {taxInfo?.hasSubmitted && (
              <div className="tax-details-grid">
                <div className="tax-detail-item">
                  <span className="tax-detail-label">Account Type</span>
                  <span className="tax-detail-value">
                    {taxInfo.accountType === 'business' ? 'Business / LLC' : 'Individual'}
                  </span>
                </div>
                {taxInfo.accountType === 'individual' && taxInfo.legalFirstName && (
                  <div className="tax-detail-item">
                    <span className="tax-detail-label">Legal Name</span>
                    <span className="tax-detail-value">{taxInfo.legalFirstName} {taxInfo.legalLastName}</span>
                  </div>
                )}
                {taxInfo.accountType === 'individual' && taxInfo.legalAddress?.street && (
                  <div className="tax-detail-item">
                    <span className="tax-detail-label">Address</span>
                    <span className="tax-detail-value">
                      {taxInfo.legalAddress.street}, {taxInfo.legalAddress.city}, {taxInfo.legalAddress.state} {taxInfo.legalAddress.zipCode}
                    </span>
                  </div>
                )}
                {taxInfo.accountType === 'business' && taxInfo.businessName && (
                  <div className="tax-detail-item">
                    <span className="tax-detail-label">Business Name</span>
                    <span className="tax-detail-value">{taxInfo.businessName}</span>
                  </div>
                )}
                <div className="tax-detail-item">
                  <span className="tax-detail-label">
                    {taxInfo.accountType === 'individual' ? 'SSN' : 'EIN'}
                  </span>
                  <span className="tax-detail-value">
                    ****{taxInfo.taxIdLast4}
                    {taxInfo.taxIdLocked && (
                      <span style={{
                        marginLeft: '0.5rem', fontSize: '0.7rem',
                        background: '#374151', color: '#9ca3af',
                        padding: '0.15rem 0.4rem', borderRadius: '4px'
                      }}>LOCKED</span>
                    )}
                  </span>
                </div>
              </div>
            )}

            {taxMessage && !showTaxForm && (
              <p className="tax-success-message">{taxMessage}</p>
            )}

            <button
              onClick={() => { setShowTaxForm(!showTaxForm); setTaxMessage(''); }}
              className={`btn ${taxInfo?.hasSubmitted ? 'btn-secondary' : 'btn-primary'}`}
              style={{ marginTop: '1.5rem' }}
            >
              {showTaxForm ? 'Cancel' : taxInfo?.hasSubmitted ? 'Update Tax Information' : 'Add Tax Information'}
            </button>
          </div>

          {/* Tax Form */}
          {showTaxForm && (
            <div className="tax-form-card">
              <h2 className="tax-form-title">
                {taxInfo?.hasSubmitted ? 'Update Tax Information' : 'Add Tax Information'}
              </h2>
              <form onSubmit={handleSaveTaxInfo}>
                <div className="tax-form-group">
                  <label className="tax-form-label">Account Type</label>
                  <div className="tax-account-type-options">
                    <label className={`tax-account-option ${taxFormData.accountType === 'individual' ? 'selected' : ''} ${taxInfo?.taxIdLocked ? 'disabled' : ''}`}>
                      <input type="radio" value="individual" checked={taxFormData.accountType === 'individual'}
                        onChange={() => setTaxFormData({ ...taxFormData, accountType: 'individual', taxId: '', businessName: '' })}
                        disabled={!!taxInfo?.taxIdLocked}
                      />
                      <div className="tax-account-option-content">
                        <span className="tax-account-option-title">Individual</span>
                        <span className="tax-account-option-desc">Personal SSN</span>
                      </div>
                    </label>
                    <label className={`tax-account-option ${taxFormData.accountType === 'business' ? 'selected' : ''} ${taxInfo?.taxIdLocked ? 'disabled' : ''}`}>
                      <input type="radio" value="business" checked={taxFormData.accountType === 'business'}
                        onChange={() => setTaxFormData({ ...taxFormData, accountType: 'business', taxId: '', businessName: '' })}
                        disabled={!!taxInfo?.taxIdLocked}
                      />
                      <div className="tax-account-option-content">
                        <span className="tax-account-option-title">Business / LLC</span>
                        <span className="tax-account-option-desc">Company EIN</span>
                      </div>
                    </label>
                  </div>
                </div>

                {/* Individual: Legal name and address */}
                {taxFormData.accountType === 'individual' && (
                  <>
                    <div className="tax-form-group">
                      <label className="tax-form-label">Legal Name (as it appears on your tax documents)</label>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                        <input type="text" value={taxFormData.legalFirstName}
                          onChange={(e) => setTaxFormData({ ...taxFormData, legalFirstName: e.target.value })}
                          placeholder="First Name"
                          className="tax-form-input"
                          required />
                        <input type="text" value={taxFormData.legalLastName}
                          onChange={(e) => setTaxFormData({ ...taxFormData, legalLastName: e.target.value })}
                          placeholder="Last Name"
                          className="tax-form-input"
                          required />
                      </div>
                    </div>

                    <div className="tax-form-group">
                      <label className="tax-form-label">Legal Address (as it appears on your tax documents)</label>
                      <input type="text" value={taxFormData.legalAddress.street}
                        onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, street: e.target.value } })}
                        placeholder="Street Address"
                        className="tax-form-input"
                        style={{ marginBottom: '0.5rem' }}
                        required />
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                        <input type="text" value={taxFormData.legalAddress.city}
                          onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, city: e.target.value } })}
                          placeholder="City"
                          className="tax-form-input"
                          required />
                        <input type="text" value={taxFormData.legalAddress.state}
                          onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, state: e.target.value } })}
                          placeholder="State"
                          className="tax-form-input"
                          maxLength="2"
                          style={{ textTransform: 'uppercase' }}
                          required />
                        <input type="text" value={taxFormData.legalAddress.zipCode}
                          onChange={(e) => setTaxFormData({ ...taxFormData, legalAddress: { ...taxFormData.legalAddress, zipCode: e.target.value } })}
                          placeholder="ZIP Code"
                          className="tax-form-input"
                          maxLength="5"
                          required />
                      </div>
                    </div>
                  </>
                )}

                {/* Business fields */}
                {taxFormData.accountType === 'business' && (
                  <>
                    <div className="tax-form-group">
                      <label className="tax-form-label">Business Name</label>
                      <input type="text" value={taxFormData.businessName}
                        onChange={(e) => setTaxFormData({ ...taxFormData, businessName: e.target.value })}
                        placeholder="e.g., United Fleet Services LLC"
                        className="tax-form-input"
                        required />
                    </div>

                    <div className="tax-form-group">
                      <label className="tax-form-label">Business Address</label>
                      <input type="text" value={taxFormData.businessAddress.street}
                        onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, street: e.target.value } })}
                        placeholder="Street Address"
                        className="tax-form-input"
                        style={{ marginBottom: '0.5rem' }}
                        required />
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0.75rem' }}>
                        <input type="text" value={taxFormData.businessAddress.city}
                          onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, city: e.target.value } })}
                          placeholder="City"
                          className="tax-form-input"
                          required />
                        <input type="text" value={taxFormData.businessAddress.state}
                          onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, state: e.target.value } })}
                          placeholder="State"
                          className="tax-form-input"
                          maxLength="2"
                          style={{ textTransform: 'uppercase' }}
                          required />
                        <input type="text" value={taxFormData.businessAddress.zipCode}
                          onChange={(e) => setTaxFormData({ ...taxFormData, businessAddress: { ...taxFormData.businessAddress, zipCode: e.target.value } })}
                          placeholder="ZIP Code"
                          className="tax-form-input"
                          maxLength="5"
                          required />
                      </div>
                    </div>
                  </>
                )}

                <div className="tax-form-group">
                  <label className="tax-form-label">
                    {taxFormData.accountType === 'individual' ? 'Social Security Number (SSN)' : 'Employer ID Number (EIN)'}
                  </label>
                  {taxInfo?.taxIdLocked ? (
                    <>
                      <input type="text"
                        value={`****${taxInfo.taxIdLast4}`}
                        disabled
                        className="tax-form-input"
                        style={{ backgroundColor: '#1a1a2e', color: '#6b7280', cursor: 'not-allowed' }}
                      />
                      <p className="tax-form-hint" style={{ color: '#f59e0b' }}>
                        Locked after submission. Contact support to update.
                      </p>
                    </>
                  ) : (
                    <>
                      <input type="text" value={taxFormData.taxId}
                        onChange={handleTaxIdInput}
                        placeholder={taxFormData.accountType === 'individual' ? 'XXX-XX-XXXX' : 'XX-XXXXXXX'}
                        maxLength={taxFormData.accountType === 'individual' ? 11 : 10}
                        className="tax-form-input"
                        required />
                      <p className="tax-form-hint">
                        Stored securely. Only the last 4 digits will be visible.
                      </p>
                    </>
                  )}
                </div>

                {taxMessage && (
                  <p className={`tax-form-message ${taxMessage.includes('success') ? 'success' : 'error'}`}>
                    {taxMessage}
                  </p>
                )}

                <button type="submit" className="btn btn-primary" disabled={taxSaving}
                  style={{ padding: '0.65rem 2rem', fontSize: '0.95rem' }}>
                  {taxSaving ? 'Saving...' : 'Save Tax Information'}
                </button>
              </form>
            </div>
          )}

          {/* Info Section */}
          <div className="tax-info-card">
            <h3 className="tax-info-title">Why do we need this?</h3>
            <ul className="tax-info-list">
              <li>The IRS requires platforms to report earnings via Form 1099-K for hosts earning over $600/year.</li>
              <li>Your tax ID is encrypted and stored securely — only the last 4 digits are visible.</li>
              <li>Your SSN/EIN is locked after submission for security. Name and address can still be updated. Contact support to change your tax ID.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HostTaxSettings;
