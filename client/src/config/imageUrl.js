import API_URL from './api';

/**
 * Resolve an image source for display.
 * Handles base64 data URLs, full http(s) URLs, and relative /uploads/ paths.
 */
const getImageUrl = (src) => {
  if (!src) return '';
  if (src.startsWith('data:') || src.startsWith('http')) return src;
  return `${API_URL}${src}`;
};

export default getImageUrl;
