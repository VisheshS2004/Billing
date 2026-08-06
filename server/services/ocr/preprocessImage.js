/**
 * Image Preprocessing — Step 1
 *
 * Converts raw phone photo to a clean, high-contrast grayscale image
 * that handwriting recognition models read more accurately.
 *
 * Operations (in order):
 *   1. Resize to max 1600px (reduces file size without losing detail)
 *   2. Grayscale (removes colour noise, ink reads as pure black)
 *   3. Normalize (auto-levels: expands the contrast range to 0–255)
 *   4. Sharpen (makes ink strokes crisper)
 *   5. JPEG at 90% quality → base64 for API upload
 *
 * Falls back to the original image on any error.
 */
const sharp = require('sharp');

async function preprocessImage(base64) {
  try {
    const inputBuffer = Buffer.from(base64, 'base64');

    const processedBuffer = await sharp(inputBuffer)
      .resize({ width: 1600, height: 2200, fit: 'inside', withoutEnlargement: true })
      .grayscale()
      .normalize()                         // auto-levels contrast
      .sharpen({ sigma: 1.2, m1: 1.5 })   // sharpen ink edges
      .jpeg({ quality: 90 })
      .toBuffer();

    console.log(`Preprocessed: ${Math.round(inputBuffer.length / 1024)}KB → ${Math.round(processedBuffer.length / 1024)}KB`);
    return processedBuffer.toString('base64');

  } catch (err) {
    console.warn('Image preprocessing failed, using original:', err.message);
    return base64; // fallback — pipeline continues with original image
  }
}

module.exports = { preprocessImage };
