#!/usr/bin/env node
// NEO fork — build the offline dictionary and thesaurus (adr-003)
//
// Reads the unpacked Open English WordNet 2025 release (one JSON file per
// synset domain plus entries-*.json) and writes two gzipped shard sets: the
// senses for the dictionary and the synonyms for the thesaurus. Run by hand
// when a new edition is adopted; the output is reviewed and committed.
//
//   node neo-ext/tools/build-oewn.js <release dir> [--sha256 <hex>]
//        [--dictionary-out <dir>] [--thesaurus-out <dir>] [--license <dir>]
//
// The release is published as english-wordnet-2025-json.zip on
// github.com/globalwordnet/english-wordnet, tag 2025-edition. The data is
// derived from Princeton WordNet (WordNet licence) and developed further by
// the Open English WordNet team (CC BY 4.0); both notices are copied beside
// the shards.

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const { HEADWORD } = require('../lib/word-forms.js');

const EDITION = '2025';
const SOURCE = 'https://github.com/globalwordnet/english-wordnet/releases/download/2025-edition/english-wordnet-2025-json.zip';
const DEFAULT_SHA = '7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51';
const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_DICTIONARY_OUT = path.join(ROOT, 'neo-ext', 'dictionary', 'en');
const DEFAULT_THESAURUS_OUT = path.join(ROOT, 'neo-ext', 'thesaurus', 'en');
const POS = { n: 'noun', v: 'verb', a: 'adj', s: 'adj', r: 'adv' };
const MAX_EXAMPLES = 4;
const LICENCES = ['LICENSE.md', 'WNDB_License.txt'];

function args() {
  const opts = { _: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else opts._.push(argv[i]);
  }
  return opts;
}

const OPTIONS = args();

function arg(name, fallback) {
  const key = name.replace(/^--/, '');
  return Object.prototype.hasOwnProperty.call(OPTIONS, key) ? OPTIONS[key] : fallback;
}

function source() {
  return OPTIONS._[0] || '';
}

// OEWN writes multiword lemmas with underscores and keeps the original case.
function clean(word) {
  return String(word == null ? '' : word).replace(/_/g, ' ').trim().toLowerCase();
}

function posOf(key, synset) {
  const bare = String(key || '').replace(/-\d+$/, '');
  return POS[bare] || POS[synset && synset.partOfSpeech] || 'noun';
}

// Prototype keys in a release file must become data, not behaviour.
const SAFE_KEY = (key) => key !== '__proto__' && key !== 'constructor' && key !== 'prototype';

function readRelease(dir) {
  const synsets = Object.create(null);
  const entries = Object.create(null);
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith('.json')) continue;
    const data = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error(`malformed release file "${name}"`);
    const into = name.startsWith('entries-') ? entries : synsets;
    for (const [key, value] of Object.entries(data)) if (SAFE_KEY(key)) into[key] = value;
  }
  if (!Object.keys(synsets).length) throw new Error('release has no synsets');
  if (!Object.keys(entries).length) throw new Error('release has no entries');
  return { synsets, entries };
}

// One pass over the entries validates the shapes and remembers which headword
// owns each sense id, because an antonym is recorded on the sense, not the
// synset, and points at another word's sense.
function scan(release) {
  const synsets = release && release.synsets;
  const entries = release && release.entries;
  if (!synsets || typeof synsets !== 'object' || !Object.keys(synsets).length) throw new Error('release has no synsets');
  if (!entries || typeof entries !== 'object' || !Object.keys(entries).length) throw new Error('release has no entries');

  const senseWord = new Map();
  const words = [];
  for (const [rawWord, poses] of Object.entries(entries)) {
    if (!poses || typeof poses !== 'object' || Array.isArray(poses)) throw new Error(`malformed entry "${rawWord}"`);
    const head = clean(rawWord);
    const senses = [];
    for (const [rawPos, group] of Object.entries(poses)) {
      if (!group || typeof group !== 'object' || Array.isArray(group)) throw new Error(`malformed entry "${rawWord}"`);
      if (group.sense !== undefined && !Array.isArray(group.sense)) throw new Error(`malformed sense for "${rawWord}"`);
      for (const sense of group.sense || []) {
        if (!sense || typeof sense !== 'object' || typeof sense.synset !== 'string' || !sense.synset) {
          throw new Error(`malformed sense for "${rawWord}"`);
        }
        senses.push({ pos: rawPos, sense });
        if (typeof sense.id === 'string' && !senseWord.has(sense.id)) senseWord.set(sense.id, head);
      }
    }
    words.push({ head, senses });
  }
  return { synsets, senseWord, words };
}

