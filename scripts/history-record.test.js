// NEO fork — the one recorder every replacing tool calls (adr-014)
//
// The recorder owns the guard and the chapter snapshot; the view owns display.
// A failed record is reported in the view, never over the manuscript.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'history-record.js'), 'utf8');

function load(extra) {
  const calls = [];
  const statuses = [];
  const logs = [];
  let refreshes = 0;
  let book = 'book-the-lantern-year-1';
  let toasts = 0;
  const api = {
    moreFeatures: () => true,
    bookId: () => book,
    chapterSnapshot: () => ({ chapterId: 'ch-1', chapterNumber: 3, chapterTitle: 'The Thaw' }),
    ...(extra && extra.api ? extra.api : {})
  };
  const added = extra && extra.bridge && extra.bridge.historyAdd
    ? extra.bridge.historyAdd
    : () => Promise.resolve({ ok: true, store: { format: 1, entries: [] } });
  const context = {
    console,
    Promise,
    NeoExtApi: api,
    NeoForkNative: {
      ...(extra && extra.bridge ? extra.bridge : {}),
      historyAdd: (bookId, entry) => {
        calls.push({ bookId, entry });
        return added(bookId, entry);
      }
    },
    NeoHistoryView: {
      status: (text, kind) => statuses.push({ text, kind }),
      refresh: () => { refreshes += 1; }
    },
    NeoExt: { toast: () => { toasts += 1; } },
    neo: { logError: (message) => logs.push(String(message)) }
  };
  if (extra && extra.noView) delete context.NeoHistoryView;
  if (extra && extra.noBridge) delete context.NeoForkNative.historyAdd;
  context.window = context;
  vm.createContext(context);
  vm.runInContext(CODE, context);
  return {
    record: context.NeoHistory && context.NeoHistory.record,
    calls,
    statuses,
    logs,
    refreshes: () => refreshes,
    toasts: () => toasts,
    setBook: (id) => { book = id; }
  };
}

const ok = { tool: 'thesaurus', label: 'Thesaurus', from: 'Batch', to: 'Pile', inChapter: true };

test('history-record: a chapter replacement carries the snapshot and refreshes the view', async () => {
  const h = load();
  const out = await h.record(ok);
  assert.equal(out, true);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].bookId, 'book-the-lantern-year-1');
  assert.deepEqual(h.calls[0].entry, {
    tool: 'thesaurus',
    label: 'Thesaurus',
    from: 'Batch',
    to: 'Pile',
    chapterId: 'ch-1',
    chapterNumber: 3,
    chapterTitle: 'The Thaw'
  });
  assert.equal(h.refreshes(), 1);
});

test('history-record: outside a chapter there is no chapter number', async () => {
  const h = load();
  await h.record({ ...ok, inChapter: false });
  assert.deepEqual(
    [h.calls[0].entry.chapterId, h.calls[0].entry.chapterNumber, h.calls[0].entry.chapterTitle],
    ['', 0, '']
  );
});

test('history-record: no book, Simple NEO, no bridge, or a bad tool record nothing', async () => {
  const noBook = load();
  noBook.setBook('');
  assert.equal(await noBook.record(ok), false);

  const simple = load({ api: { moreFeatures: () => false } });
  assert.equal(await simple.record(ok), false);

  const noBridge = load({ noBridge: true });
  assert.equal(await noBridge.record(ok), false);

  for (const bad of ['', 'Thesaurus', 'the saurus']) {
    const h = load();
    assert.equal(await h.record({ ...ok, tool: bad }), false, bad);
    assert.equal(h.calls.length, 0);
  }
  assert.equal(noBook.calls.length + simple.calls.length + noBridge.calls.length, 0);
});

test('history-record: an empty, missing, or unchanged side records nothing', async () => {
  for (const bad of [
    { ...ok, from: '' },
    { ...ok, to: '   ' },
    { ...ok, from: 7 },
    { ...ok, from: 'batch', to: 'batch' }
  ]) {
    const h = load();
    assert.equal(await h.record(bad), false, JSON.stringify(bad));
    assert.equal(h.calls.length, 0);
  }
});

test('history-record: a refused write says so in the view and never toasts', async () => {
  const h = load({ bridge: { historyAdd: () => Promise.resolve({ ok: false, reason: 'large' }) } });
  const out = await h.record(ok);
  assert.equal(out, false);
  assert.equal(h.refreshes(), 0);
  assert.equal(h.toasts(), 0);
  assert.equal(h.statuses.length, 1);
  assert.match(h.statuses[0].text, /could not be recorded/);
  assert.equal(h.statuses[0].kind, 'error');
  assert.deepEqual(h.logs, ['history: large']);
});

test('history-record: a throwing bridge resolves false, never rejects', async () => {
  const h = load({ bridge: { historyAdd: () => Promise.reject(new Error('no ipc')) } });
  assert.equal(await h.record(ok), false);
  assert.equal(h.toasts(), 0);
  assert.deepEqual(h.logs, ['history: write failed'], 'a rejected invoke never logs its message');
});

test('history-record: a success clears an earlier failure notice', async () => {
  const h = load({ bridge: { historyAdd: () => Promise.resolve({ ok: true, store: { format: 1, entries: [] } }) } });
  await h.record(ok);
  assert.deepEqual(h.statuses[h.statuses.length - 1], { text: '', kind: '' });
});

test('history-record: a book opened mid-write is not refreshed with the old book', async () => {
  let release;
  const h = load({
    bridge: {
      historyAdd: () => new Promise((resolve) => { release = () => resolve({ ok: true, store: { format: 1, entries: [] } }); })
    }
  });
  const pending = h.record(ok);
  h.setBook('book-the-silver-sea-2');
  release();
  assert.equal(await pending, true);
  assert.equal(h.refreshes(), 0);
  assert.equal(h.calls[0].bookId, 'book-the-lantern-year-1');
});

test('history-record: no view loaded still records and refreshes nothing', async () => {
  const h = load({ noView: true });
  assert.equal(await h.record(ok), true);
  assert.equal(h.calls.length, 1);
});
