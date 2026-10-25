# English thesaurus data (adr-002)

Bundled offline data for NEO's right-click **Thesaurus…**. Nothing here is
read from the network at runtime.

## Provenance

- Source: LibreOffice's `en_US` MyThes file, `th_en_US_v2.dat`, from
  [`LibreOffice/dictionaries`](https://github.com/LibreOffice/dictionaries),
  pinned at commit `2f0ddaeeb4323ac99afd35d2c4fda643c9ee8bcf`.
- The file is derived from Princeton WordNet Release 2.1.
- Source SHA-256: `8a3e4637450b7277428da248f0a604b5c92942bc30507220c051181462340f39`
- License: the WordNet license, reproduced verbatim in `WordNet_license.txt`.
  It permits use, copy, modify, and distribution provided the copyright
  notice and disclaimer accompany every copy. The file ships with the app: `neo-ext/` carries it,
  and the build also copies it to `resources/licenses/wordnet/` so it is
  readable without opening the asar.

## Layout

```
manifest.json         format version, source, commit, hashes, counts
WordNet_license.txt   the notice that must travel with every copy
shards/a.json.gz      headword → [{ pos, syns: [{ w, rel }] }]
…                     one shard per first letter, a–z
```

Current numbers: 144,863 headwords, 793,623 words, 26 shards,
4.26 MB gzipped. Each word keeps the source's relation (`generic`, `similar`,
`related`, `antonym`) so the window can label it; the word itself never carries
the marker.

## Regenerating

The 18 MB source file is not committed. Put a copy somewhere and run:

```sh
node neo-ext/tools/build-thesaurus.js /path/to/th_en_US_v2.dat \
  --sha256 8a3e4637450b7277428da248f0a604b5c92942bc30507220c051181462340f39 \
  --license /path/to/WordNet_license.txt
```

The script refuses a source whose hash differs, rewrites `shards/` from
scratch, and updates `manifest.json`. Review the diff before committing.

## Content note

The data is the full WordNet vocabulary, so it includes archaic, informal,
regional, and offensive terms (including slurs). Nothing is filtered: a
writer's thesaurus is expected to be complete, and a word is only shown after
an explicit right-click.
