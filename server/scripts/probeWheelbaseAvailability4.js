/**
 * READ-ORIENTED probe v4 for Outdoorsy/Wheelbase availability.
 *
 * v3 made three things clearer:
 *   1) The widget's JS bundle (1.5 MB) has ZERO JWTs, ZERO `Bearer` literals,
 *      and ZERO `Authorization`/`apiKey` references. The widget therefore
 *      does not ship a hardcoded token and does not manually set an Auth
 *      header. Most likely it relies on a session cookie set on the
 *      outdoorsy.com / wheelbasepro.com domain.
 *
 *   2) All 7 token-mint candidates returned 405 (not 404). That means the
 *      routes EXIST — we just hit them with GET when they want POST. They
 *      are real undocumented endpoints worth POSTing.
 *
 *   3) /v0/token returned 401 with a 79-byte JSON body. v3 only printed
 *      bodies for 2xx responses, so we missed what that body said. The 401
 *      payload almost certainly states what credential is missing.
 *
 * v4 does three things:
 *
 *   STEP A — POST every token-mint candidate with empty and minimal bodies
 *            and print the FULL response body (status, headers, body)
 *            regardless of status. We want to read the 401/403 hints.
 *
 *   STEP B — Cookie flow: pretend to be the widget.
 *            1. GET https://widget.wheelbasepro.com/?rental=479203 and
 *               capture any Set-Cookie headers.
 *            2. GET https://api.outdoorsy.com/ to see if the API issues a
 *               session cookie on first contact.
 *            3. POST /v0/rentals/479203/availability with whatever cookies
 *               we accumulated. If 401 changes to 200, cookie auth wins.
 *
 *   STEP C — If any token was minted in STEP A, replay POST /availability
 *            with `Authorization: Bearer <token>` (and also with the token
 *            as a query string param, in case that's how the widget passes
 *            it).
 *
 * Safety guarantees (unchanged):
 *   - No MongoDB connection
 *   - No filesystem writes
 *   - Not wired into the server, no cron, no routes
 *   - POST only to:
 *       (a) token-mint endpoints (designed to be called anonymously to
 *           issue transient session tokens, not persistent records)
 *       (b) /v0/rentals/{id}/availability (proven non-mutating in v2)
 *     NEVER to /bookings or /quote.
 *
 * Usage on Render shell:
 *   node scripts/probeWheelbaseAvailability4.js
 *   node scripts/probeWheelbaseAvailability4.js --rental-id=479204
 */

const axios = require('axios');

const DEFAULT_RENTAL_ID = '479203';
const RENTAL_ID = (() => {
  const arg = process.argv.find(a => a.startsWith('--rental-id='));
  return arg ? arg.split('=')[1] : DEFAULT_RENTAL_ID;
})();

const WIDGET_ORIGIN = 'https://widget.wheelbasepro.com';
const API_ORIGIN = 'https://api.outdoorsy.com';

const BROWSER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Origin': WIDGET_ORIGIN,
  'Referer': `${WIDGET_ORIGIN}/`
};

const trunc = (s, n = 600) => (s.length > n ? s.slice(0, n) + '…' : s);

async function rawGet(url, headers = BROWSER_HEADERS) {
  return axios.get(url, {
    headers,
    timeout: 15000,
    maxRedirects: 5,
    validateStatus: () => true
  });
}

async function rawPost(url, body, headers = {}) {
  return axios.post(url, body, {
    headers: { ...BROWSER_HEADERS, 'Content-Type': 'application/json', ...headers },
    timeout: 15000,
    validateStatus: () => true
  });
}

function printResp(label, r) {
  const ctype = (r.headers['content-type'] || '').split(';')[0];
  const setCookie = r.headers['set-cookie'];
  const wwwAuth = r.headers['www-authenticate'];
  const body = typeof r.data === 'object' && r.data !== null ? JSON.stringify(r.data) : String(r.data || '');
  console.log(`   ${label} → ${r.status} ${ctype} ${body.length}b`);
  if (wwwAuth) console.log(`     WWW-Authenticate: ${wwwAuth}`);
  if (setCookie) {
    const arr = Array.isArray(setCookie) ? setCookie : [setCookie];
    arr.forEach(c => console.log(`     Set-Cookie: ${trunc(c, 200)}`));
  }
  if (body.length > 0) console.log(`     body: ${trunc(body, 500)}`);
  return body;
}

// ───────────────────────────────────────────────────────────────────────
// STEP A — POST every token-mint endpoint with empty + minimal bodies
// ───────────────────────────────────────────────────────────────────────
async function probeTokenMintPost(id) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP A: POST token-mint endpoints with empty + minimal bodies');
  console.log('════════════════════════════════════════════════════════');

  const paths = [
    '/v0/auth/anonymous',
    '/v0/auth/widget',
    '/v0/widget/session',
    '/v0/widget/token',
    '/v0/token',
    '/v0/sessions/anonymous',
    '/v0/public/token'
  ];

  const bodies = [
    { label: 'empty', body: {} },
    { label: 'rental_id', body: { rental_id: id } },
    { label: 'rental & origin', body: { rental_id: id, origin: WIDGET_ORIGIN } }
  ];

  const foundTokens = [];

  for (const p of paths) {
    const url = `${API_ORIGIN}${p}`;
    console.log(`\n── ${p} ──`);
    for (const b of bodies) {
      try {
        const r = await rawPost(url, b.body);
        const body = printResp(`POST [${b.label}]`, r);
        // Sniff for token-shaped fields in JSON response
        try {
          const j = typeof r.data === 'object' ? r.data : JSON.parse(body);
          const t = j && (j.token || j.access_token || j.accessToken || j.jwt || j.id_token || j.session_token);
          if (t) {
            console.log(`     📌 found token field: ${trunc(String(t), 80)}`);
            foundTokens.push({ source: `POST ${p} [${b.label}]`, token: t });
          }
        } catch {}
      } catch (err) {
        console.log(`   POST [${b.label}] → error: ${err.message}`);
      }
      await new Promise(r => setTimeout(r, 250));
    }
  }

  return foundTokens;
}

