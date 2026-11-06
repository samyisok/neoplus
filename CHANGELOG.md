# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Give Grammar its own AI settings in Settings → AI Grammar — endpoint, model, API key, and an editable prompt with Restore default prompt — falling back to the Rewrite settings whenever a field is left empty; the Rewrite tab becomes AI Rephrasing and gains Restore default prompt and Restore default profiles. (`2026-11-01-adr-018-grammar-settings`)
- Add Grammar… for a selected passage: the local model lists grammar fixes and style advice, a board shows the corrected text, the original, and joined cards, and Replace applies only the fixes as one undoable edit recorded in History. (`2026-11-01-adr-017-grammar-analysis`)
- Add Interface text to Settings: enlarge the text in the right pane's Records, Inventory, and History views, in dialogs, and in messages without enlarging their boxes, on its own scale beside Interface Size. (`2026-10-31-adr-016-ui-text-size`)
- Add Interface Size to Settings → General: enlarge NEO's own interface (not the page) from 90% to 300%, with a live preview, Cancel and Save, the same value as View → Interface Size, and working in Simple NEO too. (`2026-10-31-adr-015-interface-size-setting`)
- Add a read-only History tab to the right pane recording every replacement by Rephrase and the thesaurus, with both texts, the date, and the chapter number at the moment, stored with the book. (`2026-10-31-adr-014-history-tab`)
- Add a Records view to the right-hand notes pane: library-wide character and item records, folders, plain-text descriptions, inline confirmation, and highlighted search. (`2026-10-27-adr-005-records-tab`)
- Add File → Backup Book… for a timestamped copy of the open book and File → Settings… with the backup folder used by manual and daily backups. (`2026-10-25-adr-001-book-backup-and-settings`)
- Add an offline English Thesaurus… to the editor's right-click menu, with synonyms grouped by part of speech and relation, replacing the word as one undoable edit. (`2026-10-25-adr-002-thesaurus`)
- Add an offline English Dictionary… to the editor's right-click menu and the macOS Look Up popup: definitions and usage examples grouped by part of speech, read-only, never touching the manuscript. (`2026-10-25-adr-003-dictionary`)
- Add a draggable right-hand pane with a keyboard resize handle: its width is remembered per device, and the page, Darlings, and Outline cards follow it. (`2026-10-25-adr-004-resizable-side-pane`)
- Add record tags: select a phrase in a chapter to create or find its tagged record, keep several multi-word tags on a record, search the book from a tag, and optionally tint tagged names with the status-bar eye. (`2026-10-28-adr-006-record-tags`)
- Add Inventory: keep coins, health, and other state as transactions anchored to the phrase that moved them, see balances as of the chapter you are in, jump to each change, and let deleting the words retire the transaction. (`2026-10-29-adr-008-inventory`)
- Add Rephrase… for a selected phrase or paragraph: the local model writes one rewrite per profile, cards fill as they arrive, and choosing one replaces the selection as a single undoable edit. Settings gain tabs and an AI tab with the endpoint, model, key, and editable profiles. (`2026-10-31-adr-012-rephrase-local-llm`)

### Changed
- Merge upstream 1.6.1–1.6.3 into the fork: chapter headings with no title, snapshot thinning keeping unavailable history, typewriter scrolling at a page top, soft-hyphen marks, EPUB subtitles, quotes following the writer's own language, the portable .exe installer, Vietnamese and French, and File → Library Folder… now moving the books and offering NEO Pocket's iCloud folder. (`2026-11-07-adr-019-merge-upstream-1-6-3`)
- Keep the writer's words where they are easy to read: the Grammar text keeps the full width, the cards sit under it in rows, and each line leaves the middle of the marked word for the middle of its card's top border, with a gap so it does not cross the sentence. (`2026-11-01-adr-017-grammar-analysis`)
- Rename the Settings tabs to AI Rephrasing and AI Grammar, and give each setting its own padded block so a label is not read as part of the block above, with Replace…/Choose… matching the field height. (`2026-11-01-adr-018-grammar-settings`)
- Include the library's `records.json` and its recovery copy in daily and book backups. (`2026-10-27-adr-005-records-tab`)
- Move the Thesaurus and the new Dictionary to the Open English WordNet 2025 edition, so both features share one maintained source and one licence story (CC BY 4.0 plus the WordNet notice, both shipped with the data). (`2026-10-25-adr-003-dictionary`)
- Let the Records search match a record's tags as well as its title and description, and forward every fork choice from the macOS Look Up popup to its feature. (`2026-10-28-adr-006-record-tags`)
- Keep record tags whole: the 50-tag limit counts only live tags, a merge never drops a tag or its removal, a corrupt `records.json` recovers from `.bak`, and a tag tint re-reads one chapter instead of the book and stops when Simple NEO is on. (`2026-10-28-adr-007-record-tag-fixes`)

### Deprecated
### Removed
### Fixed
- Fix the Grammar board's quiet failures: a whole-sentence answer highlights only the changed word, a report the model repeats becomes one card instead of a not-applied twin, a fix found in the context paragraphs is dropped, a missing article joins a line through a caret, Suggest style shows a wheel and its "Nothing to suggest." sits under the button, and a pass waits 90 seconds rather than 30. (`2026-11-01-adr-017-grammar-analysis`)
- Keep Inventory whole: an unreadable chapter never retires its transactions, a pending save stays with its book, a merge cannot write a ledger NEO would refuse, and Simple NEO stops reading and writing; the dialog sits above the panes and folds reset when reopened. (`2026-10-29-adr-009-inventory-fixes`)
- Give the Inventory dialog room to work: a larger window with a scrollable item list, new-item fields behind a **+ New item** reveal, and an amount field that takes one sign and digits only. (`2026-10-29-adr-010-inventory-modal-ui`)
- Make the Inventory dialog follow NEO: it uses the app's modal surface, theme, and Interface Size, keeps focus and scroll through every re-render, shows a picked item even when the search hides it, and keeps one amount contract (sign, digits, separators refused). (`2026-10-29-adr-011-inventory-modal-focus`)
- Harden Rephrase: the timeout covers a stalled response body, the dialog refuses to open over another one, Try again is a keyboard-accessible button, Settings shows sentences instead of reason codes, Simple NEO stops an open window, and the selection limits have one owner. (`2026-10-31-adr-013-rephrase-hardening`)

### Security
