import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import './InsuranceSelection.css';

// Map legacy plan IDs to new structure
const mapLegacyPlan = (planId) => {
  const legacy = { basic: 'carshare', standard: 'rideshare', premium: 'rideshare', protection: 'rideshare' };
  return legacy[planId] || planId;
};

const InsuranceSelection = ({ bookingId, totalDays, onInsuranceChange, initialSelection = 'none' }) => {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(mapLegacyPlan(initialSelection));
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

  const handleSelectPlan = async (planId) => {
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
        <h2>Trip Protection</h2>
        <div className="insurance-loading">
          <div className="spinner-small"></div>
          <span>Loading insurance options...</span>
        </div>
      </div>
    );
  }

  const carsharePlan = plans.find(p => p.id === 'carshare');
  const ridesharePlan = plans.find(p => p.id === 'rideshare');
  const hasCoverage = selectedPlan === 'carshare' || selectedPlan === 'rideshare';

  return (
    <div className="insurance-section">
      <h2>Trip Protection</h2>
      <p className="insurance-subtitle">
        Coverage powered by TeqMobility. Begins at pickup and ends at return.
      </p>

      {error && <div className="error-message">{error}</div>}

      <div className="insurance-toggle-container">
        {/* Car Share — Liability */}
        {carsharePlan && (
          <div
            className={`insurance-option ${selectedPlan === 'carshare' ? 'active' : ''}`}
            onClick={() => handleSelectPlan(selectedPlan === 'carshare' ? 'none' : 'carshare')}
          >
            <div className="option-top">
              <div className="option-info">
                <div className="option-icon shield-on">&#x1F6E1;</div>
                <div className="option-text">
                  <h3>Liability Coverage</h3>
                  <p>Car Share — Liability protection</p>
                </div>
              </div>
              <div className="option-toggle-area">
                <div className="option-price">
                  <span className="price-amount">{formatCurrency(carsharePlan.pricePerDay)}</span>
                  <span className="price-period">/day</span>
                </div>
                <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedPlan === 'carshare'}
                    onChange={() => handleSelectPlan(selectedPlan === 'carshare' ? 'none' : 'carshare')}
                    disabled={updating}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            {selectedPlan === 'carshare' && (
              <div className="option-expanded">
                <div className="coverage-total">
                  {formatCurrency(carsharePlan.totalCost)} total for {totalDays} day{totalDays !== 1 ? 's' : ''}
                </div>
                <div className="coverage-grid">
                  {carsharePlan.details && carsharePlan.details.map((detail, index) => (
                    <div key={index} className="coverage-detail">
                      <span className="detail-check">&#10003;</span>
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
                <div className="coverage-badges">
                  <span className="badge included">Liability</span>
                  <span className="badge included">Roadside</span>
                  <span className="badge excluded">Collision</span>
                  <span className="badge excluded">Comprehensive</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Ride Share — Full Collision */}
        {ridesharePlan && (
          <div
            className={`insurance-option ${selectedPlan === 'rideshare' ? 'active' : ''}`}
            onClick={() => handleSelectPlan(selectedPlan === 'rideshare' ? 'none' : 'rideshare')}
          >
            <div className="option-top">
              <div className="option-info">
                <div className="option-icon shield-full">&#x1F6E1;</div>
                <div className="option-text">
                  <h3>Full Coverage</h3>
                  <p>Ride Share — Collision + Liability</p>
                </div>
              </div>
              <div className="option-toggle-area">
                <div className="option-price">
                  <span className="price-amount">{formatCurrency(ridesharePlan.pricePerDay)}</span>
                  <span className="price-period">/day</span>
                </div>
                <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selectedPlan === 'rideshare'}
                    onChange={() => handleSelectPlan(selectedPlan === 'rideshare' ? 'none' : 'rideshare')}
                    disabled={updating}
                  />
                  <span className="toggle-slider"></span>
                </label>
              </div>
            </div>

            {selectedPlan === 'rideshare' && (
              <div className="option-expanded">
                <div className="coverage-total">
                  {formatCurrency(ridesharePlan.totalCost)} total for {totalDays} day{totalDays !== 1 ? 's' : ''}
                </div>
                <div className="coverage-grid">
                  {ridesharePlan.details && ridesharePlan.details.map((detail, index) => (
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
        )}

        {/* Decline option */}
        <div
          className={`insurance-option decline-option ${!hasCoverage ? 'active' : ''}`}
          onClick={() => handleSelectPlan('none')}
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
              <label className="toggle-switch" onClick={(e) => e.stopPropagation()}>
                <input
                  type="checkbox"
                  checked={!hasCoverage}
                  onChange={() => handleSelectPlan(hasCoverage ? 'none' : 'rideshare')}
                  disabled={updating}
                />
                <span className="toggle-slider decline-slider"></span>
              </label>
            </div>
          </div>

          {!hasCoverage && (
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
