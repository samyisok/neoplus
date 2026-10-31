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

test('uiZoom: the snapped stored size, or 1 before the library settles', () => {
  assert.equal(load().uiZoom(), 1);
  const api = load({ library: { uiZoom: 1.25 } });
  assert.equal(api.uiZoom(), 1.3);
});

test('uiZoom rules: clamp and step in tenths', () => {
  const api = load();
  assert.equal(api.snapUiZoom(0.5), 0.9);
  assert.equal(api.snapUiZoom(9), 3);
  assert.equal(api.stepUiZoom(1, 1), 1.1);
  assert.equal(api.stepUiZoom(1, -1), 0.9);
  assert.equal(api.stepUiZoom(2.4, 0), 1);
});

test('setUiZoom: writes once, skips an unchanged value, and puts a failed write back', async () => {
  const writes = [];
  const api = load({
    library: { uiZoom: 1 },
    writeLibrary: async (lib) => { writes.push(lib.uiZoom); return true; },
    applyFonts: () => {}
  });
  assert.deepEqual(await api.setUiZoom(1.2), { ok: true, value: 1.2 });
  assert.deepEqual(writes, [1.2]);
  assert.deepEqual(await api.setUiZoom(1.2), { ok: true, value: 1.2, unchanged: true });
  assert.equal(writes.length, 1, 'no second write for the same size');

  const resync = [];
  const failing = load({
    library: { uiZoom: 1 },
    writeLibrary: async (lib) => { resync.push(['write', lib.uiZoom]); throw new Error('disk full'); },
    rememberDeviceLook: (lib) => resync.push(['device', lib.uiZoom])
  });
  const out = await failing.setUiZoom(1.2);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'write', 'no path or raw message reaches the window');
  assert.equal(failing.uiZoom(), 1, 'the failed value is not left in memory');
  assert.deepEqual(resync, [['write', 1.2], ['device', 1]], 'the device copy is put back too');

  const refused = load({ library: { uiZoom: 1 }, writeLibrary: async () => false });
  const no = await refused.setUiZoom(1.3);
  assert.equal(no.ok, false);
  assert.equal(refused.uiZoom(), 1);

  // A View-menu step taken while this write was pending is the newer choice.
  const concurrent = load({
    library: { uiZoom: 1 },
    writeLibrary: async (lib) => { lib.uiZoom = 1.4; throw new Error('disk full'); }
  });
  const out2 = await concurrent.setUiZoom(1.2);
  assert.equal(out2.ok, false);
  assert.equal(concurrent.uiZoom(), 1.4, 'the concurrent choice is not clobbered by the failed write');
});

test('uiText: snaps, steps, writes, and puts a failed write back', async () => {
  const bare = load();
  assert.equal(bare.uiText(), 1);
  assert.equal(bare.snapUiText(0.5), 0.9);
  assert.equal(bare.snapUiText(9), 2);
  assert.equal(bare.stepUiText(1, 1), 1.1);
  assert.equal(bare.stepUiText(1, -1), 0.9);
  assert.equal(bare.stepUiText(1.8, 0), 1);

  const writes = [];
  const api = load({
    library: { uiText: 1 },
    writeLibrary: async (lib) => { writes.push(lib.uiText); return true; },
    applyFonts: () => {}
  });
  assert.deepEqual(await api.setUiText(1.3), { ok: true, value: 1.3 });
  assert.deepEqual(writes, [1.3]);
  assert.deepEqual(await api.setUiText(1.3), { ok: true, value: 1.3, unchanged: true });

  const resync = [];
  const failing = load({
    library: { uiText: 1 },
    writeLibrary: async (lib) => { resync.push(['write', lib.uiText]); throw new Error('disk full'); },
    rememberDeviceLook: (lib) => resync.push(['device', lib.uiText])
  });
  const out = await failing.setUiText(1.4);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'write');
  assert.equal(failing.uiText(), 1);
  assert.deepEqual(resync, [['write', 1.4], ['device', 1]]);
});

test('setUiLook: both sizes in one write, and both put back together', async () => {
  const writes = [];
  const api = load({
    library: { uiZoom: 1, uiText: 1 },
    writeLibrary: async (lib) => { writes.push([lib.uiZoom, lib.uiText]); return true; },
    applyFonts: () => {}
  });
  assert.deepEqual(await api.setUiLook({ uiZoom: 1.2, uiText: 1.4 }), { ok: true });
  assert.deepEqual(writes, [[1.2, 1.4]], 'one write for both');
  assert.deepEqual(await api.setUiLook({ uiZoom: 1.2, uiText: 1.4 }), { ok: true, unchanged: true });

  const resync = [];
  const failing = load({
    library: { uiZoom: 1, uiText: 1 },
    writeLibrary: async (lib) => { resync.push(['write', lib.uiZoom, lib.uiText]); throw new Error('disk full'); },
    rememberDeviceLook: (lib) => resync.push(['device', lib.uiZoom, lib.uiText])
  });
  const out = await failing.setUiLook({ uiZoom: 1.3, uiText: 1.5 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'write');
  assert.deepEqual([failing.uiZoom(), failing.uiText()], [1, 1], 'both are put back, never half');
  assert.deepEqual(resync, [['write', 1.3, 1.5], ['device', 1, 1]]);
});
