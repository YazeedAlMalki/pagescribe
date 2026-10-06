import { read, utils } from '../../vendor/workbook.js';
import { openArchive, readEntry, archiveBudget } from './archive.js';
import { markdownTable, cell } from '../markdown.js';
import { ConversionError } from '../errors.js';

export function spreadsheetToMarkdown(workbook) {
  if (workbook.SheetNames.length > 100) throw new ConversionError('SPREADSHEET_LIMIT', 'Workbook exceeds 100 worksheets.');
  const sections = [], warnings = [];
  let cells = 0;
  for (const name of workbook.SheetNames) {
    const sheet = workbook.Sheets[name];
    sections.push(`## ${cell(name).replace(/<br>/g, ' ')}\n`);
    if (!sheet?.['!ref']) { sections.push('_Empty worksheet._\n'); continue; }
    const range = utils.decode_range(sheet['!ref']);
    const width = range.e.c - range.s.c + 1, height = range.e.r - range.s.r + 1;
    cells += width * height;
    if (width > 1000 || height > 50_000 || cells > 500_000) throw new ConversionError('SPREADSHEET_LIMIT', 'Workbook exceeds the 500,000-cell, 50,000-row or 1,000-column limit.');
    if (sheet['!merges']?.length) warnings.push('Merged cells retain their top-left value; other cells remain blank.');
    if (Object.values(sheet).some(value => value?.f)) warnings.push('Formulas use cached values; formulas are not recalculated.');
    sections.push(markdownTable(utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false })));
  }
  return { markdown: sections.join('\n') || '_Empty workbook._\n', warnings: [...new Set(warnings)] };
}

export async function convert({ buffer, format = 'xlsx' }, context = {}) {
  context.report?.('Reading worksheets');
  const bytes = new Uint8Array(buffer);
  const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
  const isOLE = bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0;
  // Do not let SheetJS's permissive text reader accept a corrupt Office file.
  if ((format === 'xlsx' && !isZip) || (format === 'xls' && !isOLE)) throw new ConversionError('INVALID_SPREADSHEET', 'The file signature does not match this Excel format.');
  if (isZip) {
    const { zip, budget } = await openArchive(buffer, archiveBudget(context));
    if (!zip.file('xl/workbook.xml')) throw new ConversionError('INVALID_SPREADSHEET', 'The archive does not contain an XLSX workbook.');
    // Validate real inflated sizes before SheetJS's synchronous ZIP reader.
    for (const entry of Object.values(zip.files)) if (!entry.dir) await readEntry(entry, budget);
  }
  try {
    const workbook = read(buffer, { type: 'array', cellHTML: false, cellStyles: false, cellNF: false,
      cellFormula: true, bookVBA: false, WTF: false });
    return spreadsheetToMarkdown(workbook);
  } catch (error) {
    if (error instanceof ConversionError) throw error;
    throw new ConversionError('INVALID_SPREADSHEET', `Cannot read workbook: ${error.message}`);
  }
}
