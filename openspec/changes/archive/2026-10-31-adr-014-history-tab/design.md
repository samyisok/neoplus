# Design

## Context

The right-hand pane already hosts plugin views through `NeoRecords.registerView`
(Notes, Records, Inventory), which pads and gates a tab by Show More Features
and by the current bottom tab. Recording happens in two renderer modules that
replace text with `execCommand('insertText')` and then stop: `neo-ext/thesaurus.js`
(`replace`) and `neo-ext/rephrase.js` (`replace`). Per-book sidecars already have
a worked pattern in `neo-ext/inventory-main.js`: a fixed file name, a book id
instead of a path, iCloud waits, read-merge-write, `.bak`, a size cap, and core's
durable write. See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**

- One append-only, per-book replacement log shared by every tool that replaces text.
- Recording after the insertion succeeded only, without touching the replacement.
- A read-only pane view that survives two devices and a backup round trip.
- Failure that is visible in the view and silent over the manuscript.

**Non-Goals:**

- Restoring, undoing, deleting, filtering, or exporting entries.
- Recording plain typing, paste, spellcheck corrections, or formatting.
- A library-wide log, a Pocket view, or retention pruning.
- Any change to a chapter, notes page, `book.json`, or `library.json`.

## Decisions

### D1 — A book-folder sidecar, `neo-ext-history.json`

The log describes one manuscript and must travel with it, so it lives in the book
folder next to `neo-ext-inventory.json`. `book.json` is upstream's metadata file
and `library.json` is library-wide; neither is a fit. Backups already copy every
file in a book folder (`walk` in `backup-worker.js` visits the book), so no new
backup rule is needed, and deleting the book takes the log with it.

Alternative rejected: storing the log inside `book.json`. A merge with another
device would then fight NEO's own `book.json` generation check, and upstream
could rewrite the file at any time.

### D2 — Append-only entries merged by id; order is derived

`{ format: 1, entries: [...] }`. Each entry is immutable and carries an `id`
stamped by the main process. Merging is a union by `id`: an id already present is
kept once, so two devices add to each other instead of overwriting. There are no
deletions, so no tombstones are needed. Newest-first order (`at` descending, `id`
descending as a stable tiebreak) is computed on read, never stored, so a merge
cannot corrupt it.

### D3 — The main process stamps `id` and `at`

The renderer supplies the meaning (`tool`, `label`, `from`, `to`, chapter
snapshot); the main process supplies `id` (`crypto.randomUUID()`) and `at`
(`Date.now()`) before merging and writing. A renderer cannot mint a colliding id
from two devices, and a clock skew on one device cannot make an id ambiguous.

### D4 — One IPC round trip per replacement: read, merge, append, write

`neo-ext:history-add` re-reads the file, merges it with the payload, appends the
new entry, validates the whole store, and writes. Replacements are rare,
user-initiated events, so the cost is irrelevant next to correctness, and an
entry cannot be lost in a debounce buffer when the window closes.

Alternative rejected: caching entries in the renderer and writing on a debounce,
as Inventory does. Inventory holds long-lived state that must be edited before it
is written; History writes exactly once per event, so a write-behind cache would
add state and a lost-entry window for nothing.

### D5 — Limits and refusal

- 5,000 characters per side (Thesaurus inserts one word, Rephrase at most 1,200,
  so the cap is a guard, not a common path), 80 for a label, 200 for a chapter
  title, 80 for a chapter id. The main process truncates a longer side and marks
  the entry (`shortened: 'from' | 'to'`), so the view can say the text is not
  whole rather than silently losing the tail.
- 10,000 entries and the shared 4 MB file cap (`neo-ext/lib/records-file.js`).
- An entry that pushes the store past either cap is refused with `large`; the
  file is not written, so recorded entries always survive intact. The view says
  the newest replacement could not be recorded.
- A file that fails to parse is never overwritten: the read falls back to `.bak`
  for display, and the write is refused as `unreadable` until the file is fixed.

### D6 — The chapter is a snapshot, read through the adapter

`api.js` already owns every read of `book`, `chapterOrder`, and the chapter
titles, so the snapshot is one new helper there:

```js
api.chapterSnapshot() // { chapterId, chapterNumber, chapterTitle }
```

It returns the current chapter's id, its 1-based position in `chapterOrder` (0
when the chapter is not in the order), and the writer's own title for that
chapter, or an empty string when it has none. Keeping the default name out of
the snapshot means the view can show “Chapter 3” once rather than “Chapter 3 ·
Chapter 3”.

A later reorder or retitle does not rewrite history, which is the point: the
entry says where the replacement happened then.

