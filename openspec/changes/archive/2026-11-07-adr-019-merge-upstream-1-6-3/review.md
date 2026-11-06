# Review — adr-019 merge upstream 1.6.3

## Merge shape

Merged `v1.6.3` (`984a217`) into `main` (`ca7f68a`) with a merge commit. Upstream's
31 commits arrived; only `package.json` and `package-lock.json` conflicted, both on the
version line. The five upstream code files auto-merged, and `node neo-ext/check-seams.js`
passed before any manual work — the 17 seams sit in regions upstream did not touch.

**Fork footprint inside upstream files** (merged tree vs `v1.6.3`): 98 lines across
`app.js` (6 seams), `main.js` (4 seams), `preload.js` (the bridge block), `index.html`
(the script list), `backup-worker.js` (2 seams). Everything else the fork adds lives in
`neo-ext/`, `scripts/`, `openspec/` and the fork sections of `AGENTS.md`. No upstream
function carries fork behaviour beyond a seam call.

## GRASP

Scope: the fork delta in upstream files. Files changed: 5 code files (+98/−6).

- No Information Expert or Creator violation: each seam hands one decision to the module
  that owns it (`NeoExt.uiZoom`, `uiText`, `appMenu`, `contextMenu`, `backupDir`, `init`).
- Indirection is correct: four main-process seams funnel through one `neo-ext/main.js`;
  the renderer reaches the fork through one global, guarded at every call.
- Controller: menu and context-menu policy stays in `neo-ext/main.js`, not in upstream's
  `buildMenu`/`contextmenu`. Accepted advisory: the preload bridge is a 36-method object
  — one transport surface with one purpose, and a sandboxed preload cannot split it.

## DDD

- Ubiquitous language holds: no fork domain term (`record`, `inventory`, `grammar`) leaks
  into upstream functions; the seams speak in `NeoExt.*`.
- No persistence or transport knowledge crosses into upstream code: `backupDir` takes a
  path, `init` receives the core's own helpers.
- God files (`app.js`, `main.js`) are upstream's and are not enlarged by the fork beyond
  one line per seam.

## ts-cop

1 HIGH, 4 MEDIUM, 2 LOW — all fixed in the merge rather than deferred:

- **HIGH** `app.js` seam 12 replaced upstream's `uiZoom` line with a three-line
  conditional, so the seam check could not see a mangled `snapZoom` fallback. Collapsed
  to the single documented line; `check-seams.js` now asserts the whole line.
- **HIGH** `backup-worker.js` carried two fork edits (the `records.json` allowlist and the
  `lstat` symlink skip) with no `NEO-EXT seam` marker. Both marked; `check-seams.js`
  asserts the marker and the symlink guard; `AGENTS.md` row 11 names both.
- **MEDIUM** the seam check's ordering test returned green when its anchor vanished. It
  now fails with "upstream moved … re-place the seam".
- **MEDIUM** `contextMenu` and `appMenu` seams were unguarded: a failed fork load would
  take Cut/Copy/Paste or the whole menu bar with it. Both now `try/catch` + `logError`,
  like the init seam.
- **MEDIUM** `index.html` loaded `boot.js` mid-list while the file said "loaded last".
  Moving it last broke `test:rephrase` (the feature modules need its wiring first), so the
  comment was corrected instead and `check-seams.js` now asserts boot after
  `settings.js`/`interface-size.js` and before the feature modules.
- **MEDIUM** `grammar-settings.js` was loaded but not asserted. Added.
- **LOW** the AGENTS seam table's row 1 listed scripts by hand and was stale; it now points
  at the check-seams list.
- **LOW** the init seam logged with the same `'neo-ext'` prefix as routine fork logs;
  it now logs `'neo-ext init'`.

## Verification

| Gate | Result |
|---|---|
| `node neo-ext/check-seams.js` | pass (17 seams, order checked) |
| `npm test` | 808/808 |
| fork e2e | grammar 33, rephrase 15, history 8, records 14, simple 14, interface-size 11, sidepane 20, inventory 30 |
| upstream e2e | script-keys 2, words 24, tags 12 |
| `test:pages` | 10/14 — the same 4 fail on a clean `v1.6.3` worktree (window-size dependent, upstream's own), not a merge regression |
| lint | no new errors in fork files; upstream's 28 remain in `app.js`/`main.js` |

## Accepted advisories

- Upstream's new library move reads and rewrites `settings.json` itself; it preserves
  `rephrase`/`grammar` and uses `writeFileDurable`, but a *corrupt* settings file is
  read as `{}` by core, so that path can still lose keys. Pre-existing upstream
  behaviour, not introduced here; the fork's own saves keep their guard.
- Moving `boot.js` later would tidy the script list but breaks the module wiring; the
  load order is now documented and asserted instead.
