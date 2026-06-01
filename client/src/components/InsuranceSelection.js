import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import './InsuranceSelection.css';

// Map legacy plan IDs to new structure
const mapLegacyPlan = (planId) => {
  const legacy = { basic: 'carshare', standard: 'rideshare', premium: 'rideshare', protection: 'rideshare' };
  return legacy[planId] || planId;
};

const InsuranceSelection = ({ bookingId, totalDays, onInsuranceChange, initialSelection = 'rideshare' }) => {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(mapLegacyPlan(initialSelection) || 'rideshare');
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
        params: { totalDays, bookingId }
      });

      setPlans(response.data.plans);

      // Auto-select Full Coverage if no valid plan is selected, and persist to booking
      const currentSelection = mapLegacyPlan(initialSelection) || 'rideshare';
      if (currentSelection === 'none' || currentSelection === 'carshare') {
        setSelectedPlan('rideshare');
        // Persist auto-selection to the booking so it shows in the summary
        try {
          const addResponse = await axios.post(
            `${API_URL}/api/insurance/add-to-booking`,
            { bookingId, planId: 'rideshare' },
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (onInsuranceChange) {
            onInsuranceChange(addResponse.data.booking);
          }
        } catch (addErr) {
          console.error('Error auto-adding insurance to booking:', addErr);
        }
      }
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

  const ridesharePlan = plans.find(p => p.id === 'rideshare');

  // Build display list: Full Coverage only (Car Share + Ride Share)
  const displayPlans = [];
  if (ridesharePlan) {
    displayPlans.push({
      ...ridesharePlan,
      displayName: 'Full Coverage',
      displayDescription: 'Car Share & Ride Share — Collision + Liability',
      recommended: true,
      badges: [
        { label: 'Liability', included: true },
        { label: 'Personal Injury', included: true },
        { label: 'Collision', included: true },
        { label: 'Comprehensive', included: true },
      ]
    });
  }

  return (
    <div className="insurance-section">
      <h2>Trip Protection</h2>
      <p className="insurance-subtitle">
        Choose a protection plan for your trip. Coverage begins at pickup and ends at return.
      </p>

      {error && <div className="error-message">{error}</div>}

      <div className="insurance-plans">
        {displayPlans.map((plan) => (
          <div
            key={plan.id}
            className={`insurance-plan ${selectedPlan === plan.id ? 'selected' : ''} ${plan.recommended ? 'recommended' : ''}`}
            onClick={() => !updating && handleSelectPlan(plan.id)}
          >
            {plan.recommended && (
              <div className="plan-badge">Recommended</div>
            )}

            <div className="plan-header">
              <div className="plan-radio">
                <input
                  type="radio"
                  name="insurance"
                  checked={selectedPlan === plan.id}
                  onChange={() => handleSelectPlan(plan.id)}
                  disabled={updating}
                />
              </div>
              <div className="plan-title-section">
                <h3 className="plan-name">{plan.displayName}</h3>
                <p className="plan-description">{plan.displayDescription}</p>
              </div>
              <div className="plan-price">
                <span className="price-amount">{formatCurrency(plan.pricePerDay)}</span>
                <span className="price-period">/day</span>
                <div className="price-total">
                  {formatCurrency(plan.totalCost)} total for {totalDays} day{totalDays !== 1 ? 's' : ''}
                </div>
              </div>
            </div>

            {plan.details && plan.details.length > 0 && (
              <div className="plan-details">
                <ul>
                  {plan.details.map((detail, index) => (
                    <li key={index}>
                      <span className="check-icon">&#10003;</span>
                      {detail}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {plan.badges && (
              <div className="plan-coverage">
                {plan.badges.map((badge, index) => (
                  <div key={index} className={`coverage-item ${badge.included ? 'included' : 'excluded'}`}>
                    <span className="coverage-icon">{badge.included ? '\u2713' : '\u2715'}</span>
                    {badge.label}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

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
