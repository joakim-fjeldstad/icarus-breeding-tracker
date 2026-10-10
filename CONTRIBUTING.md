# Contributing to Icarus Breeding Tracker

Thanks for helping. This file explains how the project is built and what a pull request needs.

## Principles

- **One file, no build.** The whole app is `index.html`: HTML, CSS and JavaScript with no framework, no dependencies and no build step. It must keep working when opened straight from disk and from GitHub Pages.
- **Player data stays with the player.** Herd data lives in the player's own `herd_data.json` (via the File System Access API) or in browser storage. No telemetry, no accounts, no requests to other servers.
- **Game files are read, never written.** A feature that uses Icarus save files only reads a file the player picks. The tracker is a planning tool, not a save editor.
- **Game facts need a source.** Species, phenotypes, serums and baits are checked against the game's own data, the official patch notes or the [Icarus wiki](https://icarus.wiki.gg/), and the source is named in the issue or pull request.

## Issues

- **Bugs:** include the version shown in the app header, your browser, the steps to reproduce, and what you expected. A screenshot helps.
- **Ideas:** describe the problem you want solved before the solution.
- **Security problems:** do not post details in a public issue. Use **Report a vulnerability** on the repository's **Security** tab.

## Working on the code

- Open `index.html` in Chrome or Edge. File storage needs a Chromium browser; other browsers fall back to browser storage.
- Follow the existing style: plain functions, `const` and `let`, and comments where the reason is not obvious.
- **Text from data into the page:** use `$h()` for text inside HTML and `$esc()` for values inside inline handlers, or build elements with `textContent`. Never put loaded data into `innerHTML` unescaped.
- **Loaded data is untrusted.** A herd file or CSV can come from someone else. Check species, stats, bloodlines and phenotypes against the known lists before using them.
- **Changing the save format:** bump `DATA_VERSION` and add a migration step in `migrateMemory()`. Files from older versions must keep loading.

### Species data

Each species is one entry in `SPECIES_DATA` in `index.html`:

| Field | Meaning |
|---|---|
| `category` | `'Mount'`, `'Attack Pet'` or `'Utility Pet'` |
| `short` | Two-letter code used in animal names; must be unique |
| `color` | Colour of the species dot; keep it clearly different from the other species |
| `wiki` | Link to the species page on the Icarus wiki |
| `defaultPairs` | Number of pair slots a new herd starts with |
| `breedable`, `serum` | `true` and the in-game serum name if a fertility serum exists. Set `breedable: false` explicitly otherwise, because a missing flag counts as breedable |
| `obtain` | How the first animals are obtained: `'juvenile'`, `'snare'`, `'station'` or `'mission'` |
| `bait`, `baitBiomes`, `baitNote` | Snare Trap bait and where it works (`obtain: 'snare'` only) |
| `phenotypes` | `{label, weight}` list; index 0 is the base phenotype; weights follow the game data |

A new species also needs an `<option>` in the New Animal form, an icon in `_SP_ICONS` (keyed by the `short` code), and a row in the README species table.

## Tests

`tools/smoke.mjs` is a headless browser test that drives the app through the Chrome DevTools protocol. It needs no packages.

- **Requirements:** Node.js 22 or newer, and Chrome, Chromium or Edge.
- **Run it:** `node tools/smoke.mjs` tests `index.html` in the repository root. Pass a path to test another copy.
- **Browser not found:** set `CHROME_PATH` to the browser executable.
- **Output:** one PASS or FAIL line per check, then a summary. The exit code is 1 if any check fails.
- **CI:** GitHub Actions runs the test on every pull request and on every push to `main`.

New features and bug fixes should add a check. For a bug fix, the check should fail on the version before the fix.

## Pull requests

- One topic per pull request, branched from `main`.
- Describe what changed, why, and how you tested it, and link the issue with "Refs #n". Issues are closed once the fix is released.
- Every pull request gets a code review and a security review before it is merged.

## Commit messages

A title line, a blank line, then a short list of changes:

```
v0.30 – New species, breeding and taming info

- Add Shaggy Zebra and Kiwi
- Mark Gribbler and Wild Boar as breedable
```

- A release commit starts its title with the version: `v0.X – Short title`. Other commits describe the change.
- One change per line, starting with `-`, with no full stop at the end.

## Versions

- **Format:** `v0.X – Short title`.
- **New number** (v0.31) when players get new functionality. **Letter suffix** (v0.30b, v0.30c) for fixes to existing behaviour.
- **In the same pull request:** bump `APP_VERSION` in `index.html` and the version badge at the top of `README.md`, and add a `CHANGELOG.md` entry at the top with the version, title, date and changes.
- **README:** update it when a feature changes how a tab or a core workflow works, and at least every five versions.

## Releases (maintainer)

After a release pull request is merged, tag the merge commit on `main` with the version and push the tag:

```
git tag -s v0.30 -m "v0.30 – New species, breeding and taming info" <merge commit>
git push origin v0.30
```

Tags are signed. Every released version since v0.2 that has its own commit is tagged, and GitHub offers each one as a download under **Tags**. GitHub Pages publishes `main` automatically.

Pinned GitHub Actions are kept up to date by Dependabot. It only proposes a release once it has been public for at least 7 days.

## License

The project is licensed under GPL-3.0 (see [LICENSE](LICENSE)). Contributions are accepted under the same licence.
