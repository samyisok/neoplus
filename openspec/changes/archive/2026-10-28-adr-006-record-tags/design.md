# Design

## Context

See `proposal.md` for motivation and `specs/story-records/spec.md` for the behaviour contract.

ADR-005 put Records in the right pane and gave each record a title and description in one library-wide `records.json`. The manuscript's right-click already carries a single-word context (Dictionary/Thesaurus) through a renderer capture listener, a synchronous phrase store in the main process, and the native menu seam. macOS replaces that menu with the Look Up popup for a one-word selection.

Tags add a second kind of context: a phrase of one or more words. They must not disturb the single-word lexical menu, must work for multi-word selections on every platform, and must know whether the library already has a record with that tag before the native menu is built.

## Goals / Non-Goals

**Goals:**

- One tag vocabulary shared by records and the manuscript.
- A selection can create the record or find it without retyping.
- Tags merge across devices with the same care as records.
- Tag mentions use the Find bar the writer already knows.
- A subtler highlight that never runs per word and never enters the file.

**Non-Goals:**

- Entities/relations, tag colours, global tag rename, or automatic tagging.
- Tag mentions in notes/exports; Pocket.
- A second store or index.

## Decisions

### D1. A tag is a stamped string inside its record

`records.json` records gain:

```json
"tags": [
  { "text": "Long Chen", "at": 0, "removedAt": 0 },
  { "text": "Silver Series", "at": 0, "removedAt": 0 }
]
```

- `text` keeps the writer's spelling and inner single spaces; `tagKey(text)` trims, collapses whitespace, and lower-cases for comparison.
- A record may have zero or more tags, up to 50; a tag is at most 120 characters. The same tag may belong to several records.
- Adding a tag sets `at` to now and clears `removedAt`; removing it sets `removedAt`. The newer of the two wins when copies merge. A removed tag keeps its tombstone, so an older device cannot revive it.
- `normalize` accepts records without `tags` (old files) as an empty list and clamps future stamps. `mergeRecord` unions tags by `tagKey`, keeping the newer event and the newer displayed spelling.
- `records-store` gains `activeTags(record)`, `tagExists(store, text)`, `recordsWithTag(store, text)`, `addTag`, `removeTag`. UI code never writes inside the tag array.
- `records-search` matches a query against active tag text as well as title and description, so Find Record and the records field both find a tag.
- The existing `.bak`, 4 MB, item-count, cloud, and merge guards cover tags with no new file.

Alternatives considered: a separate tags file keyed by record id (rejected — another merge surface and another backup item); a single `tags` string list with one timestamp (rejected — concurrent additions would overwrite each other).

### D2. The phrase context rides beside the word context

`word-context.js` already captures every right-click in an editable editor and stores one word for the native menu. It gains a phrase side-channel:

- On a right-click in an editable `.chapter-body`, read the current selection. If it is non-empty after trimming/collapsing whitespace, at most 120 characters, and stays within one paragraph with no line break, remember it. A selection is one or more words.
- Ask the loaded records index for `tagExists(phrase)` and store `{ phrase, hasTag }` through a new synchronous bridge method, `setContextPhrase(phrase, hasTag)`. Clear it on every miss with the synchronous clear as well: unlike the word, a stale phrase must not reach the menu that is about to be built.
- Keep the existing word context unchanged. A one-word selection stores both; a longer selection stores only the phrase, so the lexical items stay suppressed. The English spellcheck gate stays on the word items only: a record tag is language-free, so `spellLanguage:'ro'` still offers Create/Find.
- `word-context-main.js` keeps a second per-window map, 5 s TTL, spent once: `takePhrase(win)`. The native `contextMenu` seam no longer returns on an empty word: it proceeds when either context exists, prepends **Create Record…** or **Find Record…** (phrase first, then lexical items, then one separator), and sends `{ type: 'neo-ext', action: 'record-create' | 'record-find', phrase }` for the record item.
- macOS's one-word Look Up popup gets the same item through `lookUpMenu`/`lookUpChoice`; its label uses the same index. The existing Look Up seam at `app.js` must stop gating on `choice === 'dictionary' || choice === 'thesaurus'` and pass every non-lookup choice to `NeoExtApi.lookUpChoice`, which ignores unknown values. Multi-word selections on macOS fall through to the native menu, which carries it. `check-seams.js` still requires `NeoExtApi.lookUpChoice(choice, word)`.
- The record item is offered only for a chapter body, Show More Features on, and a selection. No selection, a title/notes/footnote, or Simple NEO offers nothing.

