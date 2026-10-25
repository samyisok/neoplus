# Tasks

## 1. Planning review

- [x] 1.1 Make the change visible to the verifiers (`git add -N openspec/changes/adr-002-thesaurus`) and run `grasp-verify` and `ddd-verify` on the diff; fix findings in `proposal.md` / `specs/` / `design.md` until no blocker remains, and verify by re-running both
- [x] 1.2 Update the seam table in `AGENTS.md`: mark seam 5 (context menu) as present and add the macOS Look Up hook as its own numbered seam with its anchor line; verify with `grep -n "context-menu\|Look Up" AGENTS.md`

## 2. Data pipeline

- [x] 2.1 Write `neo-ext/tools/build-thesaurus.js` (Node built-ins only) that reads a local `th_en_US_v2.dat`, validates its SHA-256, parses headword/sense lines, strips `(generic term)` markers, lower-cases and filters headwords, de-duplicates within a sense, and writes `neo-ext/thesaurus/en/shards/<letter>.json.gz`; verify by running it against a downloaded copy and seeing 26 shard files
- [x] 2.2 Emit `neo-ext/thesaurus/en/manifest.json` (source URL, pinned upstream commit, source SHA-256, format version, headword and synonym counts) and copy the upstream `WordNet_license.txt` beside it; verify the manifest parses and the counts equal what the script printed
- [x] 2.3 Add `neo-ext/thesaurus/README.md` stating provenance, the WordNet licence obligation, the measured size (about 3.8 MB gzipped), and the note that the data contains archaic and offensive terms; verify the licence and README sit beside the shards
- [x] 2.4 Write `scripts/thesaurus-data.test.js` first and watch it fail (no shards yet): every shard gunzips and parses, keys fall in that shard's letter, manifest counts match the shards, `batch` has at least two parts of speech, licence and manifest exist, and total gzipped size stays under 6 MB; then run it green after 2.1–2.3

## 3. Lookup rules (pure)

- [x] 3.1 Write `scripts/thesaurus-lookup.test.js` (red) for `normalize`, `wordBounds`, and inflection candidates: `batch`, `batches`, `batched`, `batching`, `batted`, `writer's`, `writer’s`, `berries` → `berry`, a hyphenated compound, a word containing digits, and a word with no candidate; run it and confirm it fails on the missing module, not a typo
- [x] 3.2 Implement `neo-ext/lib/thesaurus-lookup.js` until 3.1 passes: `normalize` (curly `’` → `'`), `wordBounds`, `candidates` (possessive, plural, past, participle, consonant doubling), `shardFor`, `mergeSenses`, `applyCase`, `smartApostrophes`, `filterSynonyms`; verify `node --test scripts/thesaurus-lookup.test.js` is green
- [x] 3.3 Extend the test with merge behaviour: same-part-of-speech senses merge in first-seen order, duplicates collapse case-insensitively **across the whole entry**, the distinct count counts each word once, the looked-up word is never offered, an entry with no other words yields zero, `applyCase` turns `batch`→`Bundle` for `Batch` and `BUNDLE` for `BATCH`, and `smartApostrophes` turns `baker's` into `baker’s`; verify green

## 4. Main process: data status, lookup, context menu, Look Up hook

- [x] 4.1 Write `scripts/thesaurus-menu.test.js` (red) driving `neo-ext/thesaurus-main.js` with fake `items`/`win`: a stored word inserts `Thesaurus…` first plus a following separator, the stored word is consumed once, an empty word leaves the array untouched, and the click sends `{ type: 'neo-ext', action: 'thesaurus', word }`
- [x] 4.2 Implement `neo-ext/thesaurus-main.js` (manifest probe, shard load + cache through `fs.promises`/`zlib`, `neo-ext:thesaurus` and `neo-ext:thesaurus-status` handlers, per-window context word, `contextMenu(items, params, win)`, `lookUpMenu(items, word)`), wire it from `neo-ext/main.js`, and make 4.1 green
- [x] 4.3 Extend the test for lookup results and speed: a real shard returns grouped senses for `batch`, `batches` resolves to `batch`, an unknown word reports “no entry”, words outside `a`–`z` never touch the disk, a missing manifest reports unavailable, and a cached-shard lookup answers in under 150 ms; verify `node --test scripts/thesaurus-menu.test.js`
- [x] 4.4 Add seam 5 to `main.js` immediately before `Menu.buildFromTemplate(items).popup(...)` in the `context-menu` handler, marked `NEO-EXT seam`; verify `node neo-ext/check-seams.js` asserts it
- [x] 4.5 Add the macOS Look Up seam to `app.js` before the Look Up `popMenu` call, marked `NEO-EXT seam`, appending the item through `api.js`; extend `neo-ext/check-seams.js` to assert both seams and verify it passes

## 5. Preload and adapters

- [x] 5.1 Add `setContextWord(word)` (synchronous IPC), `thesaurus(word)`, and `thesaurusStatus()` to the existing `NeoForkNative` block in `preload.js`; verify with an Electron launch that the page sees all three (or a preload syntax check plus the manual launch in 7.1)
- [x] 5.2 Add guarded `spellLanguage()`, `moreFeatures()`, and `lookUpMenu(items, word)` to `neo-ext/api.js`; verify a unit check in `scripts/thesaurus-menu.test.js` returns safe defaults when the core globals are absent

## 6. Renderer: word, window, replacement

