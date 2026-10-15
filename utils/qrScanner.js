import sharp from 'sharp';
import jsQR from 'jsqr';

/**
 * High-performance QR Code reader for Thai Bank Slips & PromptPay
 * Uses sharp (native C-lib in memory) to extract RGBA buffer in ~15ms,
 * then jsQR to decode PromptPay/EMVCo payload in ~15-25ms.
 * 
 * @param {Buffer} buffer - Image buffer from LINE / upload
 * @returns {Promise<string|null>} Decoded QR code text payload or null
 */
export async function extractQrFromImage(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;

  try {
    const startMs = Date.now();
    const image = sharp(buffer);
    const metadata = await image.metadata();

    if (!metadata.width || !metadata.height) {
      return null;
    }

    // Step 1: Scan with optimal resolution (max 1200px)
    // Downscaling 4000px phone camera images to 1200px speeds up jsQR by 4-8x while keeping QR crisp
    let pipeline = image;
    const maxDimension = 1200;
    if (metadata.width > maxDimension || metadata.height > maxDimension) {
      pipeline = pipeline.resize({
        width: metadata.width >= metadata.height ? maxDimension : undefined,
        height: metadata.height > metadata.width ? maxDimension : undefined,
        fit: 'inside',
        withoutEnlargement: true
      });
    }

    const { data, info } = await pipeline
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const clampedArray = new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
    let code = jsQR(clampedArray, info.width, info.height, {
      inversionAttempts: 'attemptBoth'
    });

    if (code && code.data && code.data.trim().length > 0) {
      console.log(`[QR Scanner] Successfully decoded QR code in ${Date.now() - startMs}ms (Length: ${code.data.length})`);
      return code.data.trim();
    }

    // Step 2: Fallback for low-contrast or noisy images - apply slight contrast enhancement & grayscale
    if (!code && (metadata.width >= 400 || metadata.height >= 400)) {
      const enhanced = await sharp(buffer)
        .resize({ width: 1000, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .linear(1.3, -20) // boost contrast
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true });

      const enhancedClamped = new Uint8ClampedArray(enhanced.data.buffer, enhanced.data.byteOffset, enhanced.data.length);
      code = jsQR(enhancedClamped, enhanced.info.width, enhanced.info.height, {
        inversionAttempts: 'attemptBoth'
      });

      if (code && code.data && code.data.trim().length > 0) {
        console.log(`[QR Scanner] Decoded QR code after contrast enhancement in ${Date.now() - startMs}ms`);
        return code.data.trim();
      }
    }

    return null;
  } catch (err) {
    console.warn('[QR Scanner] Error extracting QR code:', err?.message || err);
    return null;
  }
}
