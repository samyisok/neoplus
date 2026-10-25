# Tasks

## 1. Fork plumbing

- [x] 1.1 Create the `neo-ext/` skeleton (`boot.js`, `main.js`, `settings.js`, `api.js`, `lib/`, `locales/en.json`, `check-seams.js`, `neo-ext.css`) and verify every file parses with `node --check` and NEO still starts (`npm start`) with the plugin doing nothing
- [x] 1.2 Add the three new seams (init inside `app.whenReady`, fork bridge in `preload.js`, folder resolution in `dailyBackup`) and move the existing File-menu seam to immediately before `Menu.buildFromTemplate(simpleTemplate(template, moreState))`, with signature `appMenu(template, { more, bookOpen })`; verify `grep -rn "NEO-EXT seam" main.js preload.js` lists them, `git diff` shows only seam lines, and `npm start` still opens a window
- [x] 1.3 Extend `neo-ext/check-seams.js` to assert every seam anchor, old and new, and verify it exits non-zero after temporarily renaming one anchor and zero when restored
- [x] 1.4 Correct the File-menu row in the `AGENTS.md` fork-strategy table (placement and `{ more, bookOpen }` signature) and add the three new seam rows; verify each anchor named there exists in the source

## 2. Pure helpers

- [x] 2.1 Implement backup naming in `neo-ext/lib/backup-name.js` (title/id slug, Windows-reserved characters, `YYYY-MM-DD-HHMMSS`, numeric suffix on collision) and verify `scripts/neo-ext-backup.test.js` covers an empty title, reserved characters, a trailing dot, and a taken name
- [x] 2.2 Implement folder resolution in `neo-ext/lib/backup-dir.js` (configured path, else `<library>/Backups`, real-path comparison for "inside a book folder", parent creation) and verify tests cover default, absolute override, folder at library root, folder inside a `book-*` folder, and a symlinked path that resolves inside one
- [x] 2.3 Implement the settings merge helper in `neo-ext/lib/settings-merge.js` (read, patch one key, keep foreign keys, tolerate missing/corrupt file) and verify tests cover a corrupt file, a missing file, and an unrelated key surviving a save

## 3. Main-process backup

- [x] 3.1 Wire the init seam so `neo-ext/main.js` receives `ipcMain`, `dialog`, `shell`, `app`, `readSettings`, `writeSettings`, `logError`, `bookDir`, `libName`, `isCloudOnly`, `cloudOnlyAmong`, `requestDownload`, and the library root, and verify by observing one initialization line in `neo-errors.log` (or devtools) per launch and none on a second window
- [x] 3.2 Register the plugin IPC channels (`backup-book`, `pick-backup-folder`, `check-backup-folder`, `get-backup-settings`, `save-backup-settings`, `reveal-backup`), resolving every book through the injected `bookDir`/`libName`, and verify a malformed id (`..`, `a/b`, empty, non-string) is rejected with a value, not an exception across the bridge
- [x] 3.3 Implement the recursive copy (stream files, one retry per locked file, `.partial` directory, rename into place, numeric suffix on collision, cleanup on abort) and verify with a fixture book folder in a temp library: normal copy, same-second collision, a file locked for the first attempt, and a read-only destination
- [x] 3.4 Implement cloud-only handling (detect, `requestDownload`, bounded per-file wait, copy the rest, write `_left-out-of-this-backup.txt`) and verify with a sparse placeholder fixture that the copy finishes, names the file, and the result reports an incomplete copy
- [x] 3.5 Implement folder validation (create parents, probe write, refuse the source book and any `book-*` folder) and verify read-only, missing-parent, source-equals-destination, and inside-book cases each return their own message and create nothing

## 4. Bridge and boot

- [x] 4.1 Expose `window.NeoForkNative` through the preload seam and verify in the running app that it exists, `window.neo` keeps exactly its upstream keys, and every plugin method returns a promise
- [x] 4.2 Wire `neo-ext/boot.js` to open the window on the plugin's menu message and verify the app starts with no console errors, the shelf unchanged, and the plugin idle until asked
- [x] 4.3 Implement `flushAndConfirm()` in `neo-ext/api.js` (flush, then wait for chapter/sidecar/notes quiescence with a short timeout, failure returns false) and verify by typing into a chapter and requesting a backup immediately: the copy contains the typed text, and a forced timeout aborts instead of copying

## 5. Settings window

