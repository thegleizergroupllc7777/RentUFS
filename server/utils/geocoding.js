const axios = require('axios');

/**
 * Geocode an address using Google Maps Geocoding API
 * @param {string} address - Full address or partial (city, state, zip)
 * @returns {Promise<{lat: number, lng: number} | null>}
 */
async function geocodeAddress(address) {
  const apiKey = process.env.GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn('GOOGLE_MAPS_API_KEY not set - geocoding disabled');
    return null;
  }

  try {
    const response = await axios.get(
      'https://maps.googleapis.com/maps/api/geocode/json',
      {
        params: {
          address: address,
          key: apiKey
        }
      }
    );

    if (response.data.status === 'OK' && response.data.results.length > 0) {
      const { lat, lng } = response.data.results[0].geometry.location;
      return { lat, lng };
    }

    console.warn('Geocoding returned no results for:', address);
    return null;
  } catch (error) {
    console.error('Geocoding error:', error.message);
    return null;
  }
}

/**
 * Build an address string from location components
 * @param {Object} location - Location object with city, state, zipCode
 * @returns {string}
 */
function buildAddressString(location) {
  const parts = [];
  if (location.address) parts.push(location.address);
  if (location.city) parts.push(location.city);
  if (location.state) parts.push(location.state);
  if (location.zipCode) parts.push(location.zipCode);
  return parts.join(', ') + ', USA';
}

module.exports = {
  geocodeAddress,
  buildAddressString
};
