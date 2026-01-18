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
  const [elementReady, setElementReady] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!stripe || !elements) {
      setErrorMessage('Payment system not ready. Please refresh the page.');
      return;
    }

    setProcessing(true);
    setErrorMessage('');

    try {
      // Add timeout to prevent infinite waiting
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Payment request timed out. Please try again.')), 30000)
      );

      const paymentPromise = stripe.confirmPayment({
        elements,
        redirect: 'if_required',
      });

      const result = await Promise.race([paymentPromise, timeoutPromise]);
      const { error, paymentIntent } = result;

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
          // Payment is still processing
          setErrorMessage('Payment is being processed. Please wait...');
          setProcessing(false);
        } else if (paymentIntent.status === 'requires_action') {
          // 3D Secure or additional authentication required
          setProcessing(false);
          setErrorMessage('Additional authentication required. Please complete the verification.');
        } else {
          // Handle other statuses
          setProcessing(false);
          setErrorMessage(`Payment status: ${paymentIntent.status}. Please try again.`);
          if (onError) onError({ message: `Payment ${paymentIntent.status}` });
        }
      } else {
        setProcessing(false);
        setErrorMessage('An unexpected error occurred. Please try again.');
      }
    } catch (err) {
      // Handle timeout or any other unexpected errors
      setProcessing(false);
      setErrorMessage(err.message || 'Payment failed. Please try again.');
      if (onError) onError(err);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="checkout-form">
      <div className="payment-form-section">
        <h3>Payment Details</h3>
        {!elementReady && (
          <div className="payment-loading">
            <div className="spinner"></div>
            <p>Loading payment form...</p>
          </div>
        )}
        <PaymentElement
          onReady={() => setElementReady(true)}
          onLoadError={(error) => setErrorMessage(`Failed to load payment form: ${error.message}`)}
        />
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
        disabled={!stripe || !elementReady || processing}
        className="btn btn-primary btn-pay"
      >
        {!elementReady ? 'Loading...' : processing ? 'Processing payment...' : `Pay $${booking?.totalPrice?.toFixed(2)}`}
      </button>

      <p className="payment-secure-notice">
        🔒 Your payment is secure and encrypted
      </p>
    </form>
  );
};

export default CheckoutForm;
