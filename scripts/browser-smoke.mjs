// Optional real-browser smoke test. Requires local Microsoft Edge on Windows.
// Uses an isolated profile, built-in Node APIs, and no third-party test packages.
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import assert from 'node:assert/strict';
import { phase1Fixtures } from '../tests/helpers/documents.js';

const artifactRoot = resolve('.browser-tests');
await mkdir(artifactRoot, { recursive: true });
const profile = await mkdtemp(join(artifactRoot, 'profile-'));
const executable = process.env.MARKITDOWN_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const extension = resolve(process.env.MARKITDOWN_EXTENSION || 'extension');
const fixtures = Object.entries(await phase1Fixtures()).map(([name, bytes]) => ({ name, base64: Buffer.from(bytes).toString('base64') }));
const browser = spawn(executable, [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu',
  '--remote-debugging-port=0', '--remote-allow-origins=http://localhost',
  `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'
], { windowsHide: true, stdio: 'ignore' });
let launchError;
browser.on('error', error => { launchError = error; });
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitFor(fn, label, timeout = 15_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (launchError) throw launchError;
    const value = await fn();
    if (value) return value;
    await sleep(100);
  }
  throw new Error(`Timed out: ${label}`);
}
let socket;
try {
  const portFile = await waitFor(async () => readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => null), 'browser debugger');
  const [port, path] = portFile.trim().split(/\r?\n/);
  socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
  await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
  let nextId = 0;
  const pending = new Map(), exceptions = [];
  socket.onmessage = event => {
    const message = JSON.parse(event.data);
    if (message.id) {
      const entry = pending.get(message.id);
      if (entry) { pending.delete(message.id); message.error ? entry.reject(new Error(JSON.stringify(message.error))) : entry.resolve(message.result); }
    } else if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
  };
  const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = ++nextId;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 20_000);
    pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
    socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
  });
  const evaluate = async (session, expression) => {
    const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, session);
    if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
    return value.result.value;
  };
  const attach = async targetId => {
    const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true });
    await command('Runtime.enable', {}, sessionId);
    return sessionId;
  };
  const service = await waitFor(async () => (await command('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url.endsWith('/background.js')), 'extension service worker');
  const base = new URL(service.url).origin;
  // URL.origin is "null" for extension URLs in Node; derive its scheme/host.
  const extensionBase = base === 'null' ? service.url.replace(/\/background.js$/, '') : base;
  const { targetId } = await command('Target.createTarget', { url: `${extensionBase}/popup.html` });
  const popup = await attach(targetId);
  await waitFor(() => evaluate(popup, 'document.querySelectorAll("#file-type option").length === 14'), 'popup ready');
  assert.equal(await evaluate(popup, 'chrome.runtime.getManifest().permissions.join(",")'), 'storage');
  await evaluate(popup, `(async () => {
    const files = [
      new File(['name,amount\\nTea,2'], 'orders.csv', {type:'text/csv'}),
      new File(['{"ok":true}'], 'data.json', {type:'application/json'}),
      new File(['<root>مرحبا</root>'], 'data.xml', {type:'application/xml'}),
      new File(['x,y\\n1,2'], 'second.csv', {type:'text/csv'}),
      new File(['[1,2,3]'], 'second.json', {type:'application/json'}),
      ...${JSON.stringify(fixtures)}.map(file => new File([Uint8Array.from(atob(file.base64), char => char.charCodeAt(0))], file.name)),
      new File(['{broken'], 'invalid.json', {type:'application/json'}),
      new File(['corrupt'], 'bad.xlsx'), new File(['unsupported'], 'slides.pptx')
    ];
    const selection = new DataTransfer();
    files.forEach(file => selection.items.add(file));
    document.querySelector('#file-input').files = selection.files;
    document.querySelector('#file-input').dispatchEvent(new Event('change', {bubbles:true}));
  })()`);
  const batchId = await waitFor(() => evaluate(popup, '(async () => (await chrome.storage.local.get("lastBatchId")).lastBatchId)()'), 'file picker starts batch');
  // Closing the popup context must not interrupt the processing tab.
  await command('Target.closeTarget', { targetId });
  const processorTarget = await waitFor(async () => (await command('Target.getTargets')).targetInfos.find(target => target.url.includes(`batch=${batchId}`)), 'processor tab');
  const processor = await attach(processorTarget.targetId);
  const batchExpression = `(async () => (await import('./lib/storage.js')).read('batches', ${JSON.stringify(batchId)}))()`;
  const batch = await waitFor(async () => { const batch = await evaluate(processor, batchExpression); return batch?.state === 'done' ? batch : null; }, 'batch complete');
  assert.deepEqual(batch.jobs.map(job => job.state), [...Array(12).fill('done'), 'error', 'error', 'error'], JSON.stringify(batch.jobs.map(job => ({ name: job.name, error: job.error }))));
  assert.equal(batch.jobs[12].error.code, 'INVALID_JSON');
  assert.equal(batch.jobs[13].error.code, 'INVALID_SPREADSHEET');
  assert.equal(batch.jobs[14].error.code, 'UNSAFE_ARCHIVE');
  const actualOutputs = await evaluate(processor, `(async () => (await (await import('./lib/storage.js')).list('outputs')).map(item => ({name:item.name, markdown:item.markdown})))()`);
  const expected = { 'page.html': '# Project notes', 'workbook.xlsx': '## Orders', 'legacy.xls': '## Locations', 'report.docx': '# Quarterly report', 'book.epub': 'First chapter', 'collection.zip': 'items.csv', 'camera.jpg': 'No text recognized' };
  for (const [name, content] of Object.entries(expected)) assert.ok(actualOutputs.find(item => item.name === name)?.markdown.includes(content), `${name}: expected ${content}`);
  const inputCount = await evaluate(processor, `(async () => (await (await import('./lib/storage.js')).list('inputs')).length)()`);
  assert.equal(inputCount, 0, 'all completed source blobs released');
  await waitFor(() => evaluate(processor, 'document.querySelector("#output").value.includes("Tea")'), 'preview rendered');
  await command('Emulation.setDeviceMetricsOverride', { width: 900, height: 1000, deviceScaleFactor: 1, mobile: false }, processor);
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true }, processor);
  await writeFile(join(artifactRoot, 'processor.png'), Buffer.from(shot.data, 'base64'));

  const downloads = join(profile, 'test-downloads');
  await mkdir(downloads);
  await command('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });
  await evaluate(processor, 'document.querySelector("#download-toggle").click(); document.querySelector("#download-open").click();');
  const saved = await waitFor(async () => readFile(join(downloads, 'orders.md'), 'utf8').catch(() => null), 'Markdown download');
  assert.ok(saved.includes('| Tea | 2 |'));
  const viewerTarget = await waitFor(async () => (await command('Target.getTargets')).targetInfos.find(target => target.url.includes(`/viewer.html?id=${batch.jobs[0].id}`)), 'Download & Open preview');
  const viewer = await attach(viewerTarget.targetId);
  await waitFor(() => evaluate(viewer, 'document.querySelector("#output")?.textContent.includes("Tea")'), 'viewer rendered');
  assert.equal(await evaluate(viewer, 'document.querySelector("#output script") === null'), true);
  await command('Page.bringToFront', {}, viewer);
  await evaluate(viewer, 'document.querySelector("#copy").click()');
  await waitFor(() => evaluate(viewer, 'document.querySelector("#notice").textContent === "Markdown copied."'), 'clipboard write');
  // Exercise persisted directory handles and collision-safe writes in an
  // isolated origin-private directory; native folder-picker dialogs stay manual.
  await evaluate(viewer, `(async () => {
    const store = await import('./lib/storage.js');
    const output = await store.getOutput(${JSON.stringify(batch.jobs[0].id)});
    const directory = await (await navigator.storage.getDirectory()).getDirectoryHandle('test-output', {create:true});
    await store.put('preferences', {id:'downloadDirectory', handle:directory});
    const {downloadOutput} = await import('./lib/delivery.js');
    await downloadOutput(output); await downloadOutput(output);
    const first = await (await directory.getFileHandle('orders.md')).getFile();
    const second = await (await directory.getFileHandle('orders (2).md')).getFile();
    if (await first.text() !== output.markdown || await second.text() !== output.markdown) throw new Error('Folder output mismatch');
    await store.remove('preferences', 'downloadDirectory');
  })()`);

  const settingsTarget = await command('Target.createTarget', { url: `${extensionBase}/settings.html` });
  const settings = await attach(settingsTarget.targetId);
  await waitFor(() => evaluate(settings, 'document.querySelector("#cache-status")?.textContent.includes("12 cached")'), 'cache stats');
  assert.equal(await evaluate(settings, 'document.querySelector("#cache-hours").value'), '24');
  await evaluate(settings, 'document.querySelector("#cache-hours").value = "1"; document.querySelector("#settings-form").requestSubmit();');
  await waitFor(() => evaluate(settings, 'document.querySelector("#notice").textContent === "Settings saved."'), 'settings saved');
  assert.equal(await evaluate(settings, '(async () => (await chrome.storage.local.get("settings")).settings.cacheHours)()'), 1);
  await evaluate(settings, `(async () => {
    const store = await import('./lib/storage.js');
    const output = await store.read('outputs', ${JSON.stringify(batch.jobs[0].id)});
    output.createdAt = Date.now() - 7_200_000;
    await store.put('outputs', output);
    if (await store.getOutput(output.id)) throw new Error('Expired cache still accessible');
  })()`);
  await evaluate(settings, 'document.querySelector("#clear-cache").click()');
  await waitFor(() => evaluate(settings, 'document.querySelector("#cache-status").textContent.includes("0 cached")'), 'clear cache');
  await evaluate(processor, `(() => {
    const data = new DataTransfer(); data.items.add(new File(['a,b\\n3,4'], 'dropped.csv', {type:'text/csv'}));
    document.querySelector('#drop-zone').dispatchEvent(new DragEvent('drop', {bubbles:true, dataTransfer:data}));
  })()`);
  const droppedBatch = await waitFor(async () => {
    const id = await evaluate(processor, '(async () => (await chrome.storage.local.get("lastBatchId")).lastBatchId)()');
    return id !== batchId ? id : null;
  }, 'drag-drop starts new batch');
  await waitFor(async () => {
    const result = await evaluate(processor, `(async () => (await import('./lib/storage.js')).read('batches', ${JSON.stringify(droppedBatch)}))()`);
    return result?.state === 'done' && result.jobs[0].state === 'done';
  }, 'drag-drop conversion');
  const recoveryId = await evaluate(settings, `(async () => {
    const store = await import('./lib/storage.js');
    const batch = await store.stageBatch([new File(['a,b\\n1,2'], 'finished.csv'), new File(['{"resumed":true}'], 'pending.json')], 'auto');
    await store.updateBatch(batch.id, record => { record.state='queued'; record.jobs[0].format='csv'; record.jobs[1].format='json'; });
    await store.finishJob(batch.id, {id:batch.jobs[0].id, state:'done', output:{markdown:'Already completed sentinel',warnings:[]}});
    return batch.id;
  })()`);
  const delayed = await command('Target.createTarget', {url:'about:blank'});
  const delayedSession = await attach(delayed.targetId);
  await command('Page.enable', {}, delayedSession);
  await command('Page.addScriptToEvaluateOnNewDocument', {source:`
    globalThis.__delayedWorker = true;
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      postMessage(...args) { setTimeout(() => super.postMessage(...args), 10000); }
    };
  `}, delayedSession);
  await command('Page.navigate', {url:`${extensionBase}/popup.html?batch=${recoveryId}&processor=1`}, delayedSession);
  await waitFor(async () => {
    const value = await evaluate(settings, `(async () => (await import('./lib/storage.js')).read('batches', ${JSON.stringify(recoveryId)}))()`);
    return value?.jobs[1].state === 'running';
  }, 'in-flight job persisted').catch(async error => {
    console.error('Recovery diagnostic:', await evaluate(settings, `(async () => ({batch:await (await import('./lib/storage.js')).read('batches',${JSON.stringify(recoveryId)}),locks:await navigator.locks.query()}))()`));
    console.error('Recovery page:', await evaluate(delayedSession, 'document.body.innerText'));
    console.error('Browser exceptions:', JSON.stringify(exceptions));
    throw error;
  });
  await command('Target.closeTarget', {targetId:delayed.targetId});
  await evaluate(settings, `chrome.runtime.sendMessage({target:'background',type:'START_BATCH',batchId:${JSON.stringify(recoveryId)}})`);
  await waitFor(async () => {
    const value = await evaluate(settings, `(async () => (await import('./lib/storage.js')).read('batches', ${JSON.stringify(recoveryId)}))()`);
    return value?.state === 'done' && value.jobs.every(job => job.state === 'done');
  }, 'interrupted tab recovery');
  await evaluate(settings, `(async () => {
    const store = await import('./lib/storage.js');
    const batch = await store.read('batches',${JSON.stringify(recoveryId)});
    if ((await store.getOutput(batch.jobs[0].id)).markdown !== 'Already completed sentinel') throw new Error('Completed job was rerun');
    const staged = await store.stageBatch([new File(['x,y\\n3,4'], 'observer.csv')], 'csv');
    await store.updateBatch(staged.id, record => {record.state='queued';record.jobs[0].format='csv';});
    await (await import('./lib/batch/runner.js')).runBatch(staged.id, {onEvent:() => {throw new Error('UI observer closed');}});
    if (!(await store.getOutput(staged.jobs[0].id))) throw new Error('UI observer failure lost persisted output');
  })()`);
  assert.deepEqual(exceptions, [], 'no unhandled browser exceptions');
  console.log('PASS: real MV3 regression routes (JPEG now uses automatic OCR), mixed errors, picker/drop, popup-close survival, source cleanup, clipboard, file download, directory writes without overwrite, preview, settings, cache TTL/clear, interrupted-tab recovery and observer failure.');
  console.log(`Screenshot: ${join(artifactRoot, 'processor.png')}`);
  await command('Browser.close');
} finally {
  socket?.close();
  browser.kill();
}
