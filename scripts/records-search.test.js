// NEO fork — quick search over record titles and descriptions (adr-005)
//
// Pure: lower-cased matching and offsets, so the highlight can be painted
// without touching the text.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const search = require('../neo-ext/lib/records-search.js');

test('records-search: the query is trimmed and lower-cased', () => {
  assert.equal(search.normalizeQuery('  Silver  '), 'silver');
  assert.equal(search.normalizeQuery(''), '');
  assert.equal(search.normalizeQuery('   '), '');
});

test('records-search: matches title or body, ignoring case', () => {
  assert.equal(search.test('John Silver', 'a parrot', 'silver'), true);
  assert.equal(search.test('John Silver', 'a parrot', 'PARROT'), true);
  assert.equal(search.test('John Silver', 'a parrot', 'leg'), false);
  assert.equal(search.test('John Silver', 'a parrot', ''), true);
});

test('records-search: every occurrence becomes a range', () => {
  assert.deepEqual(search.ranges('Silver and silver', 'silver'), [{ start: 0, end: 6 }, { start: 11, end: 17 }]);
});

test('records-search: ranges do not overlap', () => {
  assert.deepEqual(search.ranges('aaaa', 'aa'), [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
});

test('records-search: a query with no match has no ranges', () => {
  assert.deepEqual(search.ranges('John Silver', 'xyzzy'), []);
  assert.deepEqual(search.ranges('John Silver', ''), []);
  assert.deepEqual(search.ranges('', 'silver'), []);
});

test('records-search: a title match and a body match are told apart', () => {
  assert.deepEqual(search.matches({ title: 'John Silver', body: 'a parrot' }, 'silver'), { title: true, body: false, tags: false });
  assert.deepEqual(search.matches({ title: 'John Silver', body: 'a parrot' }, 'parrot'), { title: false, body: true, tags: false });
  assert.deepEqual(search.matches({ title: 'John Silver', body: 'a parrot' }, 'xyzzy'), { title: false, body: false, tags: false });
});

test('records-search: a tag-only match is found', () => {
  const rec = { title: 'John Silver', body: 'a parrot', tags: [{ text: 'Long Chen', at: 1, removedAt: 0 }, { text: 'Gone', at: 1, removedAt: 2 }] };
  assert.equal(search.testRecord(rec, 'long chen'), true);
  assert.equal(search.testRecord(rec, 'gone'), false);
  assert.deepEqual(search.matches(rec, 'long chen'), { title: false, body: false, tags: true });
});
