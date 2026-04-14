import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './GuidePages.css';

const HostGuide = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="guide-page">
      <Navbar />

      <section className="guide-hero">
        <div className="container">
          <h1 className="guide-hero-title">
            <span className="brand-highlight">Host</span> Guide
          </h1>
          <p className="guide-hero-subtitle">
            Everything you need to know about listing your vehicle and earning on UFS.
          </p>
        </div>
      </section>

      <section className="guide-content">
        <div className="container">
          <div className="guide-steps">
            <div className="guide-step">
              <div className="guide-step-number">1</div>
              <div className="guide-step-content">
                <h2>Register as a Host</h2>
                <p>
                  Already have a driver account? You can upgrade to a host account in minutes. New to UFS? Sign up and select "Host" during registration. We'll verify your identity and you'll be ready to list your first vehicle.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">2</div>
              <div className="guide-step-content">
                <h2>List Your Vehicle</h2>
                <p>
                  Add your vehicle details including make, model, year, features, and high-quality photos. Set your own daily, weekly, and monthly pricing. Add a description that highlights what makes your vehicle special. The more detail you provide, the more bookings you'll attract.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">3</div>
              <div className="guide-step-content">
                <h2>Manage Bookings</h2>
                <p>
                  When a driver requests your vehicle, you'll receive a notification. Review the booking details and the driver's profile, then approve or decline. Your host dashboard gives you a complete overview of all your bookings, vehicles, and earnings.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">4</div>
              <div className="guide-step-content">
                <h2>Hand Off & Inspect</h2>
                <p>
                  When a driver picks up your vehicle, complete the pickup inspection together. Document the vehicle's condition with photos. This protects both you and the driver. The same process happens at return.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">5</div>
              <div className="guide-step-content">
                <h2>Earn & Grow</h2>
                <p>
                  After each completed trip, you receive your payout directly to your bank account. Track your earnings, view reports, and optimize your listings from your host dashboard. The more vehicles you list, the more you earn.
                </p>
              </div>
            </div>
          </div>

          <div className="guide-info-cards">
            <div className="guide-info-card">
              <h3>Zero Commission</h3>
              <p>Unlike other platforms that take 25-40% of your earnings, UFS charges a flat low fee. You keep more of what you earn, every single trip.</p>
            </div>
            <div className="guide-info-card">
              <h3>Insurance Protection</h3>
              <p>Your vehicles are protected on every trip. Our insurance coverage gives you peace of mind while your car is out earning money for you.</p>
            </div>
            <div className="guide-info-card">
              <h3>Host Dashboard</h3>
              <p>Track bookings, manage vehicles, view earnings reports, and handle payouts all from one intuitive dashboard designed for hosts.</p>
            </div>
          </div>

          <div className="guide-cta">
            <h2>Ready to Start Earning?</h2>
            <p>List your first vehicle and start receiving booking requests.</p>
            <Link to={isAuthenticated ? "/host/add-vehicle" : "/register?type=host"} className="btn btn-primary btn-lg">
              List Your Car
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default HostGuide;
