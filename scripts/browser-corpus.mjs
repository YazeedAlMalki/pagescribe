import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { browserHarness } from './browser-harness.mjs';
import { MODELS } from '../extension/lib/ocr/model-catalogue.js';
const browser=await browserHarness();
const records=[];
try {
  const {session}=await browser.open();
  const assets=await Promise.all(Object.entries(MODELS).map(async([key,m])=>({url:m.url,data:(await readFile(`.browser-tests/models/${key}.bin`)).toString('base64')})));
  await browser.evaluate(session,`(async()=>{const {modelCache,prepareModels}=await import('./lib/ocr/model-cache.js');const original=modelCache.fetcher;const assets=${JSON.stringify(assets)};modelCache.fetcher=async url=>new Response(Uint8Array.from(atob(assets.find(a=>a.url===url).data),c=>c.charCodeAt(0)));try{await prepareModels('en');await prepareModels('ar');}finally{modelCache.fetcher=original;}})()`);
  await browser.command('Network.enable',{},session);
  await browser.command('Network.emulateNetworkConditions',{offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1},session);
  assert.equal(await browser.evaluate(session,"navigator.onLine"),false);
  const inputs=[
    ...['bullet-indent','group','group-rot','pres-with-notes','master-slides','table-list'].map(n=>[`independent/libreoffice/${n}.pptx`,{}]),
    ...['c03-29','linn','skew'].map(n=>[`independent/ocrmypdf/${n}.pdf`,{}]),
    ...['native.pdf','scan.pdf','english.png','english.jpg','report.docx','book.epub','page.html','workbook.xlsx','legacy.xls','collection.zip'].map(n=>[`generated/${n}`,{}]),
    ['generated/arabic.png',{ocrLanguage:'ar'}],['orders.csv',{}],['customer.json',{}],['catalog.xml',{}]
  ];
  for(const [path,options] of inputs){
    const name=path.split('/').at(-1),data=(await readFile(`tests/fixtures/${path}`)).toString('base64');
    const result=await browser.evaluate(session,`(async()=>{const {WorkerPool}=await import('./lib/batch/worker-pool.js');const {detectFormat}=await import('./lib/formats.js');const bytes=Uint8Array.from(atob(${JSON.stringify(data)}),c=>c.charCodeAt(0));const name=${JSON.stringify(name)},pool=new WorkerPool(),started=performance.now();const r=await pool.run([{id:crypto.randomUUID(),name,size:bytes.length,format:detectFormat({name}).id,options:${JSON.stringify(options)}}],{load:async()=>bytes.buffer});return {...r[0],ms:performance.now()-started,reserved:pool.memory.reserved,offline:navigator.onLine===false};})()`);
    records.push({path,options,...result});
    await writeFile('tests/evidence/2026-10-05/offline-corpus.json',JSON.stringify({date:new Date().toISOString(),extension:process.env.MARKITDOWN_EXTENSION||'extension',mode:'Browser offline emulation, not physical disconnect',browser:await browser.command('Browser.getVersion'),records},null,2));
    console.log(`${path}: ${result.state}, ${Math.round(result.ms)} ms`);
    assert.equal(result.state,'done',JSON.stringify(result)); assert.equal(result.reserved,0);
    if(path.includes('ocrmypdf'))await writeFile(`tests/evidence/2026-10-05/${name}.observed.md`,result.output.markdown);
  }
} finally {browser.close();}