- [x] 6.1 Create `neo-ext/thesaurus.js` with the **capture-phase** `contextmenu` listener that detects the target, checks Show More Features, the English spellcheck language, and the data status, and never calls `preventDefault`; verify by right-clicking in a French book and in Simple NEO (no Thesaurus entry), in an English book (entry present), and on a spellcheck-flagged word (suggestion menu still appears)
- [x] 6.2 Resolve the clicked word's `Range` (one-word selection wins, multi-word selection suppresses, otherwise `caretRangeFromPoint` + `wordBounds`) and send it with `setContextWord`; verify right-clicking “batch” opens the window for “batch”, a multi-word selection adds no entry, and whitespace adds no entry
- [x] 6.3 Create `neo-ext/thesaurus-window.js` with the modal: `role="dialog"`, `aria-modal`, word-named `aria-label`, heading with word and distinct count, filter input, part-of-speech groups of synonym buttons, close control, Esc, backdrop click, focus trap, and the “another window is open” refusal with a toast; verify by keyboard only (Tab/↑/↓/Enter/Esc) and with a screen reader or the accessibility inspector
- [x] 6.4 Implement replacement in `neo-ext/thesaurus.js`: confirm the saved range is still in the document and still holds the clicked word, then `document.execCommand('insertText', false, smartApostrophes(applyCase(...)))`, returning focus and caret to the editor; verify “I have a batch of berries.” → choose “bundle” → “I have a bundle of berries.”, with one ⌘Z restoring “batch”
- [x] 6.5 Implement the stale-range path: when the remembered text no longer matches, change nothing and toast that the word moved; verify by opening the window and editing the same chapter from a second NEO instance on the same library, then choosing a synonym
- [x] 6.6 Add the fork strings to `neo-ext/locales/en.json` and route them through `x()`; verify no string is added to `scripts/i18n.js`'s scanner inputs and the English UI reads correctly
- [x] 6.7 Load `neo-ext/thesaurus-window.js` and `neo-ext/thesaurus.js` from `index.html` inside the existing `NEO-EXT seam` block, before `boot.js`; verify the page boots with no console error and `node neo-ext/check-seams.js` still passes
- [x] 6.8 Route `action === 'thesaurus'` and the Look Up menu choice through `neo-ext/boot.js` into the thesaurus module; verify the native item and the macOS Look Up item both open the window

## 7. Integration and review gate

- [x] 7.1 Manual repro on this machine (record result here): packaged or `npm start` launch, open a book, right-click “batch” in a chapter and in the notes page, filter the list, choose a synonym, confirm one undo restores the word, confirm a screenplay line and a footnote behave the same, confirm a word with no entry shows the toast, confirm a multi-word selection suppresses the entry, and confirm offline behaviour by disabling the network
- [x] 7.2 Run `node --test scripts/thesaurus-*.test.js`, `npm test`, `node neo-ext/check-seams.js`, `npx oxlint neo-ext scripts/thesaurus-*.test.js`; record pass counts in `tasks.md`
- [x] 7.3 Run the code review gate on `git diff fork...HEAD`: `grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, and `security-reviewer` (the diff touches preload/IPC and filesystem reads); fix blockers and record the verdicts here
- [x] 7.4 Rebuild and reinstall with `~/.local/bin/neo-reinstall`, confirm the packaged app performs a lookup with the network off, and confirm the licence file is inside the installed resources; verify by launching the installed entry and grepping the unpacked app for `WordNet_license.txt`

## Verification log

- 7.1 Runtime smoke (throwaway library, source build): chapter and notes page right-click; 34 synonyms in Noun/Verb groups; filter; pick; one undo; sentence-initial capital; Esc; multi-word selection suppressed; French and Simple NEO suppressed; stale range refused with “That word moved. Nothing was changed.”; screenplay line looked up the same way.
- 7.2 `node --test scripts/thesaurus-*.test.js` 31 pass / 0 fail; `npm test` 343 pass / 0 fail; `node neo-ext/check-seams.js` clean; `npx oxlint neo-ext scripts/thesaurus-*.test.js` clean.
- 7.3 `code-reviewer` and `security-reviewer` run twice (before and after fixes); second pass fixed both highs (footnote gate, dropped-e fallback), the blocking clear, focus, and the seam-10 test; verdicts in `review.md`. No blocker left.
- 7.4 `~/.local/bin/neo-reinstall` built and installed 1.6.0; `app.asar` holds 26 shards and the manifest, `resources/licenses/wordnet/WordNet_license.txt` exists, and the packaged app answered `thesaurusStatus` (144,863 headwords) and `thesaurus('batch')` (34 synonyms) with no network.

## 8. Relation markers (bug fix)

- [x] 8.1 Classify every MyThes marker in `neo-ext/tools/build-thesaurus.js` (generic, similar, related, antonym), store it as `{w, rel}` in format 2, and keep it out of the word; verify the data test rejects any `(` in a word
- [x] 8.2 Group the window by part of speech and relation and label the heading (“Adjective · Antonym”); verify “good” shows nine groups and every button is a bare word
- [x] 8.3 Keep replacement to the word alone; verify choosing “bad” from the Antonym group writes “bad” and never “bad (antonym)”
- [x] 8.4 Regenerate the 26 shards and manifest (793,623 words, 4.26 MB gzipped), update the data test to format 2 and object entries, and run the full suite
