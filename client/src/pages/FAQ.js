import React, { useState } from 'react';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './GuidePages.css';

const faqSections = [
  {
    title: 'For Drivers',
    questions: [
      {
        q: 'How do I book a car on UFS?',
        a: 'Browse our marketplace, select a vehicle, choose your dates, pick your insurance coverage, and submit a booking request. Once the host confirms, you\'ll receive pickup details.'
      },
      {
        q: 'What do I need to sign up as a driver?',
        a: 'You\'ll need a valid email address, a valid driver\'s license, and to complete our identity verification process. Sign up is free and takes just a few minutes.'
      },
      {
        q: 'What insurance is included with my rental?',
        a: 'Every booking offers insurance coverage options. During checkout, you can choose from multiple tiers of coverage to match your comfort level and budget.'
      },
      {
        q: 'Can I extend my rental?',
        a: 'Yes! You can request a trip extension through the platform at any time during your rental. If the host approves and the vehicle is available, your rental is seamlessly extended.'
      },
      {
        q: 'What happens if there\'s an issue with the vehicle?',
        a: 'Contact our support team immediately. We\'ll work with you and the host to resolve any issues. Our inspection process at pickup and return helps document the vehicle\'s condition.'
      },
      {
        q: 'How does pricing work?',
        a: 'Hosts set their own daily, weekly, and monthly rates. You\'ll see the total price including any fees before you confirm your booking. No hidden charges.'
      }
    ]
  },
  {
    title: 'For Hosts',
    questions: [
      {
        q: 'How do I list my vehicle?',
        a: 'Register as a host, then use the "Add Vehicle" form to enter your vehicle details, upload photos, set your pricing, and publish your listing. Your vehicle will be visible in the marketplace immediately.'
      },
      {
        q: 'What fees does UFS charge?',
        a: 'UFS charges a flat low fee per booking with ZERO commission. Unlike other platforms that take 25-40% of your earnings, you keep more of what you make.'
      },
      {
        q: 'How do I get paid?',
        a: 'Payouts are sent directly to your bank account after each completed trip. You can track all your earnings from your host dashboard.'
      },
      {
        q: 'Is my vehicle insured during rentals?',
        a: 'Yes. Every booking includes insurance protection for your vehicle. Our coverage protects you while your car is being rented.'
      },
      {
        q: 'Can I decline booking requests?',
        a: 'Absolutely. You have full control over which bookings to accept. Review the driver\'s profile, ratings, and trip details before making your decision.'
      },
      {
        q: 'How many vehicles can I list?',
        a: 'There\'s no limit. List as many vehicles as you want and manage them all from your host dashboard.'
      }
    ]
  },
  {
    title: 'General',
    questions: [
      {
        q: 'Where does UFS operate?',
        a: 'UFS is available nationwide. Use our marketplace search to find vehicles in your area or at your destination.'
      },
      {
        q: 'Is UFS safe?',
        a: 'Safety is our top priority. Every user goes through identity verification. Our review system helps maintain community trust, and insurance coverage protects both drivers and hosts on every trip.'
      },
      {
        q: 'What types of vehicles are available?',
        a: 'Our marketplace features a wide range of vehicles including sedans, SUVs, trucks, vans, sports cars, luxury vehicles, and electric cars.'
      },
      {
        q: 'How do reviews work?',
        a: 'After each trip, both the driver and host can leave reviews and ratings. These reviews are visible on profiles and help the community make informed decisions.'
      }
    ]
  }
];

const FAQ = () => {
  const [openItems, setOpenItems] = useState({});

  const toggleItem = (sectionIndex, questionIndex) => {
    const key = `${sectionIndex}-${questionIndex}`;
    setOpenItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="guide-page">
      <Navbar />

      <section className="guide-hero">
        <div className="container">
          <h1 className="guide-hero-title">
            Frequently Asked <span className="brand-highlight">Questions</span>
          </h1>
          <p className="guide-hero-subtitle">
            Find answers to common questions about using UFS.
          </p>
        </div>
      </section>

      <section className="faq-page-content">
        <div className="container">
          {faqSections.map((section, sIndex) => (
            <div key={sIndex} className="faq-page-section">
              <h2 className="faq-page-section-title">{section.title}</h2>
              <div className="faq-page-list">
                {section.questions.map((item, qIndex) => {
                  const key = `${sIndex}-${qIndex}`;
                  const isOpen = openItems[key];
                  return (
                    <div key={qIndex} className={`faq-page-item ${isOpen ? 'faq-page-item--open' : ''}`}>
                      <button className="faq-page-question" onClick={() => toggleItem(sIndex, qIndex)}>
                        <span>{item.q}</span>
                        <svg className="faq-page-chevron" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="6 9 12 15 18 9"></polyline>
                        </svg>
                      </button>
                      <div className="faq-page-answer">
                        <p>{item.a}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default FAQ;
