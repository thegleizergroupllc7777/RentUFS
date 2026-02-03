const express = require('express');
const multer = require('multer');
const path = require('path');
const auth = require('../middleware/auth');
const cloudinary = require('cloudinary').v2;

const router = express.Router();

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Configure multer for memory storage (no disk writes)
const memoryStorage = multer.memoryStorage();

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed!'));
  }
};

const upload = multer({
  storage: memoryStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: fileFilter
});

// Helper: upload a buffer to Cloudinary
const uploadToCloudinary = (fileBuffer, folder = 'rentufs') => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'image',
        transformation: [
          { width: 1200, height: 900, crop: 'limit' },
          { quality: 'auto', fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    );
    stream.end(fileBuffer);
  });
};

// Public upload endpoint (no auth required) - TEMPORARY for development
router.post('/image-public', (req, res) => {
  console.log('📸 Public upload request received');

  upload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      console.error('Upload error (not multer):', err);
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      if (!req.file) {
        console.error('No file in request');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const result = await uploadToCloudinary(req.file.buffer);
      const imageUrl = result.secure_url;

      console.log(`✅ Image uploaded to Cloudinary: ${imageUrl}`);

      return res.status(200).json({
        success: true,
        imageUrl: imageUrl,
        filename: result.public_id
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      return res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
    }
  });
});

// Upload single image (with auth)
router.post('/image', auth, (req, res) => {
  console.log('Upload request received from user:', req.user?._id);

  upload.single('image')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      console.error('Upload error (not multer):', err);
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      if (!req.file) {
        console.error('No file in request');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      const result = await uploadToCloudinary(req.file.buffer);
      const imageUrl = result.secure_url;

      console.log(`✅ Image uploaded to Cloudinary: ${imageUrl}`);

      return res.status(200).json({
        success: true,
        imageUrl: imageUrl,
        filename: result.public_id
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      return res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
    }
  });
});

// Upload multiple images (up to 4)
router.post('/images', auth, (req, res) => {
  upload.array('images', 4)(req, res, async (err) => {
    if (err) {
      console.error('Multi-upload error:', err);
      return res.status(400).json({ message: err.message });
    }

    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ message: 'No files uploaded' });
      }

      const uploadPromises = req.files.map(file => uploadToCloudinary(file.buffer));
      const results = await Promise.all(uploadPromises);
      const imageUrls = results.map(r => r.secure_url);

      res.json({
        success: true,
        imageUrls: imageUrls,
        count: req.files.length
      });
    } catch (error) {
      console.error('Multi-upload processing error:', error);
      res.status(500).json({ message: 'Upload failed', error: error.message });
    }
  });
});

// Delete image (cleanup) - now deletes from Cloudinary
router.delete('/image/:filename', auth, async (req, res) => {
  try {
    const filename = req.params.filename;

    // If it looks like a Cloudinary public_id (contains /), delete from Cloudinary
    if (filename.includes('/') || filename.startsWith('rentufs')) {
      await cloudinary.uploader.destroy(filename);
      return res.json({ success: true, message: 'Image deleted from Cloudinary' });
    }

    // Legacy: try to extract public_id from a full URL
    // For old /uploads/ paths, just acknowledge (file is already gone from ephemeral disk)
    res.json({ success: true, message: 'Image reference removed' });
  } catch (error) {
    res.status(500).json({ message: 'Delete failed', error: error.message });
  }
});

// ============================================
// Phone Upload Sessions (QR code flow)
// ============================================
const crypto = require('crypto');

// In-memory session store: { sessionId: { images: [cloudinaryUrl...], createdAt, photoSlot } }
const uploadSessions = new Map();

// Clean up expired sessions every 5 minutes (sessions expire after 15 min)
setInterval(() => {
  const now = Date.now();
  for (const [id, session] of uploadSessions) {
    if (now - session.createdAt > 15 * 60 * 1000) {
      uploadSessions.delete(id);
    }
  }
}, 5 * 60 * 1000);

// Create a new upload session
router.post('/create-session', (req, res) => {
  const sessionId = crypto.randomBytes(16).toString('hex');
  const { photoSlot } = req.body;
  uploadSessions.set(sessionId, {
    images: [],
    createdAt: Date.now(),
    photoSlot: photoSlot || null
  });
  // Use CLIENT_URL env var, or derive from the request Origin/Referer header
  const clientUrl = process.env.CLIENT_URL ||
    req.headers.origin ||
    (req.headers.referer ? new URL(req.headers.referer).origin : null) ||
    'http://localhost:3000';
  // Build API URL using forwarded headers (works behind reverse proxies like Render)
  const proto = req.headers['x-forwarded-proto'] || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const apiUrl = `${proto}://${host}`;
  const qrUrl = `${clientUrl}/mobile-upload/${sessionId}?api=${encodeURIComponent(apiUrl)}`;
  console.log(`📱 Upload session created: ${sessionId}`);
  console.log(`📱 QR URL: ${qrUrl}`);
  res.json({ sessionId, qrUrl });
});

// Phone uploads an image to a session - now uploads to Cloudinary
router.post('/mobile/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = uploadSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ message: 'Session expired or not found' });
  }

  upload.single('image')(req, res, async (err) => {
    if (err) {
      console.error('📱 Mobile upload error:', err);
      return res.status(400).json({ message: err.message });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }

    try {
      // Upload to Cloudinary instead of storing base64
      const result = await uploadToCloudinary(req.file.buffer, 'rentufs/mobile');
      const imageUrl = result.secure_url;

      session.images.push(imageUrl);
      console.log(`📱 Image uploaded to Cloudinary for session ${sessionId}: ${imageUrl} (${session.images.length} total)`);

      res.json({ success: true, count: session.images.length });
    } catch (uploadErr) {
      console.error('📱 Failed to upload to Cloudinary:', uploadErr);
      res.status(500).json({ message: 'Failed to process uploaded image' });
    }
  });
});

// Desktop polls for uploaded images
router.get('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  const session = uploadSessions.get(sessionId);

  if (!session) {
    return res.status(404).json({ message: 'Session expired or not found' });
  }

  res.json({
    images: session.images,
    photoSlot: session.photoSlot,
    count: session.images.length
  });
});

// Delete a session
router.delete('/session/:sessionId', (req, res) => {
  const { sessionId } = req.params;
  uploadSessions.delete(sessionId);
  res.json({ success: true });
});

module.exports = router;
