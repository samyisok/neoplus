# story-records Specification

## Purpose
Lets a writer keep one set of notes about the people, items, and places in their books — shared by every book in the library — and find, edit, group, and back them up without leaving NEO.

## Requirements

### Requirement: Records in the right-hand pane

The right-hand slide-over pane SHALL offer two views, **Notes** and **Records**, with its existing notes unchanged.

- The pane SHALL show a two-item tab strip above its title block while it is open on the Manuscript or Notes bottom tab and Show More Features is on; **Notes** SHALL remain the view the pane opens first.
- Choosing **Notes** SHALL show the pane's current content unchanged: sticky notes while writing, or the current chapter's notes on the Notes tab.
- Choosing **Records** SHALL replace the pane's content with the records list. The bottom tab, the page, the left chapter list, and the Notes page SHALL NOT change.
- The tab strip SHALL be operable by keyboard, with Left and Right moving between the two views and Home and End reaching the first and last.
- Outline and Darlings SHALL keep their loose cards and snapshots without the tab strip.
- With Show More Features off, the tab strip SHALL be hidden, the pane SHALL stay on Notes, and existing records SHALL be left untouched for when it returns.
- A bare Esc inside Records SHALL NOT leave the book; in the search field it SHALL clear the query, and in a pending confirmation it SHALL cancel it.
- Pocket SHALL show no Records view.

#### Scenario: Open Records while writing

- **WHEN** the writer hovers the right edge, pins the pane, and chooses Records
- **THEN** the records list replaces the pane's sticky notes and the Manuscript tab remains selected at the bottom

#### Scenario: Records on the Notes tab

- **WHEN** the writer is on the Notes tab and chooses Records in the pane
- **THEN** the records list replaces the chapter notes in the pane; the notes page stays as it was

#### Scenario: Back to Notes

- **WHEN** the writer chooses Notes from the records view
- **THEN** the pane's previous content returns, unchanged

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** the pane shows no tab strip and no Records choice, and stays on its notes

#### Scenario: Keyboard tabs

- **WHEN** the pane tab strip has keyboard focus and the writer presses Right Arrow on Notes
- **THEN** Records opens in the pane, and Left Arrow returns to Notes

#### Scenario: Escape does not leave the book

- **WHEN** Records is open, no confirmation is showing, and the writer presses Esc
- **THEN** Records stays open and the writer stays in the book

### Requirement: Adding and editing a record

The system SHALL let the writer add a record with a title and a multiline plain-text description, and edit both afterwards.

- **+ Record** SHALL add a draft row with its title input focused; Enter SHALL save a non-empty title, and Esc SHALL discard the draft.
- **+ Record** SHALL add to **Unsorted**; a folder heading's **+** SHALL add to that folder.
- Clicking a record's title SHALL unfold its description; clicking the title again SHALL fold it.
- The description SHALL be editable in place, multiline, and plain text: line breaks SHALL be kept, and HTML SHALL be shown as text rather than rendered.
- A record's title SHALL be editable after creation, without deleting and recreating the record.
- Changes to a title or description SHALL be saved after a short pause and SHALL still be saved when the writer leaves Records, switches tabs, or closes the book.
- A record SHALL belong to **Unsorted** or to one folder; an expanded record SHALL offer a way to change its folder.
- Adding, expanding, collapsing, or editing a record SHALL NOT change the manuscript, the notes pages, the save state, or the undo history.

#### Scenario: Add a record

- **WHEN** the writer chooses + Record, types “John Silver”, and presses Enter
- **THEN** a one-line record named “John Silver” appears and its title input is no longer active

#### Scenario: Discard an empty draft

- **WHEN** the writer chooses + Record and presses Esc before typing
- **THEN** no record is added

#### Scenario: Unfold and fold

- **WHEN** the writer clicks “John Silver”
- **THEN** its description opens below the title; clicking the title again closes it

#### Scenario: Edit the description

- **WHEN** the writer opens a record, types two lines about a missing leg and a parrot, and moves to another record
- **THEN** the two lines are saved and return the next time the record is opened

#### Scenario: Plain text only

- **WHEN** the writer types `<b>not bold</b>` into a description
- **THEN** the text is stored and displayed literally, not rendered as markup

#### Scenario: Change folder

- **WHEN** the writer opens a record and chooses another folder for it
- **THEN** the record moves under that folder and stays there after a restart

