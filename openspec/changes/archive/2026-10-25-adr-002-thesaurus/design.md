# Design

## Context

See `proposal.md` for motivation and `specs/thesaurus/spec.md` for the behaviour contract.

NEO's editor is `app.js` in one classic script, and the fork keeps its code in `neo-ext/` behind marked seams. The editor has no module loader, the renderer never touches the filesystem, and a packaged app runs from an asar archive. NEO already ships a spellchecker whose English data is loaded by the main process and answers the renderer through IPC; the thesaurus follows that shape.

Three existing context-menu paths matter:

- **Native** (`main.js` `webContents.on('context-menu')`) owns Cut/Copy/Paste/Select All and the screenplay page break. A renderer `preventDefault` cannot add to it, so a fork item needs the planned seam 5.
- **Spellcheck** (`app.js`, renderer popup) answers a right-click on a flagged word and calls `preventDefault`. It wins over everything else.
- **macOS Look Up** (`app.js`, renderer popup) answers a right-click on a selected word and calls `preventDefault`, so the native menu never opens on that path.

## Goals / Non-Goals

**Goals:**

- Zero network, zero new runtime dependency, works packaged and offline.
- One seam in the native menu and one optional item hook in the macOS Look Up menu; everything else in `neo-ext/`.
- Lookup, inflection, case, and typography rules are pure and testable without Electron.
- Committed data small enough for a normal git clone and a normal app download.

**Non-Goals:**

- Languages other than English, or a per-book thesaurus choice.
- Definitions, example sentences, antonyms, pronunciation, or translation.
- Thesaurus in Pocket, in the shelf's right-click, or in exported files.
- Learning, re-ranking, or personalising suggestions from the writer's usage.

## Decisions

### D1. Data source: LibreOffice `en_US` MyThes (WordNet 2.1)

The file `th_en_US_v2.dat` from `LibreOffice/dictionaries` (`en/`), 18 MB of text, maps a headword to one or more lines:

```
batch|4
(noun)|collection|aggregation|accumulation|assemblage|collection (generic term)
(noun)|deal|flock|good deal|...|whole slew|large indefinite quantity (generic term)
```

Chosen over Open English WordNet (same WordNet shape, extra CC BY 4.0 attribution surface) and Moby Thesaurus II (public domain but flat, sense-less, and only mirrored on archived sites). OpenThesaurus is German-only and its CC BY-SA / LGPL data terms do not suit a bundled English file.

The WordNet license permits use, copy, modify, and distribution provided the notice and disclaimer accompany every copy — MIT-compatible. `WordNet_license.txt` is committed beside the data and packaged with it.

### D2. Conversion to sharded gzipped JSON, committed; source file not committed

A build-time script (`neo-ext/tools/build-thesaurus.js`, Node built-ins only) parses the MyThes file and writes:

```
neo-ext/thesaurus/en/manifest.json      provenance: source URL, pinned upstream commit, sha256, format version, counts
neo-ext/thesaurus/en/WordNet_license.txt
neo-ext/thesaurus/en/shards/a.json.gz … z.json.gz
```

Each shard maps `headword` → `[{"pos":"noun","syns":[{"w":"…","rel":""}]}, …]`. The source's relation markers become `rel` (`generic` for a broader term, `similar`, `related`, `antonym`; plain synonyms keep `""`), and the marker is removed from the word. Headwords are lower-cased and filtered to `[a-z][a-z' -]*`, duplicates are removed, and the source word is dropped from its own lists at read time. Format 2. Measured on the current source: 144,863 headwords, 793,623 words, 26 shards → **4.26 MB gzipped**.

Alternatives: committing the 18 MB source as well (doubles growth for no runtime use), one monolithic gzip (loads 3.8 MB for one word), or converting at first launch (writes into app resources, fails on read-only installs). A manifest plus checksum keeps regeneration honest without shipping the source.

The script is run by hand when the upstream file changes; output is reviewed and committed. `files: ["**/*"]` in `package.json` already includes `neo-ext/`, so no packaging change is needed. The license is a `.txt` file inside `neo-ext/`, so the root-level `!*.md` packaging exclusion cannot drop it.

### D3. Lookup in the main process, one shard cached in memory

`neo-ext/lib/thesaurus-lookup.js` is pure and holds every rule worth testing:

- `normalize(word)` — trim, lower-case, map `’` to `'`, strip surrounding punctuation.
- `wordBounds(text, offset)` — expand across letters, combining marks, and digits, plus internal `'`, `’`, and `-`.
- `candidates(word)` — the word, then possessive `'s` / `’s`, plural `-s` / `-es` / `-ies`, past `-ed` / `-ied`, participle `-ing` / `-ying`, with consonant doubling (`batting` → `bat`), each only consulted when the earlier form missed.
- `mergeSenses(entry, word)` — group by part of speech and relation, plain synonyms first then broader, similar, related, antonym; de-duplicate case-insensitively **across the whole entry** (first group keeps the word); drop the looked-up word; expose the distinct count.
- `applyCase(chosen, original)` — `Batch` → `Bundle`; `BATCH` → `BUNDLE`; otherwise unchanged.
- `smartApostrophes(chosen)` — ASCII `'` inside a chosen synonym becomes `’`, matching NEO's typed apostrophe.
- `filterSynonyms(groups, query)` — case-insensitive substring filter.

