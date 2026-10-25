# thesaurus Specification

## Purpose
Lets a writer look up English synonyms for a word in the open book without leaving NEO or reaching the internet, and replace the word with the chosen synonym in one undoable step.

## Requirements

### Requirement: Thesaurus entry in the editor's context menu

The system SHALL offer **Thesaurus…** in the right-click menu of the manuscript and the notes page when a single word can be resolved and English thesaurus data is available.

- The entry SHALL appear only when the right-click lands inside an editable chapter body or the notes editor, and a single word can be resolved from the pointer, or from a selection of exactly one word.
- A selection of two or more words SHALL suppress the entry, even when the pointer rests on one of the selected words.
- The entry SHALL appear only while NEO's spellcheck language is a variety of English. That language is a library-wide setting, not a per-book setting; for any other language no Thesaurus entry SHALL be shown.
- The entry SHALL appear only while the bundled thesaurus data is present and readable for that language; when it is missing, no Thesaurus entry SHALL be shown.
- The entry SHALL appear only while Show More Features is on; Simple NEO SHALL show no Thesaurus entry.
- On macOS, where NEO's own Look Up menu replaces the native menu for a one-word selection, the same **Thesaurus…** choice SHALL appear in that menu and behave identically.
- The existing Cut, Copy, Paste, Select All, screenplay page-break, and spellcheck-suggestion choices SHALL keep their current behaviour and order.
- No thesaurus entry SHALL appear on the shelf, in the snapshot view, in a placeholder or non-editable page, or when no book is open.

#### Scenario: Right-click a word while writing

- **WHEN** the writer right-clicks the word “batch” in an open chapter and Show More Features is on
- **THEN** the context menu shows Cut, Copy, Paste, Select All and a Thesaurus… entry
- **AND** choosing Thesaurus… opens the synonym window for “batch”

#### Scenario: Non-English interface language

- **WHEN** NEO's spellcheck language is French and the writer right-clicks a word
- **THEN** the context menu has no Thesaurus… entry

#### Scenario: Selection spans several words

- **WHEN** the writer has selected “a batch of” and right-clicks one of those words
- **THEN** no Thesaurus… entry appears

#### Scenario: Right-click beside a word

- **WHEN** the pointer is over whitespace, a paragraph break, or a non-text element
- **THEN** no Thesaurus… entry appears, and the rest of the context menu is unchanged

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** the context menu shows no Thesaurus… entry, and right-click otherwise behaves as before

#### Scenario: Selected word on macOS

- **WHEN** the writer selects one word on macOS and opens the context menu
- **THEN** NEO's Look Up menu offers both Look Up and Thesaurus… for that word

#### Scenario: Thesaurus data missing

- **WHEN** the bundled data for the current English language cannot be read
- **THEN** no Thesaurus… entry appears, and right-click otherwise behaves as before

### Requirement: Offline synonym lookup

The system SHALL resolve synonyms from data bundled with the application, without a network request, and SHALL return the senses recorded for the word.

- Lookup SHALL match the clicked word case-insensitively.
- When the exact form has no entry, lookup SHALL try a conservative fallback in this order: possessive `'s` / `’s`, plural `-s` / `-es` / `-ies`, past `-ed` / `-ied`, participle `-ing` / `-ying`, including consonant doubling (`batting` → `bat`). A base form SHALL be used only when it has an entry.
- A successful lookup SHALL return the recorded senses, each with its part of speech and, where the source marks one, its relation to the clicked word: broader term, similar term, related term, or antonym.
- A relation marker SHALL never be part of a word: what the writer sees as a word is only the word.
- Each word SHALL appear once across the whole entry, and the clicked word itself SHALL never be offered.
- When removing the clicked word leaves no synonyms at all, the system SHALL treat the word as having none.
- A word with no entry SHALL produce a short message naming the word, and SHALL NOT open an empty synonym window.
- Lookup SHALL answer within 150 ms once the data for that word's first letter is in memory, and the first lookup for a letter SHALL answer within 500 ms from a local disk.
- Lookup SHALL remain correct when the application is packaged and when the machine is offline.
- The bundled data SHALL be the Open English WordNet 2025 edition, derived from Princeton WordNet: synonyms from a synset's members, broader terms from its direct hypernyms, similar terms from its `similar` links, related terms from its `also` links, and antonyms from the sense-level antonym links.
- The data SHALL travel with the Creative Commons Attribution 4.0 attribution to the Open English WordNet team and Princeton University, and with the WordNet notice; both SHALL ship in packaged builds.

#### Scenario: Word with several senses

- **WHEN** the writer looks up “batch”
- **THEN** the window shows the recorded senses, for example a collection sense and a quantity sense, each with its own synonyms
- **AND** the word “batch” does not appear among its own synonyms

#### Scenario: Inflected form

- **WHEN** the writer looks up “batches” and the data has only “batch”
- **THEN** the window opens with the synonyms recorded for “batch”

#### Scenario: Possessive form