### Requirement: Deleting a record asks first

The system SHALL delete a record only after the writer confirms it, without opening a modal dialog.

- The bin control on the right of a record SHALL ask **Delete “title”?** in the row itself, naming the record and offering **Delete** and **Cancel**.
- **Cancel** or Esc SHALL close the question and keep the record.
- **Delete** SHALL remove the record, and SHALL NOT touch any other record, folder, note, or chapter.
- The question SHALL be reachable and answerable by keyboard, and focus SHALL return to a sensible place when it closes.

#### Scenario: Cancel a deletion

- **WHEN** the writer chooses the bin on “John Silver” and then Cancel
- **THEN** the record is still there, with its description unchanged

#### Scenario: Confirm a deletion

- **WHEN** the writer chooses the bin on “John Silver”, then Delete
- **THEN** that record disappears and the other records remain

#### Scenario: Escape cancels

- **WHEN** the deletion question is open and the writer presses Esc
- **THEN** the question closes and the record remains

### Requirement: Folders group records

The system SHALL group records into one level of folders, including an **Unsorted** group for records without one.

- The records list SHALL group records under **Unsorted** and each named folder, with a count beside each heading; a heading SHALL fold and unfold its group.
- The writer SHALL be able to create a folder with a name, rename it in place, and delete it after confirmation.
- Deleting a folder SHALL move its records to **Unsorted** and SHALL NOT delete any record.
- Two folders with the same trimmed name SHALL NOT be created, and **Unsorted** SHALL be reserved.
- Folders SHALL be available in every book's Records view, because the records are shared by the library.

#### Scenario: Create a folder

- **WHEN** the writer chooses + Folder and types “The Silver Series”
- **THEN** the folder appears in the list and can hold records

#### Scenario: Delete a folder

- **WHEN** the writer deletes “The Silver Series” and confirms
- **THEN** the folder disappears and every record it held is under Unsorted

#### Scenario: Folder names

- **WHEN** the writer tries a second folder named “The Silver Series”
- **THEN** no second folder is created, and the existing one is pointed out

#### Scenario: A record in a folder

- **WHEN** the writer uses the + beside “The Silver Series”
- **THEN** the new record is created under that folder, not in Unsorted

### Requirement: Search finds records and their words

The system SHALL provide a quick search over record titles, descriptions, and tags and SHALL highlight what matched.

- A search field SHALL sit at the top of the records list in the pane; typing SHALL filter the list as the writer types, ignoring case.
- A record SHALL match when the query appears in its title, its description, or one of its active tags. Search SHALL look through every folder group.
- A record whose description or tag matched SHALL unfold so the matching words or tag are visible, and SHALL show which folder it belongs to.
- Every match in a visible title or description SHALL be highlighted without changing the record, adding markup, or affecting what is saved.
- Clearing the field SHALL restore the grouped list.
- A query with no match SHALL show a short empty result naming the query, and SHALL NOT delete or hide any record permanently.
- Esc in the search field SHALL clear the query and keep the Records view open.
- The field SHALL NOT take over NEO's Find command or search the manuscript.

#### Scenario: Find a character

- **WHEN** the writer types “silver”
- **THEN** records whose title or description contains “silver” remain, others are filtered out, and each “silver” is highlighted

#### Scenario: Match in a description

- **WHEN** the query appears only in a record's description
- **THEN** that record is shown with its description unfolded and the matching words highlighted

#### Scenario: Match in a tag

- **WHEN** the query appears only in a record's tag
- **THEN** that record is shown with its tag visible and the others filtered out

#### Scenario: Clear the search

- **WHEN** the writer clears the search field
- **THEN** the grouped list returns

#### Scenario: No match

- **WHEN** the writer searches for “xyzzy”
- **THEN** a short message says nothing matched, and no record is removed

### Requirement: One library-wide store that merges safely

Records and folders SHALL belong to the library, not to a book, and SHALL survive two devices editing them.

