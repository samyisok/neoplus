# Proposal

## Why

ADR-006 gave records tags. The review gate that followed it found that the tag rules are enforced unevenly: the 50-tag limit counts removed tags, so a record can be frozen at zero visible tags; a merge of two tag sets silently truncates and can drop live tags or their removal marks; one unreadable tag rejects the whole record and makes the records file read-only. The same review found the tag identity, the tag index, and the tag predicates written two or three times, the highlight scanner living inside the pane controller, and the status-bar eye able to repaint tagged names with Simple NEO on and the eye hidden.

These are the kinds of defects that lose a writer's notes quietly, and they contradict the specs ADR-006 shipped. They are fixed here, before more tag work is built on top.

## What Changes

- **The limit counts what the writer sees.** Adding accepts at most 50 active tags; removing one frees a place. Reading and merging never drop a live tag, and never drop a removal mark, even when two copies together hold more than 50. A file whose tag is unusable loses that tag alone, not its record.
- **Removing wins a tie.** Two events for the same tag with the same time resolve toward the removal, so an equal-stamp copy cannot revive a removed tag.
- **Create never produces an untagged record.** A phrase that cannot be stored as a tag fails the create and says so, instead of making a title with no tag.
- **One owner per tag question.** `record-tags.js` owns tag identity and `activeTags`; `records-store.js` owns the store-wide tag list, existence, and records-by-tag and never re-implements identity; `records-search.js` matches a query over `activeTags(record)` with no stamp logic of its own; the pane, the search, and the menu call those owners. The store has no inline fallback copy of a tag rule.
- **The tag highlighter becomes its own file.** The eye, the scanners, the per-chapter timers, and the CSS highlight ranges move out of the pane controller into `neo-ext/record-tag-highlight.js`, so they can be reasoned about and tested without the pane.
- **The eye respects Simple NEO.** Turning Simple NEO off clears the tint and blocks another scan; a tab switch can no longer repaint tagged names while the eye is hidden.
- **Typing rescans one chapter.** A new paragraph or a keystroke re-reads only the edited chapter; only a chapter being mounted or replaced triggers a whole-book scan.
- **Smaller corrections.** A tag action has one vocabulary across the renderer, the menu, and the boot router; the phrase clear uses the asynchronous channel its comment describes; core bindings are read through `api.js`; the 120/50 limits and the phrase length come from the tag module; the eye's tag list and the matcher agree on the same bound; a failed tag add reports "too long" and "no such record" apart; a half-typed tag does not survive a view switch; `openFind` runs the search once.

### Out of scope

- Changing how tags look, or where tags are stored. Create/Find keeps its behaviour except that a phrase no tag can hold now fails and says so instead of creating an untagged record.
- A tag manager, renaming a tag everywhere, or merging two tags.
- Reworking ADR-005's review items (the F6 focus trap and failed-save retry) beyond what the tag code touches.

## Capabilities

### New Capabilities

<!-- None: this fixes the tag behaviour of the existing Records capability. -->

### Modified Capabilities

- `story-records`: tag limit and merge rules, create-from-selection failure, and the highlight's Simple NEO and per-chapter scan rules.

## Impact

- **Rewritten:** `neo-ext/lib/records-store.js` (tag rules, store-wide tag queries), `neo-ext/records.js` (pane only; highlighter extracted), `neo-ext/lib/record-tags.js` (limits and the tag-action vocabulary).
- **New:** `neo-ext/record-tag-highlight.js`, `neo-ext/lib/records-file.js` (the file-size policy moved out of the pure store).
- **Adjusted:** `neo-ext/records-list.js`, `neo-ext/records-main.js`, `neo-ext/records-search.js`, `neo-ext/word-context.js`, `neo-ext/word-context-main.js`, `neo-ext/boot.js`, `neo-ext/api.js`, `preload.js`, `index.html`, `neo-ext/neo-ext.css`, `neo-ext/check-seams.js`.
- **Writer-visible failure:** if the tag module cannot load, Records says it is not available in this build and leaves `records.json` untouched, rather than presenting the file as damaged.
- **No new seam, no new dependency, no new file in the library.** Tags stay inside `records.json`; the eye's setting stays in this device's `localStorage`.
