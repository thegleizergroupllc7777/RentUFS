import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import './InsuranceSelection.css';

const InsuranceSelection = ({ bookingId, totalDays, onInsuranceChange, initialSelection = 'none' }) => {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(
    // Map legacy plan IDs to new structure
    ['basic', 'standard', 'premium'].includes(initialSelection) ? 'protection' : initialSelection
  );
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchInsurancePlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalDays]);

  const fetchInsurancePlans = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await axios.get(`${API_URL}/api/insurance/plans`, {
        headers: { Authorization: `Bearer ${token}` },
        params: { totalDays }
      });

      setPlans(response.data.plans);
    } catch (err) {
      setError('Failed to load insurance options');
      console.error('Error fetching insurance plans:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (planId) => {
    if (selectedPlan === planId || updating) return;

    setUpdating(true);
    setError('');

    try {
      const token = localStorage.getItem('token');
      const response = await axios.post(
        `${API_URL}/api/insurance/add-to-booking`,
        { bookingId, planId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      setSelectedPlan(planId);

      if (onInsuranceChange) {
        onInsuranceChange(response.data.booking);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to update insurance');
    } finally {
      setUpdating(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="insurance-section">
        <h2>Protection Plans</h2>
        <div className="insurance-loading">
          <div className="spinner-small"></div>
          <span>Loading insurance options...</span>
        </div>
      </div>
    );
  }

  const protectionPlan = plans.find(p => p.id === 'protection');
  const isProtected = selectedPlan === 'protection';

  return (
    <div className="insurance-section">
      <h2>Trip Protection</h2>
      <p className="insurance-subtitle">
        Coverage powered by TeqMobility. Begins at pickup and ends at return.
      </p>

      {error && <div className="error-message">{error}</div>}

      <div className="insurance-toggle-container">
        {/* Protection ON option */}
        <div
          className={`insurance-option ${isProtected ? 'active' : ''}`}
          onClick={() => handleToggle('protection')}
        >
          <div className="option-top">
            <div className="option-info">
              <div className="option-icon shield-on">&#x1F6E1;</div>
              <div className="option-text">
                <h3>RentUFS Protection</h3>
                <p>Comprehensive coverage for your trip</p>
              </div>
            </div>
            <div className="option-toggle-area">
              {protectionPlan && (
                <div className="option-price">
                  <span className="price-amount">{formatCurrency(protectionPlan.pricePerDay)}</span>
                  <span className="price-period">/day</span>
                </div>
              )}
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={isProtected}
                  onChange={() => handleToggle(isProtected ? 'none' : 'protection')}
                  disabled={updating}
                />
                <span className="toggle-slider"></span>
              </label>
            </div>
          </div>

          {isProtected && protectionPlan && (
            <div className="option-expanded">
              <div className="coverage-total">
                {formatCurrency(protectionPlan.totalCost)} total for {totalDays} day{totalDays !== 1 ? 's' : ''}
              </div>
              <div className="coverage-grid">
                {protectionPlan.details && protectionPlan.details.map((detail, index) => (
                  <div key={index} className="coverage-detail">
                    <span className="detail-check">&#10003;</span>
                    <span>{detail}</span>
                  </div>
                ))}
              </div>
              <div className="coverage-badges">
                <span className="badge included">Liability</span>
                <span className="badge included">Collision</span>
                <span className="badge included">Comprehensive</span>
                <span className="badge included">Personal Injury</span>
                <span className="badge included">Roadside</span>
              </div>
            </div>
          )}
        </div>

        {/* Decline option */}
        <div
          className={`insurance-option decline-option ${!isProtected ? 'active' : ''}`}
          onClick={() => handleToggle('none')}
        >
          <div className="option-top">
            <div className="option-info">
              <div className="option-icon shield-off">&#x2715;</div>
              <div className="option-text">
                <h3>Decline Coverage</h3>
                <p>I have my own insurance</p>
              </div>
            </div>
            <div className="option-toggle-area">
              <div className="option-price">
                <span className="price-free">$0</span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={!isProtected}
                  onChange={() => handleToggle(!isProtected ? 'protection' : 'none')}
                  disabled={updating}
                />
                <span className="toggle-slider decline-slider"></span>
              </label>
            </div>
          </div>

          {!isProtected && (
            <div className="option-expanded decline-expanded">
              <div className="decline-warning">
                <span className="warning-icon">&#9888;</span>
                <span>You are responsible for providing your own coverage. Verify with your insurer that rental vehicles are covered under your policy.</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {updating && (
        <div className="insurance-updating">
          <div className="spinner-small"></div>
          <span>Updating your selection...</span>
        </div>
      )}
    </div>
  );
};

export default InsuranceSelection;
