/* eslint-disable */
// Post-build sitemap generator. Fetches live vehicles from the API and writes
// a static sitemap.xml into the build folder, so it's served on the same
// domain as the app (app.rentufs.com/sitemap.xml) for Google Search Console.
// Runs at build time; if the API is unreachable it still writes the static
// public pages so the sitemap is never broken.

const fs = require('fs');
const path = require('path');
const https = require('https');

const SITE = (process.env.REACT_APP_SITE_URL || 'https://app.rentufs.com').replace(/\/$/, '');
const API = (process.env.REACT_APP_API_URL || 'https://api.rentufs.com').replace(/\/$/, '');
const OUT = path.join(__dirname, '..', 'build', 'sitemap.xml');

const staticPaths = ['', '/marketplace', '/login', '/register'];

const fetchJson = (url) => new Promise((resolve) => {
  https.get(url, (res) => {
    let data = '';
    res.on('data', (c) => (data += c));
    res.on('end', () => {
      try { resolve(JSON.parse(data)); } catch { resolve(null); }
    });
  }).on('error', () => resolve(null));
});

(async () => {
  const esc = (s) => String(s).replace(/&/g, '&amp;');
  const urlTag = (loc) => `  <url><loc>${esc(loc)}</loc></url>`;
  const urls = staticPaths.map((p) => urlTag(`${SITE}${p}`));

  // Best-effort: pull live vehicles so each listing gets a URL.
  const vehicles = await fetchJson(`${API}/api/vehicles`);
  if (Array.isArray(vehicles)) {
    vehicles.forEach((v) => {
      if (v && v._id) urls.push(urlTag(`${SITE}/vehicle/${v._id}`));
    });
    console.log(`🗺️  Sitemap: ${vehicles.length} vehicles included`);
  } else {
    console.warn('🗺️  Sitemap: could not fetch vehicles — wrote static pages only');
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;

  if (!fs.existsSync(path.dirname(OUT))) {
    console.warn('🗺️  Sitemap: build folder missing, skipping');
    return;
  }
  fs.writeFileSync(OUT, xml);
  console.log(`🗺️  Sitemap written to ${OUT} (${urls.length} urls)`);
})();
