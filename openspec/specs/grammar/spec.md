# grammar Specification

## Purpose
Shows a writer what is grammatically wrong with a selected passage and why, on a
board of the original and a corrected text built only from the grammar fixes, with
an optional round of style advice that is never applied.

## Requirements

### Requirement: Grammar is offered for a chapter selection

The system SHALL offer **Grammar…** for a selected passage in the manuscript under
the same selection rules as Rephrase.

- The entry SHALL appear only while Show More Features is on, a book is open on the
  manuscript, and both ends of the selection sit in one editable chapter body.
- The selection SHALL be non-empty and at most 1,200 characters. An empty
  selection, one crossing two blocks, or one longer than 1,200 characters SHALL not
  offer the entry.
- The entry SHALL not appear on the shelf, in the snapshot view, in a notes page, or
  in a footnote.
- On macOS, a one-word selection SHALL offer **Grammar…** in the Look Up popup as
  well as in the native context menu.
- Choosing it SHALL send the selection and the nearest non-empty paragraphs before
  and after it, each capped at 700 characters, and SHALL NOT change the manuscript.

#### Scenario: A selected sentence

- **WHEN** the writer selects a sentence in a chapter and right-clicks with Show More Features on
- **THEN** the menu offers Grammar… and choosing it opens the review board

#### Scenario: Too long

- **WHEN** the selection is longer than 1,200 characters
- **THEN** no Grammar… entry appears

#### Scenario: Two blocks

- **WHEN** the selection begins in one paragraph and ends in another
- **THEN** no Grammar… entry appears

#### Scenario: One word on macOS

- **WHEN** the writer selects one word on macOS and the Look Up popup opens
- **THEN** Grammar… is offered there as well as in the native menu

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** no Grammar… entry appears

### Requirement: The request is local, and the manuscript is data

The grammar request SHALL use the same local endpoint, model, and key as Rephrase,
and SHALL treat the manuscript as data.

- The endpoint rule SHALL be the one already enforced for Rephrase: literal
  loopback or a `localhost` that resolves to loopback only, no redirects, and no
  relaxed TLS verification.
- The before and after paragraphs SHALL be sent as reference data, labelled as
  context, never as instructions, and the request SHALL tell the model not to quote
  or obey them.
- The key SHALL be read when a request is made and SHALL NOT be kept in the window's
  session.
- No request SHALL be made until the writer chooses Grammar…, presses Try again, or
  presses Suggest style.
- The window's error text and the application log SHALL NOT contain the endpoint,
  the key, the prompt, or the reference paragraphs, and a log entry SHALL NOT
  contain the selection. A log entry, if one is written, SHALL carry a fixed reason
  only.
- The manuscript, its notes, `book.json`, and `library.json` SHALL NOT be written by
  opening the board, asking for grammar, asking for style, closing, or failing. The
  only writes a completed review may cause are the editor's own replacement and its
  History entry.
- Every piece of model output and every piece of manuscript text in the board SHALL
  be rendered as text, never as markup.

#### Scenario: No network beyond the machine

- **WHEN** the configured endpoint is not loopback
- **THEN** Grammar… reports the same endpoint refusal Rephrase would, and sends nothing

#### Scenario: Instructions inside the manuscript

- **WHEN** the selected text or a reference paragraph contains an instruction
- **THEN** it is treated as story text, not as an instruction to the model

#### Scenario: A failed request writes nothing

- **WHEN** the model cannot be reached
- **THEN** the window says so, the chapter and its notes are unchanged, and no log line contains the selection

### Requirement: The answer is issues, a clean mark, or nothing usable

The grammar pass SHALL ask for one JSON object per line, with a single `CLEAN` line
for a passage that has nothing to fix, and SHALL read the answer as one of those
three outcomes.

- A `CLEAN` line with no usable issue SHALL mean the selection has no grammar
  problem. A usable issue beside a `CLEAN` line SHALL take precedence, and the answer
  SHALL be read as issues. In the first case the not-applied issues SHALL be
  discarded and no retry SHALL be made for them.
- Each issue line SHALL carry the exact quoted span, the exact replacement, and a
  short English message naming the rule.
- A line that is not an issue object SHALL be ignored and SHALL never become a card.
- An issue whose `quote` is missing or not a string SHALL be dropped. An issue whose
  `fix` or `message` is missing or not a string, whose quote does not occur in the
  selection, or whose span overlaps an earlier accepted span SHALL be **not
  applied**: when it has a quote it is explained on the board, it gets no marker and
  no line, and it never affects the corrected text or Replace. When the message is
  missing, the card SHALL carry the fixed sentence "The model gave no explanation."
