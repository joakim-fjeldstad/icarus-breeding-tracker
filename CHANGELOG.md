# Changelog – Icarus Breeding Tracker

All notable changes to this project are documented here.

---

## v0.30 – New species, breeding and taming info
**2026-10-10**

Implements #13, based on the species research in #7 (wiki, patch notes, the game's data tables and in-game checks).

### New species
- **Shaggy Zebra** [SZ] — mount, tamed from a wild juvenile, base phenotype only
- **Kiwi** [KW] — attack pet, caught with a Snare Trap and Kiwi Bait (Forest, Grassland, Arctic, at night)

### Breeding
- **Breedable now means a fertility serum exists in game** — the New Animal form names the serum to use, for example "Breed with Moa Fertility Serum"
- **Gribbler and Wild Boar are breedable** — the New Animal form now shows parent fields for them
- **Draven and Terrenus are not breedable** — there is no serum for them, so the parent fields are hidden, as for other non-breedable species. Existing animals and pairs are not changed

### Phenotypes
- **Tusker** now has 7 phenotypes, **Ubis** 8 and **Wild Boar** 8, with weights from the game data
- **Buffalo P5** is legendary (weight 5), matching the game

### How each species is obtained
- The New Animal form shows how the first animals are obtained: tamed from a wild juvenile, caught with a Snare Trap and a named bait in named biomes, bought from the station, or a mission reward
- Replaces the two generic texts ("obtained from station or special mission" and "tame only")

### Security
- **Lineage insights escape the species and breed-out stat** — a crafted herd file could otherwise inject HTML there. A breed-out stat loaded from a file is now only used if it is one of the seven known stats, everywhere it is read

### Fixes
- **New species land in their category** — if you have reordered the species cards, species added in a new version now appear next to their neighbours instead of at the end of the list
- **No "Breed with undefined"** — the serum line in the New Animal form only shows for species that have a serum

### README
- **Species reference** updated from 4 to all 26 species, with how to get them and how to breed them

---

## v0.29c – Goals tab negative-star fix
**2026-10-10**

Fixes #1 and #2.

### Fixes
- **Goals tab no longer goes blank** — in some herds, giving a bloodline or phenotype a negative star made the Breeding Suggestions panel throw an error, which stopped the Goals tab from drawing that species and every species after it. Saved goals were never lost, only hidden
- **One broken card can't hide the rest** — if a species card fails to render, it is replaced by a short error card and the other species still show

---

## v0.29b – CSV round-trip & name escaping fixes
**2026-10-04**

Fixes from code and security review of v0.29.

### CSV Export
- **All fields quoted** — names and notes with commas, quotes or line breaks now survive export and re-import
- **Nickname, favourite, bred flag and level exported** — previously lost on every round-trip
- **Formula guard** — values starting with = + - @ get a leading ' so spreadsheets don't run them

### Fixes
- **Security: escaped animal and parent names** in the lineage tree and pair upgrade text (HTML in a name or parent field could run script)
- **Import robustness** — a stray " no longer merges rows, imported text gets the same length limits as saved files, 5 MB file cap, only real species names accepted, ID 0 rejected
- **Import consistency** — duplicate names within one file are caught, a reassigned ID is also updated in the name, generated names include the ID
- **Search** — unpadded IDs match (dr3 finds DR03), and the browser no longer restores a stale search value

---

## v0.29 – Herd search & safer CSV import
**2026-10-04**

Search, Dead pill, Station fix and CSV import contributed by @D40G in #3.

### My Herd
- **Search box** — matches name, nickname and ID, case-insensitive; every word must match, and an active search includes Dead and Station animals
- **Station pill fixed** — the 🛸 Station pill showed an empty list because Station animals were hidden before the status filter ran; Station and Dead pills now override the hide toggles
- **🪦 Dead status pill** — Dead animals no longer need the Show Dead toggle to be found
- **Clearer empty state** — says no animals match when the herd has animals but the filters or search exclude them all

### CSV Import
- **No duplicates on re-import** — animals already in the herd are skipped and counted in the toast
- **Keeps the CSV's own IDs** — e.g. DR123 stays 123 unless the ID is taken by a different animal
- **Proper CSV parsing** — quoted fields, embedded commas and newlines, CRLF and BOM
- **Validation** — rows with unknown species or no bloodline are skipped, invalid status falls back to ?, sex is limited to M/F

### Docs
- Links updated after the repository moved to joakim-fjeldstad

---

## v0.28b – Species filter pills fix
**2026-04-14**

### My Herd
- **Species pills show all species** — pills now build from SPECIES_DATA instead of existing herd animals, so all 23 species are always available as filters even before adding any animals of that type
- **No more duplicate All button** — removed the hardcoded All button that was showing alongside the one generated by the pill builder
- **Category-aware species pills** — selecting a category filter (Mounts / Attack Pets / Utility) automatically narrows the species pills to just that category; selecting All restores all 23

---

## v0.28 – New species, categories & breedable flag
**2026-04-14**

