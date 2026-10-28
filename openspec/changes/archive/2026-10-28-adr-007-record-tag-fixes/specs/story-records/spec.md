# Spec Delta

## MODIFIED Requirements

### Requirement: Records carry tags

A record SHALL carry zero or more free-text tags, including tags of several words, and a tag SHALL link the record to the same phrase wherever it appears in the manuscript.

- A tag SHALL be trimmed, have its inner whitespace collapsed, and be limited to 120 characters; adding SHALL accept at most 50 active tags on one record, and no two tags on a record SHALL differ only in case.
- A record SHALL be able to hold several tags, and several records SHALL be able to share a tag.
- An expanded record SHALL show its tags as chips and SHALL offer a way to add one.
- A tag chip's cross SHALL ask **Remove tag “tag”?** in the record and SHALL offer Remove and Cancel; Cancel or Esc SHALL keep the tag. Removing a tag SHALL NOT edit or delete the record.
- Adding an existing tag SHALL be ignored rather than duplicated.
- A tag chip SHALL be a button; choosing it SHALL search the book for that tag (see the separate requirement).
- Tags SHALL be stored with the records, SHALL merge with the same field-level safety as records, and SHALL NOT be written to a book, chapter, or `library.json`.
- The 50-tag limit SHALL count only active tags; removing a tag SHALL free a place for another.
- Reading or merging SHALL NOT drop a live tag or a tag's removal mark to stay under the limit: two copies that together hold more than 50 active tags SHALL all survive until the writer removes one.
- A tag in a file that cannot be read, such as one longer than 120 characters, SHALL be dropped on its own; the record and its other tags SHALL be kept, not rejected.

#### Scenario: Add several tags

- **WHEN** the writer opens “John Silver” and adds “Long Chen” and “Silver Series”
- **THEN** both tags appear as chips and survive a restart

#### Scenario: Add a duplicate

- **WHEN** the writer adds “long chen” to a record that already has “Long Chen”
- **THEN** no second chip appears, and the original spelling is kept

#### Scenario: Remove a tag

- **WHEN** the writer presses the cross on “Long Chen”, then Cancel, and later confirms Remove
- **THEN** the first attempt keeps the tag, the second removes only that tag, and the record and description remain

#### Scenario: A removed tag frees a place

- **WHEN** a record holds 50 active tags, the writer removes one, and then adds another
- **THEN** the new tag is accepted, and it is the 50th active tag

#### Scenario: A merge over the limit keeps every tag

- **WHEN** two devices each add 30 different tags to the same record before either reads the other
- **THEN** the merged record shows all 60 tags and no tag is dropped or lost from `records.json`

#### Scenario: A tag too long in the file

- **WHEN** `records.json` holds a record whose tag is longer than 120 characters
- **THEN** that tag is dropped, and the record, its title, its description, and its other tags stay readable and writable

#### Scenario: Tags merge

- **WHEN** one device adds “Long Chen” and another adds “Silver Series” to the same record
- **THEN** both tags exist after the stores merge

### Requirement: Create or find a tagged record from a selection

Selecting a phrase in a chapter and opening the context menu SHALL offer to create a record when no record has that tag, and to find the tagged records when one does.

- The record item SHALL appear only inside an editable chapter body, only while Show More Features is on, and only for a non-empty selection of at most 120 characters that stays within one paragraph and contains no line break. A selection may be one word or several.
- The phrase SHALL be the selected text, trimmed, with inner whitespace collapsed. Case SHALL NOT decide whether a tag matches.
- With no active record carrying that tag as a tag, the item SHALL read **Create Record…**. With one or more, it SHALL read **Find Record…**; the create item SHALL NOT be offered then.
- **Create Record…** SHALL open the right-hand pane pinned to Records and create the record immediately, with the phrase as both title and first tag, unfold it, and put the caret in its description. No dialog SHALL appear.
- A phrase that cannot be stored as a tag SHALL NOT produce an untagged record; the pane SHALL say why instead.
- **Find Record…** SHALL open the right-hand pane on Records, put the same phrase in the records search, and show the records carrying that tag. It SHALL NOT edit a chapter.
- While the tags index has not loaded, neither item SHALL be offered; a Create action that meets an existing tag after loading SHALL become Find and say so rather than create a duplicate. The tag item SHALL NOT depend on the spellcheck language.
- The item SHALL appear in the native context menu and, on macOS, in the one-word Look Up popup. A single selected word SHALL keep its Look Up, Dictionary, and Thesaurus choices; a longer selection SHALL suppress only those word-only choices.
- The item SHALL NOT appear with no selection, outside a chapter body, in Simple NEO, or in Pocket.

