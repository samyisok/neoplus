# Spec Delta

## MODIFIED Requirements

### Requirement: Choose a rewrite and replace the selection

Choosing a card SHALL replace exactly the selected text with that rewrite, as one undoable edit.

- The replacement SHALL happen only while the captured range is still in the document and its text still matches the captured selection, comparing both sides with the same normalisation; otherwise nothing SHALL be written and the window SHALL say the text moved.
- The replacement SHALL go through the editor's own text insertion so that undo, saving, counting, and the structural state behave as one typed edit.
- The replacement itself SHALL NOT write a chapter, `book.json`, or `library.json`; only the normal save after the edit applies. The History record described below is written separately and SHALL NOT alter the replacement.
- A successful replacement SHALL be recorded in the book's History: the selected text as it stood, the chosen rewrite, the profile whose card was chosen, the time, and the chapter number at the time.
- Recording SHALL happen only after the insertion succeeded. A moved selection, a failed request, a cancelled window, or a window closed without a choice SHALL record nothing.
- Recording SHALL NOT change the edit, its single undo step, focus, or the manuscript, and an undo after a recorded replacement SHALL leave the entry in place. While Show More Features is off, nothing SHALL be recorded.
- Cancelling, closing the window, a failed request, or Show More Features being off SHALL leave the manuscript untouched.

#### Scenario: Replace one sentence

- **WHEN** the writer chooses the Heroic card
- **THEN** the selected sentence becomes that rewrite and one undo restores the original

#### Scenario: The writer kept typing

- **WHEN** the range changed while the variants were being written
- **THEN** choosing a card writes nothing and the window says the text moved

#### Scenario: Recorded in History

- **WHEN** the writer chooses the Heroic card for a selected sentence in chapter 2 while Show More Features is on
- **THEN** the book's History gains one entry showing the selected text, the rewrite, the profile name, the time, and chapter 2

#### Scenario: Nothing recorded without a replacement

- **WHEN** the selection moved before a card was chosen, or the writer closes the window without choosing
- **THEN** no History entry is added
