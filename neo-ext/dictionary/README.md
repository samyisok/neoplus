# English dictionary data (adr-003)

Bundled offline data for NEO's right-click **Dictionary…**. Nothing here is
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
  directory and again in `resources/licenses/oewn-dictionary/` so
  they are readable without opening the asar.
- The data has been **converted**: only the headword, part of speech,
  definition, and up to four recorded examples of each sense are kept; synset
  identifiers, examples beyond the fourth, and the entry/synset split are
  dropped.

## Layout

```
manifest.json       format, edition, source, hash, counts, sizes, schema
LICENSE.md          CC BY 4.0 attribution to the OEWN team and Princeton
WNDB_License.txt    the WordNet notice
shards/a.json.gz    headword → [{ pos, def, ex? }]
…                   one shard per first letter, a–z
```

Current numbers: 126,595 headwords, 184,307 senses, 26 shards, 5.71 MB
gzipped. `pos` is `noun`, `verb`, `adj`, or `adv`; `ex` is a list of at most
four example sentences. Definitions and examples are the source's text, without
added markup.

## Regenerating

Neither the 9.6 MB zip nor its 70 MB unpacked form is committed. Unpack the
release, then run:

```sh
node neo-ext/tools/build-oewn.js /path/to/english-wordnet-2025 \
  --license /path/to/oewn-licence-dir
```

The script rewrites `shards/` from scratch and updates `manifest.json`. It
writes the thesaurus directory in the same run, so both features always come
from one edition. Review the diff before committing.

## Content note

The data is the full WordNet vocabulary, so it includes archaic, informal,
regional, and offensive terms (including slurs). Nothing is filtered: a
dictionary is expected to be complete, and a word is only shown after an
explicit right-click.
