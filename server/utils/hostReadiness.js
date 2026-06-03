// Determines whether a host's profile has the information required to issue
// insurance coverage. Mirrors the address/name resolution used in
// utils/teqmobility.js (upsertOwner) so a listing only goes live when its
// host can actually be insured.
//
// Individual hosts: name from first/last, address from host.address (Home
// Address) with fallback to hostInfo.legalAddress.
// Business hosts: name from businessName, address from businessAddress with
// fallback to host.address / legalAddress.

const addressComplete = (addr) =>
  !!(addr && addr.street && addr.city && addr.state && addr.zipCode);

// Returns the address object insurance would use for this host (or null).
const resolveHostAddress = (host) => {
  const isBusinessHost = host?.hostInfo?.accountType === 'business'
    && !!host?.hostInfo?.businessName;

  if (isBusinessHost && addressComplete(host?.hostInfo?.businessAddress)) {
    return host.hostInfo.businessAddress;
  }
  if (addressComplete(host?.address)) return host.address;
  if (addressComplete(host?.hostInfo?.legalAddress)) return host.hostInfo.legalAddress;
  return null;
};

// Returns { ready: boolean, missing: string[] } describing whether the host
// has the data insurance needs (name + a complete address).
const checkHostReadiness = (host) => {
  const missing = [];

  const isBusinessHost = host?.hostInfo?.accountType === 'business'
    && !!host?.hostInfo?.businessName;

  const name = isBusinessHost
    ? host?.hostInfo?.businessName
    : `${host?.firstName || ''} ${host?.lastName || ''}`.trim();
  if (!name) missing.push('name');

  if (!resolveHostAddress(host)) missing.push('address');

  return { ready: missing.length === 0, missing };
};

// Convenience boolean.
const isHostInsuranceReady = (host) => checkHostReadiness(host).ready;

module.exports = { checkHostReadiness, isHostInsuranceReady, resolveHostAddress };
