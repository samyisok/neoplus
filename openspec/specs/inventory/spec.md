# inventory Specification

## Purpose
Lets a writer keep the state their book describes — coins, health, magic, anything that rises and falls — as a ledger of transactions anchored to the sentences that moved it, so the balance at any chapter is visible and every change can be found again.

## Requirements

### Requirement: Inventory in the right-hand pane

The right-hand slide-over pane SHALL offer an **Inventory** view beside **Notes** and **Records**, showing the state as of the chapter the writer is in.

- The tab strip SHALL show **Inventory** while Show More Features is on, the pane is open on the Manuscript or Notes bottom tab, and a book is open.
- Choosing **Inventory** SHALL replace the pane's content with the balance list and SHALL NOT change the bottom tab, the page, the left chapter list, or the notes.
- The pane SHALL name the chapter the balances are read as of, using its title rather than its number, and SHALL use the book's own name for an untitled chapter.
- While a chapter of the book cannot be read, the pane SHALL say the balances are waiting for it and SHALL NOT retire or move a transaction.
- When no chapter is current, the pane SHALL read as of the whole book and say so.
- Balances SHALL count every transaction in that chapter and in the chapters before it in book order, and SHALL NOT count transactions in later chapters.
- The balance list SHALL group items by category, with **Items** and **Status** as the default categories and each heading foldable; an item with no category SHALL appear under **Items**.
- Each row SHALL show the item, its current amount, and its category group; an amount MAY be zero or negative and SHALL be shown as it is, with no warning.
- Changing chapter SHALL change the balances to that chapter's point in the book without a reload, including when the writer scrolls or moves the caret rather than clicking a chapter.
- A folded category SHALL stay folded while the view is open and SHALL open again when Inventory is closed and reopened; the fold is not saved.
- With Show More Features off, or in Pocket, the Inventory tab SHALL be absent, the ledger SHALL NOT be read, and only a save already in progress SHALL finish.
- A bare Esc inside Inventory SHALL NOT leave the book; Esc in the modal SHALL close it.
- Leaving Inventory, or turning Show More Features off while a save is pending, SHALL save the pending transaction; the save MAY finish after the view closes, and SHALL NOT be dropped.

#### Scenario: Open Inventory while writing

- **WHEN** the writer is in chapter 5 and opens Inventory in the pane
- **THEN** the pane lists each item with its amount as of chapter 5, grouped by category

#### Scenario: Step back a chapter

- **WHEN** chapter 4 spent 50 gold and the writer moves from chapter 5 to chapter 3
- **THEN** the same purse shows the amount it held in chapter 3, without the chapter 4 spending

#### Scenario: No chapter open yet

- **WHEN** the book is open but no chapter is current
- **THEN** the pane shows the whole book's balances and says they are for the whole book

#### Scenario: Scrolling to another chapter

- **WHEN** the writer scrolls from chapter 3 to chapter 5 without clicking
- **THEN** the balances become chapter 5's within a moment

#### Scenario: A chapter in the cloud

- **WHEN** one chapter's file is a cloud placeholder
- **THEN** the pane says the balances are waiting for that chapter and no transaction is retired

#### Scenario: Negative balance

- **WHEN** the transactions leave an item at -25
- **THEN** the row shows -25 and no warning appears

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** the Inventory tab is absent, and opening the pane leaves the ledger file untouched

#### Scenario: Switching the switch off after a save

- **WHEN** the writer records a transaction and turns Show More Features off before the save settles
- **THEN** the transaction is saved before Inventory closes, and the file is untouched afterwards

### Requirement: Recording a transaction from a selection

Selecting a phrase in a chapter and opening the context menu SHALL offer **Inventory…**, which records one signed change to one item against that phrase.

