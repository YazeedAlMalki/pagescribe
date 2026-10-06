export function fenced(text, language = '') {
  let length = 3;
  for (const run of String(text).matchAll(/`+/g)) length = Math.max(length, run[0].length + 1);
  const fence = '`'.repeat(length);
  return `${fence}${language}\n${text}\n${fence}\n`;
}

export function cell(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/`/g, '\\`')
    .replace(/\*/g, '\\*').replace(/_/g, '\\_').replace(/\[/g, '\\[').replace(/\]/g, '\\]')
    .replace(/\r\n|\r|\n/g, '<br>');
}

export function markdownTable(rows) {
  if (!rows.length) return '_Empty CSV file._\n';
  const width = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0);
  const line = row => `| ${Array.from({ length: width }, (_, i) => cell(row[i])).join(' | ')} |`;
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n') + '\n';
}

export function outputName(name) {
  const base = String(name).replace(/\.[^.]+$/, '').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
    .replace(/[ .]+$/g, '').slice(0, 100) || 'document';
  return `${/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base) ? '_' : ''}${base}.md`;
}
