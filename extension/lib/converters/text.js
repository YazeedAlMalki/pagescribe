import { ConversionError } from '../errors.js';

export function decodeText(buffer) {
  const bytes = new Uint8Array(buffer);
  let encoding = 'utf-8';
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = 'utf-16le';
  if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = 'utf-16be';
  try {
    return new TextDecoder(encoding, { fatal: true }).decode(bytes).replace(/^\uFEFF/, '');
  } catch {
    throw new ConversionError('INVALID_ENCODING', 'Save text as UTF-8 or BOM-marked UTF-16, then try again.');
  }
}
