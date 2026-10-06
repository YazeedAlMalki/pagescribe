import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { browserHarness, waitFor } from './browser-harness.mjs';
import { phase2Fixtures, oversizedPdfImage } from '../tests/helpers/phase2-documents.js';
import { jpeg } from '../tests/helpers/documents.js';

const fixtureBytes = await phase2Fixtures();
const browser = await browserHarness();
const measurements = [], checks = [];
const normalize = value => value.normalize('NFKC').replace(/\s+/g, ' ').trim();
function distance(a, b) {
  let prior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 0; i < a.length; i++) { const next = [i + 1]; for (let j = 0; j < b.length; j++) next.push(Math.min(next[j] + 1, prior[j + 1] + 1, prior[j] + (a[i] === b[j] ? 0 : 1))); prior = next; }
  return prior[b.length];
}
try {
  const { session, targetId } = await browser.open();
  let offline = false;
  const workerSetupErrors = [];
  browser.onEvent(message => {
    if(message.method !== 'Target.attachedToTarget' || message.params.targetInfo.type !== 'worker') return;
    const child = message.params.sessionId;
    void (async()=> {
      try {
        await browser.command('Network.enable',{},child);
        // Chromium exposes some emulation/child-target commands only on page
        // targets. Its navigator connectivity state is inherited by workers.
        const optional = async (method,params) => {try{await browser.command(method,params,child);}catch(error){if(!error.message.includes('Not supported'))throw error;}};
        await optional('Network.emulateNetworkConditions',{offline,latency:0,downloadThroughput:-1,uploadThroughput:-1});
        await optional('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true});
      } catch(error) { workerSetupErrors.push(error.message); }
      finally { await browser.command('Runtime.runIfWaitingForDebugger',{},child).catch(()=>{}); }
    })();
  });
  await browser.command('Target.setAutoAttach',{autoAttach:true,waitForDebuggerOnStart:true,flatten:true},session);
  await waitFor(() => browser.evaluate(session, 'document.querySelectorAll("#file-type option").length === 14'), 'Phase 2 UI');
  await browser.evaluate(session, `globalThis.runConversion = async (name, encoded, options = {}, format) => {
    const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
    const { WorkerPool } = await import('./lib/batch/worker-pool.js');
    const { detectFormat } = await import('./lib/formats.js');
    const events = [], started = performance.now();
    const pool = new WorkerPool();
    const results = await pool.run([{id:crypto.randomUUID(),name,size:bytes.length,format:format||detectFormat({name}).id,options}], {load:async()=>bytes.buffer,onEvent:event=>events.push(event)});
    return {...results[0],ms:performance.now()-started,stages:events.filter(e=>e.stage).map(e=>e.stage),reserved:pool.memory.reserved};
  };`);
  const convert = async (name, options = {}, format, bytes = fixtureBytes[name]) => {
    const result = await browser.evaluate(session, `runConversion(${JSON.stringify(name)},${JSON.stringify(Buffer.from(bytes).toString('base64'))},${JSON.stringify(options)},${JSON.stringify(format)})`);
    assert.equal(result.reserved, 0);
    console.log(`${name} (${JSON.stringify(options)}): ${result.state}, ${Math.round(result.ms)} ms${result.error ? ` ${JSON.stringify(result.error)}` : ''}`);
    measurements.push({ name, options, ...result });
    return result;
  };
  const native = await convert('native.pdf');
  assert.equal(native.state, 'done'); assert.match(native.output.markdown, /Page 2/);
  assert.equal((await browser.evaluate(session, `(async()=> (await (await import('./lib/ocr/model-cache.js')).modelCache.stats()).length)()`)), 0);
  checks.push('Native PDF succeeds with empty model cache');
  const seedModels = async () => {
    const { MODELS } = await import('../extension/lib/ocr/model-catalogue.js');
    const assets = [];
    for (const [key, model] of Object.entries(MODELS)) assets.push({url:model.url,data:(await readFile(`.browser-tests/models/${key}.bin`)).toString('base64')});
    await browser.evaluate(session, `(async()=>{
      const {modelCache,prepareModels}=await import('./lib/ocr/model-cache.js');const original=modelCache.fetcher;
      const assets=${JSON.stringify(assets)};modelCache.fetcher=async url=>{const asset=assets.find(a=>a.url===url);if(!asset)throw Error('Unpinned model');return new Response(Uint8Array.from(atob(asset.data),c=>c.charCodeAt(0)));};
      try {await prepareModels('en');await prepareModels('ar');}finally{modelCache.fetcher=original;}
    })()`);
  };
  if(process.env.MARKITDOWN_MODEL_FIXTURES==='1') {await seedModels(); checks.push('Repeatable suite uses verified model fixture downloads; external first-download evidence is in ocr-experiment.json');}
  const pptx = await convert('slides.pptx'); assert.equal(pptx.state, 'done'); assert.match(pptx.output.markdown, /Speaker notes/);
  const independentDeck=await convert('showcase.pptx',{},undefined,await readFile('tests/fixtures/independent/showcase.pptx'));
  assert.equal(independentDeck.state,'done');assert.match(independentDeck.output.markdown,/Opening Keynote/);
  const exif = await convert('camera.jpg', {}, 'exif', jpeg()); assert.equal(exif.state, 'done'); assert.match(exif.output.markdown, /Fixture Camera/);
  for (const name of ['english.png', 'english.jpg', 'arabic.png']) {
    const ar = name.startsWith('arabic'), expected = ar ? 'مرحبا بكم في الرياض' : 'Local document conversion 2026';
    const result = await convert(name, { ocrLanguage: ar ? 'ar' : 'en' });
    assert.equal(result.state, 'done');
    const actual = normalize(result.output.markdown), edits = distance(expected, actual), cer = edits / expected.length;
    Object.assign(measurements.at(-1), { expected, actual, edits, cer });
    assert.ok(cer <= 0.15, JSON.stringify({ expected, actual, cer }));
  }
  checks.push('Actual English PNG/JPEG and Arabic PNG OCR measured against known text');
  const rotated = await convert('rotated.png', { ocrRotation: 270 }); assert.equal(rotated.state, 'done'); assert.match(rotated.output.markdown, /Local/);
  const blank = await convert('blank.png'); assert.equal(blank.state, 'done'); assert.ok(blank.output.warnings.some(w=>w.includes('Blank')));
  const badImage = await convert('bad.png', {}, undefined, Buffer.from('broken')); assert.equal(badImage.error.code, 'INVALID_IMAGE');
  const mixed = await convert('mixed.pdf'); assert.equal(mixed.state, 'done'); assert.match(mixed.output.markdown, /Searchable page 1[\s\S]*## Page 2[\s\S]*Local[\s\S]*## Page 3/);
  assert.ok(mixed.stages.some(stage=>stage.includes('page 2 of 3')));
  const layer = await convert('text-layer.pdf'); assert.equal(layer.state, 'done'); assert.ok(!layer.output.markdown.includes('Local')); assert.ok(!layer.stages.some(stage=>stage.includes('Recognizing')));
  const force = await convert('text-layer.pdf', {pdfForceOcr:true}); assert.equal(force.state, 'done'); assert.match(force.output.markdown, /Local/);
  const scan = await convert('scan.pdf'); assert.equal(scan.state, 'done'); assert.match(scan.output.markdown, /Local/);
  const archive = await convert('phase2.zip'); assert.equal(archive.state, 'done'); for(const text of ['Page 2','Slide 2','Local']) assert.ok(archive.output.markdown.includes(text));
  for(const name of ['protected.pdf','corrupt.pdf']) assert.equal((await convert(name)).state, 'error');
  assert.equal((await convert('oversized-image.pdf',{},undefined,await oversizedPdfImage())).error.code,'PDF_LIMIT');
  checks.push('Per-page native/scanned/blank fallback, no duplicate OCR layer, force OCR, ZIP reuse, protected/corrupt errors');

  // Use Chromium's print engine as an independent native Arabic/mixed PDF producer.
  const printed = await browser.command('Target.createTarget', {url:'about:blank'});
  const printSession = await browser.attach(printed.targetId);
  await browser.evaluate(printSession, `document.body.innerHTML='<div style="font:32px Arial;direction:rtl">مرحبا بكم في الرياض</div><p style="font:24px Arial">English 2026</p>'; document.fonts.ready`);
  const printedPdf = await browser.command('Page.printToPDF', {printBackground:true,displayHeaderFooter:false}, printSession);
  await writeFile('tests/fixtures/generated/arabic-native.pdf', Buffer.from(printedPdf.data,'base64'));
  const arPdf = await convert('arabic-native.pdf', {}, undefined, Buffer.from(printedPdf.data,'base64'));
  // Chromium's local Arial text map uses Arabic presentation forms and a
  // Persian-yeh glyph mapping. Compare their readable equivalents only here;
  // the converter preserves the document's original Unicode mapping.
  assert.equal(arPdf.state,'done'); assert.match(normalize(arPdf.output.markdown).replace(/ی/g,'ي'),/مرحبا بكم في الرياض/); assert.match(arPdf.output.markdown,/English 2026/);
  checks.push('Independent Chromium-produced Arabic and mixed native PDF');
  await browser.command('Target.closeTarget',{targetId:printed.targetId});

  await browser.command('Network.enable', {}, session);
  offline = true;
  await browser.command('Network.emulateNetworkConditions', {offline:true,latency:0,downloadThroughput:-1,uploadThroughput:-1}, session);
  assert.equal((await convert('english.png')).state, 'done');
  assert.equal((await convert('arabic.png',{ocrLanguage:'ar'})).state,'done');
  assert.equal((await convert('phase2.zip')).state,'done');
  assert.equal((await convert('scan.pdf')).state,'done');
  const offlineFetch = await browser.evaluate(session, `fetch('https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/LICENSE',{cache:'no-store'}).then(()=>false,()=>true)`);
  assert.equal(offlineFetch, true, 'offline emulation must actually block network');
  await browser.evaluate(session, `(async()=> { const {clearCache}=await import('./lib/storage.js'); await clearCache(); if((await (await import('./lib/ocr/model-cache.js')).modelCache.stats()).length!==5) throw Error('Results clear removed models'); })()`);
  await browser.evaluate(session, `(async()=> { const db=await new Promise((resolve,reject)=>{const req=indexedDB.open('markitdown-models-v1',1);req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);}); await new Promise((resolve,reject)=>{const tx=db.transaction('models','readwrite'),s=tx.objectStore('models'),q=s.getAll();q.onsuccess=()=>q.result.forEach(r=>s.put({...r,createdAt:Date.now()-25*3600000}));tx.oncomplete=resolve;tx.onerror=reject;});db.close(); })()`);
  const unavailable = await convert('english.png'); assert.equal(unavailable.state,'error'); assert.equal(unavailable.error.code,'MODEL_UNAVAILABLE');
  assert.equal((await convert('native.pdf')).state,'done');
  checks.push('Fresh-worker offline reuse; expired models fail offline; native PDF remains available; clearing results keeps models');
  offline = false;
  await browser.command('Network.emulateNetworkConditions', {offline:false,latency:0,downloadThroughput:-1,uploadThroughput:-1}, session);
  if(process.env.MARKITDOWN_MODEL_FIXTURES==='1') await seedModels();
  assert.equal((await convert('english.png')).state,'done');

  const cancelBytes=Buffer.from(fixtureBytes['english.png']).toString('base64');
  for(const cancelStage of ['Preparing OCR models','Recognizing text locally']) {
    const cancelled=await browser.evaluate(session, `(async()=>{const {WorkerPool}=await import('./lib/batch/worker-pool.js');const controller=new AbortController(),pool=new WorkerPool();
      const data=Uint8Array.from(atob(${JSON.stringify(cancelBytes)}),c=>c.charCodeAt(0));
      const result=await pool.run([{id:'cancel',name:'english.png',format:'image',size:data.length,options:{ocrLanguage:'en'}}],{load:async()=>data.buffer,signal:controller.signal,onEvent:event=>{if(event.stage===${JSON.stringify(cancelStage)})controller.abort();}});
      return {state:result[0].state,reserved:pool.memory.reserved};})()`);
    assert.deepEqual(cancelled,{state:'cancelled',reserved:0});
  }
  assert.equal((await convert('english.png')).state,'done');
  checks.push('Real workers cancel during model preparation and recognition, release reservations, and retry');

  // Durable mixed batch; popup closure and changed settings cannot change saved jobs.
  const files = ['native.pdf','slides.pptx','english.png','phase2.zip'].map(name=>({name,data:Buffer.from(fixtureBytes[name]).toString('base64')}));
  const batchId = await browser.evaluate(session, `(async()=> {
    const settings=await import('./lib/settings-store.js');await settings.saveSettings({...await settings.getSettings(),ocrLanguage:'en'});
    const storage=await import('./lib/storage.js'); const files=${JSON.stringify(files)}.map(f=>new File([Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))],f.name));
    const batch=await storage.stageBatch(files,'auto');await settings.saveSettings({...await settings.getSettings(),ocrLanguage:'ar'});
    const started=await chrome.runtime.sendMessage({target:'background',type:'START_BATCH',batchId:batch.id});if(!started.ok)throw Error(started.error.message);return batch.id;
  })()`);
  await browser.command('Target.closeTarget',{targetId});
  const processorTarget = await waitFor(async()=>(await browser.command('Target.getTargets')).targetInfos.find(t=>t.url.includes(`batch=${batchId}`)), 'batch processor');
  const processor = await browser.attach(processorTarget.targetId);
  const batch = await waitFor(()=>browser.evaluate(processor, `(async()=>{const b=await(await import('./lib/storage.js')).read('batches',${JSON.stringify(batchId)});return b?.state==='done'?b:null;})()`),'durable batch',120_000);
  assert.ok(batch.jobs.every(job=>job.state==='done'&&job.options.ocrLanguage==='en'),JSON.stringify(batch));
  checks.push('Mixed new formats survive popup closure and preserve settings snapshot');
  const settingsPage=await browser.open('settings.html');
  await waitFor(()=>browser.evaluate(settingsPage.session,'document.querySelector("#model-status")?.textContent.includes("model assets cached")'),'model settings ready');
  assert.equal(await browser.evaluate(settingsPage.session,'document.querySelector("#ocr-language").value'),'ar');
  await browser.command('Emulation.setDeviceMetricsOverride',{width:900,height:1100,deviceScaleFactor:1,mobile:false},settingsPage.session);
  const settingsShot=await browser.command('Page.captureScreenshot',{format:'png',captureBeyondViewport:true},settingsPage.session);
  await writeFile('.browser-tests/settings-phase2.png',Buffer.from(settingsShot.data,'base64'));
  await browser.evaluate(settingsPage.session,'document.querySelector("#clear-models").click()');
  await waitFor(()=>browser.evaluate(settingsPage.session,'document.querySelector("#notice").textContent.startsWith("OCR models cleared")'),'clear model action');
  assert.ok(await browser.evaluate(settingsPage.session,`(async()=>{const outputs=await(await import('./lib/storage.js')).list('outputs');const models=await(await import('./lib/ocr/model-cache.js')).modelCache.stats();return outputs.length>=4&&models.length===0;})()`));
  checks.push('Settings language persists; clear-models UI leaves conversion results available');
  assert.deepEqual(workerSetupErrors,[]);
  const {MODELS}=await import('../extension/lib/ocr/model-catalogue.js');
  const allowed=new Set(Object.values(MODELS).map(m=>m.url));
  allowed.add('https://raw.githubusercontent.com/PT-Perkasa-Pilar-Utama/ppu-paddle-ocr-models/main/LICENSE');
  const network=browser.events.filter(e=>e.method==='Network.requestWillBeSent').map(e=>e.params.request).filter(r=>/^https?:/.test(r.url));
  assert.ok(network.every(r=>allowed.has(r.url)&&r.method==='GET'&&!r.postData),JSON.stringify(network));
  checks.push('Network instrumentation: only pinned model GETs and explicit test connectivity probe; no document uploads or remote executable requests');
  await writeFile('.browser-tests/phase2-results.json', JSON.stringify({version:'0.3.0',date:'2026-10-04',extension:process.env.MARKITDOWN_EXTENSION||'extension',device:{cpu:cpus()[0]?.model,logicalCpus:cpus().length,ramBytes:totalmem()},checks,measurements},null,2));
  console.log(`Phase 2 Edge MV3: ${checks.length} acceptance groups passed.`);
} finally {browser.close();}
