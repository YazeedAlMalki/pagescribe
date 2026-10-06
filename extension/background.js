import { detectFormat } from './lib/formats.js';
import { validateFiles } from './lib/limits.js';
import { errorInfo } from './lib/errors.js';
import { read, updateBatch, pruneCache, finishJob } from './lib/storage.js';
import { modelCache } from './lib/ocr/model-cache.js';
import { getSettings } from './lib/settings-store.js';

// MV3 coordinator: only JSON IDs cross runtime messaging. File/Blob data and
// durable queue state live in IndexedDB, not in service-worker globals.
// The document tab owns Web Workers; suspending this coordinator is harmless.
async function startBatch(id) {
  const batch = await read('batches', id);
  if (!batch) throw new Error('The staged batch is missing or expired. Select the files again.');
  validateFiles(batch.jobs);
  if (batch.state === 'staged') {
    await updateBatch(id, record => {
      record.state = 'queued';
      for (const job of record.jobs) {
        try { job.format = detectFormat(job, record.override).id; }
        catch (error) { job.state = 'error'; job.error = errorInfo(error); }
      }
    });
    const routed = await read('batches', id);
    for (const job of routed.jobs.filter(job => job.state === 'error')) await finishJob(id, job);
  }
  await chrome.storage.local.set({ lastBatchId: id });
  const tab = await chrome.tabs.create({ url: chrome.runtime.getURL(`popup.html?batch=${encodeURIComponent(id)}&processor=1`) });
  return { batchId: id, tabId: tab.id };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || message?.target !== 'background') return;
  const task = message.type === 'START_BATCH' && typeof message.batchId === 'string'
    ? startBatch(message.batchId)
    : Promise.reject(new Error('Unknown request.'));
  task.then(result => sendResponse({ ok: true, ...result }), error => sendResponse({ ok: false, error: errorInfo(error) }));
  return true;
});

const clean = () => {
  pruneCache().catch(error => console.warn('Cache cleanup failed:', error.message));
  getSettings().then(settings => modelCache.prune(settings.modelCacheHours)).catch(error => console.warn('Model cleanup failed:', error.message));
};
chrome.runtime.onInstalled.addListener(clean);
chrome.runtime.onStartup.addListener(clean);
