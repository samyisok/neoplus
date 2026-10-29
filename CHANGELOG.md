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
- Add record tags: select a phrase in a chapter to create or find its tagged record, keep several multi-word tags on a record, search the book from a tag, and optionally tint tagged names with the status-bar eye. (`2026-10-28-adr-006-record-tags`)
- Add Inventory: keep coins, health, and other state as transactions anchored to the phrase that moved them, see balances as of the chapter you are in, jump to each change, and let deleting the words retire the transaction. (`2026-10-29-adr-008-inventory`)
- Keep Inventory whole: an unreadable chapter never retires its transactions, a pending save stays with its book, a merge cannot write a ledger NEO would refuse, and Simple NEO stops reading and writing; the dialog sits above the panes and folds reset when reopened. (`2026-10-29-adr-009-inventory-fixes`)
- Give the Inventory dialog room to work: a larger window with a scrollable item list, new-item fields behind a **+ New item** reveal, and an amount field that takes one sign and digits only. (`2026-10-29-adr-010-inventory-modal-ui`)

### Changed
- Include the library's `records.json` and its recovery copy in daily and book backups. (`2026-10-27-adr-005-records-tab`)
- Move the Thesaurus and the new Dictionary to the Open English WordNet 2025 edition, so both features share one maintained source and one licence story (CC BY 4.0 plus the WordNet notice, both shipped with the data). (`2026-10-25-adr-003-dictionary`)
- Let the Records search match a record's tags as well as its title and description, and forward every fork choice from the macOS Look Up popup to its feature. (`2026-10-28-adr-006-record-tags`)
- Keep record tags whole: the 50-tag limit counts only live tags, a merge never drops a tag or its removal, a corrupt `records.json` recovers from `.bak`, and a tag tint re-reads one chapter instead of the book and stops when Simple NEO is on. (`2026-10-28-adr-007-record-tag-fixes`)

### Deprecated
### Removed
### Fixed
### Security