- Every book SHALL show the same records and folders; opening another book SHALL NOT change them.
- The store SHALL live in one `records.json` at the library root, never in `book.json`, `library.json`, or a chapter.
- Two copies of the store SHALL merge by record and folder id. For a record, the newest title, description, and folder choice SHALL each be kept; a newer deletion SHALL win over older content.
- A deleted record or folder SHALL leave a tombstone so an older copy cannot restore it.
- A missing or unreadable store SHALL NOT be overwritten blindly; the view SHALL explain that records could not be read and SHALL leave the file untouched.
- When `records.json` exists only in iCloud, NEO SHALL ask the cloud service for it and SHALL NOT write over the placeholder. It SHALL explain the wait or failure rather than freeze.
- When a save is refused because the store is too large or unreadable, the text SHALL stay on screen, a persistent line SHALL say it was not saved and why, and no record SHALL be discarded silently. The line SHALL clear after a later save succeeds.
- A device clock that is ahead SHALL NOT make a field permanently uneditable; edit stamps further in the future than a short tolerance SHALL be treated as now when the store is read or written.
- The store SHALL be read and written through the application's own boundary; no path from the renderer SHALL choose the file.

#### Scenario: Same records in two books

- **WHEN** the writer adds “John Silver” in one book and opens Notes → Records in another
- **THEN** “John Silver” is there with the same description

#### Scenario: Two devices add records

- **WHEN** one device adds a character and another adds an item before either reads the other
- **THEN** both records exist after the stores merge

#### Scenario: Two devices edit one record

- **WHEN** one device changes the title and the other changes the description of the same record
- **THEN** both changes survive after the merge

#### Scenario: Delete on one device

- **WHEN** a record is deleted on one device and an older copy still contains it on another
- **THEN** the deletion wins and the record does not return

#### Scenario: Unreadable store

- **WHEN** `records.json` cannot be parsed
- **THEN** Records says it could not read the file, the file is left as it is, and no empty store is written over it

#### Scenario: A save is refused

- **WHEN** a record edit would push the store over its size limit, or the file cannot be read
- **THEN** the words stay on screen, a line says they were not saved, and nothing is discarded or written over the unreadable file

#### Scenario: A clock far in the future

- **WHEN** a record arrives with an edit stamp a day ahead
- **THEN** it is treated as edited now, so a later real edit on another device still wins and the field does not stay locked

#### Scenario: Records only in iCloud

- **WHEN** `records.json` is a cloud placeholder
- **THEN** NEO asks for the download, shows that the records are not available yet if it does not arrive, and does not write over the placeholder

### Requirement: Records travel with backups

The system SHALL include the library's records in both kinds of backup.

- The automatic daily zip SHALL include `records.json` when it exists.
- File → Backup Book… SHALL copy `records.json` beside the book folder in the backup.
- A records file that exists only in iCloud SHALL be named in the backup's left-out list instead of blocking the backup.
- A library with no records SHALL back up exactly as before, with no empty file invented.

#### Scenario: Daily backup

- **WHEN** the day's backup runs for a library with records
- **THEN** the zip contains `records.json` with the same records

#### Scenario: Book backup

- **WHEN** the writer chooses File → Backup Book…
- **THEN** the new backup folder contains `records.json` as well as the book's files

#### Scenario: Records in iCloud

- **WHEN** `records.json` is a cloud placeholder the cloud service will not hand over
- **THEN** the rest of the backup finishes, `_left-out-of-this-backup.txt` names the records file, and the message says the copy is incomplete

#### Scenario: No records yet

- **WHEN** no records have been created
- **THEN** both backups finish as before and no empty records file appears

### Requirement: Records never touch a book

Creating, editing, moving, searching, and deleting records SHALL NOT alter a book's words or NEO's book state.

- No chapter, `book.json`, `library.json`, notes page, sidecar, snapshot, or darling SHALL be written because of a records action.
- The manuscript, notes pages, caret, selection, save state, and structural undo stack SHALL be unchanged. Typing in a record is still typing: it empties NEO's redo stack exactly as typing anywhere does, and that is not a records side effect.
- Record titles and descriptions SHALL be displayed as text, never as HTML.
- Records SHALL work with no network connection and SHALL make no request to a server.

#### Scenario: Edit a record while writing

- **WHEN** the writer has unsaved words in a chapter, opens Records, and edits a character
- **THEN** the chapter, its save state, and the structural undo stack are exactly as they were

#### Scenario: Search does not rewrite

- **WHEN** the writer searches and clears the search
- **THEN** the record text and the saved `records.json` are unchanged by the highlighting

### Requirement: Records carry tags

A record SHALL carry zero or more free-text tags, including tags of several words, and a tag SHALL link the record to the same phrase wherever it appears in the manuscript.

