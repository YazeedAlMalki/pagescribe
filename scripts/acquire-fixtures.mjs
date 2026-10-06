// Reproduce the recorded corpus without refreshing SOURCE.json or trusting new hashes.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const root = 'tests/fixtures/independent';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function acquire(directory, record) {
  if (!/^[\w.-]+$/.test(record.name) || !/^[a-f0-9]{64}$/.test(record.sha256)) throw Error('Invalid fixture record');
  const path = join(directory, record.name);
  let bytes = await readFile(path).catch(error => { if (error.code !== 'ENOENT') throw error; });
  if (!bytes) {
    const url = new URL(record.url);
    if (url.protocol !== 'https:' || !['github.com', 'raw.githubusercontent.com'].includes(url.hostname)) throw Error('Unexpected fixture host');
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(`${record.name}: HTTP ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (bytes.length !== record.bytes || sha256(bytes) !== record.sha256) throw Error(`${record.name}: integrity mismatch; SOURCE.json was not changed`);
  await mkdir(directory, { recursive: true });
  await writeFile(path, bytes);
  console.log(`Verified ${path}`);
}
const showcase = JSON.parse(await readFile(`${root}/SOURCE.json`, 'utf8'));
await acquire(root, { ...showcase, name: 'showcase.pptx' });
const desktop = JSON.parse(await readFile(`${root}/libreoffice/SOURCE.json`, 'utf8'));
for (const record of desktop.files) await acquire(`${root}/libreoffice`, record);

if (process.argv.includes('--all')) {
  for (const directory of ['ocrmypdf', 'gutenberg']) {
    const source = JSON.parse(await readFile(`${root}/${directory}/SOURCE.json`, 'utf8'));
    for (const record of source.files) await acquire(`${root}/${directory}`, record);
  }
  const { PDFDocument } = await import('pdf-lib');
  const source = JSON.parse(await readFile(`${root}/gutenberg/SOURCE.json`, 'utf8'));
  const pdf = await PDFDocument.create();
  for (const record of source.files) {
    const image = await pdf.embedJpg(await readFile(`${root}/gutenberg/${record.name}`));
    const page = pdf.addPage([600, image.height / image.width * 600]);
    page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  }
  pdf.setTitle('Huckleberry Finn: twelve distinct scanned chapter openings');
  pdf.setSubject('Acceptance fixture assembled from independently scanned public-domain pages; not a contiguous chapter. No OCR text layer.');
  // Stable metadata makes new assemblies repeatable; the historical PDF hash stays historical.
  pdf.setCreationDate(new Date('2026-10-05T00:00:00Z'));
  pdf.setModificationDate(new Date('2026-10-05T00:00:00Z'));
  const bytes = await pdf.save();
  await writeFile(`${root}/gutenberg/chapter-openings-12.pdf`, bytes);
  console.log(`Assembled 12 verified scans; SHA-256 ${sha256(bytes)} (new container, historical SOURCE.json unchanged)`);
}
