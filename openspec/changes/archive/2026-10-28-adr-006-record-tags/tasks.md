# Tasks

## 1. The tag model and scanner

- [x] 1.1 Write `scripts/record-tags.test.js` first: `tagKey`/normalize (trim, collapse whitespace, case), multi-word tags, duplicate keys, add/remove with stamps, removed tag tombstones, merge additions and removals, `tagExists`/`recordsWithTag`, scanner boundaries (`Long Chen` not `Long Cheney`), case, overlapping tags, long tags, 20k cap, and a 100k-word timing sanity check. Run it and confirm it fails because `neo-ext/lib/record-tags.js` does not exist.
- [x] 1.2 Implement `neo-ext/lib/record-tags.js` as a pure UMD module (module + `window.NeoRecordTags`) and run the test until green.
- [x] 1.3 Extend `scripts/records-store.test.js` for records without tags, tag add/remove, per-tag merge with newer removal winning, future stamps, and `activeTags`/`tagsOf`; implement tags in **both** `cleanRecord` and **both** branches of `mergeRecord`, plus the 50-tag/tombstone budget, until green.
- [x] 1.4 Extend `scripts/records-search.test.js` for tag-only matches and title/body/tag mixes; update `neo-ext/lib/records-search.js` to accept active tag text. Verify both pure suites.

## 2. The phrase context and menu

- [x] 2.1 Write `scripts/record-tags-menu.test.js` first for the renderer/main split: a selection of 1–120 characters in one chapter paragraph stores a phrase and has-tag flag; a line-break/multi-paragraph selection, notes/title, or Simple NEO stores none; a multi-word selection leaves the lexical word empty; the menu label is Create vs Find (and absent while the index is unready); a non-English spellcheck language still offers the record item; the Look Up path adds the item only for one word. Run it and confirm the right failures.
- [x] 2.2 Add the phrase map/TTL/spend to `neo-ext/word-context-main.js`, `setContextPhrase`/`clearContextPhrase` to the existing `NeoForkNative` block, and `takePhrase` to the native `contextMenu` seam. Add `neo-ext/lib/record-tags-main.js` for the label/action; make `contextMenu` proceed when the word is empty but a phrase exists, and send the phrase for the record item. Keep the word path and lexical order unchanged. Verify the unit test and `node neo-ext/check-seams.js`.
- [x] 2.3 Extend `neo-ext/word-context.js` to capture a chapter selection alongside the word, use `NeoRecords.tagExists(phrase)`, and add the record item to `lookUpMenu`/`lookUpChoice` for one word. Widen the macOS seam line in `app.js` to forward every non-lookup choice; verify the menu unit test, `check-seams.js`, and the dictionary/thesaurus menu e2e.

## 3. Create and find from the manuscript

- [x] 3.1 Create `scripts/record-tags.e2e.js` and `npm run test:tags`, following `scripts/records.e2e.js`. First checks, expected to fail: Create Record from a selected phrase opens the pinned pane, creates a record with title and tag, unfolds it and focuses its description; reopening the selection offers Find Record and opens Records with the phrase in the search; a multi-word phrase stays whole; no tag means Create; no selection means no item.
- [x] 3.2 Expose `window.NeoRecords` from `records.js` with `tagExists`, `openFromSelection`, and the tag menu item; add `api.openFind(phrase)` that switches to Manuscript, opens Find, and fills the tag. Implement create/find actions, including pinning the pane and loading the store before acting. Verify the 3.1 checks.
- [x] 3.3 Share the one `state.store`: read it when Show More Features is on, re-read on the switch turning on and after each successful load/save/tag edit. While it is unready offer neither item; `create` re-checks the live store and becomes Find if the tag appeared. Verify Find Record appears only after the tag exists, in a second book, and after a restart.

## 4. Tags in the record row and the book search

- [x] 4.1 Add tag chips, **+ Tag** input, duplicate handling, inline remove confirmation, and the tag-click action to `records-list.js`/`records.js`; call the store's `addTag`/`removeTag`. Verify with e2e add/remove/Cancel/Esc/duplicate, no record deletion, and a tag-only search unfolding the row.
- [x] 4.2 Wire tag chips to `api.openFind`, switch to Manuscript, and confirm the Find bar holds the tag and cycles mentions. Verify with e2e and `node --test scripts/records-search.test.js`.
- [x] 4.3 Verify tags merge and persist: add on two stores through the merge function, reload the book, open a second book, and assert `records.json` holds the tags and no chapter/book/library file changed.

## 5. The optional highlight

- [x] 5.1 Add the status-bar eye (injected into `#counters`) with `aria-pressed`, per-device `neo-record-tag-highlight`, and show/hide rules for more features/tags/book/Pocket. Verify with e2e visibility and reload persistence.
- [x] 5.2 Implement the scanner in `record-tags.js` and the paragraph range mapping/CSS Highlight in `records.js`: per paragraph with Unicode boundaries, scan when on, on book open, on tag changes, and after an edited chapter settles (600 ms); replace that chapter only; invalidate on `#chapters` replacement/structural undo; 2,000 ranges globally; clear on off/no tags/Simple NEO. Verify tint present/absent, per-paragraph non-match, accented/non-Latin tags, undo-restored tint, text/undo unchanged, and no scan while off.
- [x] 5.3 Measure the 100k-word fixture in the e2e/manual run and record the result; if the budget is exceeded, narrow the automatic re-scan only, keeping the toggle and tag/search/link behaviour. Cover the Look Up choice widening and the menu's no-word phrase path in the e2e.

## 6. Documentation, review, and release

- [x] 6.1 Add a Tags section to `AGENTS.md`: tag model/stamps, phrase context, Create/Find menu, tag-to-Find, eye toggle/scan budget, and the backup path. Verify with `git diff -- AGENTS.md` and `node neo-ext/check-seams.js`.
- [x] 6.2 Run `npm test`, `npm run test:tags`, `npm run test:records`, `npm run test:notes`, `npm run test:dictionary`, `npm run lint`, `npx oxlint neo-ext/`, `node neo-ext/check-seams.js`, `npm run check:version`, and `openspec validate adr-006-record-tags`; record the results here.
- [x] 6.3 Review gate on the implemented diff: `grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, `security-reviewer` (new IPC/preload path). Fix blockers, re-run the failed reviewer, record verdicts in `review.md` and here.
- [x] 6.4 Manual dev-launch check: select multi-word names, create/find, add/remove tags, click a tag and step through Find, toggle the eye, relaunch, two books. Capture one screenshot of tags and one of highlighted text. — Done on a throwaway library: Create/Find from a multi-word name, `+ Tag`, remove with confirmation, tag → Find (1 hit), eye on/off, relaunch kept the eye on and re-tinted the page, second book saw the same records. Screenshots: `/tmp/opencode/tags.png` (tags), `/tmp/opencode/tags-highlight.png` (highlight).
- [x] 6.5 `/opsx-sync` then archive as the dated `adr-006-record-tags`; raise the fork to `1.6.0+fork.6`, add the changelog, commit, and reinstall.
