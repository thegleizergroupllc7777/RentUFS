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
 * Capture a screenshot of the insurance card URL and save it as a PNG.
 * For PDF URLs, downloads the PDF directly instead of trying to render via Puppeteer
 * (headless Chrome cannot navigate to PDF URLs — causes ERR_ABORTED).
 * Returns the relative path (from uploads/) to the saved file.
 *
 * @param {string} cardUrl - The URL to screenshot or download
 * @param {string} bookingId - Booking ID (used for filename)
 * @returns {Promise<string>} Relative path to the saved file
 */
const captureCardImage = async (cardUrl, bookingId) => {
  // For PDF URLs, download the file directly instead of using Puppeteer
  if (cardUrl.toLowerCase().endsWith('.pdf') || cardUrl.includes('/idcards/')) {
    return downloadCard(cardUrl, bookingId);
  }

  // For non-PDF URLs, try Puppeteer screenshot
  return screenshotCard(cardUrl, bookingId);
};

/**
 * Download a card file (PDF/image) directly and save it.
 */
const downloadCard = async (cardUrl, bookingId) => {
  try {
    const response = await axios.get(cardUrl, {
      responseType: 'arraybuffer',
      timeout: 15000,
      headers: { 'Accept': 'application/pdf,image/*,*/*' }
    });

    const contentType = response.headers['content-type'] || '';
    const ext = contentType.includes('pdf') ? 'pdf' : 'png';
    const filename = `card-${bookingId}.${ext}`;
    const filePath = path.join(CARDS_DIR, filename);

    fs.writeFileSync(filePath, Buffer.from(response.data));
    console.log(`🛡️ Insurance card downloaded: ${filename} (${contentType})`);
    return `insurance-cards/${filename}`;
  } catch (err) {
    console.error('🛡️ Insurance card download failed:', err.message);
    return null;
  }
};

/**
 * Use Puppeteer to screenshot an HTML insurance card page.
 */
const screenshotCard = async (cardUrl, bookingId) => {
  const filename = `card-${bookingId}.png`;
  const filePath = path.join(CARDS_DIR, filename);

  let browser;
  try {
    const puppeteer = require('puppeteer-core');
    const chromium = require('@sparticuz/chromium');

    browser = await puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: 'shell'
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 400 });
    await page.goto(cardUrl, { waitUntil: 'networkidle0', timeout: 15000 });

    // Wait a moment for any animations/rendering to settle
    await new Promise((r) => setTimeout(r, 500));

    await page.screenshot({
      path: filePath,
      fullPage: true,
      type: 'png'
    });

    console.log(`🛡️ Insurance card screenshot saved: ${filename}`);
    return `insurance-cards/${filename}`;
  } catch (err) {
    console.error('🛡️ Insurance card screenshot failed:', err.message);
    // If Puppeteer fails, try direct download as fallback
    return downloadCard(cardUrl, bookingId);
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

module.exports = { captureCardImage };
