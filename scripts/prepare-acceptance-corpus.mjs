import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';

const root = 'tests/fixtures/independent/gutenberg';
await mkdir(root, { recursive: true });
const names = ['c01-02', 'c02-22', 'c03-29', 'c04-34', 'c05-39', 'c06-45', 'c07-53', 'c08-61', 'c09-74', 'c10-79', 'c11-84', 'c12-093'];
const files = [];
const pdf = await PDFDocument.create();
for (const name of names) {
  const url = `https://raw.githubusercontent.com/GITenberg/Adventures-of-Huckleberry-Finn_76/master/76-h/images/${name}.jpg`;
  let bytes = await readFile(`${root}/${name}.jpg`).catch(() => null);
  if (!bytes) {
    const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!response.ok) throw Error(`${url}: ${response.status}`);
    bytes = Buffer.from(await response.arrayBuffer());
    await writeFile(`${root}/${name}.jpg`, bytes);
  }
  const image = await pdf.embedJpg(bytes);
  const page = pdf.addPage([600, image.height / image.width * 600]);
  page.drawImage(image, { x: 0, y: 0, width: page.getWidth(), height: page.getHeight() });
  files.push({ name: `${name}.jpg`, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), width: image.width, height: image.height });
  console.log(`Acquired ${name}`);
}
pdf.setTitle('Huckleberry Finn: twelve distinct scanned chapter openings');
pdf.setSubject('Acceptance fixture assembled from independently scanned public-domain pages; not a contiguous chapter. No OCR text layer.');
const bytes = await pdf.save();
await writeFile(`${root}/chapter-openings-12.pdf`, bytes);
await writeFile(`${root}/SOURCE.json`, JSON.stringify({ acquiredAt: new Date().toISOString(), source: 'Project Gutenberg ebook 76, Adventures of Huckleberry Finn by Mark Twain; public domain in the USA', assembly: 'Twelve distinct unmodified scanned chapter-opening images placed one per PDF page; no repeated pages or text layer. Layout container produced locally with pdf-lib.', files, pdf: { name: 'chapter-openings-12.pdf', bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } }, null, 2));
