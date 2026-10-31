# Proposal

## Why

Rephrase and Thesaurus change the writer's own words in place. Once the edit is
saved, nothing on screen still shows what stood there before or which tool
changed it. Undo covers the moment just after a choice, but a writer who keeps
working, closes the book, or syncs from another device has no way to review what
the tools did. The right-hand pane already holds Notes, Records and Inventory;
a fourth tab can hold that record without touching the manuscript.

## What Changes

- Add a **History** tab to the right-hand pane, after Records and Inventory,
  showing the open book's replacements newest first.
- Each entry shows the text that was replaced, the text that replaced it, the
  date and time, and the chapter number at the moment of replacement. A
  replacement made outside a chapter (a notes page or a footnote) carries no
  chapter number.
- Rephrase, Thesaurus, and any later tool record a successful replacement
  through one shared recorder. A cancelled, refused, or moved selection records
  nothing.
- The log belongs to the book: it is stored beside the book's chapters, travels
  with the book, is copied by both backups, and merges across devices by
  appending entries rather than overwriting each other.
- The view is read-only. It offers no restore, no edit, and no delete; it never
  writes a chapter, notes page, `book.json`, or `library.json`.
- History sits behind Show More Features, so Simple NEO shows no fourth tab and
  records nothing. Pocket has no History view.

## Capabilities

### New Capabilities
- `history`: the replacement log of a book — what each recorded tool changed,
  from what text to what text, when, and in which chapter — including its
  storage, merging, retention of unreadable data, and read-only view.

### Modified Capabilities
- `thesaurus`: a successful synonym replacement is recorded in the book's
  History alongside the existing replacement behaviour.
- `rephrase`: a chosen rewrite is recorded in the book's History alongside the
  existing replacement behaviour.

## Impact

- New pure module `neo-ext/lib/history-log.js` (validation, merge, ordering,
  size limits).
- New main-process module `neo-ext/history-main.js` and its handler registration
  in `neo-ext/main.js`; new `historyRead` / `historyAdd` methods on the
  `NeoForkNative` bridge in `preload.js`.
- New renderer modules `neo-ext/history-record.js` (the shared recorder) and
  `neo-ext/history.js` (the pane view), the view registered with
  `NeoRecords.registerView`; new styles in `neo-ext/neo-ext.css`.
- Call sites in `neo-ext/thesaurus.js` and `neo-ext/rephrase.js` after a
  confirmed insertion.
- `index.html` script list and `neo-ext/check-seams.js`.
- `AGENTS.md` gains a History section; `CHANGELOG.md` and the fork version number
  follow the usual archive step.
- New tests: `scripts/history-log.test.js`, `scripts/history-ipc.test.js`,
  `scripts/history-view.test.js`, `scripts/history-record.test.js`, plus an
  `npm run test:history` end-to-end run.
- No change to the manuscript format, chapter files, `book.json`, or
  `library.json`.
