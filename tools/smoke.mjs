// Headless browser smoke test for Icarus Breeding Tracker.
// Drives the app through the Chrome DevTools protocol (tools/browser.mjs) with synthetic data (tools/fixtures.mjs); no packages.
//
// Usage:  node tools/smoke.mjs [path/to/index.html]    (defaults to index.html in the repository root)
// Needs:  Node.js 22 or newer, and Chrome, Chromium or Edge. Set CHROME_PATH if the browser is not found.
// Output: one PASS/FAIL line per check, then a summary. Exit code 1 if any check fails, 2 if the browser cannot start.
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openPage, sleep } from './browser.mjs';
import { fx } from './fixtures.mjs';

const page = pathToFileURL(resolve(process.argv[2] || join(dirname(fileURLToPath(import.meta.url)), '..', 'index.html'))).href;
const { ev, errors, close } = await openPage(page);

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

// Plan and apply on the seeded herd. The herd is snapshotted first and restored at the end of this block
await ev(`window.__snap = JSON.stringify(getAllData()); true`);
await ev(`(() => { animals.forEach(a => { a.nickname = ''; });
  const b = animals.find(x => x.sp === 'Slinker'); b.nickname = 'Bucephalus'; b.status = 'Station';
  const z = animals.find(x => x.sp === 'Shaggy Zebra' && x.status === 'Station'); z.nickname = 'Oldie';
  animals[3].id = 1234.5678;                                   // a float id, as real herd files have
  saveAndRefreshFull(); return true; })()`);
const seedInfo = await ev(`(() => { const a = animals.find(x => x.sp === 'Dune Raptor' && x.status !== 'Dead'); const b = animals.find(x => x.sp === 'Slinker'); const g = animals.find(x => x.sp === 'Geothermal Raptor');
  const moa = animals.find(x => x.sp === 'Moa'); const z = animals.find(x => x.nickname === 'Oldie'); const otherStation = animals.find(x => x.status === 'Station' && x.sp !== 'Slinker' && x.sp !== 'Shaggy Zebra');
  return { aId: formatSpId(a.sp, a.spId), aSex: a.sex, aStats: STATS.map(s => a.stats[s]), aPh: SPECIES_DATA[a.sp].phenotypes.findIndex(p => p.label === a.ph), aBl: a.bl, aName: a.name, aAnimalId: a.id,
    bSp: b.sp, bSex: b.sex, bStats: STATS.map(s => b.stats[s]), bPh: SPECIES_DATA[b.sp].phenotypes.findIndex(p => p.label === b.ph), bBl: b.bl, bName: b.name, bNick: b.nickname, bId: b.id,
    gId: g.spId, gName: g.name, gSex: g.sex, gStats: STATS.map(s => g.stats[s]), gBl: g.bl, moaName: moa.name, zId: z.id, otherStationId: otherStation.id, station: animals.filter(x => x.status === 'Station').length }; })()`);
const typeOf = sp => ({ 'Dune Raptor': 'Raptor_Desert', 'Geothermal Raptor': 'Raptor', Moa: 'Moa', Slinker: 'Slinker', Buffalo: 'Buffalo', 'Arctic Moa': 'Arctic_Moa', Draven: 'Chew', Horse: 'Horse_Standard', Terrenus: 'Horse', Tusker: 'Tusker', Ubis: 'SwampBird', 'Woolly Mammoth': 'WoollyMammoth', Zebra: 'Zebra', 'Shaggy Zebra': 'WoolyZebra', Gribbler: 'Tundra_Monkey', Hyena: 'Desert_Wolf', Skulk: 'Orka', 'Snow Wolf': 'Snow_Wolf', 'Wild Boar': 'Wild_Boar', 'Forest Wolf': 'Wolf', Storca: 'Storca', Kiwi: 'Kiwi', Cattle: 'Bull', Chicken: 'Chicken', Sheep: 'Sheep', Pig: 'Pig' })[sp];
const bl2 = l => l === 'Unstable' ? 'Fierce' : l;
const PWN = '<img src=x id=pwn5 onerror="window.__pwned5=1">|pipe';
const entries = [
  // 1: tracker ID in the name, one stat and the bloodline differ -> Changed (level 12 is filled in silently)
  { name: `${seedInfo.aId} something`, type: 'Raptor_Desert', sex: seedInfo.aSex === 'F' ? 1 : 2, variation: seedInfo.aPh, lineage: 'Fierce', stats: seedInfo.aStats.map((v, i) => i === 0 ? (v + 1) % 11 : v), level: 12 },
  // 2: nickname match on a Station animal, identical -> Unchanged
  { name: seedInfo.bNick, type: typeOf(seedInfo.bSp), sex: seedInfo.bSex === 'F' ? 1 : 2, variation: seedInfo.bPh, lineage: bl2(seedInfo.bBl), stats: seedInfo.bStats, level: 0 },
  // 3: legacy SR code for Geothermal Raptor, identical -> Unchanged
  { name: `SR${String(seedInfo.gId).padStart(2, '0')} old name`, type: 'Raptor', sex: seedInfo.gSex === 'F' ? 1 : 2, variation: 0, lineage: bl2(seedInfo.gBl), stats: seedInfo.gStats, level: 0 },
  // 4: new Moa; mother is entry 5 (same file), father is a herd Moa by tracker name
  { name: 'Rex', type: 'Moa', sex: 2, variation: 7, lineage: 'Fierce', mother: 'Mum', father: seedInfo.moaName, stats: [1, 2, 3, 4, 5, 6, 7], level: 30 },
  // 5: new Moa, parent of 4; mother is entry 9 (listed later), father names a Dune Raptor (another species: ignored)
  { name: 'Mum', type: 'Moa', sex: 1, variation: 0, lineage: 'Alpha', mother: 'Gran', father: seedInfo.aName, stats: [9, 9, 9, 9, 9, 9, 9], level: 0 },
  // 6: new black Horse (coat from the AI row)
  { name: 'Shadow', type: 'Horse_Standard', sex: 2, variation: 0, lineage: 'Wild', aiRow: 'Mount_Horse_Standard_A2', stats: [2, 2, 2, 2, 2, 2, 2] },
  // 7: same tracker ID as animal 1 but different data -> new, keeps the in-game name as nickname
  { name: `${seedInfo.aId} twin`, type: 'Raptor_Desert', sex: 1, variation: 1, lineage: 'Bold', stats: [3, 3, 3, 3, 3, 3, 3], level: 0 },
  // 8: hostile name with markup and a pipe, also as a parent name
  { name: PWN, type: 'Moa', sex: 1, variation: 2, lineage: 'Timid', mother: PWN, stats: [4, 4, 4, 4, 4, 4, 4] },
  // 9: grandparent of 4, listed after its child
  { name: 'Gran', type: 'Moa', sex: 1, variation: 0, lineage: 'Hardy', stats: [8, 8, 8, 8, 8, 8, 8] },
  // 10 and 11: unnamed identical siblings
  { name: '', type: 'Moa', sex: 2, variation: 0, lineage: 'Wild', stats: [6, 6, 6, 6, 6, 6, 6] },
  { name: '', type: 'Moa', sex: 2, variation: 0, lineage: 'Wild', stats: [6, 6, 6, 6, 6, 6, 6] },
  // skipped: unknown species, no bloodline (matches the station Shaggy Zebra nicknamed Oldie), newer version
  { name: 'Kitty', type: 'Cat', sex: 1, lineage: 'Wild' },
  { name: 'Oldie', type: 'WoolyZebra', sex: 1, lineage: 'None' },
  { name: 'Future', type: 'Moa', sex: 1, lineage: 'Wild', version: 4 },
];
const mountsText = fx.file(entries);
// The twin listed before the real animal must not take its place
const reversed = fx.file([entries[6], entries[0]]);
const order = await ev(`(() => { const p = planMountImport(${JSON.stringify(reversed)}); return { changed: p.changed.map(x => x.c.gameName), added: p.added.map(r => r.c.gameName) }; })()`);
check('mount matching does not depend on file order', order.changed.join() === `${seedInfo.aId} something` && order.added.join() === `${seedInfo.aId} twin`, JSON.stringify(order));

await ev(`window.__plan = planMountImport(${JSON.stringify(mountsText)}); true`);
const plan = await ev(`(() => { const p = window.__plan; return { total: p.total, added: p.added.map(r => r.c.gameName), changed: p.changed.map(x => x.diffs.map(d => d.field + ':' + d.from + '>' + d.to)), unchanged: p.unchanged.map(x => x.c.gameName),
  skipped: p.skipped.map(s => s.gameName + ': ' + s.reason), nif: p.notInFile.map(a => a.id), horse: p.added.find(r => r.c.gameName === 'Shadow')?.c.ph, rexBl: p.added.find(r => r.c.gameName === 'Rex')?.c.bl }; })()`);
check('mount preview groups new, changed, unchanged and skipped', plan.total === 14 && plan.added.join('/') === `Rex/Mum/Shadow/${seedInfo.aId} twin/${PWN}/Gran//` && plan.changed.length === 1 && plan.unchanged.join() === `${seedInfo.bNick},SR${String(seedInfo.gId).padStart(2, '0')} old name`, JSON.stringify(plan));
check('mount preview lists each changed field and fills a missing level silently', plan.changed[0]?.length === 2 && plan.changed[0].some(d => d.startsWith('VIG:')) && plan.changed[0].some(d => d.endsWith('>Unstable')) && !plan.changed[0].some(d => d.startsWith('level:')), JSON.stringify(plan.changed));
check('mount preview skips with a reason', plan.skipped.length === 3 && /unknown species/.test(plan.skipped[0]) && /no bloodline/.test(plan.skipped[1]) && /unsupported save format \(version 4, expected 3\)/.test(plan.skipped[2]), plan.skipped.join(' | '));
check('mount preview flags station animals missing from the file, not matched or skipped ones', plan.nif.includes(seedInfo.otherStationId) && !plan.nif.includes(seedInfo.bId) && !plan.nif.includes(seedInfo.zId) && plan.nif.length === seedInfo.station - 2, `${plan.nif.length} of ${seedInfo.station}`);
check('mount import maps Fierce to Unstable and horse rows to coats', plan.rexBl === 'Unstable' && plan.horse === 'Black', `${plan.rexBl}, ${plan.horse}`);
const applied = await ev(`(() => { const p = window.__plan; const before = animals.length; const dead = p.notInFile[0].id;
  const choices = { addIdx: new Set(p.added.map((_, i) => i)), diffKeys: new Set(p.changed.flatMap(x => x.diffs.map(d => x.a.id + '|' + d.field))), stationAll: false, notInFile: new Map([[dead, 'Dead']]) };
  const r = applyMountImport(p, choices);
  const byNick = n => animals.find(a => a.nickname === n);
  const rex = byNick('Rex'), mum = byNick('Mum'), gran = byNick('Gran'), shadow = byNick('Shadow'), twin = animals.find(a => / twin$/.test(a.nickname || '')), pwn = byNick(${JSON.stringify(PWN)}), a1 = p.changed[0].a;
  const unnamed = animals.slice(before).filter(a => !a.nickname);
  return { r, grew: animals.length - before, rexName: rex.name, rexP1: rex.p1, rexP2: rex.p2, rexGen: rex.gen, rexLevel: rex.level, rexStatus: rex.status, rexBred: rex.isBred,
    mumName: mum.name, mumP1: mum.p1, mumP2: mum.p2, mumGen: mum.gen, mumLevel: mum.level, mumBred: mum.isBred, granName: gran.name, granGen: gran.gen,
    shadowPh: shadow.ph, twinOk: !!twin && twin.spId !== a1.spId, pwnOk: !!pwn && pwn.p1 === ${JSON.stringify(PWN)}, unnamed: unnamed.length,
    a1Vig: a1.stats.VIG, a1Bl: a1.bl, a1Level: a1.level, a1Name: a1.name, a1Expected: computeName(a1.sp, a1.sex, a1.bl, a1.ph, a1.stats, a1.spId), a1Old: ${JSON.stringify(seedInfo.aName)},
    deadNow: animals.find(a => a.id === dead).status, idsUnique: new Set(animals.map(a => a.sp + '#' + a.spId)).size === animals.length,
    sightings: (phenoStats.Moa?.[rex.ph]?.bred || 0) >= 1 && (blStats.Moa?.Hardy?.tamed || 0) >= 1 }; })()`);
check('mount import adds the ticked animals with nickname, status and level', applied.grew === 8 && applied.r.added === 8 && /^BM\d+ /.test(applied.rexName) && applied.rexStatus === 'Station' && applied.rexLevel === 30 && applied.mumLevel === undefined && applied.idsUnique && applied.twinOk && applied.unnamed === 2, JSON.stringify(applied));
check('mount import resolves parents in the file, in the herd, and ignores another species', applied.rexP1 === applied.mumName && applied.rexP2 === seedInfo.moaName && applied.mumP1 === applied.granName && applied.mumP2 === '' && applied.rexBred === true && applied.mumBred === true && applied.pwnOk, JSON.stringify(applied));
check('mount import settles generations whatever the file order', applied.granGen === 1 && applied.mumGen === 2 && applied.rexGen === 3, `${applied.granGen}, ${applied.mumGen}, ${applied.rexGen}`);
check('mount import applies ticked changes, refreshes the generated name and status choices', applied.a1Vig === (seedInfo.aStats[0] + 1) % 11 && applied.a1Bl === 'Unstable' && applied.a1Level === 12 && applied.a1Name === applied.a1Expected && applied.a1Name !== applied.a1Old && applied.shadowPh === 'Black' && applied.deadNow === 'Dead' && plan.nif.length > 0, JSON.stringify(applied));
check('mount import records sightings for new animals', applied.sightings === true);
const again = await ev(`(() => { const p = planMountImport(${JSON.stringify(mountsText)}); return { added: p.added.length, changed: p.changed.length, unchanged: p.unchanged.length, names: p.added.map(r => r.c.gameName) }; })()`);
check('importing the same game file again adds nothing', again.added === 0 && again.changed === 0 && again.unchanged === 11, JSON.stringify(again));
const leak = await ev(`JSON.stringify(getAllData()).includes('SECRET')`);
check('owner name and player ID never reach the herd data', leak === false);
// The hostile name must stay text everywhere it is shown: preview, herd table, lineage tree, CSV
const hostile = await ev(`(() => { showMountPreview(window.__plan, 'Mounts.json'); const box = document.getElementById('mount-preview'); const inPreview = box.textContent.includes(${JSON.stringify(PWN)}); box.parentElement.remove();
  renderHerd(); const pwn = animals.find(a => a.nickname === ${JSON.stringify(PWN)});
  let lterr = ''; try { const t = buildLineageTree(pwn.name, 0, 3); document.body.insertAdjacentHTML('beforeend', '<div id=lt5>' + renderTreeRecursive(t) + '</div>'); document.getElementById('lt5').remove(); } catch (e) { lterr = e.message; }
  const csv = typeof csvField === 'function' ? csvField(pwn.nickname) : '';
  return { inPreview, pwned: !!(window.__pwned5 || document.getElementById('pwn5')), lterr, csvQuoted: csv === '' || csv.startsWith('"') }; })()`);
check('a hostile in-game name stays text in the preview, herd table, lineage and CSV', hostile.inPreview && !hostile.pwned && !hostile.lterr && hostile.csvQuoted, JSON.stringify(hostile));
const tooBig = await ev(`(() => { const f = new File(['{}'], 'Mounts.json'); Object.defineProperty(f, 'size', { value: MOUNT_FILE_MAX_BYTES + 1 }); let read = false; const _fr = FileReader.prototype.readAsText; FileReader.prototype.readAsText = function () { read = true; };
  importMounts({ target: { files: [f], value: '' } }); FileReader.prototype.readAsText = _fr; return { read, toast: document.getElementById('toast').textContent }; })()`);
check('mount import rejects an oversized file before reading it', tooBig.read === false && /too large/.test(tooBig.toast), JSON.stringify(tooBig));
const badJson = await ev(`(() => { try { planMountImport('{"nope":1}'); return 'no error'; } catch (e) { return e.message; } })()`);
check('mount import explains a file without SavedMounts', /SavedMounts/.test(badJson), badJson);
const tooMany = await ev(`(() => { try { planMountImport(JSON.stringify({ SavedMounts: new Array(MOUNT_MAX_ENTRIES + 1).fill({}) })); return 'no error'; } catch (e) { return e.message; } })()`);
check('mount import rejects a file with too many entries before parsing', /Too many/.test(tooMany), tooMany);
const importSrc = readFileSync(fileURLToPath(page), 'utf8').split('// ── IMPORT FROM GAME')[1]?.split('function clearAllData')[0] || '';
check('mount import path uses no write APIs', importSrc.length > 1000 && !/createWritable|showSaveFilePicker|showDirectoryPicker/.test(importSrc), `${importSrc.length} chars`);
// Confirm through the modal itself: untick one new animal, mark one missing animal Dead
await ev(`applyData(JSON.parse(window.__snap)); migrateMemory(); animals.find(x => x.sp === 'Slinker').nickname = 'Bucephalus'; animals.find(x => x.sp === 'Slinker').status = 'Station'; animals.find(x => x.sp === 'Shaggy Zebra' && x.status === 'Station').nickname = 'Oldie'; animals[3].id = 1234.5678; saveAndRefreshFull(); true`);
const viaUi = await ev(`(() => { const p = planMountImport(${JSON.stringify(mountsText)}); const before = animals.length; const nif = p.notInFile.length;
  showMountPreview(p, 'Mounts.json'); const box = document.getElementById('mount-preview'); const txt = box.textContent;
  const has = /New \\(8\\)/.test(txt) && /Changed \\(1\\)/.test(txt) && /Unchanged \\(2\\)/.test(txt) && /Skipped \\(3\\)/.test(txt);
  const boxes = [...box.querySelectorAll('input[type=checkbox]')]; const sels = box.querySelectorAll('select');
  boxes.find(b => b.dataset.key === 'add|0').checked = false;                       // skip Rex
  const sel = [...sels].find(s => s.dataset.key === 'nif|' + p.notInFile[0].id); sel.value = 'Dead';
  [...box.querySelectorAll('button')].find(b => b.textContent === 'Confirm import').click();
  const gone = !document.getElementById('mount-preview');
  const dead = animals.find(a => a.id === p.notInFile[0].id).status;
  return { has, sels: sels.length === nif, nif, grew: animals.length - before, rex: !!animals.find(a => a.nickname === 'Rex'), gone, dead, toast: document.getElementById('toast').textContent }; })()`);
