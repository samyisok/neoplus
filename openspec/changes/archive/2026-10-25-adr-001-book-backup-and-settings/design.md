# Design

## Context

See `proposal.md` for motivation and `specs/backup/spec.md` + `specs/settings/spec.md` for behavior. Constraints that shape the approach:

- Fork policy (see `AGENTS.md`): all new code lives in `neo-ext/`; upstream files get only marked one-line seams, because every upstream merge must stay trivial.
- `main.js` owns filesystem work, `preload.js` is the only bridge (`contextIsolation: true`, no node in the renderer), `app.js` holds the UI in one classic script.
- The daily backup already exists (`dailyBackup` + `backup-worker.js`), zips the whole library, keeps 14 dated copies, and runs out-of-process so a stuck cloud file cannot freeze NEO. Its walk already ignores root entries that are not NEO's (`book-*`, `library.json*`, `_catalog.txt`) and skips `Backups/` and `Exports/` by name.
- Device-local preferences already live in `userData/settings.json` (`exportFolder`, window bounds) via `readSettings`/`writeSettings`; book- and library-level data lives in `library.json` and `book.json`.
- The native File menu is built in `main.js` `buildMenu`; the menu object is created one line before `Menu.setApplicationMenu`, so a seam placed after that build cannot add items.
- Saves are shared-nothing chains: `flushAllSaves()` starts writes but returns nothing; the promises live in `chapterChain`, `sidecarPending`, and `auxPending`. A backup that starts right after the call can read yesterday's file.
- iCloud placeholders are first-class here: `isCloudOnly`, `cloudOnlyAmong`, `requestDownload`, and `afterLocal` in `main.js` exist so nothing blocks on a file the cloud has not handed over.

## Goals / Non-Goals

**Goals:**

- One backup folder setting used by both the manual book backup and the daily library zip.
- A settings window whose sections come from data, so future groups are additive.
- Default behavior identical to today when nothing is configured.
- Merge cost measured in seam lines, not in edited core functions.

**Non-Goals:**

- Restoring from a backup inside NEO (the copy is plain files; restoring stays a file-manager job).
- Encryption, compression of manual copies, cloud upload, or a scheduler beyond the existing daily run.
- Per-book backup destinations, backup of a single chapter, or syncing the chosen path between devices.
- Any Pocket UI; the feature is desktop-only.
- Editing `backup-worker.js`: the daily walk needs no change once folders inside books are rejected.

## Decisions

### 1. Three new seams, plus one corrected existing seam

`neo-ext/main.js` registers its own IPC handlers at startup, `neo-ext/settings.js` builds the modal in the renderer, `neo-ext/lib/*.js` holds pure helpers. Upstream files gain only:

| Seam | Where | What it does |
|---|---|---|
| init | `main.js`, inside `app.whenReady().then(...)`, before `createWindow()` | hands the plugin `ipcMain`, `dialog`, `shell`, `app`, `readSettings`, `writeSettings`, `logError`, `bookDir`, `libName`, `isCloudOnly`, `cloudOnlyAmong`, `requestDownload`, and the library root |
| preload | `preload.js` | exposes `window.NeoForkNative` with the plugin's IPC calls |
| daily folder | `dailyBackup`, when `backupsDir` is computed | resolves the configured folder through the plugin |

The **existing File-menu seam is corrected**: it must sit immediately before `const menu = Menu.buildFromTemplate(simpleTemplate(template, moreState))`, not before `Menu.setApplicationMenu(menu)`, and its signature becomes `appMenu(template, { more: moreState, bookOpen: bookOpenState })` so items can be disabled with no book open and still respect Show More Features. `AGENTS.md`'s seam row is updated in this change.

Alternatives rejected: editing `main.js` handlers directly (large, conflict-prone diffs); using only the existing `window.neo` IPC (no folder copy, no folder picker, no durable settings write); a `backup-worker.js` seam (unnecessary once inner-book folders are rejected).

### 2. The backup folder is device-local

It is a filesystem path, so it belongs in `userData/settings.json` beside `exportFolder`, not in the synced `library.json`. Writes are read-merge-write through `readSettings()` + `writeSettings()` so the plugin never drops the window bounds or export folder that core wrote. An absent or corrupt file yields the default.

### 3. Manual backup is our own recursive copy, not `fs.cp`

`fs.cp` offers no per-file hook, so the copy is a small walker of our own:

- flush-and-confirm first (decision 4), then copy into `<backupFolder>/.<name>.<pid>-<rand>.partial` — unique per run, so a second request can never delete the first one's half-finished tree;
- one backup at a time: a module-level guard refuses a second request while one runs, and the renderer reports it;
- one retry per file for sync-tool locks, then the file is named in the failure/list rather than dropped silently;
- `fs.rename` into `<name>` at the end, so a crash never leaves something that looks like a finished backup and "never overwrite" is enforced by the rename failing, with a numeric suffix appended until it succeeds;
- files copied by streaming, not read whole into memory, because a book folder can hold large painted covers.

Cloud-only files: detect with the core helpers before reading, `requestDownload` them, wait a bounded time per file, copy what is local, and write `_left-out-of-this-backup.txt` naming the rest. This mirrors `backup-worker.js` instead of inventing a second policy.

The destination is validated against the source: never the book's own folder, never inside a `book-*` folder, never deeper than the library root. Symlinks inside a book are not followed — they are named as left out — so a library received from someone else cannot pull outside files into a copy. `snapshots/` is included; it is part of the book and dropping history silently is worse than a larger copy.

