// Shared headless-browser harness for tools/smoke.mjs and tools/screenshots.mjs.
// Drives Chrome, Chromium or Edge through the DevTools protocol with Node's built-in fetch and WebSocket; no packages.
import { spawn, spawnSync } from 'node:child_process';
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
 * Start a headless browser and open `pageUrl`. Resolves to { ev, send, errors, reload, close }.
 * `ev(expr)` evaluates JavaScript in the page and returns its value; `errors` collects page exceptions and console errors.
 * `reload()` reloads the page and waits until the app has loaded again.
 * `initScript` is JavaScript that runs in the page before any of its own scripts (used to freeze the clock).
 * Exits the process with code 2 when no browser can be started.
 */
export async function openPage(pageUrl, { width = 1600, height = 1200, initScript = '' } = {}) {
  const CHROME = process.env.CHROME_PATH || (BROWSER_CANDIDATES[process.platform] || []).find(p => existsSync(p));
  if (!CHROME) { console.error('No Chrome, Chromium or Edge found. Set CHROME_PATH to the browser executable.'); process.exit(2); }
  const profile = mkdtempSync(join(tmpdir(), 'icarus-browser-'));
  // Port 0 lets the browser pick a free port and write it to DevToolsActivePort in the profile.
  // CI runners cannot give Chrome a working sandbox; the only page loaded is the app under test.
  // The extra flags keep the test browser from contacting other servers or loading extensions installed on the system.
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--no-first-run',
    '--disable-background-networking', '--disable-component-update', '--disable-extensions', '--disable-sync', '--disable-default-apps',
    '--no-default-browser-check', '--metrics-recording-only', '--no-proxy-server',
    `--window-size=${width},${height}`, '--hide-scrollbars', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
  let finished = false;
  // Delete the profile only after Chrome has exited, because Chrome holds files in it until then (retries cover a late release on Windows)
  const removeProfile = () => {
    for (let i = 0; i < 10; i++) {
      try { rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); return; } catch { /* still locked */ }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 200);
    }
  };
  // Always stop the browser and remove the throwaway profile, however the script ends
  process.on('exit', () => {
    // chrome.kill() ends only the main process on Windows; its helper processes keep the profile locked, so end the whole tree
    if (process.platform === 'win32' && chrome.pid) spawnSync('taskkill', ['/PID', String(chrome.pid), '/T', '/F'], { stdio: 'ignore' });
    try { chrome.kill(); } catch { /* already gone */ }
    removeProfile();
  });
  // Ctrl+C and termination do not run exit handlers by themselves; turn them into a normal exit
  process.once('SIGINT', () => process.exit(130));
  process.once('SIGTERM', () => process.exit(143));
  const fail = msg => { console.error(msg); process.exit(2); };
  chrome.on('error', e => fail(`Browser did not start: ${CHROME} (${e.message})`));
  chrome.on('exit', code => { if (!finished) fail(`Browser exited unexpectedly (code ${code}): ${CHROME}`); });

  // Wait for the port file, then for a page target (the first /json reply can come before the page exists)
  let pageTarget, lastErr = '', targets = [];
  for (let i = 0; i < 150 && !pageTarget; i++) {   // up to 30 s: a cold CI runner once needed more than 15
    try {
      const port = readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0].trim();
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
      pageTarget = targets.find(t => t.type === 'page');
    } catch (e) { lastErr = e.message; /* browser not ready yet */ }
    if (!pageTarget) await sleep(200);
  }
  // Say what was seen, so a failure on another machine or in CI can be read from the log
  if (!pageTarget) fail(`Browser did not start: ${CHROME} (port file ${existsSync(join(profile, 'DevToolsActivePort')) ? 'written' : 'missing'}; `
    + `last error: ${lastErr || 'none'}; targets: ${JSON.stringify(targets.map(t => [t.type, t.url]))})`);
  const ws = new WebSocket(pageTarget.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res, { once: true }); ws.addEventListener('error', rej, { once: true }); })
    .catch(() => fail('Could not connect to the browser'));
  // A lost connection ends the run instead of leaving commands waiting forever
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
    pending.set(id, m => { clearTimeout(timer); if (m.error) rej(new Error(`${method} failed: ${m.error.message}`)); else res(m); });
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
  if (initScript) await send('Page.addScriptToEvaluateOnNewDocument', { source: initScript });
  // Wait until the app has loaded, instead of a fixed delay. `extra` is a further condition on the page.
  // Gives up after 15 s with an error, so checks never run against a page that did not load
  const waitForApp = async (extra = 'true') => {
    for (let i = 0; i < 75; i++) {
      if (await ev(`document.readyState === 'complete' && typeof SPECIES_DATA === 'object' && (${extra})`).catch(() => false)) {
        await sleep(300);
        return;
      }
      await sleep(200);
    }
    throw new Error(`The app did not load within 15 s: ${pageUrl}`);
  };
  await send('Page.navigate', { url: pageUrl });
  await waitForApp();
  /**
   * Reload the page, as a player closing and opening it again; browser storage and IndexedDB stay.
   * Resolves once the new page has loaded: the marker set here is gone only from the new page
   */
  const reload = async () => {
    await ev(`window.__beforeReload = true`);
    await send('Page.reload', { ignoreCache: true });
    await waitForApp('!window.__beforeReload');
  };
  const close = async () => {
    finished = true; ws.close(); chrome.kill();
    await new Promise(r => { chrome.once('exit', r); setTimeout(r, 3000); });
    removeProfile();
  };
  return { ev, send, errors, reload, close };
}