check('mount preview renders counts and choices, and Confirm applies what is ticked', viaUi.has && viaUi.sels && viaUi.nif > 0 && viaUi.grew === 7 && !viaUi.rex && viaUi.gone && viaUi.dead === 'Dead' && /Imported 7 animals/.test(viaUi.toast), JSON.stringify(viaUi));
await ev(`applyData(JSON.parse(window.__snap)); migrateMemory(); saveAndRefreshFull(); true`);

// ── #8: Optimize modal and advice panel ─────────────────────────────────────────────
const errsBeforeOpt = errors.length;
const optModal = await ev(`(() => { try { showOptimizeModal('Moa'); const open = !!document.querySelector('.opt-modal'); closeOptimizeModal(); return { open, error: '' }; } catch (e) { return { open: false, error: e.message }; } })()`);
check('Optimize modal opens without an exception', optModal.open && !optModal.error && errors.length === errsBeforeOpt, optModal.error || errors.slice(errsBeforeOpt).join(' | '));
const advice = await ev(`(() => { try {
  const a = animals.find(x => x.sp === 'Moa' && x.status === '?'); const slot = pairsMap.Moa[0]; const saved = { m: slot.m, f: slot.f };
  if (a.sex === 'M') slot.m = a.name; else slot.f = a.name;
  showTab('entry'); document.getElementById('f-species').value = 'Moa'; onSpeciesChange(); document.getElementById('f-sex').value = a.sex; document.getElementById('f-bloodline').value = 'Alpha'; STATS.forEach(s => { document.getElementById('stat-' + s).value = 9; });
  const panel = document.getElementById('advice-panel'); renderAdvice();
  const count = () => [...panel.querySelectorAll('button')].filter(b => (b.getAttribute('onclick') || '').includes('setAdviceStatus(' + a.id + ',')).length;
  const before = count(); setAdviceStatus(a.id, 'Reserve'); const after = count(); const still = panel.classList.contains('show'); const freed = !pairsMap.Moa.some(p => p.m === a.name || p.f === a.name);
  panel.classList.remove('show'); a.status = '?'; Object.assign(slot, saved); save(); resetFormUI();
  return { before, after, still, freed, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('advice panel frees the pair slot and drops the buttons after a status change', !advice.error && advice.before > 0 && advice.after === 0 && advice.still && advice.freed, JSON.stringify(advice));
// Dialog buttons (showConfirm, import preview) must not fall back to the browser's default button look
const dialogBtns = await ev(`(() => { try {
  showConfirm('Smoke test', () => {});
  const css = el => { const s = getComputedStyle(el); return { bg: s.backgroundColor, pad: s.padding }; };
  const plain = document.createElement('button'), ref = document.createElement('button'); ref.className = 'btn';
  document.body.append(plain, ref);
  const yes = css(document.getElementById('_cfm_yes')), no = css(document.getElementById('_cfm_no')), def = css(plain), btn = css(ref);
  plain.remove(); ref.remove(); document.getElementById('_cfm_no').click();
  return { yes, no, def, btn, closed: !document.getElementById('_cfm_yes'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
const styledBtn = b => !!b && b.bg !== 'rgba(0, 0, 0, 0)' && b.bg !== dialogBtns.def?.bg && !/^0px( 0px)*$/.test(b.pad) && b.pad !== dialogBtns.def?.pad;
check('dialog buttons (.btn-primary, .btn-secondary) have the app button style, not the browser default', !dialogBtns.error && styledBtn(dialogBtns.yes) && styledBtn(dialogBtns.no) && dialogBtns.yes.bg === dialogBtns.btn.bg && dialogBtns.closed, JSON.stringify(dialogBtns));

// ── #9: hardening of shared herd files ──────────────────────────────────────────────
await ev(`window.__snap9 = JSON.stringify(getAllData()); true`);
const PWN6 = '<img src=x id=pwn6 onerror="window.__pwned6=1">';
const crafted = await ev(`(() => { try {
  const d = JSON.parse(window.__snap9); const alive = d.herd.find(a => a.status === 'Keep');
  d.herd.push({ id: 999101, spId: 901, sp: 'Moa', sex: 'F', bl: '__proto__', ph: '__proto__', gen: 1, p1: '', p2: '', stats: { VIG: 1 }, name: 'Proto Moa', status: '?', notes: '' });
  d.herd.push({ id: 999104, spId: 904, sp: 'Moa', sex: 'F', bl: 'bold', ph: SPECIES_DATA.Moa.phenotypes[7].label, gen: 1, p1: '', p2: '', stats: {}, name: 'Good Moa', status: '?', notes: '' });
  d.herd.push({ id: 999102, spId: 902, sp: ${JSON.stringify(PWN6)}, sex: 'M', bl: 'Wild', ph: ${JSON.stringify(PWN6)}, gen: 1, p1: '', p2: '', stats: {}, name: 'Alien', status: '?', notes: '' });
  d.herd.push({ id: 999103, spId: alive.spId, sp: alive.sp, sex: 'M', bl: 'Wild', ph: '', gen: 1, p1: '', p2: '', stats: {}, name: 'Dup Id', status: '?', notes: '\u0001ctrl\tkeep' });
  d.herd.push({ id: 999105, spId: 0, sp: 'Pig', sex: 'M', bl: 'Wild', ph: '', gen: 1, p1: '', p2: '', stats: {}, name: 'No Id 1', status: '?', notes: '' });
  d.herd.push({ id: 999106, spId: 0, sp: 'Pig', sex: 'F', bl: 'Wild', ph: '', gen: 1, p1: '', p2: '', stats: {}, name: 'No Id 2', status: '?', notes: '' });
  d.goals = { Moa: 5, Slinker: [1], Buffalo: { goals: 'no', pairs: {}, phenoWeights: [], blPriority: 3 }, 'Not A Species': { goals: [] } };
  applyData(d); migrateMemory();
  animals.find(a => a.name === 'Good Moa').ph = '__proto__';          // bypass validation: the count maps themselves must be safe
  showTab('goals'); renderGoals();
  const cards = document.querySelectorAll('#goals-grid .goals-card:not(.goals-card-error)').length + document.querySelectorAll('#goals-chips-row .species-chip').length;
  animals.find(a => a.name === 'Good Moa').ph = SPECIES_DATA.Moa.phenotypes[7].label;
  showTab('herd'); setFilter('status', 'all', null); renderHerd();
  const flags = [...document.querySelectorAll('#herd-tbody .herd-flag')].map(f => f.textContent);
  const alien = animals.find(a => a.name === 'Alien'); viewAnimal(alien.id); closeViewPanel();
  const noIds = animals.filter(a => /^No Id/.test(a.name));
  return { cards, species: Object.keys(SPECIES_DATA).length, proto: ({}).tamed === undefined && ({}).bred === undefined, moaObj: typeof goalsMap.Moa === 'object' && Array.isArray(goalsMap.Buffalo.goals) && !('pairs' in goalsMap.Buffalo) && !Array.isArray(goalsMap.Buffalo.phenoWeights) && typeof goalsMap.Buffalo.blPriority === 'object',
    unknownKeyDropped: !('Not A Species' in goalsMap), unknown: flags.filter(f => f === 'unknown species').length, dup: flags.filter(f => f === 'duplicate ID').length, notes: animals.find(a => a.name === 'Dup Id').notes,
    cleared: animals.find(a => a.name === 'Proto Moa').bl === '' && animals.find(a => a.name === 'Proto Moa').ph === '', kept: animals.find(a => a.name === 'Good Moa').bl === 'Bold' && animals.find(a => a.name === 'Good Moa').ph === SPECIES_DATA.Moa.phenotypes[7].label,
    noIdsAssigned: noIds.every(a => a.spId > 0) && noIds[0].spId !== noIds[1].spId, pwned: !!(window.__pwned6 || document.getElementById('pwn6')), rawInHerd: !!document.querySelector('#herd-tbody img, #herd-tbody script'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a crafted herd file loads with defaults and flags instead of breaking', !crafted.error && crafted.cards === crafted.species && crafted.proto && crafted.moaObj && crafted.unknownKeyDropped && crafted.cleared && crafted.kept, JSON.stringify(crafted));
check('an unknown-species animal cannot run script through My Herd or the viewer', !crafted.error && !crafted.pwned && !crafted.rawInHerd, JSON.stringify(crafted));
check('unknown species and duplicate IDs are flagged in My Herd, missing IDs are assigned', crafted.unknown === 1 && crafted.dup === 2 && crafted.notes === 'ctrl\tkeep' && crafted.noIdsAssigned, JSON.stringify(crafted));
const legacy = await ev(`(() => { try {
  applyData({ version: 6, herd: [{ id: 1, spId: 1, sp: 'Geothermal Raptor', sex: 'F', bl: 'wild', ph: 'Swamp P2', gen: 1, p1: '', p2: '', stats: {}, name: 'Old Geo', status: '?', notes: '' }],
    goals: { 'Geothermal Raptor': { goals: [{ bl: 'Alpha', ph: 'Swamp P3' }], phenoWeights: { 'Swamp P2': 2 } } } }); migrateMemory();
  const a = animals[0], g = goalsMap['Geothermal Raptor'];
  const r1 = { ph: a.ph, bl: a.bl, goalPh: g.goals[0].ph, weightKey: Object.keys(g.phenoWeights).join() };
  applyData({ version: 4, herd: [], goals: { Moa: { goals: 'no', pairs: [{ bl: 'Wild' }, 7] } } }); migrateMemory();
  return { ...r1, v4goals: JSON.stringify(goalsMap.Moa.goals), error: '' }; } catch (e) { return { error: e.message }; } })()`);
const PWN7 = '<img/src/onerror="window.__pwned7=1"/id=pwn7>';
const sinks = await ev(`(() => { try {
  applyData({ version: 7, herd: [
      { id: 1, spId: 1, sp: 'Moa', sex: 'M', bl: 'Wild', ph: '', gen: 1, p1: '', p2: '', stats: {}, name: ${JSON.stringify(PWN7)}, status: '?', notes: '' },
      { id: 2, spId: 2, sp: 'Moa', sex: 'F', bl: 'Alpha', ph: '', gen: 1, p1: '', p2: '', stats: {}, name: 'BM02 F30-Alpha', status: '?', notes: '' },
      { id: 3, spId: 0, sp: 'Pig', sex: 'M', bl: 'Wild', ph: '', gen: 1, p1: '', p2: '', stats: {}, name: 'No Id', status: '?', notes: '' },
      { id: 4, spId: 1, sp: 'Pig', sex: 'F', bl: 'Wild', ph: '', gen: 1, p1: '', p2: '', stats: {}, name: 'PG01', status: '?', notes: '' }],
    pairs: { Moa: [{ m: ${JSON.stringify(PWN7)}, f: '' }, { m: 'x', f: 'y' }], Slinker: 5 }, nextSpAid: { PG: 1 },
    goals: { Moa: { goals: [{ bl: ${JSON.stringify(PWN7)}, ph: ${JSON.stringify(PWN7)} }, { bl: 'alpha', ph: '' }] } } });
  migrateMemory();
  showTab('pairs'); renderPairs(); const pairsImg = !!document.querySelector('#tab-pairs img');
  viewAnimal(2); const viewerImg = !!document.getElementById('pwn7'); closeViewPanel();
  showOptimizeModal('Moa'); const optImg = !!document.querySelector('.opt-modal img'); closeOptimizeModal();
  setAdviceStatus(2, 'Reserve');
  const pigs = animals.filter(a => a.sp === 'Pig').map(a => a.spId);
  return { pairsImg, viewerImg, optImg, goals: JSON.stringify(goalsMap.Moa.goals), slinker: JSON.stringify(pairsMap.Slinker), pigs, pwned: !!window.__pwned7, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('pair tiles, viewer slots and the optimiser escape file text, a goal with hostile text is dropped on load and the remaining goal kept; bad pairs and spId 0 are tolerated', !sinks.error && !sinks.pairsImg && !sinks.viewerImg && !sinks.optImg && !sinks.pwned && sinks.goals === '[{"bl":"Alpha","ph":""}]' && /^\[/.test(sinks.slinker) && sinks.pigs.length === 2 && sinks.pigs[0] !== sinks.pigs[1] && sinks.pigs.every(n => n > 0), JSON.stringify(sinks));
const v5 = await ev(`(() => { try {
  applyData({ version: 5, herd: [{ id: 1, spId: 1, sp: 'Swamp Raptor', sex: 'F', bl: 'Wild', ph: 'Swamp P3', gen: 1, p1: '', p2: '', stats: {}, name: 'Old', status: '?', notes: '' }],
    pairCounts: { 'Swamp Raptor': 3 }, phenoStats: { 'Swamp Raptor': { 'Swamp P3': { tamed: 2, bred: 0 }, 'Swamp Raptor (base)': { tamed: 1, bred: 0 } } }, blStats: { 'Swamp Raptor': { Wild: { tamed: 2, bred: 0 } } }, cardWidths: { 'Swamp Raptor': 'wide' },
    goals: { 'Swamp Raptor': { goals: [], pairs: [] } } }); migrateMemory();
  return { sp: animals[0].sp, ph: animals[0].ph, pairs: pairCounts['Geothermal Raptor'], keys: Object.keys(phenoStats['Geothermal Raptor'] || {}).sort().join('|'), bl: blStats['Geothermal Raptor']?.Wild?.tamed, width: cardWidths['Geothermal Raptor'], old: 'Swamp Raptor' in pairCounts || 'Swamp Raptor' in phenoStats, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a v5 file keeps its Swamp Raptor pair count, sightings and card width under the new name', !v5.error && v5.sp === 'Geothermal Raptor' && v5.ph === 'Geothermal P3' && v5.pairs === 3 && v5.keys === 'Geothermal P3|Geothermal Raptor (base)' && v5.bl === 2 && v5.width === 'wide' && !v5.old, JSON.stringify(v5));
const notHerd = await ev(`(async () => { try {
  const before = { mode: storageMode, handle: fileHandle, n: animals.length };
  const fake = { name: 'Mounts.json', getFile: async () => ({ text: async () => '{"SavedMounts":[]}' }) };
  const _p = window.showOpenFilePicker; window.showOpenFilePicker = async () => [fake];
  await openExistingFile(); window.showOpenFilePicker = _p;
  return { same: storageMode === before.mode && fileHandle === before.handle && animals.length === before.n, toast: document.getElementById('toast').textContent, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('opening a file without a herd list adopts nothing and changes nothing', !notHerd.error && notHerd.same && /not a herd file/.test(notHerd.toast), JSON.stringify(notHerd));
check('legacy phenotype labels and bloodline case are migrated, a v4 file with bad goals loads', !legacy.error && legacy.ph === 'Geothermal P2' && legacy.bl === 'Wild' && legacy.goalPh === 'Geothermal P3' && legacy.weightKey === 'Geothermal P2' && legacy.v4goals === '[{"bl":"Wild","ph":""}]', JSON.stringify(legacy));
const csvGuard = await ev(`JSON.stringify([csvField('\\t=1+1'), csvField('\\r=1'), csvField('=1'), csvField('plain')])`);
check('CSV export guards a leading tab or CR like a formula', csvGuard === JSON.stringify(['"\'\t=1+1"', '"\'\r=1"', '"\'=1"', '"plain"']), csvGuard);
// Fields from a shared file that reach the page as numbers, attributes or text (v0.31b review)
const pwn8 = k => `<img src=x id=pwn8${k} onerror="window.__pwned8${k}=1">`;
await ev(`window.__mk8 = (id, spId, sp, sex, bl, name, extra = {}) => ({ id, spId, sp, sex, bl, ph: '', gen: 1, p1: '', p2: '', stats: {}, name, status: '?', notes: '', ...extra }); true`);
const goalNums = await ev(`(async () => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 M0-Wild'), __mk8(2, 2, 'Moa', 'F', 'Alpha', 'BM02 F0-Alpha')],
    goals: { Moa: { goals: [], reserveTarget: ${JSON.stringify(pwn8('a'))}, statGoal: 'x' }, Buffalo: { goals: [], reserveTarget: 5000, statGoal: 1234 }, Pig: { goals: [], statGoal: -5 } } }); migrateMemory();
  showTab('goals'); renderGoals();
  await new Promise(r => setTimeout(r, 150));
  const n = sp => [goalsMap[sp].reserveTarget, goalsMap[sp].statGoal].join();
  return { moa: n('Moa'), buffalo: n('Buffalo'), pig: n('Pig'), el: !!document.getElementById('pwn8a'), pwned: !!window.__pwned8a, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a reserve target or stat goal from a file becomes a number in range and never HTML', !goalNums.error && goalNums.moa === '0,60' && goalNums.buffalo === '999,60' && goalNums.pig === '0,0' && !goalNums.el && !goalNums.pwned, JSON.stringify(goalNums));
const parentErr = await ev(`(async () => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 M0-Wild', { p1: ${JSON.stringify(pwn8('b'))} })] }); migrateMemory();
  showTab('entry'); editAnimal(1);
  const shown = document.getElementById('pc1').textContent, el = !!document.querySelector('#pc1 img') || !!document.getElementById('pwn8b');
  await new Promise(r => setTimeout(r, 150));
  editingId = null; resetFormUI();
  const s = document.getElementById('f-species'); s.value = 'Dune Raptor'; onSpeciesChange();
  return { shown, el, pwned: !!window.__pwned8b, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a parent name from a file shows as text in the not-found message', !parentErr.error && !parentErr.el && !parentErr.pwned && /<img/.test(parentErr.shown), JSON.stringify(parentErr));
const SVG8 = '<svg/onload=alert()>';   // 20 characters, the most the status field keeps
const occupant = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 M0-Wild', { status: ${JSON.stringify(SVG8)} })] }); migrateMemory();
  const a = animals[0], loaded = a.status;
  const html = paOccupantHtml({ isEmpty: false, curName: ${JSON.stringify(pwn8('c'))}, curAnimal: null });
  a.status = ${JSON.stringify(SVG8)};   // bypass validation: the panel itself must escape
  const html2 = paOccupantHtml({ isEmpty: false, curName: a.name, curAnimal: a });
  a.status = '?';
  return { loaded, escaped: html.includes('&lt;img'), raw: html.includes('<img'), statusEscaped: html2.includes('&lt;svg'), statusRaw: html2.includes('<svg'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a file status is a known status, and the pair placement panel shows occupant name and status as text', !occupant.error && occupant.loaded === '?' && occupant.escaped && !occupant.raw && occupant.statusEscaped && !occupant.statusRaw, JSON.stringify(occupant));
const logTypes = await ev(`(() => { try {
  applyData({ version: 7, herd: [], logEntries: [{ ts: 1, msg: 'x', type: '"onclick=alert()//' }, { ts: 2, msg: 'y', type: '<svg/onload=1>' }, { ts: 3, msg: 'z', type: 'breed' }] }); migrateMemory();
  showTab('log'); setLogFilter('all', document.querySelector('[data-log-filter="all"]')); renderLog();
  const list = document.getElementById('log-list');
  return { types: logEntries.map(e => e.type).join(), entries: list.querySelectorAll('.log-entry').length, onclick: [...list.querySelectorAll('*')].some(el => el.hasAttribute('onclick')),
    svg: !!list.querySelector('svg'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('log entry types from a file are limited to known types and stay out of the markup', !logTypes.error && logTypes.types === 'add,add,breed' && logTypes.entries === 3 && !logTypes.onclick && !logTypes.svg, JSON.stringify(logTypes));
const protoSp = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'constructor', 'M', 'Wild', 'Ctor'), __mk8(2, 1, '__proto__', 'F', 'Wild', 'Proto')] }); migrateMemory();
  showTab('herd'); setFilter('status', 'all', null); renderHerd();
  const flags = [...document.querySelectorAll('#herd-tbody .herd-flag')].filter(f => f.textContent === 'unknown species').length;
  let viewErr = '';
  try { viewAnimal(1); closeViewPanel(); viewAnimal(2); closeViewPanel(); } catch (e) { viewErr = e.message; }
  return { flags, viewErr, noMembers: SPECIES_DATA.constructor === undefined && SPECIES_DATA.__proto__ === undefined && CROSS_BREEDS.constructor === undefined, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a species named like an Object member is flagged as unknown and opens in the viewer', !protoSp.error && protoSp.flags === 2 && !protoSp.viewErr && protoSp.noMembers, JSON.stringify(protoSp));
const stars = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 M0-Wild'), __mk8(2, 2, 'Moa', 'F', 'Bold', 'BM02 F0-Bold')],
    pairs: { Moa: [{ m: 'BM01 M0-Wild', f: 'BM02 F0-Bold' }] }, pairCounts: { Moa: 1 },
    goals: { Moa: { goals: [], blPriority: { Wild: 1e9, Alpha: -7, Bold: 2.4 }, phenoWeights: { x: 'abc' } } } }); migrateMemory();
  const g = goalsMap.Moa;
  showTab('pairs'); renderPairs();
  return { bl: [g.blPriority.Wild, g.blPriority.Alpha, g.blPriority.Bold].join(), x: g.phenoWeights.x, text: document.getElementById('tab-pairs').textContent.length, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('star weights from a file are whole numbers from -3 to 3, anything else is 0', !stars.error && stars.bl === '3,-3,0' && stars.x === 0 && stars.text < 1e6, JSON.stringify(stars));
const counts = await ev(`(() => { try {
  const moaPairs = Array.from({ length: 120 }, () => ({ m: '', f: '' })); moaPairs[109] = { m: 'BM05 M0-Wild', f: '' };   // slot 110
  applyData({ version: 7, herd: [__mk8(5, 5, 'Moa', 'M', 'Wild', 'BM05 M0-Wild', { status: 'Breed' })], pairs: { Moa: moaPairs },
    pairCounts: { Moa: 1e6, Buffalo: 'abc', Pig: 5.5, Tusker: 0 }, goals: { Slinker: { goals: [], pairs: Array.from({ length: 150 }, () => ({ bl: '', ph: '' })) } } });
  migrateMemory(); initPairs();
  return { moa: pairCounts.Moa, got: [pairCounts.Buffalo, pairCounts.Pig].join(), defaults: [SPECIES_DATA.Buffalo.defaultPairs, SPECIES_DATA.Pig.defaultPairs].join(),
    tusker: pairCounts.Tusker, slots: pairsMap.Moa.length, slot110Gone: !pairsMap.Moa.some(p => p.m === 'BM05 M0-Wild'), slot110Status: animals[0].status,
    goalSlots: 'pairs' in goalsMap.Moa, slinkerGoalSlots: 'pairs' in goalsMap.Slinker, error: '' }; } catch (e) { return { error: e.message }; } })()`);
// The per-pair goal lists that v5 emptied are dropped on load (#25), so a 150-entry list from a file is gone instead of cut to 99
check('pair counts from a file are clamped to 1..99, slot lists are cut to match, and old per-pair goal lists are dropped', !counts.error && counts.moa === 99 && counts.got === counts.defaults && counts.tusker === 1 && counts.slots === 99 && counts.slot110Gone && counts.slot110Status === 'Reserve' && counts.goalSlots === false && counts.slinkerGoalSlots === false, JSON.stringify(counts));
const uiLimits = await ev(`(() => { try {
  applyData({ version: 7, herd: [], pairCounts: { Moa: 99 } }); migrateMemory();
  addPairSlot('Moa'); const afterAdd = pairCounts.Moa;
  updateReserveTarget('Moa', 5000); const target = goalsMap.Moa.reserveTarget;
  updateStatGoal('Moa', 5000); const statGoal = goalsMap.Moa.statGoal;
  return { afterAdd, target, statGoal, toast: document.getElementById('toast').textContent, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the UI cannot add a 100th pair slot, set a reserve target above 999 or a stat goal above the species maximum', !uiLimits.error && uiLimits.afterAdd === 99 && uiLimits.target === 999 && uiLimits.statGoal === 60 && /maximum of 99/.test(uiLimits.toast), JSON.stringify(uiLimits));
const spIds = await ev(`(() => { try {
  applyData({ version: 7, nextSpAid: { PG: 'x', BM: -4, BF: 7, DR: 1e300 }, herd: [
    __mk8(1, 0, 'Pig', 'M', 'Wild', 'No Id 1'), __mk8(2, 0, 'Pig', 'F', 'Wild', 'No Id 2'),
    __mk8(3, 2.5, 'Moa', 'M', 'Wild', 'Half Id'), __mk8(4, -1, 'Moa', 'F', 'Wild', 'Negative Id'),
    __mk8(5, 1e300, 'Dune Raptor', 'M', 'Wild', 'Huge Id'), __mk8(6, 1000000, 'Dune Raptor', 'F', 'Wild', 'Big Id')] }); migrateMemory();
  const ids = sp => animals.filter(a => a.sp === sp).map(a => String(a.spId));
  return { pigs: ids('Pig'), moas: ids('Moa'), raptors: ids('Dune Raptor'), bf: nextSpAid.BF, dr: nextSpAid.DR, error: '' }; } catch (e) { return { error: e.message }; } })()`);
const wholeIds = list => Array.isArray(list) && list.length === 2 && list.every(n => /^[1-9]\d{0,5}$/.test(n)) && list[0] !== list[1];
check('ID counters and IDs from a file are whole numbers from 1 to 999999, so new IDs never repeat', !spIds.error && wholeIds(spIds.pigs) && wholeIds(spIds.moas) && spIds.raptors.join() === '1,2' && spIds.bf === 7 && spIds.dr === 3, JSON.stringify(spIds));
const merged = await ev(`(() => { try {
  applyData({ version: 6, herd: [], goals: { 'Geothermal Raptor': { goals: [], phenoWeights: { 'Swamp P2': 2, 'Geothermal P2': 3 } } },
    phenoStats: { 'Geothermal Raptor': { 'Swamp P2': { tamed: 1, bred: 0 }, 'Geothermal P2': { tamed: 2, bred: 1 } } } }); migrateMemory();
  const w = goalsMap['Geothermal Raptor'].phenoWeights, ps = phenoStats['Geothermal Raptor'];
  return { weight: w['Geothermal P2'], stats: JSON.stringify(ps['Geothermal P2']), old: Object.hasOwn(w, 'Swamp P2') || Object.hasOwn(ps, 'Swamp P2'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a v6 file with both phenotype labels keeps the new weight and adds the sightings together', !merged.error && merged.weight === 3 && merged.stats === '{"tamed":3,"bred":1}' && !merged.old, JSON.stringify(merged));
const reserved = await ev(`(() => { try {
  applyData({ version: 7, nextSpAid: {}, herd: [__mk8(1, 1, 'Dune Raptor', 'M', 'Wild', 'DR01'), __mk8(2, 2, 'Dune Raptor', 'F', 'Wild', 'DR02'),
    __mk8(3, 500, 'Dragon', 'M', 'Wild', 'Stray 1'), __mk8(4, 400, 'Moabc', 'F', 'Wild', 'Stray 2')] }); migrateMemory();
  return { dr: nextSpAid.DR, mo: nextSpAid.MO ?? null, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('an unknown species does not push the ID counter of a real species with the same code', !reserved.error && reserved.dr === 3 && reserved.mo === null, JSON.stringify(reserved));
// The unknown-species badge tells the player to fix the species in the edit form; the animal keeps its ID, which must not be handed out again
const speciesFix = await ev(`(() => { try {
  const s = document.getElementById('f-species');
  const fix = (id, sp) => { editAnimal(id); s.value = sp; onSpeciesChange(); saveAnimal(); return animals.find(a => a.id === id).spId; };
  const ids = sp => animals.filter(a => a.sp === sp).map(a => a.spId).sort((x, y) => x - y).join();
  showTab('entry');
  // The ID is free in the new species: kept, and the counter moves past it
  applyData({ version: 7, herd: [__mk8(1, 1, 'Hyena', 'M', 'Wild', 'HY01'), __mk8(2, 2, 'Hyena', 'F', 'Wild', 'HY02'), __mk8(3, 3, 'hyena', 'M', 'Wild', 'Lowercase')] }); migrateMemory();
  const kept = fix(3, 'Hyena'), next = getNextSpId('Hyena');
  // The ID is taken in the new species: a fresh one
  applyData({ version: 7, herd: [__mk8(1, 1, 'Hyena', 'M', 'Wild', 'HY01'), __mk8(2, 2, 'Hyena', 'F', 'Wild', 'HY02'), __mk8(3, 2, 'hyena', 'M', 'Wild', 'Lowercase')] }); migrateMemory();
  const collided = fix(3, 'Hyena'), hyenas = ids('Hyena');
  // Known species to known species
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 M0-Wild'), __mk8(2, 1, 'Buffalo', 'F', 'Wild', 'BF01 F0-Wild')] }); migrateMemory();
  const moved = fix(2, 'Moa'), moas = ids('Moa');
  editingId = null; resetFormUI(); s.value = 'Dune Raptor'; onSpeciesChange();
  return { kept, next, collided, hyenas, moved, moas, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('changing the species in the edit form keeps the ID only if the new species does not use it', !speciesFix.error && speciesFix.kept === 3 && speciesFix.next === 4
  && speciesFix.collided === 3 && speciesFix.hyenas === '1,2,3' && speciesFix.moved === 2 && speciesFix.moas === '1,2', JSON.stringify(speciesFix));
const idLimit = await ev(`(() => { try {
  applyData({ version: 7, nextSpAid: { BM: 999999 }, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01'), __mk8(2, 3, 'Moa', 'F', 'Wild', 'BM03'), __mk8(3, 999999, 'Moa', 'M', 'Wild', 'BM999999')] }); migrateMemory();
  const peek = peekNextSpId('Moa');
  return { peek, next: getNextSpId('Moa'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
await ev(`applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 M0-Wild'), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 F0-Wild')] }); migrateMemory(); true`);
const bigCsv = await importText('spId,name,species,sex,bloodline\nBM1234567,BM1234567 M30-Wild,Moa,M,Wild\nBM0001234568,BM0001234568 F30-Wild,Moa,F,Wild\nBM99999999999999999999,BM99999999999999999999 M30-Bold,Moa,M,Bold');
const csvBig = await ev(`animals.filter(x => / [MF]30-/.test(x.name)).map(a => a.spId + ':' + a.name)`);
check('IDs stay in 1..999999: a full counter hands out the lowest free ID (also in the preview), a larger CSV ID gets a fresh ID and name prefix', !idLimit.error && idLimit.peek === 2 && idLimit.next === 2
  && JSON.stringify(csvBig) === JSON.stringify(['3:BM03 M30-Wild', '4:BM04 F30-Wild', '5:BM05 M30-Bold']), JSON.stringify({ idLimit, csvBig, msg: bigCsv.msg }));
// With the counter past the limit, a CSV row without an ID must not take an ID a later row keeps, or that row would be renamed and parent links lost
await ev(`applyData({ version: 7, nextSpAid: { BM: 999999 }, herd: [__mk8(1, 1, 'Moa', 'M', 'Hardy', 'BM01 M0-Hardy'), __mk8(2, 999999, 'Moa', 'F', 'Stout', 'BM999999 F0-Stout')] }); migrateMemory(); true`);
const laterCsv = await importText('spId,name,species,sex,bloodline,parent1\n,,Moa,M,Wild,\nBM02,BM02 F30-Alpha,Moa,F,Alpha,\nBM03,BM03 M30-Bold,Moa,M,Bold,BM02 F30-Alpha');
const later = await ev(`(() => { const by = bl => animals.find(a => a.bl === bl) || {}; const noId = by('Wild'), two = by('Alpha'), three = by('Bold');
  return { noId: noId.spId, two: two.spId + ':' + two.name, three: three.spId + ':' + three.name, parentIsTwo: animals.find(a => a.name === three.p1) === two }; })()`);
check('a CSV row without an ID never takes an ID that a later row in the file keeps', later.noId === 4 && later.two === '2:BM02 F30-Alpha' && later.three === '3:BM03 M30-Bold' && later.parentIsTwo, JSON.stringify({ later, msg: laterCsv.msg }));
await ev(`applyData(JSON.parse(window.__snap9)); migrateMemory(); saveAndRefreshFull(); true`);

// ── #21: feedback links ─────────────────────────────────────────────────────────────
// Every GitHub link in the page goes to this repository (the links used to point at the account the project had before)
const REPO = 'https://github.com/rnk-gaming/icarus/', REPO_ISSUES = REPO + 'issues';
const feedback = await ev(`(() => {
  const card = [...document.querySelectorAll('.entry-card')].find(c => /Feedback/.test(c.querySelector('h2')?.textContent || ''));
  return { elsewhere: [...document.querySelectorAll('[href]')].map(e => e.getAttribute('href')).filter(h => /github\\.com/i.test(h) && !h.startsWith(${JSON.stringify(REPO)})),
           links: card ? [...card.querySelectorAll('a[href]')].map(a => a.getAttribute('href')) : [] }; })()`);
check('feedback links point at the current repository', feedback.elsewhere.length === 0 && feedback.links.length === 3
  && feedback.links.every(h => h === REPO_ISSUES || h.startsWith(REPO_ISSUES + '/new?')), JSON.stringify(feedback));
// The issue templates live in this repository, next to tools/; renaming one or changing its label must fail here
const TEMPLATE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '.github', 'ISSUE_TEMPLATE');
let templateFiles = [];
try { templateFiles = readdirSync(TEMPLATE_DIR); } catch { /* no folder: every template link is reported below */ }
const newIssueLinks = feedback.links.filter(h => h.startsWith(REPO_ISSUES + '/new?'));
const templateProblems = newIssueLinks.flatMap(h => {
  const q = new URL(h).searchParams, t = q.get('template'), l = q.get('labels');
  if (!t || !templateFiles.includes(t)) return [`${t}: no file in .github/ISSUE_TEMPLATE`];
  const fm = readFileSync(join(TEMPLATE_DIR, t), 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const own = ((fm && fm[1].match(/^labels:[ \t]*(.*)$/m)) || [])[1]?.trim().replace(/^['"]|['"]$/g, '') ?? '';
  return l !== null && l !== own ? [`${t}: link has labels=${l}, template has "${own}"`] : [];
});
check('feedback links name issue templates that exist, with the same labels', newIssueLinks.length === 2 && templateProblems.length === 0,
  templateProblems.join(' | ') || `${newIssueLinks.length} template links`);

// ── #23: internal animal IDs are unique ─────────────────────────────────────────────
// The clock is held still while animals are added, so every ID is minted in the same millisecond. That is the case where
// Date.now() + Math.random() repeated IDs (a double holds only about 4096 fractions per millisecond), so these checks fail every run before v0.31c
await ev(`window.__snap23 = JSON.stringify(getAllData()); true`);
const holdClock = () => ev(`(() => { const t = Date.now(); window.__realNow = Date.now; Date.now = () => t; return true; })()`);
const releaseClock = () => ev(`(() => { if (window.__realNow) Date.now = window.__realNow; window.__realNow = null; return true; })()`);
await holdClock();
const idLoop = await ev(`(() => { const orig = saveAndRefreshFull; try {
  saveAndRefreshFull = () => {};   // 600 full renders would only slow the test down
  editingId = null; resetFormUI();
  const before = animals.length, s = document.getElementById('f-species');
  for (let i = 0; i < 600; i++) {
    s.value = 'Moa'; onSpeciesChange();
    document.getElementById('f-sex').value = i % 2 ? 'F' : 'M';
    document.getElementById('f-bloodline').value = 'Wild';
    saveAnimal();
  }
  const added = animals.slice(before);
  return { added: added.length, distinct: new Set(added.map(a => a.id)).size, herdUnique: new Set(animals.map(a => a.id)).size === animals.length, error: '' };
} catch (e) { return { error: e.message }; } finally { saveAndRefreshFull = orig; dismissPairAssign(); resetFormUI(); } })()`).catch(e => ({ error: e.message.split('\n')[0] }));
await releaseClock();
check('600 animals saved in one go get 600 different internal IDs', !idLoop.error && idLoop.added === 600 && idLoop.distinct === 600 && idLoop.herdUnique, JSON.stringify(idLoop));

// A file from an older version: two animals share an ID and one has text as its ID. The first keeps its ID, the others get fresh ones and the file is saved
const idTwins = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(5, 1, 'Moa', 'M', 'Wild', 'BM01 Twin A'), __mk8(5, 2, 'Moa', 'F', 'Wild', 'BM02 Twin B'), __mk8('x', 3, 'Moa', 'M', 'Bold', 'BM03 Text Id')] }); migrateMemory();
  const ids = animals.map(a => a.id);
  const saved = JSON.parse(localStorage.getItem(KEYS.HERD) || '[]').map(a => a.id);
  const twinA = animals.find(a => a.name === 'BM01 Twin A'), firstKeeps = twinA.id === 5;
  deleteAnimal(twinA.id, true);
  return { ids, distinct: new Set(ids).size, finite: ids.every(Number.isFinite), firstKeeps, saved: saved.length === 3 && new Set(saved).size === 3 && saved.every(Number.isFinite),
           left: animals.map(a => a.name).join(), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('repeated and text internal IDs from a file become unique, and Delete removes only the animal picked', !idTwins.error && idTwins.distinct === 3 && idTwins.finite
  && idTwins.firstKeeps && idTwins.saved && idTwins.left === 'BM02 Twin B,BM03 Text Id', JSON.stringify(idTwins));

// An ID too large to count past (1e300 + 1 === 1e300) would make every new ID the same; it is replaced on load like a repeat
const idHuge = await ev(`(() => { const orig = saveAndRefreshFull; try {
  applyData({ version: 7, herd: [__mk8(1e300, 1, 'Moa', 'M', 'Wild', 'BM01 Huge'), __mk8(3, 2, 'Moa', 'F', 'Wild', 'BM02 Small')] }); migrateMemory();
  const huge = animals.find(a => a.name === 'BM01 Huge').id;
  saveAndRefreshFull = () => {};
  editingId = null; resetFormUI();
  for (let i = 0; i < 2; i++) { document.getElementById('f-species').value = 'Moa'; onSpeciesChange(); saveAnimal(); }
  const ids = animals.map(a => a.id);
  return { huge, safe: Number.isFinite(huge) && huge > 0 && huge <= 1e15, small: animals.find(a => a.name === 'BM02 Small').id,
           herd: ids.length, distinct: new Set(ids).size, error: '' };
} catch (e) { return { error: e.message }; } finally { saveAndRefreshFull = orig; dismissPairAssign(); resetFormUI(); } })()`);
check('an internal ID too large to count past is replaced on load, and new animals still get their own IDs', !idHuge.error && idHuge.safe && idHuge.small === 3
  && idHuge.herd === 4 && idHuge.distinct === 4, JSON.stringify(idHuge));

// IDs stay at or below the ceiling of 1e15. A file whose highest ID is the ceiling still gives new animals their own IDs,
// and saving and loading that herd again changes nothing. 0, a negative ID and Number.MAX_SAFE_INTEGER are replaced on load
const idCeiling = await ev(`(() => { const orig = saveAndRefreshFull, origSave = save; try {
  applyData({ version: 7, herd: [__mk8(1e15, 1, 'Moa', 'M', 'Wild', 'BM01 Top'), __mk8(1e15 - 1, 2, 'Moa', 'F', 'Wild', 'BM02 Below')] }); migrateMemory();
  saveAndRefreshFull = () => {};
  editingId = null; resetFormUI();
  for (let i = 0; i < 3; i++) { document.getElementById('f-species').value = 'Moa'; onSpeciesChange(); saveAnimal(); }
  const added = animals.slice(2).map(a => a.id);
  const addedOk = added.length === 3 && new Set(added).size === 3 && added.every(id => id > 0 && id <= 1e15) && animals[0].id === 1e15 && animals[1].id === 1e15 - 1;
  deleteAnimal(added[1], true);
  const afterDelete = animals.length, before = JSON.stringify(animals.map(a => a.id));
  let saves = 0; save = () => { saves++; };
  applyData(JSON.parse(JSON.stringify(getAllData()))); migrateMemory();
  save = origSave;
  const reloadSame = JSON.stringify(animals.map(a => a.id)) === before;
  applyData({ version: 7, herd: [__mk8(Number.MAX_SAFE_INTEGER, 1, 'Moa', 'M', 'Wild', 'BM01 Safe'), __mk8(0, 2, 'Moa', 'F', 'Wild', 'BM02 Zero'), __mk8(-4, 3, 'Moa', 'M', 'Wild', 'BM03 Neg')] }); migrateMemory();
  const byName = n => animals.find(a => a.name === n).id, replaced = animals.map(a => a.id);
  return { added, addedOk, afterDelete, reloadSame, saves, replaced, safeReplaced: byName('BM01 Safe') <= 1e15, zeroPositive: byName('BM02 Zero') > 0,
           replacedOk: replaced.every(id => id > 0 && id <= 1e15) && new Set(replaced).size === 3, error: '' };
} catch (e) { return { error: e.message }; } finally { saveAndRefreshFull = orig; save = origSave; dismissPairAssign(); resetFormUI(); } })()`);
check('internal IDs stay at or below 1e15: new IDs at the ceiling differ, a reload changes none, and 0, negative and too large IDs are replaced',
  !idCeiling.error && idCeiling.addedOk && idCeiling.afterDelete === 4 && idCeiling.reloadSame && idCeiling.saves === 0
  && idCeiling.safeReplaced && idCeiling.zeroPositive && idCeiling.replacedOk, JSON.stringify(idCeiling));

// A file whose only problem is one text ID is saved once with the new ID, so the animal keeps that ID on the next load.
// The second load reads what was saved, or the original file if nothing was
const idText = await ev(`(() => { const origSave = save; try {
  const file = JSON.stringify({ version: 7, herd: [__mk8(11, 1, 'Moa', 'M', 'Wild', 'BM01 Fine'), __mk8('seven', 2, 'Moa', 'F', 'Wild', 'BM02 Text')] });
  let saves = 0, disk = file; save = () => { saves++; disk = JSON.stringify(getAllData()); };
  applyData(JSON.parse(disk)); migrateMemory();
  const first = animals.find(a => a.name === 'BM02 Text').id, firstSaves = saves;
  saves = 0;
  applyData(JSON.parse(disk)); migrateMemory();
  return { first, firstSaves, again: animals.find(a => a.name === 'BM02 Text').id, secondSaves: saves, error: '' };
} catch (e) { return { error: e.message }; } finally { save = origSave; } })()`);
check('a text internal ID is replaced and saved once, and the next load keeps it without saving', !idText.error && typeof idText.first === 'number' && idText.first > 0
  && idText.firstSaves === 1 && idText.again === idText.first && idText.secondSaves === 0, JSON.stringify(idText));

await ev(`applyData(JSON.parse(window.__snap23)); migrateMemory(); saveAndRefreshFull(); true`);
const rows300 = Array.from({ length: 300 }, (_, i) => `Moa,${i % 2 ? 'F' : 'M'},${['Wild', 'Alpha', 'Bold'][i % 3]}`);
await holdClock();
const csv300 = await importText('species,sex,bloodline\n' + rows300.join('\n')).catch(e => ({ error: e.message.split('\n')[0] }));
await releaseClock();
const idCsv = await ev(`({ unique: new Set(animals.map(a => a.id)).size === animals.length, herd: animals.length })`);
check('a CSV import of 300 rows gives every animal its own internal ID', !csv300.error && csv300.after - csv300.before === 300 && idCsv.unique, JSON.stringify({ ...csv300, ...idCsv }));
await ev(`(() => { applyData(JSON.parse(window.__snap23)); migrateMemory(); saveAndRefreshFull(); document.getElementById('f-species').value = 'Dune Raptor'; onSpeciesChange(); return true; })()`);

// ── #24: pair slots and parent links follow animal changes ──────────────────────────
// Each check below fails on v0.31d. Dead, On Station and Discard are never in a pair slot; an animal that leaves a slot
// keeps its status, except Breed and Temp Breed, which become Reserve
await ev(`window.__snap24 = JSON.stringify(getAllData()); window.__st24 = n => { const s = {}; STATS.forEach(k => s[k] = n); return s; }; true`);
// One availability rule: the Pairs pool and the optimiser offer the same animals, and the viewer's Assign cannot place the others
const avail = await ev(`(() => { try {
  applyData({ version: 7, herd: [
      __mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Station', { status: 'Station', stats: __st24(9) }),
      __mk8(2, 2, 'Moa', 'M', 'Wild', 'BM02 Discard', { status: 'Discard', stats: __st24(8) }),
      __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 Dead', { status: 'Dead', stats: __st24(10) }),
      __mk8(4, 4, 'Moa', 'M', 'Wild', 'BM04 Keep', { status: 'Keep', stats: __st24(2) }),
      __mk8(5, 5, 'Moa', 'F', 'Wild', 'BM05 Keep', { status: 'Keep', stats: __st24(3) })],
    pairs: { Moa: [{ m: '', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('pairs'); renderPairs();
  const poolEl = document.querySelector('.pair-pool[data-pool-sp="Moa"]');
  const pool = poolEl ? [...poolEl.querySelectorAll('.pool-tile')].map(t => animals.find(a => a.id === +t.dataset.aid)?.name).sort().join() : 'no pool';
  const proposed = buildOptimizePlanForSpecies('Moa', new Set()).proposedPairs.flatMap(p => [p.m, p.f]).filter(Boolean).sort().join();
  updatePair('Moa', 0, 'm', 'BM01 Station');
  return { pool, proposed, slot: pairsMap.Moa[0].m, status: animals[0].status, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('Pairs and the optimiser offer the same animals, never Dead, On Station or Discard', !avail.error && avail.pool === 'BM04 Keep,BM05 Keep'
  && avail.proposed === 'BM04 Keep,BM05 Keep' && avail.slot === '' && avail.status === 'Station', JSON.stringify(avail));
// A generated name changes with the stats. Renamed in the edit form (male) or by a game import (female), the animal keeps its
// pair slot and its offspring keep their parent links
await ev(`window.__moa24 = (id, sex, n, extra = {}) => { const ph = SPECIES_DATA.Moa.phenotypes[0].label, st = __st24(n);
  return __mk8(id, id, 'Moa', sex, 'Wild', computeName('Moa', sex, 'Wild', ph, st, id), { ph, stats: st, ...extra }); }; true`);
const renamed = await ev(`(() => { try {
  const m = __moa24(1, 'M', 5, { status: 'Breed' }), f = __moa24(2, 'F', 5, { status: 'Breed' }), kid = __moa24(3, 'F', 4, { p1: m.name, p2: f.name, isBred: true, gen: 2 });
  applyData({ version: 7, herd: [m, f, kid], pairs: { Moa: [{ m: m.name, f: f.name }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('entry'); editAnimal(1);
  const fit = document.getElementById('stat-FIT'); fit.value = 9; onStatInput(fit, 'FIT'); saveAnimal();
  const p = planMountImport(${JSON.stringify(fx.file([{ name: 'BM02 Mum', type: 'Moa', sex: 1, variation: 0, lineage: 'Wild', stats: [5, 6, 5, 5, 5, 5, 5] }]))});
  applyMountImport(p, { addIdx: new Set(), diffKeys: new Set(p.changed.flatMap(x => x.diffs.map(d => x.a.id + '|' + d.field))), stationAll: false, notInFile: new Map() });
  const by = id => animals.find(a => a.id === id), pair = pairsMap.Moa[0];
  return { maleRenamed: by(1).name !== m.name, femaleRenamed: by(2).name !== f.name, slotM: pair.m === by(1).name, slotF: pair.f === by(2).name,
    p1: by(3).p1 === by(1).name, p2: by(3).p2 === by(2).name, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a renamed animal keeps its pair slot and its offspring links, from the edit form and from a game import', !renamed.error && renamed.maleRenamed && renamed.femaleRenamed
  && renamed.slotM && renamed.slotF && renamed.p1 && renamed.p2, JSON.stringify(renamed));
// Every way an animal leaves a slot. Dead (and Undo), Station, Discard and Delete empty the slot at once and keep the status;
// ✕ and the card's − button take an animal out, and only Breed and Temp Breed become Reserve
const left = await ev(`(() => { try {
  const males = [['BM01 Dropdown', 'Breed'], ['BM02 Grave', 'Breed'], ['BM03 Form', 'Breed'], ['BM04 Gone', 'Breed'], ['BM05 Temp', 'Temp'], ['BM06 Keep', 'Keep'], ['BM07 Minus', 'Breed']];
  applyData({ version: 7, herd: males.map(([name, status], i) => __mk8(i + 1, i + 1, 'Moa', 'M', 'Wild', name, { status })),
    pairs: { Moa: males.map(([name]) => ({ m: name, f: '' })) }, pairCounts: { Moa: 7 } }); migrateMemory();
  const st = id => animals.find(a => a.id === id)?.status, slot = name => (pairsMap.Moa || []).findIndex(p => p.m === name);
  setAnimalStatus(1, 'Station');
  markDead(2); const deadSlot = slot('BM02 Grave'); _toastUndo?.();
  showTab('entry'); editAnimal(3); document.getElementById('f-status').value = 'Discard'; saveAnimal();
  deleteAnimal(4, true);
  updatePair('Moa', 4, 'm', ''); updatePair('Moa', 5, 'm', '');
  removePairSlot('Moa');
  return { station: [st(1), slot('BM01 Dropdown')], dead: [deadSlot, st(2), slot('BM02 Grave')], discard: [st(3), slot('BM03 Form')], deleted: slot('BM04 Gone'),
    temp: [st(5), slot('BM05 Temp')], keep: [st(6), slot('BM06 Keep')], minus: [st(7), slot('BM07 Minus'), pairCounts.Moa], error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('Dead, Station, Discard and Delete empty the pair slot, Undo restores it, and an animal taken out turns Breed or Temp Breed into Reserve',
  !left.error && left.station.join() === 'Station,-1' && left.dead.join() === '-1,Breed,1' && left.discard.join() === 'Discard,-1' && left.deleted === -1
  && left.temp.join() === 'Reserve,-1' && left.keep.join() === 'Keep,-1' && left.minus.join() === 'Reserve,-1,6', JSON.stringify(left));
// Deleting the last pair row leaves one empty pair: the card, the stored count, the entry form's advice and a reload all say 1
const lastRow = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Last', { status: 'Breed' })], pairs: { Moa: [{ m: 'BM01 Last', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('pairs'); deletePairRow('Moa', 0);
  const card = document.querySelector('.pair-pool[data-pool-sp="Moa"]')?.closest('.pair-species-card');
  const shown = card ? [card.querySelector('.pairs-count')?.textContent, card.querySelectorAll('.pair-block').length].join() : 'no card';
  const stored = pairCounts.Moa, last = animals[0].status;
  showTab('entry'); const s = document.getElementById('f-species'); s.value = 'Moa'; onSpeciesChange();
  document.getElementById('f-sex').value = 'M'; document.getElementById('stat-VIG').value = 5;
  const advice = computeAdvice()?.results.length ?? 'none';
  resetFormUI(); s.value = 'Dune Raptor'; onSpeciesChange();
  applyData(JSON.parse(JSON.stringify(getAllData()))); migrateMemory();
  return { shown, stored, last, advice, reloaded: pairCounts.Moa, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('deleting the last pair row leaves one empty pair everywhere, also after a reload, and its Breed animal becomes Reserve', !lastRow.error && lastRow.shown === '1 pair,1'
  && lastRow.stored === 1 && lastRow.last === 'Reserve' && lastRow.advice === 1 && lastRow.reloaded === 1, JSON.stringify(lastRow));
// Parents: an animal cannot be its own parent, or the parent of its parent at any depth. The form refuses and saves nothing
const parentLoop = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Gran'), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Mum', { p1: 'BM01 Gran' }),
    __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 Kid', { p2: 'BM02 Mum' }), __mk8(4, 4, 'Moa', 'M', 'Wild', 'BM04 Other')] }); migrateMemory();
  showTab('entry');
  const tryParents = (p1, p2) => { editAnimal(1); document.getElementById('f-p1').value = p1; document.getElementById('f-p2').value = p2; saveAnimal();
    const toast = document.getElementById('toast').textContent, g = animals.find(a => a.id === 1); editingId = null; resetFormUI(); return [g.p1, g.p2, toast]; };
  const self = tryParents('BM01 Gran', ''), child = tryParents('', 'BM02 Mum'), grandchild = tryParents('BM03 Kid', ''), other = tryParents('BM04 Other', '');
  const s = document.getElementById('f-species'); s.value = 'Dune Raptor'; onSpeciesChange();
  return { self, child, grandchild, other, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('an animal cannot be its own parent or the parent of an ancestor, with a message and nothing saved', !parentLoop.error
  && parentLoop.self[0] === '' && /own parent/.test(parentLoop.self[2]) && parentLoop.child[1] === '' && /BM02 Mum descends/.test(parentLoop.child[2])
  && parentLoop.grandchild[0] === '' && /BM03 Kid descends/.test(parentLoop.grandchild[2]) && parentLoop.other[0] === 'BM04 Other', JSON.stringify(parentLoop));
// Tiles show the species ID, also for an animal with a custom name
const tileIds = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 7, 'Moa', 'M', 'Wild', 'Big Red', { status: 'Breed' }), __mk8(2, 8, 'Moa', 'F', 'Wild', 'Little Blue')],
    pairs: { Moa: [{ m: 'Big Red', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('pairs'); renderPairs();
  const card = document.querySelector('.pair-pool[data-pool-sp="Moa"]')?.closest('.pair-species-card');
  const text = sel => card ? [...card.querySelectorAll(sel)].map(t => t.textContent).join() : 'no card';
  return { slot: text('.pair-slot .tile-name'), pool: text('.pool-tile .tile-name'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('pair and pool tiles show the species ID, not the first word of the name', !tileIds.error && tileIds.slot === 'BM07' && tileIds.pool === 'BM08', JSON.stringify(tileIds));
// Loading applies the same rule. A slot is emptied when it holds a Dead, On Station or Discard animal, a name that is no animal, an
// animal of the wrong sex, or an animal already in an earlier slot; slots past the count are cut. Only an animal that lost its slot
// turns from Breed or Temp Breed into Reserve: Breed set by hand without a slot stays. Saved once; the next load changes nothing
const onLoad = await ev(`(() => { const origSave = save; try {
  const file = JSON.stringify({ version: 7, herd: [
      __mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Dead', { status: 'Dead', notes: 'kept' }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Station', { status: 'Station' }),
      __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 Discard', { status: 'Discard' }), __mk8(4, 4, 'Moa', 'F', 'Wild', 'BM04 Paired', { status: 'Breed' }),
      __mk8(5, 5, 'Moa', 'M', 'Wild', 'BM05 Unpaired', { status: 'Breed' }), __mk8(6, 6, 'Moa', 'F', 'Wild', 'BM06 Temp', { status: 'Temp' }),
      __mk8(7, 7, 'Moa', 'M', 'Wild', 'BM07 Keep', { status: 'Keep' }), __mk8(8, 8, 'Moa', 'F', 'Wild', 'BM08 WrongSex', { status: 'Breed' }),
      __mk8(9, 9, 'Moa', 'M', 'Wild', 'BM09 Twice', { status: 'Breed' }), __mk8(10, 10, 'Moa', 'M', 'Wild', 'BM10 CutOff', { status: 'Temp' })],
    pairs: { Moa: [{ m: 'BM01 Dead', f: 'BM02 Station' }, { m: 'BM03 Discard', f: 'BM04 Paired' }, { m: 'BM08 WrongSex', f: 'BM99 Ghost' },
      { m: 'BM09 Twice', f: '' }, { m: 'BM09 Twice', f: '' }, { m: 'BM10 CutOff', f: '' }] }, pairCounts: { Moa: 5 } });
  let saves = 0, disk = file; save = () => { saves++; disk = JSON.stringify(getAllData()); };
  applyData(JSON.parse(disk)); migrateMemory();
  const firstSaves = saves; saves = 0;
  applyData(JSON.parse(disk)); migrateMemory();
  const dead = animals.find(a => a.id === 1);
  return { slots: pairsMap.Moa.map(p => p.m + '|' + p.f).join(), statuses: animals.map(a => a.status).join(), dead: [dead.name, dead.status, dead.notes].join(),
    firstSaves, secondSaves: saves, error: '' };
} catch (e) { return { error: e.message }; } finally { save = origSave; } })()`);
check('a loaded file empties slots holding Dead, On Station, Discard, missing, misfitting or repeated animals, and only animals that lost a slot become Reserve', !onLoad.error
  && onLoad.slots === '|,|BM04 Paired,|,BM09 Twice|,|' && onLoad.statuses === 'Dead,Station,Discard,Breed,Breed,Temp,Keep,Reserve,Breed,Reserve'
  && onLoad.dead === 'BM01 Dead,Dead,kept' && onLoad.firstSaves === 1 && onLoad.secondSaves === 0, JSON.stringify(onLoad));
// A pair count of 0 (an older deletePairRow could store it) becomes 1, and the file is written once
const zeroCount = await ev(`(() => { const origSave = save; try {
  let saves = 0; save = () => { saves++; };
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Zero')], pairCounts: { Moa: 0 } }); migrateMemory();
  return { count: pairCounts.Moa, saves, error: '' }; } catch (e) { return { error: e.message }; } finally { save = origSave; } })()`);
check('a pair count of 0 from a file becomes 1 and the file is saved', !zeroCount.error && zeroCount.count === 1 && zeroCount.saves === 1, JSON.stringify(zeroCount));
// A new species or sex that no longer fits the slot: the edit takes the animal out, Breed becomes Reserve, and it can be placed again
const misfit = await ev(`(() => { try {
  const m = __moa24(1, 'M', 5, { status: 'Breed' }), f = __moa24(2, 'F', 5, { status: 'Breed' });
  applyData({ version: 7, herd: [m, f], pairs: { Moa: [{ m: m.name, f: f.name }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('entry'); editAnimal(1); const s = document.getElementById('f-species'); s.value = 'Buffalo'; onSpeciesChange(); saveAnimal();
  const toast = document.getElementById('toast').textContent;
  editAnimal(2); document.getElementById('f-sex').value = 'M'; saveAnimal();
  s.value = 'Dune Raptor'; onSpeciesChange();
  showTab('pairs'); renderPairs();
  const by = id => animals.find(a => a.id === id), pool = document.querySelector('.pair-pool[data-pool-sp="Buffalo"]');
  return { slot: pairsMap.Moa[0].m + '|' + pairsMap.Moa[0].f, statuses: [by(1).status, by(2).status].join(), species: by(1).sp,
    inBuffaloPool: !!pool?.querySelector('.pool-tile[data-aid="1"]'), toast: /no longer fits/.test(toast), logged: logEntries.some(e => /no longer fits/.test(e.msg)),
    error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a paired animal edited to another species or sex leaves the slot, becomes Reserve, says so, and can be placed again', !misfit.error && misfit.slot === '|'
  && misfit.statuses === 'Reserve,Reserve' && misfit.species === 'Buffalo' && misfit.inBuffaloPool && misfit.toast && misfit.logged, JSON.stringify(misfit));
// Two animals with one name (older files): renaming one moves nothing that may be the other's, a generated name may not repeat
// another animal's name, and on load the twin that can be paired keeps the slot
const twins = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'Twin', { status: 'Breed' }), __mk8(2, 2, 'Moa', 'M', 'Wild', 'Twin', { status: 'Keep' }),
    __mk8(3, 3, 'Moa', 'F', 'Wild', 'Kid', { p1: 'Twin' }), __mk8(4, 7, 'Moa', 'M', 'Wild', computeName('Moa', 'M', 'Wild', '', {}, 7)),
    __mk8(5, 7, 'Moa', 'M', 'Wild', 'Dee')], pairs: { Moa: [{ m: 'Twin', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('entry'); editAnimal(2); document.getElementById('f-custom-name').value = 'Twin Two'; saveAnimal();
  const afterRename = { slot: pairsMap.Moa[0].m, kidP1: animals.find(a => a.id === 3).p1, renamed: animals.find(a => a.id === 2).name };
  editAnimal(5); document.getElementById('f-custom-name').value = ''; saveAnimal();
  const dee = animals.find(a => a.id === 5).name, dupToast = document.getElementById('toast').textContent;
  editingId = null; resetFormUI(); const s = document.getElementById('f-species'); s.value = 'Dune Raptor'; onSpeciesChange();
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'Twin', { status: 'Dead' }), __mk8(2, 2, 'Moa', 'M', 'Wild', 'Twin', { status: 'Breed' })],
    pairs: { Moa: [{ m: 'Twin', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  return { ...afterRename, dee, dupToast: /already exists/.test(dupToast), loadSlot: pairsMap.Moa[0].m, livingTwin: animals[1].status, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('with two animals of one name, a rename moves nothing of the other, a repeated generated name is refused, and the loader keeps the living twin in the slot',
  !twins.error && twins.slot === 'Twin' && twins.kidP1 === 'Twin' && twins.renamed === 'Twin Two' && twins.dee === 'Dee' && twins.dupToast
  && twins.loadSlot === 'Twin' && twins.livingTwin === 'Breed', JSON.stringify(twins));
// A file with a parent loop (A is B's parent and B is A's) loads and stays editable; only a changed parent is checked, a new loop is
// still refused, and a refused new animal uses up no ID number
const loopFile = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 A', { p1: 'BM02 B' }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 B', { p1: 'BM01 A' }),
    __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 C', { p1: 'BM01 A' })] }); migrateMemory();
  showTab('lineage'); updateLineageSelector(); const tree = !!buildLineageTree('BM01 A', 0, 4);
  showTab('entry'); editAnimal(1); document.getElementById('f-notes').value = 'edited'; saveAnimal();
  const notes = animals.find(a => a.id === 1).notes;
  editAnimal(1); document.getElementById('f-p2').value = 'BM03 C'; saveAnimal();
  const loopToast = document.getElementById('toast').textContent, p2 = animals.find(a => a.id === 1).p2;
  editingId = null; resetFormUI();
  const before = { bm: nextSpAid.BM, last: _lastAnimalId, n: animals.length }, s = document.getElementById('f-species');
  s.value = 'Moa'; onSpeciesChange(); document.getElementById('f-sex').value = 'M'; document.getElementById('f-bloodline').value = 'Wild';
  document.getElementById('f-custom-name').value = 'Selfie'; document.getElementById('f-p1').value = 'Selfie'; saveAnimal();
  const refused = { bm: nextSpAid.BM, last: _lastAnimalId, n: animals.length, toast: document.getElementById('toast').textContent };
  resetFormUI(); s.value = 'Dune Raptor'; onSpeciesChange();
  return { tree, notes, p2, loop: /BM03 C descends/.test(loopToast), sameCounter: refused.bm === before.bm && refused.last === before.last && refused.n === before.n,
    ownParent: /own parent/.test(refused.toast), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a file with a parent loop loads and can be edited, a new loop is refused, and a refused new animal uses no ID number', !loopFile.error && loopFile.tree
  && loopFile.notes === 'edited' && loopFile.loop && loopFile.p2 === '' && loopFile.sameCounter && loopFile.ownParent, JSON.stringify(loopFile));
// Undo after 🪦 puts the animal back only where it was: not into a row that moved or a slot that was taken (it becomes Reserve then),
// and an unpaired Breed animal gets Breed back
const undo = await ev(`(() => { try {
  const herd = () => [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 X', { status: 'Breed' }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 A', { status: 'Breed' }),
    __mk8(3, 3, 'Moa', 'F', 'Wild', 'BM03 B', { status: 'Breed' }), __mk8(4, 4, 'Moa', 'M', 'Wild', 'BM04 Z', { status: 'Keep' }), __mk8(5, 5, 'Moa', 'M', 'Wild', 'BM05 Solo', { status: 'Breed' })];
  const where = n => pairsMap.Moa.map((p, i) => p.m === n || p.f === n ? i : -1).filter(i => i >= 0).join() || 'none';
  applyData({ version: 7, herd: herd(), pairs: { Moa: [{ m: 'BM01 X', f: 'BM02 A' }, { m: '', f: 'BM03 B' }] }, pairCounts: { Moa: 2 } }); migrateMemory();
  markDead(1); let u = _toastUndo; deletePairRow('Moa', 0); u();
  const rowMoved = [animals[0].status, where('BM01 X'), pairsMap.Moa[0].m].join();
  applyData({ version: 7, herd: herd(), pairs: { Moa: [{ m: 'BM01 X', f: 'BM02 A' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  markDead(1); u = _toastUndo; updatePair('Moa', 0, 'm', 'BM04 Z'); u();
  const taken = [animals[0].status, where('BM01 X'), pairsMap.Moa[0].m].join();
  markDead(5); u = _toastUndo; u();
  return { rowMoved, taken, solo: animals[4].status, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('Undo after 🪦 never puts an animal into a moved row or a taken slot, and gives an unpaired Breed animal Breed back', !undo.error
  && undo.rowMoved === 'Reserve,none,' && undo.taken === 'Reserve,none,BM04 Z' && undo.solo === 'Breed', JSON.stringify(undo));
// An animal of a species this version does not know gets no Assign buttons, and nothing places a Station animal
const guards = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'constructor', 'M', 'Wild', 'Ctor', { status: 'Keep' }), __mk8(2, 2, 'Moa', 'M', 'Wild', 'BM02 Stored', { status: 'Station' })],
    pairCounts: { Moa: 1 } }); migrateMemory();
  viewAnimal(1); const assign = document.querySelectorAll('.view-pair-slot').length; closeViewPanel();
  updatePair('constructor', 0, 'm', 'Ctor');
  initPairs(); placeInSlot('Moa', 0, 'm', 'BM02 Stored');
  return { assign, ownKey: Object.hasOwn(pairsMap, 'constructor'), slot: pairsMap.Moa[0].m, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('an unknown species gets no Assign buttons or pair slots, and a Station animal is never placed', !guards.error && guards.assign === 0 && !guards.ownKey && guards.slot === '', JSON.stringify(guards));
// The ways of placing an animal from round one: the optimiser moves a proposed animal out of its other slot, "Just remove from pair"
// in the placement panel turns Breed into Reserve, and a drop onto an occupied slot asks the right question and applies it
const placing = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Best', { status: 'Breed', stats: __st24(9) }), __mk8(2, 2, 'Moa', 'M', 'Wild', 'BM02 Next', { stats: __st24(5) }),
    __mk8(3, 3, 'Moa', 'F', 'Wild', 'BM03 F', { stats: __st24(8) }), __mk8(4, 4, 'Moa', 'F', 'Wild', 'BM04 F', { stats: __st24(6) })],
    pairs: { Moa: [{ m: '', f: '' }, { m: 'BM01 Best', f: '' }] }, pairCounts: { Moa: 2 } }); migrateMemory();
  showOptimizeModal('Moa'); applyOptimizeSinglePair(0, 0, { style: {} }); closeOptimizeModal();
  const optimiser = pairsMap.Moa.flatMap(p => [p.m, p.f]).filter(n => n === 'BM01 Best').length + '@' + pairsMap.Moa[0].m;
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Old', { status: 'Breed' }), __mk8(2, 2, 'Moa', 'M', 'Wild', 'BM02 New', { status: 'Keep' })],
    pairs: { Moa: [{ m: 'BM01 Old', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showPairAssignPanel(2); confirmPairAssignment();
  const panel = [animals[0].status, animals[1].status, pairsMap.Moa[0].m].join();
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Bred', { status: 'Breed' }), __mk8(2, 2, 'Moa', 'M', 'Wild', 'BM02 Kept', { status: 'Keep' }),
    __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 In', { status: 'Keep' }), __mk8(4, 4, 'Moa', 'M', 'Wild', 'BM04 In', { status: 'Keep' })],
    pairs: { Moa: [{ m: 'BM01 Bred', f: '' }, { m: 'BM02 Kept', f: '' }] }, pairCounts: { Moa: 2 } }); migrateMemory();
  showTab('pairs'); renderPairs();
  const drop = (pi, id, name) => { _pairDrag = { id, name, sex: 'M', sp: 'Moa', fromPool: true, fromPi: null, fromSex: null };
    document.querySelector('.slot-outer[data-sp="Moa"][data-pi="' + pi + '"][data-sex="M"]').dispatchEvent(new Event('drop', { cancelable: true }));
    const yes = document.getElementById('_cfm_yes'), q = yes?.closest('.opt-modal')?.querySelector('p')?.textContent || 'no question'; yes?.click(); return q; };
  const q1 = drop(0, 3, 'BM03 In'), q2 = drop(1, 4, 'BM04 In');
  return { optimiser, panel, q1, q2, dnd: animals.map(a => a.status).join() + '@' + pairsMap.Moa.map(p => p.m).join(), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the optimiser moves a proposed animal out of its other slot, the placement panel and a drop onto an occupied slot apply the leave-a-slot rule',
  !placing.error && placing.optimiser === '1@BM01 Best' && placing.panel === 'Reserve,Breed,BM02 New'
  && placing.q1 === 'Set BM01 Bred to Reserve and replace with BM03 In?' && placing.q2 === 'Replace BM02 Kept with BM04 In?'
  && placing.dnd === 'Reserve,Keep,Breed,Breed@BM03 In,BM04 In', JSON.stringify(placing));
// Re-review round. Twins: the slot follows the twin it belongs to when that one is renamed, and deleting a twin keeps the
// slot only for a twin that fits it
const twinSlots = await ev(`(() => { try {
  const a = __moa24(1, 'M', 5, { status: 'Breed' });
  applyData({ version: 7, herd: [a, { ...a, id: 2, status: 'Dead' }], pairs: { Moa: [{ m: a.name, f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('entry'); editAnimal(1); const fit = document.getElementById('stat-FIT'); fit.value = 9; onStatInput(fit, 'FIT'); saveAnimal();
  const s = document.getElementById('f-species'); s.value = 'Dune Raptor'; onSpeciesChange();
  const renamed = [pairsMap.Moa[0].m === animals[0].name, animals[0].name !== a.name].join();
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'Twin', { status: 'Breed' }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'Twin', { status: 'Keep' })],
    pairs: { Moa: [{ m: 'Twin', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  deleteAnimal(1, true);
  return { renamed, afterDelete: pairsMap.Moa[0].m, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a renamed twin keeps its slot under the new name, and deleting a twin empties a slot the other twin does not fit', !twinSlots.error
  && twinSlots.renamed === 'true,true' && twinSlots.afterDelete === '', JSON.stringify(twinSlots));
// Placement checks the slot's species and sex: a Buffalo dropped on a Moa slot, from its pool or its own slot, stays where it was,
// and a female cannot be put in a ♂ slot
const fits = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Buffalo', 'M', 'Wild', 'BF01 Pool', { status: 'Keep' }), __mk8(2, 2, 'Buffalo', 'M', 'Wild', 'BF02 Slot', { status: 'Breed' }),
    __mk8(3, 3, 'Moa', 'F', 'Wild', 'BM03 Hen', { status: 'Keep' })], pairs: { Buffalo: [{ m: 'BF02 Slot', f: '' }] }, pairCounts: { Moa: 1, Buffalo: 1 } }); migrateMemory();
  showTab('pairs'); renderPairs();
  const target = () => document.querySelector('.slot-outer[data-sp="Moa"][data-pi="0"][data-sex="M"]');
  _pairDrag = { id: 1, name: 'BF01 Pool', sex: 'M', sp: 'Buffalo', fromPool: true, fromPi: null, fromSex: null };
  target().dispatchEvent(new Event('drop', { cancelable: true })); renderPairs();
  _pairDrag = { id: 2, name: 'BF02 Slot', sex: 'M', sp: 'Buffalo', fromPool: false, fromPi: 0, fromSex: 'M' };
  target().dispatchEvent(new Event('drop', { cancelable: true })); renderPairs();
  const inPool = !!document.querySelector('.pair-pool[data-pool-sp="Buffalo"] .pool-tile[data-aid="1"]');
  updatePair('Moa', 0, 'm', 'BM03 Hen');
  return { moa: pairsMap.Moa[0].m, buffalo: pairsMap.Buffalo[0].m, inPool, statuses: animals.map(a => a.status).join(), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a drop or placement that does not fit the slot species or sex is refused and nothing moves', !fits.error && fits.moa === '' && fits.buffalo === 'BF02 Slot'
  && fits.inPool && fits.statuses === 'Keep,Breed,Keep', JSON.stringify(fits));
// Game import: a sex change takes the animal out of its slot; the summary says how many left a slot, and the log names the final status
const importLeft = await ev(`(() => { try {
  const file = ${JSON.stringify(fx.file([{ name: 'BM02 Mum', type: 'Moa', sex: 2, variation: 0, lineage: 'Wild', stats: [5, 5, 5, 5, 5, 5, 5] }]))};
  const run = station => {
    const m = __moa24(1, 'M', 5, { status: 'Breed' }), f = __moa24(2, 'F', 5, { status: 'Breed' });
    applyData({ version: 7, herd: [m, f], pairs: { Moa: [{ m: m.name, f: f.name }] }, pairCounts: { Moa: 1 } }); migrateMemory(); logEntries = [];
    showMountPreview(planMountImport(file), 'Mounts.json'); const box = document.getElementById('mount-preview');
    if (station) box.querySelector('input[data-key="stationAll"]').checked = true;
    [...box.querySelectorAll('button')].find(b => b.textContent === 'Confirm import').click();
    const log = logEntries.filter(e => /left its pair slot/.test(e.msg)).map(e => e.msg).join(' | ');
    return [pairsMap.Moa[0].f, animals[1].status, /1 left a pair slot/.test(document.getElementById('toast').textContent), log].join('#'); };
  return { plain: run(false), station: run(true), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a sex change from a game import takes the animal out of its slot, the summary counts it, and the log names the final status', !importLeft.error
  && /^#Reserve#true#.*now 🔶 Reserve$/.test(importLeft.plain) && /^#Station#true#.*now 🛸 On Station$/.test(importLeft.station), JSON.stringify(importLeft));
// Names with & reach the log and the toast once escaped, so the log still links the animal
const amp = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'Salt & Pepper', { status: 'Keep' })] }); migrateMemory(); logEntries = [];
  setAnimalStatus(1, 'Breed'); setAdviceStatus(1, 'Reserve');
  const toast = document.getElementById('toast').textContent;
  showTab('log'); setLogFilter('all', document.querySelector('[data-log-filter="all"]')); renderLog();
  const links = [...document.querySelectorAll('#log-list .view-name-link')].map(l => l.textContent);
  return { toast, links: links.join('|'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a name with & shows once in toasts and is linked in the log', !amp.error && /^Salt & Pepper → /.test(amp.toast) && amp.links === 'Salt & Pepper|Salt & Pepper', JSON.stringify(amp));

await ev(`(() => { applyData(JSON.parse(window.__snap24)); migrateMemory(); saveAndRefreshFull(); showTab('herd'); document.getElementById('f-species').value = 'Dune Raptor'; onSpeciesChange(); return true; })()`);

// ── #25 and #26: goals, scoring and species visibility ──────────────────────────────
// Each check below fails on v0.31e
await ev(`window.__snap25 = JSON.stringify(getAllData()); true`);
// The advice and placement panels score against the species goals set on the Goals card, not the per-pair goals that v5 emptied.
// Both males have the same stats, so only the Alpha goal separates them
const goalScore = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Wild', { status: 'Breed', stats: __st24(5) }), __mk8(2, 2, 'Moa', 'M', 'Alpha', 'BM02 Alpha', { stats: __st24(5) })],
    pairs: { Moa: [{ m: 'BM01 Wild', f: '' }, { m: '', f: '' }] }, pairCounts: { Moa: 2 }, goals: { Moa: { goals: [{ bl: 'Alpha', ph: '' }] } } }); migrateMemory();
  showTab('entry'); showPairAssignPanel(2);
  const placement = computePairSuggestions(animals[1]).find(s => s.pairIdx === 0)?.delta, panel = document.getElementById('pair-assign-panel').textContent;
  dismissPairAssign();
  const s = document.getElementById('f-species'); s.value = 'Moa'; onSpeciesChange();
  document.getElementById('f-sex').value = 'M'; document.getElementById('f-bloodline').value = 'Alpha'; STATS.forEach(k => { document.getElementById('stat-' + k).value = 5; });
  renderAdvice();
  const advice = document.getElementById('advice-panel').textContent.replace(/\\s+/g, ' '), adviceDelta = computeAdvice()?.results.find(r => r.pi === 0)?.delta;
  document.getElementById('advice-panel').classList.remove('show'); resetFormUI(); s.value = 'Dune Raptor'; onSpeciesChange();
  return { placement, panelGoal: /Alpha × any phenotype/.test(panel), adviceDelta, adviceGoal: /Goal: Alpha × any phenotype/.test(advice), noGoal: /No goal set/.test(advice), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the advice and placement panels score against the species goals and name them, never "No goal set" (#25)', !goalScore.error && goalScore.placement === 120
  && goalScore.panelGoal && goalScore.adviceDelta === 120 && goalScore.adviceGoal && !goalScore.noGoal, JSON.stringify(goalScore));
// The Unstable star switched off stays off: in the Goals tab, after a reload from a herd file and after a reload from browser
// storage (which always loads as version 1). A file without the star still gets the ★★ default
const unstable = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Unstable', 'BM01 Unstable')] }); migrateMemory();
  const before = goalsMap.Moa.blPriority.Unstable;
  showTab('goals'); updateBlPriority('Moa', BLOODLINES.indexOf('Unstable'), 0);
  const afterClick = goalsMap.Moa.blPriority.Unstable;
  applyData(JSON.parse(JSON.stringify(getAllData()))); migrateMemory();
  const afterFile = goalsMap.Moa.blPriority.Unstable;
  save(); saveGoals(); loadFromLocalStorage(); migrateMemory();
  const afterStorage = goalsMap.Moa.blPriority.Unstable;
  applyData({ version: 7, herd: [], goals: { Moa: { goals: [], blPriority: {} } } }); migrateMemory();
  return { before, afterClick, afterFile, afterStorage, absent: goalsMap.Moa.blPriority.Unstable, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the Unstable star switched off stays off in the Goals tab and after a reload from a file or browser storage (#25)', !unstable.error && unstable.before === 2
  && unstable.afterClick === 0 && unstable.afterFile === 0 && unstable.afterStorage === 0 && unstable.absent === 2, JSON.stringify(unstable));
// The stat goal set on the Goals card drives the optimiser's cull suggestions and the Breeding Suggestions. With a goal of 30 the
// unpaired male with 36 is stored, not culled, the one with 24 is still culled, and the Unstable female with 36 is not "below stat goal"
await ev(`window.__statGoalHerd = () => { applyData({ version: 7, herd: [
    __mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Top', { status: 'Breed', stats: __st24(9) }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Top', { status: 'Breed', stats: __st24(9) }),
    __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 Good', { status: 'Keep', stats: __st24(6) }), __mk8(4, 4, 'Moa', 'M', 'Wild', 'BM04 Weak', { status: 'Keep', stats: __st24(4) }),
    __mk8(5, 5, 'Moa', 'F', 'Unstable', 'BM05 Unstable', { status: 'Keep', stats: __st24(6) })],
  pairs: { Moa: [{ m: 'BM01 Top', f: 'BM02 Top' }] }, pairCounts: { Moa: 1 } }); migrateMemory(); }; true`);
const statGoal = await ev(`(() => { try {
  __statGoalHerd(); showTab('goals'); renderGoals();
  const input = document.querySelector('#goals-grid .stat-goal-input[data-sp="Moa"]');
  if (input) { input.value = '30'; input.dispatchEvent(new Event('change', { bubbles: true })); } else { goalsMap.Moa.statGoal = 30; renderGoals(); }   // no field: still show what the logic does
  const plan = buildOptimizePlanForSpecies('Moa', new Set());
  const act = name => { const s = plan.suggestions.find(x => x.animal.name === name); return s ? s.action + ': ' + s.reason : 'none'; };
  const unstableRow = [...document.querySelectorAll('#goals-grid .suggestion-row')].find(r => r.textContent.includes('BM05 Unstable'))?.textContent || 'no row';
  return { stored: goalsMap.Moa.statGoal, shown: document.querySelector('#goals-grid .stat-goal-input[data-sp="Moa"]')?.value, good: act('BM03 Good'), weak: act('BM04 Weak'),
    unstable: act('BM05 Unstable'), unstableBelow: /below stat goal/.test(unstableRow), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the stat goal on the Goals card drives the optimiser and Breeding Suggestions: an animal that meets it is not culled (#25)', !statGoal.error && statGoal.stored === 30
  && statGoal.shown === '30' && /^store: /.test(statGoal.good) && statGoal.weak === 'cull: No valued traits, below stat goal (24/30)' && /^store: /.test(statGoal.unstable)
  && !statGoal.unstableBelow, JSON.stringify(statGoal));
// The "outclassed" rule is gone (owner decision on #25): with a stat goal below the maximum it would cull an animal that meets the goal
// because a paired animal of its sex scores higher. No reason says Outclassed, and the optimiser has no such branch left
const outclassed = await ev(`(() => { try {
  __statGoalHerd(); goalsMap.Moa.statGoal = 30;
  const reasons = buildOptimizePlanForSpecies('Moa', new Set()).suggestions.map(s => s.reason);
  const src = buildOptimizePlanForSpecies.toString();
  return { reasons: reasons.join(' | '), inReasons: reasons.some(r => /outclassed/i.test(r)), inCode: src.includes('Outclassed by paired') || src.includes('_isOutclassed'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the optimiser has no "outclassed" rule: no suggestion reason says Outclassed, and the code has no such reason or test (#25)', !outclassed.error && outclassed.reasons
  && !outclassed.inReasons && !outclassed.inCode, JSON.stringify(outclassed));
// The upgrade row picks the best free animal of each sex, not the first in herd order: the highest total, then the goal match
const upgrade = await ev(`(() => { try {
  applyData({ version: 7, herd: [
      __mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Pair', { status: 'Breed', stats: __st24(5) }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Pair', { status: 'Breed', stats: __st24(5) }),
      __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 First', { status: 'Keep', stats: __st24(6) }), __mk8(4, 4, 'Moa', 'M', 'Wild', 'BM04 Better', { status: 'Keep', stats: __st24(8) }),
      __mk8(5, 5, 'Moa', 'F', 'Wild', 'BM05 First', { status: 'Keep', stats: __st24(7) }), __mk8(6, 6, 'Moa', 'F', 'Alpha', 'BM06 Goal', { status: 'Keep', stats: __st24(7) })],
    pairs: { Moa: [{ m: 'BM01 Pair', f: 'BM02 Pair' }] }, pairCounts: { Moa: 1 }, goals: { Moa: { goals: [{ bl: 'Alpha', ph: '' }] } } }); migrateMemory();
  showTab('pairs'); renderPairs();
  const card = document.querySelector('.pair-pool[data-pool-sp="Moa"]')?.closest('.pair-species-card');
  return { best: card ? [...card.querySelectorAll('.upgrade-box .upg-name')].map(n => n.textContent.trim()).join() : 'no card', error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the upgrade row shows the highest scoring free male and female, whatever the herd order (#25)', !upgrade.error && upgrade.best === 'BM04 Better,BM06 Goal', JSON.stringify(upgrade));
// Pair tiles show ⚠ for a negatively starred bloodline or phenotype, and the tile's tooltip names the trait; clean tiles have no mark
const warnTiles = await ev(`(() => { try {
  const choc = SPECIES_DATA.Moa.phenotypes[1].label;
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Bold', 'BM01 Bold', { status: 'Breed' }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Choc', { status: 'Breed', ph: choc }),
      __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 Clean', { status: 'Breed' }), __mk8(4, 4, 'Moa', 'F', 'Wild', 'BM04 Clean', { status: 'Breed' })],
    pairs: { Moa: [{ m: 'BM01 Bold', f: 'BM02 Choc' }, { m: 'BM03 Clean', f: 'BM04 Clean' }] }, pairCounts: { Moa: 2 },
    goals: { Moa: { goals: [], blPriority: { Bold: -2 }, phenoWeights: { [choc]: -1 } } } }); migrateMemory();
  showTab('pairs'); renderPairs();
  const tiles = [...document.querySelectorAll('.pair-slot .animal-tile')].filter(t => t.dataset.psp === 'Moa');
  const warned = tiles.filter(t => t.querySelector('.tile-warn'));
  return { tiles: tiles.length, warned: warned.map(t => animals.find(a => a.id === +t.dataset.aid)?.name).join(), titles: warned.map(t => t.title.replace(/^.* · ⚠ /, '')).join(' | '), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('pair tiles show a ⚠ mark for a negatively starred bloodline or phenotype, named in the tooltip (#25)', !warnTiles.error && warnTiles.tiles === 4
  && warnTiles.warned === 'BM01 Bold,BM02 Choc' && warnTiles.titles === 'negative trait: Bold bloodline | negative trait: P1 Chocolate phenotype', JSON.stringify(warnTiles));
// The pair count is kept once, in the pair counts: adding, removing and deleting pair slots no longer keeps a per-pair goal list
// in step, and a saved herd carries none
const slotTracking = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Slot', { status: 'Breed' })], pairs: { Moa: [{ m: 'BM01 Slot', f: '' }] }, pairCounts: { Moa: 1 } }); migrateMemory();
  showTab('pairs'); addPairSlot('Moa'); addPairSlot('Moa'); removePairSlot('Moa'); deletePairRow('Moa', 0);
  const saved = getAllData();
  return { count: pairCounts.Moa, slots: pairsMap.Moa.length, goalLists: Object.keys(saved.goals).filter(sp => 'pairs' in saved.goals[sp]).length, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('pair slots are counted once: adding and removing slots keeps no per-pair goal list, and a saved herd has none (#25)', !slotTracking.error && slotTracking.count === 1
  && slotTracking.slots === 1 && slotTracking.goalLists === 0, JSON.stringify(slotTracking));
// Species that cannot be bred: defaultPairs is 0, and they get no Pairs card, pair slot buttons, goal stars, advice or optimiser
// suggestions. A file from v0.31e with a Horse pair (no stored count, so a count of 0 would cut it) loads and saves without losing it
const noBreed = await ev(`(() => { try {
  const defaults = Object.entries(SPECIES_DATA).filter(([, c]) => c.breedable === false ? c.defaultPairs !== 0 : !(c.defaultPairs >= 1)).map(([sp]) => sp);
  applyData({ version: 7, herd: [__mk8(1, 1, 'Horse', 'M', 'Wild', 'HR01 Stallion', { status: 'Breed' }), __mk8(2, 2, 'Horse', 'F', 'Wild', 'HR02 Mare', { status: 'Breed' }),
      __mk8(3, 3, 'Horse', 'M', 'Bold', 'HR03 Spare', { status: 'Keep' }), __mk8(4, 4, 'Moa', 'M', 'Wild', 'BM04 Moa', { status: 'Keep' })],
    pairs: { Horse: [{ m: 'HR01 Stallion', f: 'HR02 Mare' }] }, goals: { Horse: { goals: [], blPriority: { Wild: 3 } } } }); migrateMemory();
  const kept = () => (pairsMap.Horse || []).map(p => p.m + '|' + p.f).join();
  const loaded = kept(), statuses = animals.map(a => a.status).join();
  showTab('pairs'); renderPairs();
  const pairsCard = !!document.querySelector('#tab-pairs [data-sp="Horse"], #tab-pairs [data-pool-sp="Horse"]');
  const addOption = [...document.querySelectorAll('#pairs-add-species option')].some(o => o.value === 'Horse');
  const plan = buildOptimizePlanForSpecies('Horse', new Set());
  showOptimizeModal(null); const optHorse = [...document.querySelectorAll('.opt-sp-hdr')].some(h => /Horse/.test(h.textContent)); closeOptimizeModal();
  showTab('goals'); renderGoals();
  const goalCard = [...document.querySelectorAll('#goals-grid .goals-card')].find(c => / Horse/.test(c.querySelector('h3')?.textContent || ''));
  const stars = goalCard ? goalCard.querySelectorAll('.star-btn').length : 'no card';
  viewAnimal(1); const slotButtons = document.querySelectorAll('.view-pair-slot').length; closeViewPanel();
  showTab('entry'); const s = document.getElementById('f-species'); s.value = 'Horse'; onSpeciesChange(); document.getElementById('f-sex').value = 'M'; document.getElementById('stat-VIG').value = 5;
  const advice = computeAdvice(); resetFormUI(); s.value = 'Dune Raptor'; onSpeciesChange();
  applyData(JSON.parse(JSON.stringify(getAllData()))); migrateMemory();
  return { defaults: defaults.join(), loaded, statuses, reloaded: kept(), stars: goalsMap.Horse.blPriority.Wild, pairsCard, addOption, proposed: plan.proposedPairs.length, suggested: plan.suggestions.length,
    optHorse, goalStars: stars, slotButtons, advice: advice === null ? 'none' : advice.results.length, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a species that cannot be bred has no pair slots, Pairs card, goal stars, advice or optimiser suggestions, and its saved pair is kept (#26)', !noBreed.error
  && noBreed.defaults === '' && noBreed.loaded === 'HR01 Stallion|HR02 Mare' && noBreed.statuses === 'Breed,Breed,Keep,Keep' && noBreed.reloaded === noBreed.loaded && noBreed.stars === 3
  && !noBreed.pairsCard && !noBreed.addOption && noBreed.proposed === 0 && noBreed.suggested === 0 && !noBreed.optHorse && noBreed.goalStars === 0 && noBreed.slotButtons === 0
  && noBreed.advice === 'none', JSON.stringify(noBreed));
// Pairs and Goals show cards only for species with animals; the others are "+ Species" chips under the grid, in card order. A fresh
// herd shows only chips (no 52 cards), the first animal of a species brings its card without a reload, a chip opens a card without
// adding an animal, and a collapsed species with animals stays a collapsed chip at the top
const speciesChips = await ev(`(() => { try {
  applyData({ version: 7, herd: [], speciesOrder: ['Pig', 'Buffalo', 'Moa'] }); migrateMemory();
  const expected = getSpeciesOrder().filter(sp => SPECIES_DATA[sp].breedable !== false), expectedGoals = getSpeciesOrder();
  const view = tab => ({ cards: document.querySelectorAll('#' + tab + '-grid .' + (tab === 'pairs' ? 'pair-species-card' : 'goals-card')).length,
    chips: [...document.querySelectorAll('#' + tab + '-add-chips .add-chip')].map(c => c.dataset.sp) });
  showTab('pairs'); const freshPairs = view('pairs'); showTab('goals'); const freshGoals = view('goals');
  showTab('entry'); const s = document.getElementById('f-species'); s.value = 'Moa'; onSpeciesChange();
  document.getElementById('f-sex').value = 'M'; document.getElementById('f-bloodline').value = 'Wild'; STATS.forEach(k => { document.getElementById('stat-' + k).value = 5; });
  saveAnimal(); dismissPairAssign();
  const pairsAfterAdd = view('pairs');   // the save renders Pairs while the New Animal tab is still showing
  s.value = 'Dune Raptor'; onSpeciesChange();
  showTab('goals'); const goalsAfterAdd = view('goals');
  collapsedPairSpecies.add('Buffalo'); collapsedPairSpecies.add('Moa');
  showTab('pairs'); document.querySelector('#pairs-add-chips .add-chip[data-sp="Buffalo"]')?.click();
  const opened = view('pairs'), collapsedMoa = [...document.querySelectorAll('#pairs-chips-row .species-chip')].some(c => / Moa/.test(c.textContent));
  collapsedPairSpecies.delete('Moa');
  return { expected: expected.join(), expectedGoals: expectedGoals.join(), freshPairs: freshPairs.cards + ':' + freshPairs.chips.join(), freshGoals: freshGoals.cards + ':' + freshGoals.chips.join(),
    pairsAfterAdd: pairsAfterAdd.cards + ':' + pairsAfterAdd.chips.includes('Moa'), goalsAfterAdd: goalsAfterAdd.cards + ':' + goalsAfterAdd.chips.includes('Moa'),
    opened: opened.cards + ':' + opened.chips.includes('Buffalo'), buffaloExpanded: !collapsedPairSpecies.has('Buffalo'), collapsedMoa, herd: animals.length, error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('Pairs and Goals show cards only for species with animals, chips for the rest in card order (Pairs: breedable only); the first animal or a chip brings the card (#26)', !speciesChips.error
  && speciesChips.freshPairs === '0:' + speciesChips.expected && speciesChips.freshGoals === '0:' + speciesChips.expectedGoals && speciesChips.pairsAfterAdd === '1:false'
  && speciesChips.goalsAfterAdd === '1:false' && speciesChips.opened === '1:false' && speciesChips.buffaloExpanded && speciesChips.collapsedMoa && speciesChips.herd === 1,
  JSON.stringify(speciesChips));
// No two species dots are closer than SPECIES_COLOUR_MIN_DE in CIEDE2000 (Sharma, Wu and Dalal 2005), the perceptual colour
// difference: about 1 is just noticeable, 5 is clearly different side by side. Horse, Hyena and Cattle were 1.3 to 3.1 apart.
// The formula is checked against two pairs from the published test data first, so a wrong implementation cannot pass
const SPECIES_COLOUR_MIN_DE = 5;
const hexToLab = hex => {
  const n = parseInt(hex.slice(1), 16), lin = c => (c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  const [r, g, b] = [lin(n >> 16 & 255), lin(n >> 8 & 255), lin(n & 255)];   // sRGB, D65
  const f = t => t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047), fy = f(0.2126729 * r + 0.7151522 * g + 0.0721750 * b), fz = f((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
const ciede2000 = ([L1, a1, b1], [L2, a2, b2]) => {
  const rad = Math.PI / 180, p7 = c => Math.sqrt(c ** 7 / (c ** 7 + 25 ** 7));
  const G = 0.5 * (1 - p7((Math.hypot(a1, b1) + Math.hypot(a2, b2)) / 2));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1 = Math.hypot(a1p, b1), C2 = Math.hypot(a2p, b2);
  const hue = (b, a) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360), h1 = hue(b1, a1p), h2 = hue(b2, a2p);
  let dh = C1 * C2 === 0 ? 0 : h2 - h1; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360;
  const dH = 2 * Math.sqrt(C1 * C2) * Math.sin(dh / 2 * rad), Lm = (L1 + L2) / 2, Cm = (C1 + C2) / 2;
  let hm = h1 + h2; if (C1 * C2 !== 0) { if (Math.abs(h1 - h2) > 180) hm += hm < 360 ? 360 : -360; hm /= 2; }
  const T = 1 - 0.17 * Math.cos((hm - 30) * rad) + 0.24 * Math.cos(2 * hm * rad) + 0.32 * Math.cos((3 * hm + 6) * rad) - 0.20 * Math.cos((4 * hm - 63) * rad);
  const SL = 1 + 0.015 * (Lm - 50) ** 2 / Math.sqrt(20 + (Lm - 50) ** 2), SC = 1 + 0.045 * Cm, SH = 1 + 0.015 * Cm * T;
  const RT = -Math.sin(60 * Math.exp(-(((hm - 275) / 25) ** 2)) * rad) * 2 * p7(Cm);
  return Math.sqrt(((L2 - L1) / SL) ** 2 + ((C2 - C1) / SC) ** 2 + (dH / SH) ** 2 + RT * ((C2 - C1) / SC) * (dH / SH));
};
const deSelfTest = [ciede2000([50, 2.6772, -79.7751], [50, 0, -82.7485]), ciede2000([50, 2.5, 0], [73, 25, -18])].map(d => d.toFixed(4)).join();
const speciesColours = await ev(`Object.entries(SPECIES_DATA).map(([sp, c]) => [sp, c.color])`);
const closeColours = [];
speciesColours.forEach(([s1, c1], i) => speciesColours.slice(i + 1).forEach(([s2, c2]) => {
  const de = /^#[0-9a-fA-F]{6}$/.test(c1) && /^#[0-9a-fA-F]{6}$/.test(c2) ? ciede2000(hexToLab(c1), hexToLab(c2)) : 0;
  if (de < SPECIES_COLOUR_MIN_DE) closeColours.push(`${s1} ${c1} / ${s2} ${c2}: ${de.toFixed(2)}`);
}));
check(`no two species dot colours are closer than ${SPECIES_COLOUR_MIN_DE} in CIEDE2000 (#26)`, deSelfTest === '2.0425,27.1492' && closeColours.length === 0,
  deSelfTest === '2.0425,27.1492' ? closeColours.join(' | ') : `CIEDE2000 self-test gave ${deSelfTest}, expected 2.0425,27.1492`);
// Pairs cards name the fertility serum with the same text as the New Animal form
const serums = await ev(`(() => { try {
  const sps = ['Moa', 'Gribbler', 'Cattle'];
  applyData({ version: 7, herd: sps.map((sp, i) => __mk8(i + 1, 1, sp, 'M', 'Wild', 'Animal ' + i)) }); migrateMemory();
  showTab('entry'); const s = document.getElementById('f-species');
  const form = Object.fromEntries(sps.map(sp => { s.value = sp; onSpeciesChange(); return [sp, document.getElementById('breed-info').textContent]; }));
  s.value = 'Dune Raptor'; onSpeciesChange();
  showTab('pairs'); renderPairs();
  const onCard = Object.fromEntries(sps.map(sp => [sp, document.querySelector('.pair-pool[data-pool-sp="' + sp + '"]')?.closest('.pair-species-card')?.querySelector('.pair-serum')?.textContent ?? 'none']));
  return { mismatch: sps.filter(sp => !form[sp] || onCard[sp] !== form[sp]).map(sp => sp + ': ' + onCard[sp] + ' / ' + form[sp]).join(' | '), moa: onCard.Moa, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('Pairs cards show the serum with the same text as the New Animal form (#26)', !serums.error && serums.mismatch === '' && /^🧬 Breed with Moa Fertility Serum\./.test(serums.moa), JSON.stringify(serums));

// ── Review round on v0.32 (#25 and #26). Each check below fails on the first v0.32 draft ──────────────────────────
// Advice from the New Animal form for one sex: the panel text and the score of each pair slot
await ev(`window.__advise = (sp, sex, bl, stats) => { showTab('entry'); const s = document.getElementById('f-species'); s.value = sp; onSpeciesChange();
  document.getElementById('f-sex').value = sex; document.getElementById('f-bloodline').value = bl;
  STATS.forEach(k => { document.getElementById('stat-' + k).value = stats[k]; }); renderAdvice();
  const text = document.getElementById('advice-panel').textContent.replace(/\\s+/g, ' ');
  document.getElementById('advice-panel').classList.remove('show'); resetFormUI(); s.value = 'Dune Raptor'; onSpeciesChange(); return text; }; true`);
// A temp breeder is a Temp animal or one that matches no goal. With goals Alpha × any and any × Black, a Wild Black male matches
// a goal: it shows ✓G and an Alpha newcomer replaces it as a goal carrier, gaining the goal bloodline. A Temp Alpha female beaten
// by 2 points is not "replaced": the slot shows Weaker with -20, never "+-20"
const tempRule = await ev(`(() => { try {
  const black = SPECIES_DATA.Moa.phenotypes[7].label;
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Black', { status: 'Breed', ph: black, stats: __st24(5) }),
      __mk8(2, 2, 'Moa', 'F', 'Alpha', 'BM02 Temp', { status: 'Temp', stats: { VIG: 5, FIT: 6, PHY: 6, REF: 5, TGH: 5, ADP: 5, INS: 5 } })],
    pairs: { Moa: [{ m: 'BM01 Black', f: 'BM02 Temp' }] }, pairCounts: { Moa: 1 }, goals: { Moa: { goals: [{ bl: 'Alpha', ph: '' }, { bl: '', ph: black }] } } }); migrateMemory();
  showTab('pairs'); renderPairs();
  const tileG = !!document.querySelector('.pair-slot .animal-tile[data-aid="1"] .tile-goal');
  const male = __advise('Moa', 'M', 'Alpha', __st24(6)), female = __advise('Moa', 'F', 'Alpha', __st24(5));
  return { tileG, maleTemp: /Replace temp breeder/.test(male), maleGains: /Gains goal bloodline \\(Alpha\\)/.test(male),
    femaleTemp: /Replace temp breeder/.test(female), femaleWeaker: /Weaker/.test(female), minus20: /(^|\\s)-20(\\s|$)/.test(female), plusMinus: /\\+-/.test(female + male), error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('advice calls only a Temp or goal-less occupant a temp breeder, and a lower score shows with its own sign (#25 review)', !tempRule.error && tempRule.tileG
  && !tempRule.maleTemp && tempRule.maleGains && !tempRule.femaleTemp && tempRule.femaleWeaker && tempRule.minus20 && !tempRule.plusMinus, JSON.stringify(tempRule));
// A goal carrier below the stat goal is reserved, never culled as "No valued traits"
const carrier = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Alpha', 'BM01 Top', { status: 'Breed', stats: __st24(9) }), __mk8(2, 2, 'Moa', 'F', 'Alpha', 'BM02 Top', { status: 'Breed', stats: __st24(9) }),
      __mk8(3, 3, 'Moa', 'M', 'Alpha', 'BM03 Carrier', { status: 'Keep', stats: __st24(8) })],
    pairs: { Moa: [{ m: 'BM01 Top', f: 'BM02 Top' }] }, pairCounts: { Moa: 1 }, goals: { Moa: { goals: [{ bl: 'Alpha', ph: '' }], statGoal: 50 } } }); migrateMemory();
  const s = buildOptimizePlanForSpecies('Moa', new Set()).suggestions.find(x => x.animal.name === 'BM03 Carrier');
  return { suggestion: s ? s.action + ': ' + s.reason : 'none', error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('an unpaired goal carrier below the stat goal is reserved, not culled (#25 review)', !carrier.error
  && carrier.suggestion === 'reserve: Matches a species goal but below stat goal (48/50)', JSON.stringify(carrier));
// The stat goal is stored in 0..maximum: typing 80 stores 60, a file's 75 loads as 60, and the optimiser shows the active goal
const statClamp = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Moa', { status: 'Keep' })], goals: { Moa: { goals: [], statGoal: 75 } } }); migrateMemory();
  const fromFile = goalsMap.Moa.statGoal;
  showTab('goals'); renderGoals();
  const input = document.querySelector('#goals-grid .stat-goal-input[data-sp="Moa"]');
  input.value = '80'; input.dispatchEvent(new Event('change', { bubbles: true }));
  const typed = goalsMap.Moa.statGoal;
  goalsMap.Moa.statGoal = 50; showOptimizeModal('Moa');
  const header = document.querySelector('.opt-sp-hdr')?.textContent || ''; closeOptimizeModal();
  return { fromFile, typed, header: /Stat goal 50\\/60/.test(header), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the stat goal is kept between 0 and the species maximum, and the optimiser shows it (#25 review)', !statClamp.error && statClamp.fromFile === 60
  && statClamp.typed === 60 && statClamp.header, JSON.stringify(statClamp));
// "Recommend: Discard or set as Reserve" is not shown for a new animal that meets the stat goal, and is still shown below it
const discardAdvice = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Top', { status: 'Breed', stats: __st24(9) }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Top', { status: 'Breed', stats: __st24(9) })],
    pairs: { Moa: [{ m: 'BM01 Top', f: 'BM02 Top' }] }, pairCounts: { Moa: 1 }, goals: { Moa: { goals: [], statGoal: 30 } } }); migrateMemory();
  return { meets: /Recommend: Discard/.test(__advise('Moa', 'M', 'Wild', __st24(6))), below: /Recommend: Discard/.test(__advise('Moa', 'M', 'Wild', __st24(4))), error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('the advice recommends discarding only a new animal below the stat goal (#25 review)', !discardAdvice.error && !discardAdvice.meets && discardAdvice.below, JSON.stringify(discardAdvice));
// A goal from a file that names an unknown bloodline is dropped, not turned into "any × any"; a blank row added in the Goals tab
// stays but matches nothing, so no tile shows ✓G and the advice says "No goal set"
const blankGoals = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Moa', { status: 'Breed', stats: __st24(5) })], pairs: { Moa: [{ m: 'BM01 Moa', f: '' }, { m: '', f: '' }] }, pairCounts: { Moa: 2 },
    goals: { Moa: { goals: [{ bl: 'x', ph: '' }] } } }); migrateMemory();
  const loaded = JSON.stringify(goalsMap.Moa.goals);
  addSpeciesGoal('Moa');
  showTab('pairs'); renderPairs();
  const tileG = !!document.querySelector('.pair-slot .animal-tile[data-aid="1"] .tile-goal');
  const advice = __advise('Moa', 'M', 'Wild', __st24(6));
  return { loaded, afterAdd: goalsMap.Moa.goals.length, tileG, noGoal: /No goal set/.test(advice), optimiserMatch: matchesSpeciesGoal('Moa', animals[0]), error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('a file goal with an unknown bloodline is dropped, and a blank goal row matches nothing (#25 review)', !blankGoals.error && blankGoals.loaded === '[]'
  && blankGoals.afterAdd === 1 && !blankGoals.tileG && blankGoals.noGoal && !blankGoals.optimiserMatch, JSON.stringify(blankGoals));
// Goal lists are deduplicated and capped at 32: a file with 1,000 identical goals loads as 1 and Pairs renders; the Goals tab
// refuses a 33rd goal with a message
const goalCap = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Alpha', 'BM01 Moa', { status: 'Breed' })], pairs: { Moa: [{ m: 'BM01 Moa', f: '' }] }, pairCounts: { Moa: 1 },
    goals: { Moa: { goals: Array.from({ length: 1000 }, () => ({ bl: 'Alpha', ph: '' })) } } }); migrateMemory();
  const loaded = goalsMap.Moa.goals.length;
  showTab('pairs'); renderPairs(); const card = !!document.querySelector('.pair-pool[data-pool-sp="Moa"]');
  for (let i = 0; i < 40; i++) addSpeciesGoal('Moa');
  return { loaded, card, afterAdds: goalsMap.Moa.goals.length, toast: /maximum of 32 goals/.test(document.getElementById('toast').textContent), error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('a species keeps at most 32 goals without repeats: 1,000 identical goals load as 1, and a 33rd is refused (#25 review)', !goalCap.error && goalCap.loaded === 1
  && goalCap.card && goalCap.afterAdds === 32 && goalCap.toast, JSON.stringify(goalCap));
// The stat goal field has no inline handler; a bubbling change event reaches the listener on the grid
const statField = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Moa', { status: 'Keep' })] }); migrateMemory();
  showTab('goals'); renderGoals();
  const input = document.querySelector('#goals-grid .stat-goal-input[data-sp="Moa"]');
  const inline = [...document.querySelectorAll('#goals-grid .stat-goal-input')].some(el => [...el.attributes].some(at => /^on/i.test(at.name)));
  input.value = '42'; input.dispatchEvent(new Event('change', { bubbles: true }));
  return { inline, stored: goalsMap.Moa.statGoal, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the stat goal field has no inline handler and is handled by one listener on the Goals grid (#25 review)', !statField.error && !statField.inline
  && statField.stored === 42, JSON.stringify(statField));
// Goals chips also offer species that cannot be bred; such a card holds only the breed-out stat and a note. Pairs never offers them
const noBreedChip = await ev(`(() => { try {
  applyData({ version: 7, herd: [] }); migrateMemory();
  showTab('pairs'); const onPairs = !!document.querySelector('#pairs-add-chips .add-chip[data-sp="Horse"]');
  showTab('goals'); const chip = document.querySelector('#goals-add-chips .add-chip[data-sp="Horse"]'); chip?.click();
  const card = [...document.querySelectorAll('#goals-grid .goals-card')].find(c => / Horse/.test(c.querySelector('h3')?.textContent || ''));
  return { onPairs, onGoals: !!chip, card: !!card, breedOut: !!card?.querySelector('.breedout-select'), note: !!card?.querySelector('.goals-no-breed'),
    stars: card ? card.querySelectorAll('.star-btn').length : -1, radar: !!card?.querySelector('canvas'), sections: card ? card.querySelectorAll('.goals-section-hdr').length : -1, error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('Goals chips offer species that cannot be bred, whose card holds only the breed-out stat and a note; Pairs does not (#26 review)', !noBreedChip.error
  && !noBreedChip.onPairs && noBreedChip.onGoals && noBreedChip.card && noBreedChip.breedOut && noBreedChip.note && noBreedChip.stars === 0 && !noBreedChip.radar
  && noBreedChip.sections === 1, JSON.stringify(noBreedChip));
// First run: "No animals yet" follows the herd, not the cards. A herd of only species that cannot be bred is told so on Pairs,
// and Optimize All says there is nothing to optimize
const firstRun = await ev(`(() => { try {
  applyData({ version: 7, herd: [] }); migrateMemory();
  showTab('pairs'); document.querySelector('#pairs-add-chips .add-chip[data-sp="Moa"]')?.click();
  const emptyWithCard = document.querySelector('#pairs-add-chips .add-chips-lbl')?.textContent || '';
  applyData({ version: 7, herd: [__mk8(1, 1, 'Horse', 'M', 'Wild', 'HR01 Horse'), __mk8(2, 1, 'Kiwi', 'F', 'Wild', 'KW01 Kiwi')] }); migrateMemory();
  showTab('pairs'); renderPairs();
  const unbred = document.querySelector('#pairs-add-chips .add-chips-lbl')?.textContent || '';
  showOptimizeModal(null); const modal = !!document.getElementById('opt-overlay'); closeOptimizeModal();
  return { emptyWithCard: /^No animals yet\\. Add one/.test(emptyWithCard), unbred, modal, toast: document.getElementById('toast').textContent, error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('first-run text follows the herd, and a herd that cannot be bred is told there is nothing to pair or optimize (#26 review)', !firstRun.error && firstRun.emptyWithCard
  && /^Horse, Kiwi cannot be bred, so there is nothing to pair/.test(firstRun.unbred) && !firstRun.modal && /^Nothing to optimize/.test(firstRun.toast), JSON.stringify(firstRun));
// A species that cannot be bred and has no stored count takes the length of its saved slot list, never a bare 0; without a list
// the count stays unset
const noBreedCount = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Horse', 'M', 'Wild', 'HR01 A'), __mk8(2, 2, 'Horse', 'F', 'Wild', 'HR02 B')],
    pairs: { Horse: [{ m: 'HR01 A', f: '' }, { m: '', f: 'HR02 B' }] } }); migrateMemory();
  const withList = [pairCounts.Horse, pairsMap.Horse.length].join();
  applyData({ version: 7, herd: [] }); migrateMemory(); initPairs();
  return { withList, without: Object.hasOwn(pairCounts, 'Horse') ? pairCounts.Horse : 'unset', error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a species that cannot be bred keeps a count that covers its saved slot list, never a bare 0 (#26 review)', !noBreedCount.error && noBreedCount.withList === '2,2'
  && noBreedCount.without === 'unset', JSON.stringify(noBreedCount));
// Deleting the last animal of a species while Goals is open removes its card at once, and the species becomes a chip
const goalsDelete = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Moa'), __mk8(2, 1, 'Buffalo', 'F', 'Wild', 'BF01 Buffalo')] }); migrateMemory();
  showTab('goals');
  const has = () => [...document.querySelectorAll('#goals-grid .goals-card h3')].some(h => / Buffalo/.test(h.textContent));
  const before = has(); deleteAnimal(2, true);
  return { before, after: has(), chip: !!document.querySelector('#goals-add-chips .add-chip[data-sp="Buffalo"]'), error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('deleting the last animal of a species with Goals open removes its card at once (#26 review)', !goalsDelete.error && goalsDelete.before && !goalsDelete.after
  && goalsDelete.chip, JSON.stringify(goalsDelete));

// ── Re-review round on v0.32. Each check below fails on the second v0.32 draft ──────────────────────────────────────
// A repeat made in the Goals tab stays until the next load, where it goes
const uiRepeat = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Alpha', 'BM01 Moa')], goals: { Moa: { goals: [{ bl: 'Alpha', ph: '' }] } } }); migrateMemory();
  showTab('goals'); addSpeciesGoal('Moa'); updateSpeciesGoal('Moa', 1, 'bl', 'Alpha');
  const afterPick = goalsMap.Moa.goals.length, rows = document.querySelectorAll('#goals-grid .goal-pair-row').length;
  applyData(JSON.parse(JSON.stringify(getAllData()))); migrateMemory();
  return { afterPick, rows, afterLoad: goalsMap.Moa.goals.length, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a goal row picked in the Goals tab to repeat another goal stays, and the repeat goes on the next load (#25 re-review)', !uiRepeat.error && uiRepeat.afterPick === 2
  && uiRepeat.rows === 2 && uiRepeat.afterLoad === 1, JSON.stringify(uiRepeat));
// A blank goal row is no goal for the optimiser or Breeding Suggestions either; a real goal keeps its row number from the Goals card
const blankRow = await ev(`(() => { try {
  const herd = () => [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Dad', { status: 'Breed' }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Mum', { status: 'Breed' }),
    __mk8(3, 3, 'Moa', 'F', 'Wild', 'BM03 Kid', { status: 'Keep', isBred: true, gen: 2, p1: 'BM01 Dad', p2: 'BM02 Mum' })];
  applyData({ version: 7, herd: herd(), pairs: { Moa: [{ m: '', f: '' }] }, pairCounts: { Moa: 1 }, goals: { Moa: { goals: [{ bl: '', ph: '' }] } } }); migrateMemory();
  const badge = buildOptimizePlanForSpecies('Moa', new Set()).proposedPairs.map(p => p.goalLabel || '').join(), blank = renderSuggestions('Moa');
  applyData({ version: 7, herd: herd(), pairs: { Moa: [{ m: '', f: '' }] }, pairCounts: { Moa: 1 }, goals: { Moa: { goals: [{ bl: '', ph: '' }, { bl: 'Wild', ph: '' }] } } }); migrateMemory();
  const second = renderSuggestions('Moa');
  return { badge, goal1: /Goal 1/.test(blank), achieved: /Goals achieved/.test(blank), rowTwo: /Goal 2: Wild/.test(second) && !/Goal 1/.test(second), error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('a blank goal row gives no optimiser goal badge, pair recommendation or "goal achieved", and a real goal keeps its row number (#25 re-review)', !blankRow.error
  && blankRow.badge === '' && !blankRow.goal1 && !blankRow.achieved && blankRow.rowTwo, JSON.stringify(blankRow));
// With a stat goal of 0 a stored animal is described by the goal it meets, not as having good stats
const storeReason = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Top', { status: 'Breed', stats: __st24(9) }), __mk8(2, 2, 'Moa', 'F', 'Wild', 'BM02 Top', { status: 'Breed', stats: __st24(9) }),
      __mk8(3, 3, 'Moa', 'M', 'Wild', 'BM03 Low', { status: 'Keep', stats: __st24(2) })],
    pairs: { Moa: [{ m: 'BM01 Top', f: 'BM02 Top' }] }, pairCounts: { Moa: 1 }, goals: { Moa: { goals: [], statGoal: 0 } } }); migrateMemory();
  const s = buildOptimizePlanForSpecies('Moa', new Set()).suggestions.find(x => x.animal.name === 'BM03 Low');
  return { suggestion: s ? s.action + ': ' + s.reason : 'none', error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('a stored animal is described by the stat goal it meets (#25 re-review)', !storeReason.error && storeReason.suggestion === 'store: Meets stat goal (12/0); no free pair slot',
  JSON.stringify(storeReason));
// A stat goal from a file outside the range is moved into it and the file is saved once; the next load saves nothing
const statSave = await ev(`(() => { const origSave = save; try {
  const file = JSON.stringify({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Moa')], goals: { Moa: { goals: [], statGoal: 75 } } });
  let saves = 0, disk = file; save = () => { saves++; disk = JSON.stringify(getAllData()); };
  applyData(JSON.parse(disk)); migrateMemory(); const first = saves, stored = JSON.parse(disk).goals.Moa.statGoal; saves = 0;
  applyData(JSON.parse(disk)); migrateMemory();
  return { first, stored, second: saves, error: '' }; } catch (e) { return { error: e.message }; } finally { save = origSave; } })()`);
check('a stat goal from a file above the maximum is saved once as the maximum (#25 re-review)', !statSave.error && statSave.first === 1 && statSave.stored === 60
  && statSave.second === 0, JSON.stringify(statSave));
// The bloodline-upgrade advice prints its stats with a sign and says "lower stats" only when they are lower
const blUpgrade = await ev(`(() => { try {
  const black = SPECIES_DATA.Moa.phenotypes[7].label;
  applyData({ version: 7, herd: [__mk8(1, 1, 'Moa', 'M', 'Wild', 'BM01 Black', { status: 'Breed', ph: black, stats: __st24(5) })], pairs: { Moa: [{ m: 'BM01 Black', f: '' }] },
    pairCounts: { Moa: 1 }, goals: { Moa: { goals: [{ bl: 'Alpha', ph: '' }, { bl: '', ph: black }], phenoWeights: { [black]: 3 } } } }); migrateMemory();
  const text = __advise('Moa', 'M', 'Alpha', { VIG: 5, FIT: 6, PHY: 5, REF: 5, TGH: 5, ADP: 5, INS: 5 });
  return { upgrade: /Bloodline Upgrade/.test(text), lower: /lower stats/.test(text), plusOne: /Stats: \\+1 \\(31 vs 30\\)/.test(text), error: '' };
} catch (e) { return { error: e.message }; } })()`);
check('the bloodline-upgrade advice shows +1 for higher stats and says "lower stats" only when they are lower (#25 re-review)', !blUpgrade.error && blUpgrade.upgrade
  && !blUpgrade.lower && blUpgrade.plusOne, JSON.stringify(blUpgrade));
// The "cannot be bred" label on Pairs gives way to "No animals yet:" once a card is opened from a chip
const unbredLabel = await ev(`(() => { try {
  applyData({ version: 7, herd: [__mk8(1, 1, 'Horse', 'M', 'Wild', 'HR01 Horse')] }); migrateMemory();
  showTab('pairs'); const before = document.querySelector('#pairs-add-chips .add-chips-lbl')?.textContent || '';
  document.querySelector('#pairs-add-chips .add-chip[data-sp="Moa"]')?.click();
  const after = document.querySelector('#pairs-add-chips .add-chips-lbl')?.textContent || '';
  return { before: /^Horse cannot be bred/.test(before), after, error: '' }; } catch (e) { return { error: e.message }; } })()`);
check('the Pairs label for a herd that cannot be bred changes once a card is opened (#26 re-review)', !unbredLabel.error && unbredLabel.before
  && unbredLabel.after === 'No animals yet:', JSON.stringify(unbredLabel));

await ev(`(() => { applyData(JSON.parse(window.__snap25)); migrateMemory(); saveAndRefreshFull(); showTab('herd'); document.getElementById('f-species').value = 'Dune Raptor'; onSpeciesChange(); return true; })()`);

check('no console errors or exceptions', errors.length === 0, errors.slice(0, 5).join(' | '));
console.log(results.join('\n'));
const failed = results.filter(r => r.startsWith('FAIL')).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
await close();
