# Planning Review

Scope: `openspec/changes/adr-006-record-tags/` — proposal, `story-records` delta, design, tasks. Reviewed before any code.

## GRASP

- **Ownership.** Tags stay inside `story-records`: the record owns its tag list, the records store owns tag events, the pane owns the interface. The phrase menu is an adapter, not a second records implementation.
- **Information Expert.** Tag key/normalize/merge and the text scanner live in pure `record-tags.js`; the store owns add/remove; the pane decides labels. The menu asks the one shared store for `tagExists`, so the menu, pane, and highlighter cannot disagree.
- **Controller.** `word-context.js` already owns right-click capture; it gains a phrase side-channel rather than a second listener. `records.js` owns selection actions and the status toggle.
- **Protected Variations.** The existing seams are reused (native menu, Look Up, script block, preload block); no new upstream seam. The Look Up choice line is widened because its old two-feature whitelist would silently drop the new choice.
- **Cohesion.** Pure tag model/scanner, pure store, pane controller, list renderer, main-process adapters. No god change.
- **No blockers.**

## DDD

- **Ubiquitous language.** tag, phrase, record, selection, Find Record, tag chip, tag index. Tags are attributes of a record, not a second aggregate.
- **Aggregate boundary.** `records.json` remains the single aggregate for records and tags; the manuscript is never edited by a tag action.
- **Storage boundary.** Tags are serialized inside each record and covered by the existing backup; no `book.json`, `library.json`, or sidecar.
- **Observable requirements.** The spec states Create vs Find, the phrase rules, the Find-bar behaviour, and the highlight's visible effect; IPC, regex, and DOM mapping stay in design.
- **No blockers.**

## Findings fixed during review

- **macOS Look Up was dead for the new choice:** seam 10 forwarded only `dictionary`/`thesaurus`. The seam now forwards every non-lookup choice; the proposal impact and tasks say so.
- **Language gate:** the record item must not inherit the English spellcheck gate; only lexical items do. A Romanian-language test is named.
- **Unready tag index:** offering Create while the index is unread risks a duplicate. Neither item is offered until the shared store loads; Create re-checks the live store and becomes Find if the tag appeared.
- **Multi-word native menu:** `contextMenu` returned on an empty word. It now proceeds when a phrase exists and sends the phrase.
- **Cross-paragraph matching:** scanning a whole chapter would tint across `<p>` boundaries. The scanner runs per paragraph and the selection rejects line breaks/multiple paragraphs.
- **Unicode boundaries:** ASCII `\b` would fail `José`/`Москва`; the plan uses `\p{L}\p{N}` with `u`.
- **DOM replacement:** structural undo, disk refresh, and chapter open replace nodes; the highlighter now invalidates and rescans on `#chapters` mutations/book open.
- **Shared state:** the pane, menu index, and highlighter must read one `state.store`; the plan says one load, not a second index.
- **Global cap:** 20k per chapter was unbounded; it is now 2,000 ranges across the book.
- **Book-write wording:** a tag click may make core Find remember `lastPosition`; the requirement is scoped to chapter/library/sidecar content and tested that way.
- **Store literals:** both `cleanRecord` and both `mergeRecord` branches must carry tags; the 50-tag/tombstone budget is named.
- **Search call sites:** tag matching changes `test()`; the list must unfold a tag-only match and pass active tags.

## Verdict

No blockers. The change is one existing capability extension, one new pure tag/scanner module, no new dependency, no new upstream seam, and no tag data outside `records.json`. Proceed to `/opsx-apply` when ready.

## Implementation review — 2026-10-28

- **Chapter rescan debounced.** The input listener now keeps one timer, not one per keystroke; it still rescans only the edited chapter after 600 ms.
- **Create rechecks after a fresh read.** `openFromSelection('create')` re-reads the shared store (when no write is in flight), then checks the tag and becomes Find with a status line instead of creating a duplicate.
- **Phrase clear is deliberately synchronous.** The comment and D2 now say so: a stale phrase must not reach the menu being built; the word's clear remains fire-and-forget.
- **Bounds extended to the tag set.** The matcher accepts at most 200 tags and `activeTagList` at most 2,000, so a synced/tampered store cannot freeze the editor on a scan.
- **Store cap/tombstone tests added.** Fifty additions succeed, the fifty-first is refused, an existing key stays allowed, and remove-then-add revives the tag.
- **Selected-only Look Up item.** The one-word Look Up item appears only when the word came from a selection; a caret right-click still offers only Look Up/Dictionary/Thesaurus. This kept the ADR-003 e2e green.

### Verification

- `npm test` — 481 pass.
- `npm run test:tags` — 10 pass.
- `npm run test:records` — 14 pass.
- `npm run test:notes` — 14 pass.
- `npm run test:dictionary` — 13 pass.
- `npx oxlint neo-ext/` clean; seams and `openspec validate --strict` pass.
- Security review: no high/medium; tag/phrase IPC validated, textContent only, no new file path, matcher capped.
