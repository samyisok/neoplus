# Proposal

## Why

A writer checks a word's meaning mid-sentence, and NEO can only offer synonyms. Leaving the page for a browser dictionary breaks the writing state, and an internet lookup is not always there. NEO already ships its own English lexical data offline; a dictionary is the other half of that promise.

The data underneath both features also needs a decision: Princeton's WordNet project has stopped active development (its site now points to community efforts), while the Open English WordNet publishes a maintained edition every year. This change moves the fork's lexical data to **OEWN 2025** and adds the dictionary on top of it, so the thesaurus and the dictionary share one current source, one conversion pipeline, and one licence story.

## What Changes

- **Dictionary… in the right-click menu.** Right-clicking a single word in an editable chapter, notes page, or footnote adds **Dictionary…** beside **Thesaurus…**. Both items follow the same gates: Show More Features on, NEO's spellcheck language English, the feature's data readable. On macOS both also join NEO's Look Up menu.
- **A definition window, display only.** The window names the word and how many definitions it has, then lists each sense under its part of speech with its definition and, where OEWN records them, usage examples in quotes. It scrolls for long entries. Esc, the close control, or a click outside closes it.
- **No manuscript write.** Unlike the thesaurus, Dictionary never replaces, inserts, or edits anything. Closing it leaves the page exactly as it was, caret included.
- **The Thesaurus moves to OEWN 2025.** Its windows, gates, replacement rules, and undo behaviour stay exactly as they are; only the bundled data and its attribution change. Synonyms come from synset members, broader terms from direct hypernyms, similar terms from the synset's `similar` links, related terms from `also`, and antonyms from the sense-level antonym links. Relation labels stay in the UI, never in the word.
- **Bundled offline data.** Definitions and synonyms are converted once from the OEWN 2025 JSON release into sharded, gzipped JSON. The CC BY 4.0 attribution to the Open English WordNet team and Princeton University, plus the WordNet notice, ship with the data and in packaged builds. No network call at runtime.
- **Shared word resolution, one menu seam.** The existing right-click machinery is lifted into one shared module: one capture listener, one synchronous word hand-off, one place that builds the pair of menu items. The Thesaurus keeps its behaviour and gains the shared path rather than a second listener.
- **Fork version.** Archiving this change raises the fork number to `1.6.0+fork.3`; the checker learns to count archived ADRs only, so an in-progress change does not claim a version it has not shipped.

### Source research

| Candidate | Verdict |
|---|---|
| **Open English WordNet 2025** (2025 edition, released 31 December 2025) | **Chosen.** Actively maintained fork of Princeton WordNet, annual releases, CC BY 4.0 plus the WordNet notice. One source serves both features: 126,595 dictionary headwords / 184,307 senses (5.71 MB gz) and 123,673 thesaurus headwords / 648,541 relations (3.58 MB gz). |
| Princeton WordNet 3.1 | Frozen since 2011; the project is no longer developed and its site points readers to community editions. Permissive and stable, but a dead end for a maintained app. |
| Webster's 1913 | Public domain, but 28.9 MB of dated prose and an older, rougher conversion. |
| GCIDE | **Rejected**: GPL data in an MIT application is an avoidable licence obligation. |

OEWN's licence requires attribution to both Princeton WordNet and the Open English WordNet team and an indication that the data was converted; the app carries both notices and a manifest naming the release and its hash.

## Capabilities

### New Capabilities

- `dictionary`: looking up offline English definitions for a word in the open book and presenting its senses without touching the manuscript.

### Modified Capabilities

- `thesaurus`: its bundled data moves to the OEWN 2025 edition with the corresponding attribution; lookup, windows, replacement, and undo requirements keep their behaviour.

## Impact

- New: `neo-ext/dictionary.js`, `neo-ext/dictionary-window.js`, `neo-ext/dictionary-main.js`, `neo-ext/tools/build-dictionary.js`, `neo-ext/dictionary/en/` data + licence, tests.
- Replaced data: `neo-ext/thesaurus/en/` and `neo-ext/tools/build-thesaurus.js` regenerate from OEWN; the thesaurus UI code only changes where it reads the shared modules.
- Shared refactor: word resolution, word forms, shard loading, and menu-item registration leave `neo-ext/thesaurus.js` / `neo-ext/thesaurus-main.js` for shared modules; one marked seam stays in `main.js`, one in `app.js`.
- `preload.js`, `neo-ext/api.js`, `neo-ext/boot.js`, `index.html` gain the dictionary's bridge and script.
- Packaged app grows by about 9.2 MB of compressed data in total, replacing the current 4.3 MB thesaurus with 5.71 MB of definitions and 3.58 MB of synonyms.
- `package.json` reaches `1.6.0+fork.3` at archive time; the version checker counts archived ADRs.