- The item SHALL appear only inside an editable chapter body, only while Show More Features is on, and only for a non-empty selection of at most 120 characters that stays within one paragraph and contains no line break.
- The phrase SHALL be the selected text, trimmed, with inner whitespace collapsed.
- **Inventory…** SHALL open a modal with a searchable list of the book's items showing each item's amount so far, and a field to create an item with a name and a category.
- The modal SHALL take a signed amount, including zero and negative amounts, and one **Save** action SHALL record exactly one transaction: the item, the signed amount, the chapter, the selection's location, and the phrase.
- Creating an item in the modal SHALL save it with the transaction in the same save, so an item never exists with no transaction by accident.
- Saving SHALL add one log line and SHALL change the balances as of that chapter and every later chapter.
- Cancelling the modal, or Esc, SHALL write nothing.
- The modal SHALL cover the page above the panes and other windows, SHALL be announced as a dialog, and SHALL be recognised by NEO's own "a dialog is open" checks.
- The modal SHALL NOT open over another NEO dialog, and a second **Inventory…** choice while it is open SHALL be ignored.
- A paragraph that is only a placeholder SHALL offer no item, because it holds no words to anchor.
- Saving SHALL be refused, with a message, when the book has changed or the recorded chapter is no longer in the book.
- An amount that is not a number and an amount outside the allowed range SHALL be reported apart.
- The item SHALL appear in the native context menu and, on macOS, in the one-word Look Up popup, so a one-word selection such as a number can be recorded.
- The item SHALL NOT appear with no selection, outside a chapter body, in Simple NEO, or in Pocket.

#### Scenario: Hero finds coins

- **WHEN** the writer selects “saw 200 gold coins” in chapter 1, chooses Inventory…, picks the new item “gold coin”, and saves +200
- **THEN** the ledger holds one transaction of +200 against that phrase, and chapter 1 shows 200 gold

#### Scenario: Paying at the inn

- **WHEN** the writer selects text in chapter 4, chooses Inventory…, finds “gold coin” at 200, and saves -50
- **THEN** a second transaction is recorded, chapter 4 shows 150 gold, and the log has one line per transaction

#### Scenario: A new kind of item

- **WHEN** the writer creates “Health Points” under Status and saves +100 in chapter 6
- **THEN** the item appears under Status, and the chapter 6 balance list shows it beside the purse

#### Scenario: Several changes in one chapter

- **WHEN** the writer records +100, then -10 three times, for Health Points in chapter 6
- **THEN** chapter 6 shows 70, with four log lines, and chapter 5 still shows the value from before chapter 6

#### Scenario: One word on macOS

- **WHEN** the writer selects a single word on macOS and the Look Up popup opens
- **THEN** Inventory… appears beside Look Up, Create/Find Record…, Dictionary, and Thesaurus

#### Scenario: A placeholder paragraph

- **WHEN** the writer selects text in a section placeholder
- **THEN** no Inventory… item appears

#### Scenario: Save after the book changed

- **WHEN** the writer opens the modal and the book changes before Save
- **THEN** nothing is written, and the modal says the book changed

#### Scenario: No selection

- **WHEN** the writer right-clicks without selecting text
- **THEN** no Inventory… item appears

#### Scenario: Cancel the modal

- **WHEN** the writer chooses Inventory…, types an amount, and presses Esc
- **THEN** no item and no transaction is written

### Requirement: The log of one item

Each item SHALL keep every transaction up to the open chapter as a log, one line per transaction.

- The log SHALL open from the item's row and SHALL list, in book order and then in page order, each transaction's chapter and signed amount.
- A log line SHALL offer **Remove transaction**, which SHALL ask **Remove this transaction?** in the line and, on **Remove**, retire it permanently; **Cancel** or Esc SHALL keep it.
- Each line SHALL be a control that goes to the phrase the transaction was recorded against: it SHALL open that chapter, put the phrase on screen, and select it without editing anything.
- A line whose phrase can no longer be found SHALL NOT be offered as a jump, and the transaction SHALL be retired (see the retirement requirement). A jump SHALL only be offered while the phrase can be located in its chapter.
- Esc SHALL cancel a pending **Remove this transaction?** and keep the transaction.
- The log SHALL show only transactions in the open chapter and the chapters before it, matching the balance above it.

#### Scenario: Log for the purse

- **WHEN** the writer opens the log for gold coins in chapter 5
- **THEN** it lists chapter 1 +200, chapter 3 -25, and chapter 4 -50, and the row above shows 125

