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

// Use memory storage so files are buffered in memory for Cloudinary upload
const storage = multer.memoryStorage();

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
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max file size
  },
  fileFilter: fileFilter
});

// Helper: upload a buffer to Cloudinary and return the secure URL
function uploadToCloudinary(fileBuffer, folder = 'rentufs') {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: 'image' },
      (error, result) => {
        if (error) return reject(error);
        resolve(result.secure_url);
      }
    );
    stream.end(fileBuffer);
  });
}

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

      const imageUrl = await uploadToCloudinary(req.file.buffer, 'rentufs/public');
      console.log(`✅ Image uploaded to Cloudinary: ${imageUrl}`);

      return res.status(200).json({
        success: true,
        imageUrl: imageUrl,
        filename: req.file.originalname
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

      const imageUrl = await uploadToCloudinary(req.file.buffer, 'rentufs/vehicles');
      console.log(`✅ Image uploaded to Cloudinary: ${imageUrl}`);

      return res.status(200).json({
        success: true,
        imageUrl: imageUrl,
        filename: req.file.originalname
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      return res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
    }
  });
});

// Upload multiple images (up to 4)
router.post('/images', auth, upload.array('images', 4), async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const uploadPromises = req.files.map(file =>
      uploadToCloudinary(file.buffer, 'rentufs/vehicles')
    );
    const imageUrls = await Promise.all(uploadPromises);

    console.log(`✅ ${imageUrls.length} images uploaded to Cloudinary`);

    res.json({
      success: true,
      imageUrls: imageUrls,
      count: imageUrls.length
    });
  } catch (error) {
    console.error('Upload processing error:', error);
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// Delete image (cleanup) - works with Cloudinary public_id
router.delete('/image/:filename', auth, (req, res) => {
  try {
    const filename = req.params.filename;
    // Extract public_id from Cloudinary URL or use filename directly
    // Cloudinary URLs look like: https://res.cloudinary.com/xxx/image/upload/v123/rentufs/vehicles/abc.jpg
    // The public_id would be: rentufs/vehicles/abc
    let publicId = filename;
    if (filename.includes('cloudinary.com')) {
      const parts = filename.split('/upload/');
      if (parts[1]) {
        // Remove version prefix (v123/) and file extension
        publicId = parts[1].replace(/^v\d+\//, '').replace(/\.[^.]+$/, '');
      }
    }

    cloudinary.uploader.destroy(publicId, (error, result) => {
      if (error) {
        console.error('Cloudinary delete error:', error);
        return res.status(500).json({ message: 'Delete failed', error: error.message });
      }
      res.json({ success: true, message: 'Image deleted successfully', result });
    });
  } catch (error) {
    res.status(500).json({ message: 'Delete failed', error: error.message });
  }
});

// ============================================
// Phone Upload Sessions (QR code flow)
// ============================================
const crypto = require('crypto');

// In-memory session store: { sessionId: { images: [url...], createdAt, photoSlot } }
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

// Phone uploads an image to a session
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
      // Upload to Cloudinary instead of storing as base64
      const imageUrl = await uploadToCloudinary(req.file.buffer, 'rentufs/mobile');
      session.images.push(imageUrl);
      console.log(`📱 Image uploaded to Cloudinary for session ${sessionId} (${session.images.length} total)`);

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
