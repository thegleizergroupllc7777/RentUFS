const fs = require('fs');
const path = require('path');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');

// Directory for cached insurance card screenshots
const CARDS_DIR = path.join(__dirname, '..', 'uploads', 'insurance-cards');

// Ensure the directory exists
if (!fs.existsSync(CARDS_DIR)) {
  fs.mkdirSync(CARDS_DIR, { recursive: true });
}

/**
 * Capture a screenshot of the insurance card URL and save it as a PNG.
 * Returns the relative path (from uploads/) to the saved image.
 *
 * @param {string} cardUrl - The URL to screenshot
 * @param {string} bookingId - Booking ID (used for filename)
 * @returns {Promise<string>} Relative path to the saved screenshot
 */
const captureCardImage = async (cardUrl, bookingId) => {
  const filename = `card-${bookingId}.png`;
  const filePath = path.join(CARDS_DIR, filename);

  let browser;
  try {
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
    return null;
  } finally {
    if (browser) {
      await browser.close().catch(() => {});
    }
  }
};

module.exports = { captureCardImage };
