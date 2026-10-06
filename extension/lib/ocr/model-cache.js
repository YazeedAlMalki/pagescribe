import { MODELS, MODEL_BUDGET, modelSet } from './model-catalogue.js';
import { ConversionError } from '../errors.js';

let dbPromise;
function database() {
  return dbPromise ??= new Promise((resolve, reject) => {
    const request = indexedDB.open('markitdown-models-v1', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('models', { keyPath: 'id' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => { dbPromise = undefined; reject(request.error); };
  });
}
async function transaction(mode, operation) {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('models', mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = tx.onabort = () => reject(tx.error || new Error('Model storage failed.'));
    const request = operation(tx.objectStore('models'));
    if (request) request.onsuccess = () => { result = request.result; };
  });
}
const storage = {
  get: id => transaction('readonly', store => store.get(id)),
  all: () => transaction('readonly', store => store.getAll()),
  put: record => transaction('readwrite', store => store.put(record)),
  delete: id => transaction('readwrite', store => store.delete(id)),
  clear: () => transaction('readwrite', store => store.clear())
};
export async function sha256(buffer) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', buffer)), byte => byte.toString(16).padStart(2, '0')).join('');
}

export class ModelCache {
  constructor({ store = storage, fetcher = (...args) => fetch(...args), lock = (fn, signal) => navigator.locks.request('markitdown-model-cache-v1', { signal }, fn), now = Date.now, budget = MODEL_BUDGET } = {}) {
    this.store = store; this.fetcher = fetcher; this.lock = lock; this.now = now; this.budget = budget;
  }
  async pruneUnlocked(hours) {
    const records = (await this.store.all()).sort((a, b) => b.createdAt - a.createdAt);
    let retained = 0;
    for (const record of records) {
      if (record.createdAt + hours * 3_600_000 <= this.now() || !Object.values(MODELS).some(model => model.id === record.id) || retained + record.bytes > this.budget) await this.store.delete(record.id);
      else retained += record.bytes;
    }
  }
  prune(hours = 24) { return this.lock(() => this.pruneUnlocked(hours)); }
  clear() { return this.lock(() => this.store.clear()); }
  stats(hours = 24) {
    return this.lock(async () => {
      await this.pruneUnlocked(hours);
      return (await this.store.all()).map(({ data, ...metadata }) => metadata);
    });
  }
  async get(model, { hours = 24, signal, report = () => {} } = {}) {
    return this.lock(async () => {
      signal?.throwIfAborted();
      await this.pruneUnlocked(hours);
      const record = await this.store.get(model.id);
      if (record && record.sha256 === model.sha256 && record.bytes === model.bytes && record.data?.byteLength === model.bytes && await sha256(record.data) === model.sha256) {
        report(`Using cached ${model.language} model`);
        return record.data;
      }
      if (record) await this.store.delete(model.id);
      if (globalThis.navigator?.onLine === false) throw new ConversionError('MODEL_UNAVAILABLE', 'OCR model is missing or expired while offline. Reconnect and retry; native document conversion remains available.');
      if (model.bytes > this.budget) throw new ConversionError('MODEL_BUDGET', 'OCR model exceeds the 64 MiB model-cache budget.');
      let response, buffer;
      try {
        report(`Downloading ${model.language} model (${(model.bytes / 1048576).toFixed(2)} MiB)`);
        response = await this.fetcher(model.url, { signal, credentials: 'omit', referrerPolicy: 'no-referrer', redirect: 'error', cache: 'no-store' });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const reader = response.body.getReader(), chunks = [];
        let total = 0;
        try {
          while (true) {
            signal?.throwIfAborted();
            const { done, value } = await reader.read();
            if (done) break;
            total += value.byteLength;
            if (total > model.bytes) throw new ConversionError('MODEL_INTEGRITY', 'Model download exceeds its verified size.');
            chunks.push(value);
            report(`Preparing ${model.language} model: ${Math.floor(total / model.bytes * 100)}% downloaded`);
          }
        } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
        const bytes = new Uint8Array(total);
        let offset = 0;
        for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
        buffer = bytes.buffer;
      } catch (error) {
        if (signal?.aborted) throw signal.reason;
        if (error instanceof ConversionError) throw error;
        throw new ConversionError('MODEL_UNAVAILABLE', `OCR model is missing or expired and could not be downloaded (${error.message}). Connect to the internet and retry; native document conversion remains available.`);
      }
      if (buffer.byteLength !== model.bytes || await sha256(buffer) !== model.sha256) throw new ConversionError('MODEL_INTEGRITY', 'OCR model failed its SHA-256 integrity check. Nothing was cached. Retry the download.');
      signal?.throwIfAborted();
      let used = (await this.store.all()).reduce((sum, item) => sum + item.bytes, 0);
      for (const item of (await this.store.all()).sort((a, b) => a.createdAt - b.createdAt)) {
        if (used + model.bytes <= this.budget) break;
        await this.store.delete(item.id); used -= item.bytes;
      }
      try { await this.store.put({ ...model, createdAt: this.now(), verifiedAt: this.now(), data: buffer }); }
      catch { throw new ConversionError('MODEL_QUOTA', 'Cannot save the validated OCR model. Free browser storage or clear the model cache in Settings, then retry.'); }
      return buffer;
    }, signal);
  }
}
export const modelCache = new ModelCache();
export async function prepareModels(language = 'en', options = {}) {
  const signal = options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000);
  const data = [];
  for (const model of modelSet(language)) data.push(await modelCache.get(model, { ...options, signal }));
  return { detection: data[0], recognition: data[1], charactersDictionary: data[2] };
}
