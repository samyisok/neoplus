# Proposal

## Why

A writer reaches for a better word while the sentence is still open, and NEO has no thesaurus. Every alternative today leaves the page: a browser tab, a system dictionary, an internet connection. NEO is offline-first and dependency-light, so the synonyms have to ship with the app, work with no network, and never disturb the manuscript unless the writer picks a word.

## What Changes

- **Thesaurus in the right-click menu.** Right-clicking a word in the manuscript or the notes page adds **Thesaurus…** to NEO's context menu. It appears only when a single word sits under the pointer, NEO's spellcheck language is English, the bundled data is readable, and Show More Features is on. Cut/copy/paste, the screenplay page break, and the spellcheck menu keep working as they do now. On macOS the same choice joins NEO's Look Up menu for a selected word.
- **A synonym window, grouped by sense.** The window names the word and the number of distinct synonyms found, then lists them under their part of speech, with a filter box for large sets. Picking a word replaces the clicked word in place, closes the window, and leaves one undo step (⌘Z brings the original word back). Before changing anything it checks that the remembered position still holds the clicked word, so a chapter adopted from another device cannot be edited in the wrong place. Esc, the close button, or a click outside closes the window and changes nothing.
- **Bundled offline data.** English synonyms come from the LibreOffice `en_US` thesaurus (`th_en_US_v2.dat`), derived from Princeton WordNet 2.1. It is converted once into sharded, gzipped JSON committed under `neo-ext/thesaurus/en/`; the app reads a shard from disk only when a word is looked up. The WordNet license and attribution ship beside the data and are included in packaged builds.
- **Lookup rules.** Exact headword first, then a case-insensitive match, then a conservative inflection fallback (`batches`, `batched`, `batching` → `batch`). The clicked word's capitalisation is carried onto the replacement. A word with no entry shows a short toast instead of an empty window.
- **English only, desktop only.** Other spellcheck languages show no Thesaurus item; Pocket does not get the feature.
- Nothing is written to `book.json`, `library.json`, or any chapter beyond the one word the writer chooses.

### Source research

| Candidate | Verdict |
|---|---|
| LibreOffice `en_US` thesaurus (WordNet 2.1) | **Chosen.** WordNet license: use, copy, modify, distribute permitted with the copyright notice and disclaimer on all copies; MIT-compatible. 144,863 headwords, senses, parts of speech, and relation markers already grouped, 18 MB source → 4.26 MB gzipped in 26 shards. Its `batch` entry contains the `mickle`, `muckle`, `large indefinite quantity` terms the example expects. |
| Open English WordNet (CC BY 4.0 + WordNet) | Viable, but a larger conversion job for the same WordNet shape; no need for the extra attribution surface. |
| Moby Thesaurus II (public domain) | Long flat lists (avg 83 per root), but no senses and no maintained canonical download; only archived mirrors. |
| OpenThesaurus | Rejected: German-only data, and CC BY-SA / LGPL terms would reach into a bundled data file. |

## Capabilities

### New Capabilities

- `thesaurus`: looking up English synonyms for a word in the open book, presenting them grouped by sense, and replacing the word with the chosen synonym as one undoable edit.

### Modified Capabilities

<!-- none: backup and settings requirements are unchanged -->

## Impact

- New: `neo-ext/thesaurus.js` (renderer modal and replacement), `neo-ext/thesaurus-lookup.js` / main-process lookup, `neo-ext/thesaurus/en/` (converted data + license), a build-time conversion script, tests.
- Upstream files gain only marked seams: one line in the `main.js` `context-menu` handler (seam 5), two lines in `app.js`'s macOS Look Up listener (seam 10), the new methods inside the existing `NeoForkNative` preload block, and three script tags in `index.html`.
- No new runtime dependency, no network call, no storage in the library. Packaged builds grow by the data files; the existing `files: ["**/*"]` rule already includes `neo-ext/`.
- Pocket's fixed copy list is unchanged, so the feature stays desktop-only.
