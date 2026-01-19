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
      switch (paymentIntent.status) {
        case 'succeeded':
          // Payment successful
          setProcessing(false);
          if (onSuccess) onSuccess(paymentIntent.id);
          break;
        case 'processing':
          // Payment is processing asynchronously
          setErrorMessage('Your payment is being processed. Please wait...');
          // Keep checking the payment status
          setTimeout(() => setProcessing(false), 3000);
          break;
        case 'requires_action':
          // 3D Secure or additional authentication required
          setErrorMessage('Additional authentication required. Please complete the verification.');
          setProcessing(false);
          break;
        case 'requires_payment_method':
          // Payment method failed or was declined
          setErrorMessage('Payment failed. Please try a different payment method.');
          setProcessing(false);
          if (onError) onError({ message: 'Payment method failed' });
          break;
        default:
          // Handle any other unexpected status
          setErrorMessage(`Unexpected payment status: ${paymentIntent.status}. Please try again.`);
          setProcessing(false);
          if (onError) onError({ message: `Unexpected status: ${paymentIntent.status}` });
      }
    } else {
      // No paymentIntent and no error - shouldn't happen but handle it
      setErrorMessage('Something went wrong. Please try again.');
      setProcessing(false);
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
