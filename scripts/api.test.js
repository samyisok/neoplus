// NEO fork — the adapter answers safely before NEO has settled (adr-001, adr-003)
//
// api.js is the one place that touches core bindings and the fork's bridge.
// A missing binding must produce a calm "not available", never a throw into a
// right-click handler.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'api.js'), 'utf8');

function load(extra) {
  const context = { console, ...(extra || {}) };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(CODE, context);
  return context.NeoExtApi;
}

test('dictionaryStatus: no bridge, no throw, not available', async () => {
  const api = load();
  assert.deepEqual(await api.dictionaryStatus(), { ok: true, available: false });
});

test('dictionaryStatus: a failing bridge is reported as not available', async () => {
  const api = load({ NeoForkNative: { dictionaryStatus: () => Promise.reject(new Error('no ipc')) } });
  assert.deepEqual(await api.dictionaryStatus(), { ok: true, available: false });
});

test('dictionaryStatus: a real answer passes through', async () => {
  const api = load({ NeoForkNative: { dictionaryStatus: () => Promise.resolve({ ok: true, available: true, headwords: 126597 }) } });
  const res = await api.dictionaryStatus();
  assert.equal(res.available, true);
  assert.equal(res.headwords, 126597);
});

test('moreFeatures: not settled means simple NEO, never a throw', () => {
  const api = load();
  assert.equal(api.moreFeatures(), false);
  assert.equal(api.spellLanguage(), '');
});

test('chapterSnapshot: the open chapter, its place in the book, and its own title', () => {
  const api = load({
    book: { chapterOrder: ['ch-1', 'ch-2', 'ch-3'], chapterTitles: { 'ch-2': 'The Thaw' } },
    currentChapterId: 'ch-2'
  });
  assert.deepEqual(api.chapterSnapshot(), { chapterId: 'ch-2', chapterNumber: 2, chapterTitle: 'The Thaw' });
});

test('chapterSnapshot: a chapter with no title keeps the default name out', () => {
  const api = load({ book: { chapterOrder: ['ch-1', 'ch-2'], chapterTitles: {} }, currentChapterId: 'ch-1' });
  assert.deepEqual(api.chapterSnapshot(), { chapterId: 'ch-1', chapterNumber: 1, chapterTitle: '' });
});

test('chapterSnapshot: a chapter outside the order has no number, and no book has none at all', () => {
  const outside = load({ book: { chapterOrder: ['ch-1'] }, currentChapterId: 'gone' });
  assert.deepEqual(outside.chapterSnapshot(), { chapterId: 'gone', chapterNumber: 0, chapterTitle: '' });
  const none = load();
  assert.deepEqual(none.chapterSnapshot(), { chapterId: '', chapterNumber: 0, chapterTitle: '' });
});
