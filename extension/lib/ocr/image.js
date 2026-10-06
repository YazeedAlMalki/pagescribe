import { ConversionError } from '../errors.js';

export const IMAGE_LIMITS = Object.freeze({ pixels: 16_000_000, dimension: 8192, renderPixels: 4_000_000, renderDimension: 2400 });
export function checkDimensions(width, height) {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) throw new ConversionError('INVALID_IMAGE', 'Invalid image dimensions.');
  if (width > IMAGE_LIMITS.dimension || height > IMAGE_LIMITS.dimension || width * height > IMAGE_LIMITS.pixels) throw new ConversionError('IMAGE_LIMIT', 'Image exceeds 8,192 pixels per side or 16 million decoded pixels. Resize it and retry.');
  return { width, height };
}

// Read declared dimensions BEFORE handing compressed data to a decoder.
export function imageDimensions(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length >= 24 && bytes.slice(0, 8).join(',') === '137,80,78,71,13,10,26,10' && view.getUint32(12) === 0x49484452) return checkDimensions(view.getUint32(16), view.getUint32(20));
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 4 <= bytes.length) {
      if (bytes[offset++] !== 0xff) break;
      while (bytes[offset] === 0xff) offset++;
      const marker = bytes[offset++];
      if ([0xd9, 0xda].includes(marker)) break;
      if (marker === 1 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > bytes.length) break;
      const length = view.getUint16(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if ([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker) && length >= 8) return checkDimensions(view.getUint16(offset + 5), view.getUint16(offset + 3));
      offset += length;
    }
  }
  throw new ConversionError('INVALID_IMAGE', 'Cannot read this JPG or PNG image. It may be corrupt or use an unsupported format.');
}

export function boundedSize(width, height) {
  const scale = Math.min(1, IMAGE_LIMITS.renderDimension / Math.max(width, height), Math.sqrt(IMAGE_LIMITS.renderPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)), scale };
}

export async function decodeImage(buffer, rotation = 0) {
  imageDimensions(buffer);
  let bitmap;
  try {
    bitmap = await createImageBitmap(new Blob([buffer]), { imageOrientation: 'from-image' });
    checkDimensions(bitmap.width, bitmap.height);
    const size = boundedSize(bitmap.width, bitmap.height), quarter = rotation === 90 || rotation === 270;
    const canvas = new OffscreenCanvas(quarter ? size.height : size.width, quarter ? size.width : size.height);
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.translate(canvas.width / 2, canvas.height / 2); ctx.rotate(rotation * Math.PI / 180);
    ctx.drawImage(bitmap, -size.width / 2, -size.height / 2, size.width, size.height);
    return { canvas, warnings: size.scale < 1 ? ['Image was downscaled to the OCR pixel limit; small text may be missed.'] : [] };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('INVALID_IMAGE', `Cannot decode image: ${error.message}`);
  } finally { bitmap?.close(); }
}

export function isBlank(canvas) {
  const probe = new OffscreenCanvas(128, 128), ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(canvas, 0, 0, 128, 128);
  const pixels = ctx.getImageData(0, 0, 128, 128).data;
  let low = 255, high = 0;
  for (let i = 0; i < pixels.length; i += 4) { const value = (pixels[i] + pixels[i + 1] + pixels[i + 2]) / 3; low = Math.min(low, value); high = Math.max(high, value); }
  probe.width = probe.height = 1;
  return high - low < 4;
}
