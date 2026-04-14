import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './GuidePages.css';

const DriverGuide = () => {
  return (
    <div className="guide-page">
      <Navbar />

      <section className="guide-hero">
        <div className="container">
          <h1 className="guide-hero-title">
            <span className="brand-highlight">Driver</span> Guide
          </h1>
          <p className="guide-hero-subtitle">
            Everything you need to know about renting a car on UFS.
          </p>
        </div>
      </section>

      <section className="guide-content">
        <div className="container">
          <div className="guide-steps">
            <div className="guide-step">
              <div className="guide-step-number">1</div>
              <div className="guide-step-content">
                <h2>Create Your Account</h2>
                <p>
                  Sign up for free on UFS. You'll need to provide your email, create a password, and verify your identity. We'll also ask for your driver's license information to ensure everyone on the platform is a verified driver.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">2</div>
              <div className="guide-step-content">
                <h2>Browse the Marketplace</h2>
                <p>
                  Explore our marketplace to find the perfect vehicle. Filter by vehicle type, location, price range, number of seats, and more. Use the map view to find cars near you. Each listing includes detailed photos, features, and pricing.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">3</div>
              <div className="guide-step-content">
                <h2>Book Your Vehicle</h2>
                <p>
                  Found the right car? Select your rental dates and choose between daily, weekly, or monthly pricing. Pick your insurance coverage level during checkout. Once you submit your booking request, the host will review and confirm.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">4</div>
              <div className="guide-step-content">
                <h2>Pick Up & Drive</h2>
                <p>
                  After your booking is confirmed and payment is processed, coordinate with the host for vehicle pickup. Complete the pickup inspection together to document the vehicle's condition, then you're ready to hit the road.
                </p>
              </div>
            </div>

            <div className="guide-step">
              <div className="guide-step-number">5</div>
              <div className="guide-step-content">
                <h2>Return & Review</h2>
                <p>
                  When your trip is complete, return the vehicle and complete the return inspection with the host. After the trip, leave a review to help other drivers and hosts in the community. Need more time? You can request a trip extension directly through the platform.
                </p>
              </div>
            </div>
          </div>

          <div className="guide-info-cards">
            <div className="guide-info-card">
              <h3>Insurance Coverage</h3>
              <p>Every booking includes insurance options. Choose from multiple coverage tiers during checkout to match your needs and budget. Drive with peace of mind knowing you're protected.</p>
            </div>
            <div className="guide-info-card">
              <h3>Flexible Rentals</h3>
              <p>Rent for a day, a week, or a month. Need to extend? Request an extension anytime during your trip. Our flexible pricing adapts to your schedule.</p>
            </div>
            <div className="guide-info-card">
              <h3>Support When You Need It</h3>
              <p>Have questions or run into issues? Our support team is here to help. From booking questions to trip concerns, we're committed to making your experience smooth.</p>
            </div>
          </div>

          <div className="guide-cta">
            <h2>Ready to Find Your Perfect Ride?</h2>
            <p>Browse our marketplace and book a vehicle today.</p>
            <Link to="/marketplace" className="btn btn-primary btn-lg">Browse Cars</Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default DriverGuide;
