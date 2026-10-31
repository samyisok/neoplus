# Spec Delta

## ADDED Requirements

### Requirement: Local rewriting settings

The **AI** tab SHALL let the writer point Rephrase… at a local model and describe the registers it should write in.

- The tab SHALL show the endpoint (a URL), the model id, a masked API key with **Replace…**, the base editing instruction, and the profile list.
- The endpoint SHALL default to `http://127.0.0.1:8080/v1` and the model to the local model in use; both SHALL be editable.
- The endpoint SHALL be refused unless it is http or https and its host is `127.0.0.1`, `[::1]`, or `localhost` while `localhost` resolves to loopback; a non-local address SHALL show an inline error and SHALL NOT be saved. The main process SHALL re-check the endpoint when it writes it.
- The profile list SHALL hold between 2 and 8 entries, each with a label and an instruction; the defaults SHALL be **Polite**, **Common**, **Natural**, **Heroic**, and **Terse**. A profile SHALL be addable and removable within those limits, and labels SHALL be unique ignoring case.
- The key SHALL be writable through a **Replace…** affordance and never readable in the window; when a key is already stored the field SHALL say so, and leaving it unchanged SHALL keep the stored key.
- The tab SHALL say when the operating system offers no secret storage, so the writer knows the key is being kept without encryption.
- **Test connection** SHALL check the endpoint with the same rule as Save, then call it with the typed values, including a key typed but not yet saved (nothing SHALL be stored), and SHALL report reachable or the reason it failed.
- **Save** SHALL validate every visible group before writing anything; if any validation fails, no setting and no key SHALL change. When all pass, settings SHALL be stored per device and then the key; a failure while storing the key SHALL show an inline error rather than claim success. Saved values SHALL apply to the next rewrite window, not to one already open.
- The base instruction SHALL have a sensible default and SHALL NOT be empty when saved.

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


## MODIFIED Requirements

### Requirement: Settings window

File → Settings… SHALL open a modal settings window over the current view.

- The window SHALL open at most once; choosing the menu item again SHALL focus the window rather than stack another.
- It SHALL NOT open over another modal dialog; the menu item SHALL be ignored while one is open.
- Settings SHALL be organised as tabs (starting with **General** and **AI**), each holding labelled groups of controls; one group follows another with a single horizontal rule, and no rule trails the last group.
- The tab strip SHALL be operable by keyboard, with Left and Right moving between tabs and Home and End reaching the first and last, and it SHALL remember the last tab only while the window is open.
- The footer SHALL offer **Save** and **Cancel**; Escape SHALL act as Cancel.
- Cancel SHALL discard every edit and leave the stored values unchanged.
- Closing the window SHALL NOT interrupt writing: no chapter text, selection, caret, or scroll position SHALL change.

#### Scenario: Change tab

- **WHEN** the writer chooses the AI tab
- **THEN** the Backup controls are replaced by the rewriting controls, and Save still saves both tabs

#### Scenario: Open and cancel

- **WHEN** the writer opens Settings, changes the backup folder, and presses Cancel
- **THEN** the window closes, the previous folder remains in effect, and reopening shows the previous folder

#### Scenario: Menu item while open

- **WHEN** the writer chooses File → Settings… while the window is already open
- **THEN** the existing window is focused and no second window appears

#### Scenario: Writing continues

- **WHEN** the window is opened while the caret sits in a chapter
- **THEN** closing it returns focus, caret, and scroll to the same place with the text unchanged

### Requirement: Settings are extensible by groups

The window SHALL render its tabs and sections from a registry of groups, each declaring a tab, a title, and its controls, so a new group or tab can be added without changing the window's structure.

- A group SHALL declare its title and its controls (a text field with a chooser, a checkbox, a choice, and so on).
- Groups SHALL appear in a stable, declared order inside their tab, separated from one another by exactly one rule, and no rule SHALL trail the last group.
- Tabs SHALL appear in the order their first group declares; a group with no tab SHALL appear under **General**.
- A group whose feature is hidden SHALL keep its tab only if another visible group uses it.
- Adding or removing a group SHALL NOT change how the other groups read, save, or validate.
- The first group SHALL be Backup under **General**; future groups (editor, spellcheck, export, …) SHALL be added by registering them, not by editing the window's markup or event wiring.

#### Scenario: A group joins a tab

- **WHEN** a group registers itself under a tab that already exists
- **THEN** it appears in that tab in declared order, with the other tabs unchanged

#### Scenario: A second group is registered

- **WHEN** a new group is registered alongside Backup
- **THEN** it appears below Backup with a separator between them, and Backup's behavior is unchanged

#### Scenario: Ordering stays fixed

- **WHEN** the window is opened repeatedly
- **THEN** groups always appear in the same declared order

### Requirement: Settings available in Simple NEO

File → Settings… SHALL be available whether or not Show More Features is on, because the settings it holds (starting with backups) are everyday ones.

- The window SHALL show groups whose features are hidden in Simple NEO only when those features are showing, so a simple writer never sees a control that does nothing.
- The **AI** tab SHALL be absent with Show More Features off.

#### Scenario: Simple NEO writer opens Settings

- **WHEN** Show More Features is off and the writer chooses File → Settings…
- **THEN** the same window opens with the Backup group, and no group for a hidden feature is listed

### Requirement: Device-scoped settings storage

Settings that name machine-local resources SHALL be stored per device and SHALL NOT travel with the library.

- The backup folder SHALL be stored in the device's application settings file, alongside the existing export folder and window bounds.
- The rewriting endpoint, model, base instruction, and profile list SHALL be stored there too, because the model is a machine-local resource.
- The rewriting API key SHALL NOT be stored in that file: it SHALL live in the application's secret store, encrypted with the operating system's secret storage where available and stored without it (and said so in the AI tab) where not, and SHALL never be handed back to the page.
- Reading settings SHALL tolerate a missing or corrupt file by falling back to the defaults.
- Saving SHALL be durable (temporary file, flush, rename) and SHALL NOT erase settings owned by other parts of NEO.

#### Scenario: Another device opens the same library

- **WHEN** the library is opened on a second machine
- **THEN** that machine keeps its own backup folder and does not adopt the first machine's path

#### Scenario: Settings file missing

- **WHEN** the application settings file is missing or unreadable
- **THEN** the window shows the default backup folder and saving creates the file
