## ADDED Requirements

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
- **AND** the Grammar tab shows the effective endpoint

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
Saving the Grammar tab SHALL validate the endpoint with the loopback rule, refuse an
empty model, and cap the endpoint, model, and prompt lengths.

#### Scenario: A remote endpoint is refused
- **WHEN** the endpoint is not a loopback http(s) address
- **THEN** the settings are not written and the window says why

#### Scenario: An empty model is refused
- **WHEN** the model field is blank
- **THEN** the settings are not written

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
