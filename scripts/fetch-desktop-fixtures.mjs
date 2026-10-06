import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import JSZip from 'jszip';
import { convertFile } from '../extension/lib/router.js';
const root = 'tests/fixtures/independent/libreoffice';
await mkdir(root, { recursive: true });
const commitResponse = await fetch('https://api.github.com/repos/LibreOffice/core/commits/master');
if (!commitResponse.ok) throw Error(`Commit lookup: ${commitResponse.status}`);
const commit = (await commitResponse.json()).sha;
const files = [];
for (const name of ['bullet-indent.pptx','group.pptx','group-rot.pptx','pres-with-notes.pptx','master-slides.pptx','table-list.pptx']) {
  const url = `https://raw.githubusercontent.com/LibreOffice/core/${commit}/sd/qa/unit/data/pptx/${name}`;
  const response = await fetch(url, { signal: AbortSignal.timeout(60000) });
  if (!response.ok) throw Error(`${name}: ${response.status}`);
  const bytes = Buffer.from(await response.arrayBuffer());
  await writeFile(`${root}/${name}`,bytes);
  const zip = await JSZip.loadAsync(bytes);
  const app = await zip.file('docProps/app.xml')?.async('string');
  const result = await convertFile({ name, buffer: bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength) }).catch(error=>({markdown:'',warnings:[],error:{code:error.code,message:error.message}}));
  await writeFile(`tests/evidence/2026-10-05/${name}.md`,result.markdown);
  const record = {name,url,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),application:app?.match(/<Application[^>]*>(.*?)<\/Application>/)?.[1],warnings:result.warnings,error:result.error,slides:(result.markdown.match(/^## Slide /gm)||[]).length};
  files.push(record); console.log(JSON.stringify(record));
}
for (const name of ['LICENSE','COPYING','COPYING.MPL']) {
  const r = await fetch(`https://raw.githubusercontent.com/LibreOffice/core/${commit}/${name}`);
  if (r.ok) await writeFile(`${root}/${name}`, await r.text());
}
await writeFile(`${root}/SOURCE.json`,JSON.stringify({date:new Date().toISOString(),repository:'https://github.com/LibreOffice/core',commit,provenance:'Independent desktop regression fixtures from LibreOffice sd/qa/unit/data/pptx; Application metadata recorded as producer evidence, not proof of a local desktop save.',files},null,2));
