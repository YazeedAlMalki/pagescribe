import { ConversionError } from './errors.js';

export const MiB = 1024 * 1024;
export const LIMITS = Object.freeze({
  maxFiles: 25,
  maxFileBytes: 20 * MiB,
  maxBatchBytes: 100 * MiB,
  maxOutputBytes: 10 * MiB,
  workers: 8,
  timeoutMs: 120_000,
  cacheBytes: 100 * MiB
});

export function validateFiles(files) {
  if (!Array.isArray(files) || !files.length) throw new ConversionError('EMPTY_BATCH', 'Select at least one file.');
  if (files.length > LIMITS.maxFiles) throw new ConversionError('TOO_MANY_FILES', `Select up to ${LIMITS.maxFiles} files per batch.`);
  let total = 0;
  for (const file of files) {
    if (!Number.isSafeInteger(file.size) || file.size < 0 || typeof file.name !== 'string' || !file.name) {
      throw new ConversionError('INVALID_FILE', 'The file selection is invalid.');
    }
    if (file.size > LIMITS.maxFileBytes) throw new ConversionError('FILE_TOO_LARGE', `${file.name} exceeds the 20 MB file limit.`);
    total += file.size;
  }
  if (total > LIMITS.maxBatchBytes) throw new ConversionError('BATCH_TOO_LARGE', 'Select at most 100 MB per batch.');
}