The phrase store is a separate IPC channel because the lexical items must never receive a phrase; the word path and its 5 s TTL remain exactly as ADR-003 made them.

Alternatives considered: overloading the word channel with a phrase (rejected — Dictionary/Thesaurus would appear for multi-word selections and the replacement range assumptions would break); reading `params.selectionText` in the main process (rejected — the renderer already has the exact selection and the tag index; `selectionText` is not enough to gate by editor).

### D3. Create and Find open the existing Records pane

`records.js` exposes `window.NeoRecords` for the menu and Look Up paths:

- `tagExists(phrase)` — true when any active record has that tag. One shared records store is read once when Show More Features is on (startup or the switch turning on) and is the same `state.store` the pane and highlighter use. Until it has loaded, neither item is offered; a failed/cloud load leaves the index unready rather than pretending there is no tag.
- `openFromSelection(phrase, 'create'|'find')` — pin the right pane open, choose Records, wait for a load if needed, then:
  - create: re-check the live store; if the tag appeared while the menu was open, switch to Find and say so; otherwise `addRecord` with title = phrase and first tag = phrase, save, unfold the row, focus its description;
  - find: set the records query to phrase, render, focus the field.

Tag search is deliberately the pane's normal query, so the records already matching title/description also remain; the tag is the strongest signal. A tag-only match unfolds its row, because the writer chose Find to see the tagged record. A longer selection never creates a record if its tag already exists; the menu offers Find instead.

Creating pins the pane: a record opened for editing cannot sit in a pane that closes the first time the pointer crosses it. Pinning is the same per-device `#side-pin` state the writer already controls.

### D4. Tags in the record row

An expanded record gains a tag strip below the folder select:

- active tags are chips; each chip is a button that calls `openFind(tag)` on the manuscript;
- each chip has a small cross that asks **Remove tag “tag”?** in place, with Remove/Cancel; Esc cancels;
- **+ Tag** becomes a text input; Enter/blur adds, Esc cancels. Duplicate keys are ignored; a too-long tag gets a quiet status line.
- Tags are text nodes; no HTML is rendered. The list reads them from `activeTags(record)` and calls the store methods.

`openFind(tag)` is a small addition to `api.js`: switch to Manuscript if needed, call the core `openSearch()`, set `#search-input` to the tag, and dispatch its normal input event. Core Find then counts, highlights, and jumps across all chapters; the records pane is not asked to do its own scanner.

### D5. The optional highlight is a bounded chapter scan

`neo-ext/lib/record-tags.js` is pure:

- `tagKey`, `normalizeTag`, `activeTags`, and `tagRanges(text, tags)`.
- `tagRanges` builds one case-insensitive alternation of escaped, length-sorted tags with Unicode letter/number boundaries (`(?<![\p{L}\p{N}])…(?![\p{L}\p{N}])`, `u`), and returns non-overlapping `{ start, end, tag }` ranges. It is called per paragraph, never on the chapter's concatenated string, so a tag cannot match across a paragraph break. The whole book stops at 2,000 ranges. This is one pass per block, not a walk per word.

The pane's controller owns the highlight:

