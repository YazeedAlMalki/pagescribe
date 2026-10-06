import { FORMATS, ACCEPT } from './lib/formats.js';
import { validateFiles } from './lib/limits.js';
import { MemoryMonitor } from './lib/batch/memory-monitor.js';
import { runBatch } from './lib/batch/runner.js';
import { stageBatch, read, getOutput, pruneCache } from './lib/storage.js';
import { downloadOutput, openPreview } from './lib/delivery.js';
import { modelCache } from './lib/ocr/model-cache.js';
import { getSettings } from './lib/settings-store.js';

getSettings().then(settings => modelCache.prune(settings.modelCacheHours)).catch(() => {});

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const processor = params.get('processor') === '1';
let batchId = params.get('batch'), batch, selectedId, output, controller, busy = false, refreshing = false;
const live = new Map();
const memory = new MemoryMonitor();
if (processor) document.body.classList.add('tab');

function notice(message, error = false) {
  $('notice').textContent = message;
  $('notice').classList.toggle('error', error);
}
function menu(open) {
  $('download-menu').hidden = !open;
  $('download-toggle').setAttribute('aria-expanded', String(open));
}
function enableOutput(enabled) {
  $('copy').disabled = $('download-toggle').disabled = !enabled;
  if (!enabled) menu(false);
}

$('file-input').accept = ACCEPT;
for (const format of FORMATS) {
  const option = document.createElement('option');
  option.value = format.id;
  option.textContent = format.label;
  $('file-type').append(option);
}

function drawBatch() {
  if (!batch) return;
  const jobs = batch.jobs.map(job => ({ ...job, ...live.get(job.id) }));
  const finished = jobs.filter(job => ['done', 'error', 'cancelled'].includes(job.state)).length;
  $('progress').max = jobs.length || 1;
  $('progress').value = finished;
  const errors = jobs.filter(job => job.state === 'error').length;
  const cancelled = jobs.filter(job => job.state === 'cancelled').length;
  $('batch-status').textContent = `${finished} of ${jobs.length} finished${errors ? ` · ${errors} failed` : ''}${cancelled ? ` · ${cancelled} cancelled` : ''} · ${busy ? 'Keep this tab open while processing.' : batch.state}`;
  $('resume').hidden = processor || !['staged', 'queued', 'running', 'interrupted'].includes(batch.state);
  $('file-list').replaceChildren();
  for (const job of jobs) {
    const li = document.createElement('li'); li.className = 'file-row';
    const button = document.createElement('button'); button.type = 'button';
    button.setAttribute('aria-pressed', String(job.id === selectedId));
    const name = document.createElement('span'); name.className = 'file-name'; name.textContent = job.name;
    const state = document.createElement('span'); state.className = `file-state${job.error ? ' error' : ''}`;
    state.textContent = job.error?.message || (job.state === 'running' ? job.stage || 'Converting…' : job.state);
    button.append(name, state); button.addEventListener('click', () => selectOutput(job.id));
    li.append(button); $('file-list').append(li);
  }
}

async function selectOutput(id) {
  selectedId = id; output = undefined; enableOutput(false); drawBatch();
  $('output').value = ''; $('output-note').textContent = '';
  try {
    const value = await getOutput(id);
    if (selectedId !== id) return;
    output = value; enableOutput(Boolean(value));
    const job = batch?.jobs.find(item => item.id === id);
    $('output').value = value?.markdown || '';
    $('output-note').textContent = value
      ? (job?.warnings || []).join(' ')
      : job?.state === 'done' ? 'This cached output has expired or was cleared. Select the source file again.'
        : job?.error?.message || 'Output will be available when conversion finishes.';
  } catch (error) { notice(error.message, true); }
}

async function refresh() {
  if (!batchId || refreshing) return;
  refreshing = true;
  try {
    batch = await read('batches', batchId);
    if (!batch) { notice('The batch has expired. Select files to start again.'); return; }
    for (const job of batch.jobs) if (['done', 'error', 'cancelled'].includes(job.state)) live.delete(job.id);
    drawBatch();
    const first = batch.jobs.find(job => job.state === 'done');
    if (!selectedId && first) await selectOutput(first.id);
    else if (selectedId && !output && batch.jobs.some(job => job.id === selectedId && job.state === 'done')) await selectOutput(selectedId);
  } catch (error) { notice(error.message, true); }
  finally { refreshing = false; }
}