The main process reads `neo-ext/thesaurus/en/shards/<first letter>.json.gz` on first use, inflates it asynchronously with `zlib.gunzip` (bounded output), keeps at most three parsed shards in insertion order (oldest evicted), and answers `neo-ext:thesaurus`. Words starting outside `a`–`z` map to no shard and report “no entry”. Asar reads work through `fs.promises.readFile`.

A startup probe (`neo-ext:thesaurus-status`) reads `manifest.json` once and reports whether the data directory is present and readable. The renderer asks for it when its script loads and caches the answer; a missing data directory keeps the menu item off instead of offering a broken choice.

### D4. Word under the pointer is resolved in the renderer, synchronously handed to the native menu

`neo-ext/thesaurus.js` listens for `contextmenu` in the **capture** phase so it can remember the word before any bubble-phase menu runs, but it never calls `preventDefault`:

1. Stand down if the target is not inside `.chapter-body` or `#aux-editor`, if Show More Features is off, if the spellcheck language is not English, or if the data status says the shard set is missing.
2. Resolve the word: a selection of exactly one word wins; a selection of two or more words suppresses the feature; otherwise `document.caretRangeFromPoint(x, y)` plus `wordBounds`. Digits stay inside a word, and internal `'` / `’` / `-` do not split it.
3. Remember `{ word, range }`, then call the preload bridge `setContextWord(word)` — a **synchronous** IPC (`ipcRenderer.sendSync`) so the value is stored before Chromium asks the main process to build the menu. Any other right-click sends an empty string.

Seam 5 in `main.js` calls `require('./neo-ext/main.js').contextMenu(items, params, win)` immediately before `Menu.buildFromTemplate(items).popup(...)`. `neo-ext/main.js` only delegates to `neo-ext/thesaurus-main.js`, which reads and clears the stored word for the window and, when one is present, inserts `Thesaurus…` first, followed by a separator, before the existing items. The click sends `{ type: 'neo-ext', action: 'thesaurus', word }` to the renderer through the existing `menu` channel; `boot.js` already subscribes to it and hands the message to the thesaurus module.

The spellcheck listener runs in the bubble phase and calls `preventDefault`; the native menu is then never built, so the stored word is simply cleared by the bridge on the next right-click. Its menu keeps precedence exactly as today.

**macOS Look Up.** For a selected word, the core Look Up listener opens its own popup and bypasses the native menu, so on that path the fork appends its item instead: one marked seam adds the item through `api.js`'s `lookUpMenu` before `popMenu`, and a second line in its `.then` hands the choice to `lookUpChoice`. The fork item opens the same synonym window using the range saved in step 3. Without that hook the feature would silently disappear on macOS whenever a word is selected, which is the common way to right-click a word there.

### D5. Modal built in `neo-ext/`, split from the wiring

Two renderer files keep each within one responsibility:

- `neo-ext/thesaurus.js` — the capture-phase listener, word/range resolution, the menu message handler, the stale-range guard, and the replacement call.
- `neo-ext/thesaurus-window.js` — the synonym window itself: heading, filter, groups, keyboard loop, focus handling, and the “another window is open” refusal. `window.NeoThesaurusWindow.open({ word, groups, onPick, onCancel })` is its only surface.

The window is `div.modal-backdrop.neo-ext-backdrop > div.modal.neo-ext-thes`, reusing the classes and CSS variables the Settings window already uses, so it looks native in both bright and dark looks. It carries `role="dialog"`, `aria-modal="true"`, and `aria-labelledby` pointing at the heading, so its accessible name carries the word and the count. Strings go through the fork's `x()` helper and `neo-ext/locales/en.json` (not `scripts/i18n.js`, per the fork rule).

