import { spawnSync } from 'node:child_process';
import { access } from 'node:fs/promises';
function run(script, env = process.env) {
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit', windowsHide: true, env });
  if(result.status !== 0) process.exit(result.status || 1);
}
try { await access('.browser-tests/models/english.bin'); await access('.browser-tests/models/arabic.bin'); }
catch { run('scripts/fetch-model-fixtures.mjs'); }
run('scripts/browser-smoke.mjs');
run('scripts/browser-phase2.mjs', {...process.env, MARKITDOWN_MODEL_FIXTURES:'1'});