- A status-bar eye is injected into `#counters` only when Show More Features is on, a book is open, and at least one active tag exists. It is a real button, `aria-pressed`, with a per-device `localStorage` key `neo-record-tag-highlight` (default off).
- On enable, tag change, a book opening, or a chapter settling after an edit, build ranges for each `.chapter-body` block. Text is read once per paragraph; offsets map to text nodes with one `TreeWalker`; the combined ranges go into `CSS.highlights` under `neo-record-tag`.
- On a chapter input, a 600 ms debounce replaces that chapter's ranges only. A `MutationObserver` on `#chapters` (structural undo, redo, disk-refresh replacement, chapter open) invalidates and rescans the affected/all ranges. No scan runs while typing, and no scan runs when the toggle is off.
- The highlight rule is a 5–6% accent tint, with no DOM mutation. It is cleared on toggle-off, leaving the manuscript, save state, undo, and exports untouched.
- With Simple NEO, a bookless shelf, or no tags, the eye is hidden and any existing highlight is cleared. Pocket never loads the fork layer.

Performance budget: 100,000 words is roughly 600,000 characters. One alternation pass with a library of typical tags is budgeted under 100 ms on the test machine; the e2e fixture measures a large chapter and the toggle, and the 2,000-range global cap keeps a pathological tag from flooding the page.

Alternatives considered: highlighting every word by checking membership (rejected — exactly the per-word cost the writer worried about); marking matches in the HTML (rejected — saved into chapters); scanning only the visible chapter (rejected — the page may hold several chapters and the writer scrolls between them).

### D6. Merge and backups

Tags live inside each record, so `records.json`, `.bak`, the merge-in-write, the daily zip, and Backup Book carry them without a new backup rule. Tag stamps are clamped by the same future limit as the other fields. Removing a tag never removes the record; deleting the record still tombstones the whole record.

### D7. Tests

- `scripts/record-tags.test.js` — normalize/tagKey, multi-word tags, duplicates, add/remove, tombstones, merge additions/removals, `tagExists`/`recordsWithTag`, scanner boundaries incl. `Long Chen`/`Long Cheney`, accented and non-Latin tags, per-paragraph non-matching, long tags, overlaps, 2k global cap, and a 100k-word timing sanity check.
- Extend `scripts/records-store.test.js` — old records without tags, tag merge, remove tombstone, future stamps.
- Extend `scripts/records-search.test.js` — tag-only match, title/body/tag mix.
- `scripts/record-tags.e2e.js` (`npm run test:tags`) — real launch:
  - select “Long Chen” → Create Record; pane pinned, record title/tag, description focus; a non-English spellcheck language still offers it;
  - reopen the selection → Find Record (not Create), pane search “Long Chen”;
  - multi-word “Ice Metal Core” tag; no-tag selection still offers Create;
  - add/remove tags with confirmation, duplicate tag, tag chip opens Find over the manuscript; tag-only Find unfolds the row;
  - single word on macOS Look Up path via the renderer seam (or the native menu path on Linux);
  - status eye: hidden with no tags/Simple NEO, toggles tint on/off, survives reload per device, new tag appears, typing keeps text/undo unchanged, a structural undo restores the tint on replaced chapter DOM;
  - index not loaded → no record item; create racing an existing tag → Find/status, not a duplicate; two books share tags; records.json gains tags; no chapter/library content writes; backups already covered by ADR-005.
- Regression: `npm run test:records`, `npm run test:notes`, `npm run test:dictionary`, seams, lint.

## Risks / Trade-offs

- **The tag index is read at startup** — one extra async `records.json` read per session; it is the same file Records would open, and a failure leaves the record item off (not a duplicate Create) until a later successful load.
- **A phrase is not a live anchor** — renaming a character in the text does not rename the tag. Tags are explicit, which is predictable and cheap.
- **Tag matching is literal, not morphological** — “Long Chen's” is found by the book Find, but the tag “Long Chen” matches inside it as a phrase; the highlight needs a boundary rule so it does not tint “Long Cheney”. Tests pin this.
- **A pathological tag** — 2k-range global cap; the toggle remains usable and search still works.
- **The pane is pinned on create** — deliberate; the writer can unpin after adding the description.
- **Clock skew on tags** — same per-field clamp as records; a removed tag is final, so the tombstone cannot be undone by a later clock.

## Migration Plan

Old records have no `tags`; normalize reads them as empty. No file rewrite is needed until the first tag edit. Removing the feature leaves harmless `tags` arrays in `records.json`.

## Open Questions

None.