#### Scenario: Remove a wrong transaction

- **WHEN** the writer removes a log line by hand and confirms
- **THEN** the transaction stops counting everywhere and does not return

#### Scenario: Escape cancels a removal

- **WHEN** the removal question is showing and the writer presses Esc
- **THEN** the question closes and the transaction stays

#### Scenario: Jump to the moment

- **WHEN** the writer chooses the chapter 4 -50 line
- **THEN** chapter 4 is shown, the recorded phrase is on screen and selected, and nothing is edited

#### Scenario: A chapter's own changes

- **WHEN** the writer opens the Health Points log in chapter 6
- **THEN** it lists +100 then each -10 in page order, all under chapter 6

### Requirement: A transaction follows its words

A transaction SHALL stay with the phrase it was recorded against, and SHALL be retired only when that phrase is gone from the book.

- A transaction SHALL be anchored to its chapter, the phrase, its section where the text belongs to one, a short hash of that section's text, and enough position to order and find it again.
- Editing, retyping, or moving text around the phrase SHALL keep the transaction.
- When the phrase still exists anywhere in the book's chapters, the transaction SHALL stay: if it moved within the chapter or into another chapter, the transaction SHALL follow it, and its log line SHALL name the chapter it now lives in.
- A transaction SHALL be retired only when its phrase is no longer anywhere in the book — no chapter, no loose card, no held chapter or scene card — and retiring SHALL be final: an older copy of the ledger SHALL NOT bring it back.
- While any chapter of the book cannot be read, no transaction SHALL be retired or moved, because the phrase may be in that chapter.
- A transaction whose chapter is no longer in the book and whose phrase is nowhere else SHALL be retired; if it cannot be placed, the log SHALL name it as unplaced rather than silently dropping it.
- A chapter that cannot be read, because it is a cloud placeholder or is unreadable, SHALL NOT retire a transaction; its anchors wait for the chapter to arrive.
- When the phrase now appears more than once, the anchor SHALL keep the occurrence nearest its recorded position rather than guess, and SHALL NOT retire the transaction.
- Deleting a chapter to Darlings, or deleting the section holding the phrase when the phrase appears nowhere else, SHALL retire its transactions.
- Joining a chapter into another, or a chapter becoming a section, SHALL NOT retire a transaction whose phrase survives in the joined text; its log line SHALL show where the phrase now is.
- An edit elsewhere in the book SHALL NOT retire a transaction, and neither SHALL opening another chapter.

#### Scenario: Delete the sentence

- **WHEN** the writer deletes the sentence the +200 was recorded against, and no other chapter holds it
- **THEN** that transaction is retired, and every later chapter shows 200 less

#### Scenario: Edit elsewhere

- **WHEN** the writer adds and removes words in another paragraph of the same chapter
- **THEN** the transaction stays, and its balance is unchanged

#### Scenario: Move the section

- **WHEN** the writer moves the section holding a transaction into the next chapter
- **THEN** the transaction stays, its log line shows the new chapter, and its amount is counted from there

#### Scenario: A loose card holds the words

- **WHEN** the section holding a transaction is moved to a loose card, and the card is still in the book
- **THEN** the transaction stays and is counted where the book places the card

#### Scenario: Join two chapters

- **WHEN** the writer makes one chapter a section of another and the phrase survives
- **THEN** the transaction stays counted, and its log line shows where the phrase went

#### Scenario: Delete the chapter

- **WHEN** the writer sends a chapter holding transactions to Darlings
- **THEN** those phrases leave the book, their transactions are retired, and they stop counting

#### Scenario: A payment in chapter 3

- **WHEN** the writer records -25 in chapter 3 and returns to chapter 5
- **THEN** chapter 5 shows the purse with that payment counted, and the log lists it in chapter order

#### Scenario: Another chapter is unreadable

- **WHEN** the anchored chapter is readable but another chapter is a cloud placeholder
- **THEN** no transaction is retired or moved until that chapter arrives

#### Scenario: A chapter is in iCloud

- **WHEN** a chapter's file is a cloud placeholder and cannot be read
- **THEN** its transactions are neither retired nor moved, and they count as before

