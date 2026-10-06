import { decodeText } from './text.js';
import { markdownTable } from '../markdown.js';
import { ConversionError } from '../errors.js';

// Native CSV parser: quoted commas, escaped quotes and embedded newlines.
export function parseCsv(source) {
  if (!source) return [];
  const rows = [];
  let row = [], field = '', quoted = false, closed = false;
  const pushField = () => {
    if (row.length >= 1000) throw new ConversionError('CSV_LIMIT', 'CSV exceeds the 1,000-column limit.');
    row.push(field); field = ''; closed = false;
  };
  const pushRow = () => {
    pushField(); rows.push(row); row = [];
    if (rows.length > 50_000) throw new ConversionError('CSV_LIMIT', 'CSV exceeds the 50,000-row limit.');
  };
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === ',') {
      pushField();
    } else if (char === '\r' || char === '\n') {
      pushRow();
      if (char === '\r' && source[i + 1] === '\n') i++;
    } else if (char === '"' && !field && !closed) quoted = true;
    else if (closed || char === '"') throw new ConversionError('INVALID_CSV', 'CSV has an unexpected quote or text after a closing quote.');
    else field += char;
  }
  if (quoted) throw new ConversionError('INVALID_CSV', 'CSV has an unclosed quoted field.');
  if (field || row.length || closed || !/[\r\n]$/.test(source)) pushRow();
  return rows;
}

export async function convert({ buffer }, context = {}) {
  context.report?.('Parsing CSV');
  const rows = parseCsv(decodeText(buffer));
  const warnings = rows.some(row => row.length !== rows[0]?.length) ? ['Rows have different widths; missing cells are left blank.'] : [];
  return { markdown: markdownTable(rows), warnings };
}
