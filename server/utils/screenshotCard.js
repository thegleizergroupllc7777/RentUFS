const fs = require('fs');
const path = require('path');
const axios = require('axios');

// Directory for cached insurance card screenshots
const CARDS_DIR = path.join(__dirname, '..', 'uploads', 'insurance-cards');

// Ensure the directory exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

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

module.exports = { captureCardImage };
