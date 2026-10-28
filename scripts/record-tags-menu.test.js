// NEO fork — the phrase side-channel and its menu item (adr-006)
//
// The renderer stores a chapter selection for the native menu; lexical items
// keep their own single-word gate.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const forms = require('../neo-ext/lib/word-forms.js');
const menu = require('../neo-ext/lib/record-tags-main.js');
const tags = require('../neo-ext/lib/record-tags.js');

function room({ phrase = 'Long Chen text', collapsed = false, language = 'fr', tag = true, ready = true } = {}) {
  const calls = { phrase: [], word: [], clearedPhrase: 0, choice: null };
  const editor = { isContentEditable: true, closest: (sel) => (String(sel).includes('chapter-body') ? editor : null) };
  const p = { closest: (sel) => (String(sel).split(',').includes('p') ? p : null) };
  const node = { nodeType: 3, data: phrase, parentElement: p };
  const range = {
    startContainer: node, endContainer: node, startOffset: 0, endOffset: 4,
    cloneRange() { return this; }
  };
  const selection = {
    rangeCount: collapsed ? 0 : 1, isCollapsed: collapsed,
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
    NeoRecordTags: tags,
    NeoExtApi: {
      moreFeatures: () => true,
      spellLanguage: () => language
    },
    NeoForkNative: {
      setContextWord: (w) => calls.word.push(w),
      clearContextWord: () => { calls.word.push(''); },
      setContextPhrase: (p, has, a, inv, records) => calls.phrase.push([p, has, a, inv, records]),
      clearContextPhrase: () => { calls.clearedPhrase++; }
    },
    NeoRecords: {
      tagReady: () => ready,
      tagExists: () => tag,
      lookUpItem: () => ({ label: 'Find Record…', value: 'record-find' }),
      openFromSelection: (p, m) => { calls.choice = [p, m]; }
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'word-context.js'), 'utf8'), context);
  return { calls, fire: (target = { closest: () => editor }) => handler({ target, clientX: 0, clientY: 0 }), context, range, node };
}

test('record-tags-menu: a chapter phrase is stored with its has-tag flag', () => {
  const r = room({ phrase: 'Long Chen', tag: true });
  r.fire();
  assert.deepEqual(r.calls.phrase.at(-1), ['Long Chen', true, null, false, true]);
  assert.equal(r.context.NeoWordContext.current(), null, 'multi-word leaves the lexical word empty');
});

test('record-tags-menu: the record item is language-free while the lexical item stays English', () => {
  const r = room({ phrase: 'Long Chen', tag: false, language: 'fr' });
  r.fire();
  assert.deepEqual(r.calls.phrase.at(-1), ['Long Chen', false, null, false, true]);
  assert.equal(r.context.NeoWordContext.current(), null);
});

test('record-tags-menu: no selection or a line break stores no phrase', () => {
  const none = room({ collapsed: true });
  none.fire();
  assert.equal(none.calls.phrase.length, 0);
  const br = room({ phrase: 'Long\nChen' });
  br.fire();
  assert.equal(br.calls.phrase.length, 0);
});

test('record-tags-menu: an unready tag index stores no record item', () => {
  const r = room({ ready: false });
  r.fire();
  assert.equal(r.calls.phrase.at(-1)[4], false, 'records are marked unready');
  assert.equal(menu.menuItem({ phrase: 'Long Chen', hasTag: false, records: false }, (s) => s), null);
});

test('record-tags-menu: the Look Up popup carries the record item and routes its choice', () => {
  const r = room({ phrase: 'Long', language: 'en-US' });
  r.fire();
  const items = [{ label: 'Look Up', value: 'lookup' }];
  assert.equal(r.context.NeoWordContext.lookUpMenu(items, 'Long'), true);
  assert.ok(items.some((i) => i.value === 'record-find'));
  r.context.NeoWordContext.lookUpChoice('record-find', 'Long');
  assert.deepEqual(r.calls.choice, ['Long', 'find']);
});

test('record-tags-menu: the native item reads Create or Find from the flag', () => {
  assert.equal(menu.menuItem({ phrase: 'Long Chen', hasTag: false }, (s) => s).label, 'Create Record…');
  assert.equal(menu.menuItem({ phrase: 'Long Chen', hasTag: true }, (s) => s).label, 'Find Record…');
  assert.equal(menu.menuItem(null, (s) => s), null);
});