### New Species — Mounts (13 total, up from 4)
- **Arctic Moa** [AM] — breedable, P0 only
- **Buffalo** [BF] — breedable, P0–P7
- **Draven** [DV] — breedable, P0 only
- **Horse** [HR] — station-only, not breedable; comes in Brown (base), White, Black
- **Terrenus** [TE] — breedable, P0 only
- **Tusker** [TK] — breedable, P0 only
- **Ubis** [UB] — breedable, P0 only
- **Woolly Mammoth** [WM] — tameable but not breedable, P0 only
- **Zebra** [ZB] — mission-tame only, not breedable, P0 only

### New Species — Attack Pets
- **Forest Wolf** [WO] — breedable, P0–P7
- **Gribbler** [GB] — tameable only, P0–P7
- **Hyena** [HY] — tameable only, P0 only
- **Skulk** [SK] — tameable only, P0 only
- **Snow Wolf** [SW] — breedable, P0 only
- **Storca** [SC] — tameable only, P0 only
- **Wild Boar** [WB] — tameable only, P0 only

### New Species — Utility Pets (Livestock)
- **Cattle** [CT] — Cow (F) / Bull (M); station-obtained, breedable, P0
- **Chicken** [CK] — Hen (F) / Rooster (M); station-obtained, breedable, P0
- **Pig** [PG] — station-obtained, breedable, P0
- **Sheep** [SH] — Ewe (F) / Ram (M); station-obtained, breedable, P0

### Categories
- All species now have a category: **Mount**, **Attack Pet**, or **Utility Pet**
- Species dropdown in the entry form is grouped by category using native optgroup
- **Category filter pills** added to My Herd tab (filter by type alongside species/status/sex)
- **Category section headers** appear in Pairs and Goals tabs between species cards

### Breedable flag
- Non-breedable species (Horse, Zebra, Woolly Mammoth, Gribbler, Hyena, Skulk, Wild Boar, Storca) hide the parent fields in the entry form with a note explaining why
- Flag defaults to true for all existing species; no data migration needed

---

## v0.27b – Pentest XSS audit & browser security
**2026-04-14**

Active penetration testing with crafted JSON payloads confirmed 5 critical and 8 high-severity XSS vulnerabilities that survived v0.27, plus two browser security gaps identified from an OWASP/HTML5 security review. All fixed.

### Security — Confirmed exploitable XSS (CRITICAL)
- **Parent names in renderHerd** — `p1`/`p2` fields rendered as raw HTML in the herd table; `<img src=x onerror=alert(1)>` as a parent name executed on herd tab load
- **Parent names in viewAnimal panel** — same field injected unescaped into the animal view panel
- **Suggestion animal names** — `r.sugM.name` and `r.sugF.name` in Goals tab recommendations unescaped
- **Upgrade rec animal names** — `better.name` and `reserve.name` in upgrade rows unescaped
- **Goal bloodline/phenotype labels** — `r.goal.bl` and `r.goal.ph` from user `goalsMap` injected raw into `goalLabel` HTML

### Security — HIGH
- **blBadge in viewAnimal** — `a.bl` unescaped in the bloodline badge chip
- **phDisp fallback** — `a.ph` raw value used as fallback when `phenoDisplay()` returned empty; affected both renderHerd and viewAnimal
- **Warning strings** — `r.sugM.bl` bloodline name in pair warnings unescaped
- **Advice panel** — `r.currentName`, `r.goal.bl`, `r.goal.ph`, `bl` in upgrade/temp/equal advice items unescaped

### Security — Browser
- **Reverse tabnabbing** — added `rel="noopener noreferrer"` to all 5 `target="_blank"` links; without this an opened page can navigate the original tab via `window.opener`
- **Clickjacking** — added `frame-ancestors 'none'` to the CSP meta tag; `frame-src` only controls what *this page* embeds — `frame-ancestors` is what prevents *this page* from being embedded in a malicious iframe

---

## v0.27 – Security hardening
**2026-04-14**

Combines v0.26c and v0.26d (neither was pushed). Full security audit conducted including active penetration testing with crafted JSON payloads.

### Security — XSS
- **`$h()` function** — HTML-encodes all user data before innerHTML insertion; applied to 51 call sites across all animal text fields (name, nickname, bloodline, phenotype, species, parents, notes)
- **`probRow` label and color** — phenotype/bloodline labels in Breeding Odds panel HTML-encoded; color values validated against strict regex before style injection
- **`buildStatsRow` tooltip** — stat tooltips HTML-encoded
- **`showConfirm` / `showUndoToast`** — msg parameters HTML-encoded before innerHTML
- **Log renderer** — `_linkifyLogMsg` HTML-encodes raw message before linkification

### Security — onclick injection
- **`$esc()` backslash bypass fixed** — critical: backslashes are now escaped before HTML encoding, preventing `\\` + `\'` from breaking out of JS single-quoted string context; verified safe against crafted payloads including `\'); alert(1); //`
- **Filter buttons** — use `$esc()` for filter type and value; display label uses `$h()`
- **Pair assignment** — `$esc()` used for species, sex and animal name
- **Optimizer conflict badge** — species name in title attribute now uses `$h()`

