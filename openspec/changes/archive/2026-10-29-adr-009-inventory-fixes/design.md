# Design

D1–D8 of ADR-008 stand. This change closes the gaps the review found; only the decisions that move are recorded here.

## 1. Unreadable chapters enter the domain

`main.js:815` answers `''` for both a missing chapter and an iCloud placeholder, and the page renders the placeholder as an empty chapter, so the DOM cannot tell them apart. `inventory-main.js` gains a read-only `neo-ext:inventory-unreadable(bookId, chapterIds)` handler: it stats each `chapters/<id>.html` under the book folder and reports the ones that are cloud-only (`whenLocal`/`isCloudOnly`) or unreadable. The renderer passes `api.chapterOrder()` and merges the answer into `bookTexts().unknown`.

While `unknown` is non-empty, `inventory-anchor.js` returns the store unchanged: no retirement, no moves. The pane says the balances are waiting. This is the same deferral the ADR-008 design described, now with a source that can actually fire.

## 2. Pending saves belong to a book

`inventory.js` keeps one pending record, `{ book, store, changes }`, instead of a global counter. `load()` first calls `flushFor(pending)` for the old book and waits for it, then reads the new book. `flushFor` writes the captured store under the captured book and rechecks both before merging the response; the book-change observer calls `load()` only after that flush. Result: nothing recorded can move to another book, and a switch inside the 600 ms debounce cannot drop it.

## 3. One limit, checked before every write

`ledger.normalize` owns the limits (500 items, 50,000 transactions, 8 MB text is the file's). `inventory-main.writeNow` normalizes the merged store before writing and refuses with `large` if it does not pass. A merge can therefore never produce a file the reader would call unreadable. `addItem`/`addTransaction` keep their own friendly early refusals but the limit itself is the normalizer's.

## 4. Simple NEO is a real gate

`inventory.js` gains `enabled()` = Show More Features on and a book open. `flush`, `reconcile`, `scheduleReconcile`, the chapter/focus listeners, and the menu provider all check it. Hiding Inventory starts a flush, and when the switch is off it also clears timers and `state.loaded`, so nothing reads or writes afterwards. The only write that may outlive the switch is one already in flight.

## 5. The modal layer and focus

The host is `document.body`, class `modal-backdrop neo-inv-backdrop`, `z-index: 9000` (the fork's dialog layer), `aria-modal`, focus moved to the search on open and returned to the pane tab on close. Because it carries `modal-backdrop`, NEO's own guards and shortcuts see it. Esc closes a pending removal before closing the modal.

## 6. View corrections

- **Chapters by scroll:** a throttled check of `api.currentChapter()` on `#paper-scroll` and `selectionchange` re-renders when the chapter changes, not only on `focusin`.
- **Folds:** cleared in `onShow`.
- **Placeholder selections:** `selectionAnchor` returns null for a `.ghost` paragraph and for an index it cannot place; the menu provider asks it first.
- **Jump:** the log asks `api.phraseLocatable({chapterId, quote})` before offering a row.
- **Typing cost:** input reconciles only the typed chapter (`anchor.reconcile` scoped by a chapter filter); a book-wide pass runs on open, focus, and structural change.
- **Amounts:** the ledger exposes `MAX_AMOUNT` and a `parseAmount` that distinguishes blank, not-a-number, and out-of-range; the modal shows one message per case.

## 7. Ownership

Core DOM/text reads move behind `api.js`: `chapterBody(id)`, `paragraphNodes(body)`, `chapterName(id)`, `chaptersRoot()`, `editorView()`, `phraseLocatable`. `inventory.js` keeps the view, modal, and scheduling; the DOM→book-text adapter stays until it can move without a second file (recorded as an advisory, not silently dropped).

The section claiming reads `api.sectionFor(body, paragraph)` per paragraph, so core's rule (including ghosts and scene breaks) is the only one; the creation hash is taken from the same paragraph run, and ghost text stays searchable for the anchor while a ghost cannot host a new transaction.

Phrase providers stay two entries in `main.js` (their modules already own the items) and two in the Look Up table; a shared table would cross the process boundary for two rows. Recorded as an accepted advisory.

## Risks

- A merge that exceeds a limit is refused rather than trimmed; both devices keep a readable file and the writer sees "not saved".
- Reconcile-after-typing is scoped to the edited chapter; an edit that moves words to another chapter is caught by the next book-wide pass (open, focus, structural change).
