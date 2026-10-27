# Tasks

## 1. The pure store and search rules

- [x] 1.1 Write `scripts/records-store.test.js` first: empty and missing stores, validation of ids/types/size/reserved names/duplicate folders, merge of new records, per-field title/body/folder edits, folder moves, tombstones beating older content, idempotent repeated merge, unknown format refused. Run `node --test scripts/records-store.test.js` and confirm it fails because `neo-ext/lib/records-store.js` does not exist.
- [x] 1.2 Implement `neo-ext/lib/records-store.js` (normalize, validate, merge, empty, sort) exporting to `module` and `window.NeoRecordsStore` like `side-resize.js`. Re-run the test until green.
- [x] 1.3 Write `scripts/records-search.test.js` first: case-insensitive title/body matching, trimmed/whitespace-only query, all occurrence ranges, adjacent and overlapping matches, no match, plain-text only. Run `node --test scripts/records-search.test.js` and confirm it fails for the missing module.
- [x] 1.4 Implement `neo-ext/lib/records-search.js` (`test`, `ranges`, `normalizeQuery`), export to both module and window, and run both pure tests until green.

## 2. The library store in the main process

- [x] 2.1 Write `scripts/records-ipc.test.js` first against a temp library and the exported store functions: the path is always `<library>/records.json`, a valid payload round-trips, invalid/oversized payloads are refused, a corrupt file is reported and not overwritten, and a cloud placeholder refuses a write. Run it and confirm it fails on the missing module.
- [x] 2.2 Implement `neo-ext/records-main.js`: fixed `records.json` path through `libraryDir()`/`libName`, `whenLocal` async wait, malformed JSON as `unreadable`, 4 MB request limit, `.bak`, `tmp` + fsync + rename, and a write that re-reads and merges disk before going into place, returning the merged store. Register `neo-ext:records-read` and `neo-ext:records-write` from the fork's existing `init`, passing `whenLocal` and core's `writeFileDurable` through the same seam-7 call, and add the two preload methods to the existing `NeoForkNative` block. Verify with `node --test scripts/records-ipc.test.js`, `node neo-ext/check-seams.js`, and `npx oxlint neo-ext/`.
- [x] 2.3 Extend the IPC test for iCloud reads that never arrive, a disk that gained a record between read and write (the returned merged store holds both), and a write already in flight; verify no write happens over a placeholder and `.tmp` is not left behind.

## 3. The Records view in Notes

- [x] 3.1 Create `scripts/records.e2e.js` and `npm run test:records` with a throwaway library and two books. First checks: the pane shows Notes | Records on Manuscript/Notes, Notes is first, choosing Records fills the pane and keeps the bottom tab, choosing Notes restores the pane's content. Run it and record the failures.
- [x] 3.2 Inject `#neo-side-tabs` and `#neo-records-view` into `#side-pane` (no aux/notes/left-nav change); add the three script tags and check-seams names; implement the pane tab controller, `neo-records-open` CSS, Show More gate, bottom-tab observer, and window-capture Esc. Verify the tab checks, Outline/Darlings no-tab checks, and `npm run test:notes`.
- [x] 3.3 Add the list: + Record draft and Enter/Esc, title expand/collapse, plain-text description with debounced save and flush on leave, title rename, folder select, one-line rows. Verify with e2e and `node --test scripts/records-store.test.js`.
- [x] 3.4 Add the inline delete confirmation: minus, named question, Delete/Cancel/Esc, focus return, tombstone, and window-capture Esc so the book stays open. Verify with cancel, confirm, and Esc e2e.
- [x] 3.5 Add folder groups: Unsorted first, named folders, create, rename, delete-with-confirmation moving records to Unsorted, duplicate-name refusal, reserved Unsorted, counts, folder +. Verify with e2e.

## 4. Search, highlighting, and the library-wide store

- [x] 4.1 Add the search field and `records-search` ranges with CSS Highlight API paint/clear, body matches unfolding, no-match message, Esc-clears-query, and restore-on-clear. Verify with `node --test scripts/records-search.test.js` and e2e for title match, body match, `CSS.highlights`, clear, no match, and Esc.
- [x] 4.2 Wire `records-read`/`records-write`: load on open/focus, merge the write response into the page (never replace newer local edits), handle unreadable/cloud with a quiet line and Retry, and never write over a placeholder. Verify same records in two books, a merge followed by delete, corrupt file message, and unchanged bytes.
- [x] 4.3 Verify records never touch a book: with unsaved words and undo history, add/edit/move/search/delete and assert chapter HTML, save state, structural undo, and `library.json` unchanged, and no chapter mtime moved. Baseline after Records is open (core writes `book.lastPosition` on a tab change).

## 5. Backups

- [x] 5.1 Write the red backup tests first: add `copyBookDir` extra-file cases to `scripts/neo-ext-backup.test.js` (both records files land in the backup folder, a cloud placeholder is named in `_left-out-of-this-backup.txt`, a name collision is refused) and add a `backup-worker.js` case in `scripts/records-backup.test.js` (a temp library with `records.json`, `.bak`, and `.tmp` puts the first two in the zip and not the third; no records invents none). Run and confirm the failures.
- [x] 5.2 Implement seam 11 in `backup-worker.js` (`records.json` in the root allowlist), add its anchor to `neo-ext/check-seams.js` and the AGENTS seam table, add `extraFiles` to `neo-ext/lib/copy-book.js`, and pass `records.json` from `neo-ext/main.js`. Verify the backup tests, `node neo-ext/check-seams.js`, and an e2e manual Backup Book check.

## 6. Documentation, review, and release

- [x] 6.1 Add a Records section to `AGENTS.md`: injected view, `records.json`, field merge, search highlight, backup seam 11, Pocket unchanged, and the plain-text rule. Verify with `git diff -- AGENTS.md` and `node neo-ext/check-seams.js`.
- [x] 6.2 Run `npm test`, `npm run test:records`, `npm run test:notes`, `npm run lint`, `npx oxlint neo-ext/`, `node neo-ext/check-seams.js`, `npm run check:version`, and `openspec validate adr-005-records-tab`; record the results here.
- [x] 6.3 Review gate on the implemented diff: `grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, and `security-reviewer` (the diff adds IPC and a library file, so security review is required). Fix blockers, re-run the failed reviewer, and record verdicts in `review.md` and here.
- [x] 6.4 Manual dev-launch check (`NEO_TRY_DIR`): add a record, rename it, write two paragraphs, delete with confirm and cancel, make a folder, search a word in a description, switch books, relaunch, run File → Backup Book… and inspect the folder. Capture one screenshot of the Records view.
- [x] 6.5 `/opsx-sync` then archive as `2026-10-26-adr-005-records-tab`, raise the fork to `1.6.0+fork.5`, add the changelog entry, commit, merge into `fork` if present, and reinstall with `~/.local/bin/neo-reinstall`.

## Code review follow-up — GRASP/DDD

- [x] Fix the low-cohesion `records.js` god module and dead helpers before the right-pane rewrite; verify `npx oxlint neo-ext/` is clean.
- [x] Move record/folder mutations and duplicate-name/tombstone/folder-delete invariants into `neo-ext/lib/records-store.js`; verify the store unit tests cover them.
- [x] Make `records-store.merge` return an explicit failure instead of an empty store, and cover it in `records-store.test.js`.
- [x] Re-home the Records UI in `#side-pane` per the pending clarification, replacing the `#aux-*`/`#notes-nav` coupling and its e2e locators.
