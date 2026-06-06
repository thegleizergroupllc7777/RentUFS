import React from 'react';
import { Helmet } from 'react-helmet-async';

// Sets per-page SEO tags (title, description, and Open Graph for link previews).
// Falls back to sensible RentUFS defaults when props aren't provided.
const DEFAULT_TITLE = 'RentUFS - Car Rental Marketplace';
const DEFAULT_DESC = 'RentUFS - Car rental marketplace connecting vehicle owners with renters';

const SEO = ({ title, description, image }) => {
  const fullTitle = title ? `${title} | RentUFS` : DEFAULT_TITLE;
  const desc = description || DEFAULT_DESC;

  return (
    <Helmet>
      <title>{fullTitle}</title>
      <meta name="description" content={desc} />
      {/* Open Graph (Facebook, iMessage, etc.) */}
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={desc} />
      <meta property="og:type" content="website" />
      {image && <meta property="og:image" content={image} />}
      {/* Twitter card */}
      <meta name="twitter:card" content={image ? 'summary_large_image' : 'summary'} />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={desc} />
      {image && <meta name="twitter:image" content={image} />}
    </Helmet>
  );
};

export default SEO;