Thesaurus can also replace in `#aux-editor` (a notes page) and `.fn-text` (a
footnote). Those calls record with `chapterId: ''` and `chapterNumber: 0`, so the
view shows no chapter. Rephrase only ever runs inside `.chapter-body`.

### D7 — Recording is gated, guarded, and never throws

`record` returns immediately unless Show More Features is on, a book is open, the
bridge exposes `historyAdd`, `from` and `to` are non-empty and different, and the
tool is named. A missing bridge (Pocket, an older install) means a silent no-op.
A failed write is appended to `neo-errors.log` and reflected in the view's status
line; it never toasts, never blocks, and never touches the edit.

The recorder captures the book id before it hands the entry to the main process
and drops the result if the writer has opened another book meanwhile, so the
view can never adopt book A's store for book B. `record` resolves to a boolean
and never rejects; callers are not obliged to await it.

### D8 — `NeoHistory.record` is the only recording API

```js
window.NeoHistory = { record({ tool, label, from, to, inChapter }) }
```

The recorder lives in its own small module, apart from the view, because the
tools record whether or not anyone opens the tab: the recorder owns the guard
and the chapter snapshot, the view owns only display. `inChapter` says whether
the replacement happened in a chapter body rather than a notes editor or a
footnote. Each tool calls it after its insert succeeded and after it has the
text it actually inserted: Thesaurus after
`rules.smartApostrophes(rules.applyCase(...))` has run, Rephrase with the chosen
card's text. On success the recorder asks the view to refresh, so an open
History tab shows the new entry at once. A future tool adds one call, no pane
change.

### D9 — The view registers last and renders text only

`neo-ext/history.js` builds a `div` view and calls
`NeoRecords.registerView({ id: 'history', label: x('History'), element, show, hide })`.
Loading it after `neo-ext/inventory.js` in `index.html` makes the strip read
Notes | Records | Inventory | History, and `registerView` already inherits the
Show More Features gating, the Manuscript/Notes restriction, `setView`, and the
flush-before-hide behaviour.

The view has a status line and a list. Each row is three text nodes (the
where-line, the replaced text, the replacement) written with `textContent`, and
there are no editable controls, so there is nothing to write back. The stored
`at` is formatted once for display with the writer's own locale (`toLocaleString`)
and is never recomputed from the clock. `show` reads the current book if the
loaded book differs or a previous read failed; until that read answers, the view
shows its loading state, never the previous book's rows. `hide` only clears
timers.

### D10 — Module split

| File | Owns |
|---|---|
| `neo-ext/lib/history-log.js` | Pure: limits, `empty`, `normalize`, `append`, `merge`, `sorted`, size check |
| `neo-ext/history-main.js` | `neo-ext-history.json`: book-id path, iCloud wait, read, read-merge-write, `.bak`, refusal reasons |
| `neo-ext/history-record.js` | The guard, the chapter snapshot's inputs, `NeoHistory.record` |
| `neo-ext/history.js` | The pane view, its status strings, `NeoHistoryView.refresh` |
| `neo-ext/api.js` | `chapterSnapshot` — the current chapter's id, number, and display title |
| `neo-ext/main.js`, `preload.js` | Handler registration and the two bridge methods |
| `neo-ext/thesaurus.js`, `neo-ext/rephrase.js` | One guarded call each, after a confirmed insert |

## Risks / Trade-offs

- **A write per replacement on an iCloud/Syncthing folder** → replacements are
  rare and the payload is small; the read-merge-write means a slow upload never
  blocks the edit and the next replacement merges cleanly.
- **A recording failure is easy to miss** → the view's status line names it and
  `neo-errors.log` holds the detail; a writer who never opens History still was
  not interrupted, which is the intended trade.
- **The log grows without bound** → 10,000 entries and 4 MB, both refused rather
  than trimmed. A writer who reaches the cap is told in the view; no entry is
  silently dropped.
- **A truncated side could lose the tail of a long paragraph** → the cap is above
  every tool's own maximum, and a truncated entry says so instead of pretending
  to be whole.
- **Chapter numbers age** → a snapshot is more honest than a live lookup; the
  stored id and title still identify the chapter if the order changes.
- **History is not the Snapshots feature** → History holds metadata about tool
  replacements and restores nothing; Snapshots still hold whole chapters and
  remain the way to get words back. The tab's read-only text says so where it
  could be mistaken for a restore list.

## Migration Plan

None. The file is created by the first recorded replacement. Without the file,
the view shows an empty history, and books from earlier versions need no change.
Turning Show More Features off hides the view without touching the file.
