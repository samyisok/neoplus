# Spec Delta

## Purpose

Records every replacement a tool makes in the writer's book, so the writer can
see what changed, from which text to which text, when, and in which chapter,
without any of it touching the manuscript.

## ADDED Requirements

### Requirement: A read-only History view in the right-hand pane

The right-hand pane SHALL offer **History** as its fourth tab, after Notes,
Records, and Inventory, showing the open book's replacements.

- The tab SHALL be present while the Manuscript or Notes tab is showing, like
  the other pane tabs, and absent where those tabs are absent.
- Choosing the tab SHALL show that book's history. With no book open, the view
  SHALL show an empty state and read no book data.
- A book with nothing recorded SHALL show an empty history, not an error.
- While a book's history is loading, the view SHALL NOT show another book's
  entries.
- The view SHALL be read-only: an entry SHALL NOT be editable, deletable, or
  restorable, and no control in the view SHALL change a chapter, a notes page,
  or the history.
- Switching to another book SHALL show that book's history, never the previous
  book's entries.
- Entries SHALL be rendered as text, never as markup, so text from the
  manuscript cannot become a control or an element.

#### Scenario: The fourth tab

- **WHEN** a book is open on the Manuscript tab and the writer opens the right-hand pane
- **THEN** its tabs read Notes, Records, Inventory, History
- **AND** choosing History shows the open book's replacements

#### Scenario: No book open

- **WHEN** no book is open and the History tab is chosen
- **THEN** the view says there is no history for a book that is not open, and nothing is read from the library

#### Scenario: Nothing recorded yet

- **WHEN** a book has no recorded replacements and its History tab is chosen
- **THEN** the view says no replacements have been recorded, and no error is shown

#### Scenario: Loading a second book

- **WHEN** the writer opens History for a book and then opens another book
- **THEN** the view never shows the first book's entries for the second book, even while the second is loading

#### Scenario: Another book

- **WHEN** the writer closes a book with a recorded history and opens a second book with none
- **THEN** the History tab shows an empty history rather than the first book's entries

#### Scenario: Read-only

- **WHEN** the writer clicks, double-clicks, or right-clicks an entry
- **THEN** no text is selected for editing, no entry is removed, and the manuscript is unchanged

### Requirement: An entry names the replacement, its time, and its chapter

Each entry SHALL show the text that was replaced, the text that replaced it, the
date and time of the replacement, and the chapter it happened in.

- The two texts SHALL be distinguishable as the replaced text and the
  replacement, in that order.
- The time SHALL be shown in the writer's own date and time format from the
  recorded moment, not from the moment the view is opened.
- The chapter SHALL be shown as the chapter's number in the book's order at the
  moment of replacement, counting from 1, together with the chapter's title when
  one is known.
- A replacement made outside a chapter, such as on a notes page or in a
  footnote, SHALL show no chapter number.
- Each side of a replacement SHALL be recorded up to 5,000 characters. A longer
  side SHALL be recorded truncated at that limit, and the entry SHALL say it was
  shortened.
- Entries SHALL be listed newest first. Two entries with the same time SHALL
  keep a stable order between readings.

#### Scenario: An ordinary entry

- **WHEN** the writer replaces “batch” with “pile” in chapter 3 and opens History
- **THEN** the newest entry shows “batch” as replaced, “pile” as the replacement, the date and time, and chapter 3 with its title

#### Scenario: A notes page

- **WHEN** a replacement is recorded from the notes page
- **THEN** its entry shows no chapter number

#### Scenario: Newest first

- **WHEN** the book holds replacements from two different days
- **THEN** the later day's entry is listed above the earlier one

#### Scenario: A very long replacement

- **WHEN** a recorded side is longer than 5,000 characters
- **THEN** the entry shows the recorded part and says it was shortened

### Requirement: A recorded replacement is what the history holds

The history SHALL accept a recorded replacement from any tool that replaces the
writer's text, and SHALL hold each one as an entry whatever the tool.

- An entry SHALL carry the text that stood, the text that replaced it, the tool
  that made the change, and the tool's own label where it has one.
- A replacement SHALL become an entry only after it has happened; nothing SHALL
  be added for an edit that was refused, cancelled, or left the text unchanged.