#### Scenario: Create from a name

- **WHEN** the writer selects “Long Chen” in a chapter, right-clicks, and chooses Create Record…
- **THEN** the right pane opens on Records with a record titled “Long Chen”, tagged “Long Chen”, unfolded and ready for its description

#### Scenario: The tag cannot be stored

- **WHEN** the writer chooses Create Record… for a phrase that no record can hold as a tag
- **THEN** no untagged record is created, and the pane says the tag was not accepted

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

### Requirement: Optional highlight of tagged names

The system SHALL offer a status-bar toggle that softly highlights tag occurrences in the manuscript, off by default.

- The toggle SHALL appear only while Show More Features is on, a book is open, and at least one active tag exists; it SHALL be an eye control in the status bar, with its state spoken and remembered on this device.
- While on, tagged phrases in the manuscript SHALL be tinted by roughly 5% from the text, using the CSS Highlight API; the page's text, markup, save state, exports, and undo history SHALL be unchanged. At most 200 distinct tags SHALL be tinted, and a tag beyond that bound SHALL NOT be painted rather than make the page unresponsive.
- The scan SHALL run when the toggle turns on, when the tag set changes, when a book opens, and after a chapter is replaced by undo, structural undo, or a disk refresh; it SHALL NOT scan on every keystroke or every word. After typing settles in a chapter, including a new paragraph, that chapter alone SHALL be re-read. Matches SHALL be bounded across the whole book so an extreme tag cannot make the manuscript unresponsive.
- A tag SHALL match within a paragraph, across inline formatting, but SHALL NOT match across a paragraph boundary.
- Turning the toggle off SHALL remove the highlight. Simple NEO and Pocket SHALL show no toggle, and turning Show More Features off SHALL clear any tint and prevent another.
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

#### Scenario: Simple NEO after a tab switch

- **WHEN** highlighting was on, Show More Features is turned off, and the writer switches tabs
- **THEN** no tag tint appears and the manuscript looks untouched

#### Scenario: A new paragraph

- **WHEN** the writer presses Enter in a chapter while highlighting is on
- **THEN** that chapter is re-read on its own after typing settles, not the whole book, and not once per keystroke

#### Scenario: More tags than the bound

- **WHEN** the library holds more than 200 distinct tags
- **THEN** the first 200 are tinted, the rest are not, and the page stays responsive

### Requirement: Tag edits merge safely

Tags SHALL travel and merge with their records, so two devices add and remove tags without reviving an old tag.

- A tag addition and a tag removal SHALL each carry their own time; the newer event for that tag SHALL win, and two events with the same time SHALL resolve toward the removal.
- A removed tag SHALL leave a tombstone, so an older copy cannot bring it back.
- Tags SHALL live inside each record in the library's `records.json`; they SHALL need no second file and SHALL be carried by both existing backups automatically.
- A tag operation SHALL NOT write a chapter, `book.json`'s content, `library.json`, or any book sidecar.

#### Scenario: A removal and an addition at the same time

- **WHEN** one device removes “Long Chen” and another adds it back with the same time
- **THEN** the removal wins and the tag stays removed

#### Scenario: Re-adding a removed tag

- **WHEN** the writer removes a tag and later adds the same text again, and that copy meets an older one
- **THEN** the re-added tag survives the merge

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
