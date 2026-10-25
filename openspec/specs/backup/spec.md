# backup Specification

## Purpose
Lets a writer take a copy of the book they are writing to a folder they choose, and decides where NEO's automatic daily backup is written.

## Requirements
### Requirement: Manual backup of the open book

The system SHALL copy the open book's entire folder to the backup folder as one plain, timestamped folder, so the copy can be opened, zipped, or read without NEO.

- The copy SHALL be named `<book-slug>-YYYY-MM-DD-HHMMSS`, where `book-slug` is derived from the book title (or the book id when the title has no usable characters). A name that would begin `book-` SHALL be given a `backup-` prefix instead, so the library and the daily walk never mistake a backup for a book.
- The copy SHALL contain the book folder's files as they are on disk: `book.json`, `chapters/`, notes pages, JSON sidecars, covers and painted art, and `snapshots/`.
- Every pending chapter, notes, and sidecar write SHALL be written and confirmed before the copy starts, so the backup holds the words the writer last saw, not an earlier save.
- An existing backup folder SHALL never be overwritten: the timestamp SHALL be advanced (or a numeric suffix appended) until the name is free.
- The copy SHALL never be written inside the book being copied, nor inside any book folder of the library.
- A file held by a sync tool SHALL be retried once; a file that still cannot be read SHALL be named in the result instead of the copy being silently incomplete.
- When no book is open the action SHALL be disabled.
- On success the system SHALL report the full path of the new folder and offer to reveal it in the file manager.
- On failure the system SHALL report the reason, leave the source book untouched, and remove any partially written copy.

#### Scenario: Backup while writing

- **WHEN** the writer is in a book with unsaved keystrokes and chooses File → Backup Book…
- **THEN** those writes finish first, then a timestamped folder holding the whole book appears in the backup folder, and a message names its path

#### Scenario: Second backup in the same second

- **WHEN** two backups of the same book are requested within the same second
- **THEN** two separate folders exist and neither older backup is modified

#### Scenario: No book open

- **WHEN** the writer is on the bookshelf
- **THEN** File → Backup Book… is disabled and no folder is created

#### Scenario: Backup cannot be written

- **WHEN** the backup folder is read-only, full, or the drive is gone
- **THEN** an error message explains the failure and no partial copy is left behind

#### Scenario: Backup destination inside the source

- **WHEN** the backup folder is the open book's folder or another book's folder
- **THEN** the backup is refused with a message naming the problem, and nothing is copied

### Requirement: Files still in iCloud do not block a backup

A manual backup of a book whose files are partly only in iCloud SHALL finish, naming what it could not copy.

- Files that exist as cloud placeholders SHALL be detected before reading, as the daily backup already does.
- The system SHALL ask the cloud service to download them and wait a bounded time per file; a file that does not arrive SHALL be left out of the copy.
- Left-out files SHALL be listed in `_left-out-of-this-backup.txt` inside the new backup folder and reported in the success message.
- The copy SHALL NOT wait indefinitely on one file.

#### Scenario: One chapter is only in iCloud

- **WHEN** the writer backs up a book whose file is a placeholder the cloud service will not hand over quickly
- **THEN** the rest of the book is copied, `_left-out-of-this-backup.txt` names that file, and the message says the copy is incomplete

### Requirement: Backup folder resolution

The system SHALL resolve one backup folder for both manual and automatic backups: the folder configured in Settings when set, otherwise `<library>/Backups`.

- A missing folder SHALL be created (with its parents) before writing.
- The default SHALL keep working with no configuration, exactly as before this change.
- A configured folder SHALL be stored as an absolute path in this device's settings, never in the library's shared `library.json`.
- A folder inside a `book-*` folder SHALL be rejected when saved, so no backup ever grows inside a book.
- The daily archive SHALL NOT include the backup folder or any manual copies inside it.

#### Scenario: Default folder

- **WHEN** no backup folder has been configured
- **THEN** manual and daily backups are written to `<library>/Backups`

#### Scenario: Configured folder outside the library

- **WHEN** the backup folder is set to a path on an external drive
- **THEN** both manual and daily backups are written there, and the library's own `Backups` folder is no longer used

#### Scenario: Configured folder disappears

- **WHEN** the configured folder's drive is unmounted and the daily backup runs
- **THEN** that run writes nothing, records the failure in `neo-errors.log`, and the next run tries the same configured folder again

#### Scenario: Folder chosen at the library root

- **WHEN** the backup folder is a new folder beside the books rather than the default `Backups`
- **THEN** manual copies go there and the daily archive still contains only NEO's books and catalogue, never the backups

### Requirement: Automatic daily backup follows the configured folder

The existing daily backup SHALL write its dated zip to the resolved backup folder instead of always using `<library>/Backups`, keeping its one-per-day and 14-copy rotation rules.

- The archive name SHALL keep the `neo-backup-YYYY-MM-DD.zip` form inside the resolved folder.
- An already present copy for today SHALL still short-circuit the run.
- Rotation SHALL consider only files named `neo-backup-*.zip`; manual backup folders SHALL never be removed.
- Manual book backups and daily zips SHALL coexist in the same folder without either cleaning up the other.

#### Scenario: Daily zip in a chosen folder

- **WHEN** the backup folder is set and the day's backup runs
- **THEN** `neo-backup-YYYY-MM-DD.zip` appears in that folder and older daily zips beyond fourteen are removed there

#### Scenario: Manual backups survive rotation

- **WHEN** the fourteen-day rotation runs in a folder that also holds manual book backups
- **THEN** only `neo-backup-*.zip` files are considered for removal and every manual backup folder remains
