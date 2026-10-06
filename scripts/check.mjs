import { readdir, readFile, access } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import assert from 'node:assert/strict';

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  return (await Promise.all(entries.map(entry => entry.isDirectory() ? walk(resolve(dir, entry.name)) : resolve(dir, entry.name)))).flat();
}
const root = resolve('extension');
const files = await walk(root);
for (const file of files.filter(file => /\.m?js$/.test(file))) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const source = await readFile(file, 'utf8');
  for (const match of source.matchAll(/(?:from\s+|import\()['"](\.[^'"]+)['"]/g)) await access(resolve(dirname(file), match[1]));
}
const manifest = JSON.parse(await readFile(resolve(root, 'manifest.json'), 'utf8'));
assert.equal(manifest.manifest_version, 3);
assert.deepEqual(manifest.permissions, ['storage']);
assert.equal(manifest.background.type, 'module');
assert.ok(!manifest.host_permissions);
const pkg=JSON.parse(await readFile('package.json','utf8'));
assert.equal(manifest.version,pkg.version);
const csp=manifest.content_security_policy.extension_pages;
assert.ok(csp.includes("script-src 'self' 'wasm-unsafe-eval'"));
assert.ok(csp.includes("worker-src 'self'"));
assert.ok(!csp.includes("'unsafe-eval'")&&!csp.includes("'unsafe-inline'"));
assert.ok(csp.includes("connect-src 'self' https://media.githubusercontent.com https://raw.githubusercontent.com"));
for(const asset of ['vendor/ort/ort-wasm-simd-threaded.mjs','vendor/ort/ort-wasm-simd-threaded.wasm','vendor/pdf/pdf.mjs','vendor/pdf/pdf.worker.mjs','vendor/pdf/standard_fonts/LiberationSans-Regular.ttf','vendor/pdf/cmaps/Adobe-Japan1-UCS2.bcmap'])await access(resolve(root,asset));
const {MODELS,MODEL_BUDGET}=await import('../extension/lib/ocr/model-catalogue.js');
assert.ok(Object.values(MODELS).reduce((total,model)=>total+model.bytes,0)<=MODEL_BUDGET);
for(const model of Object.values(MODELS)) {
  assert.ok(/^https:\/\/(media|raw)\.githubusercontent\.com\//.test(model.url));
  assert.ok(model.url.includes('384182c7187c12d4ea181ae3b97c8b7e12089d9d'));
  assert.match(model.sha256,/^[a-f0-9]{64}$/);
}
for (const file of [manifest.background.service_worker, manifest.action.default_popup, manifest.options_ui.page]) await access(resolve(root, file));
for (const file of files.filter(file => file.endsWith('.html'))) {
  const html = await readFile(file, 'utf8');
  assert.ok(!/\son\w+\s*=/.test(html), 'No inline event handlers under MV3 CSP');
  for (const match of html.matchAll(/(?:src|href)="([^"#]+)"/g)) await access(resolve(dirname(file), match[1]));
}
console.log(`Checked ${files.length} extension files: syntax, local imports/runtime assets, pinned models, MV3 CSP and storage-only permissions.`);
