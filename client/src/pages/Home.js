import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import './Home.css';

const Home = () => {
  return (
    <div className="home-page">
      <Navbar />

      <div className="hero">
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">
              Rent the Perfect Car for Every Journey
            </h1>
            <p className="hero-subtitle">
              Join thousands of drivers and hosts on <span style={{color: '#10b981', fontWeight: 'bold'}}>RentUFS</span>, the trusted peer-to-peer car rental marketplace.
            </p>
            <div className="hero-buttons">
              <Link to="/marketplace">
                <button className="btn btn-primary btn-lg">
                  Browse Cars
                </button>
              </Link>
              <Link to="/register">
                <button className="btn btn-secondary btn-lg">
                  List Your Car
                </button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="features">
        <div className="container">
          <h2 className="text-center text-3xl font-bold mb-4">
            How It Works
          </h2>

          <div className="grid grid-cols-3 mt-4">
            <div className="feature-card">
              <div className="feature-icon">🚗</div>
              <h3 className="feature-title">For Drivers</h3>
              <p className="feature-description">
                Browse thousands of cars, book instantly, and hit the road. Find everything from daily drivers to luxury vehicles.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">💰</div>
              <h3 className="feature-title">For Hosts</h3>
              <p className="feature-description">
                List your car and start earning. Set your own prices and availability. We handle insurance and payments.
              </p>
            </div>

            <div className="feature-card">
              <div className="feature-icon">⭐</div>
              <h3 className="feature-title">Trust & Safety</h3>
              <p className="feature-description">
                Every booking is protected. Our verification system and review community ensure safe, reliable experiences.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="cta-section">
        <div className="container text-center">
          <h2 className="text-3xl font-bold mb-2">
            Ready to Get Started?
          </h2>
          <p className="text-lg text-gray mb-3">
            Join our community today as a driver or host
          </p>
          <Link to="/register">
            <button className="btn btn-primary btn-lg">
              Sign Up Now
            </button>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Home;
