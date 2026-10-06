import JSZip from '../../vendor/zip.js';
import { ConversionError } from '../errors.js';
import { MiB } from '../limits.js';

export const ARCHIVE_LIMITS = Object.freeze({ entries: 2000, entryBytes: 20 * MiB, expandedBytes: 64 * MiB, ratio: 500, depth: 3 });
const fail = message => { throw new ConversionError('UNSAFE_ARCHIVE', message); };
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  return value >>> 0;
});

export function safeArchivePath(name) {
  if (!name || name.includes('\\') || /[\x00-\x1f]/.test(name) || name.startsWith('/') || /^[a-z]:/i.test(name) || name.split('/').includes('..')) {
    fail(`Archive contains an unsafe entry path: ${String(name).slice(0, 100)}`);
  }
  return name;
}

// Inspect central-directory bounds before JSZip allocates/decompresses entries.
// Reject ZIP64/multi-disk/encrypted inputs instead of claiming support for them.
export function inspectArchive(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  if (bytes.length < 22) fail('Invalid or truncated ZIP container.');
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50 && i + 22 + view.getUint16(i + 20, true) === bytes.length) { end = i; break; }
  }
  if (end < 0) fail('ZIP end record was not found.');
  const count = view.getUint16(end + 10, true), centralSize = view.getUint32(end + 12, true), start = view.getUint32(end + 16, true);
  if (view.getUint16(end + 4, true) || view.getUint16(end + 6, true) || view.getUint16(end + 8, true) !== count) fail('Multi-disk archives are unsupported.');
  if (count === 65535 || start === 0xffffffff || centralSize === 0xffffffff) fail('ZIP64 containers are unsupported.');
  if (count > ARCHIVE_LIMITS.entries || start + centralSize > end) fail('Archive directory exceeds the supported limits.');
  let cursor = start, expanded = 0;
  const names = new Set();
  for (let index = 0; index < count; index++) {
    if (cursor + 46 > start + centralSize || view.getUint32(cursor, true) !== 0x02014b50) fail('Invalid ZIP directory entry.');
    const flags = view.getUint16(cursor + 8, true), method = view.getUint16(cursor + 10, true);
    const compressed = view.getUint32(cursor + 20, true), size = view.getUint32(cursor + 24, true);
    const nameLength = view.getUint16(cursor + 28, true), extraLength = view.getUint16(cursor + 30, true), commentLength = view.getUint16(cursor + 32, true);
    const local = view.getUint32(cursor + 42, true), next = cursor + 46 + nameLength + extraLength + commentLength;
    if (flags & 1) fail('Password-protected archives are unsupported.');
    if (![0, 8].includes(method)) fail('Unsupported ZIP compression method.');
    if (next > start + centralSize || local + 30 > start || view.getUint32(local, true) !== 0x04034b50) fail('Invalid ZIP entry bounds.');
    const dataStart = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true);
    if (dataStart + compressed > start) fail('Compressed entry extends beyond the file data.');
    if (size > ARCHIVE_LIMITS.entryBytes || size > Math.max(1, compressed) * ARCHIVE_LIMITS.ratio) fail('An archive entry exceeds the expanded size or compression-ratio limit.');
    expanded += size;
    if (expanded > ARCHIVE_LIMITS.expandedBytes) fail('Archive exceeds the 64 MiB expanded-size limit.');
    const name = safeArchivePath(new TextDecoder().decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)));
    if (names.has(name)) fail('Duplicate archive entry names are unsupported.');
    names.add(name); cursor = next;
  }
  if (cursor !== start + centralSize) fail('Inconsistent ZIP directory size.');
  return { count, expanded };
}

export function archiveBudget(context = {}) {
  return context.archiveBudget || { bytes: 0, entries: 0 };
}

export async function openArchive(buffer, budget = archiveBudget()) {
  const summary = inspectArchive(buffer);
  budget.entries += summary.count;
  if (budget.entries > ARCHIVE_LIMITS.entries) fail('Nested archives exceed the shared entry limit.');
  try {
    const zip = await JSZip.loadAsync(buffer, { createFolders: false, checkCRC32: false });
    for (const entry of Object.values(zip.files)) safeArchivePath(entry.unsafeOriginalName || entry.name);
    return { zip, budget };
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('INVALID_ARCHIVE', `Cannot read ZIP container: ${error.message}`);
  }
}

export function readEntry(entry, budget) {
  if (!entry || entry.dir) return Promise.reject(new ConversionError('MISSING_ARCHIVE_ENTRY', 'A required document part is missing.'));
  // Check actual inflated bytes before chunks are joined. Header sizes alone
  // cannot protect against a deliberately false central directory.
  return new Promise((resolve, reject) => {
    const chunks = []; let length = 0, finished = false, crc = 0xffffffff;
    const stream = entry.internalStream('uint8array');
    const failRead = error => { if (!finished) { finished = true; stream.pause(); chunks.length = 0; reject(error); } };
    stream.on('data', chunk => {
      if (finished) return;
      length += chunk.byteLength; budget.bytes += chunk.byteLength;
      for (let i = 0; i < chunk.length; i++) crc = crcTable[(crc ^ chunk[i]) & 0xff] ^ (crc >>> 8);
      if (length > ARCHIVE_LIMITS.entryBytes || budget.bytes > ARCHIVE_LIMITS.expandedBytes) {
        failRead(new ConversionError('UNSAFE_ARCHIVE', 'Expanded archive data exceeds the shared memory limit.'));
      } else chunks.push(chunk);
    });
    stream.on('error', error => failRead(new ConversionError('INVALID_ARCHIVE', error.message)));
    stream.on('end', () => {
      if (finished) return;
      // JSZip 3.10.1 exposes parsed ZIP metadata on _data. Keep this pinned and
      // covered by corruption tests; checkCRC32:true would inflate unbounded.
      if (((crc ^ 0xffffffff) >>> 0) !== (entry._data.crc32 >>> 0)) {
        failRead(new ConversionError('INVALID_ARCHIVE', `CRC checksum mismatch: ${entry.name}`));
        return;
      }
      finished = true;
      const output = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.length; }
      resolve(output.buffer);
    });
    stream.resume();
  });
}
