# Review — adr-008-inventory

## Planning review

Two rounds covered the proposal, delta spec, design, and tasks before implementation:

- Retirement had to be a property of the whole book's text, not one chapter: joined chapters, moved sections, loose/held cards, and unreadable chapters all keep transactions; only a phrase gone everywhere retires one.
- The book scope had no owner; `api.js` gained guarded reads (`bookId`, `currentChapter`, `chapterOrder`, `chapterText`, `sectionNotes`, `sectionFor`, `cardTexts`, `revealPhrase`) and a per-book write guard.
- macOS one-word selections reach the Look Up popup, not the native menu, so the item is offered there too.
- The pane strip is hard-coded for two views; every place `records.js` names `'records'` was listed (render, setView, applyTabs, tabList/moveTab, hidden branches, F6/Tab, Esc, loadStore gating), and `setView` starts the ledger flush rather than awaiting it.
- Anchor hash input defined (section's claimed paragraphs, ghosts excluded); section claiming pinned to core's `sectionOf`; reconcile writes only when it changes something.

## Implementation review

`code-reviewer`, `security-reviewer`, `ts-cop`, plus GRASP and DDD passes, on the uncommitted diff. Blockers found and fixed:

1. **Modal clipped inside the pane.** Appended into `#side-pane` (`position: fixed` + `transform`, 250 px), so it could be invisible. Now attached to `document.body`.
2. **Cross-book write race.** `state.book` was set before the ledger read resolved, so a pending save could write book A's ledger into book B. Now a load token and a book recheck guard the read, `state.loaded` is false until the read lands, and `flush` snapshots the book and rechecks before merging.
3. **Section hash never matched.** Creation hashed from the selected paragraph onward while reconcile hashed the whole section, so the fast path was dead and section ids were erased. One `sectionMap` now serves both; claims reset at `scene-break`, ghosts excluded.
4. **Inventory escaped Simple NEO.** `canRecord` now requires Show More Features, the manuscript tab, an open book, and a writable ledger; the phrase payload carries that flag to the native menu.
5. **Failed saves were dropped.** A failed flush keeps `changes` and retries, and the ledger flushes on blur, hidden, and pagehide.
6. **`.bak` read ignored iCloud.** The backup is now waited on with `whenLocal`; an away backup reads as unreadable rather than blocking the write chain.
7. **Deferred reconciliation.** Any unreadable or unmounted chapter defers all retirement instead of retiring a phrase that lives there.
8. **Merge reverted anchor corrections.** Transactions carry `anchorAt`; the newer anchor wins per field.
9. **Atomic modal save.** Item and transaction are built on a copy and assigned only on success; blank amounts, missing ledger, and read-only ledgers refuse with a message.
10. **Reconcile cost.** Skipped when the ledger has no transactions, debounced 1200 ms, no scroll listener; a clean pass writes nothing.
11. **Unreadable ledger resilience.** One bad record is dropped; a file where nothing survives is refused (so it is not silently replaced with an empty ledger).

### Accepted advisories

- `inventory-main.js` reuses `lib/records-file.js` for the byte policy. It is a stateless size helper, not records behaviour; a second copy would be worse. Recorded here.
- A permanent save refusal (too large, invalid) retries every 3 s without a cap. It is bounded work and keeps the words on screen; a backoff is a later refinement.
- Reconcile still reads the whole book's DOM after a chapter edit. It is debounced, skipped on an empty ledger, and runs only in memory; no per-keystroke work.

### Verdicts

- `code-reviewer` re-review: all ten items RESOLVED; one new race (cross-book save) found and fixed; one minor (an all-orphan ledger reads as unreadable) accepted as the safer refusal.
- `security-reviewer`: no vulnerabilities. Book ids regex-guarded before `libName`/`bookDir`; anchor/IPC payloads rebuilt field by field; all new DOM via `textContent`; `CSS.escape` for selectors; caps 500 items / 50,000 transactions / 4 MB; only the ledger is written.
- `ts-cop`: no new lint errors; script order, seams, `test:inventory`, and Pocket exclusion verified.
- GRASP: pure ledger/anchor own their rules; `inventory.js` owns the view and wiring; pane registry stays owned by `records.js`. The DOM→book-text adapter inside `inventory.js` is a known extra duty, kept there to avoid a second file until it grows.
- DDD: invariants enforced in the ledger and anchor, infrastructure in `inventory-main.js`, UI holds no rule beyond messages; vocabulary matches the spec.

## Verification

- `npm test` — 531 pass.
- `npm run test:inventory` — 14 pass.
- `npm run test:records` — 14 pass.
- `npm run test:tags` — 12 pass.
- `npm run test:notes` — 14 pass.
- `npm run test:dictionary` — 13 pass.
- `npm run lint` — no findings in touched files; `npx oxlint neo-ext/` clean.
- `node neo-ext/check-seams.js` — all seams in place.
- `openspec validate adr-008-inventory --strict` — valid.
