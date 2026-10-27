# Proposal

## Why

Records already hold characters, items, and places, but connecting one to the manuscript means selecting a name, leaving the page, opening Records, and retyping it. A writer who meets “Long Chen” mid-sentence wants either to create his record now or to jump to the record they already made. Tags are the bridge between the words on the page and the record that explains them.

## What Changes

- **Tags on a record.** An expanded record gains a tag list. Tags are free text, may contain several words (“Long Chen”, “Ice Metal Core”, “North Continent”), and one record may hold several. A tag can be added by hand, removed with an inline confirmation, and appears as a chip. Tags are case-insensitive for matching and keep the writer's capitalisation for display.
- **Create a record from the text.** Selecting one or more words in a chapter and right-clicking offers **Create Record…**. Choosing it opens the right-hand pane, pinned to Records, creates the record immediately with the selection as its title and its first tag, unfolds it, and puts the caret in its description. The selection is trimmed and its inner whitespace collapsed; more than 120 characters, or no selection, offers nothing.
- **Find the record the tag already belongs to.** If any active record has that exact tag, the same menu offers **Find Record…** instead of Create. Choosing it opens the pane on Records with the search field filled with the phrase, showing the tagged records. With no tag, Find Record is not offered.
- **A tag searches the book.** Choosing a tag chip switches to the Manuscript and opens NEO's Find bar with the tag, so the writer can step through every occurrence in the book with the existing count, highlight, and jump behaviour. Nothing is edited.
- **Optional subtle highlight.** A status-bar eye toggles highlighting of every tag occurrence in the manuscript, off by default and remembered per device. It scans once when toggled, when tags change, or when a chapter is edited (after a pause), not per word; it paints through the CSS Highlight API with a 5–6% tint and never enters the text, save file, export, or undo history. The control is absent with Show More Features off, with no tags, and in Pocket.
- **Selection does not break the word menu.** A single selected word keeps Look Up, Dictionary, and Thesaurus and gains the record item; several words suppress only the word-only items. The record item appears only inside a chapter body, with Show More Features on, and for a real selection. The native right-click menu and the macOS one-word Look Up popup both carry it; the Look Up choice is routed through the existing seam instead of its old Dictionary/Thesaurus-only test.
- **One shared tag model.** Tags are stored inside each record in `records.json`, merge per tag with add/remove stamps so two devices cannot erase each other's tags, and travel with the existing daily and book backups. No tag is written to `book.json`, `library.json`, or a chapter.

### Out of scope

- Automatically tagging every occurrence, renaming a tag everywhere, or merging two tags.
- A separate tag manager, tag colours, or per-tag descriptions.
- Linking a record to a selection without a tag, or keeping a live range to selected text.
- Highlighting tags in notes pages, exports, or Pocket.
- Regex, wildcard, or case-sensitive tag search.

## Capabilities

### New Capabilities

<!-- None: tags extend the Records capability. -->

### Modified Capabilities

- `story-records`: records gain tags; the right-click selection can create or find a tagged record; a tag can search the manuscript; an optional status-bar toggle highlights tagged names.

## Impact

- **New fork files:** `neo-ext/lib/record-tags.js` (tag key, add/remove/merge helpers and the text scanner), `neo-ext/lib/record-tags-main.js` (the native menu's phrase item), plus changes to `records-store.js`, `records-search.js`, `records.js`, `records-list.js`, `word-context.js`, `word-context-main.js`, and `boot.js`/`api.js`.
- **Preload:** two methods in the existing `NeoForkNative` block for the selected phrase and its has-tag flag.
- **Existing seams only:** the native context menu (seam 5), macOS Look Up (seam 10, whose choice line is widened to forward every fork choice), and the fork script block (seam 1). No new upstream file is edited. Records in `records.json` keep their backup path.
- **No dependency, no network.** The highlighter uses one combined case-insensitive matcher over chapter text and CSS Highlight ranges; a 100,000-word book with a full tag set is scanned once, never per word.
- **Tests:** tag model/merge/search unit tests, scanner performance/range tests, context-menu and macOS Look Up e2e checks, create/find from selection, tag add/remove confirmation, tag-to-Find, the eye toggle, two-book/global tags, and the no-book-writes guarantee.
- The fork version becomes `1.6.0+fork.6` when this ADR is archived.

## Research note

The highlight is included, but bounded: matching runs once per chapter per tag change, typing re-scans only the edited chapter after a 600 ms pause, matches are capped, and CSS Highlight ranges leave the DOM and file untouched. If a real 100,000-word book exceeds the budget in the e2e test, the toggle stays and only the automatic re-scan is narrowed; the tag/search/link behaviour does not depend on the highlight.
