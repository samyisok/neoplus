# Spec Delta

## MODIFIED Requirements

### Requirement: Recording a transaction from a selection

Selecting a phrase in a chapter and opening the context menu SHALL offer **Inventory…**, which records one signed change to one item against that phrase.

- The item SHALL appear only inside an editable chapter body, only while Show More Features is on, and only for a non-empty selection of at most 120 characters that stays within one paragraph and contains no line break.
- The phrase SHALL be the selected text, trimmed, with inner whitespace collapsed.
- **Inventory…** SHALL open a modal with a searchable list of the book's items showing each item's amount so far, and, on request, compact fields to create an item with a name and a category.
- The modal SHALL be sized to the page and scroll inside itself; the item list SHALL take the space the window leaves and scroll on its own, so a book with many items still shows a usable list.
- The name and category fields SHALL stay hidden behind a **+ New item** control until the writer asks to create an item.
- The amount field SHALL accept at most one leading sign and digits only. Letters and other characters SHALL be dropped as they are typed. A separator, a second sign, or a sign after the first character SHALL be refused: the field keeps the last valid value and says why, rather than turning the entry into a different number.
- The dialog SHALL use NEO's own modal surface and follow the interface's theme and size settings.
- A picked item SHALL stay visible in the list even while a search would exclude it.
- The item list SHALL keep a usable minimum height, so a book with few items does not collapse it to one row.
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

#### Scenario: Many items

- **WHEN** the book has fifty items and the writer opens Inventory…
- **THEN** the modal shows a scrollable list with room to work, and the new-item fields take no space unless asked for

#### Scenario: Typing an amount

- **WHEN** the writer types `-50 coins` into the amount field
- **THEN** the field holds `-50`, and a second sign or a letter is not accepted

#### Scenario: A separator or a stray sign

- **WHEN** the field holds `7` and the writer types `1,5` or `5-3`
- **THEN** the field still holds `7` and a message says whole numbers are used

#### Scenario: Day theme

- **WHEN** the interface is in its light theme
- **THEN** the dialog's text stays readable on its surface, and interface size still scales it

#### Scenario: A search hides the pick

- **WHEN** an item is picked and the search text excludes it
- **THEN** the picked row is still shown, marked as picked, so Save records what the writer sees

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
