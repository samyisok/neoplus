# Tasks

## 1. The log's rules, red first

- [x] 1.1 Write `scripts/history-log.test.js`: an empty store, an entry normalized to its allowed fields, unknown keys and wrong types dropped, a dropped invalid entry never discarding its neighbours, the 5,000-character side cap with its shortened mark, the label and chapter-title caps, the 10,000-entry cap, `append`, a union merge of two stores by `id`, newest-first order with a stable tie on equal time, and `sizeOf` refusing a store past 4 MB. Run `node --test scripts/history-log.test.js` and confirm it fails on the missing module.
- [x] 1.2 Write `neo-ext/lib/history-log.js` to green: `empty`, `normalize`, `append`, `merge`, `sorted`, `sizeOf`, and the limit constants, pure and with no DOM or filesystem.
- [x] 1.3 Re-run the test; add the truncation-mark case if the first pass missed it.

## 2. The book's file and its bridge

- [x] 2.1 Write `scripts/history-ipc.test.js` against `neo-ext/history-main.js` with a temporary book folder: a missing file reads as an empty history; the handler takes a book id and refuses slashes, `..`, and empty ids; a write stamps `id` and `at`, keeps both devices' entries, and leaves a `.bak`; an unreadable main file is shown from `.bak` and refuses a write; a cloud placeholder answers `cloud`; an oversized store answers `large` and leaves the file untouched. Confirm the test fails before the module exists.
- [x] 2.2 Write `neo-ext/history-main.js`, register it in the `init` of `neo-ext/main.js` beside Inventory, and expose `historyRead(bookId)` and `historyAdd(bookId, entry)` on the `NeoForkNative` bridge in `preload.js`. Re-run to green.
- [x] 2.3 Add the new scripts to `neo-ext/check-seams.js`'s `index.html` list and run `node neo-ext/check-seams.js`; extend `scripts/neo-ext-main.test.js` with the two handler names.

## 3. The pane view

- [x] 3.1 Extend `scripts/api.test.js` with `chapterSnapshot`: the current chapter's 1-based number and id, the writer's own title, an empty title when the chapter has none, 0 when the current chapter is not in the order, and an empty id with number 0 when no chapter is open. Confirm it fails before the helper exists.
- [x] 3.2 Write `scripts/history-record.test.js`: no book, Show More Features off, a missing bridge, an empty or unchanged side, and an unknown tool each record nothing; a chapter replacement carries the snapshot's number, id, and title; a replacement outside a chapter carries no chapter number; a switch to another book mid-write never shows book A's store under book B; a refused write leaves the view's status line saying so without a toast and `record` does not reject. Confirm it fails first.
- [x] 3.3 Write `scripts/history-view.test.js` (the vm-slice style of the pane tests): History registers as the fourth tab after Inventory; it is hidden with Show More Features off; it shows the no-book and nothing-recorded states; the empty state says replacements are recorded here and cannot be restored; it never shows one book's rows while another is loading; rows render newest first as replaced text then replacement, with the date formatted from the stored `at` and the chapter number; an entry with no chapter shows no number; a shortened side says so; entry text never becomes markup; a recording while the tab is open adds a row; no click on the view calls a write.
- [x] 3.4 Write `neo-ext/history-record.js` and `neo-ext/history.js`: the recorder (guard, snapshot inputs, `NeoHistory.record`, book-switch guard) and the read-only view with a one-line note that entries are a record and cannot be restored (Snapshots is where words come back), its loading, empty, and failure states, and `NeoHistoryView.refresh`; add `chapterSnapshot` to `neo-ext/api.js`. Add both new scripts to `index.html` after `neo-ext/rephrase.js` and their rules to `neo-ext/neo-ext.css`. Re-run to green.

## 4. Recording from each tool, red first

- [x] 4.1 Extend `scripts/thesaurus-menu.test.js` (its `onPick` case already drives `replace`) with recording: a successful replacement records the clicked word and the inserted word after capitalisation and apostrophe handling; a moved word, a failed insert, and a closed window record nothing; a replacement in `#aux-editor` or `.fn-text` records no chapter number; nothing is recorded with Show More Features off.
- [x] 4.2 Call `NeoHistory.record` from `replace` in `neo-ext/thesaurus.js` after `inserted` is true, passing the editor kind. Re-run to green.
- [x] 4.3 Extend `scripts/rephrase.e2e.js` (its card-click case already replaces a selection) with recording: choosing a card records the selected text, the rewrite, the profile label, the time, and the current chapter's number; a moved selection, a failed request, and a closed window record nothing; undo after the replacement leaves the entry.
- [x] 4.4 Call `NeoHistory.record` from `choose`/`replace` in `neo-ext/rephrase.js` with the profile label. Re-run to green.

