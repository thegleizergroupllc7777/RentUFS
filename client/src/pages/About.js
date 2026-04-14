import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './GuidePages.css';

const About = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="guide-page">
      <Navbar />

      <section className="guide-hero">
        <div className="container">
          <h1 className="guide-hero-title">
            About <span className="brand-highlight">UFS</span>
          </h1>
          <p className="guide-hero-subtitle">
            Making car rental simple, fair, and accessible for everyone.
          </p>
        </div>
      </section>

      <section className="about-content">
        <div className="container">
          <div className="about-section">
            <h2>Our Mission</h2>
            <p>
              UFS was built with a simple idea: car rental should be easy, transparent, and fair for everyone involved. We connect vehicle owners with drivers who need a ride, cutting out the middleman and creating a community built on trust.
            </p>
          </div>

          <div className="about-section">
            <h2>What Makes Us Different</h2>
            <div className="about-values">
              <div className="about-value">
                <h3>Zero Commission</h3>
                <p>We believe hosts should keep what they earn. That's why we charge a flat low fee instead of taking a percentage of every booking. More money in your pocket, every trip.</p>
              </div>
              <div className="about-value">
                <h3>Trust First</h3>
                <p>Every user on our platform is verified. Our review system, vehicle inspections, and insurance coverage create a safe environment for both hosts and drivers.</p>
              </div>
              <div className="about-value">
                <h3>Simplicity</h3>
                <p>No hidden fees, no complicated terms. Our platform is designed to make listing a car or booking a ride as straightforward as possible.</p>
              </div>
              <div className="about-value">
                <h3>Community</h3>
                <p>We're more than a platform. We're a community of vehicle owners and drivers helping each other. Your success is our success.</p>
              </div>
            </div>
          </div>

          <div className="about-section">
            <h2>For Drivers</h2>
            <p>
              Whether you need a car for a weekend trip, a daily commute, or something special, UFS gives you access to a wide variety of vehicles at competitive prices. Browse listings in your area, book with confidence knowing you're covered by insurance, and enjoy the flexibility of daily, weekly, or monthly rentals.
            </p>
          </div>

          <div className="about-section">
            <h2>For Hosts</h2>
            <p>
              Turn your vehicle into an income source. List your car on UFS and start earning from day one. With zero commission, insurance protection, and a dedicated host dashboard, we give you the tools to manage your vehicle rental business with ease. Whether you have one car or a fleet, UFS scales with you.
            </p>
          </div>

          <div className="guide-cta">
            <h2>Join the UFS Community</h2>
            <p>Whether you're looking to rent or earn, we'd love to have you.</p>
            <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
              <Link to="/marketplace" className="btn btn-primary btn-lg">Browse Cars</Link>
              <Link to={isAuthenticated ? "/host/add-vehicle" : "/register?type=host"} className="btn btn-outline btn-lg" style={{ borderColor: '#00FF66', color: '#00FF66' }}>
                List Your Car
              </Link>
            </div>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default About;
