import test from 'node:test';
import assert from 'node:assert/strict';
import { ModelCache, sha256 } from '../extension/lib/ocr/model-cache.js';
import { MODELS } from '../extension/lib/ocr/model-catalogue.js';

async function fixture() {
  const data = new TextEncoder().encode('verified model bytes'), records = new Map();
  let now = 100000, downloads = 0, pending = Promise.resolve();
  const model = { ...MODELS.english, bytes: data.length, sha256: await sha256(data) };
  const store = { get: async id => structuredClone(records.get(id)), all: async () => structuredClone([...records.values()]),
    put: async item => { records.set(item.id, structuredClone(item)); }, delete: async id => records.delete(id), clear: async () => records.clear() };
  const cache = new ModelCache({ store, now: () => now,
    lock: (fn, signal) => { const next = pending.then(() => { signal?.throwIfAborted(); return fn(); }); pending = next.catch(() => {}); return next; },
    fetcher: async () => { downloads++; return new Response(data); } });
  return { cache, model, store, records, data, downloads: () => downloads, time: value => { now = value; } };
}

test('model download commits complete metadata; concurrent requests download once', async () => {
  const f = await fixture();
  const results = await Promise.all([f.cache.get(f.model), f.cache.get(f.model)]);
  assert.equal(f.downloads(), 1); assert.deepEqual(results[0], results[1]);
  const saved = f.records.get(f.model.id);
  for (const field of ['id', 'url', 'bytes', 'sha256', 'language', 'createdAt', 'verifiedAt', 'data']) assert.ok(field in saved);
});
test('model read checks expiry and integrity; valid cache works without fetch', async () => {
  const f = await fixture(); await f.cache.get(f.model);
  f.cache.fetcher = async () => { throw new Error('offline'); };
  assert.deepEqual(new Uint8Array(await f.cache.get(f.model)), f.data);
  f.time(100000 + 24 * 3600000);
  await assert.rejects(f.cache.get(f.model), { code: 'MODEL_UNAVAILABLE' }); assert.equal(f.records.size, 0);
});
test('corrupt cached data is never used and must be downloaded again', async () => {
  const f = await fixture(); await f.cache.get(f.model);
  new Uint8Array(f.records.get(f.model.id).data)[0] ^= 255;
  await f.cache.get(f.model); assert.equal(f.downloads(), 2);
});
test('wrong hash, short data and excess data never commit', async () => {
  for (const data of [new Uint8Array(20), new Uint8Array(2), new Uint8Array(100)]) {
    const f = await fixture(); f.cache.fetcher = async () => new Response(data);
    await assert.rejects(f.cache.get(f.model), { code: 'MODEL_INTEGRITY' }); assert.equal(f.records.size, 0);
  }
});
test('interrupted network and cancellation do not commit incomplete models; retry works', async () => {
  const f = await fixture(); const original = f.cache.fetcher;
  f.cache.fetcher = async () => new Response(new ReadableStream({ start(controller) { controller.enqueue(f.data.subarray(0, 3)); controller.error(new Error('network interrupted')); } }));
  await assert.rejects(f.cache.get(f.model), { code: 'MODEL_UNAVAILABLE' }); assert.equal(f.records.size, 0);
  const controller = new AbortController();
  f.cache.fetcher = async () => { controller.abort(); return new Response(f.data); };
  await assert.rejects(f.cache.get(f.model, { signal: controller.signal }), { name: 'AbortError' }); assert.equal(f.records.size, 0);
  f.cache.fetcher = original; await f.cache.get(f.model); assert.equal(f.records.size, 1);
});
test('quota failure is explicit and retry can save a valid download', async () => {
  const f = await fixture(), original = f.store.put;
  f.store.put = async () => { throw new DOMException('full', 'QuotaExceededError'); };
  await assert.rejects(f.cache.get(f.model), { code: 'MODEL_QUOTA' }); assert.equal(f.records.size, 0);
  f.store.put = original; await f.cache.get(f.model); assert.equal(f.records.size, 1);
});
test('clear coordinates with in-flight download and preserves active buffer snapshots', async () => {
  const f = await fixture();
  const read = f.cache.get(f.model), clear = f.cache.clear();
  const [buffer] = await Promise.all([read, clear]);
  assert.equal(f.records.size, 0); assert.deepEqual(new Uint8Array(buffer), f.data);
});
test('activation cleanup expires models at same boundary as reads; budget is enforced', async () => {
  const f = await fixture(); await f.cache.get(f.model); f.time(100000 + 24 * 3600000); await f.cache.prune();
  assert.equal(f.records.size, 0); f.cache.budget = 1;
  await assert.rejects(f.cache.get(f.model), { code: 'MODEL_BUDGET' });
});
