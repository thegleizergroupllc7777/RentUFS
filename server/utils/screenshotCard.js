const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary (same credentials as image uploads). Safe to call repeatedly.
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Directory for cached insurance card screenshots
const CARDS_DIR = path.join(__dirname, '..', 'uploads', 'insurance-cards');

// Ensure the directory exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

/**
 * Upload a card file buffer to Cloudinary for PERMANENT storage.
 * Uses resource_type 'raw' so PDFs are stored/served reliably (not subject to
 * Cloudinary's image-PDF delivery restriction). Returns the secure URL, or null
 * on failure (caller falls back to existing local/proxy behavior).
 *
 * @param {Buffer} buffer - file bytes
 * @param {string} bookingId - used for a stable public_id
 * @param {string} ext - file extension ('pdf' | 'png' | 'jpg')
 * @returns {Promise<string|null>}
 */
const uploadCardBufferToCloudinary = (buffer, bookingId, ext = 'pdf') => {
  return new Promise((resolve) => {
    try {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'rentufs/insurance-cards',
          resource_type: 'raw',
          public_id: `card-${bookingId}.${ext}`,
          overwrite: true
        },
        (error, result) => {
          if (error) {
            console.error('🛡️ Insurance card Cloudinary upload failed:', error.message);
            return resolve(null);
          }
          console.log(`🛡️ Insurance card stored permanently on Cloudinary: ${result.secure_url}`);
          resolve(result.secure_url);
        }
      );
      stream.end(buffer);
    } catch (err) {
      console.error('🛡️ Insurance card Cloudinary upload threw:', err.message);
      resolve(null);
    }
  });
};

/**
 * Download a card from a URL and store it permanently on Cloudinary.
 * Returns the permanent Cloudinary secure URL, or null on failure.
 *
 * @param {string} cardUrl - source URL (e.g. TeqMobility documents URL)
 * @param {string} bookingId
 * @returns {Promise<string|null>}
 */
const captureCardToCloudinary = async (cardUrl, bookingId) => {
  try {
    const response = await axios.get(cardUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'Accept': 'application/pdf,image/*,*/*' }
    });
    const buf = Buffer.from(response.data);
    if (buf.length < 100) {
      console.error(`🛡️ Insurance card for Cloudinary too small (${buf.length} bytes), skipping`);
      return null;
    }
    const isPdf = buf.slice(0, 5).toString('ascii') === '%PDF-';
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;
    const ext = isPdf ? 'pdf' : isPng ? 'png' : isJpeg ? 'jpg' : 'pdf';
    return uploadCardBufferToCloudinary(buf, bookingId, ext);
  } catch (err) {
    console.error('🛡️ Insurance card capture-to-Cloudinary failed:', err.message);
    return null;
  }
};

/**
 * Capture/download an insurance card from a URL and save it locally.
 * Always downloads first to detect the real file type from content,
 * rather than relying on URL patterns or content-type headers.
 *
 * @param {string} cardUrl - The URL to download
 * @param {string} bookingId - Booking ID (used for filename)
 * @returns {Promise<string>} Relative path to the saved file
 */
const captureCardImage = async (cardUrl, bookingId) => {
  // Always try direct download first — detect type from actual content
  return downloadCard(cardUrl, bookingId);
};

/**
 * Download a card file and save it with the correct extension
 * based on magic bytes, not content-type header.
 */
const downloadCard = async (cardUrl, bookingId) => {
  try {
    const response = await axios.get(cardUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'Accept': 'application/pdf,image/*,*/*' }
    });

    const buf = Buffer.from(response.data);

    // Detect real type from magic bytes
    const isPdf = buf.slice(0, 5).toString('ascii') === '%PDF-';
    const isPng = buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47;
    const isJpeg = buf[0] === 0xFF && buf[1] === 0xD8;

    let ext;
    if (isPdf) ext = 'pdf';
    else if (isPng) ext = 'png';
    else if (isJpeg) ext = 'jpg';
    else ext = 'pdf'; // Default to pdf since TeqMobility mostly returns PDFs

    const filename = `card-${bookingId}.${ext}`;
    const filePath = path.join(CARDS_DIR, filename);

    fs.writeFileSync(filePath, buf);
    const headerType = response.headers['content-type'] || 'unknown';
    console.log(`🛡️ Insurance card downloaded: ${filename} (header: ${headerType}, detected: ${ext}, ${buf.length} bytes)`);
    return `insurance-cards/${filename}`;
  } catch (err) {
    console.error('🛡️ Insurance card download failed:', err.message);
    return null;
  }
};

module.exports = { captureCardImage, captureCardToCloudinary, uploadCardBufferToCloudinary };
