import JSZip from 'jszip';
import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';

const zip = new JSZip();
async function addDirectory(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, item.name);
    if (item.isDirectory()) await addDirectory(path);
    else zip.file(relative('extension', path).replaceAll('\\', '/'), await readFile(path));
  }
}
await addDirectory('extension');
const manifest = JSON.parse(await readFile('extension/manifest.json', 'utf8'));
await mkdir('build', { recursive: true });
const target = `build/PageScribe-${manifest.version}.zip`;
const bytes = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 9 } });
await writeFile(target, bytes);
console.log(`Packaged ${target}: ${(bytes.length / 1024).toFixed(0)} KiB. Extract before using Load unpacked.`);
