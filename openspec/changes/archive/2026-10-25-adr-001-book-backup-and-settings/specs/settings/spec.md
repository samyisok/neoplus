# Spec Delta

## Purpose

Gives NEO one place to change application settings, starting with where backups are written, laid out in groups so later settings can be added without redesigning the window.

## ADDED Requirements

### Requirement: Settings window

File → Settings… SHALL open a modal settings window over the current view.

- The window SHALL open at most once; choosing the menu item again SHALL focus the window rather than stack another.
- It SHALL NOT open over another modal dialog; the menu item SHALL be ignored while one is open.
- Settings SHALL be grouped into labelled sections separated by a horizontal rule.
- The footer SHALL offer **Save** and **Cancel**; Escape SHALL act as Cancel.
- Cancel SHALL discard every edit and leave the stored values unchanged.
- Closing the window SHALL NOT interrupt writing: no chapter text, selection, caret, or scroll position SHALL change.

#### Scenario: Open and cancel

- **WHEN** the writer opens Settings, changes the backup folder, and presses Cancel
- **THEN** the window closes, the previous folder remains in effect, and reopening shows the previous folder

#### Scenario: Menu item while open

- **WHEN** the writer chooses File → Settings… while the window is already open
- **THEN** the existing window is focused and no second window appears

#### Scenario: Writing continues

- **WHEN** the window is opened while the caret sits in a chapter
- **THEN** closing it returns focus, caret, and scroll to the same place with the text unchanged

### Requirement: Backup folder setting

The Backup group SHALL let the writer see and change the folder where backups are written.

- The group SHALL show the folder in effect, and label it as the default when none has been chosen.
- **Choose…** SHALL open the operating system's folder picker, starting at the current backup folder, and permit creating a new folder.
- **Use Default** SHALL restore the default (`<library>/Backups` in effect) without saving until **Save** is pressed.
- **Save** SHALL verify the folder can be created and written; on success it stores the absolute path in this device's settings and applies it to the next backup.
- When verification fails the window SHALL show an inline error, keep the field as typed, and SHALL NOT store the value.
- The chosen folder SHALL NOT be written into `library.json` and SHALL NOT sync to other devices.

#### Scenario: Save a folder on an external drive

- **WHEN** the writer chooses a mounted external folder and presses Save
- **THEN** the path is stored for this device and the next manual or daily backup is written there

#### Scenario: Unwritable folder

- **WHEN** the writer types a path that cannot be created or written
- **THEN** Save shows an inline error, stores nothing, and the previous folder stays in effect

#### Scenario: Return to the default

- **WHEN** the writer presses Use Default and then Save
- **THEN** the stored path is cleared and backups return to `<library>/Backups`

### Requirement: Settings are extensible by groups

The window SHALL render its sections from a registry of groups, each contributing its own controls between separators, so a new group of settings can be added without changing the window's structure.

- A group SHALL declare its title and its controls (a text field with a chooser, a checkbox, a choice, and so on).
- Groups SHALL appear in a stable, declared order, separated from one another by exactly one rule, and no rule SHALL trail the last group.
- Adding or removing a group SHALL NOT change how the other groups read, save, or validate.
- The first group SHALL be Backup; future groups (editor, spellcheck, export, …) SHALL be added by registering them, not by editing the window's markup or event wiring.

#### Scenario: A second group is registered

- **WHEN** a new group is registered alongside Backup
- **THEN** it appears below Backup with a separator between them, and Backup's behavior is unchanged

#### Scenario: Ordering stays fixed

- **WHEN** the window is opened repeatedly
- **THEN** groups always appear in the same declared order

### Requirement: Settings available in Simple NEO

File → Settings… SHALL be available whether or not Show More Features is on, because the settings it holds (starting with backups) are everyday ones.

- The window SHALL show groups whose features are hidden in Simple NEO only when those features are showing, so a simple writer never sees a control that does nothing.

#### Scenario: Simple NEO writer opens Settings

- **WHEN** Show More Features is off and the writer chooses File → Settings…
- **THEN** the same window opens with the Backup group, and no group for a hidden feature is listed

### Requirement: Device-scoped settings storage

Settings that name machine-local resources SHALL be stored per device and SHALL NOT travel with the library.

- The backup folder SHALL be stored in the device's application settings file, alongside the existing export folder and window bounds.
- Reading settings SHALL tolerate a missing or corrupt file by falling back to the defaults.
- Saving SHALL be durable (temporary file, flush, rename) and SHALL NOT erase settings owned by other parts of NEO.

#### Scenario: Another device opens the same library

- **WHEN** the library is opened on a second machine
- **THEN** that machine keeps its own backup folder and does not adopt the first machine's path

#### Scenario: Settings file missing

- **WHEN** the application settings file is missing or unreadable
- **THEN** the window shows the default backup folder and saving creates the file
