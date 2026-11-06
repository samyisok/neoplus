# Proposal

## Why

The fork is built on upstream `1.6.0` (`4be59b2`) and carries 20 local commits, but
upstream has since released **1.6.1, 1.6.2 and 1.6.3** — 31 commits across 29 files
(+2050/−129) with fixes our writers need: the chapter-heading crash, snapshot
thinning that replaced unavailable history with empty text, typewriter scrolling,
soft-hyphen marks, EPUB subtitles, quotes following the writer's own language, the
portable `.exe` installer, and **File → Library Folder… that moves the books and
offers NEO Pocket's iCloud folder**. We cannot take those fixes without merging, and
we cannot merge safely without a written plan: seven files are edited on both sides.

## What Changes

- Add upstream as a **read-only remote** (`upstream` → `https://github.com/hughhowey/neo`,
  push URL disabled) and fetch its tags. Nothing is ever pushed, opened or modified
  there; the fork only streams releases from it.
- **Merge `v1.6.3` (`984a217`) into `main`** as a real merge commit, keeping the 20
  local commits and their ancestry.
- Resolve the seven files edited on both sides — `AGENTS.md`, `app.js`, `index.html`,
  `main.js`, `package.json`, `package-lock.json`, `preload.js` — by rule: **upstream's
  code wins, our seam lines and fork sections are re-applied on top**. Overlap is not
  conflict: only the hunks that touch the same lines will need a decision.
- Re-verify the 17 `NEO-EXT seam` points, then run lint, the unit suite, and every
  fork e2e suite before the build is installed.
- Bump the version's upstream half to **`1.6.3+fork.18`** on the merge, then to
  **`1.6.3+fork.19`** when this ADR is archived (the fork number follows the highest
  *archived* ADR, and `scripts/version.test.js` enforces it).
- Record what upstream now does in `AGENTS.md` where it changes behaviour the fork's
  docs describe (e.g. Brighter Interface is no longer behind Show More Features).

**Not breaking** for library data: no book, chapter, sidecar, `library.json` or
`settings.json` key changes. The one behaviour worth calling out is upstream's new
library move, which rewrites `settings.json`'s library folder through its own path.

## Capabilities

### New Capabilities

- `upstream-sync`: how the fork consumes an upstream release — read-only remote,
  merge (never rebase), seam preservation, version numbering, and the verification
  gate a merge must pass before it is installed.

### Modified Capabilities

None. No fork feature's requirements change; the merge must leave every existing
capability's behaviour as its spec states.

## Impact

- 7 files merge with conflicts, 22 more files arrive untouched from upstream
  (`locales/fr.json`, `locales/ko.json`, `pocket/*`, `styles.css`, `scripts/*`).
- New upstream tests arrive with the merge (`library-move`, `folder-probe`,
  `snapshot-thinning`, `typewriter`, `updater-portable`, `script-keys` e2e, and
  additions to `pages`/`words`/`non-breaking-marks`/`snapshots`/`simple-neo`).
- Risk concentrates in `main.js` (340 upstream lines around `chooseLibraryFolder`,
  `buildMenu`, `app.whenReady` — two of those are our seam anchors) and in
  `app.js` (248 lines, Brighter Interface moving out of the switch).
- The fork's own settings writes (`settingsBroken`, `settings.json` merge guard) sit
  next to upstream's new library-move settings path and must be checked together.
