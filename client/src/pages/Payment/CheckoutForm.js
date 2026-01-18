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
    } else if (paymentIntent) {
      // Handle all payment intent statuses
      if (paymentIntent.status === 'succeeded') {
        // Payment successful
        setProcessing(false);
        if (onSuccess) onSuccess(paymentIntent.id);
      } else if (paymentIntent.status === 'processing') {
        // Payment is still processing - keep user informed
        setErrorMessage('Payment is being processed. Please wait...');
        // Don't reset processing - payment is still in progress
      } else if (paymentIntent.status === 'requires_action') {
        // 3D Secure or additional authentication required
        // Stripe handles this automatically with redirect: 'if_required'
        setProcessing(false);
        setErrorMessage('Additional authentication required. Please complete the verification.');
      } else {
        // Handle other statuses (requires_payment_method, canceled, etc.)
        setProcessing(false);
        setErrorMessage(`Payment status: ${paymentIntent.status}. Please try again.`);
        if (onError) onError({ message: `Payment ${paymentIntent.status}` });
      }
    } else {
      // No error and no paymentIntent - unexpected state
      setProcessing(false);
      setErrorMessage('An unexpected error occurred. Please try again.');
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
