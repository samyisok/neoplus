# Design

## Context

See `proposal.md` for motivation and `specs/dictionary/spec.md` / `specs/thesaurus/spec.md` for the behaviour contracts.

The thesaurus (adr-002) already owns a right-click word resolver, a synchronous hand-off to the native menu, a shard loader, a modal, and gated availability. A dictionary needs the same word, the same menu, and the same kind of data, but it never edits the text. Copying that machinery would double the capture listener and put two `sendSync` calls on every editor right-click; the right move is to share it before adding the second feature.

The lexical data also changes hands in this design. Princeton's WordNet project is no longer in active development; the Open English WordNet continues the database with yearly editions. Both features therefore read **one** converted OEWN 2025 source instead of the LibreOffice MyThes file the thesaurus uses today.

Constraints: `app.js` is one classic script; the renderer never reads the filesystem; the app runs from an asar; the fork keeps upstream edits to marked seams; the fork version is `<upstream>+fork.<archived ADR count>`.

## Goals / Non-Goals

**Goals:**

- One word-resolution path and one menu registration for both lexical features.
- One maintained data source, one conversion pipeline, one licence story for definitions and synonyms.
- Offline definitions with examples, roughly 6 MB compressed; synonyms roughly 3.58 MB.
- No manuscript or library writes of any kind.
- The thesaurus keeps its current behaviour through the data and code refactor.

**Non-Goals:**

- Replacing or inserting text from the dictionary, pronunciation audio, etymology, translations, or images.
- Other languages, or per-book dictionary choice.
- Pocket, shelf right-click, or exported files.
- Linking every word inside a definition to another lookup (a possible later change).

## Decisions

### D1. Data source: Open English WordNet 2025

The 2025 edition, released 31 December 2025, published as `english-wordnet-2025-json.zip` on the project's GitHub release (`globalwordnet/english-wordnet`, tag `2025-edition`): 9,986,555 bytes, SHA-256 `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`, unpacked to 70 MB of JSON.

Chosen over Princeton WordNet 3.1 (frozen since 2011; the Princeton project is no longer developed and points readers to community editions), Webster's 1913 (public domain but dated and 28.9 MB of prose), and GCIDE (GPL — an avoidable obligation for an MIT app).

OEWN is derived from Princeton WordNet and dual-noticed: CC BY 4.0 for the Open English WordNet team's work plus the WordNet notice for the underlying database. The attribution and an indication that the data was converted travel in each data directory and again in `resources/licenses/`; the manifests name the release and its hash.

### D2. One conversion, two schemas

`neo-ext/tools/build-oewn.js` reads the unpacked release (synset files plus `entries-*.json`) and writes both feature directories:

```
neo-ext/dictionary/en/manifest.json, LICENSE.md, shards/a.json.gz … z.json.gz
neo-ext/thesaurus/en/manifest.json,  LICENSE.md, shards/a.json.gz … z.json.gz
```

- **Dictionary** shard: `headword → [{ pos, def, ex? }]`. A sense takes the synset's first definition and up to four quoted examples; identical definitions for the same headword collapse.
- **Thesaurus** shard: `headword → [{ pos, syns: [{ w, rel }] }]`, unchanged from adr-002. `rel` is `''` for another member of the same synset, `generic` for a direct hypernym's members, `similar` for a `similar` link, `related` for an `also` link, and `antonym` for a sense-level antonym resolved back to its headword.
- Headwords are lower-cased, `_` becomes a space, and only `[a-z][a-z' -]*` is kept. Definitions and words never carry a marker or markup.
- Manifests record format, edition, asset URL, SHA-256, counts, gz bytes, and per-directory schema. Format 1 for the dictionary; the thesaurus manifest moves to format 3 (source change) while its shard shape stays format 2.

Measured after conversion of the 2025 JSON release (the dictionary count drops
from the release's 184,353 senses as identical definitions and spellings that
clean to one headword merge):

| Feature | Headwords | Senses / relations | Raw | Gzipped |
|---|---|---|---|---|
| Dictionary | 126,595 | 184,307 senses | 20.9 MB | **5.71 MB** |
| Thesaurus | 123,673 | 648,541 relations | 21.4 MB | **3.58 MB** |

The old 70 MB source and the 34 MB WordNet 3.1 files are not committed; the generated shards are. A rebuild is a developer action documented in each README.

### D3. One set of word forms, shared by both features

`normalize`, `wordBounds`, `candidates`, and `MAX_WORD` move from `neo-ext/lib/thesaurus-lookup.js` into `neo-ext/lib/word-forms.js`. `thesaurus-lookup.js` imports and re-exports them so its public surface and every existing test stay unchanged; `dictionary-main.js` uses the same inflection ladder (possessives, plurals, past, participle, dropped-`e`, doubling). “Batches → batch” means the same in both windows.

### D4. One word context and one menu registration

Today the thesaurus owns a capture-phase `contextmenu` listener, a `pending` entry, and the `setContextWord`/`clearContextWord` calls; `neo-ext/main.js` inserts its native item. The dictionary must not add a second listener.

