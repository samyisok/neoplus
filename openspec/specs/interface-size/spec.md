# interface-size Specification

## Purpose
Lets the writer change how large NEO's own interface reads from one place in
Settings — not just the page — and keeps that choice in step with the View menu
and the device it was made on.

## Requirements

### Requirement: Interface Size lives in Settings

Settings → General SHALL offer an **Interface Size** control showing the size in
use and the steps to change it.

- The control SHALL show the current size as a percentage of normal.
- **Larger** and **Smaller** SHALL each move the size by one tenth (10%), and
  **Reset** SHALL return it to 100%.
- The size SHALL stay between 90% and 300%; a step past either end SHALL leave
  the size unchanged.
- The control SHALL appear in Simple NEO as well as in full NEO.
- The View → Interface Size menu item SHALL keep its current place behind Show
  More Features: this change adds a second door to the same value, it does not
  move or ungates the menu.
- Its buttons SHALL be reachable by keyboard and SHALL carry accessible names,
  and the percentage SHALL be readable as text, not only as a size.

#### Scenario: Enlarge from Settings

- **WHEN** the writer opens Settings → General, where the size reads 100%, and presses Larger twice
- **THEN** the control reads 120% and the whole interface has grown, with the Settings window growing too

#### Scenario: At the top

- **WHEN** the size is 300% and the writer presses Larger
- **THEN** it stays at 300%

#### Scenario: Reset

- **WHEN** the writer presses Reset at any size
- **THEN** it returns to 100%

#### Scenario: Simple NEO

- **WHEN** Show More Features is off and the writer opens Settings
- **THEN** the Interface Size control is there and enlarging works

### Requirement: The interface grows, the page does not

Changing the interface size SHALL scale every part of NEO's own interface and
SHALL leave the page as it was.

- The bookshelf, the navigation pane, the right-hand pane (Notes, Records,
  Inventory, History), the bottom bar, the search bar, hints, NEO's toasts,
  and every dialog — Settings, Thesaurus, Dictionary, Rephrase, Inventory —
  SHALL follow the size.
- The manuscript's text, the editor's type size, the page width, and the page's
  own zoom (Ctrl/⌘ + and −) SHALL NOT change.
- A change SHALL be visible at once, without reopening the window or the book.

#### Scenario: The pane and its tabs

- **WHEN** the writer raises the size to 150% and opens the right-hand pane on History
- **THEN** the tab strip, the entries, and their text are larger, and the manuscript page is unchanged

#### Scenario: The page's own zoom

- **WHEN** the page is at 120% text zoom and the interface size is raised to 140%
- **THEN** the page stays at 120% and only the interface grows

#### Scenario: A dialog

- **WHEN** the interface size is raised and the Thesaurus or Rephrase window is opened
- **THEN** that window opens at the larger size

#### Scenario: A toast

- **WHEN** a backup finishes while the interface size is raised
- **THEN** its toast is larger too

### Requirement: Preview, Cancel, and Save

A size chosen in Settings SHALL preview while the window is open and SHALL only
be kept when the writer saves.

- The interface SHALL change as the buttons are pressed, so the choice can be
  judged before saving.
- Cancel, Escape, or clicking outside the window SHALL restore the size currently
  stored — including one changed from the View menu while the window was open —
  and SHALL store nothing.
- Save SHALL keep the size and SHALL close the window as it does today.
- The kept size SHALL survive a reload and a relaunch.

#### Scenario: Cancel takes the preview back

- **WHEN** the writer raises the size to 160% and presses Cancel
- **THEN** the interface returns to the size it had before the window opened

#### Scenario: Save keeps it

- **WHEN** the writer raises the size to 160% and presses Save
- **THEN** the interface stays at 160%, and reopening NEO shows it still at 160%

### Requirement: One value, two doors

The Settings control and View → Interface Size SHALL change the same setting, and
SHALL never disagree.

- A size set in Settings SHALL be the size the View menu shows and steps from.
- A size set from the View menu SHALL be the size Settings shows.
- A stored size between steps SHALL settle on the nearest tenth, an out-of-range
  value SHALL be clamped to 90–300%, and a missing or unreadable value SHALL read
  as 100%.

#### Scenario: The menu catches up

- **WHEN** the writer sets 140% in Settings and saves, then opens View → Interface Size
- **THEN** the menu's label says 140% and its Smaller step goes to 130%

#### Scenario: An old value

- **WHEN** the library holds an interface size of 125% from an older NEO
- **THEN** it reads and applies as 130%

### Requirement: The size belongs to the device

The interface size SHALL be stored so each device keeps its own.

- A device's chosen size SHALL be saved with the library and re-applied from that
  device's own storage, as NEO does with its other view settings.
- Two devices with different sizes SHALL each keep their own; neither SHALL
  change the other's view.
- A device new to the library SHALL start from the size the library holds.

#### Scenario: Two devices

- **WHEN** a laptop is set to 120% and a desktop to 100%
- **THEN** each shows its own size after syncing

### Requirement: A size that cannot be saved is reported

When the size cannot be written, the settings window SHALL say so and SHALL keep
the writer's choice on screen.

- The window SHALL stay open and show an error rather than closing as if saved.
- The choice SHALL stay visible in the window for a retry, and SHALL NOT be
  treated as saved. Once the window closes, the interface SHALL show the stored
  size again.
- Nothing in the manuscript, its selection, caret, or scroll position SHALL
  change.

#### Scenario: A failed write

- **WHEN** the library cannot be written as the writer saves a new size
- **THEN** the settings window stays open, says the size could not be saved, and the manuscript is untouched
