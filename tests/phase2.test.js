import test from 'node:test';
import assert from 'node:assert/strict';
import { convertFile } from '../extension/lib/router.js';
import { layoutText, usableText } from '../extension/lib/converters/pdf-layout.js';
import { renderScale } from '../extension/lib/converters/pdf.js';
import { imageDimensions } from '../extension/lib/ocr/image.js';
import { logicalArabic } from '../extension/lib/ocr/service.js';
import { validateSettings } from '../extension/lib/settings-store.js';
import { pptx, pdf, protectedPdf, imageFixture, oversizedPdfImage } from './helpers/phase2-documents.js';
import { createCanvas } from '@napi-rs/canvas';
import { readFile } from 'node:fs/promises';
import { arrayBuffer, zipFiles } from './helpers/documents.js';
const convert = (name, bytes, context = {}) => convertFile({ name, buffer: bytes instanceof ArrayBuffer ? bytes : arrayBuffer(bytes) }, context);

test('PPTX relationship order, titles, bullets, tables, groups, Arabic and notes', async () => {
  const result = await convert('deck.pptx', await pptx());
  for (const text of ['## Slide 1', '## Slide 2', '### First in presentation', '- Bullet item', '| Tea | 12 |', 'Grouped مرحبا', '### Speaker notes', 'Present these findings.']) assert.ok(result.markdown.includes(text), text);
  assert.ok(result.markdown.indexOf('First in presentation') < result.markdown.indexOf('Second in presentation'));
  assert.ok(!result.markdown.includes('Footer boilerplate')); assert.ok(!result.markdown.includes('123'));
  assert.ok(result.warnings.some(w => w.includes('chart')));
});
test('independent public PPTX demonstration deck retains ordered text, tables and notes', async () => {
  const result=await convert('showcase.pptx',await readFile(new URL('./fixtures/independent/showcase.pptx',import.meta.url)));
  assert.ok((result.markdown.match(/^## Slide /gm)||[]).length>=12);
  for(const text of ['Opening Keynote','Modular Architecture','| Target Runtime / Engine |','### Speaker notes'])assert.ok(result.markdown.includes(text),text);
  assert.ok(result.warnings.some(w=>w.includes('chart')));
});

test('desktop PowerPoint section references are not additional slides', async () => {
  const bytes = await readFile(new URL('./fixtures/independent/libreoffice/bullet-indent.pptx', import.meta.url));
  const result = await convert('bullet-indent.pptx', bytes);
  assert.equal((result.markdown.match(/^## Slide /gm) || []).length, 1);
  assert.match(result.markdown, /First Line Indentation/);
  assert.match(result.markdown, /Hanging Indentation/);
});

test('PPTX missing referenced slide reports the missing part clearly', async () => {
  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(await readFile(new URL('./fixtures/independent/libreoffice/bullet-indent.pptx', import.meta.url)));
  zip.remove('ppt/slides/slide1.xml');
  await assert.rejects(convert('missing-slide.pptx', await zip.generateAsync({ type: 'uint8array' })),
    { code: 'INVALID_PPTX', message: 'Missing presentation part: ppt/slides/slide1.xml.' });
});
test('PPTX rejects missing relationships, invalid XML, entities and encrypted containers', async () => {
  for (const extra of [{ 'ppt/_rels/presentation.xml.rels': '<Relationships/>' }, { 'ppt/slides/slide9.xml': '<broken>' }, { 'ppt/slides/slide9.xml': '<!DOCTYPE x><x/>' }]) await assert.rejects(convert('deck.pptx', await pptx(extra)));
  await assert.rejects(convert('deck.pptx', Buffer.from([208, 207, 17, 224])), /Encrypted/);
});
test('PPTX and native PDF work inside ZIP using shared guards', async () => {
  const result = await convert('bundle.zip', await zipFiles({ 'slides.pptx': await pptx(), 'native.pdf': await pdf() }));
  assert.match(result.markdown, /Slide 2/); assert.match(result.markdown, /Page 2/);
});
test('native multipage PDF extracts without invoking OCR', async () => {
  const result = await convert('native.pdf', await pdf(), { ocr: { recognize() { throw new Error('OCR must not run'); } } });
  assert.match(result.markdown, /## Page 1[\s\S]*Searchable page 1[\s\S]*## Page 2[\s\S]*Searchable page 2/);
});
test('PDF rejects protected, corrupt and over-limit documents', async () => {
  await assert.rejects(convert('secret.pdf', protectedPdf()), { code: 'PDF_PASSWORD' });
  await assert.rejects(convert('corrupt.pdf', Buffer.from('bad')), { code: 'INVALID_PDF' });
  await assert.rejects(convert('huge.pdf', await pdf({ pages: Array(101).fill('blank') })), { code: 'PDF_LIMIT' });
});
test('two-column PDF puts the complete left column before the right', async () => {
  const result = await convert('columns.pdf', await pdf({ pages: ['blank'], columns: true }));
  assert.match(result.markdown, /Left first\nLeft second\n\nRight first\nRight second/);
});
test('native-text heuristic handles blank, short, damaged and Arabic text', () => {
  for (const text of ['', '  ', '12', '□???', 'broken�']) assert.equal(usableText(text), false);
  for (const text of ['مرحبا', 'Hello', 'ABC 123']) assert.equal(usableText(text), true);
});
test('layout keeps Arabic and mixed fragments logical without reversing characters', () => {
  const item = (str, x, dir = 'rtl') => ({ str, dir, transform: [12, 0, 0, 12, x, 100], width: 40, height: 12 });
  assert.equal(layoutText([item('مرحبا', 100), item('بكم', 40)], 300).text, 'مرحبا بكم');
  assert.match(layoutText([item('English', 10, 'ltr'), item('2026', 80, 'ltr')]).text, /English 2026/);
});
test('image declared dimensions are checked before decode; corrupt and oversized input fail', () => {
  assert.deepEqual(imageDimensions(arrayBuffer(imageFixture())), { width: 1200, height: 240 });
  assert.deepEqual(imageDimensions(arrayBuffer(imageFixture({ format: 'jpg' }))), { width: 1200, height: 240 });
  assert.throws(() => imageDimensions(arrayBuffer(Buffer.from('bad'))), { code: 'INVALID_IMAGE' });
  const huge = Buffer.from(imageFixture()); huge.writeUInt32BE(100_000, 16);
  assert.throws(() => imageDimensions(arrayBuffer(huge)), { code: 'IMAGE_LIMIT' });
});
test('PDF render scale and settings bound allocations and options', () => {
  const scale = renderScale(600, 800); assert.ok(600 * 800 * scale * scale <= 4_000_000);
  assert.throws(() => renderScale(1e9, 800), { code: 'PDF_LIMIT' });
  assert.throws(() => validateSettings({ cacheHours: 24, modelCacheHours: 0 }));
  assert.throws(() => validateSettings({ cacheHours: 24, ocrLanguage: 'all' }));
  assert.throws(() => validateSettings({ cacheHours: 24, ocrRotation: 45 }));
  assert.equal(logicalArabic('ضايرلا يف مكب ابحرم'), 'مرحبا بكم في الرياض');
});

test('isolated PDF page recognition failure retains successful pages with numbered warning', async () => {
  globalThis.OffscreenCanvas = class { constructor(width,height) { return createCanvas(width,height); } };
  try {
    const result=await convert('partial.pdf',await pdf({pages:['native','scan','native']}),{ocr:{recognize(){throw new Error('Fixture OCR page failure');}}});
    assert.match(result.markdown,/Searchable page 1[\s\S]*Page 2[\s\S]*Page conversion failed[\s\S]*Searchable page 3/);
    assert.ok(result.warnings.some(w=>w.includes('Page 2: Fixture OCR page failure')));
    assert.ok(result.warnings.some(w=>w.startsWith('Partial result:')));
  } finally {delete globalThis.OffscreenCanvas;}
});
test('oversized embedded PDF image stops with an explicit protective limit error', async () => {
  globalThis.OffscreenCanvas = class { constructor(width,height) { return createCanvas(width,height); } };
  try {await assert.rejects(convert('huge-image.pdf',await oversizedPdfImage()),{code:'PDF_LIMIT'});}
  finally {delete globalThis.OffscreenCanvas;}
});
