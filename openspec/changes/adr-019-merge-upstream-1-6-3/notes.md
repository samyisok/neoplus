# Merge notes — upstream v1.6.3

Fetched 2026-11-06T23:42Z from https://github.com/hughhowey/neo (read-only remote, push URL disabled).

- Merge base: 4be59b2 ("1.6.0", untagged upstream)
- Release merged: v1.6.3 = 984a217
- Commits merged: 31

## Commits in the release

- e8d41e0 Darlings: a book opened from the shelf shows its own snapshots (fixes #448)
- 98201c7 [#445] fix: Chapter Heading with no title
- 0402def Update es.json to 1.6.0
- b9a3e10 Editor: soft hyphen marks follow a paragraph's alignment, poetry and flush (#420)
- 4a7aecf Editor: soft hyphen marks are a tinted patch with a darker centre line, easier to see (#420)
- 81ea047 Editor: soft hyphen marks are a wider light tint, like the other non-breaking marks (#420)
- e33b1aa Editor: soft hyphen and non-breaking marks share one tint, painted behind the text (#420)
- f874b94 1.6.1
- 92ef965 Outline: List / Cards switch spaced from the heading again (fixes #455)
- e3deeba Editor: a placeholder's flag is dark on its yellow on the night page (fixes #454)
- d989276 Editor: typewriter scrolling holds still at the top of a page (fixes #453)
- e28c940 Snapshot thinning never replaces unavailable history with empty text
- 421223a EPUB: subtitle and author centred on the title page (#462)
- d900211 EPUB: subtitle centred on each book's opening page in a bound shelf
- 64dcf51 Snapshots: deleted/changed words are underlined, and their red tint is brighter in dark mode for accessibility (#459)
- d025194 Korean: brought up to 1.6.1
- 637305a French: translate the 1.6.1 strings
- 653f7d4 French: Papier avec bois for groundwood paper
- 694854f Brighter Interface is part of simple NEO, with the page (Paper, Light)
- 9fa0172 The Windows portable .exe no longer installs NEO when it quits (fixes #479)
- 564b9f3 A library folder that holds its test file for a moment is no longer reported as unsaveable (#474)
- a616553 A script keeps -- and ... as typed (fixes #460)
- b6eb7db Splitting a chapter or moving a card between chapters adds nothing to today (fixes #471)
- ae489da 1.6.2
- 32c2af6 A line on a contents page takes you to its page
- 824a0fa Quotes typed under a line set in another language's marks follow your own again
- ac7292f File → Library Folder… moves your books, and offers NEO Pocket's iCloud folder
- 78cc8d1 NEO offers NEO Pocket's iCloud folder on its own: once, on the welcome screen, and under Help
- ac9d45c NEO Pocket 1.1 (build 6)
- 718ba80 Merge branch 'claude/library-icloud' of /Users/hughhowey/Downloads/neo-library-and-fixes.bundle
- 984a217 1.6.3

## Not merged (on upstream/main after the tag)

The plan merges the tag, not upstream/main. These 13 later commits stay out and can be a follow-up change:

- 5555c40 Test: New Script from the shelf's + in simple NEO, and a bare script page healing
- dad59b2 Builds keep their spare installer copies for a day, not 90; a button clears the old ones
- a340089 A script page left with stray text and a <br> heals too (#502)
- 72c088f Merge pull request #489
- ef90d2c Merge pull request #487
- 307d365 Merge pull request #443
- 4b88ea6 Merge pull request #503
- 08ca8f1 Right-click the shelf's + for New Script without Show More Features (#494, #504)
- d34d73b Windows: an update isn't installed while Windows is shutting down (#490)
- bae377e fix: heal a script page left with no line elements
- 7f7e8cf Add Vietnamese localization
- 7ff7c21 CI: Locking down credentials and read-write access
- 47a3786 Show a screenplay's page number on the first page too.
