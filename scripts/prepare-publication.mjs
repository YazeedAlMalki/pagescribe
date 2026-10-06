// Explicit publication allowlist; never stages files or changes the original evidence.
import { readdir, readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname, join } from 'node:path';
import { createHash } from 'node:crypto';

const target = resolve(process.argv[2] || 'build/publication-candidate');
try { await access(target); throw Error('Publication target already exists; choose a new empty destination.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const files = ['.gitignore', '.npmrc', 'package.json', 'package-lock.json', 'README.md', 'RELEASE_NOTES.md',
  'Batch_Processing_Machine_Requirements.md', 'Decisions_Locked_Next_Steps.md', 'Feature_Status_Inventory.md',
  'Handoff_to_ChatGPT_Codex.md', 'MarkItDown_Extension_Roadmap.md', 'MarkItDown_Features_Porting_Analysis.md',
  'Phase_2_Implementation_Handoff.md', 'PPTX_Library_Choice_Final.md'];
try { await access('LICENSE'); files.push('LICENSE'); } catch { /* Owner decision pending. */ }
async function walk(directory, accept) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = `${directory}/${item.name}`;
    if (item.isSymbolicLink()) throw Error(`Refusing symbolic link: ${path}`);
    if (item.isDirectory()) { if (accept(path, true)) await walk(path, accept); }
    else if (accept(path, false)) files.push(path);
  }
}
await walk('extension', path => !path.startsWith('extension/vendor'));
await walk('scripts', () => true);
await walk('docs', () => true);
for (const item of await readdir('tests', { withFileTypes: true })) if (item.isFile() && /\.(js|md)$/.test(item.name)) files.push(`tests/${item.name}`);
await walk('tests/helpers', () => true);
await walk('tests/fixtures', (path, directory) => directory ? !/\/(generated|manual)$/.test(path) :
  path.includes('/independent/') ? /\/(SOURCE\.json|LICENSE\.txt|COPYING|COPYING\.MPL)$/.test(path) : /\.(csv|json|xml)$/.test(path));

const records = [], findings = [];
for (const path of files.sort()) {
  let bytes = await readFile(path);
  let source = bytes.toString('utf8');
  const original = source;
  if (path.endsWith('.md')) {
    source = source.replace(/\[([^\]]+)\]\([A-Z]:\/Users\/[^)]+\/SKILL\.md\)/g, '$1 (local workflow guidance)')
      .replace(/[A-Z]:[\\/]Users[\\/][^\\/\s`]+[\\/]Documents[\\/]MarkItDown_Codex_Handoff/g, '.')
      .replace(/\/home\/claude\//g, './')
      .replace(/\[([^\]]+)\]\((evidence\/[^)]+)\)/g, '$1 (local-only evidence: `$2`)');
    bytes = Buffer.from(source);
  }
  for (const [kind, pattern] of Object.entries({
    credential: /(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|sk-(?:proj-)?[A-Za-z0-9_-]{24,}|AKIA[A-Z0-9]{16}|-----BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY-----)/,
    personalPath: /[A-Z]:[\\/]Users[\\/]|\/home\/[^/\s]+\/|\/Users\/[^/\s]+\//,
    credentialAssignment: /(?:password|secret|access_token|api_key)\s*[:=]\s*["'][^"'\s]{12,}["']/i
  })) if (pattern.test(source)) findings.push({ path, kind });
  await mkdir(dirname(join(target, path)), { recursive: true });
  await writeFile(join(target, path), bytes);
  records.push({ path, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), normalizedHistoricalPaths: original !== source });
}
// Validate public Markdown links using only the allowlisted files, not excluded local evidence.
const included = new Set(records.map(record => resolve(target, record.path)));
const brokenLinks = [];
for (const record of records.filter(record => record.path.endsWith('.md'))) {
  const source = await readFile(join(target, record.path), 'utf8');
  for (const match of source.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
    const link = match[1].split('#')[0];
    if (!link || /^[a-z]+:/i.test(link)) continue;
    if (!included.has(resolve(target, dirname(record.path), link))) brokenLinks.push({ path: record.path, link });
  }
}
await mkdir('build', { recursive: true });
await writeFile('build/publication-files.json', JSON.stringify({ files: records, findings, brokenLinks }, null, 2) + '\n');
console.log(JSON.stringify({ files: records.length, bytes: records.reduce((sum, file) => sum + file.bytes, 0), findings, brokenLinks }, null, 2));
if (findings.length || brokenLinks.length) process.exitCode = 1;
