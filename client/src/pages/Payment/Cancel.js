import React from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import Navbar from '../../components/Navbar';
import './Payment.css';

const PaymentCancel = () => {
  const [searchParams] = useSearchParams();
  const bookingId = searchParams.get('booking_id');
  const navigate = useNavigate();

  return (
    <div>
      <Navbar />
      <div className="payment-page">
        <div className="container">
          <div className="payment-status cancel">
            <div className="status-icon">⚠️</div>
            <h2>Payment Cancelled</h2>
            <p className="cancel-message">
              Your payment was not completed. Your booking is still pending payment.
            </p>

            <div className="cancel-info">
              <h3>What Happened?</h3>
              <p>
                You cancelled the payment process or closed the payment window.
                Don't worry - your booking reservation is still saved!
              </p>

              <h3>What's Next?</h3>
              <ul>
                <li>You can try completing the payment again from your bookings page</li>
                <li>Your booking will be held for 24 hours</li>
                <li>After 24 hours without payment, the booking will be automatically cancelled</li>
              </ul>
            </div>

            <div className="action-buttons">
              {bookingId && (
                <button
                  onClick={() => navigate(`/payment/checkout?booking_id=${bookingId}`)}
                  className="btn btn-primary"
                >
                  Try Payment Again
                </button>
              )}
              <button
                onClick={() => navigate('/driver/my-bookings')}
                className="btn btn-secondary"
              >
                View My Bookings
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PaymentCancel;
