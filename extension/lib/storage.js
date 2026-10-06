import { LIMITS } from './limits.js';
import { getSettings } from './settings-store.js';

let databasePromise;
function database() {
  databasePromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('markitdown-phase1', 1);
    request.onupgradeneeded = () => {
      for (const name of ['batches', 'inputs', 'outputs', 'preferences']) {
        request.result.createObjectStore(name, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { databasePromise = undefined; reject(request.error); };
  });
  return databasePromise;
}

async function transact(names, mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(names, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Local storage transaction failed.'));
    try { operation(tx, value => { result = value; }); }
    catch (error) { tx.abort(); reject(error); }
  });
}

export const read = (store, id) => transact([store], 'readonly', (tx, done) => {
  const req = tx.objectStore(store).get(id);
  req.onsuccess = () => done(req.result);
});
export const list = store => transact([store], 'readonly', (tx, done) => {
  const req = tx.objectStore(store).getAll();
  req.onsuccess = () => done(req.result);
});
export const put = (store, value) => transact([store], 'readwrite', tx => { tx.objectStore(store).put(value); });
export const remove = (store, id) => transact([store], 'readwrite', tx => { tx.objectStore(store).delete(id); });

export async function stageBatch(files, override) {
  const now = Date.now();
  const options = await getSettings();
  const batch = { id: crypto.randomUUID(), createdAt: now, updatedAt: now, state: 'staged', override,
    jobs: files.map(file => ({ id: crypto.randomUUID(), name: file.name, type: file.type, size: file.size, options, state: 'queued' })) };
  await transact(['batches', 'inputs'], 'readwrite', tx => {
    tx.objectStore('batches').put(batch);
    batch.jobs.forEach((job, i) => tx.objectStore('inputs').put({ id: job.id, batchId: batch.id, blob: files[i] }));
  });
  return batch;
}

export async function updateBatch(id, change) {
  return transact(['batches'], 'readwrite', (tx, done) => {
    const store = tx.objectStore('batches');
    const req = store.get(id);
    req.onsuccess = () => {
      if (!req.result) { done(undefined); return; }
      const batch = req.result;
      change(batch);
      batch.updatedAt = Date.now();
      store.put(batch);
      done(batch);
    };
  });
}

export async function finishJob(batchId, result) {
  // Output, job status and input deletion commit atomically. A reload can
  // resume unfinished work without losing an input between transactions.
  return transact(['batches', 'inputs', 'outputs'], 'readwrite', tx => {
    const req = tx.objectStore('batches').get(batchId);
    req.onsuccess = () => {
      const batch = req.result;
      if (!batch) return;
      const job = batch.jobs.find(item => item.id === result.id);
      if (!job) return;
      job.state = result.state;
      job.error = result.error;
      job.warnings = result.output?.warnings || [];
      if (result.state === 'done') {
        tx.objectStore('outputs').put({ id: job.id, batchId, name: job.name, createdAt: Date.now(),
          markdown: result.output.markdown, bytes: new TextEncoder().encode(result.output.markdown).byteLength });
      }
      tx.objectStore('inputs').delete(job.id);
      batch.updatedAt = Date.now();
      tx.objectStore('batches').put(batch);
    };
  });
}

export async function getOutput(id) {
  const [output, settings] = await Promise.all([read('outputs', id), getSettings()]);
  if (output && output.createdAt + settings.cacheHours * 3_600_000 <= Date.now()) {
    await remove('outputs', id);
    return undefined;
  }
  return output;
}

export async function pruneCache() {
  const { cacheHours } = await getSettings();
  const cutoff = Date.now() - cacheHours * 3_600_000;
  await transact(['outputs', 'inputs', 'batches'], 'readwrite', tx => {
    const outputs = tx.objectStore('outputs');
    const req = outputs.getAll();
    req.onsuccess = () => {
      const entries = req.result.sort((a, b) => b.createdAt - a.createdAt);
      let retained = 0;
      for (const output of entries) {
        if (output.createdAt <= cutoff || retained + output.bytes > LIMITS.cacheBytes) outputs.delete(output.id);
        else retained += output.bytes;
      }
    };
    const batches = tx.objectStore('batches');
    const pending = batches.getAll();
    pending.onsuccess = () => {
      for (const batch of pending.result) {
        // Abandoned inputs/metadata have a fixed 24-hour recovery window.
        if (batch.updatedAt < Date.now() - 86_400_000) {
          for (const job of batch.jobs) tx.objectStore('inputs').delete(job.id);
          batches.delete(batch.id);
        }
      }
    };
  });
}

export const clearCache = () => transact(['outputs'], 'readwrite', tx => { tx.objectStore('outputs').clear(); });
export async function cacheStats() {
  await pruneCache();
  const outputs = await list('outputs');
  return { count: outputs.length, bytes: outputs.reduce((sum, output) => sum + output.bytes, 0) };
}
