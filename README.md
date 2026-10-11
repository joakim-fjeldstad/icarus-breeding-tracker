# 🦖 Icarus Breeding Tracker

![version](https://img.shields.io/badge/version-v0.31c-c87a1a?style=flat-square&labelColor=1d2019)
![no install](https://img.shields.io/badge/no%20install-single%20file-6a7d50?style=flat-square&labelColor=1d2019)
![browser](https://img.shields.io/badge/browser-Chrome%20%2F%20Edge-4a7080?style=flat-square&labelColor=1d2019)
![data](https://img.shields.io/badge/data-stays%20on%20your%20computer-58615a?style=flat-square&labelColor=1d2019)
[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/H2H01XD48Q)

A free, open-source herd tracker and breeding planner for the survival game [Icarus by RocketWerkz](https://store.steampowered.com/app/1149460/Icarus/). Track your tamed animals, plan breeding pairs, work towards bloodline and phenotype goals, and keep the full lineage of every animal. One HTML file, no install, no account, no internet needed after the first load.

> **Keywords:** Icarus game animal breeding, Icarus taming tracker, Dune Raptor breeding, Slinker breeding, Icarus herd management, Icarus bloodline tracker, Icarus phenotype guide, RocketWerkz Icarus tool

![My Herd](screenshots/my-herd.png)

---

## Contents

- [Use the web version](#-use-the-web-version)
- [Two minutes to your first pair](#-two-minutes-to-your-first-pair)
- [Where your data lives](#-where-your-data-lives)
- [How to use](#-how-to-use): [New Animal](#new-animal) · [My Herd](#my-herd) · [Animal View](#animal-view) · [Breeding Pairs](#breeding-pairs) · [Goals](#goals) · [Lineage](#lineage) · [Log](#log) · [Import from game](#import-from-game) · [Settings](#settings)
- [Glossary](#-glossary)
- [FAQ and troubleshooting](#-faq-and-troubleshooting)
- [Status reference](#-status-reference)
- [Species reference](#-species-reference)
- [Download and run locally](#-alternative-download-and-run-locally)
- [Feedback and bug reports](#-feedback--bug-reports)
- [Contributing](#-contributing) · [License](#-license)

---

## 🌐 Use the Web Version

The easiest way to use the app is directly in your browser, nothing to download or update:

**https://joakim-fjeldstad.github.io/icarus-breeding-tracker**

The web version is always the latest release. Your data is saved to a JSON file on your own computer through the File System Access API; nothing is sent to any server.

> **Browser requirement:** Chrome or Edge (version 86 or newer). Firefox and Safari do not support the File System Access API. The app still works there with browser storage as a fallback, but saving to a file of your own needs Chrome or Edge.

Prefer a local copy for offline use or a specific version? See [alternative installation options](#-alternative-download-and-run-locally) at the bottom of this page.

---

## 🚀 Two minutes to your first pair

1. **Open the app** in Chrome or Edge. The startup screen asks how to store your data. Click **✨ Start fresh (create new file)**, pick any folder and save as `herd_data.json`. On later visits click **▶ Continue with herd_data.json** and allow access when the browser asks.
2. **Add two animals.** In **➕ New Animal**, pick the species, sex, bloodline and phenotype, type the seven stats you see on the animal in game, and save. The app generates a name such as `DR01 F29-Wild VIG5` and gives the animal an ID. Do this for a male and a female of the same species.

3. **Make them a pair.** Open **🔀 Pairs** and drag the two tiles from the pool into the male and female slots of pair 1. Their status becomes **Breed**.
4. **Set a goal.** In **⚙ Goals**, pick the species card, add a goal (for example bloodline Alpha, phenotype P7) and star the bloodlines and phenotypes you want. The **Breeding Suggestions** panel now tells you which animals to pair and which to hold back.
5. **Record the offspring.** When the two breed, add the juvenile with its parents filled in (type the ID, for example `DR01`), and set **Gen** to 2, because the field is manual. The **🧬 Lineage** tab shows the family tree and which stats improved.

   ![New Animal, a bred juvenile with both parents](screenshots/new-animal-filled.png)

Already have animals parked at the station? [Import them from the game](#import-from-game) instead of typing them.

---

## 💾 Where your data lives

- **Your herd file.** Everything you enter is saved to `herd_data.json` in the folder you chose. The app saves automatically after every change; a small **💾 Saved** indicator appears in the top right. Back it up, copy it to another computer or share it with another player like any file.
- **Browser storage.** If you skip the file (or use Firefox or Safari), the app keeps the data in the browser's own storage instead. Clearing site data deletes it, so export a CSV now and then. In this mode only the herd, pairs, pair counts, IDs, goals and sightings are saved; the log, card order, widths and collapsed state reset on reload.
- **The game's own file.** The import reads `Mounts.json` from the game's save folder. The tracker only reads it: it never changes, writes or exports game files, and it is not a save editor.
- **Nothing leaves your computer.** No account, no telemetry, no requests to any server. The web version is a static page on GitHub Pages.

> Keep `herd_data.json` on a local drive. Cloud-synced folders such as OneDrive or Google Drive can occasionally conflict with auto-save.

### Migrating from an older version

If you used the app when it stored data in the browser, click **⬆ Migrate data from browser storage** on the startup screen. Your data is written to the file and the old browser storage is cleared.

---

## 📖 How to Use

<details>
<summary id="new-animal"><strong>➕ New Animal</strong></summary>

![New Animal form](screenshots/new-animal.png)

Fill in the species, sex, bloodline, phenotype, generation, stats (VIG, FIT, PHY, REF, TGH, ADP, INS) and, if the animal was bred, the parents. The app generates a name automatically in the format `DR01 F55-Bold P3 VIG2` (see the [glossary](#-glossary) for how to read it). Hover over any stat label or column header to see what the stat does.

Below the species the form shows how that species is obtained in game (tamed from a wild juvenile, caught with a Snare Trap and a named bait, bought from the station, or a mission reward) and, for breedable species, which fertility serum to use.

A **live radar chart** updates as you fill in stats, giving an instant picture of the animal's profile before saving.

![Edit Animal form](screenshots/animal-edit.png)

Two optional name fields: **Custom name** replaces the generated name entirely (typing an old ID into it keeps that ID in the name text only; the animal still gets a new internal ID, which the ID badge and parent lookup use), and **Nickname** sets a display alias shown throughout the app while the generated name stays for matching.

After saving, a **Place in Breeding Pair** panel offers to slot the animal directly into a pair. The app scores all available slots and highlights the best one. If a slot already has an occupant, you choose what happens to the displaced animal.

</details>

<details>
<summary id="my-herd"><strong>📋 My Herd</strong></summary>

![My Herd table](screenshots/my-herd.png)

All your animals in a sortable, filterable table:

- **Sort** by any column except Parents and Actions: click a header once to sort, again to reverse
- **Filter** by category, species, status, sex, bloodline, phenotype and minimum total score
- **Search** by name, nickname or ID (for example `DR123` or `wild vig4`); every word must match, and an active search includes Dead and Station animals
- **Change status inline** with the dropdown in each row
- **Edit** an animal with the edit button; **✕ Cancel Edit** leaves the form without saving and returns to My Herd
- **★ Favorite** marks an animal the optimiser must never suggest for culling
- **Nicknames** are shown in bold with the generated name dimmed beside them
- **Click any row** to open the [Animal View](#animal-view)
- **🪦 Show Dead** and **🛸 Show Station** include those animals in the view; the **Station** and **Dead** status pills show them even when the toggles are off
- **⚡ Optimize Pairs** opens the pair optimiser for all species (see [Pairs](#breeding-pairs))

Two badges warn about data that needs attention: **unknown species** on an animal from a file made with another version of the tracker, and **duplicate ID** when two animals share an ID (older files can have this). For an unknown species, edit the animal and correct the species. For a duplicate ID, changing the species while editing gives the animal a new ID; saving without changing it keeps the ID.

</details>

<details>
<summary id="animal-view"><strong>🔍 Animal View</strong></summary>

![Animal View](screenshots/animal-view.png)

Clicking most animal rows, tiles and names opens the **Animal View**, a panel that slides in from the right without blocking the rest of the page. Lineage nodes and the optimiser list do not open it, and the **in herd** tag opens the edit form instead. It shows:

- **Badge chips** for bloodline (in its colour), phenotype rarity, sex and generation
- **Radar chart** of all stat values
- **Full stats** with the breed-out stat highlighted
- **Current pair** and the optimiser's suggestion for this animal
- **Clickable parents** that open their own viewer when they are in your herd
- **Quick actions**: change status, assign to or remove from a pair slot, or jump to the edit form

Close the panel with **✕**, or open another animal to replace it.

</details>

<details>
<summary id="breeding-pairs"><strong>🔀 Pairs</strong></summary>

![Breeding Pairs](screenshots/pairs.png)

Set up your active breeding pairs per species. An animal can be in only one pair slot at a time.

Each pair has two **tile slots** styled after the in-game item slots, male ♂ and female ♀. Below the slots, the **animal pool** shows every unassigned animal of that species as a draggable tile. Each tile shows the animal's short ID (for example `DR02`), a coloured bloodline badge and a phenotype rarity stripe along the top (grey base, green uncommon, blue rare, orange legendary).

**Assigning animals**

- **Drag from the pool** into a male or female slot
- **Drag between slots**, also across pairs
- **✕** on an assigned tile returns the animal to the pool
- **Click any tile** to open the viewer

When placed in a slot the animal's status becomes **Breed**, unless it is Dead, On Station or Discard. When removed, it goes back to **Undecided** only if its status is still Breed; the earlier status is not remembered. Dropping an animal onto an occupied slot moves the occupant to **Reserve** after a confirmation, and the **×** delete-pair button sets both animals of that pair to Reserve. **+ Add Pair Slot** adds a pair slot.

Each tile shows the animal's ID, a bloodline badge and its stat total, plus a small **✓G** mark when the animal matches a species goal. Hover over a tile for the full name.

An **upgrade recommendation** row inside each species card shows a free animal of each sex with a better total than the current pair, or says **no upgrade**. It is the first match in herd order, not necessarily the best one.

Cards collapse to compact chips with **▼ Hide / ▶ Show** and switch between Narrow and Wide. The grid is a masonry layout, and collapsed state and card width persist.

**⚡ Optimize All** is in the section header (all species) and a ⚡ button on each card optimises one species. My Herd has its own **⚡ Optimize Pairs** button for all species. The optimiser scores every animal except Dead and Discard (including On Station, Reserve and cross-breed partners) against your goals, bloodline priorities and phenotype priorities, then proposes the best male and female for each slot: goals first (one pair per goal where possible), then the highest-scoring remaining animals, with a bias towards bloodline diversity so separate lines are kept. Alongside it lists suggested status changes for animals that are not in a proposed pair. The stat goal is the species maximum, a perfect total. Reserve is suggested for an animal that matches a goal, or has a desired trait but a total below the stat goal. Cull is suggested for a desired-trait animal whose trait is already in two or more proposed slots, or in one slot while the animal is below 70 % of the maximum, and for negative traits or no valued traits below the stat goal. **Store** is suggested for animals with a perfect total that have no place in a pair. Favourited animals are never suggested for culling. Applying Cull sets 🪦 Dead/Culled, not Discard. Each row has its own **Apply** button; choose **Apply Pairs Only** or **Apply All** for everything.

![Optimiser](screenshots/optimize.png)

If a proposed animal is in another pair slot, a **⚠ in pair** warning appears; hover over it to see which pair the animal will leave.

</details>

<details>
<summary id="goals"><strong>⚙ Goals</strong></summary>

![Goals & Priorities](screenshots/goals.png)

Per-species configuration. Each card and each section inside it collapses independently, and that state persists.

**Breed-out stat**: the stat you breed towards 0; it is left out of the total score, and the animal name shows it only when it is above 0 (for example `VIG2`). Default VIG. For animals that cannot be ridden or do not produce resources, consider INS.

**Species goals**: what you are trying to produce, as a bloodline × phenotype target (either side can be "any"). Add as many as you like; the Breeding Suggestions panel recommends a pair for each.

**Phenotype priority** and **Bloodline priority**: star each from −3 to +3. Gold stars mark traits to breed for; red stars mark traits to breed out, so carriers get ⚠ warnings under Breeding Suggestions in Goals and the suggestions avoid pairing two carriers. Unstable defaults to ★★ because it raises the mutation chance.

**Phenotype sightings**: a radar with one axis per phenotype of the species (up to P0 to P7), on a square-root scale so rare ones stay visible. **Bloodline sightings** lists every bloodline recorded with tamed (🌿) and bred (🧬) counts. Both views include dead animals and leave out Discard.

**Breeding suggestions**, generated from your priorities: pair recommendations per goal, priority animals not in pairs, negative-trait temp breeders (bad trait but stats at least 20 % above the best clean alternative), animals to consider reserving, goals already achieved, reserve upgrades, and a diversity warning when all pairs share a bloodline on one side. Animal names are clickable, except in the reserve-upgrade rows.

**Reserve target**: use **−** and **+** to set how many reserve animals you want per species.

</details>

<details>
<summary id="lineage"><strong>🧬 Lineage</strong></summary>

![Lineage tree](screenshots/lineage.png)

Select an animal to see its family tree, 2, 3 or 4 generations deep (the depth dropdown offers those three, 3 by default). Each node shows stats, bloodline, generation and, on ancestors whose parents are both recorded, inheritance marks (the selected animal itself has none): whether each stat came from Parent 1 or Parent 2 as you entered them, improved beyond both parents or fell below them. The animal selector leaves out Dead and On Station animals.

The sidebar shows species insights: average stat gain per breeding, the best performing stat, and the average change of every stat against the parents' average.

</details>

<details>
<summary id="log"><strong>📋 Log</strong></summary>

![Log](screenshots/log.png)

A banner at the bottom of the page shows the latest activity; it stays hidden until the first log entry and again after you clear the log. The **📋 Log** tab keeps the history: animals added or edited, status changes, pair changes, breedings (🥚 Bred), deletions and imports. Accepting an optimiser suggestion is logged as a status or pair change. Entries are timestamped and colour-coded, and animal names open the viewer.

Filter by type or by text, set the maximum number of entries (default 100, minimum 10, older entries are trimmed), or clear the log.

</details>

<details>
<summary id="import-from-game"><strong>🎮 Import from game</strong></summary>

Icarus keeps every animal parked at the station in a file on your computer:

```
%LOCALAPPDATA%\Icarus\Saved\PlayerData\<SteamID>\Mounts.json
```

Under **⚙ Settings → Export & Import**, click **🎮 Import from game** and pick that file. In the Windows file dialog you can paste `%LOCALAPPDATA%\Icarus\Saved\PlayerData` into the address bar to jump straight to the folder. The tracker reads the file and shows a preview before anything is saved:

![Import preview](screenshots/import-preview.png)

- **New**: animals in the file that the tracker does not know. They get a tracker name, the in-game name as nickname, status **🛸 On Station**, and their stats, sex, bloodline, phenotype, parents and level from the game
- **Changed**: animals the tracker already has where a field differs, for example a typing error in a stat. Each field is listed with the old and the new value and can be unticked to keep the tracker's value
- **Unchanged**: animals that match exactly
- **Not in file**: animals marked as on the station in the tracker that are not in the file, because they were taken down to a world or lost. Leave them, or set their status to `?` or Dead
- **Skipped**: entries the tracker cannot use, with the reason (an unknown species such as Cat and Dog, no bloodline recorded in a record from an old game version, an unsupported save format)

How animals are recognised: an animal whose in-game name starts with its tracker ID (for example `DR12`) is that animal. Animals imported earlier are recognised by their in-game name (the nickname), as long as it is unique within the species. An entry that could not be read does not make its animal show as missing, as long as its in-game name matches the animal's nickname or ID. Importing the same file twice adds nothing, as long as nothing changed in between; a nickname or stat you changed on an animal that has no ID in its in-game name makes the next import list it as New.

Good to know:

- Only animals **parked at the station** are in the file. Animals out on a prospect are not
- The file is **only read**. The tracker never changes, writes or exports game files
- Your Steam ID and player name are in the file; the tracker skips them without decoding them and never stores them
- The file does not say which animals were tamed and which were bred; an animal with parent names in the file is marked as bred

</details>

<details>
<summary id="settings"><strong>⚙ Settings</strong></summary>

![Settings](screenshots/settings.png)

- **Export CSV** writes the herd as a spreadsheet file; **Import CSV** restores or bulk-adds animals. Importing your own export again adds nothing. Rows with an unknown species or bloodline are ignored and counted
- **Import from game**, see above
- **Share your herd** renders an image of your animals (top 10 overall, the best of each species, the best of one chosen species, active breeders only, all active animals, or a custom selection) and copies it to the clipboard, with a download button as fallback
- **Delete all data** clears the herd and the pair slots after a confirmation. Goals, pair counts, the log, sightings, ID numbering and your other settings are kept, so new animals continue from the old numbers. Export a CSV first
- Links to report a bug, request a feature or view all issues on GitHub

</details>

---

## 📚 Glossary

| Term | Meaning |
|---|---|
| **Stats** | The seven genetic values of an animal, 0 to 10 each: VIG (Vigor), FIT (Fitness), PHY (Physique), REF (Reflex), TGH (Toughness), ADP (Adaptation), INS (Instinct). These are the names the app uses in its tooltips. The save file stores them as Vitality, Endurance, Muscle, Agility, Toughness, Hardiness and Utility, in the same order. |
| **Total** | The sum of the six stats that are not the breed-out stat, out of 60. The percentage in My Herd is the total out of 60. |
| **Breed-out stat** | The one stat per species you want at 0, so it is left out of the total. The name shows it only when it is above 0. Default VIG; set per species in Goals. |
| **Bloodline** | One of the game's twelve lineages (Wild, Brave, Careful, Timid, Bold, Hardy, Stout, Ambitious, Resolute, Unstable, Savage, Alpha). Each gives fixed and growing modifiers; Unstable raises the mutation chance when breeding. |
| **Phenotype** | The coat variant: base (P0) and up to seven numbered variants per species, with rarities from the game data (base, uncommon, rare, legendary). |
| **Generation** | A manual field in the New Animal form, default 1. Set it to one more than the highest parent for bred animals; only Import from game works it out for you. |
| **Status** | What you plan to do with the animal; see the [status reference](#-status-reference). |
| **Generated name** | `DR01 F55-Bold P3 VIG2` means: Dune Raptor number 1, female, total 55, bloodline Bold, phenotype P3, breed-out stat VIG at 2. The ID (`DR01`) is how you refer to the animal as a parent. |
| **Nickname** | A display alias. Names imported from the game land here. |
| **Pair slot** | One male and one female you are breeding together. The number of slots per species is yours to set. |

---

## ❓ FAQ and troubleshooting

**There is no startup screen, or saving to a file does not work.** Firefox and Safari lack the File System Access API, so the app skips the startup screen and goes straight to browser storage. Use Chrome or Edge to save to a file. Browser storage keeps only the herd, pairs, pair counts, IDs, goals and sightings; the log, card order, widths and collapsed state reset on reload.

**I opened the app and my herd is gone.** Check that you clicked **▶ Continue with herd_data.json** and allowed access when the browser asked. If you opened the file from a different folder or a cloud-synced copy, point the app at the right file. Browser storage data disappears when site data is cleared; a CSV export is your backup.

**How do I move to another computer?** Copy `herd_data.json` and open it from the startup screen on the other machine, or export a CSV and import it there. The CSV holds animals only, not goals, stars, pair slots or the log.

**The import does not recognise my animals.** The tracker matches on its own ID at the start of the in-game name (`DR12 ...`) or on the nickname. If you named animals differently in game, they are listed as new; the preview shows "may already be in the herd as ..." when an animal with the same stats exists, so you can untick it and rename either side.

**What does "Not in file" mean?** The game file only lists animals parked at the station. An animal the tracker has as **🛸 On Station** that is not in the file was taken down to a world or is gone. The preview lets you decide per animal.

**Some animals vanished from Goals.** Breeding Suggestions skip Dead and Discard animals, while the Pairs pool skips Dead and On Station animals. The sightings charts count every animal ever recorded except Discard. Use the status pills in My Herd to see everything. If a card cannot be shown, it displays an error instead and the other cards still render; please report it on GitHub.

**An animal shows "duplicate ID" or "unknown species".** Older files can hold two animals with the same ID, and a file from another version can name a species this version lacks. For an unknown species, edit the animal and correct the species. A duplicate ID is only renumbered when you change the species while editing; otherwise editing keeps the ID.

**Can the tracker change my game saves?** No. The import uses a read-only file input, and the only file the tracker ever writes is the herd file you create or pick for it.

---

## 🐾 Status Reference

| Icon | Status | Meaning |
|---|---|---|
| ❓ | Undecided | Newly added, not yet assessed |
| ✅ | Keep | Good animal, part of the herd long-term |
| 🐣 | Breed | Active breeder |
| ⚡ | Temp Breed | Temporary breeder: wrong bloodline but used for a stat boost |
| 🔶 | Reserve | Held in reserve, not currently active |
| 🛸 | On Station | Stored on the space station (transit between maps or safe storage); hidden in My Herd by default |
| 🗑️ | Discard | Scheduled for removal |
| 🪦 | Dead/Culled | Deceased, hidden by default, kept in records |

---

## 🧬 Species Reference

All 26 species the tracker knows, with how the first animals are obtained and which fertility serum breeds them. Breeding needs the serum crafted at the Ranching Station; species without one cannot be bred and show no parent fields in the New Animal form.

| ID | Species | Category | How obtained | Breeding |
|---|---|---|---|---|
| DR | Dune Raptor | Mount | Wild juvenile | Raptor Fertility Serum |
| GR | Geothermal Raptor | Mount | Wild juvenile | Raptor Fertility Serum |
| BM | Moa | Mount | Wild juvenile | Moa Fertility Serum |
| SL | Slinker | Mount | Wild juvenile | Slinker Fertility Serum |
| BF | Buffalo | Mount | Wild juvenile | Buffalo Fertility Serum |
| AM | Arctic Moa | Mount | Wild juvenile | Moa Fertility Serum |
| DV | Draven | Mount | Wild juvenile | Not breedable |
| HR | Horse | Mount | Station | Not breedable |
| TE | Terrenus | Mount | Wild juvenile | Not breedable |
| TK | Tusker | Mount | Wild juvenile | Tusker Fertility Serum |
| UB | Ubis | Mount | Wild juvenile | Ubis Fertility Serum |
| WM | Woolly Mammoth | Mount | Wild juvenile | Not breedable |
| ZB | Zebra | Mount | Mission reward | Not breedable |
| SZ | Shaggy Zebra | Mount | Wild juvenile | Not breedable |
| GB | Gribbler | Attack Pet | Snare: Gribbler Bait (Tundra) | Gribber Fertility Serum (the game's spelling) |
| HY | Hyena | Attack Pet | Snare: Hyena Bait (Desert, Volcanic) | Not breedable |
| SK | Skulk | Attack Pet | Snare: Skulk Bait (Tundra, Arctic) | Not breedable |
| SW | Snow Wolf | Attack Pet | Snare: Wolf Bait (Arctic) | Wolf Fertility Serum |
| WB | Wild Boar | Attack Pet | Snare: Wild Boar Bait (Forest, Grassland) | Boar Fertility Serum |
| WO | Forest Wolf | Attack Pet | Snare: Wolf Bait (Forest, Grassland) | Wolf Fertility Serum |
| SC | Storca | Attack Pet | Snare: Storca Bait (Tundra, Arctic) | Not breedable |
| KW | Kiwi | Attack Pet | Snare: Kiwi Bait (Forest, Grassland, Arctic, at night) | Not breedable |
| CT | Cattle (Cow / Bull) | Utility Pet | Station | Bull Fertility Serum |
| CK | Chicken (Rooster) | Utility Pet | Station | Rooster Fertility Serum |
| SH | Sheep (Ram) | Utility Pet | Station | Ram Fertility Serum |
| PG | Pig | Utility Pet | Station | Pig Fertility Serum |

Sources: the game's own data tables, the official patch notes and the [Icarus wiki](https://icarus.wiki.gg/). Cat, Dog, Blueback and Redback are not in the tracker; the import skips them as unknown species.

---

## 💾 Alternative: Download and Run Locally

If you prefer to keep a local copy (useful for offline play or a specific version):

### Option A: download the file directly

1. Go to the [repository on GitHub](https://github.com/joakim-fjeldstad/icarus-breeding-tracker)
2. Click `index.html` in the file list
3. Click the **download icon (⬇)** in the top right of the file view
4. Save it to a permanent local folder, for example a folder in your Documents
5. Open it in Chrome or Edge

Every released version is also available under **Tags** on GitHub.

### Option B: clone with Git

```
git clone https://github.com/joakim-fjeldstad/icarus-breeding-tracker.git
```

Pull updates with `git pull` whenever a new version is released.

---

## 💬 Feedback & Bug Reports

Use the **⚙ Settings** tab inside the app for direct links to submit bug reports and feature requests on GitHub. A free GitHub account is required to post, but anyone can view existing issues.

Direct links:
- 🐛 [Report a Bug](https://github.com/joakim-fjeldstad/icarus-breeding-tracker/issues/new?labels=bug&template=bug_report.md)
- ✨ [Feature Request](https://github.com/joakim-fjeldstad/icarus-breeding-tracker/issues/new?labels=enhancement&template=feature_request.md)
- 📋 [View All Issues](https://github.com/joakim-fjeldstad/icarus-breeding-tracker/issues)

Found a security problem? Please don't post it in a public issue. Use **Report a vulnerability** on the repository's [Security tab](https://github.com/joakim-fjeldstad/icarus-breeding-tracker/security).

---

## 🤝 Contributing

Bug reports, ideas and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains how the project is built (one file, no build step), how to run the headless smoke test (`node tools/smoke.mjs`), how to refresh the screenshots in this README (`node tools/screenshots.mjs`), and what a pull request needs.

## 📄 License

GPL-3.0, see [LICENSE](LICENSE). The game, its names and its data belong to RocketWerkz; this is an unofficial fan-made tool.
