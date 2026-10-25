# Tasks

## 1. Planning review and version sanity

- [x] 1.1 Make the change visible (`git add -N openspec/changes/adr-003-dictionary`) and run `grasp-verify` and `ddd-verify` on the diff; fix findings in `proposal.md` / `specs/` / `design.md` until no blocker remains, then re-run both
- [x] 1.2 Change `neo-ext/lib/version.js` and `neo-ext/check-version.js` to count **archived** ADRs only, with a red test first for “an active change does not raise the fork number”; verify `npm run check:version` passes as `1.6.0+fork.2` while adr-003 is active

## 2. OEWN 2025 data (dictionary + thesaurus)

- [x] 2.1 Write `scripts/oewn-build.test.js` (red) for `neo-ext/tools/build-oewn.js`: definitions from a synset, quoted examples capped at four, `_` → space, marker-free words, the five relation classes (synonym, generic, similar, related, antonym), malformed entries refused; watch it fail on the missing module
- [x] 2.2 Implement the converter reading the unpacked 2025 release (synset files + `entries-*.json`) and writing both `neo-ext/dictionary/en/shards/` and `neo-ext/thesaurus/en/shards/`; verify 2.1 is green and each directory has 26 shards
- [x] 2.3 Emit each directory's `manifest.json` (format, edition, asset SHA-256, per-directory schema, counts, gz bytes), copy OEWN's `LICENSE.md` with both attributions, and write both READMEs with provenance, size, conversion note, and content note; verify the manifests parse and match the directories
- [x] 2.4 Write/extend `scripts/dictionary-data.test.js` and `scripts/thesaurus-data.test.js` (red on the old directory) for: every shard inflating, keys in their letter, counts summing to the manifest, `batch` definitions with examples, `good` antonym `bad`, no `(` in any word, both licences present, dictionary under 7 MB and thesaurus under 5 MB; generate the data and run both green
- [x] 2.5 Update `package.json` `extraResources` for both licences (`resources/licenses/oewn-dictionary`, `resources/licenses/oewn-thesaurus`), exclude the converter from packaging, and delete the obsolete MyThes converter/data paths; verify `require('./package.json').build` carries both

## 3. One set of word forms

- [x] 3.1 Write a test for `neo-ext/lib/word-forms.js` that imports `normalize`, `wordBounds`, `candidates`, and `MAX_WORD` and proves it is the same implementation the thesaurus already tests; watch it fail
- [x] 3.2 Extract those four exports from `neo-ext/lib/thesaurus-lookup.js` into `word-forms.js` and re-export them from the old module; verify every `scripts/thesaurus-lookup.test.js` case still passes unchanged

## 4. One word context, two menu items

- [x] 4.1 Write a `vm` test for `neo-ext/word-context.js` (red): one capture listener, one stored word for an editable English editor with Show More Features on, no store for a multi-word selection, non-English, Simple NEO, or non-editor target; then implement it
- [x] 4.2 Write a main-process test for `neo-ext/word-context-main.js` (red): per-window words, 5-second expiry, one `take()` consumption, `clearContextWord` accepted; then implement it and move the IPC handler out of `thesaurus-main.js`
- [x] 4.3 Refactor `neo-ext/thesaurus.js` to read `word-context.js` and `neo-ext/thesaurus-main.js` to expose `menuItem(word)`/lookup through the shared context; delete the duplicate listener and word map; verify the full thesaurus suite and a live right-click still behave as before
- [x] 4.4 Write a test for the menu registry in `neo-ext/main.js` (red): Dictionary… then Thesaurus… then one separator when both have data; only the available feature when one lacks data; unchanged items otherwise. Implement the registry and run it green

## 5. Dictionary lookup and bridge

- [x] 5.1 Write `scripts/dictionary-lookup.test.js` (red) for `dictionary-main.js`: `batch` returns noun and verb groups with definitions/examples, `batches` resolves to `batch`, `writer's` resolves to `writer`, unknown/overlong words report `none`, missing data reports `unavailable`, warm lookup under 150 ms
- [x] 5.2 Extract the shard cache/gunzip/retry from `thesaurus-main.js` into `neo-ext/lib/shard-store.js`, use it from both features, and make 5.1 green
- [x] 5.3 Add `neo-ext:dictionary-status` / `neo-ext:dictionary` IPC and the `NeoForkNative.dictionary` / `dictionaryStatus` bridge; verify the existing `neo-ext-main` tests still pass and the new handlers answer on a real launch
- [x] 5.4 Add `dictionaryStatus` (and any shared word helpers) to `neo-ext/api.js` with guarded fallbacks; verify its `vm` test returns safe answers when NEO has not settled
- [x] 5.5 Point `thesaurus-main.js` at the OEWN thesaurus directory/manifest format and run the full thesaurus suite against the new data; verify “good” still shows an Antonym group and replacement still writes only the word

