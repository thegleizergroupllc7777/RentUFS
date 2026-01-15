// API Configuration
// This determines where the frontend sends API requests

// Production URL - used when env variable isn't available
const PRODUCTION_API_URL = 'https://rentufs-api.onrender.com';

// Use environment variable if set, otherwise use production URL in production or localhost in development
const API_URL = process.env.REACT_APP_API_URL ||
  (window.location.hostname !== 'localhost' ? PRODUCTION_API_URL : 'http://localhost:5000');

export default API_URL;
