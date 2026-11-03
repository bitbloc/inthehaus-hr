import sharp from 'sharp';
import jsQR from 'jsqr';

/**
 * Convert raw sharp buffer + info (1, 2, 3, or 4 channels) into a 4-channel RGBA Uint8ClampedArray
 * Prevents jsQR "Malformed data passed to binarizer" error when sharp outputs 1 or 2 channels after .grayscale()
 */
function toRgbaClampedArray(data, info) {
  const { width, height, channels } = info;
  const pixelCount = width * height;

  if (channels === 4 && data.length === pixelCount * 4) {
    return new Uint8ClampedArray(data.buffer, data.byteOffset, data.length);
  }

  const rgba = new Uint8ClampedArray(pixelCount * 4);
  if (channels === 1) {
    for (let i = 0, j = 0; i < pixelCount; i++, j += 4) {
      const v = data[i];
      rgba[j] = v;
      rgba[j + 1] = v;
      rgba[j + 2] = v;
      rgba[j + 3] = 255;
    }
  } else if (channels === 2) {
    for (let i = 0, j = 0; i < pixelCount * 2; i += 2, j += 4) {
      const v = data[i];
      rgba[j] = v;
      rgba[j + 1] = v;
      rgba[j + 2] = v;
      rgba[j + 3] = data[i + 1];
    }
  } else if (channels === 3) {
    for (let i = 0, j = 0; i < pixelCount * 3; i += 3, j += 4) {
      rgba[j] = data[i];
      rgba[j + 1] = data[i + 1];
      rgba[j + 2] = data[i + 2];
      rgba[j + 3] = 255;
    }
  }
  return rgba;
}

async function tryDecodePipeline(pipeline) {
  try {
    const { data, info } = await pipeline.raw().toBuffer({ resolveWithObject: true });
    if (!info.width || !info.height) return null;
    const clamped = toRgbaClampedArray(data, info);
    const code = jsQR(clamped, info.width, info.height, {
      inversionAttempts: 'attemptBoth'
    });
    if (code && code.data && code.data.trim().length > 0) {
      return code.data.trim();
    }
  } catch {
    // Ignore individual pass errors and continue to next pass
  }
  return null;
}

/**
 * High-performance Multi-Pass QR Code reader for Thai Bank Slips & PromptPay
 * Handles both clean digital e-Slips and real-world camera photos of customer phone screens
 * (with screen glare, Moiré pattern, small QR in upper-right corner, or low contrast).
 *
 * @param {Buffer} buffer - Image buffer from LINE / upload
 * @returns {Promise<string|null>} Decoded QR code text payload or null
 */
export async function extractQrFromImage(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return null;

  try {
    const startMs = Date.now();
    const metadata = await sharp(buffer).metadata();
    const W = metadata.width || 0;
    const H = metadata.height || 0;

    if (!W || !H) return null;

    // Pass 1: Standard full-image scan (max 1400px)
    const maxDim = 1400;
    let pass1 = sharp(buffer).ensureAlpha();
    if (W > maxDim || H > maxDim) {
      pass1 = pass1.resize({
        width: W >= H ? maxDim : undefined,
        height: H > W ? maxDim : undefined,
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    let decoded = await tryDecodePipeline(pass1);
    if (decoded) {
      console.log(`[QR Scanner] Pass 1 (Full) decoded QR in ${Date.now() - startMs}ms (Length: ${decoded.length})`);
      return decoded;
    }

    // Pass 2: Focused native-resolution crop on upper-right & middle-right (where Thai bank slip QR codes sit on phone screens)
    if (W >= 500 && H >= 500) {
      const cropRegions = [
        // Upper-right quadrant (Krungthai, KBank, SCB, BBL on phone screen photos)
        {
          left: Math.floor(W * 0.35),
          top: Math.floor(H * 0.10),
          width: Math.floor(W * 0.60),
          height: Math.floor(H * 0.48)
        },
        // Lower-right / middle-bottom quadrant (some e-Slips put QR at bottom-right)
        {
          left: Math.floor(W * 0.30),
          top: Math.floor(H * 0.40),
          width: Math.floor(W * 0.65),
          height: Math.floor(H * 0.52)
        }
      ];

      for (const region of cropRegions) {
        if (region.width > 100 && region.height > 100 && region.left + region.width <= W && region.top + region.height <= H) {
          // Try normal crop + sharpened high-contrast crop
          decoded = await tryDecodePipeline(
            sharp(buffer)
              .extract(region)
              .grayscale()
              .normalise()
              .sharpen()
          );
          if (decoded) {
            console.log(`[QR Scanner] Pass 2 (Region Crop + Sharpen) decoded QR in ${Date.now() - startMs}ms`);
            return decoded;
          }

          decoded = await tryDecodePipeline(
            sharp(buffer)
              .extract(region)
              .grayscale()
              .linear(1.5, -35)
              .sharpen()
          );
          if (decoded) {
            console.log(`[QR Scanner] Pass 2b (Region High-Contrast) decoded QR in ${Date.now() - startMs}ms`);
            return decoded;
          }
        }
      }
    }

    // Pass 3: Full-image grayscale + contrast boost + sharpen (properly converted to 4-channel RGBA)
    decoded = await tryDecodePipeline(
      sharp(buffer)
        .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
        .grayscale()
        .normalise()
        .linear(1.4, -25)
        .sharpen()
    );
    if (decoded) {
      console.log(`[QR Scanner] Pass 3 (Enhanced Full) decoded QR in ${Date.now() - startMs}ms`);
      return decoded;
    }

    // Pass 4: Binarized threshold scan for washed-out / glare screens
    for (const thresh of [140, 115, 165]) {
      decoded = await tryDecodePipeline(
        sharp(buffer)
          .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
          .grayscale()
          .normalise()
          .threshold(thresh)
      );
      if (decoded) {
        console.log(`[QR Scanner] Pass 4 (Threshold ${thresh}) decoded QR in ${Date.now() - startMs}ms`);
        return decoded;
      }
    }

    return null;
  } catch (err) {
    console.warn('[QR Scanner] Error extracting QR code:', err?.message || err);
    return null;
  }
}