Keyboard and focus: the filter takes focus on open; ↑/↓ move a highlighted synonym; Enter chooses it; Esc, the close control, and a backdrop click dismiss. Closing restores the saved selection and focus to the editor. `boot.js` exposes `window.NeoExt.toast`, which both modules use for “No synonyms for ‘word’”, the moved-word case, and the “close the other window” case.

### D6. Replacement is one `insertText` through the saved Range, guarded

On choice:

1. Confirm the saved `Range` still resolves inside the live document and its text still equals the clicked word. If it does not (another device's chapter was adopted, a restore ran, the chapter closed), discard the range, close, and toast that the word moved.
2. Re-select the range, then `document.execCommand('insertText', false, smartApostrophes(applyCase(chosen, original)))`.

This is the mechanism `app.js` already uses for spellcheck replacement, so the edit lands in Chromium's undo stack as **one** step, fires the normal `input` event, and therefore runs NEO's existing 800 ms chapter save and word-count path with no new persistence code. The caret ends after the inserted text; the window removes itself first so focus can return.

### D7. Testing

- `scripts/thesaurus-lookup.test.js` — pure rules: normalisation, `wordBounds` (including digits, hyphenated compounds, curly apostrophes), inflection candidates including possessives and consonant doubling, sense merge with cross-group de-duplication and distinct count, case preservation, apostrophe typography, filtering, shard selection. Written first (red), then implemented.
- `scripts/thesaurus-data.test.js` — committed data integrity: every shard inflates and parses, keys match the shard letter, manifest counts match, `batch` has several parts of speech, licence and manifest exist, total gzipped size stays under a stated ceiling.
- `scripts/thesaurus-menu.test.js` — seam helper with a fake `items` array: item inserted first with separator only when a word is stored, stored word consumed once, empty word leaves the menu untouched, click sends the `menu` message, and the renderer adapters answer safely before NEO has settled (run in a `vm`).
- Renderer DOM behaviour (word under pointer, selection precedence, filter, keys, stale range, undo) is covered by a written manual repro in `tasks.md`, per the fork's e2e rule.

## Risks / Trade-offs

- **WordNet licence notice must ship in every copy** → license file lives with the data inside `neo-ext/` and is listed in the data README; the data test asserts it exists.
- **Two seams instead of one** (native menu plus macOS Look Up) → the Look Up hook only appends an item and hands the choice back; `check-seams.js` asserts both, and `AGENTS.md`'s table records them.
- **`sendSync` on every right-click in the editor** → the handler stores one string; cost is sub-millisecond. Sending only on editable targets keeps it off the shelf.
- **Menu race** (renderer event vs native menu build) → synchronous IPC removes it; the value is cleared when the menu is built or by the next right-click.
- **Stale range** → explicit text match before insertion; on mismatch nothing is written.
- **Undo granularity depends on `execCommand`** → same call the spellchecker already relies on. If the engine refuses it, nothing is written and the writer sees “That word could not be replaced.” — a silent DOM fallback would bypass NEO's `input`-driven save and could lose the chosen word.
- **Data contains archaic, informal, and offensive terms** (WordNet includes slurs) → full-source fidelity is the point of a writer's thesaurus; no filtering, and the word is only offered after an explicit gesture. Noted in the data README.
- **Fixed 3.8 MB app growth** → gzip shards load on demand; no memory cost until a lookup.
- **Sense grouping without definitions** → MyThes carries only part of speech, so same-POS senses merge. Writers get “Noun” and “Verb” groups, with relation headings such as “Adjective · Antonym” rather than meaning glosses; adding definitions would need a different source.
- **Inflection fallback can suggest the wrong base form** (`axes` → `ax` or `axis`) → it only runs when the exact form misses, and the window always names the word it actually looked up.

## Migration Plan

No data migration. The feature is additive: removing the change leaves books, library, and settings untouched. Rollback is deleting `neo-ext/thesaurus/`, `neo-ext/thesaurus*.js`, `neo-ext/tools/build-thesaurus.js`, the two seam lines, the preload methods, the script tags, and the `AGENTS.md` table rows.

## Open Questions

- None blocking. Whether to add a second language later depends on demand and on a per-language licence review; it does not change the architecture.
