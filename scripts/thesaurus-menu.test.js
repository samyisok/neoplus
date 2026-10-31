// NEO fork — thesaurus main-process wiring (adr-002, shared word context in adr-003)
//
// Drives the real shards through the same handlers the window calls: status,
// lookup, the menu item the shared registry asks for, and the renderer's Look
// Up seam.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const thes = require('../neo-ext/thesaurus-main.js');
const context = require('../neo-ext/word-context-main.js');

function fake(extra) {
  const handlers = new Map();
  const listeners = new Map();
  const deps = {
    ipcMain: {
      handle: (ch, fn) => handlers.set(ch, fn),
      on: (ch, fn) => listeners.set(ch, fn)
    },
    logError: () => {},
    ...(extra || {})
  };
  thes.init(deps);
  context.init(deps);
  const win = { webContents: { id: 1, send: () => {} } };
  return { handlers, listeners, win };
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

test('lookup: a known opposite keeps its label and stays a word', async () => {
  const { handlers } = fake();
  const res = await handlers.get('neo-ext:thesaurus')({}, 'good');
  assert.equal(res.ok, true);
  const antonyms = res.groups.filter((g) => g.rel === 'antonym').flatMap((g) => g.syns);
  assert.ok(antonyms.includes('bad'), `good antonyms: ${antonyms.slice(0, 5)}`);
  assert.ok(antonyms.every((w) => !/[()]/.test(w)));
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

test('menu item: readable data offers the item; a missing directory offers none', () => {
  const live = fake();
  const item = thes.menuItem('batch');
  assert.equal(item.label, 'Thesaurus…');
  assert.equal(item.action, 'thesaurus');
  assert.equal(item.word, 'batch');
  assert.equal(live.handlers.size > 0, true);

  const handlers = new Map();
  thes.init({
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: () => {} },
    logError: () => {},
    dataDir: path.join(__dirname, 'no-such-thesaurus')
  });
  assert.equal(thes.menuItem('batch'), null);
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
  const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'neo-ext', name), 'utf8');
  const forms = require('../neo-ext/lib/word-forms.js');
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
      clearContextWord: () => calls.push(['clear']),
      thesaurus: (word) => { calls.push(['lookup', word]); return Promise.resolve({ ok: false, reason: 'none' }); }
    },
    NeoExtApi: { moreFeatures: () => true, spellLanguage: () => 'en-US' },
    NeoExt: { toast: () => {} },
    NeoWordForms: forms,
    NeoThesaurusRules: require('../neo-ext/lib/thesaurus-lookup.js')
  };
  context.window = context;
  context.getSelection = () => ({ rangeCount: 0, isCollapsed: true, toString: () => '' });
  vm.createContext(context);
  vm.runInContext(read('word-context.js'), context);
  vm.runInContext(read('thesaurus.js'), context);
  await new Promise((resolve) => setImmediate(resolve));

  assert.equal(typeof listener, 'function');
  listener({ target: { closest: () => ({ isContentEditable: true }) }, clientX: 0, clientY: 0 });
  assert.deepEqual(calls[0], ['set', 'batch']);

  const items = [];
  assert.equal(context.NeoWordContext.lookUpMenu(items, 'batch'), true);
  assert.deepEqual(items, [{ label: 'Thesaurus…', value: 'thesaurus' }]);
  assert.deepEqual(calls[1], ['clear']);
  assert.equal(context.NeoWordContext.lookUpMenu(items, 'other'), false);
  assert.equal(items.length, 1);

  // A popup the writer dismissed leaves its entry behind; a later open of a
  // different word must not use it.
  context.NeoThesaurus.openWord('other');
  assert.ok(!calls.some((c) => c[0] === 'lookup'), 'no lookup for an unrelated word');
});

test('lookup: an exact entry with only itself answers none, not a fallback form', async () => {
  const { handlers } = fake();
  const res = await handlers.get('neo-ext:thesaurus')({}, 'asap');
  assert.equal(res.ok, false);
  assert.equal(res.reason, 'none');
});