- [x] 5.1 Build the modal shell and the section registry (`registerGroup`, `show`, ordered rendering, one rule between groups, none trailing) and verify by opening the window with Backup alone and then with a temporary second group: order and separators are correct in both
- [x] 5.2 Add the Backup group (path shown, default labelled, Choose…, Use Default, inline error) and verify Save writes `backupFolder` into `userData/settings.json`, preserves `exportFolder` and window bounds, Cancel leaves the file untouched, and Use Default clears the key
- [x] 5.3 Verify Escape cancels, a second Settings click focuses instead of stacking, opening over another modal is ignored, and closing returns focus, caret, and scroll to the chapter
- [x] 5.4 Add plugin strings to `neo-ext/locales/en.json` through the plugin's own translator and verify a missing key falls back to the English source and a temporary `window.NeoExtLocale` dictionary renders its translation

## 6. Menu and manual backup flow

- [x] 6.1 Add File → Backup Book… and File → Settings… through the corrected menu seam, with Backup disabled when no book is open and both visible in Simple NEO, and verify the native menu shows both, the disabled state follows opening/closing a book, and Show More Features off still lists them
- [x] 6.2 Make the manual action call `flushAndConfirm()`, run the copy, and report success with the path and a Reveal action in the plugin toast, and verify on a scratch library that the copy matches the latest typed text, Reveal opens the file manager at the folder, and the copy opens without NEO
- [x] 6.3 Verify failure reporting: read-only destination, vanished destination, and a refused inside-book destination each show a distinct message and leave no partial folder behind

## 7. Daily backup destination

- [x] 7.1 Resolve the daily zip's folder through the plugin and verify the next run writes `neo-backup-YYYY-MM-DD.zip` to the configured folder, the library's `Backups` folder stays unused, and a same-day repeat short-circuits
- [x] 7.2 Verify the worker needs no change: with the backup folder at the library root, the produced zip contains only `book-*`, `library.json*`, and `_catalog.txt` entries, and Settings refuses a folder inside a `book-*` folder
- [x] 7.3 Verify an unavailable configured folder makes the daily run write nothing, log one line in `neo-errors.log`, and retry the same path next run

## 8. Verification

- [x] 8.1 Run `npm run lint`, `npm test`, and the new `scripts/neo-ext-backup.test.js` and verify all pass
- [x] 8.2 Verify rotation safety: after manual backups exist in the folder, a simulated 14-day rotation removes only `neo-backup-*.zip` files
- [x] 8.3 Verify the settings window and both actions in the installed build after `~/.local/bin/neo-reinstall`, including a backup to a folder outside the library

## Review verdicts (code + security gate, 2026-10-25)

Fixed after review: iCloud-safe `book.json` read (bounded wait, id fallback); unique `.partial` folder plus one-backup-at-a-time guard; File items placed above Quit/Close; focus returned through core `dialogify` (no `role="dialog"` of our own); registry now renders text/checkbox/select and saves through each group; `book-*` names get a `backup-` prefix; cloud wait is one budget per copy; a settings read failure is refused instead of writing `{}`; Reveal scoped to the resolved backup folder (no `openPath`, UNC refused); a check no longer creates folders; destination depth limited to the library root; symlinks named, never followed; seam checker asserts menu-seam order; settings toast/modal built without HTML interpolation of values.

Accepted advisories: rotation still deletes any `neo-backup-*.zip` in a shared folder (worker unchanged); copied files are not fsynced; `book.json` may lag a just-made rename; destination TOCTOU on a shared folder; `pick-backup-folder` honours the renderer's starting path.

## GRASP follow-ups

- [ ] Split `neo-ext/main.js` into ipc/menu/use-case modules and verify `node neo-ext/check-seams.js`, `npm run lint`, and the main tests still pass
- [ ] Read book metadata through an injected core accessor instead of parsing `book.json` in the feature, and verify the backup name test still covers title and id
- [ ] Route renderer access to `book`/`t` through `neo-ext/api.js`, and verify the settings modal and toast still render after the change
- [ ] Replace the settings control-type `if` chain with a renderer registry and verify a temporary checkbox/select/text group still renders and saves

## DDD follow-ups

- [ ] Move "one backup at a time" and destination admissibility policy into `neo-ext/lib/`, leaving the IPC handler as orchestration, and verify the concurrency and destination tests still pass
- [ ] Rename `backupDir`/`checkFolder`/`probe`/`backupBookNow` toward the spec's language (daily destination, usable destination) and verify no caller is left behind
- [ ] Re-read `openspec/changes/adr-001-book-backup-and-settings/review.md` before syncing and confirm each finding is either fixed or recorded as accepted
