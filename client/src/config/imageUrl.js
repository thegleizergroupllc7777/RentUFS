import API_URL from './api';

/**
 * Resolve an image source for display.
 * Handles base64 data URLs, full http(s) URLs, and relative /uploads/ paths.
 *
 * For Cloudinary-hosted images, injects on-the-fly optimization
 * (f_auto = best format/WebP, q_auto = smart quality, optional width) so
 * large originals are served small and fast WITHOUT changing the stored
 * original. Non-Cloudinary URLs are returned unchanged.
 *
 * @param {string} src   image source (Cloudinary URL, http URL, data URL, or /uploads path)
 * @param {number} [width] optional max width in px for Cloudinary resizing
 */
const getImageUrl = (src, width) => {
  if (!src) return '';

  // Optimize Cloudinary images by inserting transformation params right after
  // "/upload/". Only applies to Cloudinary URLs; everything else is untouched.
  if (src.includes('res.cloudinary.com') && src.includes('/upload/')) {
    // Avoid double-applying if a transformation is already present.
    const alreadyTransformed = /\/upload\/[^/]*(f_auto|q_auto|w_\d+)/.test(src);
    if (!alreadyTransformed) {
      const params = ['f_auto', 'q_auto', 'c_limit'];
      if (width) params.push(`w_${width}`);
      return src.replace('/upload/', `/upload/${params.join(',')}/`);
    }
    return src;
  }

  if (src.startsWith('data:') || src.startsWith('http')) return src;
  return `${API_URL}${src}`;
};

export default getImageUrl;
