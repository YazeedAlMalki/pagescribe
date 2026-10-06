import test from 'node:test';
import assert from 'node:assert/strict';
import { Worker } from 'node:worker_threads';
import { WorkerPool } from '../extension/lib/batch/worker-pool.js';
import { MemoryMonitor } from '../extension/lib/batch/memory-monitor.js';
import { phase1Fixtures } from './helpers/documents.js';

const jobs = count => Array.from({ length: count }, (_, id) => ({ id: String(id), name: `${id}.json`, size: 10, format: 'json' }));
const load = async () => new TextEncoder().encode('{"ok":true}').buffer;
const memory = () => new MemoryMonitor({ deviceMemory: 4, performance: {} });
const tick = () => new Promise(resolve => setImmediate(resolve));

function controlledFactory(workers) {
  return () => {
    const worker = { terminate() { this.terminated = true; }, postMessage(job, transfers) { this.job = job; this.transfers = transfers; } };
    workers.push(worker); return worker;
  };
}
function success(worker) { worker.onmessage({ data: { id: worker.job.id, type: 'result', result: { markdown: worker.job.id, warnings: [] } } }); }

test('five real workers cross a shared barrier and run the production converter', { timeout: 15_000 }, async () => {
  const barrier = new SharedArrayBuffer(4);
  const workerFactory = () => {
    const thread = new Worker(new URL('./helpers/node-conversion-worker.js', import.meta.url));
    const wrapper = { postMessage: (data, transfers) => thread.postMessage(data, transfers), terminate: () => { thread.terminate(); } };
    thread.on('message', data => wrapper.onmessage?.({ data }));
    thread.on('error', error => wrapper.onerror?.({ message: error.message }));
    return wrapper;
  };
  const pool = new WorkerPool({ workerFactory, memory: memory(), timeoutMs: 10_000 });
  const results = await pool.run(jobs(5).map(job => ({ ...job, testBarrier: barrier })), { load });
  assert.equal(new Int32Array(barrier)[0], 5);
  assert.ok(results.every(result => result.state === 'done' && result.output.markdown.includes('"ok": true')));
  assert.equal(pool.memory.reserved, 0);
});
test('five real Office/text workers run together with a 4 GB device budget', { timeout: 15_000 }, async () => {
  const barrier = new SharedArrayBuffer(4);
  const fixtures = await phase1Fixtures();
  const selected = ['workbook.xlsx', 'legacy.xls', 'report.docx', 'book.epub', 'page.html'];
  const workerFactory = () => {
    const thread = new Worker(new URL('./helpers/node-conversion-worker.js', import.meta.url));
    const wrapper = { postMessage: (data, transfers) => thread.postMessage(data, transfers), terminate: () => { thread.terminate(); } };
    thread.on('message', data => wrapper.onmessage?.({ data }));
    thread.on('error', error => wrapper.onerror?.({ message: error.message }));
    return wrapper;
  };
  const pool = new WorkerPool({ workerFactory, memory: memory(), timeoutMs: 10_000 });
  const tasks = selected.map(name => ({ id: name, name, format: name.split('.').pop(), size: fixtures[name].byteLength, testBarrier: barrier }));
  const results = await pool.run(tasks, { load: async job => fixtures[job.name] });
  assert.equal(new Int32Array(barrier)[0], 5);
  assert.ok(results.every(result => result.state === 'done'), JSON.stringify(results));
  assert.equal(pool.memory.reserved, 0);
});
test('pool starts eight, queues excess jobs, transfers buffers, preserves order and releases workers', async () => {
  const workers = [];
  const pool = new WorkerPool({ workerFactory: controlledFactory(workers), memory: memory() });
  const pending = pool.run(jobs(10), { load });
  await tick(); assert.equal(workers.length, 8);
  assert.equal(workers[0].transfers[0], workers[0].job.buffer);
  success(workers[7]); await tick(); assert.equal(workers.length, 9);
  success(workers[8]); await tick(); assert.equal(workers.length, 10);
  for (const worker of workers.filter(item => !item.terminated)) success(worker);
  assert.deepEqual((await pending).map(result => result.id), jobs(10).map(job => job.id));
  assert.ok(workers.every(worker => worker.terminated));
  assert.equal(pool.memory.reserved, 0);
});
test('worker crash and converter error do not stop siblings', async () => {
  const workers = [];
  const pool = new WorkerPool({ workerFactory: controlledFactory(workers), memory: memory() });
  const pending = pool.run(jobs(3), { load }); await tick();
  workers[0].onerror({ message: 'crash' });
  workers[1].onmessage({ data: { id: '1', type: 'error', error: { code: 'BAD_INPUT', message: 'bad' } } });
  success(workers[2]);
  const results = await pending;
  assert.deepEqual(results.map(result => result.state), ['error', 'error', 'done']);
});
test('timeout terminates hung workers', async () => {
  const workers = [];
  const pool = new WorkerPool({ workerFactory: controlledFactory(workers), memory: memory(), timeoutMs: 20 });
  const results = await pool.run(jobs(2), { load });
  assert.ok(results.every(result => result.error.code === 'TIMEOUT'));
  assert.ok(workers.every(worker => worker.terminated));
});
test('cancellation settles queued and active jobs without leaking reservations', async () => {
  const workers = [], controller = new AbortController();
  const pool = new WorkerPool({ workerFactory: controlledFactory(workers), memory: memory() });
  const pending = pool.run(jobs(12), { load, signal: controller.signal });
  await tick(); controller.abort();
  assert.ok((await pending).every(result => result.state === 'cancelled'));
  assert.equal(pool.memory.reserved, 0);
  assert.ok(workers.every(worker => worker.terminated));
});
test('cancellation during async input load never creates a worker later', async () => {
  const workers = [], controller = new AbortController();
  let release;
  const pool = new WorkerPool({ workerFactory: controlledFactory(workers), memory: memory() });
  const pending = pool.run(jobs(1), { load: () => new Promise(resolve => { release = resolve; }), signal: controller.signal });
  await tick(); controller.abort(); await pending; release(new ArrayBuffer(1)); await tick();
  assert.equal(workers.length, 0);
});
test('already-aborted and empty batches settle immediately', async () => {
  const controller = new AbortController(); controller.abort();
  const pool = new WorkerPool({ memory: memory() });
  assert.equal((await pool.run(jobs(1), { load, signal: controller.signal }))[0].state, 'cancelled');
  assert.deepEqual(await pool.run([], { load }), []);
});
test('input load and worker constructor errors are per-file failures', async () => {
  const pool = new WorkerPool({ memory: memory(), workerFactory: () => { throw new Error('worker unavailable'); } });
  const results = await pool.run(jobs(2), { load: job => job.id === '0' ? Promise.reject(new Error('read failed')) : load() });
  assert.deepEqual(results.map(result => result.error.message), ['read failed', 'worker unavailable']);
});
test('memory budget limits admission and frees capacity for waiting jobs', async () => {
  const workers = [], guard = memory();
  guard.budget = guard.estimate(10) * 2;
  const pool = new WorkerPool({ memory: guard, workerFactory: controlledFactory(workers) });
  const pending = pool.run(jobs(3), { load }); await tick();
  assert.equal(workers.length, 2); success(workers[0]); await tick();
  assert.equal(workers.length, 3); success(workers[1]); success(workers[2]); await pending;
  assert.equal(guard.reserved, 0);
});
test('oversized memory reservation fails without deadlocking the queue', async () => {
  const guard = memory(); guard.budget = 1;
  const pool = new WorkerPool({ memory: guard });
  assert.equal((await pool.run(jobs(1), { load }))[0].error.code, 'MEMORY_BUDGET');
});
test('heap pressure stops a batch and low-RAM devices are rejected', async () => {
  const guard = new MemoryMonitor({ deviceMemory: 4, performance: { memory: { jsHeapSizeLimit: 100, usedJSHeapSize: 90 } } });
  assert.equal((await new WorkerPool({ memory: guard }).run(jobs(1), { load }))[0].error.code, 'MEMORY_PRESSURE');
  assert.throws(() => new WorkerPool({ memory: new MemoryMonitor({ deviceMemory: 2 }) }).run(jobs(1), { load }), { code: 'LOW_MEMORY_DEVICE' });
});
test('missing memory APIs use conservative reservations', () => {
  const guard = new MemoryMonitor({ deviceMemory: null, performance: {} });
  assert.equal(guard.snapshot().deviceMemory, null);
  assert.equal(guard.isUnderPressure(), false);
  assert.ok(guard.budget > guard.estimate(10) * 5);
});

