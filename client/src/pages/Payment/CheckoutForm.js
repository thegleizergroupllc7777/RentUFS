import React, { useState } from 'react';
import {
  PaymentElement,
  useStripe,
  useElements
} from '@stripe/react-stripe-js';
import './Payment.css';

const CheckoutForm = ({ booking, bookingId, onSuccess, onError }) => {
  const stripe = useStripe();
  const elements = useElements();

  const [processing, setProcessing] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      return;
    }

    setProcessing(true);
    setErrorMessage('');

    const {error, paymentIntent} = await stripe.confirmPayment({
      elements,
      redirect: 'if_required',
    });

    if (error) {
      setErrorMessage(error.message);
      setProcessing(false);
      if (onError) onError(error);
    } else if (paymentIntent && paymentIntent.status === 'succeeded') {
      // Payment successful
      setProcessing(false);
      if (onSuccess) onSuccess(paymentIntent.id);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <div className="payment-form-section">
        <h3>Payment Details</h3>
        <PaymentElement />
      </div>

      {errorMessage && (
        <div className="payment-error">
          ❌ {errorMessage}
        </div>
      )}

      <div className="form-total">
        <span>Total Amount:</span>
        <span className="total-amount">${booking?.totalPrice?.toFixed(2)}</span>
      </div>

      <button
        type="submit"
        disabled={!stripe || processing}
        className="btn btn-primary btn-pay"
      >
        {processing ? 'Processing payment...' : `Pay $${booking?.totalPrice?.toFixed(2)}`}
      </button>

      <p className="payment-secure-notice">
        🔒 Your payment is secure and encrypted
      </p>
    </form>
  );
};

export default CheckoutForm;