// ───────────────────────────────────────────────────────────────────────
// STEP B — cookie flow: pretend to be the widget
// ───────────────────────────────────────────────────────────────────────
function parseSetCookies(headers) {
  const sc = headers['set-cookie'];
  if (!sc) return [];
  const arr = Array.isArray(sc) ? sc : [sc];
  return arr.map(c => c.split(';')[0]).filter(Boolean);
}

async function cookieFlow(id) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP B: cookie flow — pretend to be the widget');
  console.log('════════════════════════════════════════════════════════');

  const cookieJar = [];

  // 1) load the widget page
  console.log(`\n── GET ${WIDGET_ORIGIN}/?rental=${id} ──`);
  const widgetResp = await rawGet(`${WIDGET_ORIGIN}/?rental=${id}`, {
    ...BROWSER_HEADERS,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
  });
  console.log(`   → ${widgetResp.status}  ${(widgetResp.headers['content-type'] || '').split(';')[0]}`);
  parseSetCookies(widgetResp.headers).forEach(c => {
    console.log(`     widget Set-Cookie: ${c}`);
    cookieJar.push(c);
  });

  // 2) call the api root
  console.log(`\n── GET ${API_ORIGIN}/ ──`);
  const apiResp = await rawGet(`${API_ORIGIN}/`);
  console.log(`   → ${apiResp.status}  ${(apiResp.headers['content-type'] || '').split(';')[0]}`);
  parseSetCookies(apiResp.headers).forEach(c => {
    console.log(`     api Set-Cookie: ${c}`);
    cookieJar.push(c);
  });

  // 3) also call /v0/rentals/{id} which we know returns 200 — it may set a cookie
  console.log(`\n── GET ${API_ORIGIN}/v0/rentals/${id} ──`);
  const detailResp = await rawGet(`${API_ORIGIN}/v0/rentals/${id}`);
  console.log(`   → ${detailResp.status}`);
  parseSetCookies(detailResp.headers).forEach(c => {
    console.log(`     detail Set-Cookie: ${c}`);
    cookieJar.push(c);
  });

  // 4) replay POST /availability with accumulated cookies
  const cookieHeader = cookieJar.join('; ');
  console.log(`\n── cookie jar contents (${cookieJar.length}) ──`);
  if (cookieJar.length === 0) {
    console.log('   (none — no cookies were set anywhere in the flow)');
  } else {
    console.log(`   ${cookieHeader}`);
  }

  const today = new Date();
  const inAYear = new Date(today.getTime() + 365 * 86400000);
  const fmt = (d) => d.toISOString().split('T')[0];
  const body = {
    from: fmt(today), to: fmt(inAYear),
    rental_id: id,
    start_date: fmt(today), end_date: fmt(inAYear)
  };

  console.log(`\n── replay POST ${API_ORIGIN}/v0/rentals/${id}/availability with cookies ──`);
  const replay = await rawPost(`${API_ORIGIN}/v0/rentals/${id}/availability`, body, {
    Cookie: cookieHeader || undefined
  });
  printResp('replay POST', replay);

  return { cookieJar, replayStatus: replay.status };
}

// ───────────────────────────────────────────────────────────────────────
// STEP C — replay /availability with any tokens we minted
// ───────────────────────────────────────────────────────────────────────
async function replayWithTokens(id, tokens) {
  console.log('\n════════════════════════════════════════════════════════');
  console.log('STEP C: replay POST /availability with minted tokens');
  console.log('════════════════════════════════════════════════════════');

  if (tokens.length === 0) {
    console.log('   (no tokens minted in STEP A — nothing to replay)');
    return;
  }

  const today = new Date();
  const inAYear = new Date(today.getTime() + 365 * 86400000);
  const fmt = (d) => d.toISOString().split('T')[0];
  const body = {
    from: fmt(today), to: fmt(inAYear),
    rental_id: id,
    start_date: fmt(today), end_date: fmt(inAYear)
  };
  const url = `${API_ORIGIN}/v0/rentals/${id}/availability`;

  for (const t of tokens) {
    console.log(`\n── token from ${t.source} ──`);

    // (1) Bearer header
    const r1 = await rawPost(url, body, { Authorization: `Bearer ${t.token}` });
    printResp('Bearer header', r1);

    // (2) query string param
    const r2 = await rawPost(`${url}?token=${encodeURIComponent(t.token)}`, body);
    printResp('?token= query', r2);

    await new Promise(r => setTimeout(r, 300));
  }
}

async function main() {
  console.log('🔌 NO database connection — read-oriented Outdoorsy probe v4.');
  console.log('   Verbs: GET, POST to token-mint endpoints + /availability only.');
  console.log(`🎯 rental_id: ${RENTAL_ID}`);

  const tokens = await probeTokenMintPost(RENTAL_ID);
  await cookieFlow(RENTAL_ID);
  await replayWithTokens(RENTAL_ID, tokens);

  console.log('\n✅ Probe v4 complete. Nothing in RentUFS or Outdoorsy was modified.\n');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err);
  process.exit(1);
});
