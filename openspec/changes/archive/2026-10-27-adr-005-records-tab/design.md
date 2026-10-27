# Design

## Context

See `proposal.md` for motivation and `specs/story-records/spec.md` / `specs/backup/spec.md` for the behaviour contracts.

The right-hand pane (`#side-pane`) is core NEO: it slides in on hover, pins open, and holds whichever list the bottom tab wants — sticky notes while writing, chapter notes on the Notes tab, loose cards on Outline, snapshots on Darlings. ADR-004 gave it a resizable width and a handle. Upstream owns it; the fork may inject children and CSS, but must not rewrite the Notes page or the left chapter list.

The records are library-wide, not book-wide. Every other persisted thing in the fork lives inside a book folder because that is the only write boundary NEO gives a renderer. A library-root file needs a small fork-owned main-process store and a one-line seam in `backup-worker.js`, whose library-root allowlist currently admits only `book-*`, `library.json`, and `_catalog.txt`.

Constraints: plain text only; no network; records must survive two devices editing the same library; the daily backup must include them; the renderer never touches the filesystem; `records.json` must never be written over an iCloud placeholder.

## Goals / Non-Goals

**Goals:**

- A second view in the pane with the writer's notes, available while writing: inline add, inline confirm, no dialog.
- One plain-text record model and one file, shared by every book.
- Field-level merging and tombstones, so two devices cannot erase each other's characters.
- Search over titles and descriptions with CSS Highlight API marks only.
- Daily and manual backups keep the records.

**Non-Goals:**

- Rich text, record types, links, images, or ordering by drag.
- Per-book record sets or pinning a record to a book; folders cover that need.
- Records on the shelf or in Pocket.
- A second database or index; the file is read whole and is small.

## Decisions

### D1. Two views in the right-hand pane

`neo-ext/records.js` injects the tabs and the records view into the existing pane, all with `neo-` ids:

```
#side-pane
  #neo-side-tabs          Notes | Records, above the title
  #side-head             (core: title + pin)
  #sticky-list            (core, hidden while records is showing)
  #notes-side             (core, hidden while records is showing)
  #loose-list             (core, hidden while records is showing)
  #side-cards             (core, hidden while records is showing)
  #snap-list              (core, hidden while records is showing)
  #neo-records-view       search, + Record, + Folder, folder groups, rows
```

The tabs sit at the very top of the pane, above the title block and pin, and show while the pane is open on the Manuscript or Notes bottom tabs and Show More Features is on. Outline and Darlings keep their own pane content without tabs. Choosing **Records** adds `neo-records-open` to the pane; CSS hides the core lists and unhides the records view. Choosing **Notes** removes the class and leaves the core content exactly as it was. Nothing in `#aux-paper`, `#notes-nav`, `#editor-view`, or the bottom tabs is hidden or rewritten.

**Notes is the view the pane opens with**, and the choice is kept only in memory while the book is open; it is not persisted. Leaving Manuscript/Notes for Outline or Darlings returns the pane to Notes. Show More Features off hides the whole strip and forces Notes.

The pane's hover-close, pin, and ADR-004 width are untouched. The records list scrolls inside the pane; the search/toolbar stick to its top while the list moves.

Folders are headings inside the list, not a second navigation column: **Unsorted** first, then each named folder, each folding/unfolding and carrying its own **+**. A folder heading can be renamed in place and deleted after an inline confirmation; its records move to Unsorted. This fits the 220 px minimum as well as the wide pane.

The list is rebuilt from the model after selection, search, folder, blur, and remote-merge changes, but never over the row that currently has focus: rebuilding a `contenteditable` description under the caret would move it to the start. Open rows, folded folder headings, and the query are held in memory.

Esc is handled on `window` in the capture phase while Records is showing. NEO's own capture listeners can otherwise turn a bare Esc into "back to the shelf"; capture at the window is early enough to stop that. In the search field it clears the query, in a delete or folder confirmation it cancels, elsewhere it does nothing.

