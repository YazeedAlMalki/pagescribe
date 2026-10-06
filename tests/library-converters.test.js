import test from 'node:test';
import assert from 'node:assert/strict';
import { convertFile } from '../extension/lib/router.js';
import { htmlToMarkdown } from '../extension/lib/converters/html.js';
import { inspectArchive, safeArchivePath, openArchive, readEntry } from '../extension/lib/converters/archive.js';
import { spreadsheetToMarkdown } from '../extension/lib/converters/xlsx.js';
import { parseXmlDocument } from '../extension/lib/converters/xml-document.js';
import { utf8, workbook, docx, epub, jpeg, zipFiles, phase1Fixtures } from './helpers/documents.js';

const convert = (name, buffer, context = {}) => convertFile({ name, buffer, size: buffer.byteLength, ...(name.endsWith('.jpg') ? { format: 'exif' } : {}) }, context);

test('all seven previously stubbed formats convert real document containers', async () => {
  const fixtures = await phase1Fixtures();
  for (const [name, buffer] of Object.entries(fixtures)) {
    const result = await convert(name, buffer);
    assert.ok(result.markdown.trim().length > 10, name);
  }
});
test('HTML preserves headings, emphasis, links, lists and tables', () => {
  const { markdown } = htmlToMarkdown('<h1>Title</h1><p><strong>bold</strong> <em>italic</em> <a href="https://example.org">Link</a></p><ul><li>One</li><li>Two</li></ul><table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2</td></tr></table>');
  for (const expected of ['# Title', '**bold**', '*italic*', '[Link](https://example.org)', '-   One', '| A | B |', '| 1 | 2 |']) assert.ok(markdown.includes(expected), expected);
});
test('HTML scripts, event handlers, unsafe links and remote images remain inert', () => {
  const { markdown, warnings } = htmlToMarkdown('<script>globalThis.EXECUTED=1</script><a href="jav&#x61;script:alert(1)" onclick="alert(1)">Click</a><img src="https://example.org/tracker" onerror="alert(1)" alt="Diagram"><iframe src="https://example.org">Hidden</iframe>');
  assert.equal(globalThis.EXECUTED, undefined);
  for (const value of ['javascript:', 'alert', 'https://example.org', 'EXECUTED', 'Hidden']) assert.ok(!markdown.includes(value));
  assert.ok(markdown.includes('Diagram'));
  assert.ok(warnings.some(warning => warning.includes('alt text')));
});
test('HTML nested document head is omitted and code fences cannot break out', () => {
  const result = htmlToMarkdown('<html><head><title>Hidden title</title></head><body><pre>```\nhello</pre></body></html>');
  assert.ok(!result.markdown.includes('Hidden title'));
  assert.ok(result.markdown.startsWith('````'));
});
test('HTML excessive nesting fails with a clear limit error', () => {
  assert.throws(() => htmlToMarkdown('<div>'.repeat(130) + 'x' + '</div>'.repeat(130)), { code: 'HTML_LIMIT' });
});
for (const [extension, bookType] of [['xlsx', 'xlsx'], ['xls', 'biff8'], ['xls', 'biff5']]) {
  test(`${bookType} workbook preserves sheets and stored values`, async () => {
    const output = await convert(`book.${extension}`, workbook(bookType));
    for (const text of ['## Orders', '## Locations', 'Tea', '12', 'Riyadh', '36']) assert.ok(output.markdown.includes(text), text);
    if (bookType !== 'biff5') assert.ok(output.markdown.includes('قهوة'));
    // SheetJS's BIFF fixture writer stores these as values, not formula records.
    if (bookType === 'xlsx') assert.ok(output.warnings.some(warning => warning.includes('cached')));
  });
}
test('invalid spreadsheet signatures and oversized worksheet ranges fail', async () => {
  await assert.rejects(convert('bad.xlsx', utf8('a,b\n1,2')), { code: 'INVALID_SPREADSHEET' });
  await assert.rejects(convert('bad.xls', utf8('a,b')), { code: 'INVALID_SPREADSHEET' });
  assert.throws(() => spreadsheetToMarkdown({ SheetNames: ['Huge'], Sheets: { Huge: { '!ref': 'A1:XFD1048576' } } }), { code: 'SPREADSHEET_LIMIT' });
});
test('DOCX retains heading, bold, table and Arabic text', async () => {
  const output = await convert('report.docx', await docx());
  for (const text of ['# Quarterly report', '**Revenue increased.**', '| Tea | 12 |', 'مرحبا بالرياض']) assert.ok(output.markdown.includes(text), text);
});
test('DOCX rejects non-Word archives and malformed XML', async () => {
  await assert.rejects(convert('bad.docx', await zipFiles({ 'a.txt': 'x' })), { code: 'INVALID_DOCX' });
  await assert.rejects(convert('bad.docx', await zipFiles({ 'word/document.xml': '<a><b></a>' })), { code: 'INVALID_XML' });
});
test('EPUB reads spine order independently of ZIP entry order', async () => {
  const output = await convert('book.epub', await epub());
  assert.ok(output.markdown.includes('# Fixture book'));
  assert.ok(output.markdown.indexOf('First chapter') < output.markdown.indexOf('Second chapter'));
  const reversed = await convert('book.epub', await epub({ reverse: true }));
  assert.ok(reversed.markdown.indexOf('Second chapter') < reversed.markdown.indexOf('First chapter'));
});
test('EPUB rejects encryption and absent package parts', async () => {
  await assert.rejects(convert('book.epub', await epub({ extra: { 'META-INF/encryption.xml': '<encryption/>' } })), { code: 'ENCRYPTED_EPUB' });
  await assert.rejects(convert('book.epub', await zipFiles({ 'mimetype': 'application/epub+zip' })), { code: 'MISSING_ARCHIVE_ENTRY' });
});
test('EPUB font obfuscation does not prevent chapter extraction', async () => {
  const output = await convert('book.epub', await epub({ extra: {
    'META-INF/encryption.xml': '<encryption xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><EncryptedData xmlns="http://www.w3.org/2001/04/xmlenc#"><EncryptionMethod Algorithm="http://www.idpf.org/2008/embedding"/><CipherData><CipherReference URI="OEBPS/fonts/font.otf"/></CipherData></EncryptedData></encryption>'
  } }));
  assert.ok(output.markdown.includes('First chapter'));
  assert.ok(output.warnings.some(warning => warning.includes('font')));
});
test('ZIP converts mixed supported entries and reports failures/unsupported entries', async () => {
  const output = await convert('mixed.zip', await zipFiles({ 'good.json': '{"ok":true}', 'bad.json': '{', 'other.pdf': 'x', 'page.html': '<h1>Hello</h1>' }));
  assert.ok(output.markdown.includes('good.json') && output.markdown.includes('# Hello'));
  assert.ok(output.warnings.some(warning => warning.includes('bad.json')));
  assert.ok(output.warnings.some(warning => warning.includes('other.pdf')));
});
test('ZIP routes nested Office/EPUB archives inside the same worker', async () => {
  const output = await convert('mixed.zip', await zipFiles({ 'report.docx': await docx(), 'book.epub': await epub(), 'sheet.xlsx': workbook() }));
  for (const text of ['Quarterly report', 'First chapter', 'Orders']) assert.ok(output.markdown.includes(text), text);
});
test('ZIP nesting, traversal, expansion and count are bounded', async () => {
  let archive = await zipFiles({ 'data.json': '{}' });
  for (let i = 0; i < 3; i++) archive = await zipFiles({ 'nested.zip': archive });
  await assert.rejects(convert('deep.zip', archive), { code: 'ARCHIVE_DEPTH' });
  for (const path of ['../x', '/x', 'C:/x', 'a/../x', 'a\\x']) assert.throws(() => safeArchivePath(path), { code: 'UNSAFE_ARCHIVE' });
  await assert.rejects(convert('traversal.zip', await zipFiles({ '../evil.json': '{}' })), { code: 'UNSAFE_ARCHIVE' });
  await assert.rejects(convert('bomb.zip', await zipFiles({ 'data.xml': 'x'.repeat(1_000_000) })), { code: 'UNSAFE_ARCHIVE' });
  const count = await zipFiles(Object.fromEntries(Array.from({ length: 2001 }, (_, i) => [`${i}.csv`, 'x'])));
  assert.throws(() => inspectArchive(count), { code: 'UNSAFE_ARCHIVE' });
});
test('actual inflated bytes are counted against the shared archive budget', async () => {
  const archive = await openArchive(await zipFiles({ 'a.json': '{}', 'b.json': '{}' }));
  await readEntry(archive.zip.file('a.json'), archive.budget);
  await readEntry(archive.zip.file('b.json'), archive.budget);
  assert.equal(archive.budget.bytes, 4);
  archive.budget.bytes = 64 * 1024 * 1024 - 1;
  await assert.rejects(readEntry(archive.zip.file('a.json'), archive.budget), { code: 'UNSAFE_ARCHIVE' });
});
test('corrupt archive CRC is detected before document parsing', async () => {
  const data = await zipFiles({ 'a.json': '{}' }, { compression: 'STORE' });
  const bytes = new Uint8Array(data);
  // Alter an uncompressed payload byte but leave header CRC values intact.
  const view = new DataView(data);
  const offset = 30 + view.getUint16(26, true) + view.getUint16(28, true);
  bytes[offset] = 0x5b;
  const archive = await openArchive(data);
  await assert.rejects(readEntry(archive.zip.file('a.json'), archive.budget), { code: 'INVALID_ARCHIVE' });
});
test('JPEG EXIF exposes named camera, date and GPS tags', async () => {
  const { markdown } = await convert('camera.jpg', jpeg());
  for (const text of ['Make', 'Fixture Camera', 'DateTimeOriginal', 'GPSLatitude']) assert.ok(markdown.includes(text), text);
});
test('JPEG without EXIF succeeds; corrupt input fails', async () => {
  assert.match((await convert('plain.jpg', jpeg(false))).markdown, /No EXIF/);
  await assert.rejects(convert('bad.jpg', utf8('not jpeg')), { code: 'INVALID_JPEG' });
});
test('XML document parsing rejects DTD, external entities and invalid markup', () => {
  assert.throws(() => parseXmlDocument('<!DOCTYPE root SYSTEM "file:///secret"><root/>'), { code: 'UNSAFE_XML' });
  assert.throws(() => parseXmlDocument('<root><item></root>'), { code: 'INVALID_XML' });
});
