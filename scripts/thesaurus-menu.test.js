// NEO fork — thesaurus main-process wiring (adr-002)
//
// Drives the real shards through the same handlers the window calls: status,
// lookup, the context word, the native menu item, and the macOS Look Up item.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const thes = require('../neo-ext/thesaurus-main.js');


function fake() {
  const handlers = new Map();
  const listeners = new Map();
  const sent = [];
  const deps = {
    ipcMain: {
      handle: (ch, fn) => handlers.set(ch, fn),
      on: (ch, fn) => listeners.set(ch, fn)
    },
    logError: () => {}
  };
  thes.init(deps);
  const win = {
    webContents: {
      id: 1,
      send: (channel, msg) => sent.push({ channel, msg })
    }
  };
  const event = { sender: { id: 1 }, returnValue: undefined };
  return { handlers, listeners, sent, win, event };
}

function seed(listeners, event, word) {
  listeners.get('neo-ext:context-word')(event, word);
  return event;
}

test('status: bundled data is available', async () => {
  const { handlers } = fake();
  const status = await handlers.get('neo-ext:thesaurus-status')();
  assert.equal(status.ok, true);
  assert.equal(status.available, true);
  assert.equal(status.language, 'en');
});

test('status: a missing data directory is reported, not thrown', async () => {
  const handlers = new Map();
  thes.init({
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: () => {} },
    logError: () => {},
    dataDir: path.join(__dirname, 'no-such-thesaurus')
  });
  const status = await handlers.get('neo-ext:thesaurus-status')();
  assert.equal(status.ok, true);
  assert.equal(status.available, false);
  const miss = await handlers.get('neo-ext:thesaurus')({}, 'batch');
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, 'unavailable');
});

test('lookup: a real word comes back grouped, without itself', async () => {
  const { handlers } = fake();
  const res = await handlers.get('neo-ext:thesaurus')({}, 'batch');
  assert.equal(res.ok, true);
  assert.equal(res.word, 'batch');
  assert.ok(res.groups.length >= 2);
  assert.deepEqual([...new Set(res.groups.map((g) => g.pos))], ['noun', 'verb']);
  assert.equal(res.count, res.groups.reduce((n, g) => n + g.syns.length, 0));
  assert.ok(res.groups[0].syns.includes('pile'));
  for (const group of res.groups) assert.ok(!group.syns.includes('batch'));
});

test('lookup: an inflected form resolves to its headword', async () => {
  const { handlers } = fake();
  const res = await handlers.get('neo-ext:thesaurus')({}, 'batches');
  assert.equal(res.ok, true);
  assert.equal(res.word, 'batch');
  assert.ok(res.count > 0);
});

test('lookup: an unknown word and a non-letter word report no entry', async () => {
  const { handlers } = fake();
  for (const word of ['xyzzyplugh', '1990s', '', '   ']) {
    const res = await handlers.get('neo-ext:thesaurus')({}, word);
    assert.equal(res.ok, false, word);
    assert.equal(res.reason, 'none', word);
  }
});

test('lookup: a warm shard answers well under 150 ms', async () => {
  const { handlers } = fake();
  await handlers.get('neo-ext:thesaurus')({}, 'batch');
  const at = process.hrtime.bigint();
  const res = await handlers.get('neo-ext:thesaurus')({}, 'batch');
  const ms = Number(process.hrtime.bigint() - at) / 1e6;
  assert.equal(res.ok, true);
  assert.ok(ms < 150, `warm lookup took ${ms.toFixed(1)} ms`);
});

test('context menu: a stored word adds the item first, with a rule after it', () => {
  const { listeners, event, win } = fake();
  seed(listeners, event, 'batch');
  const items = [{ role: 'cut' }, { role: 'copy' }, { type: 'separator' }, { role: 'selectAll' }];
  thes.contextMenu(items, {}, win);
  assert.equal(items[0].label, 'Thesaurus…');
  assert.equal(items[1].type, 'separator');
  assert.equal(items[2].role, 'cut');
  assert.equal(items.length, 6);
});

test('context menu: the stored word is consumed once', () => {
  const { listeners, event, win } = fake();
  seed(listeners, event, 'batch');
  thes.contextMenu([{ role: 'copy' }], {}, win);
  const second = [{ role: 'copy' }];
  thes.contextMenu(second, {}, win);
  assert.deepEqual(second, [{ role: 'copy' }]);
});

