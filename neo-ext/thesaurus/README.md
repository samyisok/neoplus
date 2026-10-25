# English thesaurus data (adr-002, source moved to OEWN in adr-003)

Bundled offline data for NEO's right-click **Thesaurus…**. Nothing here is
read from the network at runtime.

## Provenance

- Source: the **Open English WordNet 2025** JSON edition, asset
  `english-wordnet-2025-json.zip`, tag `2025-edition`, from
  [`globalwordnet/english-wordnet`](https://github.com/globalwordnet/english-wordnet/releases/tag/2025-edition).
- Source SHA-256: `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`
  (9,986,555 bytes).
- The Open English WordNet is derived from Princeton WordNet and developed
  further by the Open English WordNet team.
- Licence: Creative Commons Attribution 4.0 International for the Open English
  WordNet team's work, plus the WordNet notice for the underlying database.
  Both are reproduced verbatim in `LICENSE.md` and `WNDB_License.txt` in this
  directory and again in `resources/licenses/oewn-thesaurus/` so
  they are readable without opening the asar.
- The data has been **converted**: synonyms are a synset's other members,
  broader terms come from direct hypernyms, similar terms from `similar`
  links, related terms from `also` links, and antonyms from the sense-level
  antonym links. The marker words the old MyThes file carried are not in this
  data; the relation lives in `rel` and never in the word.

## Layout

```
manifest.json       format 3, edition, source, hash, counts, sizes, schema
LICENSE.md          CC BY 4.0 attribution to the OEWN team and Princeton
WNDB_License.txt    the WordNet notice
shards/a.json.gz    headword → [{ pos, syns: [{ w, rel }] }]
…                   one shard per first letter, a–z
```

Current numbers: 123,673 headwords, 648,541 relations, 26 shards, 3.58 MB
gzipped. `rel` is `''` for another member of the same synset, or `generic`,
`similar`, `related`, or `antonym`. The shard shape is still format 2; the
manifest moved to format 3 to mark the source change.

## Regenerating

The converter writes this directory and the dictionary's in one run:

```sh
node neo-ext/tools/build-oewn.js /path/to/english-wordnet-2025 \
  --license /path/to/oewn-licence-dir
```

It rewrites `shards/` from scratch and updates `manifest.json`. Review the diff
before committing.

## Content note

The data is the full WordNet vocabulary, so it includes archaic, informal,
regional, and offensive terms (including slurs). Nothing is filtered: a
writer's thesaurus is expected to be complete, and a word is only shown after
an explicit right-click.
