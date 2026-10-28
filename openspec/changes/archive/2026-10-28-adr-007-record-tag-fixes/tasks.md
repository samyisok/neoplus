# Tasks

## 1. Tag rules in the store (red first)

- [x] 1.1 Red: extend `scripts/records-store.test.js` — 50 active tags accepted, the 51st refused (`reason: 'many'`), removing one frees a place; a merge of 30+30 active tags keeps all 60 and every tombstone; a 121-character tag in a file drops that tag and keeps the record; `addRecord` with an unusable first tag fails with `reason: 'tag'`; an equal-stamp removal beats an equal-stamp add; a re-added tag (later stamp) survives. Watch each fail for the right reason.
- [x] 1.2 Green: rewrite the tag half of `neo-ext/lib/records-store.js` — strict `tagRules` load with no inline fallback copy, one comparison where the removal wins a tie, `cleanTags`/`mergeTags` that never truncate (active and tombstones both kept), `addTag` reporting `many` / `long` / `missing`, `addRecord` reporting `tag`, and `storeTags(store)` as the single store-wide tag list (bounded by `tagRules.MAX_MATCH_TAGS`).
- [x] 1.3 Red then green: the key set derived from `storeTags(store)` equals the set of tags `tagExists(store, tag)` answers true for (`scripts/records-store.test.js`), and `records-search.testRecord` matches a record's active tags through `activeTags` (`scripts/records-search.test.js`).

## 2. One tag identity across modules

- [x] 2.1 Red: `scripts/record-tags.test.js` — `tagAction(hasTag)`/`tagMode(choice)` round-trip, and `MAX_TAG === MAX_PHRASE` (one 120-character bound for a tag and for a selected phrase).
- [x] 2.2 Green: add `tagAction`/`tagMode` to `neo-ext/lib/record-tags.js`; delete its unused `recordsWithTag` and module-level `ranges`. `records-store.js` keeps `recordsWithTag` as the records-by-tag query.
- [x] 2.3 Red then green: `scripts/records-store.test.js` fails if `storeTags` and the matcher disagree past the bound; `scripts/record-tags.e2e.js` adds the debug counter from 4.4. Green: `neo-ext/records.js` takes its tag list from `model.storeTags`, reads the 120-character gate and the 2,000-range cap from `tagRules`, and no longer builds a tag index; `neo-ext/records-list.js` and `neo-ext/records-search.js` read tags through `activeTags`.
- [x] 2.4 Green: `word-context.js`, `lib/record-tags-main.js`, and `boot.js` share `tagAction`/`tagMode`; boot calls the async open with a guard and catches its rejection.

## 3. Core access and phrase bridge

- [x] 3.1 Red then green: `scripts/records.e2e.js` asserts the pane still opens and tags still show when core is read through `api.js`; `neo-ext/api.js` gains `hasBook()`, `isPocket()`, `onManuscriptTab()`, `pinSidePane()`, each guarded; `neo-ext/records.js` uses them instead of raw `book`/`IS_POCKET`/`currentTab`/`pinPane`.
- [x] 3.2 Red then green: `scripts/record-tags-menu.test.js` covers a phrase clear that does not wait on the main process. Green: `preload.js` clears the phrase with `ipcRenderer.send`, `word-context.js` and its comment say so, and `MAX_PHRASE` comes from the tag module in both word-context files.
- [x] 3.3 Red then green: `scripts/records.e2e.js` asserts the Find count for a tag chip equals the number of matches, not a doubled run. Green: `openFind` sets the query and runs one search.

## 4. Extract the highlighter

- [x] 4.1 Green: move the eye, scanners, timers, and range painting from `neo-ext/records.js` into `neo-ext/record-tag-highlight.js`, exposing `create({ x, api, model, tagRules, host })` with `update`, `schedule`, `scanChapter`, `clear`, and `toggle`; load it in `index.html` and list it in `neo-ext/check-seams.js`. Pane behaviour and e2e stay green.
- [x] 4.2 Red then green: `scripts/record-tags.e2e.js` — with Simple NEO on, `CSS.highlights` has no `neo-record-tag` after a tab switch, and turning it back on restores the tint. Green: the eye shows only while Show More Features is on, a book is open, and a tag exists; the off switch clears and blocks a scan.
- [x] 4.3 Red then green: `scripts/record-tags.e2e.js` counts scans through a debug counter — typing and a new paragraph re-read one chapter; a mounted chapter, a tag change, a book open, a resize, and the toggle scan the book. Green: split the global and per-chapter timers accordingly.
- [x] 4.4 The e2e adds a `window.__neoTagScans` counter (book scans vs chapter scans) that the tests in 4.2/4.3 read; nothing else reads it.

## 5. Pane corrections

- [x] 5.1 Red then green: `scripts/record-tags.e2e.js` — a half-typed tag does not return after switching to Notes and back; an over-long tag says it is too long while a tag on a vanished record says the record is gone (`scripts/records-store.test.js` pins the reasons). Green: `setView('notes')` clears `tagDraft`/`tagConfirm`, delete the dead `!moreOn()` branch in `applyTabs`, `tagReady` derives from `loaded`/`readOnly`, and the pane maps `many`/`long`/`missing`/`tag` to their own sentences.

## 6. Docs, review, release

- [x] 6.1 Update the Tags section of `AGENTS.md`: limit counts active tags, merge never drops, one owner per tag question, the highlighter file, the Simple NEO gate, the per-chapter scan, and the 200-tag paint bound. Verify with `git diff -- AGENTS.md` and `node neo-ext/check-seams.js`.
- [x] 6.2 Run `npm test`, `npm run test:tags`, `npm run test:records`, `npm run test:notes`, `npm run test:dictionary`, `npm run lint`, `npx oxlint neo-ext/`, `node neo-ext/check-seams.js`, `openspec validate adr-007-record-tag-fixes --strict`; record the results here.
- [x] 6.3 Review gate on the diff: `grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, `security-reviewer` (preload/IPC touched). Fix blockers, re-run the failed reviewer, record verdicts in `review.md` (created here) and here.
- [x] 6.4 `/opsx-sync` then archive as the dated `adr-007-record-tag-fixes`; raise the fork to `1.6.0+fork.7`, add the changelog, commit, and reinstall.