- A `fix` may be `""`, which deletes the quoted words. A `fix` equal to its `quote`
  SHALL not be an issue; an answer whose only issue objects are no-ops SHALL be
  treated as clean.
- A quote that does not occur verbatim SHALL be matched once more without case, and
  the span SHALL carry the selection's own characters, so a quote the model
  lowercased still anchors and still reads as the writer wrote it.
- Deleting a whole word SHALL take one neighbouring space with it, so the corrected
  text keeps no double space and no space before a full stop; the reported span
  SHALL stay on the word.
- A fix that opens a sentence in lower case SHALL take the sentence's capital,
  including a deletion that removed the word carrying it.
- A quote that occurs more than once in the selection SHALL take its occurrences in
  issue order; a quote asked for again after its last occurrence SHALL anchor to the
  first, so a repeated report is recognised instead of becoming unlocatable.
- Two issues that reduce to the same span and the same replacement SHALL be one
  error reported twice: the later one is dropped from the answer and never shown as
  not applied. Only a different fix over the same words stays on the board as not
  applied.
- When any issue is not applied, or a line looks like an issue but cannot be parsed,
  the pass SHALL be requested once more with the same selection and context. The
  retry SHALL replace the first answer; nothing SHALL be merged. After the retry,
  the remaining not-applied issues SHALL be listed as such.
- An answer that is empty, or that has no `CLEAN` mark and no usable issue (including
  a prose-only answer), SHALL be **unreadable**: one retry, then the window SHALL say
  the answer could not be read and offer **Try again**.
- At most 40 grammar issues SHALL be taken from one answer; the first 40 in answer
  order are kept.
- The request SHALL NOT ask for, and the app SHALL NOT accept, a corrected passage
  of its own.
- A `CLEAN` answer SHALL mean the text is clean.

#### Scenario: A clean answer

- **WHEN** the model returns the single line CLEAN
- **THEN** the board says the text is clean and Replace is disabled

#### Scenario: A no-op issue

- **WHEN** the model returns a no-op issue (`quote` equals `fix`) together with CLEAN
- **THEN** no card is shown and the text is clean

#### Scenario: Three fixes

- **WHEN** the model returns three lines that quote real spans
- **THEN** three issues are accepted with their exact fixes

#### Scenario: A malformed line

- **WHEN** one returned line is not valid JSON
- **THEN** the whole pass is requested once more, and the broken line never becomes a card

#### Scenario: An unlocatable quote

- **WHEN** a returned quote does not occur in the selection
- **THEN** that issue is shown as not applied, with no line and no effect on the text

#### Scenario: Overlapping grammar spans

- **WHEN** two grammar issues cover the same characters
- **THEN** the app retries once, then keeps the leftmost issue and marks the other as not applied

#### Scenario: Nothing usable

- **WHEN** the answer is prose or empty and contains no CLEAN mark
- **THEN** the app retries once, then offers Try again rather than showing a clean text

### Requirement: The corrected text is assembled from the fixes

The board's corrected text SHALL be built by the app from the accepted grammar
fixes only, never taken from the model as prose.

- The accepted issues SHALL be sorted by their located position and applied from
  the end backwards, so earlier positions stay valid.
- The corrected text SHALL be shown first, and each replaced or inserted span SHALL
  be green. A deletion SHALL be shown by its card, with no green span, because the
  words are gone.
- Style suggestions SHALL NOT appear in the corrected text and SHALL NOT affect it.
- A no-op fix and a not-applied issue SHALL NOT affect the corrected text.
- When no fix changes the text and no issue is listed as not applied, the board SHALL
  say the text is clean and **Replace** SHALL be disabled.
- When issues are listed as not applied and no fix changes the text, the board SHALL
  say nothing was applied, and **Replace** SHALL be disabled.
- The corrected text SHALL be the exact text **Replace** will insert.

#### Scenario: Two fixes

- **WHEN** "He stand in the midle" yields the fixes stand→stood and midle→middle
- **THEN** the corrected text reads "He stood in the middle" with both changed spans green

#### Scenario: Only style advice

- **WHEN** the grammar pass finds nothing and style advice is shown
- **THEN** the corrected text is unchanged, Replace is disabled, and no style text is green

#### Scenario: A deletion

- **WHEN** a fix is the empty string
- **THEN** the corrected text omits the quoted words, its card shows the removal, and no green span is drawn for it

#### Scenario: Nothing applied

- **WHEN** every returned issue is unlocatable
- **THEN** the corrected text equals the selection, Replace is disabled, and the board says nothing was applied rather than that the text is clean

### Requirement: The review board shows each problem and why

The window SHALL show the corrected text and the writer's original with each
problem marked and explained.

