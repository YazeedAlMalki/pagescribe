import { ConversionError, errorInfo } from '../errors.js';
import { LIMITS } from '../limits.js';
import { MemoryMonitor } from './memory-monitor.js';

const heavy = job => ['pdf', 'image', 'zip'].includes(job.format);
const slots = job => ['pdf', 'zip'].includes(job.format) ? 2 : 1;

// The persistent processor document owns these real dedicated workers.
// Every task gets a fresh worker, reclaimed on success, error, timeout/cancel.
// Eight simultaneous slots by default; reservations may defer larger tasks.
export class WorkerPool {
  constructor({ size = LIMITS.workers, timeoutMs = LIMITS.timeoutMs, memory = new MemoryMonitor(),
    workerFactory = () => new Worker(new URL('./conversion-worker.js', import.meta.url), { type: 'module' }) } = {}) {
    if (!Number.isInteger(size) || size < 1 || size > 8) throw new RangeError('Pool size must be between 1 and 8.');
    this.size = size;
    this.timeoutMs = timeoutMs;
    this.memory = memory;
    this.workerFactory = workerFactory;
    this.running = false;
  }

  run(jobs, { load, onEvent = () => {}, signal } = {}) {
    if (this.running) return Promise.reject(new Error('This pool is already running.'));
    this.memory.assertSupported();
    this.running = true;
    return new Promise(resolve => {
      const queue = jobs.map((job, index) => ({ job, index }));
      const results = new Array(jobs.length);
      const active = new Map();
      let finished = 0, done = false;
      const emit = event => { try { onEvent(event); } catch { /* UI failures cannot strand a worker. */ } };
      const settle = (task, result) => {
        results[task.index] = { id: task.job.id, ...result };
        finished++;
        emit({ id: task.job.id, ...result, finished, total: jobs.length });
      };
      const complete = () => {
        if (done || finished !== jobs.length) return;
        done = true; this.running = false;
        clearInterval(monitor);
        signal?.removeEventListener('abort', abort);
        resolve(results);
      };
      const stopAll = error => {
        while (queue.length) settle(queue.shift(), { state: 'cancelled', error: errorInfo(error) });
        for (const task of [...active.values()]) task.finish({ state: 'cancelled', error: errorInfo(error) }, false);
        complete();
      };
      const abort = () => stopAll(new ConversionError('CANCELLED', 'Batch cancelled.'));
      const launch = task => {
        const reservation = this.memory.estimate(task.job.size, task.job.format);
        this.memory.reserve(reservation);
        active.set(task.index, task);
        let worker, settled = false, preparing = false, preparationUsed = false;
        let remainingMs = this.timeoutMs, startedAt = Date.now(), timer;
        const timeout = () => task.finish({ state: 'error', error: errorInfo(new ConversionError(preparing ? 'MODEL_TIMEOUT' : 'TIMEOUT', preparing ? 'OCR model preparation exceeded 60 seconds. Retry after checking the connection.' : 'Conversion exceeded the two-minute processing timeout.')) });
        task.finish = (result, schedule = true) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          worker?.terminate();
          active.delete(task.index);
          this.memory.release(reservation);
          settle(task, result);
          if (schedule) pump();
        };
        timer = setTimeout(timeout, remainingMs);
        emit({ id: task.job.id, state: 'running', stage: 'Reading file' });
        Promise.resolve().then(() => load(task.job)).then(buffer => {
          if (settled) return;
          if (!(buffer instanceof ArrayBuffer)) throw new Error('File loader must return an ArrayBuffer.');
          worker = this.workerFactory();
          worker.onmessage = ({ data }) => {
            if (settled || data?.id !== task.job.id) return;
            if (data.type === 'progress') emit({ id: task.job.id, state: 'running', stage: String(data.stage) });
            else if (data.type === 'phase') {
              if (data.phase === 'model-start' && !preparationUsed) {
                preparationUsed = preparing = true; remainingMs -= Date.now() - startedAt;
                clearTimeout(timer); timer = setTimeout(timeout, 60_000);
              } else if (data.phase === 'model-end' && preparing) {
                preparing = false; startedAt = Date.now(); clearTimeout(timer); timer = setTimeout(timeout, Math.max(1, remainingMs));
              }
            }
            else if (data.type === 'result') task.finish({ state: 'done', output: data.result });
            else if (data.type === 'error') task.finish({ state: 'error', error: data.error });
            else task.finish({ state: 'error', error: { code: 'WORKER_PROTOCOL', message: 'Unexpected worker response.' } });
          };
          worker.onerror = event => {
            event.preventDefault?.();
            task.finish({ state: 'error', error: { code: 'WORKER_CRASH', message: event.message || 'Conversion worker stopped unexpectedly.' } });
          };
          worker.onmessageerror = () => task.finish({ state: 'error', error: { code: 'WORKER_MESSAGE', message: 'Could not read worker output.' } });
          // Transfer ownership instead of making another full copy of the input.
          worker.postMessage({ ...task.job, buffer }, [buffer]);
        }).catch(error => task.finish({ state: 'error', error: errorInfo(error) }));
      };
      const pump = () => {
        if (done) return;
        if (this.memory.isUnderPressure()) {
          stopAll(new ConversionError('MEMORY_PRESSURE', 'Memory pressure detected. Retry a smaller batch.'));
          return;
        }
        while (queue.length && active.size < this.size) {
          // PDF owns one parser subworker; ONNX runs single-threaded in its
          // parent. ZIP reserves a potential parser slot for nested PDFs.
          const usedSlots = [...active.values()].reduce((sum, task) => sum + slots(task.job), 0);
          const busyHeavy = [...active.values()].some(task => heavy(task.job));
          const index = queue.findIndex(task => !(heavy(task.job) && busyHeavy) && usedSlots + slots(task.job) <= Math.max(this.size, slots(task.job)) &&
            (this.memory.canReserve(this.memory.estimate(task.job.size, task.job.format)) || this.memory.estimate(task.job.size, task.job.format) > this.memory.budget));
          if (index < 0) break;
          const task = queue[index];
          const bytes = this.memory.estimate(task.job.size, task.job.format);
          if (bytes > this.memory.budget) {
            queue.splice(index, 1); settle(task, { state: 'error', error: { code: 'MEMORY_BUDGET', message: 'File exceeds the conversion memory budget.' } });
          } else if (this.memory.canReserve(bytes)) { queue.splice(index, 1); launch(task); }
          else break;
        }
        complete();
      };
      const monitor = setInterval(() => {
        emit({ type: 'memory', ...this.memory.snapshot() });
        if (this.memory.isUnderPressure()) stopAll(new ConversionError('MEMORY_PRESSURE', 'Memory pressure detected. Retry a smaller batch.'));
      }, 1000);
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
      else pump();
    });
  }
}
