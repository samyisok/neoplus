# Review — adr-007-record-tag-fixes

## Planning review (before implementation)

`code-reviewer` on the proposal, delta spec, and tasks found two blockers and several majors:

- The equal-stamp tie rule had no requirement; `Tag edits merge safely` now carries it plus scenarios for the tie and for a re-added tag.
- The proposal's out-of-scope line contradicted refusing an unstorable phrase; the exception is now stated.
- Owner of each tag question split explicitly: `record-tags` identity/active tags, `records-store` store-wide list/existence/records-by-tag, `records-search` substring matching over `activeTags`.
- `recordsWithTag` collision resolved: the store keeps it; `record-tags` lost it.
- Store-load failure given a writer-visible result ("not available in this build", file untouched) instead of looking like a damaged file.
- Highlight bound stated (200 distinct tags painted; the rest not painted) and typing wording restored ("after typing settles", not per keystroke).
- Every behavior task paired with a red test; add reasons named (`many`, `long`, `missing`, `tag`).

## Implementation review

Two rounds. First round on the implementation diff (`code-reviewer`, `security-reviewer`, `ts-cop`, GRASP and DDD passes):

- 50-tag cap counted tombstones — record froze; merge truncated the tag union; one bad tag rejected the whole record. Fixed with an active-only cap, lossless read/merge, and per-tag dropping.
- Cap was still reachable through remove → add → re-add, and a create could carry more than 50 tags; both now refuse with `many` (`scripts/records-store.test.js`).
- The written file measures compact JSON while writing pretty JSON, so the store could exceed the limit and become unreadable; the writer now measures the exact text it writes.
- `records.json.bak` was written and never read; a corrupt main file is now recovered from the backup, the good backup is not overwritten with the corrupt file, and the recovery is logged.
- Phrase clear had been made asynchronous under a comment promising the opposite, racing the menu; it is synchronous again on the same channel as the set, and both comments say so.
- Resize and structural changes used a zero debounce; `schedule()` now defaults to 250 ms.
- A chapter changed in place (undo, disk refresh) kept ranges on detached nodes; any mutation inside a chapter now re-reads that chapter, and the e2e asserts the tint is on the new text.
- Half-typed tags survived a tab switch and could be committed by the blur the switch caused; hiding the strip clears the draft, and a Notes switch clears record drafts too.
- The pane owned the scan policy; the input, mutation, and resize listeners now live in `record-tag-highlight.js`, leaving the pane to call `schedule`/`scheduleChapter`.
- Per-chapter timers were shared, so typing in two chapters could cancel one rescan; timers are per body and a chapter whose body left the page has its ranges dropped.
- Test instrumentation left in the product: `__neoTagScans` removed; `NeoRecords.tagScans()` remains as a read-only diagnostic the e2e uses.

### Accepted advisories

- `NeoRecords.tagScans()` stays: the e2e needs a deterministic scan count, and the call has no writer-facing effect. It is documented here as a diagnostic.
- `word-context.js` keeps `120` as a fallback for `MAX_PHRASE` with a comment; the tag module loads first on the page, and failing the whole word context would hide Dictionary and Thesaurus.
- The macOS Look Up popup still spends the word context before the dictionary reads its editor (pre-existing ADR-003 behaviour, covered by its own e2e); not touched here.
- `recordsWithTag` is a store query with no production caller yet; it is kept as the documented records-by-tag query and tested.

### Verdicts

- `code-reviewer` (re-review): all eight prior findings RESOLVED; one residual diagnostic hook plus three low-severity notes, all handled or accepted above.
- `security-reviewer` (re-review): no vulnerabilities. The `.bak` fallback is normalized before use, same trust domain, and the good copy is not overwritten.
- `ts-cop`: no blockers after the phrase-clear revert; monolith eye/scan code moved out of the pane, seams and script order updated.
- GRASP: tag identity and index now have one owner; the remaining advisory was the scan policy living in the pane, fixed by moving the listeners.
- DDD: invariants enforced in one place, no UI file touches stamps, pure modules stay pure, `records-file.js` is the only byte-policy boundary.

## Verification

- `npm test` — 492 pass.
- `npm run test:tags` — 12 pass.
- `npm run test:records` — 14 pass.
- `npm run test:notes` — 14 pass.
- `npm run test:dictionary` — 13 pass.
- `npm run lint` — no findings in touched files (pre-existing upstream only); `npx oxlint neo-ext/` clean.
- `node neo-ext/check-seams.js` — all seams in place.
- `openspec validate adr-007-record-tag-fixes --strict` — valid.
