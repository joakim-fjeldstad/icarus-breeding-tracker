// Headless browser smoke test for Icarus Breeding Tracker.
// Drives the app through the Chrome DevTools protocol with Node's built-in fetch and WebSocket, so it needs no packages.
//
// Usage:  node tools/smoke.mjs [path/to/index.html]    (defaults to index.html in the repository root)
// Needs:  Node.js 22 or newer, and Chrome, Chromium or Edge. Set CHROME_PATH if the browser is not found.
// Output: one PASS/FAIL line per check, then a summary. Exit code 1 if any check fails, 2 if the browser cannot start.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const BROWSER_CANDIDATES = {
  win32:  ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
           'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'],
  darwin: ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium'],
  linux:  ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser', '/snap/bin/chromium'],
};
const CHROME = process.env.CHROME_PATH || (BROWSER_CANDIDATES[process.platform] || []).find(p => existsSync(p));
if (!CHROME) { console.error('No Chrome, Chromium or Edge found. Set CHROME_PATH to the browser executable.'); process.exit(2); }

const page = pathToFileURL(resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'))).href;
const profile = mkdtempSync(join(tmpdir(), 'icarus-smoke-'));
// Port 0 lets the browser pick a free port and write it to DevToolsActivePort in the profile.
// CI runners cannot give Chrome a working sandbox; the only page loaded is the app under test.
const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
  '--no-first-run', '--window-size=1600,1200', ...(process.env.CI ? ['--no-sandbox'] : []), 'about:blank'], { stdio: 'ignore' });
let finished = false;
// Always stop the browser and remove the throwaway profile, however the script ends
process.on('exit', () => {
  try { chrome.kill(); } catch { /* already gone */ }
  try { rmSync(profile, { recursive: true, force: true }); } catch { /* Windows may still hold a lock */ }
});
const fail = msg => { console.error(msg); process.exit(2); };
chrome.on('error', e => fail(`Browser did not start: ${CHROME} (${e.message})`));
chrome.on('exit', code => { if (!finished) fail(`Browser exited unexpectedly (code ${code}): ${CHROME}`); });

const sleep = ms => new Promise(r => setTimeout(r, ms));
// Wait for the port file, then for a page target (the first /json reply can come before the page exists)
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
await send('Page.navigate', { url: page });
// Wait until the app has loaded, instead of a fixed delay
for (let i = 0; i < 75; i++) {
  if (await ev(`document.readyState === 'complete' && typeof SPECIES_DATA === 'object'`).catch(() => false)) break;
  await sleep(200);
}
await sleep(300);

const results = [];
const check = (name, ok, detail = '') => results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  (' + detail + ')' : ''}`);

// Start with browser storage and seed a herd covering every species
await ev(`useBrowserStorage(); true`);
await sleep(500);
await ev(`(() => {
  animals.length = 0;
  const statuses = ['Keep','Breed','Station','Dead','Reserve','?'];
  let id = 1;
  for (const sp of Object.keys(SPECIES_DATA)) {
    const cfg = SPECIES_DATA[sp];
    for (let i = 0; i < 6; i++) {
      const stats = {}; STATS.forEach((s, k) => stats[s] = (i + k) % 11);
      const ph = cfg.phenotypes[i % cfg.phenotypes.length].label;
      const bl = BLOODLINES[i % BLOODLINES.length];
      const a = { id: id++, spId: i + 1, sp, sex: i % 2 ? 'F' : 'M', bl, ph, gen: 1, p1: '', p2: '',
        stats, total: getTotal(stats, sp), status: statuses[i], notes: '' };
      a.name = computeName(sp, a.sex, bl, ph, stats, a.spId);
      animals.push(a);
    }
  }
  animals[0].nickname = 'Bucephalus';
  nextSpAid = {};
  saveAndRefreshFull();
  return animals.length;
})()`);
const total = await ev(`animals.length`);
check('seed herd', total > 0, `${total} animals, ${await ev('Object.keys(SPECIES_DATA).length')} species`);

const rows = () => ev(`document.querySelectorAll('#herd-tbody tr').length`);
const pill = (type, val) => ev(`(() => { const b = [...document.querySelectorAll('[data-filter-type="${type}"]')].find(x => (x.getAttribute('onclick')||'').includes("'${val}'")); setFilter('${type}','${val}', b); return true; })()`);

await ev(`showDead = false; showStation = false; renderHerd(); true`);
await pill('status', 'Station');
const nStation = await ev(`animals.filter(a => a.status === 'Station').length`);
check('Station pill shows Station animals with toggle off', (await rows()) === nStation, `${await rows()} rows, expected ${nStation}`);
await pill('status', 'Dead');
const nDead = await ev(`animals.filter(a => a.status === 'Dead').length`);
check('Dead pill shows Dead animals with toggle off', (await rows()) === nDead, `${await rows()} rows, expected ${nDead}`);
await pill('status', 'all');
const nVisible = await ev(`animals.filter(a => a.status !== 'Dead' && a.status !== 'Station').length`);
check('All hides Dead and Station by default', (await rows()) === nVisible, `${await rows()} rows, expected ${nVisible}`);

const firstId = await ev(`formatSpId(animals[0].sp, animals[0].spId)`);
await ev(`setSearch(${JSON.stringify(firstId)}); true`);
check('search by ID', (await rows()) >= 1, `${firstId}: ${await rows()} rows`);
await ev(`setSearch('bucephalus'); true`);
check('search by nickname', (await rows()) === 1, `${await rows()} rows`);
await ev(`setSearch('zzzz-no-match'); true`);
const emptyText = await ev(`document.getElementById('herd-empty').textContent.trim()`);
check('no-match empty state', (await rows()) === 0 && /match/.test(emptyText), emptyText);
await ev(`setSearch(''); true`);

