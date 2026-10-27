# Proposal

## Why

The writer's notes belong to one book, but the people and things they invent do not. A character, a ship, or a invented drink can appear in several books, and the detail that makes them consistent — an eye colour, a scar, who made the object — is easy to forget between drafts. Today there is nowhere to keep that knowledge except a chapter's notes or an outside document, and neither is shared by the books that need it. The right-hand notes pane is the natural home: it already slides in while writing, and it now resizes. It gains a second view beside the notes it already holds.

## What Changes

- **Two views in the right-hand pane.** At the top of the pane, above its title block, a small tab strip: **Notes** keeps the pane's current content (sticky notes while writing, chapter notes on the Notes tab), and **Records** replaces it with the records list. The tabs show on the Manuscript and Notes bottom tabs; Outline and Darlings keep their cards and snapshots as they are.
- **The pane's width is the records width.** Records uses the resizable right pane (adr-004), from its 220 px minimum to its wide limit; descriptions wrap and the list scrolls inside the pane. The page, Notes page, left chapter list, and bottom tabs are untouched.
- **Behind Show More Features.** With the switch off the tabs are hidden and the pane stays Notes; the records file is left untouched for its return.
- **A record is a title and a plain-text description.** Clicking a title unfolds the description; clicking it again folds it. The description is multiline plain text, edited in place and saved after a short pause. No formatting, no embedded HTML, so no markup can be broken or hidden in it.
- **Add and delete.** **+ Record** creates a row with its title input focused; Enter saves, Esc discards an empty one. A bin on the record's right asks **Delete “title”?** in the row itself, with Delete and Cancel; Esc cancels. Nothing is deleted until the writer confirms, and there is no modal.
- **Folders.** Inside the pane, records are grouped under **Unsorted** and named folder headings. A folder can be created, renamed in place, and deleted with confirmation; deleting it moves its records to **Unsorted** rather than deleting them. **+ Record** adds to Unsorted, and a folder's **+** adds there; a record's folder is changed from its expanded row.
- **Quick search.** A search field at the top filters the list by title and description as the writer types. Matching records are shown with their folder open, descriptions that match are unfolded, and every match is highlighted in the text without changing it. Clearing the field restores the list.
- **One set of records for the library.** Records live in the library, not in a book: every book's right-pane Records shows the same characters, items, and places. Folders replace the need to pin a character to a book, and a record edited in one book is already right in the next. The store is a single `records.json` at the library root, never `book.json` or `library.json`.
- **Safe across two devices.** Records merge per field by their last edit, and a deletion leaves a tombstone so an older copy cannot bring the record back. Two devices adding different records, or editing the title on one and the description on the other, keep both.
- **Backed up.** The automatic daily zip includes `records.json`, and File → Backup Book… copies it beside the book folder so a single-book backup still holds the shared records. A records file that is only in iCloud is named as left out, not waited on forever.
- **Quiet and desktop only.** No dialog, toast, or prompt appears while writing. The Records view is a fork feature and does not reach Pocket.

### Out of scope

- Record types, tags, links between records, images, timelines, or a relationship graph.
- Rich text, Markdown, tables, or attachments in a description.
- Per-book record sets, pinning records to books, or merging two records.
- Searching the manuscript from Records, or showing records beside the page while writing.
- Drag-and-drop ordering of records or folders.

## Capabilities

### New Capabilities

- `story-records`: the right-hand pane's Records view — records and folders shared by the library, in-place editing, deletion confirmation, search and highlighting, the library-level store, its merge rules, and its backup coverage.

### Modified Capabilities

- `backup`: the manual backup of a book also copies the library's `records.json`, and the daily zip includes it, so the shared records survive either kind of backup.

## Impact

- **New fork files:** `neo-ext/records.js` (right-pane tabs, store client, save queue), `neo-ext/records-list.js` (list, folders, search, rows), `neo-ext/lib/records-store.js` (pure store model, validation, and field-level merge), `neo-ext/lib/records-search.js` (matching and highlight ranges), `neo-ext/records-main.js` (the `records.json` reader/writer and validation), plus CSS and locale strings.
- **Preload:** two methods inside the existing `NeoForkNative` block — read and write — with no general filesystem access.
- **One new upstream seam:** `backup-worker.js`'s library-root allowlist gains `records.json` (seam 11, a single condition), plus its anchor in `neo-ext/check-seams.js` and the AGENTS seam table. `neo-ext/main.js`, which is fork-owned, copies `records.json` into a manual backup.
- **No new dependency and no network.** Plain text is stored and rendered with `textContent`; search highlights use the CSS Highlight API and write nothing to the page.
- **Tests:** pure merge and search tests, a main-process store validation test, a real-launch `npm run test:records` covering the view, editing, deletion, folders, search highlighting, persistence, two books, the backup zip, and the no-book-writes guarantee.
- The library grows by one JSON file; the fork version becomes `1.6.0+fork.5` when this ADR is archived.
