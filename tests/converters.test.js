import test from 'node:test';
import assert from 'node:assert/strict';
import { convertFile } from '../extension/lib/router.js';
import { parseCsv } from '../extension/lib/converters/csv.js';
import { detectFormat, FORMATS } from '../extension/lib/formats.js';
import { fenced, outputName } from '../extension/lib/markdown.js';
import { decodeText } from '../extension/lib/converters/text.js';
import { validateFiles, LIMITS } from '../extension/lib/limits.js';
import { validateSettings } from '../extension/lib/settings-store.js';

const buffer = text => new TextEncoder().encode(text).buffer;
const convert = (name, text) => convertFile({ name, buffer: buffer(text) });

test('routes all thirteen formats; JPEG defaults to OCR and EXIF stays explicit', () => {
  assert.equal(FORMATS.length, 13);
  for (const format of FORMATS.filter(item => item.extensions.length)) assert.equal(detectFormat({ name: `FILE.${format.extensions[0].toUpperCase()}` }).id, format.id);
  assert.equal(detectFormat({ name: 'photo.jpg' }, 'exif').id, 'exif');
});
test('extension takes precedence over generic ZIP MIME', () => assert.equal(detectFormat({ name: 'book.xlsx', type: 'application/zip' }).id, 'xlsx'));
test('extensionless input uses MIME, and explicit selection overrides filename', () => {
  assert.equal(detectFormat({ name: 'document', type: 'text/csv' }).id, 'csv');
  assert.equal(detectFormat({ name: 'export.txt' }, 'json').id, 'json');
});
test('unsupported types and invalid overrides fail explicitly', () => {
  for (const name of ['file.ppt', 'file.mp3', 'macro.xlsm']) assert.throws(() => detectFormat({ name }), { code: 'UNSUPPORTED_FORMAT' });
  assert.throws(() => detectFormat({ name: 'x.csv' }, 'missing'), { code: 'UNSUPPORTED_FORMAT' });
});
test('native CSV supports quotes, CRLF, embedded newlines and trailing cells', async () => {
  assert.deepEqual(parseCsv('a,b,c\r\n"one,two","say ""hi""","line1\nline2"\r\n3,4,'), [
    ['a', 'b', 'c'], ['one,two', 'say "hi"', 'line1\nline2'], ['3', '4', '']
  ]);
  const result = await convert('test.csv', 'Name,Amount\nTea,12\n');
  assert.equal(result.markdown, '| Name | Amount |\n| --- | --- |\n| Tea | 12 |\n');
});
test('CSV keeps Arabic and escapes pipes, HTML and Markdown', async () => {
  const result = await convert('test.csv', 'اسم,ملاحظة\nقهوة,"a|b <script> *bold*"');
  assert.match(result.markdown, /قهوة/);
  assert.ok(result.markdown.includes('a\\|b &lt;script&gt; \\*bold\\*'));
});
test('CSV empty and ragged input are defined', async () => {
  assert.match((await convert('empty.csv', '')).markdown, /Empty CSV/);
  assert.equal((await convert('ragged.csv', 'a,b\n1')).warnings.length, 1);
});
test('malformed CSV fails instead of silently dropping content', () => {
  for (const value of ['a,"unclosed', 'a,"x"extra', 'ab"cd']) assert.throws(() => parseCsv(value), { code: 'INVALID_CSV' });
});
test('CSV column limit applies to the final field too', () => {
  assert.throws(() => parseCsv(Array(1001).fill('x').join(',')), { code: 'CSV_LIMIT' });
});
test('JSON validates and pretty prints; malformed JSON fails', async () => {
  assert.equal((await convert('data.json', '{"ok":true}')).markdown, '```json\n{\n  "ok": true\n}\n```\n');
  await assert.rejects(convert('bad.json', '{'), { code: 'INVALID_JSON' });
});
test('XML preserves source and declares that syntax is not validated', async () => {
  const source = '<root><item>مرحبا</item></root>';
  const result = await convert('data.xml', source);
  assert.equal(result.markdown, `\`\`\`xml\n${source}\n\`\`\`\n`);
  assert.match(result.warnings[0], /not validated/);
});
test('code fence grows around document backticks', () => assert.equal(fenced('```\nhello'), '````\n```\nhello\n````\n'));
test('text decoder supports BOM-marked UTF-16 and rejects invalid UTF-8', () => {
  assert.equal(decodeText(Uint8Array.from([255, 254, 65, 0]).buffer), 'A');
  assert.equal(decodeText(Uint8Array.from([254, 255, 0, 65]).buffer), 'A');
  assert.throws(() => decodeText(Uint8Array.from([255]).buffer), { code: 'INVALID_ENCODING' });
});
test('input and batch limits reject excessive allocations', () => {
  assert.throws(() => validateFiles([]), { code: 'EMPTY_BATCH' });
  assert.throws(() => validateFiles([{ name: 'x', size: LIMITS.maxFileBytes + 1 }]), { code: 'FILE_TOO_LARGE' });
  assert.throws(() => validateFiles(Array(26).fill({ name: 'x', size: 1 })), { code: 'TOO_MANY_FILES' });
  assert.throws(() => validateFiles(Array(6).fill({ name: 'x', size: LIMITS.maxFileBytes })), { code: 'BATCH_TOO_LARGE' });
  assert.throws(() => validateFiles([{ name: 'x', size: -1 }]), { code: 'INVALID_FILE' });
});
test('output limit is enforced after conversion', async () => {
  await assert.rejects(convert('large.xml', 'x'.repeat(LIMITS.maxOutputBytes)), { code: 'OUTPUT_TOO_LARGE' });
});
test('download filenames stay flat and avoid reserved device names', () => {
  assert.equal(outputName('report.xlsx'), 'report.md');
  assert.equal(outputName('CON.csv'), '_CON.md');
  assert.ok(!/[<>:"/\\|?*]/.test(outputName('../bad:name.csv')));
});
test('cache setting validation enforces integer hours', () => {
  assert.equal(validateSettings({ cacheHours: '24' }).cacheHours, 24);
  for (const cacheHours of [0, 721, 1.5, 'abc']) assert.throws(() => validateSettings({ cacheHours }));
});