async function start(files) {
  if (busy) return;
  try {
    const chosen = Array.from(files);
    validateFiles(chosen); memory.assertSupported();
    busy = true; $('drop-zone').disabled = true; $('file-type').disabled = true;
    notice('Preparing your files…');
    await pruneCache();
    const staged = await stageBatch(chosen, $('file-type').value);
    const response = await chrome.runtime.sendMessage({ target: 'background', type: 'START_BATCH', batchId: staged.id });
    if (!response?.ok) throw new Error(response?.error?.message || 'Could not open the processing tab.');
    batchId = staged.id; selectedId = undefined; output = undefined; live.clear();
    notice('Batch opened in its own tab. Keep that tab open until processing finishes.');
    await refresh();
  } catch (error) { notice(error.message, true); }
  finally { busy = false; $('drop-zone').disabled = false; $('file-type').disabled = false; $('file-input').value = ''; }
}

$('drop-zone').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', event => { if (event.target.files.length) start(event.target.files); });
document.addEventListener('dragover', event => event.preventDefault());
document.addEventListener('drop', event => event.preventDefault());
$('drop-zone').addEventListener('dragover', () => $('drop-zone').classList.add('dragging'));
$('drop-zone').addEventListener('dragleave', () => $('drop-zone').classList.remove('dragging'));
$('drop-zone').addEventListener('drop', event => { $('drop-zone').classList.remove('dragging'); start(event.dataTransfer.files); });
$('download-toggle').addEventListener('click', () => menu($('download-menu').hidden));
document.addEventListener('click', event => { if (!event.target.closest('.download-control')) menu(false); });
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && !$('download-menu').hidden) {
    event.preventDefault();
    menu(false);
    $('download-toggle').focus();
  }
});
$('copy').addEventListener('click', async () => {
  try { if (output) { await navigator.clipboard.writeText(output.markdown); notice('Markdown copied.'); } }
  catch { notice('Clipboard access failed. Select the preview text and copy it manually.', true); }
});

async function deliver(kind) {
  if (!output) return;
  const current = output;
  menu(false);
  try {
    if (kind === 'open') { await openPreview(current); return; }
    notice(await downloadOutput(current));
    if (kind === 'both') await openPreview(current);
  } catch (error) { notice(error.message, true); }
}
$('download').addEventListener('click', () => deliver('download'));
$('download-open').addEventListener('click', () => deliver('both'));
$('open-tab').addEventListener('click', () => deliver('open'));
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('resume').addEventListener('click', async () => {
  try {
    const response = await chrome.runtime.sendMessage({ target: 'background', type: 'START_BATCH', batchId });
    if (!response?.ok) throw new Error(response?.error?.message || 'Could not reopen this batch.');
  } catch (error) { notice(error.message, true); }
});
$('cancel').addEventListener('click', () => { controller?.abort(); $('cancel').disabled = true; });

async function initialize() {
  await pruneCache();
  if (!batchId) ({ lastBatchId: batchId } = await chrome.storage.local.get('lastBatchId'));
  $('memory-note').textContent = memory.deviceMemory
    ? `~${memory.deviceMemory} GB device RAM · Local only`
    : 'RAM estimate unavailable · 4+ GB required';
  await refresh();
  if (processor && batchId && batch && !['done', 'cancelled'].includes(batch.state)) {
    busy = true; controller = new AbortController();
    $('drop-zone').disabled = $('file-type').disabled = true;
    $('cancel').hidden = false;
    notice('Waiting for a free batch slot. Keep this tab open.');
    try {
      const result = await runBatch(batchId, {
        signal: controller.signal,
        onEvent: event => {
          if (event.id) { live.set(event.id, { state: event.state, stage: event.stage, error: event.error }); drawBatch(); }
          if (event.state === 'running') notice('Converting files in parallel. Keep this tab open.');
        }
      });
      notice(result?.state === 'cancelled' ? result.reason || 'Batch cancelled.' : 'Batch finished. Select a file to copy or save its Markdown.');
    } catch (error) { notice(error.name === 'AbortError' ? 'Stopped waiting for a batch slot. Reopen the batch to resume.' : error.message, true); }
    finally {
      busy = false; $('drop-zone').disabled = $('file-type').disabled = false;
      $('cancel').hidden = true; live.clear(); await refresh();
    }
  }
}
initialize().catch(error => notice(error.message, true));
const poll = setInterval(refresh, 1000);
const cleanup = setInterval(() => pruneCache().catch(error => notice(error.message, true)), 60_000);
window.addEventListener('pagehide', () => { clearInterval(poll); clearInterval(cleanup); });
window.addEventListener('beforeunload', event => { if (busy && processor) { event.preventDefault(); event.returnValue = ''; } });
