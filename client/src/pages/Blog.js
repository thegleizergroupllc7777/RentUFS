import React from 'react';
import { Link } from 'react-router-dom';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import './GuidePages.css';

const blogPosts = [
  {
    id: 1,
    title: 'The Ultimate Guide to Renting on UFS',
    excerpt: 'New to UFS? This comprehensive guide walks you through everything you need to know about finding and booking the perfect vehicle.',
    category: 'Driver Tips',
    date: 'April 10, 2026',
  },
  {
    id: 2,
    title: 'How to Maximize Your Earnings as a Host',
    excerpt: 'Learn proven strategies to optimize your vehicle listings, set competitive pricing, and attract more bookings on UFS.',
    category: 'Host Tips',
    date: 'April 8, 2026',
  },
  {
    id: 3,
    title: 'Understanding Insurance Coverage on UFS',
    excerpt: 'A detailed breakdown of the insurance options available for every trip, so both drivers and hosts can rent with confidence.',
    category: 'Safety',
    date: 'April 5, 2026',
  },
  {
    id: 4,
    title: 'Top Tips for a Smooth Vehicle Pickup',
    excerpt: 'Make your pickup experience seamless with these tips for both drivers and hosts. From inspections to documentation, we cover it all.',
    category: 'Driver Tips',
    date: 'April 2, 2026',
  },
  {
    id: 5,
    title: 'Why Zero Commission Matters for Hosts',
    excerpt: 'Other platforms take up to 40% of your earnings. Learn why UFS\'s flat fee model means more money in your pocket.',
    category: 'Host Tips',
    date: 'March 28, 2026',
  },
  {
    id: 6,
    title: 'Building Trust in the UFS Community',
    excerpt: 'How our verification system, reviews, and inspections create a safe and reliable experience for everyone on the platform.',
    category: 'Community',
    date: 'March 25, 2026',
  },
];

const Blog = () => {
  return (
    <div className="guide-page">
      <Navbar />

      <section className="guide-hero">
        <div className="container">
          <h1 className="guide-hero-title">
            UFS <span className="brand-highlight">Blog</span>
          </h1>
          <p className="guide-hero-subtitle">
            Tips, guides, and news for drivers and hosts.
          </p>
        </div>
      </section>

      <section className="blog-content">
        <div className="container">
          <div className="blog-grid">
            {blogPosts.map(post => (
              <article key={post.id} className="blog-card">
                <div className="blog-card-image">
                  <span className="blog-card-category">{post.category}</span>
                </div>
                <div className="blog-card-body">
                  <span className="blog-card-date">{post.date}</span>
                  <h3 className="blog-card-title">{post.title}</h3>
                  <p className="blog-card-excerpt">{post.excerpt}</p>
                  <span className="blog-card-link">Read More &rarr;</span>
                </div>
              </article>
            ))}
          </div>

          <div className="blog-note">
            <p>More articles coming soon. Check back regularly for the latest tips and updates.</p>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
};

export default Blog;
