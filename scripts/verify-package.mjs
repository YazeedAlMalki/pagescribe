import JSZip from 'jszip';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, dirname, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('extension/manifest.json','utf8'));
const zip=await JSZip.loadAsync(await readFile(`build/PageScribe-${manifest.version}.zip`),{checkCRC32:true});
const root=resolve(`build/verification-pagescribe-${manifest.version}`);
for(const entry of Object.values(zip.files).filter(entry=>!entry.dir)) {
  const target=resolve(root,entry.name);
  assert.ok(target.startsWith(root+sep)&&!entry.name.includes('..'));
  const data=await entry.async('nodebuffer');
  assert.deepEqual(data,await readFile(resolve('extension',entry.name)),`Packaged asset differs: ${entry.name}`);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,data);
}
const result=spawnSync(process.execPath,['scripts/test-browser.mjs'],{stdio:'inherit',windowsHide:true,env:{...process.env,MARKITDOWN_EXTENSION:root}});
if(result.status!==0)process.exit(result.status||1);
console.log(`Packaged extension ${manifest.version}: asset equality and Edge suites passed.`);