### Security — input validation
- **`applyData` hardened** — all fields type-checked and whitelisted; strings sanitised via `_sanitizeStr()` with max-length caps; stat values clamped to 0–10 integers; booleans coerced; prototype pollution prevented; existing save data preserved through migration system
- **JSON.parse guarded** — file load paths have explicit try/catch with user-facing error toast on parse failure; pool tile dataset parse also guarded
- **Wiki URLs validated** — must start with `https://` before injection into href

### Security — infrastructure
- **Content Security Policy** — meta tag blocks external connections, frames, objects and fonts; images restricted to self/data/blob
- **Pentest report** — active testing with crafted JSON payloads confirmed no remaining code execution vectors

---

## v0.26b – Numeric sort, GR data migration & odds panel toggle
**2026-04-14**

### Security
- **Content Security Policy** — added CSP meta tag blocking all external connections, frames, objects and fonts; restricts image sources to self/data/blob only
- **probRow XSS** — phenotype and bloodline labels in the Breeding Odds panel are now HTML-encoded; inline color values validated against a strict regex before injection into style attributes
- **Tooltip XSS** — stat labels in the entry form's data-tip attributes now go through `$h()`
- **showConfirm / showUndoToast XSS** — msg parameters HTML-encoded before innerHTML insertion
- **onclick injection** — filter buttons and pair assignment buttons now use `$esc()` instead of a partial single-quote-only escape, closing backslash and attribute breakout vectors
- **Wiki URL injection** — cfg.wiki URLs validated to start with `https://` before being placed in href; falls back to `#` if invalid
- **applyData hardened** — all fields from loaded JSON are now type-checked, string fields sanitised via `_sanitizeStr()` (max length enforced), booleans coerced, numbers validated, prototype pollution prevented by rejecting non-plain-object input; existing save data is preserved through the same migration system
- **JSON.parse guarded** — file load paths now have explicit try/catch around JSON.parse with a user-facing error toast on parse failure; pool-tile dataset parse also guarded
- **Log renderer** — `_linkifyLogMsg` HTML-encodes the full message before linkification (carried forward from v0.26c)

---

## v0.26c – XSS security fix
**2026-04-14**

### Security
- **XSS vulnerability fixed** — animal text fields (name, nickname, bloodline, phenotype, species, parents, notes) are now HTML-encoded via a new `$h()` function before being inserted into innerHTML; previously a crafted JSON file could inject and execute arbitrary HTML/JS
- **`$esc` hardened** — the onclick attribute escaping function now also HTML-encodes, preventing attribute breakout attacks
- **Log renderer secured** — `_linkifyLogMsg` now HTML-encodes the raw log message before linkification, so animal names containing tags can no longer inject markup into the log

---

## v0.26b – Numeric sort, GR data migration & odds panel toggle
**2026-04-14**

### My Herd
- **Numeric name sort** — Name column now sorts by species ID numerically (DR9 → DR10 → DR100) instead of lexicographically

### Breeding Pairs
- **Breeding Odds collapsible** — the panel header is now clickable to collapse/expand; collapsed state persists while the panel is open
- **Removed theory warning** — "THEORY ONLY" notice removed from the Breeding Odds panel

### Data
- **v6 migration** — existing save data with `Swamp Raptor` animals, pairs and goals is automatically renamed to `Geothermal Raptor` on first load; runs once and saves immediately

---

## v0.26 – Favicon, level field, breed log & GR rename
**2026-04-14**

### UI
- **Favicon** — added raptor footprint tab icon (dark background, orange claw); no more generic browser globe icon

### Animals
- **Level field** — optional level input (1–50) on the Add/Edit Animal form; displayed as a badge in the Animal View panel
- **Mutation rate estimate** — Unstable animals with a level set show an estimated phenotype/bloodline mutation rate in the viewer (scales from ~20% at level 1 to ~65% at level 50)

### Log
- **Breed outcomes** — adding a bred animal now logs the bloodline, phenotype and stat total: `🥚 [name] bred — [bl] / [ph] / [X] stats`; a new "Bred" filter button in the log makes these easy to find
- Tamed animals now log as `Added [name] (tamed)` to distinguish from bred entries

### Breeding Pairs
- **Removed DR/GR cross-breeding** — `CROSS_BREEDS` emptied and cross-breed banner removed from the Pairs tab; mechanic was bugged due to DR and GR sharing skill trees
- **Share My Herd colours** — card colours now match the app's dark green theme (`--bg`, `--card`, `--acc`, `--bdr`) instead of the old blue palette

### Species
- **Swamp Raptor renamed to Geothermal Raptor** — abbreviation updated from SR to GR across all tabs, filters, species data, icons and wiki links

---

## v0.25b – Pair pool cross-breed fix
**2026-04-06**

