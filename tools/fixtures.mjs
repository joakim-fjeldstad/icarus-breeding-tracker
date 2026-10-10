// Synthetic data for tools/smoke.mjs and tools/screenshots.mjs. Nothing here comes from a real herd or a real save.

/**
 * JavaScript (as a string) that seeds a small, realistic-looking herd inside the page.
 * Six Dune Raptors across three generations with parents linked, a handful of other species,
 * nicknames on a few animals, varied statuses, and one breeding pair per breedable species.
 */
export const SEED_SHOWCASE = `(() => {
  animals.length = 0; pairsMap = {}; goalsMap = {}; pairCounts = {}; nextSpAid = {}; phenoStats = {}; blStats = {}; logEntries = [];
  let id = 1;
  const mk = (sp, sex, bl, phIdx, stats, extra = {}) => {
    const cfg = SPECIES_DATA[sp]; const spId = getNextSpId(sp); const st = {}; STATS.forEach((s, i) => st[s] = stats[i]);
    const ph = cfg.phenotypes[Math.min(phIdx, cfg.phenotypes.length - 1)].label;
    const a = { id: id++, spId, sp, sex, bl, ph, gen: 1, p1: '', p2: '', isBred: false, stats: st, total: getTotal(st, sp),
      name: computeName(sp, sex, bl, ph, st, spId), nickname: '', favorite: false, status: '?', notes: '', ...extra };
    animals.push(a); return a;
  };
  const dr1 = mk('Dune Raptor', 'F', 'Wild',  0, [5, 6, 4, 5, 6, 5, 3], { status: 'Breed', level: 24, nickname: 'Dusty' });
  const dr2 = mk('Dune Raptor', 'M', 'Alpha', 5, [7, 5, 6, 6, 5, 4, 4], { status: 'Breed', level: 31, favorite: true });
  const dr3 = mk('Dune Raptor', 'F', 'Unstable', 7, [7, 6, 6, 6, 6, 5, 4], { status: 'Keep', gen: 2, p1: dr1.name, p2: dr2.name, isBred: true, level: 12 });
  const dr4 = mk('Dune Raptor', 'M', 'Alpha', 2, [6, 6, 7, 6, 5, 5, 3], { status: 'Reserve', gen: 2, p1: dr1.name, p2: dr2.name, isBred: true });
  mk('Dune Raptor', 'F', 'Alpha', 7, [8, 7, 7, 7, 6, 6, 4], { status: 'Breed', gen: 3, p1: dr3.name, p2: dr4.name, isBred: true, nickname: 'Comet' });
  mk('Dune Raptor', 'M', 'Timid', 0, [3, 4, 3, 4, 3, 3, 2], { status: 'Dead', notes: 'Lost to a wolf pack on Olympus' });
  const sl1 = mk('Slinker', 'F', 'Hardy', 3, [6, 5, 6, 7, 5, 6, 4], { status: 'Breed', level: 18 });
  const sl2 = mk('Slinker', 'M', 'Bold',  6, [5, 6, 6, 7, 6, 5, 5], { status: 'Breed', level: 20, nickname: 'Shadow' });
  mk('Slinker', 'M', 'Unstable', 0, [6, 6, 7, 8, 6, 6, 5], { status: 'Keep', gen: 2, p1: sl1.name, p2: sl2.name, isBred: true });
  const bm1 = mk('Moa', 'F', 'Stout', 1, [6, 7, 5, 4, 7, 6, 5], { status: 'Breed', level: 15 });
  const bm2 = mk('Moa', 'M', 'Careful', 0, [5, 6, 5, 5, 6, 7, 6], { status: 'Breed', level: 9 });
  mk('Moa', 'F', 'Stout', 4, [6, 7, 6, 5, 7, 7, 6], { status: '?', gen: 2, p1: bm1.name, p2: bm2.name, isBred: true });
  mk('Tusker', 'M', 'Savage', 0, [8, 7, 9, 5, 8, 6, 4], { status: 'Station', level: 40, nickname: 'Tank' });
  mk('Tusker', 'F', 'Brave', 2, [7, 7, 8, 5, 7, 6, 5], { status: 'Station', level: 35 });
  mk('Forest Wolf', 'M', 'Alpha', 6, [6, 7, 6, 8, 5, 6, 7], { status: 'Keep', level: 22 });
  mk('Gribbler', 'F', 'Resolute', 1, [4, 5, 4, 6, 5, 7, 8], { status: 'Keep' });
  mk('Horse', 'M', 'Wild', 2, [5, 5, 5, 5, 5, 5, 5], { status: 'Keep', nickname: 'Midnight' });
  mk('Chicken', 'F', 'Timid', 0, [3, 3, 2, 3, 3, 4, 6], { status: 'Keep' });
  pairsMap['Dune Raptor'] = [{ m: dr2.name, f: dr1.name }, { m: dr4.name, f: dr3.name }];
  pairsMap['Slinker'] = [{ m: sl2.name, f: sl1.name }];
  pairsMap['Moa'] = [{ m: bm2.name, f: bm1.name }];
  animals.forEach(a => { trackPhenotype(a.sp, a.ph, a.isBred); trackBloodline(a.sp, a.bl, a.isBred); });
  initGoals(); initPairCounts();
  goalsMap['Dune Raptor'].goals = [{ bl: 'Alpha', ph: SPECIES_DATA['Dune Raptor'].phenotypes[7].label }];
  goalsMap['Dune Raptor'].blPriority = { Alpha: 3, Unstable: 2, Timid: -1 };
  goalsMap['Dune Raptor'].phenoWeights = { [SPECIES_DATA['Dune Raptor'].phenotypes[7].label]: 3 };
  addLog('Dusty added to the herd', 'add'); addLog('Comet added to the herd (bred from Dusty and DR02)', 'add'); addLog('Tank: Keep → Station', 'status');
  saveAndRefreshFull();
  return animals.length;
})()`;

/** Property-tag blob and Mounts.json generator for synthetic game files. */
export const fx = (() => {
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
    MountName: a.name ?? 'A', MountLevel: a.level ?? 1, MountType: a.type || 'Moa', MountIconName: String(1000 + i) })) });
  return { T, props, blob, file, cat, fstr, i32 };
})();
