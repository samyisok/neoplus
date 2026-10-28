# Design

## D1. Where the ledger lives: a book sidecar, not the chapter HTML

Three candidates were weighed:

| Option | Why not |
|---|---|
| Metadata in chapter HTML (`data-*` per phrase) | Chapters are rewritten wholesale by the editor, snapshotted, restored, and synced per file; a transaction would have to survive every one of those rewrites, and two devices editing different transactions would conflict inside one HTML file. ADR-006 already ruled that feature data does not go into a chapter. |
| `records.json` (library root) | Records are library-wide by design; an inventory belongs to one book and its chapter order. Sharing the file would mean every book's ledger merges with every other's. |
| A book-folder sidecar | Travels with the book, is copied by both backups with no new rule, and merges by id without touching a chapter. |

Chosen: **`neo-ext-inventory.json`** in the book folder, read and written by `neo-ext/inventory-main.js` through a fixed name (`libName`-guarded), with a private `neo-ext:inventory-read/write` pair modelled on the records store: read waits for iCloud instead of blocking, write re-reads and merges, keeps a `.bak`, and uses core's durable write.

Shape:

```
{ format: 1,
  items: [{ id, name, nameAt, category, categoryAt, createdAt, deletedAt }],
  transactions: [{ id, itemId, chapterId, sectionId, paragraph, quote, hash, amount, at, removedAt }] }
```

## D2. Anchoring a transaction: quote first, structure second

An offset into chapter HTML breaks the moment anything above it changes. A bare section id is not universal: a paragraph only carries `data-sec-id` when a section note exists, and core drops that id when a section is turned into a chapter or sent to a loose card (`app.js:10470`, `10527`). Chosen anchor:

- `chapterId`, the section id the phrase belongs to (via the same claiming rule core's `sectionOf` uses: the paragraph carrying the note id, up to the next claimed id), or `''` when the paragraph has none.
- `quote`: the selected phrase, normalised (whitespace collapsed, ≤120 characters).
- `paragraph`: the paragraph's ordinal in the chapter at creation — used to order the log and to choose between repeated quotes, never as identity.
- `hash`: a short hash of the section's normalised `textContent` at creation. The input is defined as the text of the paragraphs the section claims, ghosts excluded and screen marks ignored (the same text a saved chapter yields), so the hash computed from the live page and the hash computed from saved HTML agree.

Validation (`inventory-anchor.js`, pure, given anchors and the book's searchable text): the text searched is every chapter's normalised text, every loose card's text, and the text held by a card that carries a whole chapter or scene, because moving a section to a loose card removes it from the manuscript without deleting the words (`app.js:10519`). A chapter whose file cannot be read (a cloud placeholder or an unreadable file) is marked unknown rather than empty, and its anchors are deferred, never retired — the same rule core applies to an empty chapter read.

1. Section text unchanged (hash matches) → keep; no search.
2. Section id now in another chapter, or the section text changed but the quote is still there → keep, follow the section, update `chapterId`/`paragraph` when the quote's position moved.
3. Quote gone from that section but present elsewhere in the book's chapters → follow it: update `chapterId`/`paragraph`; if it appears more than once, prefer the occurrence in the recorded section, then the occurrence nearest the recorded position, and otherwise keep the anchor rather than retire on a guess.
4. Quote present nowhere in the book's searchable text, with every chapter readable → retire (`removedAt`), permanently.

Retirement is therefore a property of the book's text, not of one chapter's HTML: a joined chapter, a merged section, a loose card placed back, or a section moved without its id all keep their transactions as long as the phrase survives. Deleting to Darlings removes the phrase from the chapters, so those transactions retire, exactly as the spec says.

Where it runs: on the changed chapter after its save settles (800 ms debounce), when the book opens, after a structural change, and when a chapter arrives from disk (`refreshFromDisk` adoption) or the window regains focus after another device wrote. Never per keystroke, and never for an unchanged chapter.

Short quotes (a bare number, for example) are inherently ambiguous: the same “50” may exist in a dozen places. The anchor never retires while any copy survives, and the log's manual **Remove transaction** is the writer's correction when a transaction has outlived its words. Copy/paste is deliberately not a transfer path: a copied quote has no transaction, and the original keeps its own.

## D3. Balances and ordering: per-chapter aggregates, prefix sums

- Chapter order is `book.chapterOrder`; inside a chapter, transactions sort by `paragraph`, then `at`, then `id`. That makes chapter 6's four health changes read in page order.
- Balances as of chapter *N* = sum of every transaction in chapters `1..N`. Each chapter keeps an aggregate per item, and the view keeps a running prefix, so switching chapters is a subtraction/addition of aggregates, not a rescan of the whole ledger.
- A change invalidates the changed chapter's aggregate and every prefix after it; rebuilding is O(transactions) once, not per keystroke. The write path replaces the whole store from the main process (the records pattern), so aggregates are simply rebuilt for the chapters that changed rather than patched incrementally.
- Reconciliation reads the in-memory `chapterHTML` map, not the disk, so a pass costs string work over text the page already holds; a per-chapter cache keyed by the exact HTML string keeps the common case to one lookup per chapter. The ledger is read once per book open and kept in memory; writes are debounced (600 ms) and merged. The page's text is read only when validation runs, never for the balance display. Reconciliation keeps a per-chapter cache keyed by that chapter's exact HTML string, so an unchanged chapter costs one map lookup; and a reconcile that changes nothing does not mark the ledger dirty, so opening a book or regaining focus never rewrites the file and never fights another device.

Cache and the writer's expectations agree because the pane is told the open chapter (`currentChapterId`) and re-renders on chapter switch.

## D4. Two devices: append-only ids, retirement wins

- Items and transactions are append-only and id-keyed. Item `name`/`category` carry their own stamps; the newer wins.
- A retirement is a tombstone with its own time; a merge takes the tombstone and never resurrects the transaction, the same rule records already use for tags.
- Write path: renderer sends the whole ledger; the main process re-reads disk, unions by id, checks the size cap, writes durably, returns the merged ledger, and the renderer unions again. This is the records pattern, chosen for the same reason: two devices add to each other instead of last-write-winning.
- Caps: 50,000 transactions, 8 MB file, 200 characters per item name, 120 per quote. Over-cap writes are refused, not truncated, so nothing disappears quietly.

## D4b. Book scope: who tells Inventory which book

The ledger is the book's, so the feature needs the open book and its chapter order, which the page does not expose to the fork today. `api.js` — the fork's only adapter to core — gains guarded reads: `bookId()`, `currentChapterId()`, `chapterOrder()`, and `chapterText(id)` built from core's chapter HTML map.

`api.js` also exposes `sectionOf(body, paragraph)`, the guarded read of core's own claiming rule, so the anchor's section and the section note cannot drift apart; a parity test compares the live body with the saved HTML.

Events come from what the page already emits rather than a new upstream seam: a `MutationObserver` on `#editor-view` and `#chapters`, a `focusin` listener on chapter bodies, a throttled scroll check on `#paper-scroll` comparing `api.currentChapterId()`, and `visibilitychange`/`focus` for disk refreshes. Every write re-checks `api.bookId()` against the ledger's book before saving; a mismatch reloads instead, so book A's ledger can never be written into book B's file.

## D5. The pane's third tab: one strip, one `setView`

The tab strip already lives in `neo-ext/records.js` with a single `setView` (`notes` / `records`) and a rule that a view may only open on the Manuscript or Notes bottom tab while Show More Features is on. Rather than a second strip, `records.js` gains a tiny view registry:

```
NeoRecords.registerView({ id: 'inventory', label, element, show, hide })
```

and `setView` handles three ids. Inventory supplies its own element and its own show/hide (render on show, refresh on chapter change). Records keeps ownership of the strip, keyboard movement (Left/Right/Home/End), Simple NEO gating, and Esc behaviour, and Inventory inherits all of it. This is not a cosmetic insertion: `records.js` hard-codes `'records'` in `render`, `setView`, the `neo-records-open` class, `applyTabs`, `tabList`/`moveTab`, the `tabRecords.hidden` branches, the F6/Tab focus keys, the Esc chain, and `loadStore` gating, so each of those grows a third case. Leaving Inventory starts its flush rather than awaiting it inside the synchronous `setView`; the save continues after the view closes and is never dropped, which is what the spec requires.

The registered view is hidden when Show More Features is off; the ledger is not read in that state.

## D6. The selection menu: one phrase, two providers

The native menu is built in the main process a moment after the right-click, so the renderer captures the selection first. Today the phrase channel carries `{phrase, hasTag}` for records. It now also carries the anchor the inventory needs and a boolean that says an inventory item applies:

```
setContextPhrase(phrase, hasTag, { chapterId, sectionId, paragraph, quote, inventory })
```

`neo-ext/main.js` builds the phrase menu from a list of providers instead of one hard-coded item (`record-tags-main.menuItem`, plus a new `inventory-main.menuItem`), so a third provider is a table row. This is a second, separate channel from `lib/menu-registry.js`, which owns single-word lexical items; folding phrases into it would offer Create/Find Record… on words that have no tag context. A click sends `{ type: 'neo-ext', action: 'inventory-open', phrase, anchor }`; `boot.js` routes it. The renderer gate is unchanged: inside an editable chapter body, Show More Features on, selection within one paragraph, ≤120 characters. words with no selection offer nothing (assumption recorded in the proposal).

`word-context.js` does not compute the anchor: it publishes the selection (phrase, range, paragraph, chapter) to a small renderer-side provider list, and Inventory answers with the anchor it owns. Records stays a provider of that list, and a records file that cannot be read no longer disables Inventory.

On macOS a one-word selection never reaches the native menu — core shows the Look Up popup instead (`app.js:14655`) — so the same provider list feeds that popup through the existing Look Up seam, and Inventory… appears there for one word. The menu payload grows to `{ phrase, hasTag, inventory, anchor: { chapterId, sectionId, paragraph, quote } }`; `preload.js:95`'s `setContextPhrase` signature changes with it, and `word-context-main.js` validates the anchor fields (ids ≤80 characters, ordinal, quote ≤120) before storing.

The modal itself (`inventory.js`) is plain DOM in the page, one instance, refuses to open over another NEO dialog, and closes on Esc or Cancel without writing.

## D7. Jumping to the phrase

`api.js` gains one guarded adapter, `revealPhrase({ chapterId, quote, paragraph })`: switch to the Manuscript, scroll the chapter into view, find the paragraph (by ordinal, then by search), locate the quote inside it, select it with a `Range`, and scroll it to the center. It never touches `chapterHTML`, the undo stack, or the save state; `goToSegment` is the model. The quote can be split by inline markup (`he paid <em>50</em> gold`), so the search walks the paragraph's text nodes and builds one `Range` across them. It returns whether the phrase was found, and the log offers a line as a jump only while its phrase can still be located — a transaction that cannot be found has already been retired by D2, so no line jumps to nothing.

## D8. Failure and limits

- Same-name items fold on merge: two devices creating “gold coin” leave one item, with every transaction re-pointed to it.
- A log line can be removed by hand after an inline confirmation; it is a tombstone like a text deletion, so a wrong anchor or a duplicate is recoverable.
- Unreadable ledger: Inventory says so and never writes; the file is left untouched (the records rule, reused).
- A pending save is flushed before Inventory hides, including when Show More Features turns off, so the 600 ms debounce cannot swallow a transaction.
- A chapter adopted from disk triggers the same reconciliation as a local edit, so words deleted on another device retire their transactions here.
- Oversized write: refused with the words still on screen, as records does.
- An item created with a transaction is one save; a failed save leaves the modal's numbers on screen.
- No warnings, caps, or clamps on balances.

## D9. Rejected alternatives

- **Storing transactions in `book.json`**: it is synced field-by-field by core and is the book's metadata, not a ledger; a 1,000-transaction list there would slow every meta save.
- **Recomputing from prose on every keystroke**: brittle (numbers are prose, not syntax) and exactly the per-keystroke cost the fork avoids elsewhere.
- **A separate window for Inventory**: the right pane already exists to keep writing context visible; a window would break the "never leave the page" rule.

## D10. Risks

- Text edits can remove a quote that the writer still wants counted; the retirement rule is the agreed answer, and the compensating transaction is the recovery path.
- A phrase that appears twice and then loses one copy keeps its transaction on the surviving copy (nearest position); the writer can tell by the jump, and a compensating transaction is the correction. Retiring a transaction wrongly is far worse than keeping one whose anchor drifted.
- Section-less paragraphs have no id, so the quote search carries them; a paragraph deleted and retyped elsewhere is followed by its text, not by its position.
- An anchor moved with a section into a later chapter changes earlier balances. This follows the spec's "counted from there", and is visible in the log.