- A tag SHALL be trimmed, have its inner whitespace collapsed, and be limited to 120 characters; a record SHALL hold at most 50 tags and no two tags that differ only in case.
- A record SHALL be able to hold several tags, and several records SHALL be able to share a tag.
- An expanded record SHALL show its tags as chips and SHALL offer a way to add one.
- A tag chip's cross SHALL ask **Remove tag “tag”?** in the record and SHALL offer Remove and Cancel; Cancel or Esc SHALL keep the tag. Removing a tag SHALL NOT edit or delete the record.
- Adding an existing tag SHALL be ignored rather than duplicated.
- A tag chip SHALL be a button; choosing it SHALL search the book for that tag (see the separate requirement).
- Tags SHALL be stored with the records, SHALL merge with the same field-level safety as records, and SHALL NOT be written to a book, chapter, or `library.json`.

#### Scenario: Add several tags

- **WHEN** the writer opens “John Silver” and adds “Long Chen” and “Silver Series”
- **THEN** both tags appear as chips and survive a restart

#### Scenario: Add a duplicate

- **WHEN** the writer adds “long chen” to a record that already has “Long Chen”
- **THEN** no second chip appears, and the original spelling is kept

#### Scenario: Remove a tag

- **WHEN** the writer presses the cross on “Long Chen”, then Cancel, and later confirms Remove
- **THEN** the first attempt keeps the tag, the second removes only that tag, and the record and description remain

#### Scenario: Tags merge

- **WHEN** one device adds “Long Chen” and another adds “Silver Series” to the same record
- **THEN** both tags exist after the stores merge

### Requirement: Create or find a tagged record from a selection

Selecting a phrase in a chapter and opening the context menu SHALL offer to create a record when no record has that tag, and to find the tagged records when one does.

- The record item SHALL appear only inside an editable chapter body, only while Show More Features is on, and only for a non-empty selection of at most 120 characters that stays within one paragraph and contains no line break. A selection may be one word or several.
- The phrase SHALL be the selected text, trimmed, with inner whitespace collapsed. Case SHALL NOT decide whether a tag matches.
- With no active record carrying that tag as a tag, the item SHALL read **Create Record…**. With one or more, it SHALL read **Find Record…**; the create item SHALL NOT be offered then.
- **Create Record…** SHALL open the right-hand pane pinned to Records and create the record immediately, with the phrase as both title and first tag, unfold it, and put the caret in its description. No dialog SHALL appear.
- **Find Record…** SHALL open the right-hand pane on Records, put the same phrase in the records search, and show the records carrying that tag. It SHALL NOT edit a chapter.
- While the tags index has not loaded, neither item SHALL be offered; a Create action that meets an existing tag after loading SHALL become Find and say so rather than create a duplicate. The tag item SHALL NOT depend on the spellcheck language.
- The item SHALL appear in the native context menu and, on macOS, in the one-word Look Up popup. A single selected word SHALL keep its Look Up, Dictionary, and Thesaurus choices; a longer selection SHALL suppress only those word-only choices.
- The item SHALL NOT appear with no selection, outside a chapter body, in Simple NEO, or in Pocket.

#### Scenario: Create from a name

- **WHEN** the writer selects “Long Chen” in a chapter, right-clicks, and chooses Create Record…
- **THEN** the right pane opens on Records with a record titled “Long Chen”, tagged “Long Chen”, unfolded and ready for its description

#### Scenario: Find an existing tag

- **WHEN** a record already carries the tag “Long Chen” and the writer selects that name and right-clicks
- **THEN** the menu offers Find Record… and not Create Record…, and choosing it shows that record with “Long Chen” in the search

#### Scenario: Several words

- **WHEN** the writer selects “Ice Metal Core” and creates the record
- **THEN** the title and the tag are the whole phrase, not one word of it

#### Scenario: No tag yet

- **WHEN** no record carries “North Continent”
- **THEN** the menu offers Create Record…, not Find Record…

#### Scenario: Single word on macOS

- **WHEN** the writer selects one word on macOS and the Look Up popup opens
- **THEN** it includes Create Record… or Find Record… beside Look Up, Dictionary, and Thesaurus

#### Scenario: No selection

- **WHEN** the writer right-clicks without selecting text
- **THEN** no record item appears

