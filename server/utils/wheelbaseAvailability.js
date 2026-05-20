/**
 * Wheelbase / Outdoorsy availability lookup for fleet vehicles.
 *
 * Wheelbase fleet vehicles (Vehicle.bookingProvider === 'wheelbase') have
 * their reservations in Outdoorsy's system, not in our local Booking
 * collection — so the local rentedNow check in attachRentedNow() always
 * comes back false for them, and the "Rented" marketplace badge never
 * shows up.
 *
 * Probes v1–v4 + DevTools on the live widget proved the widget calls:
 *   GET https://api.outdoorsy.com/v0/availability
 *       ?rental_id=<id>&from=YYYY-MM-DD&to=YYYY-MM-DD
 * unauthenticated (no Authorization, no API-Token, no cookie — just
 * Origin/Referer set to the widget's domain), and returns a JSON array
 * of unavailable date ranges within that window. Empty array = available.
 *
 * This helper exposes isWheelbaseRentedToday(rentalId) which calls that
 * endpoint with today's date as both `from` and `to`, and returns true
 * iff the response is a non-empty array.
 *
 * Cached in-memory per rentalId for 60s to keep marketplace page loads
 * snappy and avoid hammering Outdoorsy. On any error (timeout, non-200,
 * unexpected shape) the helper returns false — better to show a rented
 * car as available (renter discovers at booking) than to hide an
 * available car.
 */

const axios = require('axios');

const ENDPOINT = 'https://api.outdoorsy.com/v0/availability';
const WIDGET_ORIGIN = 'https://widget.wheelbasepro.com';
const TTL_MS = 60 * 1000;
const REQUEST_TIMEOUT_MS = 5000;

const cache = new Map();

function todayIso() {
  return new Date().toISOString().split('T')[0];
}

async function isWheelbaseRentedOn(rentalId, dateIso) {
  if (!rentalId) return false;
  const id = String(rentalId);
  const day = dateIso || todayIso();
  const cacheKey = `${id}|${day}`;
  const now = Date.now();
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.rentedNow;

  try {
    const res = await axios.get(ENDPOINT, {
      params: { rental_id: id, from: day, to: day },
      headers: {
        Accept: '*/*',
        Origin: WIDGET_ORIGIN,
        Referer: `${WIDGET_ORIGIN}/`,
        'User-Agent': 'Mozilla/5.0 (compatible; RentUFS marketplace)'
      },
      timeout: REQUEST_TIMEOUT_MS,
      validateStatus: () => true
    });
    if (res.status !== 200 || !Array.isArray(res.data)) {
      cache.set(cacheKey, { rentedNow: false, expiresAt: now + TTL_MS });
      return false;
    }
    const rentedNow = res.data.length > 0;
    cache.set(cacheKey, { rentedNow, expiresAt: now + TTL_MS });
    return rentedNow;
  } catch (err) {
    return false;
  }
}

async function isWheelbaseRentedToday(rentalId) {
  return isWheelbaseRentedOn(rentalId, todayIso());
}

module.exports = { isWheelbaseRentedToday, isWheelbaseRentedOn };