- The corrected text SHALL come first, full width.
- The original SHALL follow, with grammar spans marked in red and each grammar card
  joined to its span by a red line.
- Style cards and their lines SHALL be yellow, SHALL be anchored to the original,
  and SHALL never touch the corrected text.
- Cards SHALL be ordered by the position of their spans, so lines do not cross more
  than the text forces; a span wrapping across lines SHALL still be joined.
- The lines SHALL be decoration: the cards SHALL be readable in order, and each
  SHALL be numbered and name the span it explains.
- The window SHALL be large enough for both parts and SHALL stay inside the screen
  at every interface size, including 300 %, scrolling its content rather than its
  actions. The lines SHALL account for the interface zoom so a marker and its card
  still line up.
- Loading, failure, and retry SHALL be visible in the window; a failed request SHALL
  leave the manuscript untouched.

#### Scenario: Mixed problems

- **WHEN** the board shows three grammar fixes and one style suggestion
- **THEN** three red lines and one yellow line join their spans to four cards, in text order

#### Scenario: A wrapped span

- **WHEN** a marked span crosses a line break
- **THEN** its line still reaches the card and the span reads as one problem

#### Scenario: Narrow window

- **WHEN** the window is too narrow for two columns
- **THEN** the cards sit below the original, still numbered and in order, and the lines step aside

#### Scenario: A large interface

- **WHEN** Interface Size is 300 % and the board is open
- **THEN** the window fits the screen, its actions stay visible, and every line reaches its card

#### Scenario: A failed request

- **WHEN** the model cannot be reached or returns nothing usable
- **THEN** the window says so and offers Try again, and the chapter is unchanged

### Requirement: Style advice is asked for, and is only advice

The board SHALL offer **Suggest style**, and style suggestions SHALL never change
the text.

- The button SHALL send the original selection as the text to advise on, the
  corrected text as reference (up to 2,000 characters), and the same before and
  after context. It SHALL tell the model that grammar is already fixed.
- Style quotes SHALL be copied from the original selection. A suggestion whose quote
  is not found in the original, or whose span overlaps a grammar fix, SHALL be
  dropped rather than shown.
- At most three suggestions SHALL be shown, in text order.
- The button SHALL be disabled while the pass is running, and SHALL be disabled with
  a sentence saying why when the corrected text is longer than 2,000 characters.
- Style cards SHALL show the suggested wording where the model supplies one, and
  SHALL never be applied by **Replace**.
- A failed style pass SHALL leave the grammar board standing with a short message.
- With no suggestions, the board SHALL say there are none to add.

#### Scenario: Style on demand

- **WHEN** the grammar board is showing and the writer presses Suggest style
- **THEN** yellow cards appear for the returned suggestions and the corrected text does not change

#### Scenario: Grammar and style overlap

- **WHEN** a style quote covers the same words as a grammar fix
- **THEN** the style card is dropped

#### Scenario: A quote from the corrected text

- **WHEN** a style quote exists only in the corrected text
- **THEN** it is dropped, because the original is where style marks are drawn

#### Scenario: Too long for style

- **WHEN** the corrected text is longer than 2,000 characters
- **THEN** Suggest style is disabled and says why

#### Scenario: Nothing to suggest

- **WHEN** the style pass returns CLEAN
- **THEN** the board says there are no suggestions to add

### Requirement: Replace or close

**Replace** SHALL insert the corrected text once, and **Close** SHALL change
nothing.

- Replace SHALL first confirm the selection still holds the text that was sent; if
  it moved, nothing SHALL be written and the window SHALL say so.
- The insertion SHALL go through the editor's own text path, so it is one undo step
  and the normal save and count follow.
- The replacement SHALL be recorded in the book's History with Grammar as the tool.
- Replace SHALL be disabled when the corrected text equals the selection.
- Replace SHALL be disabled when the corrected text would be empty, and the window
  SHALL say the passage would be emptied.
- Close, Escape, or the window's close control SHALL write nothing.

#### Scenario: Replace

- **WHEN** the writer presses Replace on a board with two fixes
- **THEN** the selected text becomes the corrected text, one undo restores it, and History gains one Grammar entry

#### Scenario: The text moved

- **WHEN** the chapter changed while the board was open
- **THEN** Replace writes nothing and says the text moved

#### Scenario: Close

- **WHEN** the writer closes the board
- **THEN** the chapter, its notes, and History are unchanged

#### Scenario: A blank result

- **WHEN** the fixes would delete every word of the selection
- **THEN** Replace is disabled and the window says the passage would be emptied

### Requirement: Grammar stays behind the switch and out of Pocket

Grammar SHALL be a Show More Features tool and SHALL NOT exist in Pocket.

