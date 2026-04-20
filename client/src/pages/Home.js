import React, { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './Home.css';

const featureCards = [
  {
    title: 'Wide Selection',
    description: 'Choose from sedans, SUVs, trucks, luxury, sports and electric vehicles all in one marketplace.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
        <circle cx="6.5" cy="16.5" r="2.5"/>
        <circle cx="16.5" cy="16.5" r="2.5"/>
      </svg>
    )
  },
  {
    title: 'Affordable Prices',
    description: 'Transparent daily, weekly and monthly rates with zero hidden fees. Drivers save, hosts earn more.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="1" x2="12" y2="23"/>
        <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
      </svg>
    )
  },
  {
    title: 'Easy Booking',
    description: 'Reserve a vehicle in minutes. Verify, pick your dates, pay securely and hit the road.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
        <line x1="16" y1="2" x2="16" y2="6"/>
        <line x1="8" y1="2" x2="8" y2="6"/>
        <line x1="3" y1="10" x2="21" y2="10"/>
        <polyline points="9 16 11 18 15 14"/>
      </svg>
    )
  },
  {
    title: '24/7 Support',
    description: 'Our team is available around the clock to help drivers and hosts with every step of the journey.',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8h1a4 4 0 0 1 0 8h-1"/>
        <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"/>
        <line x1="6" y1="1" x2="6" y2="4"/>
        <line x1="10" y1="1" x2="10" y2="4"/>
        <line x1="14" y1="1" x2="14" y2="4"/>
      </svg>
    )
  }
];

const stats = [
  { value: '24/7', label: 'Support', description: 'Around-the-clock help whenever you need it.' },
  { value: '5,000+', label: 'Happy Customers', description: 'Drivers and hosts trust UFS every month.' },
  { value: '99%', label: 'Satisfaction', description: 'Top-rated experience from rental to return.' }
];

const blogPosts = [
  {
    id: 1,
    category: 'Driver Tips',
    date: 'April 10, 2026',
    title: 'The Ultimate Guide to Renting on UFS',
    excerpt: 'Everything you need to know about finding and booking the perfect vehicle for your next journey.',
    image: '/images/blog-1.jpg'
  },
  {
    id: 2,
    category: 'Host Tips',
    date: 'April 8, 2026',
    title: 'How to Maximize Your Earnings as a Host',
    excerpt: 'Proven strategies to optimize your listing, set competitive pricing and attract more bookings.',
    image: '/images/blog-2.jpg'
  },
  {
    id: 3,
    category: 'Safety',
    date: 'April 5, 2026',
    title: 'Understanding Insurance Coverage on UFS',
    excerpt: 'A detailed breakdown of coverage options so you can rent and host with total confidence.',
    image: '/images/blog-3.jpg'
  }
];

