import { read } from './storage.js';
import { outputName } from './markdown.js';

export function openPreview(output) {
  return chrome.tabs.create({ url: chrome.runtime.getURL(`viewer.html?id=${encodeURIComponent(output.id)}`) });
}

export async function downloadOutput(output) {
  const blob = new Blob([output.markdown], { type: 'text/markdown;charset=utf-8' });
  const name = outputName(output.name);
  const preference = await read('preferences', 'downloadDirectory');
  if (preference?.handle) {
    const directory = preference.handle;
    const access = { mode: 'readwrite' };
    if (await directory.queryPermission(access) !== 'granted' && await directory.requestPermission(access) !== 'granted') {
      throw new Error('Folder access was declined. Choose another folder in Settings or use Chrome’s default download location.');
    }
    return navigator.locks.request('markitdown-save-file', async () => {
      // Preserve existing files by selecting a fresh name under an exclusive lock.
      for (let count = 1; count <= 1000; count++) {
        const candidate = count === 1 ? name : name.replace(/\.md$/, ` (${count}).md`);
        try { await directory.getFileHandle(candidate); }
        catch (error) {
          if (error.name !== 'NotFoundError') throw error;
          const file = await directory.getFileHandle(candidate, { create: true });
          const writable = await file.createWritable();
          try { await writable.write(blob); await writable.close(); }
          catch (writeError) { await writable.abort().catch(() => {}); throw writeError; }
          return `Saved ${candidate} to ${directory.name}.`;
        }
      }
      throw new Error('Too many files with the same name. Choose a different output folder.');
    });
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return 'Download requested. Chrome controls the save location and any download prompts.';
}
