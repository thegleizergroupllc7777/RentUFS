import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API_URL from '../config/api';
import './InsuranceSelection.css';

const InsuranceSelection = ({ bookingId, totalDays, onInsuranceChange, initialSelection = 'none' }) => {
  const [plans, setPlans] = useState([]);
  const [selectedPlan, setSelectedPlan] = useState(initialSelection);
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
    if (selectedPlan === planId) return;

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

  return (
    <div className="insurance-section">
      <h2>Protection Plans</h2>
      <p className="insurance-subtitle">
        Choose a protection plan for your rental. Coverage begins at pickup and ends at return.
      </p>

      {error && <div className="error-message">{error}</div>}

      <div className="insurance-plans">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`insurance-plan ${selectedPlan === plan.id ? 'selected' : ''} ${plan.id === 'premium' ? 'recommended' : ''}`}
            onClick={() => !updating && handleSelectPlan(plan.id)}
          >
            {plan.id === 'premium' && (
              <div className="plan-badge">Most Popular</div>
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
                <h3 className="plan-name">{plan.name}</h3>
                <p className="plan-description">{plan.description}</p>
              </div>
              <div className="plan-price">
                {plan.pricePerDay > 0 ? (
                  <>
                    <span className="price-amount">{formatCurrency(plan.pricePerDay)}</span>
                    <span className="price-period">/day</span>
                    <div className="price-total">
                      {formatCurrency(plan.totalCost)} total
                    </div>
                  </>
                ) : (
                  <span className="price-free">Free</span>
                )}
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

            {plan.coverage && (
              <div className="plan-coverage">
                <div className={`coverage-item ${plan.coverage.liability ? 'included' : 'excluded'}`}>
                  <span className="coverage-icon">{plan.coverage.liability ? '&#10003;' : '&#10005;'}</span>
                  Liability
                </div>
                <div className={`coverage-item ${plan.coverage.collision ? 'included' : 'excluded'}`}>
                  <span className="coverage-icon">{plan.coverage.collision ? '&#10003;' : '&#10005;'}</span>
                  Collision
                </div>
                <div className={`coverage-item ${plan.coverage.comprehensive ? 'included' : 'excluded'}`}>
                  <span className="coverage-icon">{plan.coverage.comprehensive ? '&#10003;' : '&#10005;'}</span>
                  Comprehensive
                </div>
                <div className={`coverage-item ${plan.coverage.roadsideAssistance ? 'included' : 'excluded'}`}>
                  <span className="coverage-icon">{plan.coverage.roadsideAssistance ? '&#10003;' : '&#10005;'}</span>
                  Roadside
                </div>
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
