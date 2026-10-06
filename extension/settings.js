import { getSettings, saveSettings } from './lib/settings-store.js';
import { read, put, remove, cacheStats, clearCache, pruneCache } from './lib/storage.js';
import { modelCache } from './lib/ocr/model-cache.js';

const $ = id => document.getElementById(id);
let settings;
function notice(message, error = false) { $('notice').textContent = message; $('notice').classList.toggle('error', error); }
async function showStats() {
  const stats = await cacheStats();
  $('cache-status').textContent = `${stats.count} cached result${stats.count === 1 ? '' : 's'} · ${(stats.bytes / 1024 / 1024).toFixed(2)} MB`;
  const models = await modelCache.stats((await getSettings()).modelCacheHours);
  $('model-status').textContent = `${models.length} model assets cached · ${(models.reduce((sum, model) => sum + model.bytes, 0) / 1048576).toFixed(2)} MiB / 64 MiB`;
}
async function initialize() {
  settings = await getSettings();
  $('cache-hours').value = settings.cacheHours;
  $('model-cache-hours').value = settings.modelCacheHours;
  $('ocr-language').value = settings.ocrLanguage;
  $('ocr-rotation').value = settings.ocrRotation;
  $('pdf-force-ocr').checked = settings.pdfForceOcr;
  const directory = await read('preferences', 'downloadDirectory');
  $('directory-name').textContent = directory?.handle?.name || 'Chrome’s default download location';
  $('choose-directory').disabled = typeof window.showDirectoryPicker !== 'function';
  await showStats();
}
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    settings = await saveSettings({ ...await getSettings(), cacheHours: $('cache-hours').value, modelCacheHours: $('model-cache-hours').value,
      ocrLanguage: $('ocr-language').value, ocrRotation: $('ocr-rotation').value, pdfForceOcr: $('pdf-force-ocr').checked });
    await pruneCache(); await showStats(); notice('Settings saved.');
  } catch (error) { notice(error.message, true); }
});
$('clear-cache').addEventListener('click', async () => {
  try { await clearCache(); await showStats(); notice('Cached conversion results cleared.'); }
  catch (error) { notice(error.message, true); }
});
$('clear-models').addEventListener('click', async () => {
  try { await modelCache.clear(); await showStats(); notice('OCR models cleared. Next OCR use needs a model download.'); }
  catch (error) { notice(error.message, true); }
});
setInterval(() => showStats().catch(error => notice(error.message, true)), 60_000);
$('choose-directory').addEventListener('click', async () => {
  try {
    const handle = await window.showDirectoryPicker({ id: 'markitdown-output', mode: 'readwrite', startIn: 'downloads' });
    await put('preferences', { id: 'downloadDirectory', handle });
    settings = await saveSettings({ ...await getSettings(), downloadDirectoryName: handle.name });
    $('directory-name').textContent = handle.name; notice('Download folder saved.');
  } catch (error) { if (error.name !== 'AbortError') notice(error.message, true); }
});
$('reset-directory').addEventListener('click', async () => {
  try {
    await remove('preferences', 'downloadDirectory');
    settings = await saveSettings({ ...await getSettings(), downloadDirectoryName: '' });
    $('directory-name').textContent = 'Chrome’s default download location'; notice('Using Chrome’s default download location.');
  } catch (error) { notice(error.message, true); }
});
initialize().catch(error => notice(error.message, true));
