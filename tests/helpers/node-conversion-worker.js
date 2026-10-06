import { parentPort } from 'node:worker_threads';

// Adapt only the transport; execute the extension's actual worker and router.
globalThis.self = globalThis;
self.postMessage = message => parentPort.postMessage(message);
await import('../../extension/lib/batch/conversion-worker.js');
parentPort.on('message', async data => {
  if (data.testBarrier) {
    const count = new Int32Array(data.testBarrier);
    Atomics.add(count, 0, 1);
    Atomics.notify(count, 0);
    // This succeeds only if five real worker threads are alive together.
    while (Atomics.load(count, 0) < 5) Atomics.wait(count, 0, Atomics.load(count, 0), 100);
  }
  await self.onmessage({ data });
});
