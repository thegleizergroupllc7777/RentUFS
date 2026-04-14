import React, { useState, useEffect, useRef, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import './RegistrationOCR.css';

// Map state abbreviations to full names for matching OCR text
const STATE_NAMES = {
  AZ: 'ARIZONA', CA: 'CALIFORNIA', CO: 'COLORADO', CT: 'CONNECTICUT',
  FL: 'FLORIDA', GA: 'GEORGIA', IL: 'ILLINOIS', MD: 'MARYLAND',
  NV: 'NEVADA', PA: 'PENNSYLVANIA', SC: 'SOUTH CAROLINA', TX: 'TEXAS',
  AL: 'ALABAMA', AK: 'ALASKA', AR: 'ARKANSAS', DE: 'DELAWARE',
  HI: 'HAWAII', ID: 'IDAHO', IN: 'INDIANA', IA: 'IOWA',
  KS: 'KANSAS', KY: 'KENTUCKY', LA: 'LOUISIANA', ME: 'MAINE',
  MA: 'MASSACHUSETTS', MI: 'MICHIGAN', MN: 'MINNESOTA', MS: 'MISSISSIPPI',
  MO: 'MISSOURI', MT: 'MONTANA', NE: 'NEBRASKA', NH: 'NEW HAMPSHIRE',
  NJ: 'NEW JERSEY', NM: 'NEW MEXICO', NY: 'NEW YORK', NC: 'NORTH CAROLINA',
  ND: 'NORTH DAKOTA', OH: 'OHIO', OK: 'OKLAHOMA', OR: 'OREGON',
  RI: 'RHODE ISLAND', SD: 'SOUTH DAKOTA', TN: 'TENNESSEE', UT: 'UTAH',
  VT: 'VERMONT', VA: 'VIRGINIA', WA: 'WASHINGTON', WV: 'WEST VIRGINIA',
  WI: 'WISCONSIN', WY: 'WYOMING', DC: 'DISTRICT OF COLUMBIA'
};

const RegistrationOCR = ({
  registrationImage,
  enteredPlate,
  enteredState,
  enteredExpiration,
  enteredMake,
  enteredModel,
  enteredYear,
  onOcrResult
}) => {
  const [status, setStatus] = useState('idle'); // idle, scanning, done, error
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState(null); // { plate, state, expiration, make, model, year }
  const hasRun = useRef(false);

  // Normalize a string for comparison
  const normalize = (str) => {
    if (!str) return '';
    return str.toUpperCase().replace(/[\s\-./\\,]/g, '');
  };

  // Check if plate matches OCR text
  const checkPlate = (ocrText, plate) => {
    if (!plate || plate.trim().length < 3) return { matched: null, message: 'Plate too short to verify' };
    const normalizedPlate = normalize(plate);
    const normalizedText = normalize(ocrText);

    // Direct match
    if (normalizedText.includes(normalizedPlate)) {
      return { matched: true, message: 'License plate matches document' };
    }

    // Fuzzy match with common OCR substitutions
    const substitutions = [
      [/O/g, '0'], [/0/g, 'O'],
      [/I/g, '1'], [/1/g, 'I'],
      [/L/g, '1'], [/1/g, 'L'],
      [/S/g, '5'], [/5/g, 'S'],
      [/B/g, '8'], [/8/g, 'B'],
      [/Z/g, '2'], [/2/g, 'Z'],
      [/G/g, '6'], [/6/g, 'G'],
    ];
    for (const [pattern, replacement] of substitutions) {
      const variant = normalizedPlate.replace(pattern, replacement);
      if (normalizedText.includes(variant)) {
        return { matched: true, message: 'License plate matches document' };
      }
    }

    return { matched: false, message: 'License plate does not match document' };
  };

  // Check if state matches OCR text
  const checkState = (ocrText, stateAbbr) => {
    if (!stateAbbr) return { matched: null, message: 'No state selected' };
    const upperText = ocrText.toUpperCase();

    // Check abbreviation
    if (upperText.includes(stateAbbr.toUpperCase())) {
      return { matched: true, message: 'Registration state matches document' };
    }

    // Check full state name
    const fullName = STATE_NAMES[stateAbbr.toUpperCase()];
    if (fullName && upperText.includes(fullName)) {
      return { matched: true, message: 'Registration state matches document' };
    }

    return { matched: false, message: 'Registration state does not match document' };
  };

  // Check if expiration date appears in OCR text
  const checkExpiration = (ocrText, expiration) => {
    if (!expiration) return { matched: null, message: 'No expiration date entered' };
    const normalizedText = normalize(ocrText);

    // Parse the entered date
    const date = new Date(expiration);
    if (isNaN(date.getTime())) return { matched: null, message: 'Invalid date' };

    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate() + 1).padStart(2, '0'); // +1 for timezone offset
    const year = String(date.getFullYear());
    const shortYear = year.slice(-2);

    // Try various date formats
    const formats = [
      `${month}${day}${year}`,       // MMDDYYYY
      `${month}${day}${shortYear}`,  // MMDDYY
      `${month}${year}`,             // MMYYYY (some states only show month/year)
      `${month}${shortYear}`,        // MMYY
      `${year}`,                     // Just the year
    ];

    for (const fmt of formats) {
      if (normalizedText.includes(fmt)) {
        return { matched: true, message: 'Expiration date matches document' };
      }
    }

    // Also check if month name + year appears
    const monthNames = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
    const monthName = monthNames[date.getMonth()];
    const upperText = ocrText.toUpperCase();
    if (upperText.includes(monthName) && (upperText.includes(year) || upperText.includes(shortYear))) {
      return { matched: true, message: 'Expiration date matches document' };
    }

    return { matched: false, message: 'Expiration date not found on document' };
  };

  // Check if vehicle make/model/year appear in OCR text
  const checkVehicleInfo = (ocrText, make, model, year) => {
    const upperText = ocrText.toUpperCase();
    const found = [];
    const notFound = [];

    if (year) {
      const yearStr = String(year);
      if (upperText.includes(yearStr)) {
        found.push(`Year (${yearStr})`);
      } else {
        notFound.push(`Year (${yearStr})`);
      }
    }

    if (make) {
      const upperMake = make.toUpperCase();
      // Some registrations abbreviate (e.g., "MERC" for Mercedes-Benz, "CHEV" for Chevrolet)
      const makeAliases = {
        'MERCEDES-BENZ': ['MERCEDES', 'MERC', 'MB'],
        'CHEVROLET': ['CHEVY', 'CHEV'],
        'VOLKSWAGEN': ['VW'],
        'LAND ROVER': ['LANDROVER', 'LAND'],
        'ROLLS-ROYCE': ['ROLLS', 'RR'],
      };
      const aliases = [upperMake, ...(makeAliases[upperMake] || [])];
      if (aliases.some(a => upperText.includes(a))) {
        found.push(`Make (${make})`);
      } else {
        notFound.push(`Make (${make})`);
      }
    }

    if (model) {
      if (upperText.includes(model.toUpperCase())) {
        found.push(`Model (${model})`);
      } else {
        notFound.push(`Model (${model})`);
      }
    }

    return { found, notFound };
  };

  const runOcr = useCallback(async () => {
    if (!registrationImage || hasRun.current) return;
    hasRun.current = true;
    setStatus('scanning');
    setProgress(0);

    try {
      const result = await Tesseract.recognize(registrationImage, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        }
      });

      const ocrText = result.data.text;
      console.log('📋 Registration OCR text:', ocrText);

      const plateResult = checkPlate(ocrText, enteredPlate);
      const stateResult = checkState(ocrText, enteredState);
      const expirationResult = checkExpiration(ocrText, enteredExpiration);
      const vehicleResult = checkVehicleInfo(ocrText, enteredMake, enteredModel, enteredYear);

      const ocrResults = {
        plate: plateResult,
        state: stateResult,
        expiration: expirationResult,
        vehicle: vehicleResult,
        ocrText
      };

      setResults(ocrResults);
      setStatus('done');

      if (onOcrResult) {
        onOcrResult(ocrResults);
      }
    } catch (err) {
      console.error('❌ Registration OCR error:', err);
      setStatus('error');
      if (onOcrResult) {
        onOcrResult({ error: true, reason: 'ocr_error' });
      }
    }
  }, [registrationImage, enteredPlate, enteredState, enteredExpiration, enteredMake, enteredModel, enteredYear, onOcrResult]);

  useEffect(() => {
    if (registrationImage && !hasRun.current) {
      runOcr();
    }
  }, [registrationImage, runOcr]);

  // Reset when registration image changes
  useEffect(() => {
    hasRun.current = false;
    setStatus('idle');
    setResults(null);
    setProgress(0);
  }, [registrationImage]);

  if (!registrationImage) return null;

  const getOverallStatus = () => {
    if (!results) return 'scanning';
    const checks = [results.plate, results.state, results.expiration];
    const hasFailure = checks.some(c => c.matched === false);
    const allPassed = checks.every(c => c.matched === true);
    if (allPassed) return 'match';
    if (hasFailure) return 'warning';
    return 'partial';
  };

  const overallStatus = status === 'done' ? getOverallStatus() : status;

  const renderCheckItem = (label, result) => {
    if (!result) return null;
    const icon = result.matched === true ? '\u2713' : result.matched === false ? '\u2717' : '\u2014';
    const cls = result.matched === true ? 'pass' : result.matched === false ? 'fail' : 'skip';
    return (
      <div className={`reg-ocr-check-item reg-ocr-check-${cls}`}>
        <span className="reg-ocr-check-icon">{icon}</span>
        <span className="reg-ocr-check-label">{label}:</span>
        <span className="reg-ocr-check-msg">{result.message}</span>
      </div>
    );
  };

  return (
    <div className={`reg-ocr-container reg-ocr-${overallStatus}`}>
      <div className="reg-ocr-header">
        <span className="reg-ocr-icon">
          {status === 'scanning' && '...'}
          {status === 'done' && overallStatus === 'match' && '\u2713'}
          {status === 'done' && overallStatus === 'warning' && '!'}
          {status === 'done' && overallStatus === 'partial' && '\u2014'}
          {status === 'error' && '!'}
          {status === 'idle' && '...'}
        </span>
        <span className="reg-ocr-title">
          {status === 'idle' && 'Ready to verify registration'}
          {status === 'scanning' && 'Scanning registration document...'}
          {status === 'done' && overallStatus === 'match' && 'Registration Verified'}
          {status === 'done' && overallStatus === 'warning' && 'Registration Mismatch Found'}
          {status === 'done' && overallStatus === 'partial' && 'Partial Verification'}
          {status === 'error' && 'Scan Issue'}
        </span>
      </div>

      {status === 'scanning' && (
        <div className="reg-ocr-progress">
          <div className="reg-ocr-progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {status === 'done' && results && (
        <div className="reg-ocr-results">
          {renderCheckItem('License Plate', results.plate)}
          {renderCheckItem('State', results.state)}
          {renderCheckItem('Expiration', results.expiration)}

          {results.vehicle && (results.vehicle.found.length > 0 || results.vehicle.notFound.length > 0) && (
            <div className="reg-ocr-vehicle-info">
              <span className="reg-ocr-vehicle-label">Vehicle Info:</span>
              {results.vehicle.found.map((item, i) => (
                <span key={i} className="reg-ocr-vehicle-tag reg-ocr-vehicle-found">{'\u2713'} {item}</span>
              ))}
              {results.vehicle.notFound.map((item, i) => (
                <span key={i} className="reg-ocr-vehicle-tag reg-ocr-vehicle-missing">{'\u2717'} {item}</span>
              ))}
            </div>
          )}

          {overallStatus === 'warning' && (
            <p className="reg-ocr-warning-msg">
              Some information doesn't match the document. Please double-check your entries or upload a clearer photo. You can still proceed.
            </p>
          )}

          {overallStatus === 'match' && (
            <p className="reg-ocr-success-msg">
              All entered information matches the registration document.
            </p>
          )}
        </div>
      )}

      {status === 'error' && (
        <div className="reg-ocr-results">
          <p className="reg-ocr-error-msg">
            Could not scan the registration document. You can still proceed with your listing.
          </p>
        </div>
      )}

      {(status === 'done' || status === 'error') && (
        <button
          type="button"
          className="reg-ocr-retry"
          onClick={() => {
            hasRun.current = false;
            setStatus('idle');
            setResults(null);
            setProgress(0);
            setTimeout(() => {
              hasRun.current = false;
              runOcr();
            }, 100);
          }}
        >
          Retry Scan
        </button>
      )}
    </div>
  );
};

export default RegistrationOCR;