// CSV round-trip: capture exportCSV output, re-import it, expect no growth
await ev(`window.__csv = null; const _b = window.Blob; window.Blob = function(parts, o) { window.__csv = parts.join(''); return new _b(parts, o); }; URL.createObjectURL = () => 'blob:x'; HTMLAnchorElement.prototype.click = function(){}; exportCSV(); window.Blob = _b; true`);
const csvLen = await ev(`window.__csv ? window.__csv.split('\\n').length - 1 : -1`);
check('export CSV', csvLen === total, `${csvLen} data rows`);
const importText = async text => ev(`new Promise(res => {
  const before = animals.length;
  const f = new File([${JSON.stringify(text)}], 'h.csv', { type: 'text/csv' });
  const origToast = showToast; let msg = '';
  showToast = m => { msg = m; };
  importCSV({ target: { files: [f], value: '' } });
  setTimeout(() => { showToast = origToast; res({ before, after: animals.length, msg }); }, 800);
})`);
const csv = await ev(`window.__csv`);
let r = await importText(csv);
check('re-import own export adds nothing', r.after === r.before, `${r.before} -> ${r.after}; ${r.msg}`);

// Name containing a double quote (exportCSV does not quote fields)
await ev(`animals[1].name = 'Big "Red" one'; saveAndRefreshFull(); window.__csv = null; const _b2 = window.Blob; window.Blob = function(p, o) { window.__csv = p.join(''); return new _b2(p, o); }; exportCSV(); window.Blob = _b2; true`);
const csvQ = await ev(`window.__csv`);
await ev(`animals.length = 0; saveAndRefreshFull(); true`);
r = await importText(csvQ);
check('round-trip with a quote in a name keeps all animals', r.after === total, `${r.after} of ${total}; ${r.msg}`);

// Hard round-trip: odd quote, comma + newline in notes, formula-like name, nickname/favorite survive
await ev(`(() => {
  animals[1].name = '5" tall';
  animals[2].notes = 'line one, with comma\\nline two "quoted"';
  animals[3].name = '=HYPERLINK("x")';
  animals[4].nickname = 'Nick, the "Bold"'; animals[4].favorite = true;
  saveAndRefreshFull(); return true; })()`);
