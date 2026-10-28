# Proposal

## Why

A writer who says "he paid 50 gold" needs to know what the purse held three chapters earlier, and NEO cannot tell them. Nothing links a number in the prose to the state it describes, so continuity errors are found by rereading the whole book. The Inventory ledger makes each number in the text a transaction, keeps a running balance per item across the book, and lets the writer jump back to the sentence that moved it.

## What Changes

- **A third pane tab.** The right-hand slide-over pane gains **Inventory** beside **Notes** and **Records**, showing the current chapter's balances, grouped by category (**Items** and **Status** by default), with the log for each item.
- **A transaction from the text.** Selecting a phrase in a chapter and right-clicking offers **Inventory…**. The modal picks an existing item (with its balance so far) or creates one (name and category), takes a signed amount, and saves one transaction against the selection. No selection offers nothing.
- **Balances depend on where the reader is.** The pane shows the total of every transaction in this chapter and the chapters before it, in book order. Opening chapter 3 shows the purse before chapter 4's payment; opening chapter 5 shows it after. Transactions in later chapters are not counted.
- **One line per transaction, newest included.** An item's log lists every transaction up to the open chapter, one per line, with its chapter and signed amount. Choosing a line goes to the page, selects the phrase it was recorded against, and puts it on screen.
- **Deleting the words deletes the transaction.** When the anchored text is gone from the book — no chapter, no loose card, no held card — that transaction is retired and the balances and logs change with it. A wrong anchor can be removed from its log line after a confirmation. Nothing warns about a negative balance.
- **Several items, several kinds.** Gold, health, and magic live side by side; an item belongs to a category, and categories group the pane and the log. Amounts are signed and may go below zero.
- **The ledger is the book's.** It lives in the book folder, merges by transaction id when two devices edit it, and travels with both backups. No chapter, `book.json`, or `library.json` content is rewritten by a transaction; the manuscript is only read.

### Assumptions

- A transaction can only be created from a selection; there is no manual entry without words to anchor it.
- A transaction is removed by deleting its words or by **Remove transaction** on its log line (after a confirmation). Editing the amount means adding a correcting transaction; there is no amount editor.
- Copying anchored words into another chapter does not copy the transaction. Moving a whole section does, because the section's own id travels with it.
- Inventory is behind Show More Features, like Records, and absent in Pocket.

### Out of scope

- Automatic detection of amounts in prose, or arithmetic in the text.
- Warnings, caps, or validation of negative balances.
- Transferring transactions with copied text, or a transaction editor/history beyond add and retire.
- Snapshots restoring ledger state, or inventory in exports.
- Formulas, currencies, or decimals beyond ordinary signed numbers.
- Renaming, recategorising, or deleting an item after it exists; a wrongly named item is corrected by making the right one and removing its transactions.
- Inventory for screenplays and poetry beyond the same text anchor, and inventory in exports.

## Capabilities

### New Capabilities

- `inventory`: a book-wide transaction ledger anchored to selected text, with per-item balances as of the open chapter, grouped categories, and jump-to-transaction.

### Modified Capabilities

<!-- None: Records, notes, and the manuscript keep their requirements. -->

## Impact

- **New fork files:** `neo-ext/inventory.js` (pane tab, modal, log), `neo-ext/inventory-main.js` (the book-folder ledger and its merge-on-write IPC), `neo-ext/lib/inventory-ledger.js` (pure ledger: entries, validation, ordering, balances), `neo-ext/lib/inventory-anchor.js` (pure anchor matching against chapter text).
- **Adjusted:** `neo-ext/records.js` (the pane tab strip and its `setView`, Esc, and focus handling accept a third view), `neo-ext/word-context.js` (a renderer selection-provider list, so Inventory does not depend on the records file), `neo-ext/lib/record-tags-main.js`/`neo-ext/main.js` (the phrase menu is a provider list, and the macOS Look Up popup offers Inventory… for one word), `neo-ext/boot.js` (menu routing), `neo-ext/api.js` (open book, chapter order and text, current chapter, guarded phrase reveal), `preload.js` (ledger read/write for a book, and the phrase payload's anchor), `index.html`, `neo-ext/neo-ext.css`, `neo-ext/check-seams.js`.
- **Tests:** `scripts/inventory-ledger.test.js`, `scripts/inventory-anchor.test.js`, `scripts/inventory-ipc.test.js`, `scripts/inventory-menu.test.js`, `scripts/inventory.e2e.js` and a `test:inventory` script; Pocket's copy list is unchanged, so Inventory stays desktop-only.
- **Storage:** one `neo-ext-inventory.json` in the book folder, holding items and transactions; single path segment through `libName()`. No new library-root file, no new dependency, no network.
- **Backups:** both existing backup paths already carry every file in the book folder, so the ledger needs no new backup rule.
