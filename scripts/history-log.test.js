// NEO fork — the book's replacement history (adr-014)
//
// Pure: no DOM, no filesystem. The log holds what a tool changed, from what
// text to what text, when, and in which chapter; order and size are derived.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const log = require('../neo-ext/lib/history-log.js');
const fileRules = require('../neo-ext/lib/records-file.js');

const at = 1_700_000_000_000;

function entry(over) {
  return {
    id: 'e1',
    at,
    tool: 'thesaurus',
    label: 'Thesaurus',
    from: 'batch',
    to: 'pile',
    chapterId: 'ch-1',
    chapterNumber: 3,
    chapterTitle: 'The Thaw',
    shortened: '',
    ...(over || {})
  };
}

test('history-log: an empty history has a format and no entries', () => {
  assert.deepEqual(log.empty(), { format: 1, entries: [] });
});

test('history-log: an entry keeps its meaning and drops unknown fields', () => {
  const made = log.makeEntry({ ...entry(), extra: 'no' }, { now: at, id: 'e1' });
  assert.equal(made.ok, true);
  assert.deepEqual(made.entry, entry());
});

test('history-log: an entry needs a tool slug and both texts', () => {
  for (const bad of [
    { ...entry(), tool: '' },
    { ...entry(), tool: 'Thesaurus' },
    { ...entry(), tool: 'the saurus' },
    { ...entry(), from: '' },
    { ...entry(), to: '   ' },
    { ...entry(), from: 7 }
  ]) {
    const made = log.makeEntry(bad, { now: at, id: 'e1' });
    assert.equal(made.ok, false, JSON.stringify(bad.tool));
  }
});

test('history-log: a bad entry is dropped alone, never its neighbours', () => {
  const out = log.normalize({
    format: 1,
    entries: [entry(), { id: 'broken' }, entry({ id: 'e2', at: at - 1 })]
  }, at);
  assert.equal(out.ok, true);
  assert.deepEqual(out.store.entries.map((e) => e.id), ['e1', 'e2']);
});

test('history-log: a history where nothing survives is unreadable, not empty', () => {
  const out = log.normalize({ format: 1, entries: [{ nope: true }] }, at);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'entry');
  assert.equal(log.normalize({ format: 2, entries: [] }, at).reason, 'format');
  assert.equal(log.normalize({ format: 1, entries: 'x' }, at).reason, 'shape');
});

test('history-log: duplicate ids collapse to one entry', () => {
  const out = log.normalize({ format: 1, entries: [entry(), entry()] }, at);
  assert.equal(out.ok, true);
  assert.equal(out.store.entries.length, 1);
});

test('history-log: a side over the cap is truncated and marked', () => {
  const long = 'x'.repeat(log.MAX_SIDE + 1);
  const one = log.normalize({ format: 1, entries: [entry({ from: long })] }, at);
  assert.equal(one.store.entries[0].from.length, log.MAX_SIDE);
  assert.equal(one.store.entries[0].shortened, 'from');
  const both = log.normalize({ format: 1, entries: [entry({ from: long, to: long })] }, at);
  assert.equal(both.store.entries[0].shortened, 'both');
  const kept = log.normalize({ format: 1, entries: [entry({ shortened: 'to' })] }, at);
  assert.equal(kept.store.entries[0].shortened, 'to');
});

test('history-log: labels and chapter titles are bounded', () => {
  const out = log.normalize({ format: 1, entries: [entry({ label: 'x'.repeat(200), chapterTitle: 'y'.repeat(400) })] }, at);
  assert.equal(out.store.entries[0].label.length, log.MAX_LABEL);
  assert.equal(out.store.entries[0].chapterTitle.length, log.MAX_TITLE);
});

test('history-log: a chapter number needs its chapter, and a bad one is zero', () => {
  const out = log.normalize({ format: 1, entries: [entry({ chapterId: '', chapterNumber: 4 })] }, at);
  assert.equal(out.store.entries[0].chapterNumber, 0);
  const bad = log.normalize({ format: 1, entries: [entry({ chapterNumber: 1.5 })] }, at);
  assert.equal(bad.store.entries[0].chapterNumber, 1);
  const negative = log.normalize({ format: 1, entries: [entry({ chapterNumber: -3 })] }, at);
  assert.equal(negative.store.entries[0].chapterNumber, 0);
});

test('history-log: newest first, ties broken by id', () => {
  const rows = [entry({ id: 'b', at: at }), entry({ id: 'a', at: at }), entry({ id: 'c', at: at + 5 })];
  assert.deepEqual(log.sorted(rows).map((e) => e.id), ['c', 'b', 'a']);
});

test('history-log: another device’s future time is kept, not rewritten', () => {
  const future = at + 5 * 60 * 1000;
  const out = log.normalize({ format: 1, entries: [entry({ at: future })] }, at);
  assert.equal(out.store.entries[0].at, future);
});

test('history-log: a time past what a date can show is capped, not stored broken', () => {
  const out = log.normalize({ format: 1, entries: [entry({ at: 9e15 })] }, at);
  assert.equal(out.store.entries[0].at, 8640000000000000);
  assert.equal(Number.isNaN(new Date(out.store.entries[0].at).getTime()), false);
});

test('history-log: append adds one entry and returns a new store', () => {
  const first = log.normalize({ format: 1, entries: [entry()] }, at).store;
  const made = log.makeEntry(entry({ id: 'e2', at: at + 1, from: 'good', to: 'fine' }), { now: at + 1 });
  const next = log.append(first, made.entry);
  assert.equal(next.ok, true);
  assert.deepEqual(next.store.entries.map((e) => e.id), ['e2', 'e1']);
  assert.equal(first.entries.length, 1, 'the old store is untouched');
});

test('history-log: the entry cap refuses another entry', () => {
  const rows = Array.from({ length: log.MAX_ENTRIES }, (_, i) => entry({ id: `e${i}`, at: at + i }));
  const full = log.normalize({ format: 1, entries: rows }, at);
  assert.equal(full.ok, true);
  const made = log.makeEntry(entry({ id: 'one-more' }), { now: at });
  const out = log.append(full.store, made.entry);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'count');
});

test('history-log: two devices merge by entry id, newest first', () => {
  const left = log.normalize({ format: 1, entries: [entry(), entry({ id: 'e2', at: at + 1 })] }, at).store;
  const right = log.normalize({ format: 1, entries: [entry(), entry({ id: 'e3', at: at + 2 })] }, at).store;
  const out = log.merge(left, right, at);
  assert.equal(out.ok, true);
  assert.deepEqual(out.store.entries.map((e) => e.id), ['e3', 'e2', 'e1']);
});

test('history-log: a merge that would pass the cap is refused', () => {
  const rows = (offset) => Array.from({ length: log.MAX_ENTRIES }, (_, i) => entry({ id: `e${offset}-${i}`, at: at + i }));
  const left = log.normalize({ format: 1, entries: rows('a') }, at).store;
  const right = log.normalize({ format: 1, entries: rows('b') }, at).store;
  const out = log.merge(left, right, at);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'count');
});

test('history-log: a small store fits the file cap and a huge one does not', () => {
  const store = log.normalize({ format: 1, entries: [entry()] }, at).store;
  const bytes = fileRules.sizeOf(store);
  assert.ok(bytes > 0 && bytes < 4096);
  assert.ok(fileRules.sizeOf({ format: 1, entries: Array.from({ length: 500 }, () => entry({ from: 'x'.repeat(5000), to: 'y'.repeat(5000) })) }) > 4 * 1024 * 1024);
});