Alternatives rejected: `fs.cp` (no retry hook), zipping (the user chose a plain folder), copying file-by-file with a manifest (the OS can list a folder; a manifest adds a format to maintain).

### 4. Flush is confirmed, not assumed

`neo-ext/api.js` exposes `flushAndConfirm()`: call `flushAllSaves()`, await the chapter write chains, then wait, bounded, until every open chapter satisfies `chapterHTML[c] === savedHTML[c]` and `sidecarPending`/`auxPending` are empty. If the wait times out, the backup aborts with a message rather than copying a stale book. The book's own meta write is not awaited by core; a title renamed a second before a backup can lag in `book.json` (accepted, noted under risks).

Those bindings are core internals, so the wait lives in the one adapter file (`api.js`), not in the backup code. A future upstream change to the save pipeline breaks one guarded function with a clear failure.

Alternative rejected: reading `savedHTML` alone (it is updated before the write completes), or sleeping a fixed time (a coin flip on a slow disk or a large chapter).

### 5. The settings window is a section registry

`neo-ext/settings.js` exposes `registerGroup({ id, title, show, controls })`, where a control is a descriptor (`text` + `choose`, `checkbox`, `select`, `note`). The window renders groups in registration order with a rule between them and none at the end, collects values into one object, and hands it to one save callback.

- The first group is Backup: a path field, **Choose…**, **Use Default**, and an inline error line.
- `show` lets a group hide in Simple NEO when its feature is hidden.
- Adding a future group changes no window code: register the group and give it a save handler.
- The window reuses NEO's modal CSS and is built in the renderer, so `index.html` needs no markup.
- **Choose…** and folder validation are main-process calls (native dialog + create + probe write), because the renderer has no filesystem access.
- Opening the window stores the caret/selection and restores focus on close, so Cancel returns the writer to the same spot.

Alternatives rejected: a settings tab on the paper (wrong place for machine settings), one-off prompt dialogs like Email Settings (no room for groups), editing `index.html` for markup (extra merge surface).

### 6. The daily backup keeps its worker and only changes destination

`dailyBackup` asks the plugin for the resolved folder and passes the same `target`, `keep`, and `fileLimitMs` to the unchanged worker. The plugin revalidates the stored path on every run and refuses (falling back to the default with a logged line) if it now points inside a book. Rotation and the one-per-day short-circuit stay where they are.

Because the worker looks only at NEO's own root entries, a backup folder at the library root is already outside the archive; a folder inside a book is refused when saved. A configured folder that cannot be created makes the run skip and log — NEO never silently writes somewhere else, because a writer who chose a drive expects the backup there.

### 7. Failure surfaces differ by caller

The manual action is interactive: a plugin toast that carries the path and a **Reveal** action, built in `neo-ext` because NEO's `#hint` toast is text-only. Reveal is scoped to the resolved backup folder (`shell.showItemInFolder` only, never `openPath`, UNC refused), so a compromised renderer cannot open arbitrary paths. Settings validates inline and refuses to save an unusable path; a check never creates a folder, only a save does. The daily run is silent by design (it must never interrupt writing), so it only logs and retries next run.

The Settings window leaves focus return to core's `dialogify` observer: it deliberately does not set `role="dialog"` itself, so the existing modal machinery records the writing surface and gives focus back on removal.

### 8. The renderer never names a *source* path

Every plugin IPC takes a book id, never a source path. `neo-ext/main.js` resolves the folder through the core `bookDir()`/`libName()` it was handed, so the existing traversal guard is reused rather than re-implemented. Destination paths are the one exception, because the writer types or picks one: they must be absolute, cannot land inside a book or deeper than the library root, are validated by real path before use, and Reveal only accepts a folder inside the resolved backup folder.

## Risks / Trade-offs

- **Copying while iCloud/Syncthing rewrites the folder** → flush-and-confirm first, bounded per-file wait, retry once, then name the file in `_left-out-of-this-backup.txt`; the copy is never silently incomplete.
- **Backup folder inside the library** (default) → worker's root filter already keeps it out, and inner-book folders are refused, so no recursion and no zips-of-zips.
- **A second `settings.json` writer** (window bounds, export folder) → read-merge-write under the same durable write helper; saves are rare and small.
- **Three new seams drift on an upstream merge** → `check-seams.js` asserts every anchor, and the AGENTS table is corrected in this change.
- **`snapshots/` makes copies large** → accepted for fidelity; the path is shown after the copy so the writer can see where the space went.
- **Title-derived folder names on Windows** (reserved characters, trailing dots) → slug sanitizer strips them and falls back to the book id.
- **A timed-out flush leaves the writer waiting** → the timeout is short, the message says the book could not be settled, and nothing is copied (no half backup).
- **`book.json` can lag a rename** → accepted: the copy is still complete; only the folder name may use the old title (or the id).
- **Rotation could delete another copy of NEO's zips in a shared folder** → accepted for now; the worker's `neo-backup-*.zip` filter is unchanged, and the folder is the one the writer chose.
- **A check runs `stat` synchronously per placeholder** → the cloud budget is one per copy, not per file, so the main process is held at most a few seconds.

## Migration Plan

No data migration: with nothing configured, every path resolves exactly as today. The new `backupFolder` key is ignored by older builds, so downgrading is safe. Rollback is deleting `neo-ext/` and reverting the three seam lines plus the menu-seam correction; existing backups remain ordinary folders.

## Open Questions

None that change specs, approach, or tasks. Label wording and the exact position of the two File items are settled during implementation against NEO's existing menu order.
