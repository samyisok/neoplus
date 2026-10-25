// NEO fork — thesaurus lookup rules (adr-002)
//
// Pure functions: word under the pointer, fallback forms, sense merging, case,
// apostrophes, filtering. The DOM and IPC wiring are tested elsewhere.

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const rules = require('../neo-ext/lib/thesaurus-lookup.js');

test('normalize: trims, lower-cases, folds curly apostrophes, drops wrapping punctuation', () => {
  assert.equal(rules.normalize('  Batch  '), 'batch');
  assert.equal(rules.normalize('“Batch,”'), 'batch');
  assert.equal(rules.normalize('writer’s'), "writer's");
  assert.equal(rules.normalize(''), '');
  assert.equal(rules.normalize(null), '');
});

test('wordBounds: expands across letters, joins, digits, and hyphens', () => {
  const text = 'I have a batch of berries.';
  assert.deepEqual(rules.wordBounds(text, text.indexOf('batch') + 2), { start: 9, end: 14, word: 'batch' });
  // a caret at the right edge of the word still resolves it
  assert.equal(rules.wordBounds(text, 14).word, 'batch');
  assert.equal(rules.wordBounds('a well-known fact', 7).word, 'well-known');
  assert.equal(rules.wordBounds('the 1990s were loud', 6).word, '1990s');
  assert.equal(rules.wordBounds("the writer's desk", 8).word, "writer's");
  assert.equal(rules.wordBounds('the writer’s desk', 8).word, 'writer’s');
  assert.equal(rules.wordBounds('“batch”', 2).word, 'batch');
});

test('wordBounds: no word on whitespace, punctuation, or outside the text', () => {
  assert.equal(rules.wordBounds('one  two', 4), null);
  assert.equal(rules.wordBounds('one.', 3), null);
  assert.equal(rules.wordBounds('', 0), null);
  assert.equal(rules.wordBounds('plain', 99), null);
});

test('candidates: exact form first, then possessive, plural, past, participle', () => {
  assert.deepEqual(rules.candidates('batch').slice(0, 1), ['batch']);
  assert.ok(rules.candidates('batches').includes('batch'));
  assert.ok(rules.candidates('batched').includes('batch'));
  assert.ok(rules.candidates('batching').includes('batch'));
  assert.ok(rules.candidates('batted').includes('bat'));
  assert.ok(rules.candidates('berries').includes('berry'));
  // the regular -s strip must come before the -es strip, or notes finds not
  assert.equal(rules.candidates('notes')[1], 'note');
  assert.equal(rules.candidates('uses')[1], 'use');
  assert.equal(rules.candidates('hopes')[1], 'hope');
  assert.equal(rules.candidates('wines')[1], 'wine');
  assert.ok(rules.candidates('goes').includes('go'));
  assert.ok(rules.candidates('does').includes('do'));
  assert.ok(rules.candidates('boxes').includes('box'));
  assert.ok(rules.candidates('knives').includes('knife'));
  // a dropped e must be tried before the bare stem, or hoping looks up hop
  assert.equal(rules.candidates('hoping')[1], 'hope');
  assert.equal(rules.candidates('hoped')[1], 'hope');
  assert.equal(rules.candidates('baked')[1], 'bake');
  assert.equal(rules.candidates('baking')[1], 'bake');
  assert.ok(rules.candidates('writer’s').includes("writer's"));
  assert.ok(rules.candidates("writer's").includes('writer'));
  assert.equal(rules.candidates('xyzzy')[0], 'xyzzy');
});

test('shardFor: only a–z words have a shard', () => {
  assert.equal(rules.shardFor('Batch'), 'b');
  assert.equal(rules.shardFor("writer's"), 'w');
  assert.equal(rules.shardFor('1990s'), '');
  assert.equal(rules.shardFor(''), '');
});

test('mergeSenses: merges by part of speech, keeps order, never offers the word', () => {
  const entry = [
    { pos: 'noun', syns: ['collection', 'aggregation'] },
    { pos: 'noun', syns: ['deal', 'lot', 'Collection'] },
    { pos: 'verb', syns: ['group', 'batch', 'Group'] }
  ];
  const merged = rules.mergeSenses(entry, 'batch');
  assert.deepEqual(merged.groups, [
    { pos: 'noun', rel: '', syns: ['collection', 'aggregation', 'deal', 'lot'] },
    { pos: 'verb', rel: '', syns: ['group'] }
  ]);
  assert.equal(merged.count, 5);
});

test('mergeSenses: relations are grouped and plain synonyms come first', () => {
  const entry = [
    { pos: 'adj', syns: [
      { w: 'a priori', rel: 'antonym' },
      { w: 'inductive', rel: 'related' },
      { w: 'theoretical', rel: 'similar' },
      { w: 'analytic', rel: '' }
    ] },
    { pos: 'adj', syns: [{ w: 'logical', rel: '' }] }
  ];
  const merged = rules.mergeSenses(entry, 'a posteriori');
  assert.deepEqual(merged.groups, [
    { pos: 'adj', rel: '', syns: ['analytic', 'logical'] },
    { pos: 'adj', rel: 'similar', syns: ['theoretical'] },
    { pos: 'adj', rel: 'related', syns: ['inductive'] },
    { pos: 'adj', rel: 'antonym', syns: ['a priori'] }
  ]);
  assert.equal(merged.count, 5);
});

test('mergeSenses: an entry with no other words counts zero', () => {
  const merged = rules.mergeSenses([{ pos: 'noun', syns: ['batch'] }], 'batch');
  assert.deepEqual(merged.groups, []);
  assert.equal(merged.count, 0);
});

test('applyCase: follows the clicked word', () => {
  assert.equal(rules.applyCase('pile', 'Batch'), 'Pile');
  assert.equal(rules.applyCase('pile', 'BATCH'), 'PILE');
  assert.equal(rules.applyCase('pile', 'batch'), 'pile');
  assert.equal(rules.applyCase('good deal', 'Batch'), 'Good deal');
  assert.equal(rules.applyCase('me', 'I'), 'me');
});

test('smartApostrophes: straight marks become typographic', () => {
  assert.equal(rules.smartApostrophes("baker's dozen"), 'baker’s dozen');
  assert.equal(rules.smartApostrophes('plain'), 'plain');
});

test('filterSynonyms: case-insensitive substring, empty groups dropped', () => {
  const groups = [
    { pos: 'noun', rel: '', syns: ['pile', 'heap', 'stack'] },
    { pos: 'adj', rel: 'antonym', syns: ['bad', 'poor'] },
    { pos: 'verb', rel: '', syns: ['group', 'arrange'] }
  ];
  assert.deepEqual(rules.filterSynonyms(groups, 'p'), [
    { pos: 'noun', rel: '', syns: ['pile', 'heap'] },
    { pos: 'adj', rel: 'antonym', syns: ['poor'] },
    { pos: 'verb', rel: '', syns: ['group'] }
  ]);
  assert.deepEqual(rules.filterSynonyms(groups, 'zzz'), []);
  assert.deepEqual(rules.filterSynonyms(groups, '  '), groups);
});