const faqData = [
  {
    question: 'How does booking a car on UFS work?',
    answer: "Browse our marketplace, pick a vehicle that fits your needs, choose your dates, and book instantly. Once the host confirms, you'll receive pickup details and you're ready to go."
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
    question: "What happens if there's damage to the vehicle?",
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

/*
 * Image backgrounds are applied via inline styles so that webpack (CRA)
 * does not try to resolve these public-folder URLs at build time. If a
 * file is missing from /public/images/, the browser simply skips that
 * url() layer and the gradient fallbacks below it still render.
 */
const heroBgStyle = {
  backgroundImage:
    "linear-gradient(135deg, rgba(10, 10, 10, 0.78) 0%, rgba(10, 10, 10, 0.55) 50%, rgba(31, 41, 55, 0.72) 100%), " +
    "url('/images/hero.jpg'), " +
    "radial-gradient(ellipse at 70% 40%, rgba(0, 255, 102, 0.12), transparent 60%), " +
    "linear-gradient(135deg, #0a0a0a 0%, #151515 50%, #1f2937 100%)",
  backgroundSize: 'cover, cover, auto, auto',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
};

const showcaseBgStyle = {
  backgroundImage:
    "linear-gradient(90deg, rgba(10, 10, 10, 0.82) 0%, rgba(26, 26, 26, 0.55) 50%, rgba(10, 10, 10, 0.82) 100%), " +
    "url('/images/showcase.jpg'), " +
    "radial-gradient(ellipse at 20% 50%, rgba(0, 255, 102, 0.1), transparent 50%), " +
    "linear-gradient(90deg, #0a0a0a 0%, #1a1a1a 50%, #0a0a0a 100%)",
  backgroundSize: 'cover, cover, auto, auto',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
};

const searchImageStyle = {
  backgroundImage:
    "linear-gradient(135deg, rgba(10, 10, 10, 0.55) 0%, rgba(31, 41, 55, 0.4) 100%), " +
    "url('/images/showroom.jpg'), " +
    "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)",
  backgroundSize: 'cover, cover, auto',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
};

const audienceVisualDarkStyle = {
  backgroundImage:
    "linear-gradient(135deg, rgba(21, 21, 21, 0.45) 0%, rgba(31, 41, 55, 0.3) 100%), " +
    "url('/images/drive.jpg'), " +
    "linear-gradient(135deg, #151515 0%, #1f2937 100%)",
  backgroundSize: 'cover, cover, auto',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
};

const audienceVisualLightStyle = {
  backgroundImage:
    "linear-gradient(135deg, rgba(10, 10, 10, 0.45) 0%, rgba(31, 41, 55, 0.3) 100%), " +
    "url('/images/host.jpg'), " +
    "linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)",
  backgroundSize: 'cover, cover, auto',
  backgroundPosition: 'center',
  backgroundRepeat: 'no-repeat'
};

const Home = () => {
  const { isAuthenticated, user } = useAuth();
  const isHost = user?.userType === 'host' || user?.userType === 'both';
  const [openFaq, setOpenFaq] = useState(null);
  const pageRef = useRef(null);

  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };

  useEffect(() => {
    const els = pageRef.current?.querySelectorAll('[data-animate]');
    if (!els || els.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          } else {
            entry.target.classList.remove('is-visible');
          }
        });
      },
      { threshold: 0.15 }
    );

    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="home-page" ref={pageRef}>
      <Navbar />

      {/* Hero Section */}
      <section className="ufs-hero">
        <div className="ufs-hero-bg" style={heroBgStyle}></div>
        <div className="ufs-hero-overlay"></div>
        <div className="container ufs-hero-container">
          <div className="ufs-hero-location" data-animate style={{ transitionDelay: '0.1s' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
              <circle cx="12" cy="10" r="3"/>
            </svg>
            <span>Jersey City, NJ</span>
          </div>
          <h1 className="ufs-hero-title" data-animate style={{ transitionDelay: '0.25s' }}>
            Rent the perfect car<br />for your next <span className="ufs-hero-accent">adventure</span>
          </h1>
          <p className="ufs-hero-subtitle" data-animate style={{ transitionDelay: '0.4s' }}>
            A peer-to-peer marketplace connecting drivers and hosts. Book in minutes, drive in confidence — every trip backed by insurance and 24/7 support.
          </p>
          <div className="ufs-hero-actions" data-animate style={{ transitionDelay: '0.55s' }}>
            <Link to={isHost ? '/host/dashboard' : '/marketplace'}>
              <button className="ufs-btn ufs-btn-primary">
                {isHost ? 'My Dashboard' : 'Browse Cars'}
              </button>
            </Link>
            <Link to={isHost ? '/host/add-vehicle' : (isAuthenticated ? '/host/add-vehicle' : '/register?type=host')}>
              <button className="ufs-btn ufs-btn-outline-light">
                List Your Car
              </button>
            </Link>
          </div>
        </div>
      </section>

      {/* Feature Cards Section */}
      <section className="ufs-features">
        <div className="container">
          <div className="ufs-features-grid">
            {featureCards.map((card, idx) => (
              <div key={idx} className="ufs-feature-card" data-animate style={{ transitionDelay: `${idx * 0.15}s` }}>
                <div className="ufs-feature-icon">{card.icon}</div>
                <h3 className="ufs-feature-title">{card.title}</h3>
                <p className="ufs-feature-desc">{card.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Visual Break / Showcase */}
      <section className="ufs-showcase">
        <div className="ufs-showcase-bg" style={showcaseBgStyle}></div>
        <div className="container ufs-showcase-content">
          <span className="ufs-showcase-eyebrow" data-animate style={{ transitionDelay: '0.1s' }}>Premium Fleet Access</span>
          <h2 className="ufs-showcase-title" data-animate style={{ transitionDelay: '0.25s' }}>From daily drivers to dream machines.</h2>
          <p className="ufs-showcase-desc" data-animate style={{ transitionDelay: '0.4s' }}>
            Whether you need a reliable sedan for your commute or a sports car for the weekend, UFS gives you the keys.
          </p>
          <div data-animate style={{ transitionDelay: '0.55s' }}>
            <Link to="/marketplace">
              <button className="ufs-btn ufs-btn-primary">Explore the Marketplace</button>
            </Link>
          </div>
        </div>
      </section>

      {/* Who We Are Section */}
      <section className="ufs-who">
        <div className="container">
          <div className="ufs-who-grid">
            <div className="ufs-who-text">
              <span className="ufs-section-eyebrow" data-animate>Who We Are</span>
              <h2 className="ufs-section-title" data-animate style={{ transitionDelay: '0.1s' }}>Driving excellence in peer-to-peer car rentals.</h2>
              <p className="ufs-section-desc" data-animate style={{ transitionDelay: '0.2s' }}>
                UFS was built by car people for car people. We connect drivers who need a vehicle with hosts who have one to share — all under one trusted, insurance-backed platform.
              </p>
              <p className="ufs-section-desc" data-animate style={{ transitionDelay: '0.3s' }}>
                From daily commuters to weekend adventurers, thousands of members trust UFS to deliver a rental experience that is simple, fair and always reliable.
              </p>
              <Link to="/about" className="ufs-text-link" data-animate style={{ transitionDelay: '0.4s' }}>Learn more about us →</Link>
            </div>
            <div className="ufs-who-stats">
              {stats.map((stat, idx) => (
                <div key={idx} className="ufs-stat-card" data-animate style={{ transitionDelay: `${0.15 + idx * 0.15}s` }}>
                  <div className="ufs-stat-value">{stat.value}</div>
                  <div className="ufs-stat-label">{stat.label}</div>
                  <p className="ufs-stat-desc">{stat.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Your Search Stops Here Section */}
      <section className="ufs-search-stops">
        <div className="container">
          <div className="ufs-search-grid">
            <div className="ufs-search-image" style={searchImageStyle} data-animate="fade-left">
              <div className="ufs-search-image-inner">
                <svg width="100" height="100" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 16H9m10 0h3v-3.15a1 1 0 0 0-.84-.99L16 11l-2.7-3.6a1 1 0 0 0-.8-.4H5.24a2 2 0 0 0-1.8 1.1l-.8 1.63A6 6 0 0 0 2 12.42V16h2"/>
                  <circle cx="6.5" cy="16.5" r="2.5"/>
                  <circle cx="16.5" cy="16.5" r="2.5"/>
                </svg>
                <span>Curated Vehicle Showroom</span>
              </div>
            </div>
            <div className="ufs-search-text">
              <h2 className="ufs-section-title" data-animate style={{ transitionDelay: '0.1s' }}>
                Your search for rentals <span className="ufs-hero-accent">STOPS</span> here!
              </h2>
              <ul className="ufs-check-list">
                <li data-animate style={{ transitionDelay: '0.2s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Verified community:</strong> Every driver and host is ID-verified.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.3s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Zero commission for hosts:</strong> Keep more of every booking.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.4s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Insurance on every trip:</strong> Flexible coverage tiers at checkout.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.5s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Flexible rentals:</strong> Daily, weekly, monthly — extend anytime.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.6s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Transparent pricing:</strong> No hidden fees, no surprises.</span>
                </li>
              </ul>
              <div data-animate style={{ transitionDelay: '0.7s' }}>
                <Link to="/marketplace">
                  <button className="ufs-btn ufs-btn-primary">Find Your Car</button>
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Drive with UFS Section */}
      <section className="ufs-audience ufs-audience--dark">
        <div className="container">
          <div className="ufs-audience-grid">
            <div className="ufs-audience-text">
              <span className="ufs-section-eyebrow" data-animate>For Drivers</span>
              <h2 className="ufs-section-title ufs-section-title--light" data-animate style={{ transitionDelay: '0.1s' }}>
                <span className="ufs-hero-accent">Drive</span> with UFS
              </h2>
              <p className="ufs-section-desc ufs-section-desc--light" data-animate style={{ transitionDelay: '0.2s' }}>
                Seamless renting at your fingertips.
              </p>
              <ul className="ufs-audience-list">
                <li data-animate style={{ transitionDelay: '0.3s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Find Your Ideal Vehicle:</strong> A wide range of cars for road trips, commutes or weekend fun.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.4s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Simple Booking:</strong> Verify your account and reserve a car in just a few clicks.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.5s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Flexible Usage:</strong> Rent daily, weekly or monthly — extend anytime.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.6s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Insurance Included:</strong> Every rental comes with coverage options.</span>
                </li>
              </ul>
              <div className="ufs-audience-actions" data-animate style={{ transitionDelay: '0.7s' }}>
                <Link to="/driver-guide" className="ufs-btn ufs-btn-outline-light">Learn More</Link>
                <Link to="/marketplace" className="ufs-btn ufs-btn-primary">Find a Car</Link>
              </div>
            </div>
            <div className="ufs-audience-visual ufs-audience-visual--dark" data-animate="fade-right" style={{ ...audienceVisualDarkStyle, transitionDelay: '0.2s' }}>
              <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="1" y="3" width="15" height="13" rx="2" ry="2"/>
                <polygon points="16 8 20 12 16 16 16 8"/>
                <line x1="23" y1="5" x2="23" y2="19"/>
                <path d="M5 21a7 7 0 0 1 0-14"/>
              </svg>
              <span className="ufs-audience-visual-label">Driver Experience</span>
            </div>
          </div>
        </div>
      </section>

      {/* Host with UFS Section */}
      <section className="ufs-audience ufs-audience--light">
        <div className="container">
          <div className="ufs-audience-grid ufs-audience-grid--reversed">
            <div className="ufs-audience-text">
              <span className="ufs-section-eyebrow" data-animate>For Hosts</span>
              <h2 className="ufs-section-title" data-animate style={{ transitionDelay: '0.1s' }}>
                <span className="ufs-hero-accent">Host</span> with UFS
              </h2>
              <p className="ufs-section-desc" data-animate style={{ transitionDelay: '0.2s' }}>
                Rent out your vehicle and earn every month.
              </p>
              <ul className="ufs-audience-list ufs-audience-list--dark">
                <li data-animate style={{ transitionDelay: '0.3s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Zero Commission:</strong> We charge a flat low fee — you keep more of what you earn.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.4s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Insurance Protection:</strong> Keep your cars protected with our coverage policies.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.5s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Expand Your Reach:</strong> Showcase vehicles to vetted, verified drivers.</span>
                </li>
                <li data-animate style={{ transitionDelay: '0.6s' }}>
                  <span className="ufs-check-icon">✓</span>
                  <span><strong>Dedicated Support:</strong> From listing to booking management, we're here to help.</span>
                </li>
              </ul>
              <div className="ufs-audience-actions" data-animate style={{ transitionDelay: '0.7s' }}>
                <Link to="/host-guide" className="ufs-btn ufs-btn-outline-dark">Learn More</Link>
                <Link to={isAuthenticated ? '/host/add-vehicle' : '/register?type=host'} className="ufs-btn ufs-btn-primary">List a Car</Link>
              </div>
            </div>
            <div className="ufs-audience-visual ufs-audience-visual--light" data-animate="fade-left" style={{ ...audienceVisualLightStyle, transitionDelay: '0.2s' }}>
              <svg width="90" height="90" viewBox="0 0 24 24" fill="none" stroke="#00FF66" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="1" x2="12" y2="23"/>
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>
              </svg>
              <span className="ufs-audience-visual-label">Start Earning</span>
            </div>
          </div>
        </div>
      </section>

      {/* Blog Preview Section */}
      <section className="ufs-blog">
        <div className="container">
          <div className="ufs-blog-header" data-animate>
            <div>
              <span className="ufs-section-eyebrow">Blog &amp; News</span>
              <h2 className="ufs-section-title">Tips, guides and updates</h2>
            </div>
            <Link to="/blog" className="ufs-text-link">View all articles →</Link>
          </div>
          <div className="ufs-blog-grid">
            {blogPosts.map((post, idx) => (
              <Link to="/blog" key={post.id} className="ufs-blog-card" data-animate style={{ transitionDelay: `${idx * 0.15}s` }}>
                <div
                  className="ufs-blog-image"
                  style={{
                    backgroundImage: `linear-gradient(135deg, rgba(10, 10, 10, 0.55) 0%, rgba(31, 41, 55, 0.4) 100%), url('${post.image}'), linear-gradient(135deg, #0a0a0a 0%, #1f2937 100%)`
                  }}
                >
                  <span className="ufs-blog-category">{post.category}</span>
                </div>
                <div className="ufs-blog-body">
                  <span className="ufs-blog-date">{post.date}</span>
                  <h3 className="ufs-blog-title">{post.title}</h3>
                  <p className="ufs-blog-excerpt">{post.excerpt}</p>
                  <span className="ufs-blog-link">Read More →</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section className="ufs-faq">
        <div className="container">
          <div className="ufs-faq-grid">
            <div className="ufs-faq-intro" data-animate>
              <span className="ufs-section-eyebrow ufs-section-eyebrow--light">FAQ</span>
              <h2 className="ufs-section-title ufs-section-title--light">
                Frequently asked questions
              </h2>
              <p className="ufs-section-desc ufs-section-desc--light">
                Everything you need to know about renting or hosting on UFS. Can't find what you're looking for?
              </p>
              <Link to="/faq" className="ufs-text-link ufs-text-link--light">Visit the full FAQ →</Link>
            </div>
            <div className="ufs-faq-list">
              {faqData.map((item, index) => (
                <div
                  key={index}
                  className={`ufs-faq-item ${openFaq === index ? 'is-open' : ''}`}
                  data-animate
                  style={{ transitionDelay: `${index * 0.1}s` }}
                >
                  <button
                    className="ufs-faq-question"
                    onClick={() => toggleFaq(index)}
                  >
                    <span>{item.question}</span>
                    <svg
                      className="ufs-faq-chevron"
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
                  <div className="ufs-faq-answer">
                    <p>{item.answer}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="ufs-final-cta">
        <div className="container">
          <h2 className="ufs-final-cta-title" data-animate>
            Ready to hit the <span className="ufs-hero-accent">road</span>?
          </h2>
          <p className="ufs-final-cta-subtitle" data-animate style={{ transitionDelay: '0.15s' }}>
            Join thousands of drivers and hosts already on UFS.
          </p>
          <div className="ufs-final-cta-actions" data-animate style={{ transitionDelay: '0.3s' }}>
            <Link to={isAuthenticated ? (isHost ? '/host/dashboard' : '/marketplace') : '/register'}>
              <button className="ufs-btn ufs-btn-primary ufs-btn-lg">
                {isAuthenticated ? (isHost ? 'Go to Dashboard' : 'Browse Cars') : 'Get Started'}
              </button>
            </Link>
            <Link to="/faq">
              <button className="ufs-btn ufs-btn-outline-light ufs-btn-lg">Got Questions?</button>
            </Link>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Home;
