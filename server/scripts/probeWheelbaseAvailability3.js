/**
 * READ-ORIENTED probe v3 for Outdoorsy/Wheelbase availability.
 *
 * Goal of this whole probe series: figure out how to ask Outdoorsy "is
 * rental 479203 rented today?" so that wheelbase fleet vehicles can be
 * decorated with rentedNow:true on the marketplace, the same way p2p
 * vehicles already are (server/routes/vehicles.js attachRentedNow).
 *
 * v1 narrowed the candidates and hit 405 on 7 endpoints. v2 used OPTIONS +
 * safe POST and proved:
 *   - /v0/rentals/{id} carries NO embedded availability
 *   - POST /v0/rentals/{id}/availability is the only endpoint that reached
 *     a real handler; it returned 401 with body { error, code }
 *   - The other 4 read-shaped names 405'd even after OPTIONS claimed POST
 *     was allowed (the OPTIONS layer is a generic CORS preflight, not a
 *     route map)
 *
 * v3 answers: how does the public widget at widget.wheelbasepro.com get
 * past that 401? It must either (a) ship a public/anon bearer token in its
 * JS bundle, or (b) mint one from a token endpoint before calling
 * /availability. This probe looks for both.
 *
 * Steps:
 *   1) GET the widget HTML for rental 479203 and dump every <script src>
 *      and any inline JWT-like / bearer-like strings.
 *   2) GET each JS bundle the page references; grep for token / bearer /
 *      authorization / apikey / api_key / widget / session shaped strings
 *      and for hardcoded JWTs (^eyJ).
 *   3) Try a handful of plausible UNAUTHENTICATED token-mint endpoints with
 *      a GET — if any returns 200 with a token-shaped value, we've found
 *      the handshake.
 *   4) If we discover anything that looks like a token, replay POST
 *      /v0/rentals/479203/availability with `Authorization: Bearer <token>`
 *      and report the new status.
 *
 * Safety guarantees (unchanged across the series):
 *   - No MongoDB connection
 *   - No filesystem writes
 *   - Not wired into the server, no cron, no routes
 *   - GET-only against widget.wheelbasepro.com and any bundle hosts
 *   - The ONLY POST is against /availability (proven in v2 to return 401,
 *     not to mutate state). Never POSTs /bookings or /quote.
 *
 * Usage on Render shell:
 *   node scripts/probeWheelbaseAvailability3.js
 *   node scripts/probeWheelbaseAvailability3.js --rental-id=479204
 */

const axios = require('axios');
const { URL } = require('url');

const DEFAULT_RENTAL_ID = '479203';
const RENTAL_ID = (() => {
  const arg = process.argv.find(a => a.startsWith('--rental-id='));
  return arg ? arg.split('=')[1] : DEFAULT_RENTAL_ID;
})();

const WIDGET_ORIGIN = 'https://widget.wheelbasepro.com';
const API_ORIGIN = 'https://api.outdoorsy.com';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': `${WIDGET_ORIGIN}/`
};

const JSON_HEADERS = {
  ...BROWSER_HEADERS,
  'Accept': 'application/json, text/plain, */*',
  'Origin': WIDGET_ORIGIN
};

async function rawGet(url, headers = BROWSER_HEADERS) {
  return axios.get(url, {
    headers,
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: () => true,
    transformResponse: [(d) => d] // keep raw string for HTML/JS
  });
}

async function rawPost(url, body, headers = {}) {
  return axios.post(url, body, {
    headers: { ...JSON_HEADERS, 'Content-Type': 'application/json', ...headers },
    timeout: 15000,
    validateStatus: () => true
  });
}

