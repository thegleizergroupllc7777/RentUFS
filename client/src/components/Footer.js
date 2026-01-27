import React from 'react';
import { Link } from 'react-router-dom';
import './Footer.css';

const Footer = () => {
  return (
    <footer className="footer">
      <div className="footer-content">
        <div className="footer-main">
          <div className="footer-brand">
            <Link to="/" className="footer-logo">UFS</Link>
            <div className="footer-contact">
              <p>Address: 597 West Side Ave PMB 194</p>
              <p className="footer-address-line2">Jersey City, NJ 07304</p>
              <p className="footer-phone">Phone: 318-RENT-UFS (736-8837)</p>
            </div>
          </div>

          <nav className="footer-nav">
            <Link to="/" className="footer-nav-link">Home</Link>
            <Link to="/marketplace" className="footer-nav-link">Cars</Link>
            <Link to="/contact" className="footer-nav-link">Contact</Link>
          </nav>
        </div>

        <div className="footer-divider"></div>

        <div className="footer-bottom">
          <p className="footer-copyright">&copy; {new Date().getFullYear()} UFS. All rights reserved.</p>
          <p className="footer-credit">Website built by Waleed</p>
          <Link to="/privacy" className="footer-privacy">Privacy Policy</Link>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
