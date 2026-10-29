# Review — adr-009-inventory-fixes

## Findings that started this change

The ADR-008 review found four data-loss or spec-breaking paths (unreadable chapters retiring transactions, pending saves crossing books, merges writing a file Inventory refuses, Simple NEO still reconciling and writing) and a set of smaller breaks: modal layer, fold lifetime, ghost anchors, whole-book rescans, unplaced transactions, jump availability, amount messages.

## Implementation review

`code-reviewer`, `security-reviewer`, and `ts-cop` reviewed the fix. Blockers and majors found, then fixed:

- **Per-book pending saves.** A `Map(book → store)` with a serialized flush chain; the book-change observer flushes before loading; a failed write keeps the captured store and retries; a newer recording for the same book is never replaced by an older retry. A book switch inside the debounce keeps the transaction (e2e).
- **Unreadable chapters.** `neo-ext:inventory-unreadable` reports non-ENOENT stat failures, files that fail `R_OK`, and cloud placeholders (batched `cloudOnlyAmong`, with `requestDownload` asked for them). Ids are validated; the query fails closed (all chapters) and the renderer treats a failed query as all-unknown. Missing files stay "empty chapters". Scoped typing passes skip the probe.
- **Merge limit.** The merged store is normalized and size-checked before writing; an over-limit merge is refused and the readable file stays. Test writes two 300-item rows and asserts `large` plus an intact file.
- **Simple NEO.** `enabled()` gates load, reconcile, schedule, listeners and the menu; hiding clears timers and `loaded`; a save in flight may finish. e2e types after the switch is off and compares the ledger bytes.
- **Modal.** Host in `document.body`, `modal-backdrop neo-inv-backdrop`, z-index 9000; focus returns to where it came from on close; Esc cancels a pending removal.
- **View.** Folds reset on reopen; a scroll or caret change re-renders only when the chapter changed; a ghost or unplaceable paragraph yields no anchor and no menu item; the log marks a chapter absent from the book as **Unplaced** and only offers a jump while the phrase is locatable; the typed chapter alone is reconciled on input.
- **Amounts.** One `parseAmount` distinguishes blank, not-a-number, and out-of-range; the modal shows one message per case.

### Accepted advisories

- The phrase menu stays two entries in `main.js` and two in the Look Up table; a shared table would cross the process boundary for two rows.
- `inventory.js` still carries the DOM→book-text adapter; it is scoped and covered by e2e, and moving it without a second file would only shuffle code.
- A chapter that exists but is a directory counts as unreadable; a symlinked chapter file is classified, not read.
- `cleanAmount` delegates to `parseAmount`, so the two readings of an amount cannot drift.

### Verdicts

- `code-reviewer` re-review: pending saves, unreadable query, reconcile guard, merge gate, modal layer, folds, scroll, ghosts, unplaced rows all RESOLVED. Three residuals found and fixed: load did not gate on the feature, a failed write could clobber a newer recording, focus was not restored. One test stub was corrected to the `{ok, ids}` shape.
- `security-reviewer`: id validation and fail-closed query close the earlier fail-open path; the batched cloud probe removes the per-file blocking stat; no new write or injection surface.
- `ts-cop`: no new lint errors; no dead exports from the new `NeoExtApi` members.

## Verification

- `npm test` — 538 pass.
- `npm run test:inventory` — 21 pass.
- `npm run test:records` — 14 pass.
- `npm run test:tags` — 12 pass.
- `npm run test:notes` — 14 pass.
- `npm run test:dictionary` — 13 pass.
- `npm run lint` — no findings in touched files; `npx oxlint neo-ext/` clean.
- `node neo-ext/check-seams.js` — all seams in place.
- `openspec validate adr-009-inventory-fixes --strict` — valid.
