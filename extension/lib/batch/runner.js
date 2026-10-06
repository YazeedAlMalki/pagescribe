import { WorkerPool } from './worker-pool.js';
import { read, updateBatch, finishJob, pruneCache } from '../storage.js';
import { ConversionError, errorInfo } from '../errors.js';

export async function runBatch(batchId, { signal, onEvent = () => {} } = {}) {
  // One global pool across processor tabs. Web Locks releases ownership if a
  // tab closes; reopening resumes queued/running jobs from retained inputs.
  return navigator.locks.request('markitdown-worker-pool', { signal }, async () => {
    const batch = await read('batches', batchId);
    if (!batch) throw new Error('Batch expired. Select the files again.');
    if (['done', 'cancelled'].includes(batch.state)) return { state: batch.state };
    const jobs = batch.jobs.filter(job => ['queued', 'running'].includes(job.state));
    await updateBatch(batchId, record => { record.state = 'running'; });
    const writes = [];
    let writeError;
    const pool = new WorkerPool();
    try {
      const results = await pool.run(jobs, {
        signal,
        load: async job => {
          const input = await read('inputs', job.id);
          if (!input?.blob) throw new ConversionError('INPUT_MISSING', 'Input expired. Select the file again.');
          return input.blob.arrayBuffer();
        },
        onEvent: event => {
          if (['done', 'error', 'cancelled'].includes(event.state)) {
            writes.push(finishJob(batchId, event).catch(error => { writeError ||= error; }));
          } else if (event.state === 'running') {
            writes.push(updateBatch(batchId, record => {
              const job = record.jobs.find(item => item.id === event.id);
              if (job) { job.state = 'running'; job.stage = event.stage; }
            }).catch(error => { writeError ||= error; }));
          }
          // Persistence must not depend on a UI observer remaining alive.
          try { onEvent(event); } catch { /* Keep the batch durable. */ }
        }
      });
      await Promise.all(writes);
      if (writeError) throw writeError;
      const cancelled = results.find(result => result.state === 'cancelled');
      const state = signal?.aborted || cancelled ? 'cancelled' : 'done';
      await updateBatch(batchId, record => { record.state = state; });
      await pruneCache();
      return { state, reason: cancelled?.error?.message };
    } catch (error) {
      await updateBatch(batchId, record => { record.state = 'interrupted'; record.error = errorInfo(error); });
      throw error;
    }
  });
}
