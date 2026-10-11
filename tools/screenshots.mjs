// Screenshot generator for the README. Seeds a synthetic herd (no real animals) and captures every view.
//
// Usage:  node tools/screenshots.mjs [path/to/index.html]    (the PNGs always go to this repository's screenshots/ folder)
// Needs:  Node.js 22 or newer, and Chrome, Chromium or Edge. Set CHROME_PATH if the browser is not found.
// Run it when a change alters a view shown in the README, look through the images, then commit them together with the README.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { openPage, sleep } from './browser.mjs';
import { SEED_SHOWCASE, fx } from './fixtures.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const page = pathToFileURL(resolve(process.argv[2] || join(root, 'index.html'))).href;
const outDir = join(root, 'screenshots');
mkdirSync(outDir, { recursive: true });

const WIDTH = 1400, HEIGHT = 900;
// Freeze the clock so the log banner and log timestamps are identical on every run (2026-10-10 12:00 UTC).
// Only `new Date()` and `Date.now()` are frozen; calling `Date()` without `new` is not supported, and index.html never does it.
const FROZEN = Date.UTC(2026, 9, 10, 12, 0, 0);
const freezeClock = `(() => { const T = ${FROZEN}, Real = Date;
  class FrozenDate extends Real { constructor(...a) { if (a.length === 0) super(T); else super(...a); } static now() { return T; } }
  window.Date = FrozenDate; })();`;
const { ev, send, errors, close } = await openPage(page, { width: WIDTH, height: HEIGHT, initScript: freezeClock });
// Same time zone on every machine, so the log times in the PNGs do not depend on where the script runs
await send('Emulation.setTimezoneOverride', { timezoneId: 'UTC' });

async function shot(name, { full = false, maxHeight = 2000 } = {}) {
  await sleep(350);
  let h = HEIGHT;
  if (full) {
    h = Math.min(maxHeight, await ev(`Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)`));
    await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: h, deviceScaleFactor: 1, mobile: false });
    await sleep(250);
  }
  const r = await send('Page.captureScreenshot', { format: 'png', clip: { x: 0, y: 0, width: WIDTH, height: h, scale: 1 } });
  if (full) await send('Emulation.setDeviceMetricsOverride', { width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false });
  writeFileSync(join(outDir, `${name}.png`), Buffer.from(r.result.data, 'base64'));
  console.log('wrote', `${name}.png`);
}

await ev(`useBrowserStorage(); true`);
await sleep(400);
const n = await ev(SEED_SHOWCASE);
console.log('seeded', n, 'animals');
const names = await ev(`({ comet: animals.find(a => a.nickname === 'Comet').name, cometId: animals.find(a => a.nickname === 'Comet').id, dr1: animals.find(a => a.nickname === 'Dusty'), dr2: animals.find(a => a.sp === 'Dune Raptor' && a.sex === 'M' && !a.isBred && a.bl === 'Alpha') })`);

// 1. New Animal, empty
await ev(`showTab('entry'); resetFormUI(); window.scrollTo(0, 0); true`);
await shot('new-animal');
// 2. New Animal, filled in
await ev(`(() => { const s = document.getElementById('f-species'); s.value = 'Dune Raptor'; onSpeciesChange();
  document.getElementById('f-sex').value = 'F'; document.getElementById('f-bloodline').value = 'Alpha';
  const ph = document.getElementById('f-phenotype'); if (ph) ph.value = SPECIES_DATA['Dune Raptor'].phenotypes[7].label;
  [7, 6, 7, 6, 6, 5, 4].forEach((v, i) => { const el = document.getElementById('stat-' + STATS[i]); el.value = v; onStatInput(el, STATS[i]); });
  document.getElementById('f-p1').value = ${JSON.stringify(names.dr1.name)}; onParentInput(1);
  document.getElementById('f-p2').value = ${JSON.stringify(names.dr2.name)}; onParentInput(2);
  document.getElementById('f-gen').value = 2; // Gen is a manual field; both parents are generation 1
  updateName(); return true; })()`);
await shot('new-animal-filled', { full: true });
await ev(`resetFormUI(); true`);
// 3. My Herd
await ev(`showTab('herd'); setFilter('status', 'all', null); setSearch(''); showDead = false; showStation = true; renderHerd(); window.scrollTo(0, 0); true`);
await shot('my-herd', { full: true });
// 4. Animal Viewer
await ev(`viewAnimal(${names.cometId}); true`);
await shot('animal-view', { full: true });
await ev(`closeViewPanel(); true`);
// 5. Edit Animal
await ev(`editAnimal(${names.cometId}); showTab('entry'); window.scrollTo(0, 0); true`);
await shot('animal-edit', { full: true });
await ev(`editingId = null; resetFormUI(); true`);
// 6. Breeding Pairs
await ev(`showTab('pairs'); renderPairs(); window.scrollTo(0, 0); true`);
await shot('pairs', { full: true });
// 7. Optimiser
await ev(`showOptimizeModal('Dune Raptor'); true`);
await shot('optimize');
await ev(`closeOptimizeModal(); true`);
// 8. Goals
await ev(`showTab('goals'); renderGoals(); window.scrollTo(0, 0); true`);
await sleep(600);
await shot('goals', { full: true, maxHeight: 1700 });
// 9. Lineage
await ev(`showTab('lineage'); updateLineageSelector(); document.getElementById('lin-animal-select').value = ${JSON.stringify(names.comet)}; renderLineage(); window.scrollTo(0, 0); true`);
await shot('lineage', { full: true });
// 10. Log
await ev(`showTab('log'); renderLog(); true`);
await shot('log');
// 11. Settings
await ev(`showTab('settings'); window.scrollTo(0, 0); true`);
await shot('settings', { full: true });
// 12. Import from game: a synthetic Mounts.json that fills every preview group
const mounts = fx.file([
  { name: `${await ev(`formatSpId('Dune Raptor', ${names.dr1.spId})`)} Dusty`, type: 'Raptor_Desert', sex: 1, variation: 0, lineage: 'Wild', stats: [5, 6, 4, 5, 6, 5, 4], level: 26 },
  { name: 'Shadow', type: 'Slinker', sex: 2, variation: 6, lineage: 'Bold', stats: [5, 6, 6, 7, 6, 5, 5], level: 20 },
  { name: 'Bramble', type: 'Raptor_Desert', sex: 2, variation: 1, lineage: 'Hardy', stats: [6, 5, 6, 6, 5, 6, 3], level: 8 },
  { name: 'Pebble', type: 'Tundra_Monkey', sex: 1, variation: 3, lineage: 'Fierce', mother: 'Moss', father: 'Flint', stats: [5, 5, 4, 6, 5, 7, 8], level: 14 },
  { name: 'Whiskers', type: 'Cat', sex: 1, lineage: 'Wild' },
  { name: 'Old Stripes', type: 'Wooly_Zebra', sex: 1, lineage: 'None' },
]);
await ev(`(() => { const p = planMountImport(${JSON.stringify(mounts)}); showMountPreview(p, 'Mounts.json'); return true; })()`);
await shot('import-preview', { full: true });
await ev(`document.getElementById('mount-preview').parentElement.remove(); true`);

if (errors.length) console.error('page errors:', errors.join(' | '));
await close();
process.exitCode = errors.length ? 1 : 0;