## 6. Dictionary window and wiring

- [x] 6.1 Write a `vm` test for `neo-ext/dictionary.js` (red): the Look Up seam appends one Dictionary… item and one Thesaurus… item for a matching word, opens the definition window on action, and never exposes a replacement range; implement the module
- [x] 6.2 Build `neo-ext/dictionary-window.js` + CSS: dialog semantics, word and sense count, part-of-speech groups, definitions, quoted examples, internal scroll, Esc/close/backdrop, Tab trap, one-window rule; verify by keyboard only and with a long word such as “run”
- [x] 6.3 Load the new scripts from `index.html` in the existing seam and route the `dictionary` action plus the Look Up choice through `boot.js`; verify the page boots with no console error and `node neo-ext/check-seams.js` passes
- [x] 6.4 Add every new writer-visible string to `neo-ext/locales/en.json`; verify the window has no hard-coded string that bypasses `x()`

## 7. Integration and review gate

- [x] 7.1 Manual repro (record results here): right-click a word in a chapter, notes page, footnote, and screenplay line; both items appear in order; Dictionary opens and closes with Esc/backdrop; “run” scrolls internally; the chapter file is byte-for-byte unchanged; thesaurus still replaces from the new data; French and Simple NEO hide both; packaged build looks up offline
  - Results (`npm run test:dictionary`, 12 checks on a real launch): a chapter word offers **Dictionary…** then **Thesaurus…**; the window names the word, groups by part of speech, quotes examples; the 40-sense “run” entry scrolls while the page stays put; Esc and a backdrop click close it, and focus returns to the editor; `chapterHTML`, `savedHTML`, undo/redo and the `input` count are unchanged; the notes editor (`#aux-editor`) and a footnote (`.fn-text`) resolve the same word; French and Simple NEO store no word; the thesaurus still labels **good**'s antonym and replaces it with **bad**; a `menu` message from the main process opens the dictionary; another NEO dialog refuses it with “Close the other window first”. Screenplay lines render inside `.chapter-body`, so the chapter check covers that surface.
  - Packaged: the installed `1.6.0+fork.2` answered `dictionary('batch')` (2 groups, examples) and `thesaurus('good')` (111 words, antonym **bad**), reported 126,595 and 123,673 headwords, with both notices under `resources/licenses/oewn-{dictionary,thesaurus}/`.
- [x] 7.2 Run `node --test scripts/*.test.js`, `npm run lint`, `node neo-ext/check-seams.js`, `npm run check:version`, and `openspec validate adr-003-dictionary --strict`; record counts
  - Results: 407 unit tests pass (0 fail); `npm run test:dictionary` 12 pass; `npx oxlint neo-ext/` clean (repo-wide `npm run lint` still reports pre-existing upstream findings in `app.js`/`scripts/`, untouched here); seams pass; version stays `1.6.0+fork.2` while adr-003 is active; validate passes.
- [x] 7.3 Run the review gate on the diff (`grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, `security-reviewer`); fix blockers and record verdicts in `review.md`
  - Results: `code-reviewer` and `ts-cop` blocked on the macOS Look Up routing; fixed (choice-based routing, seam anchors, tests, e2e). Converter guards, shard-store coverage, context spending and doc drift also fixed. `security-reviewer`: no blockers; pre-existing navigation/sender advisories recorded. Verdicts and accepted advisories are in `review.md`.
- [x] 7.4 `~/.local/bin/neo-reinstall`, confirm the packaged app answers dictionary and thesaurus lookups offline, both shard sets and licences are inside the installed resources, and note that the fork version moves to `1.6.0+fork.3` only when this change archives
  - Results: installed `1.6.0+fork.2`; `app.asar` holds 26 shards + manifest per feature and no converter; `resources/licenses/oewn-dictionary/` and `oewn-thesaurus/` each carry `LICENSE.md` and `WNDB_License.txt`; a packaged launch answered both lookups from those resources (no network). The version moves to `1.6.0+fork.3` at archive time.
