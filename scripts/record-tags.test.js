// NEO fork — record tags and their scanner (adr-006)
//
// Pure: tag keys, stamped additions/removals, and one paragraph scan.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const tags = require('../neo-ext/lib/record-tags.js');

test('record-tags: a key trims, collapses spaces, and ignores case', () => {
  assert.equal(tags.tagKey('  Long   Chen '), 'long chen');
  assert.equal(tags.normalizeTag('  Long   Chen '), 'Long Chen');
  assert.equal(tags.tagKey('LONG CHEN'), tags.tagKey('long chen'));
});

test('record-tags: only active tags are returned', () => {
  const rec = { tags: [
    { text: 'Long Chen', at: 1, removedAt: 0 },
    { text: 'Old', at: 1, removedAt: 2 }
  ] };
  assert.deepEqual(tags.activeTags(rec), ['Long Chen']);
  assert.deepEqual(tags.activeTags({}), []);
});

test('record-tags: a matcher finds whole phrases, not prefixes of names', () => {
  const matcher = tags.buildMatcher(['Long Chen', 'Chen']);
  assert.deepEqual(matcher.ranges('Long Chen met Chen.'), [
    { start: 0, end: 9, tag: 'Long Chen' },
    { start: 14, end: 18, tag: 'Chen' }
  ]);
  assert.deepEqual(matcher.ranges('Long Cheney'), []);
});

test('record-tags: matching is case-insensitive and handles accents/non-Latin', () => {
  const matcher = tags.buildMatcher(['José', 'Москва', '李']);
  assert.equal(matcher.ranges('JOSÉ in Москва and 李').length, 3);
});

test('record-tags: tags do not match across a paragraph boundary by construction', () => {
  const matcher = tags.buildMatcher(['Long Chen']);
  assert.deepEqual(matcher.ranges('Long'), []);
  assert.deepEqual(matcher.ranges('Chen'), []);
});

test('record-tags: overlapping tags are non-overlapping and longest wins', () => {
  const matcher = tags.buildMatcher(['Ice Metal', 'Metal Core', 'Ice']);
  assert.deepEqual(matcher.ranges('Ice Metal Core').map((r) => r.tag), ['Ice Metal']);
});

test('record-tags: the range cap applies across a scan', () => {
  const matcher = tags.buildMatcher(['a']);
  const found = matcher.ranges('a '.repeat(3000), 100);
  assert.equal(found.length, 100);
});

test('record-tags: a 100k-word page scans without pathological cost', () => {
  const matcher = tags.buildMatcher(['Long Chen', 'Silver', 'North Continent']);
  const text = ('word Long Chen silver word north continent '.repeat(12000)).slice(0, 600000);
  const started = Date.now();
  const found = matcher.ranges(text);
  assert.ok(found.length > 0);
  assert.ok(Date.now() - started < 150, `scan took ${Date.now() - started}ms`);
});

test('record-tags: one vocabulary maps has-tag to an action and back', () => {
  assert.equal(tags.tagAction(false), 'record-create');
  assert.equal(tags.tagAction(true), 'record-find');
  assert.equal(tags.tagMode('record-create'), 'create');
  assert.equal(tags.tagMode('record-find'), 'find');
  assert.equal(tags.tagMode('dictionary'), '');
});

test('record-tags: a selected phrase and a tag share one 120-character bound', () => {
  assert.equal(tags.MAX_PHRASE, tags.MAX_TAG);
  assert.equal(tags.MAX_TAG, 120);
});
