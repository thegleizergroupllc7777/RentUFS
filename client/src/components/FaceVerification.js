import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as faceapi from 'face-api.js';
import './FaceVerification.css';

const FaceVerification = ({ licenseImage, selfieImage, onVerificationResult }) => {
  const [status, setStatus] = useState('idle'); // idle, loading-models, comparing, match, no-match, error
  const [matchScore, setMatchScore] = useState(null);
  const [errorMessage, setErrorMessage] = useState('');
  const [modelsLoaded, setModelsLoaded] = useState(false);
  const hasRun = useRef(false);

  // Load face-api models once
  useEffect(() => {
    const loadModels = async () => {
      try {
        setStatus('loading-models');
        const MODEL_URL = process.env.PUBLIC_URL + '/models';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setModelsLoaded(true);
        console.log('✅ Face verification models loaded');
      } catch (err) {
        console.error('❌ Failed to load face models:', err);
        setStatus('error');
        setErrorMessage('Failed to load face verification models. Please try again.');
      }
    };

    if (!faceapi.nets.ssdMobilenetv1.isLoaded) {
      loadModels();
    } else {
      setModelsLoaded(true);
    }
  }, []);

  // Compare faces when both images and models are ready
  const compareFaces = useCallback(async () => {
    if (!licenseImage || !selfieImage || !modelsLoaded || hasRun.current) return;
    hasRun.current = true;

    setStatus('comparing');
    setErrorMessage('');

    try {
      // Create image elements from base64/URLs
      const [licenseImg, selfieImg] = await Promise.all([
        loadImage(licenseImage),
        loadImage(selfieImage)
      ]);

      // Detect face on the license photo
      const licenseDetection = await faceapi
        .detectSingleFace(licenseImg)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!licenseDetection) {
        setStatus('error');
        setErrorMessage('Could not detect a face on the driver\'s license. Please upload a clearer photo.');
        onVerificationResult({ verified: false, score: 0, reason: 'no_face_license' });
        return;
      }

      // Detect ALL faces in the selfie — the user is holding their license,
      // so there may be two faces: the person's real face and the small license photo.
      // We pick the largest face (by bounding box area) which is the actual person.
      const selfieDetections = await faceapi
        .detectAllFaces(selfieImg)
        .withFaceLandmarks()
        .withFaceDescriptors();

      if (!selfieDetections || selfieDetections.length === 0) {
        setStatus('error');
        setErrorMessage('Could not detect a face in the selfie. Please take a clearer photo with your face visible.');
        onVerificationResult({ verified: false, score: 0, reason: 'no_face_selfie' });
        return;
      }

      // Pick the largest detected face (by bounding box area) — this is the real person, not the license photo
      const selfieDetection = selfieDetections.reduce((largest, current) => {
        const largestArea = largest.detection.box.width * largest.detection.box.height;
        const currentArea = current.detection.box.width * current.detection.box.height;
        return currentArea > largestArea ? current : largest;
      });

      // Calculate Euclidean distance between face descriptors
      const distance = faceapi.euclideanDistance(
        licenseDetection.descriptor,
        selfieDetection.descriptor
      );

      // Use 0.75 threshold — more forgiving for ID photo vs live selfie
      // (different lighting, angle, photo quality, age differences on ID)
      // Convert to a percentage score (0-100)
      const score = Math.round(Math.max(0, (1 - distance)) * 100);
      const isMatch = distance < 0.75;

      setMatchScore(score);
      setStatus(isMatch ? 'match' : 'no-match');

      onVerificationResult({
        verified: isMatch,
        score,
        distance: Math.round(distance * 1000) / 1000
      });
    } catch (err) {
      console.error('❌ Face comparison error:', err);
      setStatus('error');
      setErrorMessage('Face verification encountered an error. You can still proceed with registration.');
      onVerificationResult({ verified: false, score: 0, reason: 'error' });
    }
  }, [licenseImage, selfieImage, modelsLoaded, onVerificationResult]);

  useEffect(() => {
    if (licenseImage && selfieImage && modelsLoaded && !hasRun.current) {
      compareFaces();
    }
  }, [licenseImage, selfieImage, modelsLoaded, compareFaces]);

  // Reset when images change
  useEffect(() => {
    hasRun.current = false;
    setStatus('idle');
    setMatchScore(null);
    setErrorMessage('');
  }, [licenseImage, selfieImage]);

  // Helper to load an image from base64 or URL
  const loadImage = (src) => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = (err) => reject(new Error('Failed to load image'));
      img.src = src;
    });
  };

  // Don't render anything if we don't have both images
  if (!licenseImage || !selfieImage) return null;

  return (
    <div className={`face-verify-container face-verify-${status}`}>
      <div className="face-verify-header">
        <span className="face-verify-icon">
          {status === 'loading-models' && '...'}
          {status === 'comparing' && '...'}
          {status === 'match' && '\u2713'}
          {status === 'no-match' && '\u2717'}
          {status === 'error' && '!'}
        </span>
        <span className="face-verify-title">
          {status === 'loading-models' && 'Loading face verification...'}
          {status === 'comparing' && 'Comparing faces...'}
          {status === 'match' && 'Identity Verified'}
          {status === 'no-match' && 'Face Mismatch Detected'}
          {status === 'error' && 'Verification Issue'}
          {status === 'idle' && 'Ready to verify'}
        </span>
      </div>

      {status === 'comparing' && (
        <div className="face-verify-progress">
          <div className="face-verify-progress-bar"></div>
        </div>
      )}

      {status === 'match' && matchScore !== null && (
        <div className="face-verify-detail">
          <div className="face-verify-score-row">
            <span>Match confidence:</span>
            <span className="face-verify-score face-verify-score-good">{matchScore}%</span>
          </div>
          <p className="face-verify-msg">The face on your license matches your selfie.</p>
        </div>
      )}

      {status === 'no-match' && matchScore !== null && (
        <div className="face-verify-detail">
          <div className="face-verify-score-row">
            <span>Match confidence:</span>
            <span className="face-verify-score face-verify-score-bad">{matchScore}%</span>
          </div>
          <p className="face-verify-msg">
            The faces don't appear to match. Please make sure you uploaded the correct license and a clear, well-lit selfie of your face.
          </p>
        </div>
      )}

      {status === 'error' && errorMessage && (
        <div className="face-verify-detail">
          <p className="face-verify-msg">{errorMessage}</p>
        </div>
      )}

      {(status === 'match' || status === 'no-match' || status === 'error') && (
        <button
          type="button"
          className="face-verify-retry"
          onClick={() => {
            hasRun.current = false;
            setStatus('idle');
            setMatchScore(null);
            setErrorMessage('');
            // Trigger re-run
            setTimeout(() => {
              hasRun.current = false;
              compareFaces();
            }, 100);
          }}
        >
          Retry Verification
        </button>
      )}
    </div>
  );
};

export default FaceVerification;
