import { getOutput } from './lib/storage.js';
import { downloadOutput } from './lib/delivery.js';

const $ = id => document.getElementById(id);
let output;
try {
  output = await getOutput(new URLSearchParams(location.search).get('id'));
  if (!output) throw new Error('This output expired or was cleared. Convert the source file again.');
  $('title').textContent = output.name;
  document.title = `${output.name} — Markdown`;
  $('output').textContent = output.markdown;
  $('copy').disabled = $('download').disabled = false;
} catch (error) { $('notice').textContent = error.message; }
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(output.markdown); $('notice').textContent = 'Markdown copied.'; }
  catch { $('notice').textContent = 'Clipboard access failed. Select and copy the text manually.'; }
});
$('download').addEventListener('click', async () => {
  try { $('notice').textContent = await downloadOutput(output); }
  catch (error) { $('notice').textContent = error.message; }
});