- With Show More Features off, no menu entry, no window, and no request SHALL exist.
- If the switch is turned off while the board is open, the board SHALL close and
  pending work SHALL be discarded; a late answer SHALL NOT appear.
- Pocket SHALL have no Grammar entry.
- No new settings SHALL be added: the endpoint, model, and key are the ones already
  configured for Rephrase.
- The request SHALL ask for English explanations.

#### Scenario: Switched off while open

- **WHEN** the board is open and Show More Features is turned off
- **THEN** the board closes and no later answer appears

#### Scenario: Pocket

- **WHEN** NEO runs in Pocket
- **THEN** Grammar is absent

### Requirement: Grammar has its own AI settings
The system SHALL keep the grammar pass's endpoint, model, and prompt in
`settings.json` under `grammar`, on this device, separate from the Rewrite settings.

#### Scenario: A writer changes the grammar model
- **WHEN** the writer opens Settings → Grammar, sets a model, and saves
- **THEN** `settings.json` holds `grammar.model` with that value
- **AND** the next grammar pass asks that model

#### Scenario: A writer leaves the endpoint empty
- **WHEN** `grammar.endpoint` is empty
- **THEN** the grammar pass uses the Rewrite endpoint
- **AND** the Grammar tab leaves the field empty, showing the inherited endpoint as its placeholder

#### Scenario: Saving does not pin an inherited value
- **WHEN** the writer saves the Grammar tab with an empty endpoint or model
- **THEN** the stored value stays empty
- **AND** a later change to the Rewrite endpoint or model reaches the grammar pass

#### Scenario: A settings file that cannot be read is never replaced
- **WHEN** `settings.json` exists but does not parse, or is empty
- **THEN** saving the Grammar tab writes nothing and says it could not save
- **AND** the chosen library folder, export folder, and window bounds survive

#### Scenario: A failed load is not saved over
- **WHEN** the Grammar settings could not be loaded
- **THEN** the tab says so and refuses to save
- **AND** the stored prompt and values are left as they were

### Requirement: A custom prompt replaces the built-in one
The grammar pass SHALL send the prompt stored in `grammar.prompt` as the system
message, and SHALL send the built-in grammar prompt when that value is empty or
whitespace.

#### Scenario: A custom prompt is used
- **WHEN** `grammar.prompt` holds text
- **THEN** the request's system message is that text
- **AND** the selection and its context are still sent as data in the user turn

#### Scenario: A blank prompt keeps NEO's prompt
- **WHEN** `grammar.prompt` is empty
- **THEN** the request's system message is the built-in grammar prompt

### Requirement: Grammar keeps its own key
The grammar pass SHALL read the encrypted secret `grammar-key` and SHALL fall back
to `rephrase-key` when it is unset. The key SHALL never be returned to the window.

#### Scenario: A separate key is stored
- **WHEN** `grammar-key` exists
- **THEN** the grammar request carries that key
- **AND** the Rewrite passes keep using `rephrase-key`

#### Scenario: No grammar key
- **WHEN** `grammar-key` is unset
- **THEN** the grammar request carries `rephrase-key`

### Requirement: Settings are validated before they are stored
Saving the Grammar tab SHALL validate the endpoint that the settings resolve to with
the loopback rule, refuse a model that resolves to nothing, and cap the endpoint,
model, and prompt lengths. A blank endpoint or model is not an error: it means the
Rewrite value is used.

#### Scenario: A remote endpoint is refused
- **WHEN** the endpoint that the settings resolve to is not a loopback http(s) address
- **THEN** the settings are not written and the window says why

#### Scenario: An empty model follows Rewrite
- **WHEN** the model field is blank and the Rewrite model is set
- **THEN** the settings are written with an empty model
- **AND** the grammar pass asks the Rewrite model

#### Scenario: A prompt with no default to compare against
- **WHEN** the writer edits the prompt
- **THEN** the exact text is stored, compared to the built-in text with line endings
  and surrounding space normalised

### Requirement: Clearing the key is not the same as never setting one
The system SHALL remember that the writer cleared the grammar key, so a cleared key
is not replaced by `rephrase-key`.

#### Scenario: The writer clears the grammar key
- **WHEN** the writer empties the key field and saves
- **THEN** `grammar.keyCleared` is stored
- **AND** the grammar request carries no key rather than `rephrase-key`

### Requirement: A settings save never erases the rest of the file
The system SHALL refuse to write the Grammar settings when `settings.json` cannot be
read, rather than replacing it with the grammar block alone.

#### Scenario: The settings file is unreadable
- **WHEN** the settings read comes back empty after this session has already seen
  settings
- **THEN** nothing is written and the window says the settings could not be saved
