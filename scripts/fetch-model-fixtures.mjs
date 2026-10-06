// Maintainer-only fixture downloads. Runtime downloads use the locked catalogue.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const revision = '384182c7187c12d4ea181ae3b97c8b7e12089d9d';
const repo = `PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/${revision}`;
const paths = {
  detection: 'detection/PP-OCRv5_mobile_det_infer.onnx',
  english: 'recognition/multi/en/v5/en_PP-OCRv5_mobile_rec_infer.onnx',
  arabic: 'recognition/multi/arabic/v5/arabic_PP-OCRv5_mobile_rec_infer.onnx',
  englishDictionary: 'recognition/multi/en/v5/ppocrv5_en_dict.txt',
  arabicDictionary: 'recognition/multi/arabic/v5/ppocrv5_arabic_dict.txt'
};
await mkdir('.browser-tests/models', { recursive: true });
const catalogue = {};
for (const [id, path] of Object.entries(paths)) {
  const raw = `https://raw.githubusercontent.com/${repo}/${path}`;
  const metadata = await fetch(raw, { signal: AbortSignal.timeout(60_000) });
  if (!metadata.ok) throw new Error(`${id}: HTTP ${metadata.status}`);
  let bytes = Buffer.from(await metadata.arrayBuffer()), url = raw;
  const pointer = bytes.toString();
  if (pointer.startsWith('version https://git-lfs')) {
    url = `https://media.githubusercontent.com/media/${repo}/${path}`;
    const download = await fetch(url, { signal: AbortSignal.timeout(120_000), redirect: 'error' });
    if (!download.ok) throw new Error(`${id}: HTTP ${download.status}`);
    bytes = Buffer.from(await download.arrayBuffer());
    if (!pointer.includes(`oid sha256:${createHash('sha256').update(bytes).digest('hex')}`) || !pointer.includes(`size ${bytes.length}`)) throw new Error(`${id}: LFS integrity mismatch`);
  }
  const record = { id: `paddle-v5-${revision.slice(0, 12)}-${id}`, url, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), language: id.startsWith('arabic') ? 'ar' : id.startsWith('english') ? 'en' : 'shared' };
  catalogue[id] = record;
  await writeFile(`.browser-tests/models/${id}.bin`, bytes);
  console.log(`${id}: ${bytes.length} bytes; SHA-256 ${record.sha256}`);
}
const target = 'extension/lib/ocr/model-catalogue.js';
if (process.argv.includes('--lock')) {
  await writeFile(target, `// Pinned upstream revision ${revision}; Apache-2.0. SHA-256 verified against Git LFS where available.\nexport const MODELS = Object.freeze(${JSON.stringify(catalogue, null, 2)});\nexport const MODEL_BUDGET = 64 * 1024 * 1024;\nexport const modelSet = language => [MODELS.detection, MODELS[language === 'ar' ? 'arabic' : 'english'], MODELS[language === 'ar' ? 'arabicDictionary' : 'englishDictionary']];\n`);
} else {
  const { MODELS } = await import('../extension/lib/ocr/model-catalogue.js');
  if (JSON.stringify(MODELS) !== JSON.stringify(catalogue)) throw new Error('Downloaded model catalogue differs from the pinned release.');
}
const license = await fetch(`https://raw.githubusercontent.com/${repo}/LICENSE`);
if (!license.ok) throw new Error('Model license unavailable');
await writeFile('scripts/vendor/PADDLE_MODELS_LICENSE.txt', await license.text());
