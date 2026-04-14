import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './Home.css';

const faqData = [
  {
    question: 'How does booking a car on UFS work?',
    answer: 'Browse our marketplace, pick a vehicle that fits your needs, choose your dates, and book instantly. Once the host confirms, you\'ll receive pickup details and you\'re ready to go.'
  },
  {
    question: 'What insurance coverage is included?',
    answer: 'Every booking on UFS includes insurance protection. You can choose from multiple coverage tiers during checkout to match your comfort level and budget.'
  },
  {
    question: 'How do hosts get paid?',
    answer: 'Hosts receive payouts directly to their bank account after each completed trip. We charge a flat low fee with ZERO commission — you keep more of what you earn.'
  },
  {
    question: 'What happens if there\'s damage to the vehicle?',
    answer: 'Our insurance coverage protects both drivers and hosts. In the event of damage, our support team guides you through the claims process to ensure a fair resolution.'
  },
  {
    question: 'Can I extend my rental?',
    answer: 'Yes! You can request a trip extension directly through the platform. If the host approves and the vehicle is available, your rental is seamlessly extended.'
  },
  {
    question: 'What types of vehicles are available?',
    answer: 'UFS offers a wide range of vehicles including sedans, SUVs, trucks, vans, sports cars, luxury vehicles, and electric cars. Find exactly what you need for any occasion.'
  }
];