function members(synsets, id) {
  const synset = synsets[id];
  return synset && Array.isArray(synset.members) ? synset.members : [];
}

function convert(release) {
  const { synsets, senseWord, words } = scan(release);
  const dictionary = new Map();
  const thesaurus = new Map();

  for (const { head, senses } of words) {
    if (!HEADWORD.test(head)) continue;

    const defs = [];
    const seenDef = new Set();
    for (const { pos, sense } of senses) {
      const synset = synsets[sense.synset];
      if (!synset) continue;
      const def = Array.isArray(synset.definition) ? synset.definition[0] : '';
      if (typeof def !== 'string' || !def.trim()) continue;
      const part = posOf(pos, synset);
      const key = part + '\u0000' + def;
      if (seenDef.has(key)) continue;
      seenDef.add(key);
      const examples = (Array.isArray(synset.example) ? synset.example : [])
        .filter((text) => typeof text === 'string' && text.trim())
        .slice(0, MAX_EXAMPLES);
      const entry = { pos: part, def };
      if (examples.length) entry.ex = examples;
      defs.push(entry);
    }
    if (defs.length) {
      // "God" and "god" clean to one headword; both sets of senses belong to it
      const prior = dictionary.get(head) || [];
      const extra = defs.filter((d) => !prior.some((p) => p.pos === d.pos && p.def === d.def));
      if (extra.length) dictionary.set(head, prior.concat(extra));
    }

    const rels = [];
    const seenWord = new Set();
    let group = null;
    const add = (word, rel) => {
      const w = clean(word);
      if (!HEADWORD.test(w) || w === head || seenWord.has(w)) return;
      seenWord.add(w);
      group.syns.push({ w, rel });
    };
    for (const { pos, sense } of senses) {
      const synset = synsets[sense.synset];
      if (!synset) continue;
      group = { pos: posOf(pos, synset), syns: [] };
      for (const member of synset.members || []) add(member, '');
      for (const id of synset.hypernym || []) for (const member of members(synsets, id)) add(member, 'generic');
      for (const id of synset.similar || []) for (const member of members(synsets, id)) add(member, 'similar');
      for (const id of synset.also || []) for (const member of members(synsets, id)) add(member, 'related');
      for (const id of sense.antonym || []) if (senseWord.has(id)) add(senseWord.get(id), 'antonym');
      if (group.syns.length) rels.push(group);
    }
    if (rels.length) {
      const merged = (thesaurus.get(head) || []).concat(rels);
      const seen = new Set();
      for (const group of merged) {
        group.syns = group.syns.filter((s) => {
          if (seen.has(s.w)) return false;
          seen.add(s.w);
          return true;
        });
      }
      const kept = merged.filter((group) => group.syns.length);
      if (kept.length) thesaurus.set(head, kept);
    }
  }

  return { dictionary, thesaurus };
}

function shards(map) {
  const byLetter = new Map();
  for (const head of [...map.keys()].sort()) {
    const letter = head[0];
    if (!letter || letter < 'a' || letter > 'z') continue;
    if (!byLetter.has(letter)) byLetter.set(letter, {});
    byLetter.get(letter)[head] = map.get(head);
  }
  return byLetter;
}

function writeShards(map, out) {
  const byLetter = shards(map);
  const dir = path.join(out, 'shards');
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  let gzBytes = 0;
  for (const [letter, entries] of [...byLetter].sort()) {
    const gz = zlib.gzipSync(Buffer.from(JSON.stringify(entries)), { level: 9 });
    fs.writeFileSync(path.join(dir, `${letter}.json.gz`), gz);
    gzBytes += gz.length;
  }
  return { shards: byLetter.size, gzBytes };
}

