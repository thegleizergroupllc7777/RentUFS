/**
 * Cross-subdomain session hint cookie for the rentufs.com marketing site.
 *
 * The Webflow site at rentufs.com lives on a different subdomain from the
 * React app (app.rentufs.com) and the API (api.rentufs.com), so it can't
 * read our JWT in localStorage. To let Webflow swap the "Login / Sign Up"
 * buttons for a "Dashboard / Logout" nav for returning users, we set a
 * cookie scoped to the parent domain `.rentufs.com` whenever a user is
 * authenticated in this app, and clear it on logout.
 *
 * The cookie value is the literal `1` — it carries no secret and no token
 * data. It's purely a UI hint. The real auth token never leaves
 * app.rentufs.com's localStorage.
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

export function setSessionCookie() {
  const domain = getParentDomain();
  if (!domain) return;
  document.cookie = `${COOKIE_NAME}=1; domain=${domain}; path=/; max-age=${COOKIE_MAX_AGE_SECONDS}; secure; samesite=lax`;
}

export function clearSessionCookie() {
  const domain = getParentDomain();
  if (!domain) return;
  document.cookie = `${COOKIE_NAME}=; domain=${domain}; path=/; max-age=0; samesite=lax`;
}