#### Scenario: Selection across paragraphs

- **WHEN** the selection runs over a line break or two paragraphs
- **THEN** no record item appears

#### Scenario: Index not loaded yet

- **WHEN** Records has not finished reading its tags and the writer right-clicks a selection
- **THEN** no record item appears, rather than offering a duplicate Create

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** no record item appears in the context menu or Look Up

### Requirement: A tag searches the whole book

Choosing a tag chip SHALL show every mention of that tag in the manuscript.

- The system SHALL switch to the Manuscript, open NEO's Find bar, and fill it with the tag.
- The search SHALL be case-insensitive and SHALL find the tag across the whole manuscript, using the existing match count, highlight, and next/previous behaviour.
- It SHALL NOT edit the manuscript, the record, a chapter, `book.json`'s content, `library.json`, or any sidecar. (Core Find may remember the last position in `book.json`, as opening any tab does.)
- A tag with no occurrence SHALL show Find's zero-match state.

#### Scenario: Find every mention

- **WHEN** the writer chooses the “Long Chen” tag chip
- **THEN** the Manuscript is shown and Find is open on “Long Chen” with its matches counted across the book

#### Scenario: No mentions

- **WHEN** the tag exists only as a tag and the phrase is absent from the manuscript
- **THEN** Find opens with the tag and reports no matches

### Requirement: Optional highlight of tagged names

The system SHALL offer a status-bar toggle that softly highlights tag occurrences in the manuscript, off by default.

- The toggle SHALL appear only while Show More Features is on, a book is open, and at least one active tag exists; it SHALL be an eye control in the status bar, with its state spoken and remembered on this device.
- While on, every tagged phrase in the manuscript SHALL be tinted by roughly 5% from the text, using the CSS Highlight API; the page's text, markup, save state, exports, and undo history SHALL be unchanged.
- The scan SHALL run when the toggle turns on, when the tag set changes, after an edited chapter settles, when a book opens, and after a chapter is replaced by undo, structural undo, or a disk refresh; it SHALL NOT scan on every keystroke or every word. Matches SHALL be bounded across the whole book so an extreme tag cannot make the manuscript unresponsive.
- A tag SHALL match within a paragraph, across inline formatting, but SHALL NOT match across a paragraph boundary.
- Turning the toggle off SHALL remove the highlight. Simple NEO and Pocket SHALL show no toggle.
- A 100,000-word manuscript with the library's tags SHALL remain responsive; the highlight SHALL never delay typing or saving.

#### Scenario: Turn highlighting on

- **WHEN** the writer clicks the eye in the status bar
- **THEN** tagged names in the manuscript take a subtle tint and the control reads as on

#### Scenario: Turn it off

- **WHEN** the writer clicks the eye again
- **THEN** the tint disappears and the page is unchanged

#### Scenario: A new tag

- **WHEN** the writer adds a tag while highlighting is on
- **THEN** its occurrences appear after the scan, without reopening the book

#### Scenario: Undo replaces a chapter

- **WHEN** a structural undo or a disk refresh replaces a chapter while highlighting is on
- **THEN** the tint returns on the new text, not on detached old nodes

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** the eye control is absent and no tag tint is painted

### Requirement: Tag edits merge safely

Tags SHALL travel and merge with their records, so two devices add and remove tags without reviving an old tag.

- A tag addition and a tag removal SHALL each carry their own time; the newer event for that tag SHALL win.
- A removed tag SHALL leave a tombstone, so an older copy cannot bring it back.
- Tags SHALL live inside each record in the library's `records.json`; they SHALL need no second file and SHALL be carried by both existing backups automatically.
- A tag operation SHALL NOT write a chapter, `book.json`'s content, `library.json`, or any book sidecar.

#### Scenario: Different tags on two devices

- **WHEN** one device adds “Long Chen” and another adds “Silver Series” before either reads the other
- **THEN** the merged record has both tags

#### Scenario: Remove on one device

- **WHEN** a tag is removed on one device and an older copy still has it on another
- **THEN** the removal wins and the tag does not return

#### Scenario: Backup

- **WHEN** the day's backup runs after tags were added
- **THEN** the `records.json` in the zip holds those tags

#### Scenario: No book writes

- **WHEN** the writer adds or removes a tag while a chapter has unsaved words
- **THEN** the chapter, its save state, and the undo history are unchanged