- A tool added later SHALL record through the same path, and its entries SHALL
  appear in the same view, newest first, without a change to the History view.
- Recording SHALL NOT alter the replacement, its undo step, the caret, or the
  chapter. Undoing a replacement afterwards SHALL leave its entry in place,
  because the entry records what happened.
- A recording that cannot be saved SHALL NOT block, reverse, or interrupt the
  replacement, and SHALL NOT change the entries already stored.
- A replacement recorded while the History view is open SHALL appear in that
  view without the writer reopening the tab.

#### Scenario: A recorded replacement

- **WHEN** a tool records a replacement of “batch” by “pile”
- **THEN** the newest History entry shows “batch”, “pile”, the tool, and the time

#### Scenario: Recorded while the view is open

- **WHEN** the writer replaces a word with the thesaurus while the History tab is showing
- **THEN** the new entry appears at the top of the list without reopening the tab

#### Scenario: Undo after a replacement

- **WHEN** the writer presses undo immediately after a recorded replacement
- **THEN** the manuscript returns to its earlier text and the History entry remains

#### Scenario: A later tool

- **WHEN** a tool that did not exist when History was written records a replacement
- **THEN** its entry is listed with the others in the same view

#### Scenario: A replacement that did not happen

- **WHEN** an edit is refused or cancelled before any text changes
- **THEN** no entry is added and the stored history is unchanged

### Requirement: History belongs to the book

The history SHALL be stored with the book it describes, SHALL travel and be
backed up with that book, and SHALL be removed with it.

- The history SHALL NOT be stored in `book.json` or `library.json`, and it
  SHALL NOT be written into a chapter or a notes page.
- A backup of the book SHALL include the history, and deleting the book SHALL
  delete it with the rest of the book's folder.
- Two devices that recorded replacements in the same book SHALL merge into one
  history in which every recorded entry appears exactly once, whichever device
  wrote last.
- After a merge the view SHALL still list entries newest first.

#### Scenario: Two devices

- **WHEN** the same book records one replacement on each of two synced devices
- **THEN** the merged history holds both entries, each once, and neither is replaced by the other

#### Scenario: Backup and delete

- **WHEN** the writer backs up a book with history and later deletes the book
- **THEN** the backup holds the history and the deleted book leaves none behind

### Requirement: History fails without losing what is already recorded

When the recorded history cannot be read or written, the view SHALL say so and
the recorded entries SHALL be left as they are.

- A missing history file SHALL be treated as an empty history, not as an error.
- An unreadable history file SHALL be reported in the view, and nothing SHALL
  overwrite it. Where an earlier good copy exists, the view MAY show it, and it
  SHALL still say the history could not be read.
- A history that is only in iCloud SHALL be reported as not available yet, and
  the read SHALL be retried when the view is shown again.
- A write that would take the history past its size limit SHALL be refused; the
  entries already recorded SHALL stay, and the view SHALL say the newest
  replacement could not be recorded.
- A failure to record SHALL never show a dialog over the manuscript and SHALL
  never interrupt typing.

#### Scenario: Unreadable history

- **WHEN** the history file cannot be read and the writer opens the History tab
- **THEN** the view says the history could not be read, and the file is left untouched
- **AND** if a last good copy exists, its entries are shown under that message

#### Scenario: File too large

- **WHEN** recording another replacement would take the history past its size limit
- **THEN** the entry is not added, the existing entries stay readable, and the view says the replacement could not be recorded

#### Scenario: In iCloud only

- **WHEN** the history file is a cloud placeholder
- **THEN** the view says it is not available yet rather than showing an empty history

### Requirement: History follows Show More Features and stays out of Pocket

History SHALL be a feature behind Show More Features and SHALL NOT exist in
Pocket.

- With Show More Features off, the History tab SHALL be absent and no
  replacement SHALL be recorded.
- Turning Show More Features off SHALL leave the stored history untouched, and
  turning it back on SHALL show it again.
- Pocket SHALL show no History tab and record no replacement.

#### Scenario: Simple NEO

- **WHEN** Show More Features is off and the writer replaces a word with the thesaurus
- **THEN** no History tab is shown and no history entry is recorded

#### Scenario: The switch returns

- **WHEN** the writer turns Show More Features off and then on again
- **THEN** the history recorded earlier is shown again unchanged
