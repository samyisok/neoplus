# Spec Delta

## MODIFIED Requirements

### Requirement: Local rewriting settings

The **AI** tab SHALL let the writer point Rephrase… at a local model and describe the registers it should write in.

- The tab SHALL show the endpoint (a URL), the model id, a masked API key with **Replace…**, the base editing instruction, and the profile list.
- The endpoint SHALL default to `http://127.0.0.1:8080/v1` and the model to the local model in use; both SHALL be editable.
- The endpoint SHALL be refused unless it is http or https and its host is `127.0.0.1`, `[::1]`, or `localhost` while `localhost` resolves to loopback; a non-local address SHALL show an inline error and SHALL NOT be saved. The main process SHALL re-check the endpoint when it writes it.
- The profile list SHALL hold between 2 and 8 entries, each with a label and an instruction; the defaults SHALL be **Polite**, **Common**, **Natural**, **Heroic**, and **Terse**. A profile SHALL be addable and removable within those limits, and labels SHALL be unique ignoring case.
- The key SHALL be writable through a **Replace…** affordance and never readable in the window; when a key is already stored the field SHALL say so, leaving it unchanged SHALL keep the stored key, and clearing it through Replace… then Save SHALL remove the stored key. The window SHALL learn the secret's name from the settings read rather than hard-coding it.
- The tab SHALL say when the operating system offers no secret storage, so the writer knows the key is being kept without encryption.
- **Test connection** SHALL check the endpoint with the same rule as Save, then call it with the typed endpoint and a key typed but not yet saved (nothing SHALL be stored), and SHALL report reachable or the same sentence the rewrite window would show for that reason.
- **Save** SHALL validate every visible group before writing anything; if any validation fails, no setting and no key SHALL change. When all pass, settings SHALL be stored per device and then the key; a failure while storing the key SHALL show an inline error rather than claim success. Saved values SHALL apply to the next rewrite window, not to one already open.
- The base instruction, model, and endpoint SHALL NOT be empty when saved; an emptied field SHALL be refused, not replaced by a default.
- A failed settings read SHALL show the defaults with a short notice, not blank fields.

#### Scenario: A failed read

- **WHEN** the rewriting settings cannot be read
- **THEN** the AI tab shows the defaults and says they could not be loaded, rather than empty fields

#### Scenario: First setup

- **WHEN** the writer opens the AI tab and enters the local endpoint and key
- **THEN** Test connection reports reachable, Save stores the key as a secret, and re-opening shows the endpoint, the model, and “key saved”

#### Scenario: One invalid group blocks every write

- **WHEN** the backup folder is valid but the endpoint is remote and the writer presses Save
- **THEN** neither value is stored, the AI tab shows the endpoint error, and the previous backup folder remains in effect

#### Scenario: Test with a new key

- **WHEN** the writer types the endpoint and a key for the first time and presses Test connection
- **THEN** the test uses that typed key, reports reachable, and stores nothing

#### Scenario: A remote endpoint

- **WHEN** the writer types `https://api.example.com/v1` and presses Save
- **THEN** an inline error explains that only the local machine is allowed, and nothing is saved

#### Scenario: Profile limits

- **WHEN** the writer removes profiles down to two, or tries a ninth
- **THEN** two profiles are allowed, the ninth is refused with a short message

#### Scenario: Test with a stopped server

- **WHEN** the local server is not running and the writer presses Test connection
- **THEN** the tab says it could not connect and saves nothing

#### Scenario: Simple NEO

- **WHEN** Show More Features is off and the writer opens Settings
- **THEN** only the General tab is shown, without the AI group