test('renderer: a dismissed Look Up does not replace the same word in an old chapter', async () => {
  const vm = require('node:vm');
  const fs = require('node:fs');
  const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'neo-ext', name), 'utf8');
  const forms = require('../neo-ext/lib/word-forms.js');

  const editor = (id) => ({ isContentEditable: true, dataset: { id }, focus() {} });
  const nodeIn = (id) => {
    const node = { nodeType: 3, data: 'batch' };
    node.parentElement = { closest: (sel) => (String(sel).includes('chapter-body') ? editor(id) : null) };
    return node;
  };
  const nodeA = nodeIn('a');
  const nodeB = nodeIn('b');
  let caret = nodeA;
  let listener = null;
  const added = [];
  let picked = null;
  const makeRange = (node) => ({
    startContainer: node,
    endContainer: node,
    startOffset: 0,
    endOffset: 5,
    cloneRange() { return this; },
    collapse() {},
    toString() { return node.data; }
  });
  const selection = {
    rangeCount: 0,
    isCollapsed: true,
    toString: () => '',
    removeAllRanges() {},
    addRange: (range) => added.push(range),
    getRangeAt: () => makeRange(caret)
  };
  const document = {
    addEventListener: (type, fn) => { if (type === 'contextmenu') listener = fn; },
    createRange: () => ({
      startContainer: null,
      endContainer: null,
      setStart(node, at) { this.startContainer = node; this.startOffset = at; },
      setEnd(node, at) { this.endContainer = node; this.endOffset = at; },
      collapse() {},
      toString() { return 'batch'; }
    }),
    caretRangeFromPoint: () => ({ startContainer: caret, startOffset: 0 }),
    contains: () => true,
    execCommand: () => true
  };
  const context = {
    console,
    Node: { TEXT_NODE: 3 },
    document,
    NeoForkNative: {
      thesaurusStatus: () => Promise.resolve({ available: true }),
      setContextWord: () => {},
      clearContextWord: () => {},
      thesaurus: (word) => Promise.resolve({ ok: true, word, groups: [{ pos: 'noun', rel: '', syns: ['deal'] }], count: 1 })
    },
    NeoExtApi: { moreFeatures: () => true, spellLanguage: () => 'en-US' },
    NeoExt: { toast: () => {} },
    NeoWordForms: forms,
    NeoThesaurusRules: require('../neo-ext/lib/thesaurus-lookup.js'),
    NeoThesaurusWindow: {
      otherModalOpen: () => false,
      open: (opts) => { picked = opts; return true; }
    }
  };
  context.window = context;
  context.getSelection = () => selection;
  vm.createContext(context);
  vm.runInContext(read('word-context.js'), context);
  vm.runInContext(read('thesaurus.js'), context);
  await new Promise((resolve) => setImmediate(resolve));

  const rightClick = () => listener({ target: { closest: () => editor('x') }, clientX: 0, clientY: 0 });

  // the writer right-clicks a word in chapter a, then dismisses the Look Up popup
  rightClick();
  assert.equal(context.NeoWordContext.lookUpMenu([], 'batch'), true);

  // later, the same word is right-clicked in chapter b and opened from the native menu
  caret = nodeB;
  rightClick();
  context.NeoThesaurus.openWord('batch');
  await new Promise((resolve) => setImmediate(resolve));
  assert.ok(picked, 'the synonym window opened');
  picked.onPick('deal');
  assert.equal(added.length, 1);
  assert.equal(added[0].startContainer, nodeB, 'the live word wins over the dismissed popup');
});

// ── adr-014: a successful replacement is recorded ─────────────────────────