test('context menu: no word leaves the menu untouched', () => {
  const { win } = fake();
  const items = [{ role: 'cut' }, { role: 'copy' }];
  thes.contextMenu(items, {}, win);
  assert.deepEqual(items, [{ role: 'cut' }, { role: 'copy' }]);
});

test('context menu: the item sends the word to the window', () => {
  const { listeners, event, win, sent } = fake();
  seed(listeners, event, 'batch');
  const items = [];
  thes.contextMenu(items, {}, win);
  items[0].click();
  assert.deepEqual(sent, [{ channel: 'menu', msg: { type: 'neo-ext', action: 'thesaurus', word: 'batch' } }]);
});

test('context menu: windows do not share a stored word', () => {
  const { listeners, win } = fake();
  const other = { webContents: { id: 2, send: () => {} } };
  const first = { sender: { id: 1 }, returnValue: undefined };
  listeners.get('neo-ext:context-word')(first, 'batch');
  const items = [{ role: 'copy' }];
  thes.contextMenu(items, {}, other);
  assert.deepEqual(items, [{ role: 'copy' }]);
  const mine = [{ role: 'copy' }];
  thes.contextMenu(mine, {}, win);
  assert.equal(mine[0].label, 'Thesaurus…');
});

test('context menu: a word with no data leaves the menu untouched', () => {
  const handlers = new Map();
  const listeners = new Map();
  thes.init({
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) },
    logError: () => {},
    dataDir: path.join(__dirname, 'no-such-thesaurus')
  });
  const win = { webContents: { id: 1, send: () => {} } };
  listeners.get('neo-ext:context-word')({ sender: { id: 1 } }, 'batch');
  const items = [{ role: 'copy' }];
  thes.contextMenu(items, {}, win);
  assert.deepEqual(items, [{ role: 'copy' }]);
});

test('lookup: overlong words are refused before any shard is read', async () => {
  const { handlers } = fake();
  const res = await handlers.get('neo-ext:thesaurus')({}, 'x'.repeat(500));
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'none');
});

test('lookup: words absent from the data report none', async () => {
  const { handlers } = fake();
  for (const word of ['toString', 'hasOwnProperty']) {
    const res = await handlers.get('neo-ext:thesaurus')({}, word);
    assert.equal(res.ok, false, word);
  }
});

test('renderer: the Look Up seam appends one item and spends the stored word', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const code = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'thesaurus.js'), 'utf8');
  const calls = [];
  const node = { nodeType: 3, data: 'batch' };
  const range = {
    startContainer: node,
    endContainer: node,
    startOffset: 0,
    endOffset: 5,
    setStart() {},
    setEnd() {},
    collapse() {},
    cloneRange() { return this; },
    toString() { return 'batch'; }
  };
  let listener = null;
  const context = {
    console,
    Node: { TEXT_NODE: 3 },
    document: {
      addEventListener: (type, fn) => { if (type === 'contextmenu') listener = fn; },
      createRange: () => range,
      caretRangeFromPoint: () => ({ startContainer: node, startOffset: 0 }),
      contains: () => true
    },
    NeoForkNative: {
      thesaurusStatus: () => Promise.resolve({ available: true }),
      setContextWord: (word) => calls.push(['set', word]),
      clearContextWord: () => calls.push(['clear'])
    },
    NeoExtApi: { moreFeatures: () => true, spellLanguage: () => 'en-US' },
    NeoExt: { toast: () => {} },
    NeoThesaurusRules: require('../neo-ext/lib/thesaurus-lookup.js')
  };
  context.window = context;
  context.getSelection = () => ({ rangeCount: 0, isCollapsed: true, toString: () => '' });
  vm.createContext(context);
  vm.runInContext(code, context);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(typeof listener, 'function');
  listener({ target: { closest: () => ({ isContentEditable: true }) }, clientX: 0, clientY: 0 });
  assert.deepEqual(calls[0], ['set', 'batch']);

  const items = [];
  assert.equal(context.NeoThesaurus.lookUpMenu(items, 'batch'), true);
  assert.deepEqual(items, [{ label: 'Thesaurus…', value: 'thesaurus' }]);
  assert.deepEqual(calls[1], ['clear']);
  assert.equal(context.NeoThesaurus.lookUpMenu(items, 'other'), false);
  assert.equal(items.length, 1);
});

test('lookup: an exact entry with only itself answers none, not a fallback form', async () => {
  const { handlers } = fake();
  const res = await handlers.get('neo-ext:thesaurus')({}, 'asap');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'none');
});
