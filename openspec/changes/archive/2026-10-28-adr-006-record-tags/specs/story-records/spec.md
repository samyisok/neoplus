# Spec Delta

## MODIFIED Requirements

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

## ADDED Requirements

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
