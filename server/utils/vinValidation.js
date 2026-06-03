// VIN validation using the North American check-digit algorithm (ISO 3779).
// The 9th character is a checksum computed from the other 16 characters; a
// valid VIN's 9th position must equal this computed value. This mirrors the
// validation TeqMobility performs, so an invalid VIN is caught before it
// reaches the insurer.

// Transliteration values for letters (I, O, Q are not allowed in VINs).
const TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
};

// Positional weights (9th position weight is 0 — the check digit itself).
const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// Returns { valid: boolean, reason?: string } for a candidate VIN.
const validateVin = (vinRaw) => {
  const vin = (vinRaw || '').toUpperCase().trim();

  if (vin.length !== 17) {
    return { valid: false, reason: 'VIN must be exactly 17 characters' };
  }
  if (/[IOQ]/.test(vin)) {
    return { valid: false, reason: 'VIN cannot contain the letters I, O, or Q' };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return { valid: false, reason: 'VIN contains invalid characters' };
  }

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    const value = TRANSLIT[vin[i]];
    if (value === undefined) {
      return { valid: false, reason: `Invalid character at position ${i + 1}` };
    }
    sum += value * WEIGHTS[i];
  }

  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);

  if (vin[8] !== expected) {
    return { valid: false, reason: 'Check digit (9th position) does not calculate properly' };
  }

  return { valid: true };
};

const isValidVin = (vin) => validateVin(vin).valid;

module.exports = { validateVin, isValidVin };