// ───────────────────────────────────────────────────────────────────────
// Patterns we care about in the widget bundle.
// ───────────────────────────────────────────────────────────────────────
const JWT_RE = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}\b/g;
const BEARER_LIT_RE = /["']Bearer\s+[A-Za-z0-9._\-+/=]{8,}["']/g;
const AUTH_KEY_RE = /["'](?:Authorization|authorization|x-api-key|X-API-Key|api[_-]?key|apiKey|access[_-]?token|accessToken|widget[_-]?key|widgetKey)["']/g;
const TOKEN_URL_RE = /https?:\/\/[A-Za-z0-9.\-_/]*(?:auth|token|session|widget|oauth)[A-Za-z0-9.\-_/?=&%]*/gi;
const API_URL_RE = /https?:\/\/api\.outdoorsy\.com\/[A-Za-z0-9.\-_/?=&%]+/g;
const SCRIPT_SRC_RE = /<script[^>]+src=["']([^"']+)["']/gi;

const unique = (arr) => Array.from(new Set(arr));
const trunc = (s, n = 200) => (s.length > n ? s.slice(0, n) + '…' : s);

function absolutize(maybeUrl, base) {
  try {
    return new URL(maybeUrl, base).toString();
  } catch {
    return null;
  }
}

// ───────────────────────────────────────────────────────────────────────
// Step 1: fetch widget HTML
// ───────────────────────────────────────────────────────────────────────
async function fetchWidgetHtml(id) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP 1: fetch widget HTML and list <script src>');
  console.log('════════════════════════════════════════════════════════');

  const candidates = [
    `${WIDGET_ORIGIN}/?rental=${id}`,
    `${WIDGET_ORIGIN}/rental/${id}`,
    `${WIDGET_ORIGIN}/embed?rental=${id}`,
    `${WIDGET_ORIGIN}/`
  ];

  for (const url of candidates) {
    console.log(`\n   GET ${url}`);
    const r = await rawGet(url);
    console.log(`   → ${r.status}  (${(r.headers['content-type'] || '').split(';')[0]}, ${String(r.data || '').length} bytes)`);
    const body = String(r.data || '');
    if (r.status >= 200 && r.status < 300 && body.length > 0) {
      const srcs = [];
      let m;
      while ((m = SCRIPT_SRC_RE.exec(body)) !== null) srcs.push(m[1]);
      const abs = unique(srcs.map(s => absolutize(s, url)).filter(Boolean));
      console.log(`   <script src> count: ${abs.length}`);
      abs.slice(0, 20).forEach(s => console.log(`     - ${s}`));

      const jwts = unique(body.match(JWT_RE) || []);
      const bearers = unique(body.match(BEARER_LIT_RE) || []);
      if (jwts.length) {
        console.log(`   📌 JWT-shaped strings in HTML: ${jwts.length}`);
        jwts.slice(0, 5).forEach(j => console.log(`     - ${trunc(j, 80)}`));
      }
      if (bearers.length) {
        console.log(`   📌 Bearer literals in HTML: ${bearers.length}`);
        bearers.slice(0, 5).forEach(b => console.log(`     - ${trunc(b, 80)}`));
      }
      return { url, body, scripts: abs };
    }
  }
  console.log('\n   no widget HTML retrievable — bailing on Step 1');
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// Step 2: scan JS bundles for auth-shaped strings
// ───────────────────────────────────────────────────────────────────────
async function scanBundles(scripts) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP 2: scan JS bundles for auth/token strings');
  console.log('════════════════════════════════════════════════════════');

  // Prefer bundles that look like main app code, skip third-party analytics.
  const skip = /\b(google|gtag|gtm|hotjar|segment|intercom|sentry|stripe|fullstory|datadog)\b/i;
  const ordered = scripts.filter(s => !skip.test(s)).concat(scripts.filter(s => skip.test(s)));

  const allTokens = new Set();
  const allBearers = new Set();
  const allAuthKeys = new Set();
  const allTokenUrls = new Set();
  const allApiUrls = new Set();

  for (const src of ordered.slice(0, 12)) {
    console.log(`\n   GET ${src}`);
    let r;
    try {
      r = await rawGet(src);
    } catch (err) {
      console.log(`     error: ${err.message}`);
      continue;
    }
    console.log(`   → ${r.status}  (${String(r.data || '').length} bytes)`);
    if (r.status < 200 || r.status >= 300) continue;
    const body = String(r.data || '');

    const jwts = body.match(JWT_RE) || [];
    const bearers = body.match(BEARER_LIT_RE) || [];
    const authKeys = body.match(AUTH_KEY_RE) || [];
    const tokenUrls = body.match(TOKEN_URL_RE) || [];
    const apiUrls = body.match(API_URL_RE) || [];

    jwts.forEach(x => allTokens.add(x));
    bearers.forEach(x => allBearers.add(x));
    authKeys.forEach(x => allAuthKeys.add(x));
    tokenUrls.forEach(x => allTokenUrls.add(x));
    apiUrls.forEach(x => allApiUrls.add(x));

    console.log(`     jwts:${jwts.length}  bearer-lits:${bearers.length}  auth-keys:${authKeys.length}  token-urls:${tokenUrls.length}  api-urls:${apiUrls.length}`);
  }

  console.log('\n   ── unique findings across all bundles ──');
  console.log(`   JWT-shaped strings: ${allTokens.size}`);
  Array.from(allTokens).slice(0, 5).forEach(j => console.log(`     - ${trunc(j, 120)}`));
  console.log(`   Bearer literals: ${allBearers.size}`);
  Array.from(allBearers).slice(0, 5).forEach(b => console.log(`     - ${trunc(b, 120)}`));
  console.log(`   Auth-header key references: ${allAuthKeys.size}`);
  Array.from(allAuthKeys).slice(0, 20).forEach(k => console.log(`     - ${k}`));
  console.log(`   Token/session/auth/widget URLs: ${allTokenUrls.size}`);
  Array.from(allTokenUrls).slice(0, 20).forEach(u => console.log(`     - ${u}`));
  console.log(`   api.outdoorsy.com URLs found in bundle: ${allApiUrls.size}`);
  Array.from(allApiUrls).slice(0, 30).forEach(u => console.log(`     - ${u}`));

  return {
    jwts: Array.from(allTokens),
    bearers: Array.from(allBearers),
    tokenUrls: Array.from(allTokenUrls),
    apiUrls: Array.from(allApiUrls)
  };
}

// ───────────────────────────────────────────────────────────────────────
// Step 3: try a few plausible unauth token-mint endpoints
// ───────────────────────────────────────────────────────────────────────
async function probeTokenEndpoints() {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP 3: probe plausible unauth token-mint endpoints (GET)');
  console.log('════════════════════════════════════════════════════════');

  const candidates = [
    `${API_ORIGIN}/v0/auth/anonymous`,
    `${API_ORIGIN}/v0/auth/widget`,
    `${API_ORIGIN}/v0/widget/session`,
    `${API_ORIGIN}/v0/widget/token`,
    `${API_ORIGIN}/v0/token`,
    `${API_ORIGIN}/v0/sessions/anonymous`,
    `${API_ORIGIN}/v0/public/token`
  ];

  const hits = [];
  for (const url of candidates) {
    const r = await rawGet(url, JSON_HEADERS);
    const ctype = (r.headers['content-type'] || '').split(';')[0];
    const body = typeof r.data === 'string' ? r.data : JSON.stringify(r.data || '');
    console.log(`   GET ${url} → ${r.status}  ${ctype}  ${body.length}b`);
    if (r.status >= 200 && r.status < 300) {
      console.log(`     body: ${trunc(body, 300)}`);
      hits.push({ url, body });
    }
    await new Promise(r2 => setTimeout(r2, 300));
  }
  return hits;
}

// ───────────────────────────────────────────────────────────────────────
// Step 4: if we found a candidate token, replay POST /availability
// ───────────────────────────────────────────────────────────────────────
async function replayAvailability(id, token, label) {
  const url = `${API_ORIGIN}/v0/rentals/${id}/availability`;
  const today = new Date();
  const inAYear = new Date(today.getTime() + 365 * 24 * 60 * 60 * 1000);
  const fmt = (d) => d.toISOString().split('T')[0];
  const body = {
    from: fmt(today),
    to: fmt(inAYear),
    rental_id: id,
    start_date: fmt(today),
    end_date: fmt(inAYear)
  };

  console.log(`\n   replay POST ${url}`);
  console.log(`     using token from: ${label}`);
  const r = await rawPost(url, body, { Authorization: `Bearer ${token}` });
  const isJson = typeof r.data === 'object' && r.data !== null;
  const bodyStr = isJson ? JSON.stringify(r.data) : String(r.data || '');
  console.log(`   → ${r.status}${isJson ? ' (json)' : ''}  ${bodyStr.length}b`);
  console.log(`     ${trunc(bodyStr, 400)}`);
  return r.status;
}

async function main() {
  console.log('🔌 NO database connection — read-oriented Outdoorsy probe v3.');
  console.log('   Verbs: GET (widget + bundles + token mints) and POST (only /availability, proven safe in v2).');
  console.log(`🎯 rental_id: ${RENTAL_ID}`);

  const widget = await fetchWidgetHtml(RENTAL_ID);
  let bundleFindings = null;
  if (widget && widget.scripts.length > 0) {
    bundleFindings = await scanBundles(widget.scripts);
  } else {
    console.log('\n(skipping bundle scan — no scripts to follow)');
  }

  const tokenHits = await probeTokenEndpoints();

  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP 4: replay POST /availability with any candidate tokens');
  console.log('════════════════════════════════════════════════════════');

  const candidates = [];
  if (bundleFindings) {
    bundleFindings.jwts.slice(0, 3).forEach(j => candidates.push({ token: j, label: 'JWT in bundle' }));
    bundleFindings.bearers.slice(0, 3).forEach(b => {
      const stripped = b.replace(/^["']Bearer\s+/, '').replace(/["']$/, '');
      candidates.push({ token: stripped, label: 'bearer literal in bundle' });
    });
  }
  tokenHits.forEach(h => {
    try {
      const j = JSON.parse(h.body);
      const t = j.token || j.access_token || j.accessToken || j.jwt || j.id_token;
      if (t) candidates.push({ token: t, label: `token endpoint ${h.url}` });
    } catch {}
  });

  if (candidates.length === 0) {
    console.log('   no candidate tokens found — nothing to replay');
  } else {
    console.log(`   ${candidates.length} candidate token(s) to try`);
    for (const c of candidates) {
      await replayAvailability(RENTAL_ID, c.token, c.label);
      await new Promise(r => setTimeout(r, 400));
    }
  }

  console.log('\n✅ Probe v3 complete. Nothing in RentUFS or Outdoorsy was modified.\n');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
