# Review — adr-002-thesaurus (planning)

Scope: `git diff HEAD` over the untracked change (proposal, specs, design, tasks). Planning-only review per `AGENTS.md`: GRASP and DDD run on the artifacts, findings fixed in the artifacts before implementation.

## GRASP Verification — 2026-10-25

**Scope:** planning artifacts in `openspec/changes/adr-002-thesaurus/`
**Files reviewed:** 4
**Findings:** 3

### Problems

- [ ] `design.md` (renderer section) — Low cohesion: one renderer module held pointer detection, the modal, the stale-range guard, and replacement. Split into `neo-ext/thesaurus.js` (wiring, detection, replacement) and `neo-ext/thesaurus-window.js` (the window).
- [ ] `design.md` (context section) — Missing indirection: the macOS Look Up path owns a popup that bypasses the native menu, so the new item would vanish for selected words. Add one marked Look Up seam and route it through `api.js`; record it in `AGENTS.md`.
- [ ] `design.md` (D4) — Protected variation: `neo-ext/main.js` would become the coordinator for two unrelated features. It stays a dispatcher; lookup, data status, menu insertion, and the Look Up hook live in `neo-ext/thesaurus-main.js`.

### Recommendations

- Split the renderer work (done: D5 now names both files and the window's single entry point).
- Add the Look Up seam and keep its policy in the fork (done: D4, spec scenario, tasks 4.5/5.2).
- Keep `neo-ext/main.js` a seam adapter only (done: D4 states the delegation).

## DDD Verification — 2026-10-25

**Scope:** planning artifacts in `openspec/changes/adr-002-thesaurus/`
**Files reviewed:** 4
**Findings:** 6

### Problems

- [ ] `specs/thesaurus/spec.md` (requirement 1) — Wrong owner in the ubiquitous language: “the book's spellcheck language”. `spellLanguage` is a library-wide setting in `library.json`, not a book property. Renamed to “NEO's spellcheck language (a library-wide setting)”.
- [ ] `specs/thesaurus/spec.md` (requirement “Replacing…”) — Missing invariant: the system promised to replace *the clicked word* but never checked that the remembered position still held it. Added the stale-range guard and a scenario; `design.md` D6 now defines the check.
- [ ] `specs/thesaurus/spec.md` (requirement “Synonym window”) — Undefined term: “number of synonyms” did not say whether duplicates across part-of-speech groups count once. Defined as distinct across the whole entry; `mergeSenses` de-duplicates globally.
- [ ] `specs/thesaurus/spec.md` (requirement “Offline synonym lookup”) — Missing outcome: an entry whose only synonym is the clicked word produced nothing to show, but only “no entry” had a defined result. Added “entry with no other words” and its scenario.
- [ ] `specs/thesaurus/spec.md` (requirement 1) — Conflicting rules: the entry required “a selection of exactly one word”, while `design.md` fell back to the pointer inside a multi-word selection. Precedence fixed: a multi-word selection suppresses the entry; scenario added.
- [ ] `specs/thesaurus/spec.md` (requirement “Offline synonym lookup”) — Non-testable acceptance: “no perceptible delay”. Replaced with 150 ms once the letter's shard is loaded and 500 ms for a first local-disk read; task 4.3 measures it.

### Recommendations

- Keep library-scoped settings out of book-scoped language (done in spec and design).
- State the replacement precondition as a rule, not an implementation note (done).
- Give every branch of lookup a defined outcome (done: entry, no entry, nothing left).
- Replace subjective timings with numbers (done).
- Records of typography belong in the domain rules too: added apostrophe normalisation (`smartApostrophes`) and a scenario.

## Additional consistency review

- **Seam accounting.** `AGENTS.md` currently lists seam 5 as planned and has no row for the macOS Look Up hook. Task 1.2 updates the table; `check-seams.js` asserts both.
- **Data availability.** The menu item is now gated on a startup manifest probe, so a failed data install cannot offer a broken choice (spec scenario “Thesaurus data missing”, design D3, task 6.1).
- **Packaging.** The licence is a `.txt` inside `neo-ext/`; the root `!*.md` exclusion cannot drop it. Task 7.4 greps the installed resources.
- **No storage changes.** No requirement writes to `book.json`, `library.json`, settings, or sidecars; the only write is the chosen word through the existing save path.
- **Pocket.** No requirement or task touches `scripts/pocket-www.js`, so the feature stays desktop-only as stated.

## Resolutions applied

| Finding | Artifact change |
|---|---|
| Renderer low cohesion | `design.md` D5: two files with one entry point |
| macOS Look Up gap | `spec.md` scenario + `design.md` D4 + tasks 4.5, 5.2, 6.8, 1.2 |
| `main.js` grab-bag | `design.md` D4: delegation to `thesaurus-main.js` |
| “book's spellcheck language” | `spec.md` requirement 1 and proposal |
| Stale range | `spec.md` requirement 4 + scenario, `design.md` D6, tasks 6.4–6.5 |
| Count ambiguity | `spec.md` requirement 3, `design.md` D3, task 3.3 |
| Empty-after-self | `spec.md` requirement 2 + scenario |
| Multi-word selection | `spec.md` requirement 1 + scenario, `design.md` D4, task 6.2 |
| Unmeasurable timing | `spec.md` requirement 2, `design.md` D3/D7, task 4.3 |
| Apostrophe typography | `spec.md` requirement 4 + scenario, `design.md` D3/D6, task 3.3 |
| Data missing | `spec.md` scenario, `design.md` D3, tasks 4.2/4.3/6.1 |
| Seam table | task 1.2 |

No blocker remains. `openspec validate adr-002-thesaurus --strict` passes.

## Implementation review — 2026-10-25

Ran after the code was written and tested (`code-reviewer` and `security-reviewer` on the staged diff).

**Verdicts:** `code-reviewer` — 0 critical, 1 high, 4 medium, 11 low (WARNING, fix the high). `security-reviewer` — 0 critical, 0 high, 1 medium, 3 low, overall low-medium; path traversal, XSS, CSP, IPC scoping and prototype access all checked clean.

### Fixed before the gate closed

- **High / medium (both reviewers): silent DOM fallback** — the `execCommand` fallback edited the page without an `input` event, so NEO would not save or count the chosen word. Removed; a refused edit now toasts “That word could not be replaced.” and writes nothing (`neo-ext/thesaurus.js`).
- **Modal keyboard** — Esc/Tab were bound to the backdrop, so clicking the dialog's own whitespace moved focus to `<body>` and dropped them. Moved to `document` capture (same pattern as Settings), with the dialog focusable.
- **Shard cache** — unbounded map replaced by a three-shard insertion-order cache; decompression is async with a bounded output, and a failed read is evicted so it can retry.
- **Overlong words** — one `MAX_WORD` (120) in the lookup rules, enforced in the renderer before the menu and in the main process before any shard read; no more dead menu items.
- **Look Up hand-over** — choosing the popup path clears the stored native-menu word, so macOS does not keep a dead item or the word in memory.
- **Wrong self-suggestion** — the clicked word, not only the resolved headword, is removed from the offered list; headword lookups use `Object.hasOwn`.
- **Caret on cancel** — cancelling collapses the remembered range instead of selecting the word; a one-word selection made by the writer is still restored as a selection.
- **Editable gate** — `isContentEditable` is required, so a loading notes page cannot offer a replacement that cannot land.
- **Empty/plural wording** — “One synonym for …” for a single result; parts of speech go through the fork's own labels.
- **Seam order guard** — `check-seams.js` now verifies the Look Up item is added before `popMenu`, not merely present.
- **Licence visibility** — `WordNet_license.txt` is also copied to `licenses/wordnet` through `extraResources`; the build script is excluded from the packaged app.
- **Docs** — proposal/design counts and seam impact corrected; task 4.1 names the module it drives.

### Accepted advisories (not fixed, with reason)

- `x()` is repeated in `boot.js`, `settings.js`, `thesaurus.js`, and `thesaurus-window.js`. Extracting it is a cross-feature refactor outside this change; noted for a later cleanup.
- The native menu label uses core `t()` (English fallback) while the Look Up label uses fork `x()`. The fork's locale loader is renderer-only; a main-process locale file is its own change.
- About/credits does not name WordNet yet. The licence now ships in two places; adding a credits line touches a core screen and is left as a follow-up.
- The data status is probed once per session. A rebuild while NEO runs is a developer action, not a writer one.

### Verification recorded

`node --test scripts/thesaurus-*.test.js` — 31 pass, 0 fail. `npm test` — 343 pass, 0 fail. `node neo-ext/check-seams.js` — all seams. `npx oxlint neo-ext scripts/thesaurus-*.test.js` — clean. Runtime smoke on a throwaway library: right-click “batch” in a chapter and in the notes page, 34 words in noun and noun · broader-term groups, filter, choose, one undo, capital preserved, Esc, multi-word suppression, French and Simple NEO suppression, and the stale-range refusal (“That word moved. Nothing was changed.”).

## Second review — 2026-10-25 (after the fixes)

Fresh `code-reviewer` and `security-reviewer` passes on the fixed diff.

**Verdicts:** code-reviewer — 0 critical, 2 high, 6 medium, 7 low (WARNING); security-reviewer — 0 critical, 0 high, 1 medium, 2 low (low-medium).

### Fixed in this pass

- **High: footnotes were excluded** — the editor gate matched only `.chapter-body` and `#aux-editor`, while a footnote's text lives in `.fn-text`, a sibling of the chapter body. All three selector sites now include `.fn-text`; a runtime check opened the window from a `.fn-text` and read 34 synonyms for “batch”.
- **High: dropped-e fallback** — `hoping` resolved to `hop` and `baked` to nothing because the bare stem was tried before `stem + 'e'`. Both past and participle ladders now try the `e` form first; tests cover `hoping`/`hoped`/`baked`/`baking`.
- **Medium: exact entry with only itself** — the lookup fell through to a different fallback headword. It now stops on an exact entry with no other words; test uses `asap`.
- **Medium: blocking clear on every right-click** — clearing now uses a fire-and-forget `clearContextWord` channel and only fires when a word was actually stored; verified that a right-click outside the editor sends nothing.
- **Medium: focus after a refused replacement** — both “word moved” and “could not replace” paths refocus the editor.
- **Medium: seam-10 test** — added a `vm` test for `NeoThesaurus.lookUpMenu`: one item appended, stored word cleared, word mismatch refused.
- **Low: logError argument**, cancel restores the remembered caret, single-letter capitalisation, POS lookup uses `Object.hasOwn`, Look Up cleanup happens before the language gate, a failed open gets its own message.
- **Low: test gaps** — curly apostrophe in `wordBounds`, ordered fallback assertions, single-letter case.

### Accepted after this pass

- The “prototype key” lookup test was renamed to what it actually checks (words absent from the data); the guard itself is `Object.hasOwn` and is not separately faked.
- The prior advisories (shared `x()` helper, main-process label i18n source, About credits line, cached negative data status) remain as noted above.
- `security-reviewer` flagged a pre-existing, out-of-scope navigation exposure in `createWindow` (`setWindowOpenHandler`/`will-navigate` absent). It predates this change and belongs in its own ADR.

Recorded after this pass: 30 thesaurus tests / 342 total pass, lint clean, seams in order, `openspec validate --strict` valid.

## Bug fix after implementation — relation markers (2026-10-25)

**Report:** right-clicking a word whose synonyms came from marked MyThes entries inserted `bad (antonym)` into the manuscript.

**Cause:** the build stripped only `(generic term)`. The source also marks `(similar term)`, `(related term)`, and `(antonym)`; those markers reached the word lists, the window, and `insertText`.

**Fix:** format 2 shards keep the relation beside the word (`{w, rel}`), the window groups by part of speech and relation with headings such as “Adjective · Antonym”, and replacement always inserts the bare word. The data test now fails if any word still contains `(`. Verified live: “good” shows Adjective, Similar, Related, Antonym, Noun, Noun · Broader term, Noun · Antonym, Adverb, Adverb · Antonym groups; choosing “bad” from Antonym produced “a bad batch”.

Recorded after the fix: 31 thesaurus tests / 343 total pass, lint clean.
