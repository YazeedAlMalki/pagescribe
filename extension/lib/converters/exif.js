import piexif from '../../vendor/exif.js';
import { markdownTable } from '../markdown.js';
import { ConversionError } from '../errors.js';

function displayValue(value) {
  if (typeof value === 'string') return value.replace(/\0+$/, '').slice(0, 2000);
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const list = Array.from(value);
    return JSON.stringify(list.slice(0, 64)) + (list.length > 64 ? '…' : '');
  }
  return String(value);
}

export async function convert({ buffer }, context = {}) {
  context.report?.('Reading JPEG metadata');
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes.length < 4) throw new ConversionError('INVALID_JPEG', 'Expected a JPEG image.');
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
  try {
    const metadata = piexif.load(binary), rows = [['Group', 'Tag', 'Value']];
    for (const group of ['0th', 'Exif', 'GPS', 'Interop', '1st']) {
      for (const [tag, value] of Object.entries(metadata[group] || {})) {
        if (rows.length > 1000) throw new ConversionError('EXIF_LIMIT', 'JPEG contains too many metadata tags.');
        const table = piexif.TAGS[group === '0th' || group === '1st' ? 'Image' : group];
        rows.push([group, table?.[tag]?.name || `Tag ${tag}`, displayValue(value)]);
      }
    }
    return { markdown: rows.length > 1 ? `# Image metadata\n\n${markdownTable(rows)}` : '_No EXIF metadata found._\n', warnings: [] };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('INVALID_JPEG', `Cannot read JPEG metadata: ${error.message}`);
  }
}
