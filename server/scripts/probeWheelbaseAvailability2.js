/**
 * READ-ORIENTED probe v2 for Outdoorsy/Wheelbase availability.
 *
 * Builds on probeWheelbaseAvailability.js with three changes:
 *
 *   1) Fixes the v1 regex bug: JavaScript treats `_` as a word character, so
 *      `\bbooking\b` did not match `booking_leeway_days`. v2 uses a simple
 *      lowercase substring match so multi-word snake_case keys are caught.
 *
 *   2) Fully walks the /v0/rentals/{id} response (which v1 confirmed returns
 *      200) and prints EVERY key whose name looks booking/availability shaped,
 *      with the path to it and a value summary. If availability is buried in
 *      that response, this surfaces it.
 *
 *   3) For endpoints that returned 405 in v1, asks the server politely:
 *        a) sends OPTIONS to learn which methods are allowed
 *        b) if the endpoint name is clearly *read-shaped* (availability,
 *           calendar, unavailable-dates, blocked-dates), sends a POST with a
 *           date-range body and inspects the response
 *      It deliberately SKIPS POSTing to mutation-shaped names (`/bookings`,
 *      `/quote`) so we can't accidentally create a reservation or a price
 *      quote in Outdoorsy's system.
 *
 * Safety guarantees (unchanged from v1):
 *   - No MongoDB connection
 *   - No filesystem writes
 *   - Not wired into the server, no cron, no routes
 *   - Read-shaped HTTP verbs only (GET, OPTIONS, and POST-as-query against
 *     read-shaped endpoints — never against `/bookings` or `/quote`)
 *
 * Usage on Render shell:
 *   node scripts/probeWheelbaseAvailability2.js
 *   node scripts/probeWheelbaseAvailability2.js --rental-id=479204
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

// Hint words. Match is case-insensitive substring on the key name — so
// `booking_leeway_days`, `bookedDates`, `unavailable_dates`, `CalendarRanges`
// will all match.
const HINT_WORDS = [
  'book', 'reserv', 'available', 'availability', 'calendar',
  'block', 'occupied', 'unavailable', 'busy', 'date', 'range'
];
const matchesHint = (key) => {
  const k = String(key).toLowerCase();
  return HINT_WORDS.some(w => k.includes(w));
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}/;

const summarize = (v) => {
  if (v === null) return 'null';
  if (Array.isArray(v)) return `array(${v.length})`;
  if (typeof v === 'object') return `object{${Object.keys(v).slice(0, 8).join(',')}}`;
  if (typeof v === 'string') return v.length > 60 ? `"${v.slice(0, 60)}..."` : `"${v}"`;
  return String(v);
};

const inspect = (data, path = '$', findings = { hintKeys: [], dateArrays: [] }) => {
  if (data == null) return findings;
  if (typeof data === 'string' || typeof data === 'number' || typeof data === 'boolean') return findings;

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'string' && ISO_DATE_RE.test(data[0])) {
      findings.dateArrays.push({ path, length: data.length, sample: data.slice(0, 5) });
    }
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
    data.slice(0, 25).forEach((item, i) => inspect(item, `${path}[${i}]`, findings));
  } else if (typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (matchesHint(k)) {
        findings.hintKeys.push({ path: `${path}.${k}`, value: summarize(v) });
      }
      inspect(v, `${path}.${k}`, findings);
    }
  }
  return findings;
};

async function rawGet(url) {
  return axios.get(url, {
    headers: BROWSER_HEADERS,
    timeout: 10000,
    validateStatus: () => true
  });
}

async function rawOptions(url) {
  return axios.request({
    method: 'OPTIONS',
    url,
    headers: {
      ...BROWSER_HEADERS,
      'Access-Control-Request-Method': 'POST',
      'Access-Control-Request-Headers': 'content-type'
    },
    timeout: 10000,
    validateStatus: () => true
  });
}

async function rawPost(url, body) {
  return axios.post(url, body, {
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json' },
    timeout: 10000,
    validateStatus: () => true
  });
}

// ───────────────────────────────────────────────────────────────────────
// Step 1: Re-inspect rental details with the FIXED regex
// ───────────────────────────────────────────────────────────────────────
async function inspectRentalDetails(id) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP 1: Re-inspect /v0/rentals/{id} with fixed regex');
  console.log('════════════════════════════════════════════════════════');
  const url = `https://api.outdoorsy.com/v0/rentals/${id}`;
  console.log(`   GET ${url}`);
  const r = await rawGet(url);
  console.log(`   → ${r.status}`);
  if (typeof r.data !== 'object' || r.data === null) {
    console.log('   not JSON, skipping');
    return;
  }

  // List ALL top-level keys (v1 truncated to 25)
  const topKeys = Array.isArray(r.data) ? `array(${r.data.length})` : Object.keys(r.data);
  console.log(`   total top-level keys: ${Array.isArray(topKeys) ? topKeys.length : topKeys}`);
  if (Array.isArray(topKeys)) {
    console.log('   all top-level keys:');
    for (let i = 0; i < topKeys.length; i += 6) {
      console.log('     ' + topKeys.slice(i, i + 6).join(', '));
    }
  }

  const findings = inspect(r.data);

  console.log('\n   ── booking/availability-shaped keys found ──');
  if (findings.hintKeys.length === 0) {
    console.log('   (none — surprising, double-check regex)');
  } else {
    findings.hintKeys.slice(0, 60).forEach(f => {
      console.log(`     ${f.path} → ${f.value}`);
    });
    if (findings.hintKeys.length > 60) {
      console.log(`     ... and ${findings.hintKeys.length - 60} more`);
    }
  }

  console.log('\n   ── date arrays / range arrays found ──');
  if (findings.dateArrays.length === 0) {
    console.log('   (none)');
  } else {
    findings.dateArrays.forEach(f => {
      console.log(`     ${f.path} (length ${f.length})`);
      console.log(`       sample: ${JSON.stringify(f.sample)}`);
    });
  }
}

// ───────────────────────────────────────────────────────────────────────
// Step 2: OPTIONS + safe POST against the 405 endpoints
// ───────────────────────────────────────────────────────────────────────
async function probe405Endpoints(id) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP 2: OPTIONS + safe POST against 405 endpoints');
  console.log('════════════════════════════════════════════════════════');

  const today = new Date();
  const inAYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().split('T')[0];
  const from = fmt(today);
  const to = fmt(inAYear);

  // Each entry says whether it's safe to POST against. We POST only against
  // names that read like queries; we never POST to /bookings or /quote since
  // those are mutation-shaped and could create real records on their side.
  const targets = [
    { name: 'availability',       path: 'availability',        canPost: true  },
    { name: 'calendar',           path: 'calendar',            canPost: true  },
    { name: 'unavailable-dates',  path: 'unavailable-dates',   canPost: true  },
    { name: 'unavailable_dates',  path: 'unavailable_dates',   canPost: true  },
    { name: 'blocked-dates',      path: 'blocked-dates',       canPost: true  },
    { name: 'bookings',           path: 'bookings',            canPost: false, skipReason: 'mutation-shaped (could create a reservation)' },
    { name: 'quote',              path: 'quote',               canPost: false, skipReason: 'mutation-shaped (could create a price quote record)' }
  ];

  for (const t of targets) {
    const url = `https://api.outdoorsy.com/v0/rentals/${id}/${t.path}`;
    console.log(`\n────────────────────────────────────────────────`);
    console.log(`🔍 ${t.name}`);
    console.log(`   URL: ${url}`);

    // OPTIONS
    try {
      const o = await rawOptions(url);
      const allow = o.headers && (o.headers['allow'] || o.headers['Allow']);
      const acam = o.headers && (o.headers['access-control-allow-methods'] || o.headers['Access-Control-Allow-Methods']);
      console.log(`   OPTIONS → ${o.status}`);
      if (allow) console.log(`     Allow: ${allow}`);
      if (acam) console.log(`     Access-Control-Allow-Methods: ${acam}`);
      if (!allow && !acam) console.log(`     (no Allow / ACAM header returned)`);
    } catch (err) {
      console.log(`   OPTIONS → error: ${err.message}`);
    }

    // POST (only to read-shaped endpoints)
    if (!t.canPost) {
      console.log(`   POST → SKIPPED (${t.skipReason})`);
      continue;
    }

    const body = { from, to, rental_id: id, start_date: from, end_date: to };
    console.log(`   POST body: ${JSON.stringify(body)}`);
    try {
      const p = await rawPost(url, body);
      const isJson = typeof p.data === 'object' && p.data !== null;
      console.log(`   POST → ${p.status}${isJson ? ' (json)' : ''}`);

      if (!isJson) {
        const snippet = String(p.data || '').slice(0, 220).replace(/\n/g, ' ');
        if (snippet) console.log(`     body: ${snippet}`);
      } else {
        const topKeys = Array.isArray(p.data)
          ? `array(${p.data.length})`
          : Object.keys(p.data).slice(0, 25).join(', ');
        console.log(`     top-level: ${topKeys}`);

        const f = inspect(p.data);
        if (f.hintKeys.length > 0) {
          console.log(`     📌 hint keys:`);
          f.hintKeys.slice(0, 30).forEach(x => console.log(`        ${x.path} → ${x.value}`));
        }
        if (f.dateArrays.length > 0) {
          console.log(`     📅 date arrays:`);
          f.dateArrays.forEach(x => {
            console.log(`        ${x.path} (length ${x.length})`);
            console.log(`          sample: ${JSON.stringify(x.sample)}`);
          });
        }
      }
    } catch (err) {
      console.log(`   POST → error: ${err.message}`);
    }

    // gentle delay
    await new Promise(r => setTimeout(r, 500));
  }
}

async function main() {
  console.log('🔌 NO database connection — read-oriented Outdoorsy probe v2.');
  console.log('   Verbs: GET, OPTIONS, and POST (only to read-shaped endpoints).');
  console.log('   Skips POST against /bookings and /quote.');
  console.log(`🎯 rental_id: ${RENTAL_ID}`);

  await inspectRentalDetails(RENTAL_ID);
  await probe405Endpoints(RENTAL_ID);

  console.log('\n✅ Probe v2 complete. Nothing in RentUFS or Outdoorsy was modified.\n');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
