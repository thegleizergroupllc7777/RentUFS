const fs = require('fs');
const path = require('path');
const Vehicle = require('../models/Vehicle');

const uploadsDir = path.join(__dirname, '../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Convert a base64 data URL to a file on disk, return the relative path
function saveBase64ToFile(base64DataUrl) {
  try {
    if (!base64DataUrl || typeof base64DataUrl !== 'string') return null;
    if (!base64DataUrl.startsWith('data:image/')) return null;

    const commaIndex = base64DataUrl.indexOf(',');
    if (commaIndex === -1) return null;

    const header = base64DataUrl.substring(0, commaIndex);
    const data = base64DataUrl.substring(commaIndex + 1);

    if (!data || data.length < 100) return null; // too small to be a real image

    const typeMatch = header.match(/data:image\/([\w+]+)/);
    if (!typeMatch) return null;
    const ext = typeMatch[1] === 'jpeg' ? 'jpg' : typeMatch[1].replace('+xml', '');

    const filename = `migrated-${Date.now()}-${Math.round(Math.random() * 1E9)}.${ext}`;
    const filePath = path.join(uploadsDir, filename);

    fs.writeFileSync(filePath, Buffer.from(data, 'base64'));
    const sizeKB = Math.round(fs.statSync(filePath).size / 1024);
    console.log(`📁 Saved migrated image: ${filename} (${sizeKB}KB)`);
    return `/uploads/${filename}`;
  } catch (err) {
    console.error('❌ Failed to save base64 image:', err.message);
    return null;
  }
}

// Check if an image URL points to a local file that exists
function localFileExists(imageUrl) {
  if (!imageUrl || typeof imageUrl !== 'string') return false;
  // Extract the /uploads/filename part from full URLs or relative paths
  let relPath = null;
  if (imageUrl.includes('/uploads/')) {
    relPath = '/uploads/' + imageUrl.split('/uploads/').pop();
  }
  if (!relPath) return false;
  const filePath = path.join(__dirname, '..', relPath);
  return fs.existsSync(filePath);
}

// Run on startup: find and migrate all base64 images in vehicle documents
async function migrateBase64Images() {
  try {
    console.log('🔄 Checking for base64 images that need migration...');

    // Find all vehicles - use lean() for faster read, but we need to save later
    const vehicles = await Vehicle.find({}).select('images registrationImage year make model');
    let migrated = 0;
    let alreadyOk = 0;
    let brokenFixed = 0;

    for (const vehicle of vehicles) {
      let changed = false;

      // Check images array
      if (vehicle.images && vehicle.images.length > 0) {
        const newImages = [];
        for (const img of vehicle.images) {
          if (typeof img === 'string' && img.startsWith('data:image/')) {
            // Still base64 - needs migration
            const relPath = saveBase64ToFile(img);
            if (relPath) {
              newImages.push(relPath);
              changed = true;
            } else {
              // Keep original if conversion fails
              newImages.push(img);
            }
          } else if (typeof img === 'string' && img.includes('/uploads/migrated-') && !localFileExists(img)) {
            // Previously migrated but file is missing - image data is lost
            // Remove the broken URL rather than keeping it
            console.log(`⚠️ Broken migrated image for ${vehicle.year} ${vehicle.make} ${vehicle.model}: file missing`);
            // Don't add to newImages - this image is lost
            changed = true;
          } else {
            newImages.push(img);
          }
        }
        if (changed) {
          vehicle.images = newImages;
        }
      }

      // Check registrationImage
      if (vehicle.registrationImage && typeof vehicle.registrationImage === 'string' && vehicle.registrationImage.startsWith('data:image/')) {
        const relPath = saveBase64ToFile(vehicle.registrationImage);
        if (relPath) {
          vehicle.registrationImage = relPath;
          changed = true;
        }
      }

      if (changed) {
        try {
          await vehicle.save();
          migrated++;
          console.log(`✅ Migrated images for: ${vehicle.year} ${vehicle.make} ${vehicle.model}`);
        } catch (saveErr) {
          console.error(`❌ Failed to save vehicle ${vehicle._id}:`, saveErr.message);
        }
      } else {
        alreadyOk++;
      }
    }

    if (migrated > 0) {
      console.log(`📸 Image migration complete: ${migrated} vehicles migrated, ${alreadyOk} already OK`);
    } else {
      console.log(`📸 No base64 images to migrate (${alreadyOk} vehicles OK)`);
    }

    return { migrated, alreadyOk };
  } catch (error) {
    console.error('❌ Image migration error:', error);
    return { migrated: 0, error: error.message };
  }
}

module.exports = { migrateBase64Images, saveBase64ToFile, localFileExists };
