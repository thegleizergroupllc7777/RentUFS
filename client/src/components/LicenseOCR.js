import React, { useState, useEffect, useRef, useCallback } from 'react';
import Tesseract from 'tesseract.js';
import './LicenseOCR.css';

const LicenseOCR = ({ licenseImage, enteredLicenseNumber, onOcrResult }) => {
  const [status, setStatus] = useState('idle'); // idle, scanning, match, no-match, error
  const [extractedNumbers, setExtractedNumbers] = useState([]);
  const [ocrText, setOcrText] = useState('');
  const [progress, setProgress] = useState(0);
  const hasRun = useRef(false);

  // Normalize a string for comparison: uppercase, remove spaces/dashes/special chars
  const normalize = (str) => {
    if (!str) return '';
    return str.toUpperCase().replace(/[\s\-./\\]/g, '');
  };

  // Extract potential license/ID numbers from OCR text
  const extractLicenseNumbers = (text) => {
    if (!text) return [];
    // Look for alphanumeric sequences that could be license numbers (4+ chars)
    const tokens = text.match(/[A-Z0-9]{4,}/gi) || [];
    // Also look for sequences with dashes/spaces that form ID patterns
    const dashPatterns = text.match(/[A-Z0-9]+[\s\-][A-Z0-9]+[\s\-]?[A-Z0-9]*/gi) || [];
    const all = [...tokens, ...dashPatterns].map(t => normalize(t));
    // Deduplicate
    return [...new Set(all)];
  };

  const runOcr = useCallback(async () => {
    if (!licenseImage || !enteredLicenseNumber || hasRun.current) return;
    hasRun.current = true;

    setStatus('scanning');
    setProgress(0);

    try {
      const result = await Tesseract.recognize(licenseImage, 'eng', {
        logger: (m) => {
          if (m.status === 'recognizing text') {
            setProgress(Math.round(m.progress * 100));
          }
        }
      });

      const text = result.data.text;
      console.log('📄 OCR extracted text:', text);
      setOcrText(text);

      const candidates = extractLicenseNumbers(text);
      setExtractedNumbers(candidates);
      console.log('🔍 Extracted number candidates:', candidates);

      const normalizedInput = normalize(enteredLicenseNumber);
      if (!normalizedInput || normalizedInput.length < 3) {
        setStatus('error');
        onOcrResult({ matched: false, reason: 'input_too_short' });
        return;
      }

      // Check if any extracted token contains the entered number or vice versa
      const matched = candidates.some(candidate =>
        candidate.includes(normalizedInput) || normalizedInput.includes(candidate)
      );

      // Also do a direct substring search on the full normalized OCR text
      const normalizedFullText = normalize(text);
      const directMatch = normalizedFullText.includes(normalizedInput);

      // Fallback: try common OCR character substitutions (0/O, 1/I/L, 5/S, 8/B)
      let ocrFuzzyMatch = false;
      if (!matched && !directMatch) {
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
          const variant = normalizedInput.replace(pattern, replacement);
          if (normalizedFullText.includes(variant) ||
              candidates.some(c => c.includes(variant) || variant.includes(c))) {
            ocrFuzzyMatch = true;
            console.log(`🔄 OCR fuzzy match found with substitution: ${normalizedInput} → ${variant}`);
            break;
          }
        }
      }

      const isMatch = matched || directMatch || ocrFuzzyMatch;

      setStatus(isMatch ? 'match' : 'no-match');
      onOcrResult({
        matched: isMatch,
        extractedNumbers: candidates,
        ocrText: text
      });
    } catch (err) {
      console.error('❌ OCR error:', err);
      setStatus('error');
      onOcrResult({ matched: false, reason: 'ocr_error' });
    }
  }, [licenseImage, enteredLicenseNumber, onOcrResult]);

  useEffect(() => {
    if (licenseImage && enteredLicenseNumber && !hasRun.current) {
      runOcr();
    }
  }, [licenseImage, enteredLicenseNumber, runOcr]);

  // Reset when inputs change
  useEffect(() => {
    hasRun.current = false;
    setStatus('idle');
    setExtractedNumbers([]);
    setOcrText('');
    setProgress(0);
  }, [licenseImage, enteredLicenseNumber]);

  // Don't render if we don't have both inputs
  if (!licenseImage || !enteredLicenseNumber || enteredLicenseNumber.trim().length < 3) return null;

  return (
    <div className={`license-ocr-container license-ocr-${status}`}>
      <div className="license-ocr-header">
        <span className="license-ocr-icon">
          {status === 'scanning' && '...'}
          {status === 'match' && '\u2713'}
          {status === 'no-match' && '\u2717'}
          {status === 'error' && '!'}
          {status === 'idle' && '...'}
        </span>
        <span className="license-ocr-title">
          {status === 'idle' && 'Ready to verify license number'}
          {status === 'scanning' && 'Scanning license photo...'}
          {status === 'match' && 'License Number Verified'}
          {status === 'no-match' && 'License Number Mismatch'}
          {status === 'error' && 'Scan Issue'}
        </span>
      </div>

      {status === 'scanning' && (
        <div className="license-ocr-progress">
          <div className="license-ocr-progress-bar" style={{ width: `${progress}%` }}></div>
        </div>
      )}

      {status === 'match' && (
        <div className="license-ocr-detail">
          <p className="license-ocr-msg">
            The license number you entered matches the number found on your license photo.
          </p>
        </div>
      )}

      {status === 'no-match' && (
        <div className="license-ocr-detail">
          <p className="license-ocr-msg">
            The license number you entered does not appear to match your license photo.
            Please double-check the number or upload a clearer photo.
          </p>
        </div>
      )}

      {status === 'error' && (
        <div className="license-ocr-detail">
          <p className="license-ocr-msg">
            Could not scan the license photo. You can still proceed with registration.
          </p>
        </div>
      )}

      {(status === 'match' || status === 'no-match' || status === 'error') && (
        <button
          type="button"
          className="license-ocr-retry"
          onClick={() => {
            hasRun.current = false;
            setStatus('idle');
            setExtractedNumbers([]);
            setOcrText('');
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

export default LicenseOCR;
