# Tasks

## 1. Unreadable chapters (red first)

- [x] 1.1 Red: `scripts/inventory-ipc.test.js` — the unreadable query reports a cloud-only chapter and an unreadable one, needs no write, and refuses a bad book id; `scripts/inventory-anchor.test.js` — with any unknown chapter, no transaction is retired or moved.
- [x] 1.2 Green: `inventory-main.js` gains `unreadable(deps, bookId, chapterIds)` and the `neo-ext:inventory-unreadable` handler; `preload.js` exposes it; `api.js` exposes `unreadChapters()` through the bridge.
- [x] 1.3 Green: `inventory.js` spreads unreadable ids into `bookTexts().unknown`, says "waiting for a chapter", and skips reconcile while any exist.

## 2. Pending saves follow the book

- [x] 2.1 Red: `scripts/inventory.e2e.js` — record a transaction, open another book within the debounce, reopen the first, and find the transaction; no ledger in the second book.
- [x] 2.2 Green: one pending `{book, store, changes}` record; `load()` flushes the old book first; `flushFor` writes under the captured book and rechecks it; the book-change observer waits for the flush.

## 3. Merge limits

- [x] 3.1 Red: `scripts/inventory-ipc.test.js` — a merge that exceeds the item or transaction limit is refused (`large`) and the existing file stays readable; a normal merge still writes.
- [x] 3.2 Green: `writeNow` normalizes the merged store and refuses before writing; the view says it was not saved.

## 4. Simple NEO gate

- [x] 4.1 Red: `scripts/inventory.e2e.js` — with Show More Features off, typing in a chapter leaves the ledger bytes unchanged, and turning it off while a save is pending still saves that one transaction.
- [x] 4.2 Green: `enabled()` gates flush/reconcile/schedule/listeners; hiding with the switch off clears timers and `loaded`; the menu provider uses it.

## 5. Modal and view corrections

- [x] 5.1 Red then green in `scripts/inventory.e2e.js` — the modal covers the page (host in body, dialog class, layer above the panes); Esc cancels a pending removal; a fold is open again after closing and reopening Inventory.
- [x] 5.2 Red then green — scrolling to another chapter updates "as of" the new chapter; a selectable placeholder records nothing (unit: `selectionAnchor` returns null for a ghost); the log does not offer a row whose phrase is gone.
- [x] 5.3 Green: amount messages split blank / not a number / out of range through the ledger's `parseAmount`.

## 6. Ownership and cost

- [x] 6.1 Green: `api.js` gains `chapterBody`, `paragraphNodes`, `chapterName`, `chaptersRoot`, `editorView`, `phraseLocatable`; `inventory.js` and `records.js` use them instead of raw core selectors where it fits.
- [x] 6.2 Green: input reconciles only the typed chapter (`anchor.reconcile` chapter scope); full pass on open, focus, structural change.
- [x] 6.3 Green: section claiming uses `api.sectionFor` per paragraph; the creation hash uses the same run; a ghost cannot host a transaction; `scripts/inventory-anchor.test.js` covers a ghost paragraph's text still being searchable.

## 7. Docs, review, release

- [x] 7.1 Update the Inventory section of `AGENTS.md`: unreadable-chapter query and deferral, pending-save book scope, merge limit gate, Simple NEO gate, modal layer, scroll chapter change, chapter-scoped reconcile. Verify with `git diff -- AGENTS.md` and `node neo-ext/check-seams.js`.
- [x] 7.2 Run `npm test`, `npm run test:inventory`, `npm run test:records`, `npm run test:tags`, `npm run test:notes`, `npm run lint`, `npx oxlint neo-ext/`, `npm run check:version`, `openspec validate adr-009-inventory-fixes --strict`; record results in `tasks.md`.
- [x] 7.3 Review gate (`grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, `security-reviewer`); fix blockers; record verdicts in `review.md`.
- [x] 7.4 `/opsx-sync` then archive as `2026-10-29-adr-009-inventory-fixes`; raise the fork to `1.6.0+fork.9`, add the changelog, commit, and reinstall.
