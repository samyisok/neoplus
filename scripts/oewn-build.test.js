// NEO fork — the OEWN converter reads the release without losing a word (adr-003)
//
// neo-ext/tools/build-oewn.js turns the unpacked Open English WordNet 2025
// release into the two committed data sets: definitions for the dictionary and
// synonyms for the thesaurus. It must never invent a definition, never leave a
// marker inside a word, and never guess at data it cannot read.

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const build = require('../neo-ext/tools/build-oewn.js');

// A release small enough to hold in the head: the shapes are the real ones.
function release() {
  return {
    synsets: {
      's1-n': {
        partOfSpeech: 'n',
        definition: ['all the loaves of bread baked at the same time'],
        example: ['a batch of letters', 'a deal of trouble', 'a lot of money', 'he made a mint', 'a fifth example'],
        members: ['batch', 'deal']
      },
      's2-n': {
        partOfSpeech: 'n',
        definition: ['(often followed by ‘of’) a large number or amount'],
        hypernym: ['h1-n'],
        similar: ['sim-n'],
        also: ['also-n'],
        members: ['batch', 'lot']
      },
      's3-v': { partOfSpeech: 'v', definition: ['to group things together'], members: ['batch'] },
      'h1-n': { partOfSpeech: 'n', definition: ['a group of things'], members: ['collection'] },
      'sim-n': { partOfSpeech: 'n', definition: ['a pile'], members: ['heap'] },
      'also-n': { partOfSpeech: 'n', definition: ['a portion'], members: ['bunch'] },
      'g1-a': { partOfSpeech: 'a', definition: ['having desirable qualities'], members: ['good'] },
      'g2-a': { partOfSpeech: 'a', definition: ['having bad qualities'], members: ['bad'] }
    },
    entries: {
      batch: {
        n: {
          sense: [
            { id: 'batch%1:14:00::', synset: 's1-n' },
            { id: 'batch%1:23:00::', synset: 's2-n' }
          ]
        },
        v: { sense: [{ id: 'batch%2:35:00::', synset: 's3-v' }] }
      },
      good: {
        a: {
          sense: [{ id: 'good%3:00:00::', synset: 'g1-a', antonym: ['bad%3:00:00::'] }]
        }
      },
      bad: { a: { sense: [{ id: 'bad%3:00:00::', synset: 'g2-a', antonym: ['good%3:00:00::'] }] } },
      deal: { n: { sense: [{ id: 'deal%1:14:00::', synset: 's1-n' }] } }
    }
  };
}

test('dictionary: a sense is its synset definition, plain and unmarked', () => {
  const { dictionary } = build.convert(release());
  const senses = dictionary.get('batch');
  assert.ok(Array.isArray(senses), 'batch has senses');
  assert.equal(senses[0].pos, 'noun');
  assert.equal(senses[0].def, 'all the loaves of bread baked at the same time');
  assert.ok(!/[()]/.test(senses[0].def), 'no marker carried into a definition');
  assert.equal(senses[1].def, '(often followed by ‘of’) a large number or amount');
  assert.equal(senses[2].pos, 'verb');
  assert.equal(senses[2].def, 'to group things together');
});

test('dictionary: examples are quoted sentences capped at four', () => {
  const { dictionary } = build.convert(release());
  const first = dictionary.get('batch')[0];
  assert.deepEqual(first.ex, ['a batch of letters', 'a deal of trouble', 'a lot of money', 'he made a mint']);
  assert.equal(dictionary.get('batch')[2].ex, undefined, 'a sense with no examples carries none');
});

test('dictionary: members of one synset share its definition once', () => {
  const { dictionary } = build.convert(release());
  assert.deepEqual(dictionary.get('deal'), [{ pos: 'noun', def: 'all the loaves of bread baked at the same time', ex: ['a batch of letters', 'a deal of trouble', 'a lot of money', 'he made a mint'] }]);
});

test('dictionary: headwords are lower-cased with underscores as spaces', () => {
  const data = release();
  data.synsets['s4-n'] = { partOfSpeech: 'n', definition: ['a hot drink'], members: ['ice_tea'] };
  data.entries.ice_tea = { n: { sense: [{ id: 'ice_tea%1:13:00::', synset: 's4-n' }] } };
  const { dictionary } = build.convert(data);
  assert.ok(dictionary.has('ice tea'));
  assert.ok(!dictionary.has('ice_tea'));
});

test('thesaurus: the five relation classes are recorded and never in the word', () => {
  const { thesaurus } = build.convert(release());
  const senses = thesaurus.get('batch');
  assert.ok(senses.every((s) => typeof s.pos === 'string' && s.syns.length), 'every sense keeps its part of speech');
  const rels = senses.flatMap((s) => s.syns);
  assert.ok(senses.some((s) => s.pos === 'noun'), 'the noun sense keeps its part of speech');
  const has = (w, rel) => rels.some((r) => r.w === w && r.rel === rel);
  assert.ok(has('deal', ''), 'another member of the same synset');
  assert.ok(has('collection', 'generic'), 'a direct hypernym’s member');
  assert.ok(has('heap', 'similar'), 'a similar link’s member');
  assert.ok(has('bunch', 'related'), 'an also link’s member');
  assert.ok(rels.every((r) => !/[()]/.test(r.w)), 'no marker inside a word');
  assert.ok(!rels.some((r) => r.w === 'batch'), 'the headword is never its own synonym');
});

