# dictionary Specification

## Purpose
Lets a writer read the English definition and usage examples of a word in the open book without leaving NEO or reaching the internet, while leaving the manuscript untouched.

## Requirements

### Requirement: Dictionary entry in the editor's context menu

The system SHALL offer **Dictionary…** beside **Thesaurus…** in the right-click menu of the manuscript and the notes page when a single word can be resolved and dictionary data is available.

- The entry SHALL appear only when the right-click lands inside an editable chapter body, the notes editor, or a footnote's text, and a single word can be resolved from the pointer or from a selection of exactly one word.
- A selection of two or more words SHALL suppress the Dictionary entry, as it suppresses the Thesaurus entry, even when the pointer rests on one of the selected words.
- Both entries SHALL appear only while NEO's spellcheck language is a variety of English. That language is a library-wide setting, not a per-book setting.
- Each entry SHALL appear only while its own bundled data is present and readable; a missing dictionary data set SHALL hide Dictionary… without hiding Thesaurus….
- Both entries SHALL appear only while Show More Features is on; Simple NEO SHALL show neither.
- On macOS, where NEO's own Look Up menu replaces the native menu for a one-word selection, both **Dictionary…** and **Thesaurus…** SHALL appear in that menu and behave identically.
- The two entries SHALL keep a stable order, with Dictionary… first, and SHALL NOT change the existing Cut, Copy, Paste, Select All, screenplay page-break, or spellcheck-suggestion choices.
- No dictionary entry SHALL appear on the shelf, in the snapshot view, in a placeholder or non-editable page, or when no book is open.

#### Scenario: Right-click a word while writing

- **WHEN** the writer right-clicks the word “batch” in an open chapter and Show More Features is on
- **THEN** the context menu shows Dictionary…, Thesaurus…, Cut, Copy, Paste, and Select All
- **AND** choosing Dictionary… opens the definition window for “batch”

#### Scenario: Non-English interface language

- **WHEN** NEO's spellcheck language is French and the writer right-clicks a word
- **THEN** neither Dictionary… nor Thesaurus… appears

#### Scenario: Selection spans several words

- **WHEN** the writer has selected “a batch of” and right-clicks one of those words
- **THEN** no Dictionary… entry appears

#### Scenario: Dictionary data missing

- **WHEN** the dictionary data cannot be read but the thesaurus data can
- **THEN** the menu shows Thesaurus… and no Dictionary…

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** the menu shows no Dictionary… entry, and right-click otherwise behaves as before

#### Scenario: Selected word on macOS

- **WHEN** the writer selects one word on macOS and opens the context menu
- **THEN** NEO's Look Up menu offers Look Up, Dictionary…, and Thesaurus…

### Requirement: Offline definition lookup

The system SHALL resolve definitions from data bundled with the application, without a network request, and SHALL return the senses recorded for the word.

- Lookup SHALL match the clicked word case-insensitively.
- When the exact form has no entry, lookup SHALL try the same conservative fallback as the thesaurus: possessive `'s` / `’s`, plural forms, past and participle forms, including dropped-`e` and consonant-doubling variants. A base form SHALL be used only when it has an entry.
- A successful lookup SHALL return the recorded senses, each with its part of speech, its definition, and its usage examples where the source records them, in the source's sense order.
- Definitions SHALL be plain text: no part-of-speech tags, relation markers, or markup inside them.
- A word with no entry SHALL produce a short message naming the word, and SHALL NOT open an empty definition window.
- Lookup SHALL answer within 150 ms once the data for that word's first letter is in memory, and the first lookup for a letter SHALL answer within 500 ms from a local disk.
- Lookup SHALL remain correct when the application is packaged and when the machine is offline.
- The bundled data SHALL be the Open English WordNet 2025 edition, derived from Princeton WordNet, bundled with the application without changing the recorded definitions or examples.
- The data SHALL travel with the Creative Commons Attribution 4.0 attribution to the Open English WordNet team and Princeton University, and with the WordNet notice; both SHALL ship in packaged builds.

#### Scenario: Word with several senses

- **WHEN** the writer looks up “batch”
- **THEN** the window shows its noun senses and its verb sense, each with its definition
- **AND** no sense carries a marker such as “(noun)” inside the definition

#### Scenario: Usage examples

- **WHEN** the writer looks up “batch” and a sense has recorded examples
- **THEN** that sense shows its examples as quoted sentences under the definition

#### Scenario: Inflected form

- **WHEN** the writer looks up “batches” and the data has only “batch”
- **THEN** the window opens with the definitions recorded for “batch”

#### Scenario: Word missing from the data

- **WHEN** the writer looks up a word the bundled data does not contain
- **THEN** a short message names the word as having no definition, and no window opens

#### Scenario: No network

- **WHEN** the machine is offline
- **THEN** lookup works exactly as it does online

### Requirement: Definition window

The system SHALL present definitions in a window that the writer can read and dismiss without changing the manuscript.

- The window SHALL name the looked-up word and the number of definitions found.
- Senses SHALL be grouped under their part of speech, with the definition first and usage examples beneath it in quotation marks.
- A long entry SHALL scroll inside the window without moving the page.
- Esc, the close control, and a click outside the window SHALL dismiss it and return focus to the editor.
- The window SHALL identify itself to assistive technology as a dialog named for the looked-up word.
- The window SHALL NOT open on its own, while typing, or on any gesture other than the explicit Dictionary… choice.
- The window SHALL refuse to open on top of another NEO dialog, with a short message saying to close the other one first.

#### Scenario: Long entry scrolls

- **WHEN** the writer opens a word with many senses, such as “run”
- **THEN** the window keeps its size and its list scrolls, while the manuscript page does not move

#### Scenario: Closing with Esc

- **WHEN** the writer presses Esc while the definition window is open
- **THEN** the window closes and the caret returns to the editor

#### Scenario: One interaction at a time

- **WHEN** another NEO dialog is already open
- **THEN** the definition window does not open on top of it, and the writer is told to close the other one first

### Requirement: Dictionary never edits the manuscript

The system SHALL treat the definition window as read-only with respect to the book.

- Opening, reading, or closing the window SHALL NOT modify any chapter, notes page, sidecar, `book.json`, or `library.json`.
- Closing the window SHALL leave the writer's undo history exactly as it was before the lookup.
- No word from a definition SHALL be inserted into the manuscript by the dictionary.

#### Scenario: Read and close changes nothing

- **WHEN** the writer opens Dictionary… for a word, reads the entry, and closes the window
- **THEN** the chapter's HTML is byte-for-byte unchanged and one undo still restores whatever preceded the lookup
