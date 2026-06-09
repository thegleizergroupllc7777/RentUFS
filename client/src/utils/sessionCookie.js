/**
 * Cross-subdomain session hint cookie for the rentufs.com marketing site.
 *
 * The Webflow site at rentufs.com lives on a different subdomain from the
 * React app (app.rentufs.com) and the API (api.rentufs.com), so it can't
 * read our JWT in localStorage. To let Webflow swap the "Sign Up" button for
 * a personalized "My Account" link for returning users, we set a cookie
 * scoped to the parent domain `.rentufs.com` whenever a user is authenticated
 * in this app, and clear it on logout.
 *
 * The cookie value is the user's display name (URL-encoded) — their first
 * name, or their business / DBA name when a host has chosen to be shown that
 * way (mirrors the in-app Navbar logic). It carries no secret and no token
 * data; it's purely a UI hint. If a name can't be resolved it falls back to
 * `1`, so the cookie's mere presence still signals "logged in". The real auth
 * token never leaves app.rentufs.com's localStorage.
 *
 * No-ops on any host outside the rentufs.com family, so local development
 * on localhost is unaffected.
 */

const COOKIE_NAME = 'ufs_session';
const COOKIE_MAX_AGE_SECONDS = 7 * 24 * 60 * 60; // 7 days, matches JWT expiry

function getParentDomain() {
  if (typeof window === 'undefined') return null;
  const host = window.location.hostname || '';
  if (host === 'rentufs.com' || host.endsWith('.rentufs.com')) {
    return '.rentufs.com';
  }
  return null;
}

// Resolve the label to show on the marketing site. Mirrors the Navbar logic:
// a host's business / DBA name when they've chosen that display preference,
// otherwise their first name.
function getDisplayName(user) {
  if (!user) return '';
  const info = user.hostInfo || {};
  if (info.displayPreference === 'business' && info.businessName) return info.businessName;
  if (info.displayPreference === 'dba' && info.dba) return info.dba;
  return user.firstName || '';
}

export function setSessionCookie(user) {
  const domain = getParentDomain();
  if (!domain) return;
  const name = (getDisplayName(user) || '').trim();
  const value = encodeURIComponent(name || '1');
  document.cookie = `${COOKIE_NAME}=${value}; domain=${domain}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; secure; samesite=lax`;
}

export function clearSessionCookie() {
  const domain = getParentDomain();
  if (!domain) return;
  document.cookie = `${COOKIE_NAME}=; domain=${domain}; path=/; max-age=0; samesite=lax`;
}