#### Scenario: The text arrives from another device

- **WHEN** another device deletes the anchored phrase and this device takes the changed chapter from disk
- **THEN** the transaction is retired here too, without a manual refresh

### Requirement: A book-wide ledger that merges

The ledger SHALL belong to the book, survive two devices editing it, and travel with backups. Only the open book's ledger SHALL be shown or written, and opening another book SHALL load that book's ledger.

- Items and transactions SHALL live in one file in the book's folder, named by NEO rather than chosen by the page; nothing SHALL be written to a chapter, `book.json`, or `library.json`.
- Two copies SHALL merge by item and transaction id, and a retired transaction SHALL stay retired.
- Creating an item whose name already exists, ignoring case, SHALL use the existing item; a merge SHALL fold two items with the same name into one and SHALL move their transactions to it.
- A reconciliation that changes nothing SHALL NOT write the ledger.
- A missing or unreadable ledger SHALL NOT be overwritten blindly: Inventory SHALL say the ledger could not be read and SHALL leave the file alone.
- A save that is refused, because the file is too large or cannot be written, SHALL leave the words on screen and say they were not saved.
- A merge SHALL NOT write a ledger that NEO itself would refuse to read: the merged ledger SHALL be checked against the same size, item, and transaction limits before writing, and an over-limit merge SHALL be refused with the words still on screen.
- A transaction waiting to be saved SHALL belong to the book it was recorded in: changing books SHALL save it to that book first, and it SHALL never be written into another book.
- The automatic daily backup and File → Backup Book… SHALL both carry the ledger as part of the book's files.
- Inventory SHALL work offline.

#### Scenario: The same item on two devices

- **WHEN** two devices each create “gold coin” before either reads the other
- **THEN** one item survives the merge and every transaction points at it

#### Scenario: Nothing changed

- **WHEN** Inventory reconciles and finds every anchor where it was
- **THEN** the ledger file is not written

#### Scenario: Two devices fill the ledger

- **WHEN** two devices merge ledgers that together exceed a limit
- **THEN** the write is refused, both files stay readable, and the view says it was not saved

#### Scenario: Changing books with a save pending

- **WHEN** the writer records a transaction and opens another book before the save settles
- **THEN** the transaction is saved in the book it was recorded in

#### Scenario: Two devices record

- **WHEN** one device records a chapter 2 purchase and another records a chapter 5 reward before either reads the other
- **THEN** both transactions exist after the merge and chapter 6 shows both counted

#### Scenario: Unreadable ledger

- **WHEN** the ledger file cannot be parsed
- **THEN** Inventory says it could not read it, the file is left as it is, and no empty ledger is written over it

#### Scenario: Backup

- **WHEN** the day's backup runs after transactions were recorded
- **THEN** the zip holds the book's ledger file with those transactions

### Requirement: Inventory never changes the book

Recording, viewing, grouping, and jumping SHALL leave the manuscript and NEO's book state as they were.

- No chapter, notes page, sidecar other than the ledger, `book.json`'s content beyond NEO's own last-position bookkeeping, `library.json`, snapshot, or darling SHALL be written because of an inventory action.
- The text, save state, caret, and structural undo stack SHALL be unchanged by opening Inventory, the modal, the log, or a jump; a jump moves the view and selects a phrase without editing.
- The ledger SHALL be the only file Inventory writes, and only while Show More Features is on. With the switch off, Inventory SHALL NOT read, reconcile, or write; only a save already in flight may finish.

#### Scenario: Record while writing

- **WHEN** the writer has unsaved words and records a transaction
- **THEN** the chapter, its save state, and the structural undo stack are exactly as they were

#### Scenario: Jump does not edit

- **WHEN** the writer jumps to a log line
- **THEN** the phrase is selected and no character of the manuscript changed

#### Scenario: Typing after the switch goes off

- **WHEN** the writer turns Show More Features off and keeps typing
- **THEN** the ledger is not read, reconciled, or written

#### Scenario: Simple NEO

- **WHEN** Show More Features is turned off while Inventory is open
- **THEN** the view closes to Notes and the ledger file is not written again until the switch returns
