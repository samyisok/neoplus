# Proposal

## Why

NEO already zips the whole library into `<library>/Backups` once a day, but that copy lives inside the library: lose the library folder, or open it on a machine where it is half synced, and the backups go with it. A writer also has no way to take a copy of the one book being written to a folder they choose (an external disk, a synced folder, a second drive), and no place to point backups somewhere other than the library.

## What Changes

- **File → Backup Book…** copies the open book's folder to the backup folder as a plain folder named `<book-slug>-YYYY-MM-DD-HHMMSS`, after pending saves are written and confirmed. It refuses when no book is open, never overwrites an existing folder, never copies a book into itself, and reports where the copy went (with a Reveal action). Files still only in iCloud are named and left out rather than waited on, the way the daily backup already treats them.
- **File → Settings…** opens a modal of grouped settings, separated by horizontal rules. The first group, **Backup**, shows the backup folder (with its default), offers **Choose…** and **Use Default**, and saves with **Save** / discards with **Cancel**. The layout is a section registry, so later groups (Editor, Spellcheck, Export, …) are added as data without redesigning the window.
- The configured folder also becomes the destination of the existing automatic daily backup; when unset, both manual and daily backups keep using `<library>/Backups`.
- The folder is stored in the per-device `settings.json` (a filesystem path belongs to a machine), not in `library.json`.
- Both items stay in Simple NEO: a writer must not have to turn on extra features to keep a copy of a book.
- Every fork feature stays in `neo-ext/`, wired through the small marked seams the fork already documents.

## Capabilities

### New Capabilities
- `backup`: manual per-book backup, where backups are written, and how the daily backup chooses its folder.
- `settings`: the Settings window, its grouped layout, and how a setting is saved.

### Modified Capabilities
<!-- None: the project has no main specs yet. -->

## Impact

- **New files:** `neo-ext/main.js` (backup copy, folder picking, IPC), `neo-ext/settings.js` (modal, section registry), `neo-ext/locales/*.json`, tests for the pure helpers.
- **Seams (marked `NEO-EXT seam`):** three new ones — an init hook in `main.js`, a fork bridge in `preload.js`, and the daily backup's destination in `dailyBackup`. The existing File-menu seam is corrected (it currently sits after the menu is built) and gains the open-book state. `backup-worker.js` is left untouched: its walk already excludes root-level non-NEO folders.
- **Data:** `userData/settings.json` gains `backupFolder` (string, absolute path). No change to `library.json`, book folders, chapter HTML, snapshots, or Pocket.
- **Failure behavior:** a missing, unwritable, or self-referential folder is reported in Settings and skipped by the daily backup (logged, retried next run), never silently replaced. A file locked by a sync tool is retried once, then named instead of silently omitted.