const Home = () => {
  const { isAuthenticated, user } = useAuth();
  const isHost = user?.userType === 'host' || user?.userType === 'both';
  const [openFaq, setOpenFaq] = useState(null);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  return (
    <div className="home-page">
      <Navbar />

      {/* Hero Section */}
      <section className="hero">
        <div className="hero-overlay"></div>
        <div className="container">
          <div className="hero-content">
            <h1 className="hero-title">
              Rent the Perfect Car for Every Journey
            </h1>
            <p className="hero-subtitle">
              Join thousands of drivers and hosts on <span className="brand-highlight">UFS</span>, the trusted peer-to-peer car rental marketplace.
            </p>
            <div className="hero-buttons">
              <Link to={isHost ? "/host/dashboard" : "/marketplace"}>
                <button className="btn btn-primary btn-lg">
                  {isHost ? 'My Dashboard' : 'Browse Cars'}
                </button>
              </Link>
              <Link to={isHost ? "/host/add-vehicle" : (isAuthenticated ? "/host/add-vehicle" : "/register?type=host")}>
                <button className="btn btn-outline btn-lg">
                  List Your Car
                </button>
              </Link>
            </div>
          </div>
        </div>
        <div className="hero-scroll-indicator">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" strokeWidth="2">
            <polyline points="6 9 12 15 18 9"></polyline>
          </svg>
        </div>
      </section>

      {/* Drive with UFS Section */}
      <section className="info-section info-section--dark">
        <div className="container">
          <div className="info-grid">
            <div className="info-text">
              <h2 className="info-title">
                <span className="brand-highlight">Drive</span> with UFS
              </h2>
              <p className="info-subtitle">Seamless renting at your fingertips.</p>
              <ul className="info-list">
                <li>
                  <strong>Find Your Ideal Vehicle:</strong> Choose from a wide range of vehicles for personal use, road trips, or everyday driving.
                </li>
                <li>
                  <strong>Simple Booking:</strong> Verify your account and book a vehicle with just a few clicks. No haggling, no hassle.
                </li>
                <li>
                  <strong>Flexible Usage:</strong> Choose how long you want to rent — daily, weekly, or monthly — and extend your trip at any time.
                </li>
                <li>
                  <strong>Insurance Included:</strong> Every rental comes with insurance coverage so you can drive with peace of mind.
                </li>
              </ul>
              <div className="info-buttons">
                <Link to="/driver-guide" className="btn btn-outline">Learn More</Link>
                <Link to="/marketplace" className="btn btn-primary">Find a Car</Link>
              </div>
            </div>
            <div className="info-image">
              <div className="info-image-placeholder">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="1.5">
                  <rect x="1" y="3" width="15" height="13" rx="2" ry="2"></rect>
                  <polygon points="16 8 20 12 16 16 16 8"></polygon>
                  <line x1="23" y1="5" x2="23" y2="19"></line>
                  <path d="M5 21a7 7 0 0 1 0-14"></path>
                </svg>
                <p>Driver Experience</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Host with UFS Section */}
      <section className="info-section info-section--light">
        <div className="container">
          <div className="info-grid info-grid--reversed">
            <div className="info-text">
              <h2 className="info-title">
                <span className="brand-highlight">Host</span> with UFS
              </h2>
              <p className="info-subtitle">Rent out your vehicle and earn every month.</p>
              <ul className="info-list">
                <li>
                  <strong>Zero Commission:</strong> Unlike other platforms, we charge a flat low fee. You keep more of what you earn.
                </li>
                <li>
                  <strong>Insurance Protection:</strong> Keep your cars protected and rest easy with our insurance policies. We've got you covered.
                </li>
                <li>
                  <strong>Expand Your Reach:</strong> Showcase your vehicles to a larger audience of vetted, verified drivers.
                </li>
                <li>
                  <strong>Dedicated Support:</strong> From vehicle listing to booking management, our team is here to help you succeed.
                </li>
              </ul>
              <div className="info-buttons">
                <Link to="/host-guide" className="btn btn-outline-dark">Learn More</Link>
                <Link to={isAuthenticated ? "/host/add-vehicle" : "/register?type=host"} className="btn btn-primary">List a Car</Link>
              </div>
            </div>
            <div className="info-image">
              <div className="info-image-placeholder info-image-placeholder--light">
                <svg width="80" height="80" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="1.5">
                  <line x1="12" y1="1" x2="12" y2="23"></line>
                  <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                </svg>
                <p>Start Earning</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why Choose UFS Section */}
      <section className="why-section">
        <div className="why-grid">
          <div className="why-text">
            <span className="why-label">Why Choose UFS?</span>
            <h2 className="why-title">
              Personal use or business, we've got you covered.
            </h2>
            <p className="why-description">
              Whether you're looking for a weekend getaway car, a reliable daily driver, or want to earn money from your vehicle, our platform caters to all your rental needs under one roof.
            </p>
            <div className="why-tags">
              <span className="why-tag">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="16"></line><line x1="8" y1="12" x2="16" y2="12"></line></svg>
                Versatile Solutions
              </span>
              <span className="why-tag">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="2"><polyline points="17 1 21 5 17 9"></polyline><path d="M3 11V9a4 4 0 0 1 4-4h14"></path><polyline points="7 23 3 19 7 15"></polyline><path d="M21 13v2a4 4 0 0 1-4 4H3"></path></svg>
                Streamlined
              </span>
            </div>
            <Link to={isAuthenticated ? "/marketplace" : "/register"} className="btn btn-primary" style={{ marginTop: '1.5rem' }}>
              Get Started
            </Link>
          </div>
          <div className="why-features">
            <div className="why-feature-item why-feature-item--active">
              <h3>All-in-One Platform</h3>
              <p>Search, book, pay, and manage everything from one place. No jumping between apps or websites.</p>
            </div>
            <div className="why-feature-item">
              <h3>Verified Community</h3>
              <p>Every driver and host is verified. Our review system and community ratings ensure trust and accountability.</p>
            </div>
            <div className="why-feature-item">
              <h3>Simplicity First</h3>
              <p>No hidden fees, no complex pricing. Transparent rates and a booking process that takes minutes, not hours.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Guide Cards Section */}
      <section className="guides-section">
        <div className="container">
          <h2 className="section-title">Transform Your Rental Experience</h2>
          <p className="section-subtitle">
            Whether you're a vehicle owner looking to maximize earnings or a driver in need of the perfect vehicle, UFS offers unparalleled flexibility, ease, and support.
          </p>
          <p className="section-subtitle" style={{ marginTop: '0.5rem' }}>
            Join us today and redefine your rental experience.
          </p>
          <div className="guide-cards">
            <Link to="/driver-guide" className="guide-card">
              <div className="guide-card-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="1.5">
                  <circle cx="12" cy="12" r="10"></circle>
                  <path d="M8 14s1.5 2 4 2 4-2 4-2"></path>
                  <line x1="9" y1="9" x2="9.01" y2="9"></line>
                  <line x1="15" y1="9" x2="15.01" y2="9"></line>
                </svg>
              </div>
              <div className="guide-card-content">
                <h3>Driver Guide</h3>
                <p>Verification, car selection, and driving</p>
              </div>
              <span className="guide-card-cta">Get Started</span>
            </Link>
            <Link to="/host-guide" className="guide-card">
              <div className="guide-card-icon">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="1.5">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
                </svg>
              </div>
              <div className="guide-card-content">
                <h3>Owner Guide</h3>
                <p>Listing, earning, and managing</p>
              </div>
              <span className="guide-card-cta">Get Started</span>
            </Link>
          </div>
        </div>
      </section>

      {/* Testimonials Section */}
      <section className="testimonials-section">
        <div className="container">
          <h2 className="section-title" style={{ color: '#ffffff' }}>See Why Our Customers Love UFS</h2>
          <div className="testimonials-grid">
            <div className="testimonial-card">
              <div className="testimonial-stars">
                {'★'.repeat(5)}
              </div>
              <p className="testimonial-text">
                "As someone who rents out cars, UFS has honestly made my life a lot easier. Managing bookings, staying organized, and connecting with the right renters is way smoother now. I'm really happy I chose UFS."
              </p>
              <div className="testimonial-author">
                <strong>Marcus T.</strong>
                <span>Vehicle Host</span>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="testimonial-stars">
                {'★'.repeat(5)}
              </div>
              <p className="testimonial-text">
                "I've been using UFS for a while now, and I can confidently say it's one of the best rental services out there! The cars are clean, comfortable, and well-maintained, making every ride a smooth experience."
              </p>
              <div className="testimonial-author">
                <strong>Sarah K.</strong>
                <span>Driver</span>
              </div>
            </div>
            <div className="testimonial-card">
              <div className="testimonial-stars">
                {'★'.repeat(5)}
              </div>
              <p className="testimonial-text">
                "UFS has allowed us to maximize utilization of our fleet through consistent rental demand. The user interface is mobile and desktop friendly, making fleet management easier for our staff."
              </p>
              <div className="testimonial-author">
                <strong>James R.</strong>
                <span>Fleet Owner</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="faq-section">
        <div className="container">
          <h2 className="faq-title">Frequently Asked Questions</h2>
          <div className="faq-list">
            {faqData.map((item, index) => (
              <div
                key={index}
                className={`faq-item ${openFaq === index ? 'faq-item--open' : ''}`}
              >
                <button
                  className="faq-question"
                  onClick={() => toggleFaq(index)}
                >
                  <span>{item.question}</span>
                  <svg
                    className="faq-chevron"
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                <div className="faq-answer">
                  <p>{item.answer}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="final-cta">
        <div className="container text-center">
          <h2 className="final-cta-title">
            Not sure if UFS is right for you?
          </h2>
          <p className="final-cta-subtitle">
            Try a daily rental option and experience the flexibility you deserve.
          </p>
          <Link to={isAuthenticated ? (isHost ? "/host/dashboard" : "/marketplace") : "/register"}>
            <button className="btn btn-white btn-lg">
              {isAuthenticated ? (isHost ? 'Go to Dashboard' : 'Browse Cars') : 'Get Started'}
            </button>
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