// Both notices are the licence: a build without them ships unattributed data.
function copyLicences(from, out) {
  if (!from) throw new Error('a licence directory is required; both notices must travel with the data');
  for (const name of LICENCES) {
    const file = path.join(from, name);
    if (!fs.existsSync(file)) throw new Error(`licence file not found: ${file}`);
    fs.copyFileSync(file, path.join(out, name));
  }
}

function total(map) {
  let count = 0;
  for (const list of map.values()) count += list.length;
  return count;
}

function totalSyns(map) {
  let count = 0;
  for (const groups of map.values()) for (const group of groups) count += group.syns.length;
  return count;
}

function writeData(release, opts) {
  const options = opts || {};
  const sha256 = String(options.sha256 || DEFAULT_SHA).toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('sha256 must be the 64 hex characters of the release zip');
  if (!options.license) throw new Error('a licence directory is required; both notices must travel with the data');
  const dictionaryOut = options.dictionaryOut || DEFAULT_DICTIONARY_OUT;
  const thesaurusOut = options.thesaurusOut || DEFAULT_THESAURUS_OUT;
  const { dictionary, thesaurus } = convert(release);

  fs.mkdirSync(dictionaryOut, { recursive: true });
  fs.mkdirSync(thesaurusOut, { recursive: true });
  const dictSize = writeShards(dictionary, dictionaryOut);
  const thesSize = writeShards(thesaurus, thesaurusOut);

  const dictionaryManifest = {
    format: 1,
    language: 'en',
    edition: EDITION,
    source: SOURCE,
    sha256,
    headwords: dictionary.size,
    senses: total(dictionary),
    shards: dictSize.shards,
    gzBytes: dictSize.gzBytes,
    schema: { entry: 'headword -> [{ pos, def, ex? }]', pos: ['noun', 'verb', 'adj', 'adv'], examples: MAX_EXAMPLES }
  };
  const thesaurusManifest = {
    format: 3,
    language: 'en',
    edition: EDITION,
    source: SOURCE,
    sha256,
    headwords: thesaurus.size,
    relations: totalSyns(thesaurus),
    shards: thesSize.shards,
    gzBytes: thesSize.gzBytes,
    schema: { shard: 2, entry: '[{ pos, syns: [{ w, rel }] }]', rel: ['', 'generic', 'similar', 'related', 'antonym'] }
  };

  fs.writeFileSync(path.join(dictionaryOut, 'manifest.json'), JSON.stringify(dictionaryManifest, null, 2) + '\n');
  fs.writeFileSync(path.join(thesaurusOut, 'manifest.json'), JSON.stringify(thesaurusManifest, null, 2) + '\n');
  copyLicences(options.license, dictionaryOut);
  copyLicences(options.license, thesaurusOut);

  return { dictionary: dictionaryManifest, thesaurus: thesaurusManifest };
}

function main() {
  const dir = source();
  if (!dir || !fs.existsSync(dir)) {
    console.error('usage: node neo-ext/tools/build-oewn.js <release dir> [--sha256 <hex>] [--dictionary-out <dir>] [--thesaurus-out <dir>] [--license <dir>]');
    process.exit(2);
  }
  const report = writeData(readRelease(dir), {
    sha256: arg('--sha256', DEFAULT_SHA),
    dictionaryOut: arg('--dictionary-out', DEFAULT_DICTIONARY_OUT),
    thesaurusOut: arg('--thesaurus-out', DEFAULT_THESAURUS_OUT),
    license: arg('--license', '')
  });
  const mb = (bytes) => (bytes / 1048576).toFixed(2);
  console.log(`dictionary: ${report.dictionary.headwords} headwords, ${report.dictionary.senses} senses, ${report.dictionary.shards} shards, ${mb(report.dictionary.gzBytes)} MB gzipped`);
  console.log(`thesaurus: ${report.thesaurus.headwords} headwords, ${report.thesaurus.relations} relations, ${report.thesaurus.shards} shards, ${mb(report.thesaurus.gzBytes)} MB gzipped`);
}

if (require.main === module) main();

module.exports = { convert, readRelease, shards, writeData, clean, HEADWORD, POS, MAX_EXAMPLES, DEFAULT_SHA };
