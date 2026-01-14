const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const auth = require('../middleware/auth');

const router = express.Router();

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    // Create unique filename: timestamp-random-originalname
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    const name = path.basename(file.originalname, ext);
    cb(null, `${name}-${uniqueSuffix}${ext}`);
  }
});

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

// Upload single image
router.post('/image', auth, (req, res) => {
  console.log('Upload request received from user:', req.user?._id);

  upload.single('image')(req, res, (err) => {
    if (err instanceof multer.MulterError) {
      // Multer error
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ success: false, message: 'File size too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ success: false, message: err.message });
    } else if (err) {
      // Other error
      console.error('Upload error (not multer):', err);
      return res.status(400).json({ success: false, message: err.message });
    }

    try {
      if (!req.file) {
        console.error('No file in request');
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Return the URL path to access the uploaded image
      const imageUrl = `/uploads/${req.file.filename}`;

      console.log(`✅ Image uploaded successfully: ${req.file.filename}`);
      console.log(`Returning response: { success: true, imageUrl: ${imageUrl} }`);

      return res.status(200).json({
        success: true,
        imageUrl: imageUrl,
        filename: req.file.filename
      });
    } catch (error) {
      console.error('Upload processing error:', error);
      return res.status(500).json({ success: false, message: 'Upload failed', error: error.message });
    }
  });
});

// Upload multiple images (up to 4)
router.post('/images', auth, upload.array('images', 4), (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No files uploaded' });
    }

    const imageUrls = req.files.map(file => `/uploads/${file.filename}`);

    res.json({
      success: true,
      imageUrls: imageUrls,
      count: req.files.length
    });
  } catch (error) {
    res.status(500).json({ message: 'Upload failed', error: error.message });
  }
});

// Delete image (cleanup)
router.delete('/image/:filename', auth, (req, res) => {
  try {
    const filename = req.params.filename;
    const filePath = path.join(uploadsDir, filename);

    // Security check: ensure the file is in the uploads directory
    if (!filePath.startsWith(uploadsDir)) {
      return res.status(400).json({ message: 'Invalid file path' });
    }

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ message: 'File not found' });
    }

    // Delete the file
    fs.unlinkSync(filePath);

    res.json({ success: true, message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Delete failed', error: error.message });
  }
});

module.exports = router;