test('thesaurus: a sense-level antonym resolves back to its headword', () => {
  const { thesaurus } = build.convert(release());
  const rels = (word) => thesaurus.get(word).flatMap((s) => s.syns).filter((r) => r.rel === 'antonym');
  assert.deepEqual(rels('good'), [{ w: 'bad', rel: 'antonym' }]);
  assert.deepEqual(rels('bad'), [{ w: 'good', rel: 'antonym' }]);
});

test('dictionary: two spellings that clean to one headword keep both sets of senses', () => {
  const data = release();
  data.synsets['gA-n'] = { partOfSpeech: 'n', definition: ['the deity of a monotheistic religion'], members: ['God'] };
  data.synsets['gB-n'] = { partOfSpeech: 'n', definition: ['a supernatural being'], members: ['god'] };
  data.entries.God = { n: { sense: [{ id: 'God%1:18:00::', synset: 'gA-n' }] } };
  data.entries.god = { n: { sense: [{ id: 'god%1:18:00::', synset: 'gB-n' }] } };
  const { dictionary } = build.convert(data);
  const defs = dictionary.get('god').map((s) => s.def);
  assert.ok(defs.includes('the deity of a monotheistic religion'), defs.join(' | '));
  assert.ok(defs.includes('a supernatural being'), defs.join(' | '));
});

test('a synset with no definition is skipped, not emitted empty', () => {
  const data = release();
  data.synsets['s5-n'] = { partOfSpeech: 'n', members: ['undefinable'] };
  data.entries.undefinable = { n: { sense: [{ id: 'undefinable%1:00:00::', synset: 's5-n' }] } };
  const { dictionary, thesaurus } = build.convert(data);
  assert.equal(dictionary.has('undefinable'), false);
  assert.equal(thesaurus.has('undefinable'), false);
});

test('malformed entries are refused, naming the word', () => {
  const synsets = { 's-n': { partOfSpeech: 'n', definition: ['a thing'], members: ['batch'] } };
  assert.throws(() => build.convert({ synsets, entries: { batch: { n: null } } }), /malformed entry "batch"/);
  assert.throws(() => build.convert({ synsets, entries: { batch: { n: { sense: [{}] } } } }), /malformed sense for "batch"/);
  assert.throws(() => build.convert({ entries: {} }), /release has no synsets/);
});

test('convert: a release with no entries is refused, not written empty', () => {
  assert.throws(() => build.convert({ synsets: { 's-n': { definition: ['x'], members: ['x'] } }, entries: {} }), /release has no entries/);
});

test('readRelease: a file that is not an object stops the build', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-oewn-'));
  try {
    fs.writeFileSync(path.join(dir, 'entries-a.json'), '[]');
    assert.throws(() => build.readRelease(dir), /malformed release file "entries-a\.json"/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeData: writes both shard sets, both manifests, and both notices', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const zlib = require('node:zlib');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-oewn-'));
  const dictionaryOut = path.join(dir, 'dictionary');
  const thesaurusOut = path.join(dir, 'thesaurus');
  const licence = path.join(dir, 'licence');
  fs.mkdirSync(licence);
  fs.writeFileSync(path.join(licence, 'LICENSE.md'), 'CC BY 4.0\n');
  fs.writeFileSync(path.join(licence, 'WNDB_License.txt'), 'WordNet\n');
  try {
    const report = build.writeData(release(), { dictionaryOut, thesaurusOut, license: licence, sha256: 'a'.repeat(64) });
    assert.equal(report.dictionary.headwords, 4);
    assert.equal(report.dictionary.senses, 6);
    assert.equal(report.thesaurus.headwords, 4);
    assert.equal(report.thesaurus.relations, 8);
    assert.equal(report.dictionary.shards, 3);
    assert.equal(report.thesaurus.shards, 3);
    const shard = path.join(dictionaryOut, 'shards', 'b.json.gz');
    assert.ok(fs.existsSync(shard));
    const inflated = JSON.parse(zlib.gunzipSync(fs.readFileSync(shard)).toString('utf8'));
    assert.ok(inflated.batch);
    for (const name of ['LICENSE.md', 'WNDB_License.txt']) {
      assert.ok(fs.existsSync(path.join(dictionaryOut, name)), `dictionary/${name}`);
      assert.ok(fs.existsSync(path.join(thesaurusOut, name)), `thesaurus/${name}`);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(dictionaryOut, 'manifest.json'), 'utf8'));
    assert.equal(manifest.format, 1);
    assert.equal(manifest.sha256, 'a'.repeat(64));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeData: a build without the licence notices is refused', () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-oewn-'));
  try {
    assert.throws(() => build.writeData(release(), {
      dictionaryOut: path.join(dir, 'dictionary'),
      thesaurusOut: path.join(dir, 'thesaurus'),
      license: ''
    }), /licence/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