`MutationObserver`s watch the bottom tab (`#tabs`) and `#editor-view` so leaving Manuscript/Notes removes the records view and the pane returns to its core content. No notes element is hidden with `hidden` or changed to `contentEditable=false`; the notes page keeps its own focus and save flow.

Alternatives considered: a new DOM seam in `index.html` (rejected — the fork can inject this without touching upstream); records on the Notes page and in the left nav (rejected by the writer — the feature belongs where the notes already slide in while writing); a separate records window (rejected — it would interrupt writing).

### D2. Plain text, stored as text

A description is `contenteditable="plaintext-only"` with `white-space: pre-wrap`. The browser keeps line breaks but refuses rich markup; NEO reads and writes `textContent` and never sets `innerHTML` from a record. Titles and folder names are `textContent` too. Pasting carries text only.

This is why the feature is plain text rather than reusing the notes page editor: HTML would need sanitising, and the search highlight needs text nodes that are not rewritten. `plaintext-only` is supported by the Chromium Electron ships; `records.js` checks the property and falls back to a textarea-like `contenteditable` with paste interception if a future runtime drops it. Reading an editor uses `innerText` (normalised to `\n`, trailing newline trimmed) and writing uses `textContent` into a `white-space: pre-wrap` box, because `textContent` of the browser's `<div>`/`<br>` lines would otherwise run the lines together.

Edits are debounced 600 ms (the notes pages use 800 ms; a lookup table wants its update sooner) and flushed when the writer leaves Records, switches the bottom tab, closes the book, or the window hides. A focused row is not re-rendered by its own save; the next blur or explicit redraw paints it from the model. The title uses a text button; a double-click turns it into an input for renaming without changing the folded state, Enter/blur commits, Esc restores, and an empty title restores the old one.

### D3. One file, field-level merge

`records.json` at the library root:

```json
{
  "format": 1,
  "folders": [
    { "id": "…", "name": "The Silver Series", "nameAt": 0, "createdAt": 0, "deletedAt": 0 }
  ],
  "records": [
    { "id": "…", "folderId": null, "title": "John Silver",
      "titleAt": 0, "body": "…", "bodyAt": 0, "folderAt": 0,
      "createdAt": 0, "deletedAt": 0 }
  ]
}
```

- IDs are UUIDs from `crypto.randomUUID()`; `folderId: null` means Unsorted.
- Every `…At` stamp is a whole millisecond clamped on read/write to `[0, Date.now() + 60_000]`. A device clock a day ahead otherwise wins every merge forever and makes the field uneditable everywhere else; the clamp keeps a bad clock to a short, recoverable lead.
- Each editable field carries the time it last changed, so a title edit on one device and a description edit on another both survive. A record or folder with a `deletedAt` is deleted: the tombstone wins over every content edit, and there is no restore in this change, so an older copy cannot bring it back. Tombstones are kept for exactly that reason.
- Folder deletion stamps the folder and moves its records to Unsorted with a new `folderAt`, so the move merges as an edit. A record that still points at a deleted or unknown folder is shown under Unsorted; the merge does not delete it.
- Merge is a pure union: for each id, choose the newer field; missing ids are copied; unknown `format` versions are refused, not guessed. Ties keep the existing value, so repeated merges are idempotent.
- Folder names are trimmed, case-insensitively unique, one level, and `Unsorted` is reserved. Titles are trimmed and may be repeated.
- Records sort by title, folders by name; the Unsorted group comes first. No manual order is stored.

`neo-ext/lib/records-store.js` owns normalize/validate/merge; `neo-ext/lib/records-search.js` owns matching and ranges. Both are pure and fully unit-tested.

