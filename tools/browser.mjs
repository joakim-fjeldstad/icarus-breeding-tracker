// Shared headless-browser harness for tools/smoke.mjs and tools/screenshots.mjs.
// Drives Chrome, Chromium or Edge through the DevTools protocol with Node's built-in fetch and WebSocket; no packages.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const BROWSER_CANDIDATES = {
  win32:  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
           'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux:  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
};

export const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Start a headless browser and open `pageUrl`. Resolves to { ev, send, errors, close }.
 * `ev(expr)` evaluates JavaScript in the page and returns its value; `errors` collects page exceptions and console errors.
 * Exits the process with code 2 when no browser can be started.
 */
export async function openPage(pageUrl, { width = 1600, height = 1200 } = {}) {
  const CHROME = process.env.CHROME_PATH || (BROWSER_CANDIDATES[process.platform] || []).find(p => existsSync(p));
  if (!CHROME) { console.error('No Chrome, Chromium or Edge found. Set CHROME_PATH to the browser executable.'); process.exit(2); }
  const profile = mkdtempSync(join(tmpdir(), 'icarus-browser-'));
  // Port 0 lets the browser pick a free port and write it to DevToolsActivePort in the profile.
  // CI runners cannot give Chrome a working sandbox; the only page loaded is the app under test.
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    `--window-size=${width},${height}`, '--hide-scrollbars', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  let finished = false;
  process.on('exit', () => {
    try { chrome.kill(); } catch { /* already gone */ }
    try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still hold a lock */ }
  });
  const fail = msg => { console.error(msg); process.exit(2); };
  chrome.on('error', e => fail(`Browser did not start: ${CHROME} (${e.message})`));
  chrome.on('exit', code => { if (!finished) fail(`Browser exited unexpectedly (code ${code}): ${CHROME}`); });

  let pageTarget;
  for (let i = 0; i < 75 && !pageTarget; i++) {
    try {
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
      pageTarget = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find(t => t.type === 'page');
    } catch { /* browser not ready yet */ }
    if (!pageTarget) await sleep(200);
  }
  if (!pageTarget) fail(`Browser did not start: ${CHROME}`);
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); })
    .catch(() => fail('Could not connect to the browser'));
  ws.addEventListener('close', () => { if (!finished) fail('Lost the connection to the browser'); });
  let seq = 0; const pending = new Map(); const errors = [];
  ws.addEventListener('message', ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); }
    if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '));
  });
  const send = (method, params = {}) => new Promise((res, rej) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); rej(new Error(`${method} timed out after 30 s`)); }, 30000);
    pending.set(id, m => { clearTimeout(timer); res(m); });
    ws.send(JSON.stringify({ id, method, params }));
  });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
    if (r.result?.exceptionDetails) throw new Error(r.result.exceptionDetails.exception?.description || 'eval error');
    return r.result?.result?.value;
  };
  await send('Runtime.enable');
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: pageUrl });
  for (let i = 0; i < 75; i++) {
    if (await ev(`document.readyState === 'complete' && typeof SPECIES_DATA === 'object'`).catch(() => false)) break;
    await sleep(200);
  }
  await sleep(300);
  const close = async () => {
    finished = true; ws.close(); chrome.kill();
    await new Promise(r => { chrome.once('exit', r); setTimeout(r, 3000); });
  };
  return { ev, send, errors, close };
}
