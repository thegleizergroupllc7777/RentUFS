/**
 * One-time / on-demand sync of vehicle photos from Wheelbase to RentUFS.
 *
 * For each NJ fleet vehicle (bookingProvider: 'wheelbase'), this script:
 *   1. Fetches the public Wheelbase widget listing-details page
 *   2. Parses the HTML to extract Cloudinary image URLs for that rental
 *   3. Updates the vehicle.images array in RentUFS
 *
 * Safety:
 *   - Only touches vehicles where bookingProvider === 'wheelbase'
 *   - Saves the original images array to _imagesBackup before overwriting
 *   - DRY RUN mode prints what would change but writes nothing
 *
 * Usage (on Render shell or local):
 *   node server/scripts/syncWheelbasePhotos.js --dry-run --rental-id=479203
 *   node server/scripts/syncWheelbasePhotos.js --rental-id=479203
 *   node server/scripts/syncWheelbasePhotos.js --dry-run         # all fleet vehicles
 *   node server/scripts/syncWheelbasePhotos.js                    # apply to all
 *
 * Emergency rollback (one vehicle):
 *   db.vehicles.updateOne(
 *     { 'wheelbase.rentalId': '479203' },
 *     [{ $set: { images: '$_imagesBackup' } }]
 *   );
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const mongoose = require('mongoose');
const axios = require('axios');
const Vehicle = require('../models/Vehicle');

const DEALER_ID = '4726129';

const DRY_RUN = process.argv.includes('--dry-run');
const TARGET_RENTAL_ID = (() => {
  const arg = process.argv.find(a => a.startsWith('--rental-id='));
  return arg ? arg.split('=')[1] : null;
})();

const widgetUrl = (rentalId) =>
  `https://widget.wheelbasepro.com/?dealer_id=${DEALER_ID}&store_type=auto&page=listing-details&rental_id=${rentalId}`;

// Candidate Outdoorsy/Wheelbase JSON API endpoints to probe.
// The widget's JavaScript calls one of these to load vehicle data.
const apiCandidates = (rentalId) => [
  `https://api.outdoorsy.com/v0/rentals/${rentalId}`,
  `https://api.outdoorsy.com/v0/listings/${rentalId}`,
  `https://api.outdoorsy.com/rentals/${rentalId}`,
  `https://api.outdoorsy.com/v1/rentals/${rentalId}`,
  `https://api.wheelbasepro.com/v0/rentals/${rentalId}`,
  `https://api.wheelbasepro.com/rentals/${rentalId}`,
  `https://api.wheelbasepro.com/widget/rentals/${rentalId}`
];

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/html, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://widget.wheelbasepro.com',
  'Referer': 'https://widget.wheelbasepro.com/'
};

const fetchPage = async (rentalId) => {
  const response = await axios.get(widgetUrl(rentalId), {
    headers: BROWSER_HEADERS,
    timeout: 15000,
    maxRedirects: 5
  });
  return response.data;
};

// Recursively walk a JSON object collecting any Cloudinary image URLs
// scoped to this rental's image folder.
const collectImagesFromJSON = (data, rentalId) => {
  const folder = `/p/rentals/${rentalId}/images/`;
  const seen = new Set();
  const urls = [];

  const walk = (obj) => {
    if (obj == null) return;
    if (typeof obj === 'string') {
      if (obj.includes(folder) && obj.includes('cloudinary.com')) {
        const m = obj.match(new RegExp(`${folder}([a-zA-Z0-9_-]+)`));
        const key = m ? m[1] : obj;
        if (!seen.has(key)) {
          seen.add(key);
          urls.push(obj);
        }
      }
    } else if (Array.isArray(obj)) {
      obj.forEach(walk);
    } else if (typeof obj === 'object') {
      Object.values(obj).forEach(walk);
    }
  };

  walk(data);
  return urls;
};

const tryApiCandidates = async (rentalId) => {
  for (const url of apiCandidates(rentalId)) {
    try {
      const response = await axios.get(url, {
        headers: BROWSER_HEADERS,
        timeout: 8000,
        validateStatus: () => true
      });
      const ok = response.status === 200;
      const isJson = typeof response.data === 'object' && response.data !== null;
      console.log(`     ${url} → ${response.status}${isJson ? ' (json)' : ''}`);

      if (ok && isJson) {
        const images = collectImagesFromJSON(response.data, rentalId);
        if (images.length > 0) {
          return { source: url, images, raw: response.data };
        }
        // Log a snippet so we can see what came back even if no images matched
        console.log(`     (top-level keys: ${Object.keys(response.data).slice(0, 10).join(', ')})`);
      }
    } catch (err) {
      console.log(`     ${url} → error: ${err.message}`);
    }
  }
  return null;
};

const extractImageUrls = (html, rentalId) => {
  // Match all Cloudinary URLs scoped to this rental's image folder.
  // Pattern: https://res.cloudinary.com/outdoorsy/image/upload/<anything>/p/rentals/<rentalId>/images/<hash>.<ext>
  const pattern = new RegExp(
    `https://res\\.cloudinary\\.com/outdoorsy/image/upload/[^"'\\s<>\\\\]*?/p/rentals/${rentalId}/images/[a-zA-Z0-9]+\\.(?:jpg|jpeg|png|webp)`,
    'gi'
  );
  const matches = html.match(pattern) || [];

  // Dedupe: a single source image often appears multiple times with different
  // transformations. Normalize by extracting just the rental-folder path.
  const seen = new Set();
  const unique = [];
  for (const url of matches) {
    const m = url.match(new RegExp(`/p/rentals/${rentalId}/images/([a-zA-Z0-9]+)\\.`));
    const id = m ? m[1] : url;
    if (!seen.has(id)) {
      seen.add(id);
      unique.push(url);
    }
  }
  return unique;
};

async function main() {
  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI not set — aborting');
    process.exit(1);
  }

  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('✅ Connected');

  const query = { bookingProvider: 'wheelbase' };
  if (TARGET_RENTAL_ID) {
    query['wheelbase.rentalId'] = TARGET_RENTAL_ID;
  }

  const vehicles = await Vehicle.find(query);
  console.log(`\n📋 Found ${vehicles.length} vehicle(s) to process`);
  console.log(`   Mode: ${DRY_RUN ? '🧪 DRY RUN (no DB writes)' : '✏️  LIVE (will update DB)'}`);
  if (TARGET_RENTAL_ID) console.log(`   Target rental_id: ${TARGET_RENTAL_ID}`);
  console.log('');

  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const vehicle of vehicles) {
    const rentalId = vehicle.wheelbase?.rentalId;
    if (!rentalId) {
      console.log(`⏭️  ${vehicle.nickname || vehicle._id}: no rental_id, skipping`);
      skipped++;
      continue;
    }

    console.log(`\n🚗 ${vehicle.nickname || '(no nickname)'} (rental_id: ${rentalId})`);

    try {
      // Strategy 1: try Outdoorsy/Wheelbase JSON API endpoints
      console.log(`   🔍 Probing JSON API endpoints...`);
      const apiResult = await tryApiCandidates(rentalId);

      let imageUrls = [];
      let source = '';

      if (apiResult) {
        imageUrls = apiResult.images;
        source = `API: ${apiResult.source}`;
        console.log(`   ✅ Got ${imageUrls.length} image(s) from JSON API`);
      } else {
        // Strategy 2: fall back to scraping the widget HTML
        console.log(`   📥 No JSON API hit. Falling back to HTML scrape...`);
        const html = await fetchPage(rentalId);
        console.log(`   📥 Fetched ${html.length.toLocaleString()} bytes from widget HTML`);
        imageUrls = extractImageUrls(html, rentalId);
        source = 'HTML scrape';
        console.log(`   🖼️  Found ${imageUrls.length} unique image URL(s) in HTML`);
      }

      if (imageUrls.length === 0) {
        console.log(`   ⚠️  No images found via API or HTML. Keeping existing images.`);
        skipped++;
        continue;
      }

      console.log(`   📍 Source: ${source}`);

      console.log(`   Current vehicle.images:`);
      (vehicle.images || []).forEach((u, i) => console.log(`     [${i}] ${u}`));
      console.log(`   New vehicle.images (from Wheelbase):`);
      imageUrls.forEach((u, i) => console.log(`     [${i}] ${u}`));

      if (DRY_RUN) {
        console.log(`   🧪 DRY RUN — would update ${imageUrls.length} images`);
        updated++;
      } else {
        await Vehicle.updateOne(
          { _id: vehicle._id },
          {
            $set: {
              images: imageUrls,
              _imagesBackup: vehicle.images || []
            }
          }
        );
        console.log(`   ✅ Updated. Original images saved to _imagesBackup.`);
        updated++;
      }
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
      failed++;
    }

    // Tiny delay between requests so we don't hammer Wheelbase
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n📊 Summary:`);
  console.log(`   Updated: ${updated}`);
  console.log(`   Skipped: ${skipped}`);
  console.log(`   Failed:  ${failed}`);
  console.log(`   Mode:    ${DRY_RUN ? 'DRY RUN (no changes saved)' : 'LIVE'}`);

  await mongoose.disconnect();
  console.log('\n👋 Disconnected. Done.');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  mongoose.disconnect().finally(() => process.exit(1));
});
