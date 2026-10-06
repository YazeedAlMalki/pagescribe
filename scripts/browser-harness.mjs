import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
export async function waitFor(fn, label, timeout = 30_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) { const value = await fn(); if (value) return value; await sleep(100); }
  throw new Error(`Timed out: ${label}`);
}
export async function browserHarness(extensionPath = process.env.MARKITDOWN_EXTENSION || 'extension') {
  await mkdir('.browser-tests', { recursive: true });
  const profile = await mkdtemp(resolve('.browser-tests', 'phase2-'));
  const extension = resolve(extensionPath);
  const processHandle = spawn(process.env.MARKITDOWN_TEST_BROWSER || 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--remote-debugging-port=0',
    '--remote-allow-origins=http://localhost', `--user-data-dir=${profile}`, `--disable-extensions-except=${extension}`, `--load-extension=${extension}`, 'about:blank'
  ], { windowsHide: true, stdio: 'ignore' });
  let launchError, socket;
  processHandle.on('error', error => { launchError = error; });
  const close = () => { socket?.close(); processHandle.kill(); };
  try {
    const portFile = await waitFor(async () => { if (launchError) throw launchError; return readFile(join(profile, 'DevToolsActivePort'), 'utf8').catch(() => null); }, 'browser launch');
    const [port, path] = portFile.trim().split(/\r?\n/);
    socket = new WebSocket(`ws://127.0.0.1:${port}${path}`);
    await new Promise((resolve, reject) => { socket.onopen = resolve; socket.onerror = reject; });
    let nextId = 0;
    const pending = new Map(), events = [], listeners = new Set();
    socket.onmessage = event => {
      const message = JSON.parse(event.data);
      if (!message.id) { events.push(message); for(const listener of listeners) listener(message); return; }
      const request = pending.get(message.id);
      if (request) { pending.delete(message.id); message.error ? request.reject(new Error(JSON.stringify(message.error))) : request.resolve(message.result); }
    };
    const command = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
      const id = ++nextId, timer = setTimeout(() => { pending.delete(id); reject(new Error(`CDP timeout: ${method}`)); }, 180_000);
      pending.set(id, { resolve: value => { clearTimeout(timer); resolve(value); }, reject: error => { clearTimeout(timer); reject(error); } });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
    const evaluate = async (session, expression) => {
      const value = await command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }, session);
      if (value.exceptionDetails) throw new Error(value.exceptionDetails.exception?.description || value.exceptionDetails.text);
      return value.result.value;
    };
    const attach = async targetId => { const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true }); await command('Runtime.enable', {}, sessionId); return sessionId; };
    const service = await waitFor(async () => (await command('Target.getTargets')).targetInfos.find(target => target.type === 'service_worker' && target.url.endsWith('/background.js')), 'extension service worker');
    const base = service.url.replace(/\/background.js$/, '');
    const open = async (path = 'popup.html') => { const { targetId } = await command('Target.createTarget', { url: `${base}/${path}` }); return { targetId, session: await attach(targetId) }; };
    return { command, evaluate, attach, open, base, profile, events, close, onEvent: listener => listeners.add(listener) };
  } catch (error) { close(); throw error; }
}
