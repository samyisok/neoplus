// NEO fork — the Grammar… door (adr-017)
//
// The renderer stores the grammar flag beside rephrase; the native menu builds
// the item; the Look Up popup offers it for one word. No native menu is clicked.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const forms = require('../neo-ext/lib/word-forms.js');
const main = require('../neo-ext/main.js');

function renderer({ phrase = 'Long Chen', more = true, grammar = true, rephrase = false, language = 'en-US' } = {}) {
  const calls = { phrase: [], grammarOpened: 0, rephraseOpened: 0 };
  const editor = { isContentEditable: true, closest: (sel) => (String(sel).includes('chapter-body') ? editor : null) };
  const p = { closest: (sel) => (String(sel).split(',').map((s) => s.trim()).includes('p') ? p : null) };
  const node = { nodeType: 3, data: phrase, parentElement: p };
  const range = {
    startContainer: node, endContainer: node, startOffset: 0, endOffset: 1,
    cloneRange() { return this; }
  };
  const selection = {
    rangeCount: 1, isCollapsed: false,
    toString: () => phrase,
    getRangeAt: () => range
  };
  let handler = null;
  const document = {
    addEventListener: (type, fn) => { if (type === 'contextmenu') handler = fn; },
    getSelection: () => selection,
    createRange: () => ({ setStart() {}, setEnd() {}, collapse() {}, cloneRange() { return this; }, startContainer: node, endContainer: node }),
    caretRangeFromPoint: () => ({ startContainer: node, startOffset: 0 }),
    querySelector: () => null
  };
  const context = {
    console,
    Node: { TEXT_NODE: 3 },
    window: null,
    document,
    getSelection: () => selection,
    NeoWordForms: forms,
    NeoExtApi: { moreFeatures: () => more, spellLanguage: () => language },
    NeoForkNative: {
      setContextWord: () => {},
      clearContextWord: () => {},
      setContextPhrase: (...args) => calls.phrase.push(args),
      clearContextPhrase: () => {}
    },
    NeoRephrase: {
      capture: () => rephrase,
      has: () => rephrase,
      openPending: () => { calls.rephraseOpened += 1; }
    },
    NeoGrammar: {
      capture: (full) => !!(grammar && full),
      has: () => grammar,
      openPending: () => { calls.grammarOpened += 1; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'word-context.js'), 'utf8'), context);
  return {
    calls,
    context,
    fire: (target = { closest: () => editor }) => handler({ target, clientX: 0, clientY: 0 })
  };
}

test('grammar-menu: the phrase payload carries the grammar flag beside rephrase', () => {
  const r = renderer({ phrase: 'Long Chen', grammar: true, rephrase: false });
  r.fire();
  assert.equal(r.calls.phrase.length, 1);
  const args = r.calls.phrase[0];
  assert.equal(args.length, 7);
  assert.equal(args[0], 'Long Chen');
  assert.equal(args[5], false, 'rephrase flag');
  assert.equal(args[6], true, 'grammar flag');
});

test('grammar-menu: no flag when Show More Features is off or the capture fails', () => {
  const gated = renderer({ more: false });
  gated.fire();
  assert.equal(gated.calls.phrase.length, 0);

  const failed = renderer({ grammar: false });
  failed.fire();
  assert.equal(failed.calls.phrase.at(-1)[6], false);
});

test('grammar-menu: the Look Up popup offers Grammar… for a selected word', () => {
  const r = renderer({ phrase: 'gold', grammar: true });
  r.fire();
  const items = [{ label: 'Look Up', value: 'lookup' }];
  assert.equal(r.context.NeoWordContext.lookUpMenu(items, 'gold'), true);
  assert.ok(items.some((item) => item.value === 'grammar-open'));
  r.context.NeoWordContext.lookUpChoice('grammar-open', 'gold');
  assert.equal(r.calls.grammarOpened, 1);
  assert.equal(r.calls.rephraseOpened, 0);
});

function mainRoom() {
  const handlers = new Map();
  const events = new Map();
  const sent = [];
  const ipcMain = {
    handle: (channel, fn) => handlers.set(channel, fn),
    on: (channel, fn) => events.set(channel, fn)
  };
  const deps = {
    ipcMain,
    dialog: {},
    shell: {},
    BrowserWindow: {},
    app: {},
    readSettings: () => ({}),
    writeSettings: () => {},
    readSecret: () => '',
    logError: () => {},
    bookDir: () => '/tmp/book',
    libName: (name) => name,
    libraryDir: () => '/tmp/library',
    whenLocal: async (fn) => fn(),
    isCloudOnly: () => false,
    cloudOnlyAmong: () => new Set(),
    requestDownload: () => {},
    writeFileDurable: () => {}
  };
  main.init(deps);
  const win = { webContents: { id: 1, send: (channel, msg) => sent.push({ channel, msg }) } };
  return { events, sent, win };
}

test('grammar-menu: the native menu builds Grammar… after Rephrase and routes it', () => {
  const r = mainRoom();
  const store = r.events.get('neo-ext:context-phrase');
  assert.equal(typeof store, 'function');
  store({ sender: { id: 1 }, returnValue: false }, {
    phrase: '', hasTag: false, inventory: false, records: true, rephrase: true, grammar: true, anchor: null
  });
  const items = [{ label: 'Look Up' }];
  main.contextMenu(items, {}, r.win);
  const labels = items.map((item) => item.label || item.type);
  assert.deepEqual(labels, ['Rephrase…', 'Grammar…', 'separator', 'Look Up']);
  const grammar = items.find((item) => item.label === 'Grammar…');
  assert.ok(grammar);
  grammar.click();
  assert.deepEqual(r.sent.at(-1).msg, { type: 'neo-ext', action: 'grammar-open' });
});

test('grammar-menu: a grammar-only phrase still builds the item', () => {
  const r = mainRoom();
  const store = r.events.get('neo-ext:context-phrase');
  store({ sender: { id: 1 }, returnValue: false }, {
    phrase: '', hasTag: false, inventory: false, records: false, rephrase: false, grammar: true, anchor: null
  });
  const items = [];
  main.contextMenu(items, {}, r.win);
  assert.equal(items[0].label, 'Grammar…');
});
