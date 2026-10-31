# Spec Delta

## MODIFIED Requirements

### Requirement: Replacing the word with a chosen synonym

The system SHALL replace exactly the word the writer right-clicked with the chosen synonym, as one undoable edit, and close the window.

- Only the resolved word SHALL change; surrounding punctuation, spacing, and the rest of the paragraph SHALL stay byte-for-byte as they were.
- The chosen word SHALL be inserted as the word alone. A relation label shown beside it in the window SHALL NOT travel into the manuscript.
- Before changing anything, the system SHALL confirm the remembered position still holds the originally clicked word. If the page changed underneath, another device synced a newer chapter, or an undo moved the text, the system SHALL change nothing and tell the writer the word moved.
- The replacement SHALL carry the original word's capitalisation: an initial capital stays an initial capital, and an all-capitals word stays all-capitals.
- An apostrophe inside the chosen synonym SHALL follow the book's typography: a straight `'` becomes the typographic `’` rather than an ASCII mark.
- The replacement SHALL be undoable with a single undo, restoring the original word in its original position.
- After replacement the caret SHALL sit after the new word and the editor SHALL keep focus, so typing can continue immediately.
- A successful replacement SHALL be recorded in the book's History: the word as it stood, the word as it was inserted, the time, the thesaurus as its source, and the chapter number at the time where the replacement happened in a chapter. A replacement in a notes page or a footnote SHALL carry no chapter number.
- Recording SHALL happen only after the insertion succeeded. A moved word, a failed insertion, or a closed window with no choice SHALL record nothing.
- Recording SHALL NOT change the replacement, its undo step, the caret, or the manuscript, and an undo after a recorded replacement SHALL leave the entry in place. While Show More Features is off, nothing SHALL be recorded.
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

#### Scenario: Recorded in History

- **WHEN** the writer replaces “Batch” with “pile” in chapter 3 while Show More Features is on
- **THEN** the book's History gains one entry showing “Batch” replaced by “Pile”, the time, and chapter 3

#### Scenario: Nothing replaced, nothing recorded

- **WHEN** the word moved before the writer chose, or the writer closes the window without choosing
- **THEN** no History entry is added

#### Scenario: A notes page replacement

- **WHEN** the writer replaces a word on the notes page
- **THEN** the History entry carries no chapter number