- `neo-ext/word-context.js` (renderer) owns the single capture listener. It resolves one word (or suppresses on a multi-word selection), remembers `{ word, range, before, selected }`, stores the word through the existing synchronous bridge, and clears it fire-and-forget on every miss. Its gate is generic: editable editor, Show More Features, English, one word. Feature-specific data availability is not part of capture; each menu item checks its own data.
- `neo-ext/word-context-main.js` owns the per-`webContents` word map, its 5-second TTL, the `neo-ext:context-word` handler, and `take(win)`.
- `neo-ext/main.js`'s seam 5 helper becomes a small registry: `contextMenu(items, params, win)` takes the word once, asks each registered feature for an item (`thesaurus-main.menuItem(word)`, `dictionary-main.menuItem(word)`), and inserts the present ones at the top followed by one separator. Order: Dictionary…, Thesaurus….
- `neo-ext/thesaurus.js` and the new `neo-ext/dictionary.js` both read the shared context and expose `openWord`/`lookUpMenu`; `boot.js` routes `dictionary` and `thesaurus` actions.
- The macOS Look Up seam stays two lines: append both items through `api.js`, and route the chosen value back.

The renderer gate no longer depends on a feature's data being ready, so a missing thesaurus no longer suppresses a working dictionary (and vice versa). Each main-process feature checks `status().available` before adding its item.

### D5. Dictionary and thesaurus main processes share the shard store

`neo-ext/dictionary-main.js` mirrors the thesaurus main process: manifest probe, shard load, lookup, menu item. The shard cache/gunzip/retry logic moves into `neo-ext/lib/shard-store.js` and both features use it (three-shard insertion-order cache, bounded gunzip, evicted failures).

- Dictionary IPC: `neo-ext:dictionary-status` and `neo-ext:dictionary` (word in, `{ ok, word, groups, count }` or `{ ok: false, reason }`).
- Dictionary groups are `{ pos, senses: [{ def, ex }] }`, part of speech in first-seen order.
- Thesaurus IPC and shapes stay as they are; only the data directory and manifest format change.
- Both use exact headword first, then the shared inflection ladder. An exact entry with nothing else is a miss, not a fallback.

### D6. Definition window

`neo-ext/dictionary-window.js`, a sibling of the thesaurus window rather than a generic modal: heading “N definitions for ‘word’”, part-of-speech headings, a definition paragraph, and example lines in quotes. It reuses the fork's modal classes and CSS, is `role="dialog"` with `aria-labelledby`, binds keys on `document` capture (Esc, Tab trap), closes on the backdrop, scrolls internally, and refuses to open while another backdrop is visible. It has no buttons that write; its only actions are close.

No filter: definitions are a short list attached to one headword, and a filter would add another control to a reading window. Long entries scroll.

### D7. No writes, no undo entries

The window holds no `Range` for replacement and calls no editor command. Opening and closing only moves focus; `chapterHTML`, `savedHTML`, undo/redo stacks, word counts, and sidecars are untouched. This is enforced by not passing the resolved range into the dictionary module at all.

### D8. Version checker counts archived ADRs

`neo-ext/lib/version.js` currently counts active and archived changes, so merely proposing adr-003 makes `npm test` demand `1.6.0+fork.3`. Change it to count **archived** ADRs only; the active change cannot claim a version it has not shipped. When adr-003 archives, bump to `1.6.0+fork.3` with the existing ritual.

### D9. Testing

- `scripts/oewn-build.test.js` — synset/entry parsing for both outputs, definitions without markers, the five relation classes, example cap, manifest counts, malformed input refused.
- `scripts/dictionary-data.test.js` / extended `scripts/thesaurus-data.test.js` — shards inflate, keys match letters, manifest counts and sizes, `batch` definitions and examples, `good` antonym `bad`, no `(` in any word, both licences present.
- `scripts/dictionary-lookup.test.js` — exact, inflected, possessive, missing, group order, warm timing.
- Shared `context-word`/menu tests — one stored word, two items in order, per-feature availability, one separator, TTL, Look Up append.
- Renderer `vm` tests — dictionary lookUpMenu appends without a replacement range; action opens the window; thesaurus path unchanged.
- Manual repro for scroll, Esc, focus, byte-for-byte unchanged manuscript, and thesaurus replacement after the data swap.

## Risks / Trade-offs

- **Data swap changes the synonym list writers saw yesterday** → expected; the window, counts, and relation labels stay the same, and the tests pin the new source's counts.
- **CC BY attribution is stricter than the WordNet notice** → both notices ship in each data directory and in `resources/licenses/`; the manifest names the edition and hashes; the README says the data was converted.
- **Refactor regressions in a shipped feature** → the thesaurus tests and a manual repro run before and after; shared modules keep the old exports.
- **Bundle growth** → about 9.2 MB of compressed lexical data total, replacing 4.3 MB. Shards load on demand; nothing at startup.
- **Offensive or dated content** → OEWN is the full record; nothing is filtered, and it is only shown after an explicit gesture.
- **Menu ordering and gating regressions** → registry test covers both features present/absent; capture no longer keys off data status.
- **Version drift** → archived-only checker plus the existing version test; bump is a release step recorded in `AGENTS.md`.
- **Examples can be long** (a batch sense carries seven) → capped at four per sense to keep rows readable, with the definition always kept.

## Migration Plan

Replace `neo-ext/thesaurus/en/` with the OEWN 2025 output and delete the MyThes converter. Books, library, and settings need no migration. Removing the change restores the old data directory and the adr-002 converter; the dictionary files are additive.

## Open Questions

- None blocking. Linking words inside definitions to another lookup is deliberately deferred.
