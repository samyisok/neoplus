# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Add a Records view to the right-hand notes pane: library-wide character and item records, folders, plain-text descriptions, inline confirmation, and highlighted search. (`2026-10-27-adr-005-records-tab`)
- Add File → Backup Book… for a timestamped copy of the open book and File → Settings… with the backup folder used by manual and daily backups. (`2026-10-25-adr-001-book-backup-and-settings`)
- Add an offline English Thesaurus… to the editor's right-click menu, with synonyms grouped by part of speech and relation, replacing the word as one undoable edit. (`2026-10-25-adr-002-thesaurus`)
- Add an offline English Dictionary… to the editor's right-click menu and the macOS Look Up popup: definitions and usage examples grouped by part of speech, read-only, never touching the manuscript. (`2026-10-25-adr-003-dictionary`)
- Add a draggable right-hand pane with a keyboard resize handle: its width is remembered per device, and the page, Darlings, and Outline cards follow it. (`2026-10-25-adr-004-resizable-side-pane`)

### Changed
- Include the library's `records.json` and its recovery copy in daily and book backups. (`2026-10-27-adr-005-records-tab`)
- Move the Thesaurus and the new Dictionary to the Open English WordNet 2025 edition, so both features share one maintained source and one licence story (CC BY 4.0 plus the WordNet notice, both shipped with the data). (`2026-10-25-adr-003-dictionary`)

### Deprecated
### Removed
### Fixed
### Security