- **WHEN** the writer looks up “writer's” and the data has only “writer”
- **THEN** the window opens with the synonyms recorded for “writer”

#### Scenario: Word missing from the data

- **WHEN** the writer looks up a word the bundled data does not contain
- **THEN** a short message names the word as having no synonyms, and no window opens

#### Scenario: Entry with no other words

- **WHEN** the only recorded synonym for the clicked word is the word itself
- **THEN** the same “no synonyms” message appears, and no empty window opens

#### Scenario: A word with a marked opposite

- **WHEN** the writer looks up “good”
- **THEN** “bad” appears under an Antonym label, not as “bad (antonym)”

#### Scenario: No network

- **WHEN** the machine is offline
- **THEN** lookup and replacement work exactly as they do online

### Requirement: Synonym window

The system SHALL present the synonyms in a window that the writer can read, filter, and dismiss without changing the manuscript.

- The window SHALL name the looked-up word and the number of distinct synonyms found, counting each synonym once across all groups.
- Words SHALL be grouped under their part of speech and their relation to the clicked word, with the relation named in the group heading (for example “Adjective · Antonym”).
- Every word SHALL be shown as a selectable choice, with no relation marker inside the word itself.
- A filter field SHALL narrow the visible synonyms case-insensitively as the writer types, without touching the manuscript.
- Arrow keys SHALL move through the visible synonyms, Enter SHALL choose the highlighted synonym, and Esc or the close control SHALL dismiss the window.
- The window SHALL identify itself to assistive technology as a dialog named for the looked-up word.
- Dismissing the window by Esc, the close control, or a click outside it SHALL leave the manuscript unchanged and return focus to the editor.
- The window SHALL NOT open on its own, while typing, or on any gesture other than the explicit Thesaurus… choice.

#### Scenario: Relation headings

- **WHEN** the window opens for “good”
- **THEN** its groups read Adjective, Adjective · Similar term, Adjective · Related term, Adjective · Antonym, and so on
- **AND** no word button contains a parenthesised marker

#### Scenario: Filtering a long list

- **WHEN** the window lists many synonyms and the writer types “p” in the filter
- **THEN** only synonyms containing “p” remain visible, and the manuscript text is untouched

#### Scenario: Closing without choosing

- **WHEN** the writer presses Esc or clicks outside the window
- **THEN** the window closes, the original word remains, and the caret returns to where it was

#### Scenario: One interaction at a time

- **WHEN** another NEO dialog or menu is already open
- **THEN** the synonym window does not open on top of it, and the writer is told to close the other one first

### Requirement: Replacing the word with a chosen synonym

The system SHALL replace exactly the word the writer right-clicked with the chosen synonym, as one undoable edit, and close the window.

- Only the resolved word SHALL change; surrounding punctuation, spacing, and the rest of the paragraph SHALL stay byte-for-byte as they were.
- The chosen word SHALL be inserted as the word alone. A relation label shown beside it in the window SHALL NOT travel into the manuscript.
- Before changing anything, the system SHALL confirm the remembered position still holds the originally clicked word. If the page changed underneath, another device synced a newer chapter, or an undo moved the text, the system SHALL change nothing and tell the writer the word moved.
- The replacement SHALL carry the original word's capitalisation: an initial capital stays an initial capital, and an all-capitals word stays all-capitals.
- An apostrophe inside the chosen synonym SHALL follow the book's typography: a straight `'` becomes the typographic `’` rather than an ASCII mark.
- The replacement SHALL be undoable with a single undo, restoring the original word in its original position.
- After replacement the caret SHALL sit after the new word and the editor SHALL keep focus, so typing can continue immediately.
- If the writer does not choose a synonym, nothing SHALL be written to the chapter or notes page.
- Replacement SHALL work the same in a chapter body, a screenplay line, a poetry line, a footnote, and the notes page.

#### Scenario: Choosing a synonym

- **WHEN** the text reads “I have a batch of berries.”, the writer right-clicks “batch”, and chooses “pile”
- **THEN** the text reads “I have a pile of berries.”
- **AND** the window has closed and the caret is ready after “pile”

#### Scenario: Sentence-initial capital

- **WHEN** the writer replaces the capitalised word “Batch” with “pile”
- **THEN** the text reads “Pile”

#### Scenario: Choosing a word from a marked group

- **WHEN** the writer chooses “bad” from the Antonym group for “good”
- **THEN** the manuscript receives “bad”, with no parenthesised marker

#### Scenario: Apostrophe in the chosen word

- **WHEN** the writer chooses “baker's dozen”
- **THEN** the manuscript receives “baker’s dozen”

#### Scenario: Text moved while the window was open

- **WHEN** the word at the remembered position is no longer the clicked word
- **THEN** the system changes nothing and says the word moved

#### Scenario: Undo once

- **WHEN** the writer presses undo immediately after choosing a synonym
- **THEN** the original word returns, and the surrounding text is unchanged

#### Scenario: No choice

- **WHEN** the writer closes the window without choosing a word
- **THEN** no chapter, notes page, or sidecar is written