### Breeding Pairs
- **Cross-breed pool fix** — animals already slotted in any pair (including another species' pairs) no longer appear as available in the pool; previously only the current species' pairs were checked, so e.g. a SR in an SR slot would still show as available under DR

---

## v0.25 – Pair DnD fix & optimizer stat priority
**2026-04-06**

### Breeding Pairs
- **Drag and drop fixed** — pair slot tiles in the Pairs tab now correctly accept drops; event listeners were previously only attached during Goals rendering, meaning DnD was silently non-functional in the Pairs tab
- **Drag highlight fixed** — slot highlight no longer flickers when the cursor moves over a child element inside the slot (fixes the classic `dragleave`/`relatedTarget` bug)
- **Occupied slot confirmation** — dropping an animal onto an already-filled slot now shows a confirmation dialog ("Set [name] to Reserve and replace with [name]?") instead of silently overwriting; displaced animal is set to Reserve status if confirmed

### Optimizer
- **Stat goal takes priority over bloodline diversity** — the bloodline diversity preference (spreading pairs across different bloodlines) no longer overrides a significantly better animal; diversity is now only applied among candidates with a non-negative score, so a negatively-weighted animal (e.g. Wild bloodline, base phenotype) can no longer be favored over a high-stat positive animal purely for variety

---

## v0.24 – Side panel, tile polish & goal charts
**2026-04-05**

### Animal Viewer
- **Side panel** — the viewer is now a persistent fixed panel on the right side of the screen instead of a centered modal; slides in when any animal name, tile, or log entry is clicked; no longer blocks the rest of the UI
- **Badge chips** — bloodline and phenotype shown as colored pill badges at the top of the panel (using `BLOODLINE_COLOR` and phenotype rarity color) alongside sex and generation chips
- **Radar fixed** — chart now renders correctly in the panel (previously drawn before the canvas existed in the DOM)
- **Clickable parents** — parent names in the viewer link directly to that parent's viewer if the parent is in the herd

### Breeding Pairs
- **Bloodline badge on tiles** — the bloodline label is now a SAVAGE-style colored pill badge using `BLOODLINE_COLOR`
- **Phenotype border stripe** — each tile has a colored top stripe indicating phenotype rarity (base: grey, uncommon: green, rare: blue, legendary: orange)
- **Short tile ID** — tiles show only the species ID (e.g. `DR02`) instead of the full generated name; full name visible on hover
- **Slot tiles clickable** — tiles in breeding pair slots now open the viewer (previously only pool tiles did)
- **Removed pair score** — the combined `S:XX` score label is removed from pair rows; individual stat totals on tiles are sufficient
- **Upgrade wording fixed** — the upgrade panel now shows "no upgrade" (muted style) when the best free animal is weaker than the current paired animal, instead of incorrectly labeling it "optimal"
- **Tile name colors** — male/female tile name colors slightly brightened (`#6aa4b8` / `#c07890`)

### Edit Animal
- **Form radar** — the stat entry form now shows a live radar chart that updates as stat values are entered or changed
- **Radar label clipping fixed** — all radar charts (viewer, edit form) now use dynamic `maxR` scaled to canvas size; viewer canvas enlarged to 200×178, form canvas to 190×168

### Goals
- **Clickable animals** — all animals in Breeding Suggestions are now clickable links that open the side panel viewer
- **Stat goal is species max** — the stats target threshold is now always `getMaxTotal(sp)` (theoretical max for 6 non-BO stats); user-editable control removed
- **Reserve target ± buttons** — the reserve count text input is replaced by `−` and `+` buttons
- **Phenotype sighting radar** — a single P0–P7 radar chart replaces the individual per-row stat radars; each axis is a phenotype tier, value is sqrt-scaled total sightings (tamed + bred), axis labels show the count; dots are colored by rarity
- **Bloodline sightings colored** — bloodline names are now colored using `BLOODLINE_COLOR` to match the rest of the app

### Sighting Counts
- **Counts include dead animals** — phenotype and bloodline sighting counts are now derived directly from the `animals` array (no status filter) rather than the incremental `phenoStats`/`blStats` counters, which could miss animals added before tracking was introduced; only Discarded animals are excluded

### Log & My Herd
- **Log: clickable animals** — animal names in log entries are hyperlinked and open the viewer
- **My Herd: clickable parents** — parent names in the herd table are clickable if the parent exists in the herd

### Docs
- **README updated** — all major sections rewritten to reflect v0.24 features; screenshots added for New Animal, My Herd, Breeding Pairs, Goals, Edit Animal, and Animal Viewer

---

## v0.23 – Icarus design system
**2026-04-05**

- **New visual design** — full palette overhaul to match the in-game aesthetic: dark olive-charcoal backgrounds, olive-green section headers, amber stat values; replaces the old blue-navy scheme
- **Pairs: drag-and-drop tile slots** — pair assignment now uses chamfered tile slots (top-left + bottom-right corners cut, matching Icarus item slot style); animals are shown as draggable tiles and can be dragged from the pool into male/female slots, between slots, or back to the pool; the underlying assignment logic is unchanged
- **Pairs: animal pool** — each species card now shows a pool of available (unassigned) animals below the pair slots as draggable tiles; clicking a pool tile opens the animal viewer
- **Herd: full-row click** — clicking anywhere on an animal's herd row (except buttons and dropdowns) opens the animal viewer panel, replacing the name-only clickable area
- **View panel: radar chart** — the animal view panel now shows an amber polygon radar chart of stat values; axis labels only; the breed-out stat vertex is highlighted in red
- **View panel: stat layout** — stats now shown as two-column rows (label | value) that never truncate, replacing the 7-column grid
- **View panel: sex colors** — male/female indicators now use the muted blue/mauve palette matching the tile system
- **Remove button** — tile ✕ button uses vivid `#e06060` red (matching the SAVAGE bloodline badge)

---

## v0.22 – Animal viewer & smart pairing
**2026-04-05**

- **Animal viewer panel** — clicking any animal name in the herd table opens a read-only view panel showing full details, stats, current pair assignment, and optimizer suggestion for that animal; includes quick-action buttons to change status, assign to/remove from a pair slot, or jump to the edit form
- **Auto-status on pair assignment** — adding an animal to a pair slot (manually or via the optimizer) automatically sets their status to Breed; removing or replacing them reverts status to Undecided, but only if the status was Breed (prevents overriding Reserve/Station set deliberately)
- **Optimizer: pair conflict warnings** — if the optimizer proposes moving an animal that is already in a different pair slot, a ⚠ warning now appears in the modal row indicating which pair they will be moved from
- **Smarter cull suggestions** — optimizer now suggests culling when: a desired trait is covered in a pair slot and the animal is well below stat goal (70% threshold); an animal is outclassed by a paired same-sex/species animal and has no unique positive traits; near-max-stat animals are protected from this redundancy cull

---

## v0.21d – Smarter optimizer suggestions
**2026-04-05**

- **Suggestion: trait already covered** — when an animal has a desired trait but below-goal stats, the optimizer now checks how many pair slots already carry that trait; if 2 or more pair animals already share it, the suggestion becomes Cull (the trait is well-represented and a weaker below-goal animal with no unique value should not occupy a station slot)

---

## v0.21c – Optimizer & stability fixes
**2026-04-05**

- **Critical fix: saveAndRefresh broken** — a prior patch accidentally replaced the bodies of `saveAndRefresh` and `saveAndRefreshFull` with recursive self-calls; every save threw a silent stack overflow, so the UI never re-rendered after any operation (data was saved correctly, but the herd/pairs view only updated on the next tab switch)
- **Fix cross-breed native constraint** — Phase 3 now tries both sexes when enforcing the native-animal rule; previously if no native of the preferred sex was available it silently gave up, leaving both pair slots filled with cross-species animals
- **Fix optimizer Apply button feedback** — button visual update (✓ Applied, disabled) now happens before `saveAndRefresh()` so re-renders cannot clobber it; individual Apply buttons also show a toast confirmation
- **Fix optimizer auto-close** — switched from unreliable DOM button query to an explicit counter; modal now reliably closes once every individual Apply button has been used
- **Done button in optimizer modal** — new footer button closes the modal while keeping any partial changes already applied, for when you only want to action some suggestions
- **Undo dead marking** — clicking 🪦 on an animal no longer shows a confirm dialog; a 5-second Undo toast appears instead so accidental culls can be reversed immediately
- **Pre-push checklist** — added version-check and legacy-archive steps to CONTRIBUTING.md; legacy zips now stored in `E:\Claude\icarusBreedingTrackerLegacy\`

---

## v0.21 – Optimizer improvements

- **Cross-breed native constraint** — the optimizer now guarantees at least one native-species animal per pair slot; previously it could fill all DR or SR slots with cross-species animals if they scored higher, breaking native bloodline continuity
- **Individual Apply buttons** — each proposed pair row and each status-suggestion row in the Optimize modal now has its own Apply button; clicking it applies that single change without closing the modal, then marks the button as ✓ Applied and disables it
- **Cross-breed offspring disclaimer** — corrected to "Offspring will be DR or SR" (was incorrectly showing only the host species)
- **Fix optimizer modal crash** — suggestion rows used `si` (index) without declaring it in the `.map()` callback, causing a ReferenceError that prevented the modal from rendering; fixed to `.map((s, si) => ...`
- **Fix version label not updating** — `APP_VERSION` was not bumped during the v0.21 patch; now correctly shows v0.21
- **Fix optimizer Apply button feedback** — button visual update (`✓ Applied`, disabled) now happens before `saveAndRefresh()` so a re-render cannot clobber it; individual Apply buttons also now show a toast confirmation
- **Auto-close on completion** — the optimizer modal now closes automatically once every individual Apply button has been used; Apply Pairs Only and Apply All also close the modal
- **Version naming** — `APP_VERSION` and commit titles now consistently match the CHANGELOG section heading

---

## v0.20r1b – Fix app header showing wrong version
**2026-04-05**

- Version label in the app header was not bumped during the v0.20 / v0.20r1 release, leaving it showing "v0.19"
- Version string now driven by a single `APP_VERSION` constant in the JS — no more two places to update

---

## v0.20r1 – Code revision
**2026-04-05**

- Extracted repeated form-reset logic into `resetFormUI()` — previously copy-pasted across three functions; also fixes `cancelEdit` not clearing the nickname field
- Extracted stat-input reading into `getFormStats()`
- Extracted `save(); renderHerd(); renderPairs()` chains (appeared 10 times) into `saveAndRefresh()` / `saveAndRefreshFull()`
- Promoted inline `optLabel` and `mkUpg` closures to top-level named functions (`pairOptionLabel`, `renderPairUpgradeRow`)
- Renamed `phW_` (underscore-suffix-to-avoid-shadowing) to `phItemScore` / `phScore`
- Added JSDoc comments to all major functions
- Added CSS utility classes (`.text-dim`, `.text-sm`, `.text-xs`, etc.) for the most-repeated inline styles
- No behaviour changes

---

## v0.20 – Favorites, nicknames & pair optimizer
**2026-04-05**

- **⭐ Favorites** — star any animal from the My Herd table; favorited animals are never suggested for culling by the optimizer but can still be moved to reserve or taken out of rotation
- **Nicknames** — set an optional display alias per animal in the Add/Edit Animal form; the original generated name (e.g. DR05) is always preserved for internal matching and shown dimly next to the nickname in the herd table and pair dropdowns
- **⚡ Optimize Pairs** — new button in My Herd and Breeding Pairs headers (plus a per-species ⚡ button on each pair card); runs a greedy algorithm that scores all active animals against your goals and bloodline/phenotype priorities, proposes the best M×F pair assignments for each slot, maintains bloodline diversity across multiple pairs, and suggests status changes (Reserve / Store / Cull) for remaining animals based on their traits and stats relative to your stat goal
- Fixed a bug where `isBred` was computed but not stored on the animal object, causing the "Goals achieved" check in the Goals tab to never trigger

---

## v0.19 – Activity log & smart suggestions
**2026-04-05**

- New tab: 📋 Log (between Lineage and Settings) — full activity history with type filters (Added/Edited/Status/Pair/Deleted/Suggestion) and text search
- Log banner: fixed bar at page bottom always shows the latest log entry with a "View log" link
- Configurable max entries (default 100); older entries trimmed automatically; full clear option
- Logged events: animals added or edited, status changes, pair slot changes, animal deletions, advice panel actions
- Goals: new "✓ Goals achieved" section — flags when a bred animal already matches a species goal and suggests updating the goal or starting a new breeding direction
- Goals: new "↑ Reserve upgrades available" section — detects when an unassigned animal has the same desired trait as a reserve animal but higher stats, and suggests a swap
- Goals: new "⚡ Diversity" warning — if all active pairs of a species share the same bloodline, suggests varying genetics to maintain separate breeding lines

---

## v0.18e – Parent & pair dropdown fixes
**2026-04-05**

- New Animal / Edit Animal: Dead/Culled and On Station animals now appear in the parent datalist — shown with 🪦/🛸 icons so they are visually distinct from active animals
- Pairs: removed redundant [DR]/[SR] species tag from cross-breed animal names in pair dropdowns (moved from v0.18d)

---

## v0.18d – Pair dropdown cleanup
**2026-04-05**

- Pairs: removed redundant [DR]/[SR] species tag from cross-breed animal names in pair dropdowns — the species code is already part of the animal name

---

## v0.18c – Custom animal names
**2026-04-05**

- New Animal + Edit Animal: optional "Custom name" field below the generated name — leave blank to use the auto-generated name, or type any override
- Duplicate name check fires as you type; save is blocked if the name already belongs to another animal
- When editing an animal whose name was previously customised, the custom name field is pre-filled automatically

---

## v0.18b – Advice panel actions
**2026-04-05**

- Breeding advice panel (New Animal tab): replaced the "🗑 Remove" button with three status actions — 🔶 Reserve, 🪦 Cull, ❓ Undecided
- The displaced animal is never deleted; choosing an action sets its status and refreshes the panel immediately

---

## v0.18 – Persistent layout
**2026-04-05**

- Collapsed/expanded state of species cards in Pairs and Goals tabs now persists across reloads
- Collapsed/expanded state of individual sections within Goals cards (Phenotype Priority, Bloodline Priority, Suggestions, etc.) also persists
- Stored as arrays in the save file alongside other layout state (cardWidths, speciesOrder); no data migration needed

---

## v0.17b – Masonry layout fix
**2026-04-05**

- Fix cards overflowing into each other in Goals and Pairs grids
- Root cause: `getBoundingClientRect()` was returning the 1px grid-track height instead of the card's content height, so every card got a near-zero row span and its content visually overlapped the card below
- Fix: set `align-self: start` on each grid item before measuring — forces the item to size to its content regardless of the allocated track height
- Establish patch letter versioning convention: bug fixes use a letter suffix (v0.17b), new features get the next integer

---

## v0.17 – Species Goals & Smart Layout
**2026-04-05**

- Goals: per-pair goals replaced with species-level goals (add/remove freely, not tied to pair count) — pairs tab badges now show "✓ Goal N" matches against species goals
- Goals: Pair recommendations in Breeding Suggestions now show one suggestion per species goal, not per pair slot
- Goals: Negative star priorities added (−1/−2/−3, shown in red) for both bloodlines and phenotypes — animals with negative-starred traits show ⚠ warning badges in Pairs tab
- Suggestions: new "⚠ Negative-trait animals worth considering as Temp breeders" section — flags animals with bad traits but ≥20% better stats than best clean animal of same sex; warns if both suggested animals share the same negative trait (increased inheritance risk)
- Suggestions: stats target input added (default 60) — priority animals below target are flagged
- Defaults: Unstable bloodline initialises to ★★ priority for all new species; stats target defaults to 60
- Layout: masonry grid layout for both Pairs and Goals — shorter cards fill the vertical space under taller neighbours rather than always defaulting to the leftmost column; re-runs on window resize
- Data: version bumped to 5 with migration (old per-pair goals promoted to species goals)

---

## v0.16 – Chips & Dynamic Height
**2026-04-05**

- Pairs & Goals: collapsed cards now render as compact inline chips above the grid instead of occupying a full grid column — multiple chips sit side-by-side
- Goals: added card-level ▼ Hide / ▶ Show button (matching Pairs behavior); collapsed state is per-species, in-memory
- Both grids now use `align-items: start` so each card only takes as much vertical space as its actual content — collapsing a section immediately shrinks the card
- Chips are draggable for reordering, same as full cards

---

## v0.15 – Goals Sections & Width Toggle
**2026-04-05**

- Goals: each section (Breed-Out Stat, Pair Goals, Phenotype Priority, Bloodline Priority, Phenotype Sightings, Bloodline Sightings, Breeding Suggestions) now has a clickable ▼/▶ header to collapse/expand it independently per species
- Pairs: Narrow/Wide toggle button added to the pairs card header (was Goals-only); changes are now reflected in both tabs as before
- Renamed "1-wide / 2-wide" toggle labels to "Narrow / Wide" across both tabs

---

## v0.14 – New Animal Polish
**2026-04-05**

- New Animal: parent datalist now shows one entry per animal (spId · name format) — no more duplicate or partial entries from prior field state
- New Animal: ⚠ THEORY ONLY disclaimer moved to the bottom of the probability panel
- New Animal: 🗑 Clear button added to reset the form without navigating away; pair-assign and prob panels are also dismissed; button is hidden/inert when editing an existing animal

---

## v0.13 – Ordering & Suggestions
**2026-04-05**

- Breeding Pairs + Goals: drag-and-drop species card reordering (shared order, drag by ⠿ handle); order persists to save file
- Breeding Pairs: collapsed species cards now sort to the bottom of the grid automatically
- Breeding Pairs + Goals: ▣ 2-wide / ◧ 1-wide toggle per species card; persists to save file
- Goals: Breeding Suggestions panel per species — shows priority animals not in pairs (by bloodline/phenotype stars), reserve candidates (desired trait but lower stats), and per-pair recommendations; Unstable treated as a breeding priority in scoring
- Goals + New Animal: reserve target per species — set desired number of reserve animals; current vs target shown in New Animal tab when species is selected; Unstable flagged as a breeding priority
- New Animal: parent fields changed to neutral "Parent 1 / Parent 2" — either field accepts either parent; save now validates that two known parents must be opposite sex

---

## v0.12 – Sightings, Pairs & Filters
**2026-04-05**

- Share Your Herd: phenotype now colored by rarity (grey/green/blue/orange); bloodline now colored with a fixed per-bloodline palette (same system used throughout the app)
- Goals: editing an animal now correctly adjusts bloodline and phenotype sighting counts — changing Alpha → Savage decrements Alpha and increments Savage; isBred flag changes (adding/removing parents) are also handled
- Pairs: each pair row now has a red × delete button — removes that specific pair regardless of position, and automatically sets both animals in the pair to 🔶 Reserve
- My Herd: phenotype filter pills now show positional labels only (Base, P1, P2…) so cross-species filtering works correctly — selecting P1 shows all P1 animals regardless of species; "Dune Raptor (base)" and "Normal (base)" both appear as "Base"

---

## v0.11 – Quality of Life
**2026-04-05**

- Share Your Herd: added "Best of species…" mode with species selector and top-N count; added "Custom selection…" mode with per-animal checkboxes; species label on cards now shows "DR – Dune Raptor" format
- Pairs tab: collapse/expand ▼/▶ button per species card to minimise sections; top toolbar with species dropdown + "Add Pair Slot" button for quick pair management
- My Herd: 🛸 Show Station toggle added next to 🪦 Show Dead, so you can see station animals when planning new breeding
- Goals: Bloodline Sightings section added per species card (same format as Phenotype Sightings, 🌿 tamed / 🧬 bred); `blStats` added to persisted data

---

## v0.10 – Wiki Links & Herd Share
**2026-04-05**

- Wiki link button added to each species card header in the Breeding Pairs tab — opens the species page on icarus.wiki.gg in a new tab
- Species shorthand in Pairs tab fixed: was showing D/S/M/K, now correctly shows DR/SR/BM/SL (species-dot + full name + code badge, matching the Goals tab)
- `SPECIES_DATA` extended with `wiki` URL per species; `icon` field removed
- Future species data saved as a code comment in `SPECIES_DATA` for later implementation (mounts, station pets, pair management scaling notes)
- New 📸 Share Your Herd section in Settings — generates a canvas image of your animals with four modes: Top 10, Best per Species, Active Breeders, All Active
- Image is copied to clipboard automatically; a download link is shown as a fallback if clipboard API is unavailable
- README: Moa description corrected from "production animal" to "mount and fast travel animal"
- README: Cross-breed disclaimer added noting DR/SR cross-breeding may change when separate skill trees are introduced

---

## v0.9 – Tooltips & Station
**2026-04-05**

- Hover tooltips on all stat labels (form and table headers): full name and what the stat affects
- Hover tooltips on bloodline cells in My Herd with fixed stats and growth stat effects for all 12 bloodlines
- Hover tooltips on species abbreviation cells showing the full species name
- New 🛸 On Station status — for animals stored on the space station between maps
- Station animals are excluded from pair slots (same as Dead/Culled)
- GitHub feedback buttons added to Settings tab: Report a Bug, Feature Request, View All Issues
- README rewritten: web version recommended first, status reference table added, all sections expanded and updated

---

## v0.8 – Pair Assignment
**2026-04-05**

- After saving a new animal, a "Place in Breeding Pair" panel appears below the form
- App scores all compatible pair slots and highlights the best suggestion (empty slots prioritised, then by score improvement)
- Dropdown selectors for species and pair number let the user override the suggestion; sex slot is fixed to the animal's sex
- If the chosen slot already has an occupant, the panel shows their name and score with three options: keep their status unchanged, move them to Reserve, or mark as Discard
- Placing an animal auto-updates their status from ❓/Keep to 🐣 Breed
- Panel is dismissed when the user starts a new entry or clicks Skip

---

## v0.7 – Inline Status & Settings
**2026-04-05**

- Inline status dropdown on every herd row — change status without opening Edit Animal
- Status icons added throughout: ❓ Undecided, ✅ Keep, 🐣 Breed, ⚡ Temp Breed, 🔶 Reserve, 🗑️ Discard, 🪦 Dead/Culled
- Status filter bar updated with icons; ❓ Undecided added as a filter option
- New ⚙ Settings tab — houses data management tools in one place
- Moved Clear All to Settings tab with explicit confirmation checkbox and final-action warning
- Cancel button in Edit Animal form — returns to My Herd with no changes saved

---

## v0.6 – Sort & Filter
**2026-04-05**

- Sort arrows on every column header, updating live to show ↑/↓ on the active column
- Fixed sort for Species, Bloodline, Phenotype and Sex (were falling through to wrong fields)
- New filter row: Sex (All / ♂ M / ♀ F)
- New filter row: Bloodline — dynamic pills built from animals currently in the herd
- New filter row: Phenotype — dynamic pills built from animals currently in the herd
- New filter: Min Total ≥ number input
- Added Sex column to herd table (♂/♀ with gender colours)

---

## v0.5 – Data Migration
**2026-04-05**

- Add `DATA_VERSION` constant — bump this whenever a schema change requires migration
- `loadedDataVersion` captured on load so migrations know where to start
- `migrateMemory()` now runs versioned steps in order (v1→v2→v3→...→current)
- localStorage fallback correctly treated as v1 (pre-version-field data)
- Future schema changes need only a single `if (loadedDataVersion < N)` block
- Data automatically re-saved after migration so the file is always up to date

---

## v0.4 – Cross-breeding
**2026-04-05**

- DR and SR animals can now be placed in each other's pair slots for cross-breeding
- Cross-species animals shown in dropdowns with a [SR]/[DR] tag to distinguish them
- Offspring species is implied by which tab the pair lives in
- Added disclaimer in DR/SR pair sections noting the mechanic will change in a future update
- `CROSS_BREEDS` config added — extend with one line if new cross-breed species are added
- Pair exclusivity is now global across all species (not just within one species)

---

## v0.3 – Pair Exclusivity
**2026-04-05**

- Animals assigned to a pair are no longer available in other pair dropdowns
- Added safety guard in updatePair to reject duplicate assignments with a toast message

---

## v0.2 – Local File Storage
**2026-04-05**

- Replace localStorage with File System Access API
- Startup modal: open existing file, create new, or migrate from browser storage
- Auto-save to `herd_data.json` with debounce + "💾 Saved" indicator
- File handle persisted via IndexedDB (no re-picking on relaunch)
- Falls back to browser storage if File System Access API unavailable
- Add version label to header

---

## v0.1 – Initial Release
**2026-04-05**

- Single-file HTML app, no install needed
- Four species: Dune Raptor (DR), Swamp Raptor (SR), Moa (BM), Slinker (SL)
- Per-species sequential IDs (e.g. DR01, BM03)
- 7 stats: VIG, FIT, PHY, REF, TGH, ADP, INS; configurable breed-out stat
- Generated animal name format: `DR01 48F-Wild P3 VIG2`
- Phenotype rarity colours: Base / Uncommon / Rare / Legendary
- Phenotype occurrence counter (tamed vs bred)
- Animal statuses: Keep, Breed, Temp, Reserve, Discard, Dead (soft delete with restore)
- Pair planner with breeding advice panel
- Probability panel with ⚠ THEORY ONLY disclaimer
- Quick-remove button on advice panel items
- CSV export and import
- Lineage viewer
- Published on GitHub Pages