test('OCR/PDF/ZIP admission serializes heavy jobs, includes parser slots and lets text pass', async () => {
  const workers = [], guard = new MemoryMonitor({ deviceMemory: 8, performance: {} });
  const tasks = [{...jobs(1)[0],format:'pdf'}, {...jobs(1)[0],id:'scan',format:'image'}, ...jobs(8).map(j=>({...j,id:`text-${j.id}`}))];
  const pool = new WorkerPool({workerFactory:controlledFactory(workers),memory:guard});
  const pending = pool.run(tasks,{load}); await tick();
  assert.equal(workers.length,7); assert.equal(workers.filter(w=>w.job.format==='image').length,0);
  success(workers[0]); await tick(); assert.equal(workers.filter(w=>w.job.format==='image').length,1);
  while(pool.running) { for(const worker of workers.filter(w=>!w.terminated))success(worker); await tick(); }
  assert.ok((await pending).every(r=>r.state==='done')); assert.equal(guard.reserved,0);
});
test('cancel during model preparation terminates worker and permits retry', async () => {
  const workers=[],controller=new AbortController(),pool=new WorkerPool({workerFactory:controlledFactory(workers),memory:memory()});
  const pending=pool.run([{...jobs(1)[0],format:'image'}],{load,signal:controller.signal});await tick();
  workers[0].onmessage({data:{id:'0',type:'phase',phase:'model-start'}});controller.abort();
  assert.equal((await pending)[0].state,'cancelled');assert.equal(workers[0].terminated,true);assert.equal(pool.memory.reserved,0);
  const retry=pool.run(jobs(1),{load});await tick();success(workers[1]);assert.equal((await retry)[0].state,'done');
});
test('UI observer failure does not prevent worker cleanup', async () => {
  const workers = [], pool = new WorkerPool({ memory: memory(), workerFactory: controlledFactory(workers) });
  const pending = pool.run(jobs(1), { load, onEvent: () => { throw new Error('UI gone'); } });
  await tick(); success(workers[0]); assert.equal((await pending)[0].state, 'done');
});
