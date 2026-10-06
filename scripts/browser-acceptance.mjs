import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { cpus, totalmem } from 'node:os';
import { browserHarness, waitFor } from './browser-harness.mjs';
import { MODELS } from '../extension/lib/ocr/model-catalogue.js';

const out = 'tests/evidence/2026-10-05';
await mkdir(out, { recursive: true });
const browser = await browserHarness();
const evidence = { date: new Date().toISOString(), mode: 'Isolated automated Chromium; not physical offline or native Chrome acceptance', device: { cpu: cpus()[0].model, ramBytes: totalmem() }, checks: [] };
const save = () => writeFile(`${out}/automated-acceptance.json`, JSON.stringify(evidence, null, 2));
try {
  evidence.browser = await browser.command('Browser.getVersion');
  console.log('Browser ready');
  const control = await browser.open();
  await waitFor(() => browser.evaluate(control.session, "document.querySelector('#drop-zone') !== null"), 'UI');
  const assets = await Promise.all(Object.entries(MODELS).map(async ([key, model]) => ({ url: model.url, data: (await readFile(`.browser-tests/models/${key}.bin`)).toString('base64') })));
  await browser.evaluate(control.session, `(async()=>{const {modelCache,prepareModels}=await import('./lib/ocr/model-cache.js');const original=modelCache.fetcher;const assets=${JSON.stringify(assets)};modelCache.fetcher=async url=>new Response(Uint8Array.from(atob(assets.find(a=>a.url===url).data),c=>c.charCodeAt(0)));try{await prepareModels('en');await prepareModels('ar');}finally{modelCache.fetcher=original;}})()`);
  console.log('Verified models cached');
  const scan = { name: 'chapter-openings-12.pdf', data: (await readFile('tests/fixtures/independent/gutenberg/chapter-openings-12.pdf')).toString('base64') };
  const csv = { name: 'orders.csv', data: (await readFile('tests/fixtures/orders.csv')).toString('base64') };
  async function start() {
    const id = await browser.evaluate(control.session, `(async()=>{const s=await import('./lib/storage.js');const b=await s.stageBatch(${JSON.stringify([csv, scan])}.map(f=>new File([Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))],f.name)),'auto');return b.id;})()`);
    await browser.evaluate(control.session, `(async()=>{const r=await chrome.runtime.sendMessage({target:'background',type:'START_BATCH',batchId:${JSON.stringify(id)}});if(!r.ok)throw Error(r.error.message);})()`);
    const target = await waitFor(async()=>(await browser.command('Target.getTargets')).targetInfos.find(t=>t.url.includes(`batch=${id}&processor=1`)),'processor');
    const page = { targetId: target.targetId, session: await browser.attach(target.targetId) };
    console.log(`Started ${id}`);
    return { ...page, id };
  }
  const batch = page => browser.evaluate(control.session, `(async()=>await(await import('./lib/storage.js')).read('batches',${JSON.stringify(page.id)}))()`);
  const active = page => waitFor(async()=>{const b=await batch(page);if(b.state==='done')throw Error(JSON.stringify(b));return b.jobs[0].state==='done' && /PDF page [2-9] of .*Recognizing/.test(b.jobs[1].stage||'') ? b : null;}, 'CSV done and real scan active', 120000);
  const finished = page => waitFor(async()=>{const b=await batch(page);return ['done','cancelled'].includes(b.state)?b:null;},'batch completion',180000);
  const outputs = page => browser.evaluate(control.session, `(async()=>{const s=await import('./lib/storage.js');const b=await s.read('batches',${JSON.stringify(page.id)});return Promise.all(b.jobs.map(j=>s.getOutput(j.id)));})()`);

  const cancel = await start();
  const beforeCancel = await active(cancel);
  await browser.evaluate(cancel.session, "document.querySelector('#cancel').click()");
  const cancelled = await finished(cancel);
  assert.equal(cancelled.jobs[1].state, 'cancelled');
  assert.equal(cancelled.jobs[0].state, 'done');
  assert.ok((await outputs(cancel))[0].markdown.includes('|'));
  evidence.checks.push({ name: 'Cancel real scan, retain completed CSV', before: beforeCancel, after: cancelled });
  await save(); console.log('Real scan cancellation passed');
  await browser.command('Target.closeTarget', { targetId: cancel.targetId });

  let recovery = await start();
  const beforeClose = await active(recovery);
  await browser.command('Target.closeTarget', { targetId: recovery.targetId });
  // Reopen the same durable batch. No page timestamp or job state manipulation.
  recovery = { ...await browser.open(`popup.html?batch=${recovery.id}&processor=1`), id: recovery.id };
  const recovered = await finished(recovery);
  assert.ok(recovered.jobs.every(j=>j.state==='done'),JSON.stringify(recovered));
  const recoveredOutputs = await outputs(recovery);
  const markdown = recoveredOutputs[1].markdown;
  assert.deepEqual([...markdown.matchAll(/^## Page (\d+)$/gm)].map(m=>+m[1]), Array.from({length:12},(_,i)=>i+1));
  assert.ok(markdown.split(/^## Page \d+$/m).slice(1).every(s=>s.trim().length>100));
  await writeFile(`${out}/recovered-real-12.md`, markdown);
  evidence.checks.push({ name: 'Close and reopen real scan; all twelve pages and CSV retained', before: beforeClose, after: recovered });
  await save(); console.log('Real scan recovery passed');
  await browser.command('Target.closeTarget', { targetId: recovery.targetId });

  const stopping = await start();
  await browser.command('ServiceWorker.enable', {}, control.session);
  const beforeStop = await active(stopping);
  const versions = browser.events.filter(e=>e.method==='ServiceWorker.workerVersionUpdated').flatMap(e=>e.params.versions);
  const worker = versions.findLast(v=>v.scriptURL===`${browser.base}/background.js` && v.runningStatus==='running');
  assert.ok(worker, 'Identify only the extension background worker');
  const eventStart = browser.events.length;
  await browser.command('ServiceWorker.stopWorker', { versionId: worker.versionId }, control.session);
  const stopped = await waitFor(()=>browser.events.slice(eventStart).filter(e=>e.method==='ServiceWorker.workerVersionUpdated').flatMap(e=>e.params.versions).find(v=>v.versionId===worker.versionId && v.runningStatus==='stopped'),'worker stopped');
  const afterStop = await waitFor(async()=>{const b=await batch(stopping);return b.jobs[1].stage!==beforeStop.jobs[1].stage || b.jobs[1].state==='done'?b:null;},'progress after background stop',120000);
  const completed = await finished(stopping);
  assert.ok(completed.jobs.every(j=>j.state==='done'), JSON.stringify(completed));
  assert.equal((await outputs(stopping))[1].markdown, markdown, 'Uninterrupted result matches recovered result');
  evidence.checks.push({ name: 'Stop only background service worker; conversion advances and completes', before: beforeStop, stopped, after: afterStop, completed });
  await save(); console.log('Background stop passed');
  await browser.command('Target.closeTarget', { targetId: stopping.targetId });
} catch (error) {
  evidence.failure = error.stack;
  await save();
  throw error;
} finally { browser.close(); }
