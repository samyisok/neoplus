# Spec Delta

## Purpose

Lets the writer make the text of NEO's own panes, dialogs, and messages larger or
smaller on its own, so reading can grow without every pane and window growing
with it.

## ADDED Requirements

### Requirement: Interface text lives beside Interface Size

Settings → General SHALL offer an **Interface text** control next to Interface
Size, showing the size in use and the steps to change it.

- The control SHALL show the current size as a percentage of normal.
- **Larger** and **Smaller** SHALL each move the text by one tenth (10%), and
  **Reset** SHALL return it to 100%.
- The text size SHALL stay between 90% and 200%; a step past either end SHALL
  leave it unchanged.
- The control SHALL appear in Simple NEO as well as in full NEO.
- Its buttons SHALL be reachable by keyboard and SHALL carry accessible names,
  and the percentage SHALL be readable as text.

#### Scenario: Larger text

- **WHEN** the writer opens Settings → General, where Interface text reads 100%, and presses Larger twice
- **THEN** the control reads 120% and the pane and dialog text has grown

#### Scenario: At the top

- **WHEN** the text size is 200% and the writer presses Larger
- **THEN** it stays at 200%

#### Scenario: Simple NEO

- **WHEN** Show More Features is off and the writer opens Settings
- **THEN** the Interface text control is there and enlarging works

### Requirement: Text grows, the frame does not

Changing the interface text size SHALL scale only the text of NEO's own surfaces
and SHALL leave the layout around it as it was.

- The text SHALL scale in the right-hand pane (Notes, Records, Inventory,
  History), in the Settings, Thesaurus, Dictionary, Rephrase, and Inventory
  dialogs, and in the fork's toasts and hints.
- Pane widths, button padding, spacing, dialog boxes, and the Interface Size
  SHALL NOT change. A control sized to its own text (a button label, a chip) may
  grow with that text; a fixed-width control keeps its box.
- The manuscript's text, the editor's type size, the page width, and the page's
  own zoom SHALL NOT change.
- The core interface's own text (bookshelf, navigation pane, menus) continues to
  follow Interface Size; this setting is about the fork's reading surfaces.

#### Scenario: The pane

- **WHEN** the writer raises Interface text to 150% and opens the right-hand pane on History
- **THEN** the tab labels and entry text are larger while the pane's width and its spacing are unchanged

#### Scenario: A dialog

- **WHEN** the text size is raised and Settings or the Thesaurus is opened
- **THEN** its text is larger while the window's width and controls are the same

#### Scenario: Both sizes

- **WHEN** Interface Size is 120% and Interface text is 150%
- **THEN** the frames are 120% and the text within them is 150% of its ordinary size

#### Scenario: The page

- **WHEN** the page is at 120% text zoom and Interface text is raised to 160%
- **THEN** the page stays at 120% and only the fork's interface text grows

### Requirement: Preview, Cancel, and Save

A text size chosen in Settings SHALL preview while the window is open and SHALL
only be kept when the writer saves.

- The text SHALL change as the buttons are pressed.
- Cancel, Escape, or clicking outside the window SHALL restore the text size
  stored at that moment and SHALL store nothing.
- Save SHALL keep the size and close the window as it does today.
- The kept size SHALL survive a reload and a relaunch.

#### Scenario: Cancel

- **WHEN** the writer raises the text to 140% and presses Cancel
- **THEN** the text returns to the size it had before the window opened

#### Scenario: Save

- **WHEN** the writer raises the text to 140% and presses Save
- **THEN** it stays at 140%, and reopening NEO shows it still at 140%

### Requirement: The text size belongs to the device

The interface text size SHALL be stored so each device keeps its own.

- The chosen size SHALL be saved with the library and re-applied from that
  device's own storage, as NEO does with its other view settings.
- Two devices with different text sizes SHALL each keep their own.
- A device new to the library SHALL start from the size the library holds.

#### Scenario: Two devices

- **WHEN** a laptop is set to 130% and a desktop to 100%
- **THEN** each shows its own size after syncing

### Requirement: A text size that cannot be saved is reported

When the size cannot be written, the settings window SHALL say so and SHALL keep
the writer's choice on screen.

- The window SHALL stay open and show an error rather than closing as if saved.
- The choice SHALL stay visible for a retry and SHALL NOT be treated as saved.
- Nothing in the manuscript, its selection, caret, or scroll position SHALL
  change.

#### Scenario: A failed write

- **WHEN** the library cannot be written as the writer saves a new text size
- **THEN** the window stays open, says the size could not be saved, and the manuscript is untouched