## 5. End to end, gates, and the record

- [x] 5.1 Write `scripts/history.e2e.js` and add `test:history` to `package.json`: a throwaway library, one thesaurus replacement and one rephrase replacement against a loopback stub server like `scripts/rephrase.e2e.js` (never the writer's local model), a relaunch that still shows both with their chapter numbers, a second book with its own history, a notes-page replacement with no chapter number, and Show More Features off hiding the tab and recording nothing.
- [x] 5.2 Run `npm run lint && npm test`, `node --test scripts/api.test.js scripts/history-log.test.js scripts/history-ipc.test.js scripts/history-record.test.js scripts/history-view.test.js`, `npm run test:history`, and `openspec validate adr-014-history-tab --strict`. Fix what fails before moving on.
- [x] 5.3 Run the review gate on the implemented diff — `grasp-verify`, `ddd-verify`, `ts-cop`, the `code-reviewer` agent, and (IPC, file path) the `security-reviewer` agent — and record the verdicts in this file.
- [x] 5.4 Add the History section to `AGENTS.md` and the entry to `CHANGELOG.md` keyed by the archive name.
- [x] 5.5 Archive the change with `/opsx-sync` then `/opsx-archive`, merge into `fork`, raise the version to `1.6.0+fork.14`, run `npm run check:version`, and run `~/.local/bin/neo-reinstall`; then check by hand that the fourth tab lists a thesaurus replacement and a rephrase replacement, in order, with dates and chapter numbers, and that opening the book again still shows them.

## 6. Review verdicts

- `code-reviewer`: one blocker (a record made while the pane was hidden left the view marked loaded, so reopening showed stale rows) fixed by marking the view stale in `refresh`; should-fixes fixed — the Rephrase profile label now shows in the where-line, an unreadable main file is never overwritten (the write answers `unreadable`), the Simple NEO e2e now attempts a real record while off, and a concurrent-recording test covers the write chain. Advisories applied: a quiet-read failure no longer leaves the view loaded, a record notice is dropped when the book changes, a shortened side says which side, and a remote device's future timestamp is no longer clamped on write. Left as advisory by decision: the view renders every entry (capped at 10,000 by the file) rather than paginating, because the spec says entries are listed and a display cap would need a spec change.
- `security-reviewer`: no blockers, no should-fixes. Advisories applied: `lstat` + `isFile` refuses a symlinked history file; write failures log `err.code`, never a library path or the text; ids are restricted to `[A-Za-z0-9._:-]`. Left as advisory: no pagination (above), and the stored excerpts also live in `.bak` and the daily zip, which is the backup promise.
- `grasp-verify` / `ddd-verify` (planning pass, repeated on the implemented diff): the recorder, the file, and the view keep their three responsibilities; the chapter snapshot stays in `api.js`; the tool specs own their recording triggers while History owns storage, ordering, and display. No new finding.
- `npm run lint` still fails on pre-existing upstream `app.js` and `scripts/footnotes.e2e.js` findings (confirmed on `HEAD`); every changed file lints clean (`npx oxlint neo-ext preload.js …`).

## 7. Follow-up review (post-archive)

A second review of the final diff found no blocker and six should-fixes; all were applied and re-tested.

- `.bak` writes: the destination is unlinked before the copy, so a planted `neo-ext-history.json.bak` symlink cannot be followed out of the library. The same defect in `neo-ext/inventory-main.js` was fixed with it, with a test in `scripts/inventory-ipc.test.js`.
- `.bak` reads: `lstat` + `isFile`, so a link or FIFO cannot stall the write chain.
- A recovered read now says the history could not be read and that new replacements are not being recorded; a store the reader would refuse shows that error instead of an empty history, and a failed read no longer claims to be "Reading…".
- History strings (21) added to `neo-ext/locales/en.json`.
- The recorder logs a known reason or `write failed`, never a rejected invoke's message.
- The Thesaurus records no label (the view names the tool from its slug), so a language change cannot leave a stale word.
- Timestamps cap at the last millisecond a `Date` can show, not `MAX_SAFE_INTEGER`.
- Tests strengthened: no read while the pane is hidden (with read counts), a seeded second book instead of an absent file, undo-after-record for the Thesaurus, recovered/invalid-store cases, and log-reason assertions.

Result: `npm test` 630, `test:history` 8, `test:inventory` 30, `test:rephrase` 15; changed files lint clean.