async function thesaurusHarness(options) {
  const opts = options || {};
  const vm = require('node:vm');
  const fs = require('node:fs');
  const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'neo-ext', name), 'utf8');
  const forms = require('../neo-ext/lib/word-forms.js');
  let listener = null;
  let picked = null;
  const recorded = [];
  const added = [];
  let execOk = opts.exec !== false;
  const editor = {
    isContentEditable: true,
    classList: { contains: (cls) => cls === 'chapter-body' && opts.inChapter !== false },
    focus() {}
  };
  const node = { nodeType: 3, data: opts.word || 'Batch' };
  node.parentElement = { closest: () => editor };
  const range = {
    startContainer: node,
    endContainer: node,
    startOffset: 0,
    endOffset: 5,
    cloneRange() { return this; },
    collapse() {},
    toString() { return node.data; }
  };
  const selection = {
    rangeCount: 0,
    isCollapsed: true,
    toString: () => '',
    removeAllRanges() {},
    addRange() {},
    getRangeAt: () => range
  };
  const document = {
    addEventListener: (type, fn) => { if (type === 'contextmenu') listener = fn; },
    createRange: () => ({
      startContainer: node,
      endContainer: node,
      startOffset: 0,
      endOffset: 5,
      setStart() {},
      setEnd() {},
      collapse() {},
      toString: () => node.data
    }),
    caretRangeFromPoint: () => ({ startContainer: node, startOffset: 2 }),
    contains: () => !opts.moved,
    execCommand: () => execOk
  };
  const context = {
    console,
    Node: { TEXT_NODE: 3 },
    document,
    NeoForkNative: {
      thesaurusStatus: () => Promise.resolve({ available: true }),
      setContextWord: () => {},
      clearContextWord: () => {},
      clearContextPhrase: () => {},
      historyAdd: (bookId, entry) => { added.push({ bookId, entry }); return Promise.resolve({ ok: true, store: { format: 1, entries: [] } }); },
      thesaurus: (word) => Promise.resolve({ ok: true, word, groups: [{ pos: 'noun', rel: '', syns: ['pile'] }], count: 1 })
    },
    NeoExtApi: {
      moreFeatures: () => opts.more !== false,
      spellLanguage: () => 'en-US',
      bookId: () => 'book-the-lantern-year-1',
      chapterSnapshot: () => ({ chapterId: 'ch-1', chapterNumber: 3, chapterTitle: 'The Thaw' })
    },
    NeoHistory: { record: (spec) => { recorded.push(spec); return Promise.resolve(true); } },
    NeoExt: { toast: () => {} },
    NeoWordForms: forms,
    NeoThesaurusRules: require('../neo-ext/lib/thesaurus-lookup.js'),
    NeoThesaurusWindow: {
      otherModalOpen: () => false,
      open: (windowOpts) => { picked = windowOpts; return true; }
    }
  };
  if (opts.realRecorder) {
    delete context.NeoHistory;
    context.NeoHistoryView = { status: () => {}, refresh: () => {} };
  }
  context.window = context;
  context.getSelection = () => selection;
  vm.createContext(context);
  vm.runInContext(read('word-context.js'), context);
  vm.runInContext(read('thesaurus.js'), context);
  if (opts.realRecorder) vm.runInContext(read('history-record.js'), context);
  await new Promise((resolve) => setImmediate(resolve));
  const rightClick = () => listener({ target: { closest: () => editor }, clientX: 0, clientY: 0 });
  const open = async (word) => {
    rightClick();
    context.NeoThesaurus.openWord(word);
    await new Promise((resolve) => setImmediate(resolve));
  };
  return {
    context,
    recorded,
    added,
    open,
    pick: (synonym) => picked.onPick(synonym),
    failInsert: () => { execOk = false; },
    opened: () => picked
  };
}

test('renderer: a successful synonym replacement records the clicked and inserted word', async () => {
  const h = await thesaurusHarness();
  await h.open('Batch');
  assert.ok(h.opened(), 'the synonym window opened');
  h.pick('pile');
  assert.equal(h.recorded.length, 1);
  assert.deepEqual(h.recorded[0], { tool: 'thesaurus', label: '', from: 'Batch', to: 'Pile', inChapter: true });
});

test('renderer: a moved word or a failed insert records nothing', async () => {
  const moved = await thesaurusHarness({ moved: true });
  await moved.open('Batch');
  moved.pick('pile');
  assert.equal(moved.recorded.length, 0);

  const failed = await thesaurusHarness();
  failed.failInsert();
  await failed.open('Batch');
  failed.pick('pile');
  assert.equal(failed.recorded.length, 0);
});

test('renderer: a notes-page replacement records without a chapter', async () => {
  const h = await thesaurusHarness({ inChapter: false });
  await h.open('Batch');
  h.pick('pile');
  assert.equal(h.recorded.length, 1);
  assert.equal(h.recorded[0].inChapter, false);
});

test('renderer: Simple NEO records nothing, because the recorder is what gates it', async () => {
  const h = await thesaurusHarness({ more: false, realRecorder: true });
  await h.open('Batch');
  assert.equal(h.opened(), null, 'no window opens in Simple NEO');
  assert.equal(h.added.length, 0);

  const control = await thesaurusHarness({ more: true, realRecorder: true });
  await control.open('Batch');
  control.pick('pile');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(control.added.length, 1);
  assert.deepEqual(control.added[0].entry, {
    tool: 'thesaurus',
    label: '',
    from: 'Batch',
    to: 'Pile',
    chapterId: 'ch-1',
    chapterNumber: 3,
    chapterTitle: 'The Thaw'
  });
});