await ev(`window.__csv = null; const _b3 = window.Blob; window.Blob = function(p, o) { window.__csv = p.join(''); return new _b3(p, o); }; exportCSV(); window.Blob = _b3; true`);
const csvHard = await ev(`window.__csv`);
check('export guards formula', /"'=HYPERLINK/.test(csvHard));
const snapshot = await ev(`JSON.stringify(animals.slice(0, 6).map(a => [a.name, a.notes, a.nickname || '', !!a.favorite]))`);
await ev(`animals.length = 0; saveAndRefreshFull(); true`);
r = await importText(csvHard);
check('hard round-trip keeps every animal', r.after === total, `${r.after} of ${total}; ${r.msg}`);
const after = await ev(`JSON.stringify(animals.slice(0, 6).map(a => [a.name, a.notes, a.nickname || '', !!a.favorite]))`);
check('hard round-trip keeps names, notes, nickname, favorite', after === snapshot, after === snapshot ? '' : after.slice(0, 200));

// Search with unpadded ID
await ev(`showTab('herd'); setFilter('status','all',null); setSearch(${JSON.stringify((await ev(`getShort(animals[0].sp) + animals[0].spId`)).toLowerCase())}); true`).catch(() => {});
check('search by unpadded ID', (await rows()) >= 1, `${await rows()} rows`);
await ev(`setSearch(''); true`);

// XSS via parent1 must not create elements in lineage or pair views
r = await importText('species,spId,name,bloodline,parent1\n' + (await ev(`animals[0].sp`)) + ',,Xss Test,Wild,<img src=x id=pwn onerror=window.__pwned=1>');
await ev(`(() => { try { const a = animals.find(x => x.name === 'Xss Test'); const t = buildLineageTree(a.name, 0, 3); document.body.insertAdjacentHTML('beforeend', '<div id=lt>' + renderTreeRecursive(t) + '</div>'); } catch (e) { window.__lterr = e.message; } return true; })()`);
await sleep(300);
const pwned = await ev(`!!(window.__pwned || document.getElementById('pwn'))`);
const lterr = await ev(`window.__lterr || ''`);
check('lineage escapes parent name', !pwned && !lterr, lterr || (pwned ? 'payload executed' : ''));

// Goals tab: every species should get a card or a collapsed chip, and no error placeholders
const goalCounts = () => ev(`({
  ok: document.querySelectorAll('#goals-grid .goals-card:not(.goals-card-error)').length + document.querySelectorAll('#goals-chips-row .species-chip').length,
  broken: document.querySelectorAll('#goals-grid .goals-card-error').length })`);
await ev(`showTab('goals'); renderGoals(); true`).catch(e => errors.push('showTab/renderGoals: ' + e.message));
await sleep(500);
const nSp = await ev(`Object.keys(SPECIES_DATA).length`);
let gc = await goalCounts();
check('Goals tab renders every species', gc.ok === nSp && gc.broken === 0, `${gc.ok} of ${nSp}, ${gc.broken} broken`);

// Negative star on a trait an animal has (issues #1 and #2: a ReferenceError hid that card and every card after it)
// Starring every bloodline in the species negatively leaves no clean animal, so the negative-trait section always renders
const negTarget = await ev(`(() => {
  const sp = animals.find(x => x.bl && x.status !== 'Dead' && x.status !== 'Discard').sp;
  initGoals();
  animals.filter(x => x.sp === sp && x.bl).forEach(x => { goalsMap[sp].blPriority[x.bl] = -1; });
  renderGoals();
  return sp; })()`).catch(e => { errors.push('negative star: ' + e.message); return ''; });
const negSug = await ev(`(() => { try { return renderSuggestions(${JSON.stringify(negTarget)}).includes('Negative-trait'); } catch (e) { return e.message; } })()`);
gc = await goalCounts();
check('Goals tab with a negative star renders every species', gc.ok === nSp && gc.broken === 0, `${negTarget}: ${gc.ok} of ${nSp}, ${gc.broken} broken`);
check('negative-trait suggestion section renders', negSug === true, String(negSug));

// Negative phenotype with no negative bloodline: the other branch of the same template ('phenotype' wording)
const phTarget = await ev(`(() => {
  const sp = Object.keys(SPECIES_DATA).find(s => s !== ${JSON.stringify(negTarget)} && animals.some(x => x.sp === s && x.ph && x.status !== 'Dead' && x.status !== 'Discard'));
  initGoals();
  goalsMap[sp].blPriority = { Unstable: 0 };
  animals.filter(x => x.sp === sp && x.ph).forEach(x => { goalsMap[sp].phenoWeights[x.ph] = -1; });
  renderGoals();
  return sp; })()`).catch(e => { errors.push('negative phenotype: ' + e.message); return ''; });
const phSug = await ev(`(() => { try { return /same-phenotype animal/.test(renderSuggestions(${JSON.stringify(phTarget)})); } catch (e) { return e.message; } })()`);
gc = await goalCounts();
check('Goals tab with a negative phenotype renders every species', gc.ok === nSp && gc.broken === 0, `${phTarget}: ${gc.ok} of ${nSp}, ${gc.broken} broken`);
check('negative phenotype uses phenotype wording', phSug === true, String(phSug));

// A failure after the card is on the page (radar drawing) must leave the card and add no error card
const errsBeforeRadar = errors.length;
await ev(`(() => {
  const orig = _drawGoalSightingRadars;
  _drawGoalSightingRadars = () => { throw new Error('radar test failure'); };
  try { renderGoals(); } finally { _drawGoalSightingRadars = orig; }
  return true; })()`).catch(e => errors.push('radar failure: ' + e.message));
gc = await goalCounts();
check('radar failure keeps cards and adds no error card', gc.ok === nSp && gc.broken === 0, `${gc.ok} of ${nSp}, ${gc.broken} broken`);
errors.splice(errsBeforeRadar, errors.length - errsBeforeRadar, ...errors.slice(errsBeforeRadar).filter(e => !/Goals tab: could not finish/.test(e)));

// One species card that throws must only replace itself, and the error text must not be parsed as HTML
const errsBefore = errors.length;
const iso = await ev(`(() => {
  const broken = getSpeciesOrder()[1];
  const orig = renderSuggestions;
  renderSuggestions = sp => { if (sp === broken) throw new Error('<img id=pwn2 src=x onerror="window.__pwned2=1">'); return orig(sp); };
  try { renderGoals(); } finally { renderSuggestions = orig; }
  const errCards = [...document.querySelectorAll('#goals-grid .goals-card-error')];
  return { broken, errCards: errCards.length, title: errCards[0]?.querySelector('h3')?.textContent || '' };
})()`).catch(e => ({ error: e.message }));
await sleep(300);
gc = await goalCounts();
const pwned2 = await ev(`!!(window.__pwned2 || document.getElementById('pwn2'))`);
check('one broken card does not hide the others', iso.errCards === 1 && iso.title === iso.broken && gc.ok === nSp - 1, `${JSON.stringify(iso)}; ${gc.ok} of ${nSp - 1} others`);
check('error card shows the message as text', !pwned2, pwned2 ? 'payload executed' : '');
// The console.error from the deliberate failure is expected; drop it before the final check
errors.splice(errsBefore, errors.length - errsBefore, ...errors.slice(errsBefore).filter(e => !/Goals tab: could not render/.test(e)));
await ev(`renderGoals(); true`).catch(e => errors.push('final renderGoals: ' + e.message.split('\n')[0]));

// v0.30 species data: every species says how it is obtained; breedable ones name a serum; snare ones name a bait
const dataProblems = await ev(`Object.entries(SPECIES_DATA).flatMap(([k, v]) => [
  !['juvenile','snare','station','mission'].includes(v.obtain) && k + ': obtain',
  v.breedable !== false && !v.serum && k + ': serum missing',  // the app treats a missing flag as breedable
  !v.breedable && v.serum && k + ': serum on non-breedable',
  v.obtain === 'snare' && !(v.bait && v.baitBiomes && v.baitBiomes.length) && k + ': bait',
  'tameable' in v && k + ': old tameable field'].filter(Boolean))`);
check('species data has obtain, serum and bait fields', dataProblems.length === 0, dataProblems.join(', '));
const formOptions = await ev(`[...document.querySelectorAll('#f-species option')].map(o => o.value)`);
const missingOpts = await ev(`Object.keys(SPECIES_DATA).filter(sp => !${JSON.stringify(formOptions)}.includes(sp))`);
check('New Animal form lists every species', missingOpts.length === 0, missingOpts.join(', '));

// New Animal form texts for each way of obtaining a species
const formText = sp => ev(`(() => { const s = document.getElementById('f-species'); s.value = ${JSON.stringify(sp)}; onSpeciesChange();
  const nb = document.getElementById('no-breed-notice'), bi = document.getElementById('breed-info'), pr = document.getElementById('parent-fields-row');
  return { notice: nb.style.display !== 'none' ? document.getElementById('no-breed-source').textContent : null,
           breed: !bi ? 'no #breed-info element' : bi.hidden ? null : bi.textContent, parents: pr.style.display !== 'none' }; })()`)
  .catch(e => ({ error: e.message.split('\n')[0] }));
const expectText = [
  ['Moa',         r => r.parents && /Breed with Moa Fertility Serum\. Tamed from a wild juvenile\./.test(r.breed) && r.notice === null],
  ['Draven',      r => !r.parents && r.notice === 'Tamed from a wild juvenile.' && r.breed === null],
  ['Forest Wolf', r => r.parents && /Wolf Fertility Serum\. Caught with a Snare Trap and Wolf Bait \(Forest, Grassland\)\./.test(r.breed)],
  ['Kiwi',        r => !r.parents && r.notice === 'Caught with a Snare Trap and Kiwi Bait (Forest, Grassland, Arctic, at night).'],
  ['Cattle',      r => r.parents && /Bull Fertility Serum\. Bought from the station\./.test(r.breed)],
  ['Zebra',       r => !r.parents && r.notice === 'Mission reward.'],
];
expectText.push(['an unknown species', r => r.breed === null]);  // select falls back to '' for a value with no option
for (const [sp, ok] of expectText) { const r = await formText(sp === 'an unknown species' ? 'Not A Species' : sp); check(`form text for ${sp}`, ok(r), JSON.stringify(r)); }

// Lineage insights: a breed-out stat from a loaded file is only used if it is a known stat, and is never rendered as HTML
const lin = await ev(`(() => {
  const m = animals.find(a => a.sp === 'Moa' && a.sex === 'M'), f = animals.find(a => a.sp === 'Moa' && a.sex === 'F');
  const stats = {}; STATS.forEach(s => stats[s] = 5);
  const c = { id: 999001, spId: 99, sp: 'Moa', sex: 'F', bl: 'Wild', ph: SPECIES_DATA.Moa.phenotypes[0].label, gen: 2,
              p1: m.name, p2: f.name, stats, total: getTotal(stats, 'Moa'), status: '?', notes: '' };
  c.name = computeName('Moa', 'F', 'Wild', c.ph, stats, 99);
  animals.push(c);
  goalsMap.Moa.breedOutStat = '<img id=pwn4 src=x onerror="window.__pwned4=1">';
  updateLineageSelector();
  document.getElementById('lin-animal-select').value = c.name;
  renderLineage();
  const shown = document.getElementById('insights-content').textContent;
  const bo = getBreedOut('Moa');
  initGoals();
  return { bo, stored: goalsMap.Moa.breedOutStat, insights: /Breed-out stat\\s*VIG/.test(shown) };
})()`).catch(e => ({ error: e.message.split('\n')[0] }));
await sleep(300);
const pwned4 = await ev(`!!(window.__pwned4 || document.getElementById('pwn4'))`);
check('hostile breed-out stat is ignored and never rendered as HTML', !pwned4 && lin.bo === 'VIG' && lin.stored === 'VIG' && lin.insights,
  JSON.stringify(lin) + (pwned4 ? ' payload executed' : ''));
await ev(`animals = animals.filter(a => a.id !== 999001); saveAndRefreshFull(); true`).catch(() => {});
await formText('Dune Raptor');

// A saved species order from before v0.30 places the new species next to their neighbours
const orderCheck = await ev(`(() => {
  const saved = speciesOrder;
  speciesOrder = Object.keys(SPECIES_DATA).filter(sp => sp !== 'Shaggy Zebra' && sp !== 'Kiwi').reverse();
  const o = getSpeciesOrder();
  speciesOrder = [];
  const fresh = getSpeciesOrder();
  speciesOrder = saved;
  return { sz: o.indexOf('Shaggy Zebra') === o.indexOf('Zebra') + 1, kw: o.indexOf('Kiwi') === o.indexOf('Storca') + 1,
           all: o.length === Object.keys(SPECIES_DATA).length && new Set(o).size === o.length,
           fresh: JSON.stringify(fresh) === JSON.stringify(Object.keys(SPECIES_DATA)) }; })()`);
check('saved order places new species next to neighbours', orderCheck.sz && orderCheck.kw && orderCheck.all && orderCheck.fresh, JSON.stringify(orderCheck));

// An old, short saved order (from when the app had four species) must not split a category; duplicates are dropped
const shortOrder = await ev(`(() => {
  const saved = speciesOrder, keys = Object.keys(SPECIES_DATA);
  const blocks = o => o.map(sp => SPECIES_DATA[sp].category).filter((c, i, a) => c !== a[i - 1]);
  speciesOrder = ['Slinker', 'Dune Raptor', 'Swamp Raptor', 'Moa'];
  const o = getSpeciesOrder();
  speciesOrder = ['Pig', 'Pig', 'Moa', 'Pig'];
  const d = getSpeciesOrder();
  speciesOrder = saved;
  return { blocks: blocks(o).join(' > '), keepsSaved: o.indexOf('Slinker') < o.indexOf('Dune Raptor') && o.indexOf('Dune Raptor') < o.indexOf('Moa'),
           complete: o.length === keys.length && new Set(o).size === keys.length, dedup: d.length === keys.length && new Set(d).size === keys.length }; })()`);
check('short saved order keeps each category together', shortOrder.blocks === 'Mount > Attack Pet > Utility Pet' && shortOrder.keepsSaved && shortOrder.complete && shortOrder.dedup, JSON.stringify(shortOrder));

// Dropping something that is not a species card (a link, file or text) must not change the order
const dropCheck = await ev(`(() => {
  const saved = speciesOrder; speciesOrder = [];
  const before = JSON.stringify(getSpeciesOrder());
  reorderSpecies('https://example.com/', 'Moa');
  const after = JSON.stringify(getSpeciesOrder());
  const junk = speciesOrder.includes('https://example.com/');
  speciesOrder = saved; return { unchanged: before === after, junk }; })()`);
check('dropping a non-species item does not reorder', dropCheck.unchanged && !dropCheck.junk, JSON.stringify(dropCheck));

// Phenotype counts and weights from the game data (#13)
const phenoCheck = await ev(`({ Tusker: SPECIES_DATA.Tusker.phenotypes.map(p => p.weight).join(','), Ubis: SPECIES_DATA.Ubis.phenotypes.map(p => p.weight).join(','),
  'Wild Boar': SPECIES_DATA['Wild Boar'].phenotypes.map(p => p.weight).join(','), BuffaloP5: SPECIES_DATA.Buffalo.phenotypes[5].weight })`);
check('phenotype weights match the game data', phenoCheck.Tusker === '2000,50,50,50,50,50,5' && phenoCheck.Ubis === '2000,50,50,50,50,50,50,5'
  && phenoCheck['Wild Boar'] === '2000,50,50,50,50,50,5,5' && phenoCheck.BuffaloP5 === 5, JSON.stringify(phenoCheck));

// Parents and species that cannot be bred: a new entry clears typed parents; an existing animal with parents keeps them visible
const parentCheck = await ev(`(() => {
  editingId = null;
  const s = document.getElementById('f-species'), row = document.getElementById('parent-fields-row'), odds = document.getElementById('prob-panel');
  s.value = 'Moa'; onSpeciesChange();
  document.getElementById('f-p1').value = 'Some parent'; onParentInput(1);
  s.value = 'Draven'; onSpeciesChange();
  const cleared = document.getElementById('f-p1').value === '';
  const m = animals.find(a => a.sp === 'Moa' && a.sex === 'M'), f = animals.find(a => a.sp === 'Moa' && a.sex === 'F');
  const stats = {}; STATS.forEach(k => stats[k] = 4);
  const dv = { id: 999002, spId: 98, sp: 'Draven', sex: 'M', bl: 'Wild', ph: SPECIES_DATA.Draven.phenotypes[0].label, gen: 2,
               p1: m.name, p2: f.name, stats, total: getTotal(stats, 'Draven'), status: '?', notes: '' };
  dv.name = computeName('Draven', 'M', 'Wild', dv.ph, stats, 98); animals.push(dv);
  editAnimal(999002);
  const notice = document.getElementById('no-breed-notice');
  const shownWhileEditing = row.style.display !== 'none', oddsHidden = !odds.classList.contains('show'), noticeHidden = notice.style.display === 'none';
  editingId = null; resetFormUI();
  const hiddenAfterCancel = row.style.display === 'none';
  // Editing a breedable animal with parents, then switching to a species that cannot be bred: no stale odds, parents stay visible
  const mc = { ...dv, id: 999003, spId: 97, sp: 'Moa', ph: SPECIES_DATA.Moa.phenotypes[0].label };
  mc.name = computeName('Moa', 'M', 'Wild', mc.ph, stats, 97); animals.push(mc);
  editAnimal(999003);
  const oddsForMoa = odds.classList.contains('show');
  s.value = 'Zebra'; onSpeciesChange();
  const switched = { oddsHidden: !odds.classList.contains('show'), parentsVisible: row.style.display !== 'none', p1Kept: document.getElementById('f-p1').value === m.name };
  editingId = null; resetFormUI();
  animals = animals.filter(a => a.id !== 999002 && a.id !== 999003);
  s.value = 'Dune Raptor'; onSpeciesChange();
  return { cleared, shownWhileEditing, oddsHidden, noticeHidden, hiddenAfterCancel, oddsForMoa, switched }; })()`).catch(e => ({ error: e.message.split('\n')[0] }));
check('parent fields for species that cannot be bred', parentCheck.cleared && parentCheck.shownWhileEditing && parentCheck.oddsHidden && parentCheck.noticeHidden && parentCheck.hiddenAfterCancel, JSON.stringify(parentCheck));
check('switching species while editing refreshes the odds', parentCheck.oddsForMoa && parentCheck.switched?.oddsHidden && parentCheck.switched?.parentsVisible && parentCheck.switched?.p1Kept, JSON.stringify(parentCheck.switched));

// Editing an animal whose species is unknown (for example from a loaded file) must not throw, even with leftover parent text
const unknownEdit = await ev(`(() => {
  editingId = null; resetFormUI();
  const s = document.getElementById('f-species'); s.value = 'Moa'; onSpeciesChange();
  document.getElementById('f-p1').value = 'Unknown';
  const stats = {}; STATS.forEach(k => stats[k] = 3);
  animals.push({ id: 999004, spId: 1, sp: 'Not A Species', sex: 'F', bl: 'Wild', ph: '', gen: 1, p1: '', p2: '', stats, total: 21, status: '?', notes: '', name: 'Stray' });
  let error = null;
  try { editAnimal(999004); } catch (e) { error = e.message; }
  const button = document.getElementById('save-btn').textContent;
  editingId = null; resetFormUI();
  animals = animals.filter(a => a.id !== 999004);
  s.value = 'Dune Raptor'; onSpeciesChange();
  return { error, updateMode: /Update/.test(button) }; })()`).catch(e => ({ error: e.message.split('\n')[0] }));
check('editing an animal with an unknown species does not throw', !unknownEdit.error && unknownEdit.updateMode, JSON.stringify(unknownEdit));

// Updating an existing animal must not open the pair placement panel (it is only for new animals)
const pairPanel = await ev(`(() => {
  const a = animals.find(x => x.sp === 'Moa');
  editAnimal(a.id); saveAnimal();
  const shown = document.getElementById('pair-assign-panel').style.display !== 'none';
  dismissPairAssign(); return shown; })()`).catch(e => 'error: ' + e.message.split('\n')[0]);
check('updating an animal does not open pair placement', pairPanel === false, String(pairPanel));

// ── Import from game (Mounts.json) ──────────────────────────────────────────────────
// Synthetic fixtures only: the generator below encodes property-tag blobs from scratch.
const fx = (() => {
  const enc = new TextEncoder();
  const fstr = s => { const b = enc.encode(s); const o = new Uint8Array(5 + b.length); new DataView(o.buffer).setInt32(0, b.length + 1, true); o.set(b, 4); return o; };
  const i32 = n => { const o = new Uint8Array(4); new DataView(o.buffer).setInt32(0, n, true); return o; };
  const cat = (...p) => { const o = new Uint8Array(p.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of p) { o.set(x, k); k += x.length; } return o; };
  const Z16 = new Uint8Array(16), B0 = new Uint8Array([0]);
  const tag = (name, type, value, header = new Uint8Array(0)) => cat(fstr(name), fstr(type), i32(value.length), i32(0), header, B0, value);
  const T = {
    str: (n, v) => tag(n, 'StrProperty', fstr(v)), name: (n, v) => tag(n, 'NameProperty', fstr(v)), int: (n, v) => tag(n, 'IntProperty', i32(v)),
    bool: (n, v) => cat(fstr(n), fstr('BoolProperty'), i32(0), i32(0), new Uint8Array([v ? 1 : 0]), B0),
    struct: (n, s, body) => tag(n, 'StructProperty', body, cat(fstr(s), Z16)),
    unknown: (n, type, bytes) => tag(n, type, bytes),
    structArray: (n, s, elems) => { const body = cat(...elems); const inner = cat(fstr(n), fstr('StructProperty'), i32(body.length), i32(0), fstr(s), Z16, B0); return tag(n, 'ArrayProperty', cat(i32(elems.length), inner, body), fstr('StructProperty')); },
  };
  const props = (...t) => cat(...t, fstr('None'));
  const genes = ['Vitality', 'Endurance', 'Muscle', 'Agility', 'Toughness', 'Hardiness', 'Utility'];
  const blob = ({ name = 'A', sex = 1, variation = 0, lineage = 'Wild', mother = '', father = '', stats = [5, 5, 5, 5, 5, 5, 5], aiRow = 'Mount_Moa', version = 3, extra = [] } = {}) => Array.from(props(
    T.str('MountName', name),
    T.struct('OwnerCharacterID', 'PlayerCharacterID', props(T.str('PlayerID', 'PLAYERID-SECRET-7777'), T.int('ChrSlot', 0))),
    T.str('OwnerName', 'OWNERNAME-SECRET'),
    T.structArray('Genetics', 'MountGeneticsSaveData', genes.map((g, i) => props(T.name('GeneticValueName', g), T.int('Value', stats[i])))),
    T.int('Sex', sex), T.int('Variation', variation), T.name('Lineage', lineage), T.str('MotherName', mother), T.str('FatherName', father),
    T.name('AISetupRowName', aiRow), T.int('ActorStateRecorderVersion', version),
    T.structArray('BoolVariables', 'ActorBoolVariableRecord', [props(T.name('VariableName', 'bIsWildTame'), T.bool('bVariable', false))]),
    ...extra));
  const file = list => JSON.stringify({ SavedMounts: list.map((a, i) => ({ DatabaseGUID: 'noguid', RecorderBlob: { ComponentClassName: 'X', BinaryData: blob(a) },
    MountName: a.name || 'A', MountLevel: a.level ?? 1, MountType: a.type || 'Moa', MountIconName: String(1000 + i) })) });
  return { T, props, blob, file, cat, fstr, i32 };
})();

// Parser: round trip and hostile input, all inside the page
const parseCase = (label, bytes) => ev(`(() => { try { parseMountBlob(${JSON.stringify(Array.from(bytes))}); return 'ok'; } catch (e) { return e instanceof MountParseError ? 'ParseError' : 'other: ' + e.message; } })()`);
const rt = await ev(`(() => { const t = parseMountBlob(${JSON.stringify(fx.blob({ name: 'BM01 F42-Wild', sex: 1, variation: 3, lineage: 'Bold', mother: 'M', father: 'F', stats: [1, 2, 3, 4, 5, 6, 7] }))});
  return { name: t.MountName, sex: t.Sex, v: t.Variation, lin: t.Lineage, m: t.MotherName, f: t.FatherName, g: t.Genetics.length, g2: t.Genetics[2].GeneticValueName + t.Genetics[2].Value, wild: t.BoolVariables[0].bVariable, ver: t.ActorStateRecorderVersion, owner: 'OwnerName' in t, pid: 'OwnerCharacterID' in t }; })()`);
check('mount parser round trip', rt.name === 'BM01 F42-Wild' && rt.sex === 1 && rt.v === 3 && rt.lin === 'Bold' && rt.m === 'M' && rt.f === 'F' && rt.g === 7 && rt.g2 === 'Muscle3' && rt.wild === false && rt.ver === 3, JSON.stringify(rt));
check('mount parser never decodes owner name or player ID', rt.owner === false && rt.pid === false, JSON.stringify(rt));
const trunc = await ev(`(() => { const full = ${JSON.stringify(fx.blob())}; const bad = [];
  for (let n = 0; n < full.length; n++) { try { parseMountBlob(full.slice(0, n)); } catch (e) { if (!(e instanceof MountParseError)) bad.push(n + ':' + e.message); } } return bad; })()`);
check('mount parser contains truncation at every offset', trunc.length === 0, trunc.slice(0, 3).join(' | '));
check('mount parser rejects a negative string length', await parseCase('neg', fx.cat(fx.i32(-5000000), new Uint8Array(8))) === 'ParseError');
check('mount parser rejects a negative tag size', await parseCase('neg size', fx.cat(fx.fstr('X'), fx.fstr('IntProperty'), fx.i32(-1), fx.i32(0), new Uint8Array([0]), fx.i32(1))) === 'ParseError');
check('mount parser rejects a huge tag size', await parseCase('huge', fx.cat(fx.fstr('X'), fx.fstr('IntProperty'), fx.i32(0x7fffffff), fx.i32(0), new Uint8Array([0]), fx.i32(1))) === 'ParseError');
check('mount parser rejects a huge array count', await parseCase('huge arr', fx.cat(fx.fstr('X'), fx.fstr('ArrayProperty'), fx.i32(8), fx.i32(0), fx.fstr('IntProperty'), new Uint8Array([0]), fx.i32(0x7ffffff0), fx.i32(0))) === 'ParseError');
const unk = await ev(`(() => { const t = parseMountBlob(${JSON.stringify(Array.from(fx.props(fx.T.unknown('Weird', 'FancyProperty', new Uint8Array([9, 9, 9, 9, 9])), fx.T.int('Sex', 2))))}); return t.Weird && t.Weird.opaque === 'FancyProperty' && t.Sex === 2; })()`);
check('mount parser skips an unknown property type by its size', unk === true);
const proto = await ev(`(() => { const t = parseMountBlob(${JSON.stringify(Array.from(fx.props(fx.T.str('__proto__', 'x'), fx.T.str('constructor', 'y'), fx.T.name('Lineage', '__proto__'))))});
  return Object.getPrototypeOf(t) === null && t['__proto__'] === 'x' && ({}).polluted === undefined && t.Lineage === '__proto__'; })()`);
check('mount parser is safe against __proto__ names', proto === true);
let deep = fx.props(fx.T.int('V', 1)); for (let i = 0; i < 40; i++) deep = fx.props(fx.T.struct('S', 'Nest', deep));
check('mount parser rejects deep nesting', await parseCase('deep', deep) === 'ParseError');
const fuzz = await ev(`(() => { const base = ${JSON.stringify(fx.blob())}; let seed = 42; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; const bad = [];
  for (let k = 0; k < 500; k++) { const b = base.slice(); for (let j = 0; j < 1 + Math.floor(rnd() * 6); j++) b[Math.floor(rnd() * b.length)] = Math.floor(rnd() * 256);
    try { parseMountBlob(b); } catch (e) { if (!(e instanceof MountParseError)) bad.push(k + ':' + e.message); } } return bad; })()`);
check('mount parser survives 500 random mutations', fuzz.length === 0, fuzz.slice(0, 3).join(' | '));
check('mount parser rejects a blob over the size cap', await ev(`(() => { try { parseMountBlob(new Array(MOUNT_BLOB_MAX_BYTES + 1).fill(0)); return 'ok'; } catch (e) { return e instanceof MountParseError ? 'ParseError' : 'other'; } })()`) === 'ParseError');

// Plan and apply on the seeded herd
await ev(`animals.forEach(a => { a.nickname = ''; }); animals.find(x => x.sp === 'Slinker').nickname = 'Bucephalus'; saveAndRefreshFull(); true`);
const seedInfo = await ev(`(() => { const a = animals.find(x => x.sp === 'Dune Raptor' && x.status !== 'Dead'); const b = animals.find(x => x.sp === 'Slinker'); const g = animals.find(x => x.sp === 'Geothermal Raptor');
  const st = animals.filter(x => x.status === 'Station').length;
  return { aId: formatSpId(a.sp, a.spId), aSex: a.sex, aStats: STATS.map(s => a.stats[s]), aPh: SPECIES_DATA[a.sp].phenotypes.indexOf(SPECIES_DATA[a.sp].phenotypes.find(p => p.label === a.ph)), aBl: a.bl, aName: a.name,
    bSp: b.sp, bSex: b.sex, bStats: STATS.map(s => b.stats[s]), bPh: SPECIES_DATA[b.sp].phenotypes.findIndex(p => p.label === b.ph), bBl: b.bl, bName: b.name, bNick: b.nickname,
    gId: g.spId, gName: g.name, gSex: g.sex, gStats: STATS.map(s => g.stats[s]), gBl: g.bl, station: st, count: animals.length }; })()`);
const typeOf = sp => ({ 'Dune Raptor': 'Raptor_Desert', 'Geothermal Raptor': 'Raptor', Moa: 'Moa', Slinker: 'Slinker', Buffalo: 'Buffalo', 'Arctic Moa': 'Arctic_Moa', Draven: 'Chew', Horse: 'Horse_Standard', Terrenus: 'Horse', Tusker: 'Tusker', Ubis: 'SwampBird', 'Woolly Mammoth': 'WoollyMammoth', Zebra: 'Zebra', 'Shaggy Zebra': 'WoolyZebra', Gribbler: 'Tundra_Monkey', Hyena: 'Desert_Wolf', Skulk: 'Orka', 'Snow Wolf': 'Snow_Wolf', 'Wild Boar': 'Wild_Boar', 'Forest Wolf': 'Wolf', Storca: 'Storca', Kiwi: 'Kiwi', Cattle: 'Bull', Chicken: 'Chicken', Sheep: 'Sheep', Pig: 'Pig' })[sp];
const bl2 = l => l === 'Unstable' ? 'Fierce' : l;
const mountsText = fx.file([
  // 1: tracker ID in the name, one stat and the bloodline differ -> Changed
  { name: `${seedInfo.aId} something`, type: 'Raptor_Desert', sex: seedInfo.aSex === 'F' ? 1 : 2, variation: seedInfo.aPh, lineage: 'Fierce', stats: seedInfo.aStats.map((v, i) => i === 0 ? (v + 1) % 11 : v), level: 12 },
  // 2: nickname match, identical -> Unchanged
  { name: seedInfo.bNick, type: typeOf(seedInfo.bSp), sex: seedInfo.bSex === 'F' ? 1 : 2, variation: seedInfo.bPh, lineage: bl2(seedInfo.bBl), stats: seedInfo.bStats, level: 0 },
  // 3: legacy SR code for Geothermal Raptor, identical -> Unchanged
  { name: `SR${String(seedInfo.gId).padStart(2, '0')} old name`, type: 'Raptor', sex: seedInfo.gSex === 'F' ? 1 : 2, variation: 0, lineage: bl2(seedInfo.gBl), stats: seedInfo.gStats, level: 0 },
  // 4: new Moa whose father is animal 1 (by tracker name) and whose mother is animal 5 (same file)
  { name: 'Rex', type: 'Moa', sex: 2, variation: 7, lineage: 'Fierce', mother: 'Mum', father: seedInfo.aName, stats: [1, 2, 3, 4, 5, 6, 7], level: 30 },
  // 5: new Moa, parent of 4
  { name: 'Mum', type: 'Moa', sex: 1, variation: 0, lineage: 'Alpha', stats: [9, 9, 9, 9, 9, 9, 9], level: 0 },
  // 6: new black Horse (coat from the AI row)
  { name: 'Shadow', type: 'Horse_Standard', sex: 2, variation: 0, lineage: 'Wild', aiRow: 'Mount_Horse_Standard_A2', stats: [2, 2, 2, 2, 2, 2, 2] },
  // 7: same tracker ID as animal 1 but different data -> new, keeps the in-game name as nickname
  { name: `${seedInfo.aId} twin`, type: 'Raptor_Desert', sex: 1, variation: 1, lineage: 'Bold', stats: [3, 3, 3, 3, 3, 3, 3], level: 0 },
  // skipped: unknown species, no bloodline, newer version
  { name: 'Kitty', type: 'Cat', sex: 1, lineage: 'Wild' },
  { name: 'Oldie', type: 'WoolyZebra', sex: 1, lineage: 'None' },
  { name: 'Future', type: 'Moa', sex: 1, lineage: 'Wild', version: 4 },
]);
await ev(`window.__plan = planMountImport(${JSON.stringify(mountsText)}); true`);
const plan = await ev(`(() => { const p = window.__plan; return { total: p.total, added: p.added.map(r => r.c.gameName), changed: p.changed.map(x => x.diffs.map(d => d.field + ':' + d.from + '>' + d.to)), unchanged: p.unchanged.map(x => x.c.gameName),
  skipped: p.skipped.map(s => s.gameName + ': ' + s.reason), notInFile: p.notInFile.length, horse: p.added.find(r => r.c.gameName === 'Shadow')?.c.ph, rexBl: p.added.find(r => r.c.gameName === 'Rex')?.c.bl }; })()`);
check('mount preview groups new, changed, unchanged and skipped', plan.total === 10 && plan.added.join() === `Rex,Mum,Shadow,${seedInfo.aId} twin` && plan.changed.length === 1 && plan.unchanged.join() === `${seedInfo.bNick},SR${String(seedInfo.gId).padStart(2, '0')} old name`, JSON.stringify(plan));
check('mount preview lists each changed field and fills a missing level silently', plan.changed[0]?.length === 2 && plan.changed[0].some(d => d.startsWith('VIG:')) && plan.changed[0].some(d => d.endsWith('>Unstable')) && !plan.changed[0].some(d => d.startsWith('level:')), JSON.stringify(plan.changed));
check('mount preview skips with a reason', plan.skipped.length === 3 && /unknown species/.test(plan.skipped[0]) && /no bloodline/.test(plan.skipped[1]) && /newer save format/.test(plan.skipped[2]), plan.skipped.join(' | '));
check('mount preview flags station animals missing from the file', plan.notInFile === seedInfo.station - (await ev(`window.__plan.claimedIds.filter(id => animals.find(a => a.id === id).status === 'Station').length`)), `${plan.notInFile} of ${seedInfo.station}`);
check('mount import maps Fierce to Unstable and horse rows to coats', plan.rexBl === 'Unstable' && plan.horse === 'Black', `${plan.rexBl}, ${plan.horse}`);
const applied = await ev(`(() => { const p = window.__plan; const before = animals.length; const dead = p.notInFile[0]?.id;
  const choices = { addIdx: new Set(p.added.map((_, i) => i)), diffKeys: new Set(p.changed.flatMap(x => x.diffs.map(d => x.a.id + '|' + d.field))), stationAll: false, notInFile: new Map(dead ? [[dead, 'Dead']] : []) };
  const r = applyMountImport(p, choices);
  const rex = animals.find(a => a.nickname === 'Rex'), mum = animals.find(a => a.nickname === 'Mum'), shadow = animals.find(a => a.nickname === 'Shadow'), twin = animals.find(a => / twin$/.test(a.nickname || '')), a1 = p.changed[0].a;
  return { r, grew: animals.length - before, rexName: rex.name, rexP1: rex.p1, rexP2: rex.p2, rexGen: rex.gen, rexLevel: rex.level, rexStatus: rex.status, rexBred: rex.isBred, mumName: mum.name, mumLevel: mum.level, mumBred: mum.isBred,
    shadowPh: shadow.ph, twinOk: !!twin && twin.spId !== a1.spId, a1Vig: a1.stats.VIG, a1Bl: a1.bl, a1Level: a1.level, deadNow: dead ? animals.find(a => a.id === dead).status : 'n/a', idsUnique: new Set(animals.map(a => a.sp + '#' + a.spId)).size === animals.length }; })()`);
check('mount import adds the ticked animals with nickname, status and level', applied.grew === 4 && applied.r.added === 4 && /^BM\d+ /.test(applied.rexName) && applied.rexStatus === 'Station' && applied.rexLevel === 30 && applied.mumLevel === undefined && applied.idsUnique && applied.twinOk, JSON.stringify(applied));
check('mount import resolves parents inside the file and against the herd', applied.rexP1 === applied.mumName && applied.rexP2 === seedInfo.aName && applied.rexGen >= 2 && applied.rexBred === true && applied.mumBred === false, JSON.stringify(applied));
check('mount import applies ticked changes and status choices', applied.a1Vig === (seedInfo.aStats[0] + 1) % 11 && applied.a1Bl === 'Unstable' && applied.a1Level === 12 && applied.shadowPh === 'Black' && (applied.deadNow === 'Dead' || applied.deadNow === 'n/a'), JSON.stringify(applied));
const again = await ev(`(() => { const p = planMountImport(${JSON.stringify(mountsText)}); return { added: p.added.length, changed: p.changed.length, unchanged: p.unchanged.length }; })()`);
check('importing the same game file again adds nothing', again.added === 0 && again.changed === 0 && again.unchanged === 7, JSON.stringify(again));
const leak = await ev(`JSON.stringify(getAllData()).includes('SECRET')`);
check('owner name and player ID never reach the herd data', leak === false);
const tooBig = await ev(`(() => { const f = new File(['{}'], 'Mounts.json'); Object.defineProperty(f, 'size', { value: MOUNT_FILE_MAX_BYTES + 1 }); let read = false; const _fr = FileReader.prototype.readAsText; FileReader.prototype.readAsText = function () { read = true; };
  importMounts({ target: { files: [f], value: '' } }); FileReader.prototype.readAsText = _fr; return { read, toast: document.getElementById('toast').textContent }; })()`);
check('mount import rejects an oversized file before reading it', tooBig.read === false && /too large/.test(tooBig.toast), JSON.stringify(tooBig));
const badJson = await ev(`(() => { try { planMountImport('{"nope":1}'); return 'no error'; } catch (e) { return e.message; } })()`);
check('mount import explains a file without SavedMounts', /SavedMounts/.test(badJson), badJson);
const importSrc = readFileSync(fileURLToPath(page), 'utf8').split('// ── IMPORT FROM GAME')[1]?.split('function clearAllData')[0] || '';
check('mount import path uses no write APIs', importSrc.length > 1000 && !/createWritable|showSaveFilePicker|showDirectoryPicker/.test(importSrc), `${importSrc.length} chars`);
const previewUi = await ev(`(() => { showMountPreview(window.__plan, 'Mounts.json'); const box = document.getElementById('mount-preview'); const txt = box.textContent; const boxes = box.querySelectorAll('input[type=checkbox]').length; const sel = box.querySelectorAll('select').length;
  box.parentElement.remove(); return { has: /New \\(4\\)/.test(txt) && /Changed \\(1\\)/.test(txt) && /Skipped \\(3\\)/.test(txt), boxes, sel, pwned: !!document.getElementById('pwn5') }; })()`);
check('mount preview renders counts, checkboxes and choices as text', previewUi.has && previewUi.boxes >= 7 && previewUi.sel >= 0 && !previewUi.pwned, JSON.stringify(previewUi));
await ev(`animals = animals.filter(a => !['Rex','Mum','Shadow'].includes(a.nickname) && !/ twin$/.test(a.nickname || '')); saveAndRefreshFull(); true`);

check('no console errors or exceptions', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
finished = true;
ws.close(); chrome.kill();
// Give Chrome a moment to release its files; the exit handler then removes the profile
await new Promise(r => { chrome.once('exit', r); setTimeout(r, 3000); });