Alternatives considered: a whole-file last-write-wins store (rejected — one save would erase the other device's character); an append-only event log (rejected — every keystroke would grow the file and need compaction); per-book files with copies (rejected — contradict the shared world).

### D4. A guarded main-process store

`neo-ext/records-main.js` registers two handlers in the fork's existing `init`:

- `neo-ext:records-read` — fixed path `path.join(libraryDir(), 'records.json')`, no name from the renderer. The seam-7 `init` also receives core's `whenLocal`, so the wait is asynchronous (`whenLocal([file], 8000)`); the synchronous `cloudOnlyAmong` stat is used only for the cheap pre-write check. If the file is missing, return an empty store. If it never arrives, answer `{ ok: false, reason: 'cloud' }` rather than block the main process. Malformed JSON returns `{ ok: false, reason: 'unreadable' }`; edits stay in the view and in memory, the view explains why nothing is being written, and no save is attempted until the file reads.
- `neo-ext:records-write` — validates the payload with the pure store validator, refuses if the current file is a cloud placeholder, then **re-reads and merges the disk copy with the payload in the main process**, checks the **merged** store against 4 MB, copies the old file to `records.json.bak`, and writes through core's `writeFileDurable` (tmp, fsync, rename, and its EPERM/EBUSY retry for Windows and sync clients), passed in through the same seam-7 `init` call. It returns the store it wrote, and the renderer adopts it. The renderer never passes a path or a filename.

Merging inside the write closes the gap a renderer-side read-merge-write leaves: if device A writes between B's read and B's write, B's stale copy would otherwise replace A's new record with no tombstone to recover it. A save already in flight is followed by one more merge/write if edits arrived, never a queue of writes per keystroke. The renderer reads on opening Records and on window focus/visibility; the main handler is the one that guarantees the merge.

iCloud is handled with the same rule as chapters: no write goes over a placeholder, and a read that is still waiting is reported in the view with a quiet line and a Retry, not a modal.

The 4 MB cap is a visible state, not a silent drop: a refused save leaves the text on screen, shows a persistent line saying records could not be saved and why, and clears it only after a later write succeeds. The view also caps a single description at 100,000 characters and a title at 200, so the cap is reachable only by a large, deliberate store.

### D5. Search and highlighting stay out of the file

`records-search.js` returns, for a query:

- `test(title, body)` — case-insensitive substring over the two plain strings, trimmed; whitespace-only means no query.
- `ranges(text, query)` — non-overlapping `{ start, end }` ranges for every occurrence.

The view filters rows to matches, opens rows whose body matched, and paints ranges over the title button and description text nodes with `CSS.highlights.set('neo-record-search', new Highlight(...ranges))`. The highlight CSS lives in `neo-ext/neo-ext.css` with a `::highlight(neo-record-search)` rule; it never becomes markup and never reaches `records.json`. Ranges are cleared before every redraw, when the query empties, and when Records closes.

Search looks through every group; clearing restores the grouped list. A description that matched is unfolded so the highlighted words are visible; a title-only match leaves it folded. Matching uses `toLocaleLowerCase()` and does not normalise accents, so “Jose” does not find “José” — a deliberate, predictable rule for this pass.

### D6. Backup: one seam, one fork-side extra

`backup-worker.js`'s root allowlist gains `records.json`:

```js
name === '_catalog.txt' || (name.startsWith('records.json') && !name.endsWith('.tmp'))
```

That is seam 11, recorded in `neo-ext/check-seams.js` and the AGENTS seam table. `startsWith` keeps the last-readable `records.json.bak` in the daily zip too, mirroring how `library.json.bak` already travels; the `!endsWith('.tmp')` guard excludes a half-written temporary file a crash may have left behind. The zip carries the same iCloud naming and left-out list it already uses for chapters.

Manual backup is fork code: `neo-ext/lib/copy-book.js` gains an `extraFiles` option (source path + name inside the backup). `neo-ext/main.js` passes the library's `records.json` and, when it exists, `records.json.bak`. Each extra file goes through the same `awayNow`/`sleep` budget and retry as the book's files, is written into the `.partial` folder before it is renamed into place, pushes its name into the same `skipped` list, and a name that would collide with a book file is refused rather than overwritten. A missing records file adds nothing; a cloud placeholder is named and the copy is marked incomplete.

Alternatives considered: storing records inside each book folder (rejected — no longer shared); widening the backup allowlist to every file (rejected — the library folder may hold unrelated documents); a second zip (rejected — one backup must hold the writer's work).

### D7. Show More Features, Pocket, and the notes regression

Records sits behind File → Show More Features. With it off, the whole tab strip is hidden and the pane returns to Notes; the store is neither read nor written. The data stays in `records.json` for the switch's return. The module subscribes to the fork's `window.neo.onMenu` `moreFeatures` message.

Pocket's copy list is unchanged; the fork layer is not there, so `records.json` is simply not read on a phone (the daily backup still carries it when made on desktop).

The existing notes renderer is untouched. Every records element is new and lives inside the pane; the pane's own lists are hidden with the `neo-records-open` class only while Records is showing. The Notes page, the left chapter list, the bottom tabs, their scroll positions, their save flows, and their keyboard regions are unchanged. `Cmd/Ctrl+F` keeps NEO's Find behavior, which still searches the page for the current bottom tab; Records has its own search field. `Cmd/Ctrl+S` keeps taking a snapshot.

### D8. Tests

- `scripts/records-store.test.js` — empty/missing store, validation (ids, types, size, reserved names, duplicate folders), merge of new records, per-field edits, folder moves, tombstones, idempotence, unknown format.
- `scripts/records-search.test.js` — case, whitespace, title/body matches, ranges, adjacent/overlapping occurrences, no match.
- `scripts/records-ipc.test.js` — path fixed to `records.json`, payload rejection, cloud refusal, `.bak` and durable write (in a temp library, no Electron window).
- `scripts/records.e2e.js` (`npm run test:records`) — real launch and throwaway library:
  - pane tabs and back to Notes; Notes is the opening view; tabs only on Manuscript/Notes; Simple NEO hides them while keeping the file;
  - add, rename, expand, edit, survive reload; type, wait past the debounce, type again, and keep the caret and text intact; delete confirm/cancel/Esc; folder create/rename/delete moves to Unsorted; record moved by select;
  - Esc in Records does not return to the shelf; Esc in search clears it; Esc in a confirmation cancels;
  - search in title and description, highlight present via `CSS.highlights`, clearing restores the grouped list; no match message;
  - same records in a second book; two merged stores including a merge followed by a delete; unreadable file message and unchanged bytes; cloud placeholder refusal (if the test helper supports it);
  - Outline and Darlings keep their pane content and show no tabs; the pane's `sticky-list` returns on Notes; Cmd+F does not focus the records search;
  - chapter file mtimes and `library.json` unchanged across the records actions, with the baseline taken after Records is already open (core's tab switch writes `book.lastPosition`); structural undo unchanged and no new chapter undo entry;
  - daily zip contains `records.json` and `.bak`, not `.tmp`; manual Backup Book folder contains both; no records means no invented file.
- `scripts/records-backup.test.js` drives the real backup worker with a records file, its `.bak`, and a `.tmp`.

## Risks / Trade-offs

- **A library-root file needs a backup seam** → one condition in the allowlist, guarded by `check-seams.js` and a zip test.
- **Two devices write at the same moment** → the main-process write re-reads and merges before renaming, so a record added between another device's read and write is not lost; only two writes racing inside the same re-read window can keep one field's later version, which is the guarantee a shared file gives without a lock.
- **Clock skew** → last edit is by device clock; an earlier clock can lose a field. The merge is deterministic and never deletes a record without a tombstone. A future revision can add a revision counter if this matters.
- **`contenteditable="plaintext-only"`** → Chromium supports it today; the fallback intercepts paste and strips markup, so the model stays plain text either way.
- **A very large store** → writes are refused above 4 MB; the view explains. Descriptions are prose, not attachments.
- **Global records show in every book** → deliberate; folders keep series apart, and deleting a record is tombstoned and confirmed.
- **Search accent-insensitive matching** → not offered in this pass; documented so it is not mistaken for a bug.
- **The records view hides the pane's notes while active** → the writer switches back with one click; the pane's lists, their scroll positions, and the Notes page are retained.
- **The pane can be as narrow as 220 px** → the list, search, folder headings, and confirmations are built for that width; descriptions wrap, and the pane can be widened with ADR-004.

## Migration Plan

None. A missing `records.json` is an empty store. An unreadable file is left untouched and reported; no automatic rewrite. If the feature is removed, the file remains a plain JSON document in the daily backup.

## Open Questions

None.
