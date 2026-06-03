// Client-side VIN check-digit validation (ISO 3779), mirroring the server's
// utils/vinValidation.js. Used to give hosts friendly, immediate feedback so an
// invalid VIN is caught at listing time rather than at insurance/pickup.

const TRANSLIT = {
  A: 1, B: 2, C: 3, D: 4, E: 5, F: 6, G: 7, H: 8,
  J: 1, K: 2, L: 3, M: 4, N: 5, P: 7, R: 9,
  S: 2, T: 3, U: 4, V: 5, W: 6, X: 7, Y: 8, Z: 9,
  '0': 0, '1': 1, '2': 2, '3': 3, '4': 4,
  '5': 5, '6': 6, '7': 7, '8': 8, '9': 9
};

const WEIGHTS = [8, 7, 6, 5, 4, 3, 2, 10, 0, 9, 8, 7, 6, 5, 4, 3, 2];

// Returns { valid: boolean, reason?: string }.
export const validateVin = (vinRaw) => {
  const vin = (vinRaw || '').toUpperCase().trim();

  if (vin.length !== 17) {
    return { valid: false, reason: 'A VIN is exactly 17 characters.' };
  }
  if (/[IOQ]/.test(vin)) {
    return { valid: false, reason: 'A VIN never contains the letters I, O, or Q — please double-check.' };
  }
  if (!/^[A-HJ-NPR-Z0-9]{17}$/.test(vin)) {
    return { valid: false, reason: 'This VIN contains characters that aren\'t valid. Please re-check it.' };
  }

  let sum = 0;
  for (let i = 0; i < 17; i++) {
    sum += TRANSLIT[vin[i]] * WEIGHTS[i];
  }
  const remainder = sum % 11;
  const expected = remainder === 10 ? 'X' : String(remainder);

  if (vin[8] !== expected) {
    return { valid: false, reason: 'This VIN doesn\'t look quite right — please double-check it matches your registration or the sticker on the driver\'s-side door.' };
  }

  return { valid: true };
};

export const isValidVin = (vin) => validateVin(vin).valid;
