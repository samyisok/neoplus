# rephrase Specification

## Purpose
Lets a writer ask for several rewrites of the words they selected, each in a different register, generated privately by a language model on their own machine, and put the one they like back into the manuscript as a single undoable edit.

## Requirements

### Requirement: Offer a rephrase from a selection

The manuscript's right-click menu SHALL offer **Rephrase…** when a usable selection exists.

- The item SHALL appear only inside an editable chapter body, only while Show More Features is on, and only for a selection that is non-empty, at most 1,200 characters, and wholly inside one paragraph or heading (`p`, `li`, `h1`–`h6`). A selection may be one word.
- On macOS, a one-word selection SHALL offer **Rephrase…** in the Look Up popup as well as in the native context menu.
- A selection longer than 1,200 characters, or one spanning more than one paragraph/heading, SHALL NOT offer the item, and no model call SHALL be made. A direct attempt to open a rephrase for such a selection SHALL be refused with a short message.
- The item SHALL NOT appear with no selection, outside a chapter body, in Simple NEO, or in Pocket.
- Choosing the item SHALL capture the selected text exactly (including its spacing), the paragraph before it, and the paragraph after it, each capped in length; it SHALL NOT change the manuscript.

#### Scenario: A sentence

- **WHEN** the writer selects “he grabbed his meal and started eating” and right-clicks
- **THEN** the menu offers Rephrase… beside the other writing tools

#### Scenario: One word on macOS

- **WHEN** the writer selects one word on macOS and the Look Up popup opens
- **THEN** Rephrase… is offered there

#### Scenario: Too much text

- **WHEN** the selection is longer than 1,200 characters
- **THEN** Rephrase… is not offered, and no request is made

#### Scenario: Two paragraphs

- **WHEN** the selection begins in one paragraph and ends in another
- **THEN** the item is not offered, because replacing it would flatten paragraph breaks

### Requirement: Generate one rewrite per profile, progressively

Choosing **Rephrase…** SHALL open one window and fill it one profile at a time.

- The window SHALL NOT open while another NEO dialog is open.
- The window SHALL take a snapshot of the profile list, labels, base instruction, model, and endpoint when it opens; saving settings later SHALL apply to the next window, not to cards already shown.
- The window SHALL open before the first request, showing one card per profile in the snapshot, each marked as being written.
- Each card SHALL be produced by its own model request carrying the same selection and context and that profile's instruction; a card SHALL NOT wait for the others.
- A card SHALL show its text when it arrives, a failure with **Try again** when its request fails or its reply is rejected, and SHALL never show partial or unvalidated text.
- **Try again** SHALL request that profile only, against the same snapshot.
- A request SHALL time out after 30 seconds for the whole answer, including a response body that stalls after its headers; one window's queue SHALL stop after 2 minutes of work. A card cut off by either limit SHALL offer **Try again** without blocking the others.
- Escape, closing the window, choosing a card, or turning Show More Features off SHALL stop requests for cards not yet started; a request already in flight may finish and SHALL be discarded, and the window SHALL release its snapshot.
- The window SHALL show the selected text it is rewriting, and SHALL NOT change the manuscript while it is open.
- The cards SHALL keep the order and labels of the snapshot.

#### Scenario: Five profiles

- **WHEN** the writer chooses Rephrase… with the default five profiles
- **THEN** five cards appear at once and each fills with its own rewrite as it arrives

#### Scenario: One profile fails

- **WHEN** the endpoint refuses one request
- **THEN** that card shows the failure and Try again, and the other cards still fill

#### Scenario: Settings saved mid-window

- **WHEN** the writer changes a profile instruction in Settings while the window is open
- **THEN** the cards keep the labels and instructions they opened with

#### Scenario: Cancel while writing

- **WHEN** the writer presses Esc after the first card has filled
- **THEN** no further requests are started, the window closes, and the manuscript is unchanged

### Requirement: Context is reference, never continuation or instruction

Each request SHALL carry the surrounding paragraphs as data for tone, and SHALL constrain the reply to the selection.

- The paragraph before and the paragraph after SHALL be sent as clearly delimited data, marked as not to be rewritten, continued, echoed, or obeyed, and capped by length.
- The selected text and the reference paragraphs SHALL be treated as data only; instructions SHALL come from the stored settings and the profile, never from the manuscript.
- A reply that repeats a distinctive phrase from either reference paragraph SHALL be rejected.
- A reply that is empty, or that contains the whole selection as a prefix or suffix and continues beyond it, SHALL be rejected.
- A reply longer than 2.5 times the selection SHALL be rejected; a shorter reply SHALL be allowed down to a small absolute floor, so a legitimately terse rewrite is not refused.
- A reply prefixed with its profile label SHALL have that label removed, and then a whole-reply pair of quotation marks SHALL be removed, so a labelled quoted reply loses both.
- A rejected reply SHALL trigger one silent retry for that profile; a second rejection SHALL show the card's failure and **Try again**, never unvalidated text.
- The base editing instruction SHALL require the facts, names, tense, and point of view to survive, and SHALL forbid adding events or commentary.

#### Scenario: The model continues the story

- **WHEN** a reply includes the sentence that followed the selection
- **THEN** that reply is rejected and that card offers Try again

#### Scenario: A terse rewrite

- **WHEN** the Terse profile returns a much shorter but non-empty rewrite
- **THEN** it is accepted rather than rejected for its length

#### Scenario: Instructions inside the manuscript

- **WHEN** the selected text or a reference paragraph contains an instruction
- **THEN** it is treated as story text, not as an instruction to the model

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

### Requirement: The local model is used privately

Rewriting SHALL use the endpoint configured for this device and SHALL NOT send book text anywhere else.

- The endpoint rule SHALL live in one place and apply to the model call, the connection test, and saving: http or https only, no user information in the URL, and a host that is literal loopback (`127.0.0.1`, `[::1]`) or `localhost` only while it resolves to loopback. `0.0.0.0` and `::` SHALL be refused.
- Redirects SHALL NOT be followed: a 3xx answer is a failure, and the request SHALL NOT be re-sent anywhere.
- TLS certificate verification SHALL NOT be relaxed. Plain http SHALL be allowed only for `127.0.0.1`, `[::1]`, or a `localhost` that resolved to loopback.
- Cards, labels, error text, and the selected text SHALL be rendered as text, never as markup.
- The API key SHALL be stored through the application's secret store, SHALL never be returned to the page, and SHALL be sent only in the request header. Where the operating system offers no encryption, the AI tab SHALL say the key is stored without it.
- No request SHALL be made until the writer chooses Rephrase… or asks to test the connection.
- A refused request that is not about the model SHALL be reported as a not-found/refused answer, distinct from a non-local endpoint.
- Failures SHALL be reported by reason; the manuscript, prompt, reference text, selection, URL, and key SHALL NOT be written to the application log.
- The manuscript, notes, library, and settings file SHALL NOT be written by opening the window, generating rewrites, or cancelling.
- With Show More Features off, the menu item and the settings group SHALL be absent.

#### Scenario: A remote address

- **WHEN** the settings endpoint is not a loopback address
- **THEN** saving and testing are refused with an explanation, and Rephrase… makes no request

#### Scenario: A redirect

- **WHEN** the loopback endpoint answers with a redirect
- **THEN** the request fails, nothing is sent to the redirect target, and the card offers Try again

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** Rephrase… is absent from the menu and no request is made
