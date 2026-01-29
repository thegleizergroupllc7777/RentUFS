module.exports = function override(config) {
  // face-api.js tries to require('fs') for Node.js environments
  // Provide an empty fallback for browser builds
  config.resolve.fallback = {
    ...config.resolve.fallback,
    fs: false,
    path: false
  };
  return config;
};
