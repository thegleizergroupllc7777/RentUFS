/**
 * READ-ONLY probe: does Outdoorsy / Wheelbase expose rental availability
 * (booked dates, blocked dates, calendar) through a public API endpoint?
 *
 * This script makes a handful of GET requests against api.outdoorsy.com for
 * a single rental_id and prints back:
 *   - HTTP status
 *   - whether the response was JSON
 *   - top-level keys in the response
 *   - any keys that look booking/availability/calendar-shaped
 *   - any arrays of ISO-date strings it finds
 *
 * What this script DOES NOT do (intentionally):
 *   - connect to MongoDB
 *   - read, write, or modify any RentUFS data
 *   - write any files
 *   - register any cron job or route
 *   - send any POST/PUT/PATCH/DELETE requests
 *
 * USAGE (from Render shell, inside ~/project/src/server):
 *   node scripts/probeWheelbaseAvailability.js                # defaults to 479203 (UFS-001)
 *   node scripts/probeWheelbaseAvailability.js --rental-id=479204
 */

const axios = require('axios');

const DEFAULT_RENTAL_ID = '479203';
const RENTAL_ID = (() => {
  const arg = process.argv.find(a => a.startsWith('--rental-id='));
  return arg ? arg.split('=')[1] : DEFAULT_RENTAL_ID;
})();

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': 'https://widget.wheelbasepro.com',
  'Referer': 'https://widget.wheelbasepro.com/'
};

// Plausible endpoints — best guesses based on common REST patterns and what
// Outdoorsy's widget JS would need to render a date picker.
const buildCandidates = (id) => {
  const today = new Date();
  const inAYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().split('T')[0];
  const from = fmt(today);
  const to = fmt(inAYear);

  return [
    { label: 'rental details (already known to work)', url: `https://api.outdoorsy.com/v0/rentals/${id}` },
    { label: 'availability subresource',               url: `https://api.outdoorsy.com/v0/rentals/${id}/availability` },
    { label: 'availability w/ date range',             url: `https://api.outdoorsy.com/v0/rentals/${id}/availability?from=${from}&to=${to}` },
    { label: 'calendar subresource',                   url: `https://api.outdoorsy.com/v0/rentals/${id}/calendar` },
    { label: 'calendar w/ date range',                 url: `https://api.outdoorsy.com/v0/rentals/${id}/calendar?from=${from}&to=${to}` },
    { label: 'bookings subresource',                   url: `https://api.outdoorsy.com/v0/rentals/${id}/bookings` },
    { label: 'unavailable dates',                      url: `https://api.outdoorsy.com/v0/rentals/${id}/unavailable-dates` },
    { label: 'unavailable dates (snake_case)',         url: `https://api.outdoorsy.com/v0/rentals/${id}/unavailable_dates` },
    { label: 'blocked dates',                          url: `https://api.outdoorsy.com/v0/rentals/${id}/blocked-dates` },
    { label: 'quote/pricing for tomorrow (smoke)',     url: `https://api.outdoorsy.com/v0/rentals/${id}/quote?from=${from}&to=${to}` }
  ];
};

const KEY_HINTS = /\b(book|booking|reserv|available|availability|calendar|block|occupied|unavailable|busy|date|range)\b/i;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

// Walk a JSON tree, collect:
//   - keys that look booking/availability shaped (with the path to them)
//   - arrays whose first element is an ISO date string
const inspect = (data, path = '$', findings = { hintKeys: [], dateArrays: [] }) => {
  if (data == null) return findings;
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') return findings;

  if (Array.isArray(data)) {
    // Check if this looks like an array of dates
    if (data.length > 0 && typeof data[0] === 'string' && ISO_DATE_RE.test(data[0])) {
      findings.dateArrays.push({ path, length: data.length, sample: data.slice(0, 5) });
    }
    // Check if this looks like an array of {start, end} or {from, to} pairs
    if (data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
      const k = Object.keys(data[0]);
      const looksLikeRange =
        (k.includes('start') && k.includes('end')) ||
        (k.includes('from') && k.includes('to')) ||
        (k.includes('startDate') && k.includes('endDate')) ||
        (k.includes('start_date') && k.includes('end_date'));
      if (looksLikeRange) {
        findings.dateArrays.push({ path, length: data.length, sample: data.slice(0, 3) });
      }
    }
    data.slice(0, 20).forEach((item, i) => inspect(item, `${path}[${i}]`, findings));
  } else if (typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (KEY_HINTS.test(k)) {
        const summary =
          v === null ? 'null'
            : Array.isArray(v) ? `array(${v.length})`
              : typeof v === 'object' ? `object{${Object.keys(v).slice(0, 6).join(',')}}`
                : typeof v;
        findings.hintKeys.push({ path: `${path}.${k}`, value: summary });
      }
      inspect(v, `${path}.${k}`, findings);
    }
  }
  return findings;
};

async function probeOne({ label, url }) {
  console.log(`\n────────────────────────────────────────────────────────`);
  console.log(`🔍 ${label}`);
  console.log(`   GET ${url}`);
  try {
    const response = await axios.get(url, {
      headers: BROWSER_HEADERS,
      timeout: 10000,
      validateStatus: () => true
    });
    const isJson = typeof response.data === 'object' && response.data !== null;
    console.log(`   → ${response.status}${isJson ? ' (json)' : ''}`);

    if (!isJson) {
      const snippet = String(response.data || '').slice(0, 200).replace(/\n/g, ' ');
      console.log(`   body (truncated): ${snippet}`);
      return;
    }

    const topKeys = Array.isArray(response.data)
      ? `array(${response.data.length})`
      : Object.keys(response.data).slice(0, 25).join(', ');
    console.log(`   top-level: ${topKeys}`);

    const findings = inspect(response.data);

    if (findings.hintKeys.length > 0) {
      console.log(`   📌 booking/availability-shaped keys:`);
      findings.hintKeys.slice(0, 25).forEach(f => {
        console.log(`      ${f.path} → ${f.value}`);
      });
      if (findings.hintKeys.length > 25) {
        console.log(`      ... and ${findings.hintKeys.length - 25} more`);
      }
    } else {
      console.log(`   (no booking/availability-shaped keys found)`);
    }

    if (findings.dateArrays.length > 0) {
      console.log(`   📅 arrays of dates / date-ranges:`);
      findings.dateArrays.forEach(f => {
        console.log(`      ${f.path}  (length ${f.length})`);
        console.log(`         sample: ${JSON.stringify(f.sample)}`);
      });
    } else {
      console.log(`   (no date arrays / range arrays found)`);
    }
  } catch (err) {
    console.log(`   ❌ request error: ${err.message}`);
  }
}

async function main() {
  console.log(`🔌 NO database connection — this script is read-only against Outdoorsy.`);
  console.log(`🎯 rental_id: ${RENTAL_ID}`);

  const candidates = buildCandidates(RENTAL_ID);
  for (const c of candidates) {
    await probeOne(c);
    // gentle delay between requests
    await new Promise(r => setTimeout(r, 500));
  }

  console.log(`\n✅ Probe complete. Nothing was modified.\n`);
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
