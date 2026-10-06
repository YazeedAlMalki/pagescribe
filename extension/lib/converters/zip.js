import { openArchive, readEntry, archiveBudget, ARCHIVE_LIMITS } from './archive.js';
import { detectFormat } from '../formats.js';
import { convertFile } from '../router.js';
import { cell } from '../markdown.js';
import { LIMITS } from '../limits.js';
import { ConversionError } from '../errors.js';

export async function convert({ buffer }, context = {}) {
  const depth = context.archiveDepth || 0;
  if (depth >= ARCHIVE_LIMITS.depth) throw new ConversionError('ARCHIVE_DEPTH', 'ZIP nesting exceeds three levels.');
  const { zip, budget } = await openArchive(buffer, archiveBudget(context));
  const sections = [], warnings = [];
  let outputBytes = 0;
  for (const entry of Object.values(zip.files).filter(entry => !entry.dir)) {
    let format;
    try { format = detectFormat({ name: entry.name }); }
    catch { warnings.push(`Skipped unsupported file: ${entry.name}`); continue; }
    context.report?.(`Converting archive entry: ${entry.name}`);
    try {
      const data = await readEntry(entry, budget);
      // Reuse this worker and shared archive budget. No nested worker pools.
      const result = await convertFile({ name: entry.name, buffer: data, size: data.byteLength, format: format.id },
        { ...context, archiveBudget: budget, archiveDepth: depth + 1 });
      const section = `## ${cell(entry.name).replace(/<br>/g, ' ')}\n\n${result.markdown}`;
      outputBytes += new TextEncoder().encode(section).byteLength;
      if (outputBytes > LIMITS.maxOutputBytes) throw new ConversionError('OUTPUT_TOO_LARGE', 'Combined archive output exceeds 10 MiB.');
      sections.push(section);
      warnings.push(...result.warnings.map(warning => `${entry.name}: ${warning}`));
    } catch (error) {
      if (['UNSAFE_ARCHIVE', 'ARCHIVE_DEPTH', 'OUTPUT_TOO_LARGE', 'PDF_LIMIT', 'IMAGE_LIMIT', 'PPTX_LIMIT', 'MODEL_TIMEOUT'].includes(error.code)) throw error;
      warnings.push(`${entry.name}: ${error.message}`);
    }
  }
  return { markdown: sections.join('\n---\n\n') || '_No convertible files in this archive._\n', warnings };
}
