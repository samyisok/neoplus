// NEO fork — one word context for both lexical features (adr-003)
//
// The right-click listener used to live inside the thesaurus. A dictionary
// must not add a second capture listener or a second synchronous hand-off, so
// the word that the native menu will offer is resolved here, once.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const CODE = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'word-context.js'), 'utf8');
const forms = require('../neo-ext/lib/word-forms.js');

function load({ more = true, language = 'en-US', editable = true, selection = '', text = 'batch' } = {}) {
  const calls = [];
  let listener = null;
  let added = 0;
  const node = { nodeType: 3, data: text, parentElement: { closest: () => ({ focus() {} }) } };
  const range = {
    startContainer: node,
    endContainer: node,
    startOffset: 0,
    endOffset: text.length,
    setStart() {},
    setEnd() {},
    collapse() {},
    cloneRange() { return this; },
    toString() { return text; }
  };
  const context = {
    console,
    Node: { TEXT_NODE: 3 },
    document: {
      addEventListener: (type, fn, capture) => {
        added += 1;
        if (type === 'contextmenu') listener = fn;
        if (!capture) throw new Error('the listener must be on the capture phase');
      },
      createRange: () => range,
      caretRangeFromPoint: () => ({ startContainer: node, startOffset: 0 }),
      contains: () => true
    },
    NeoForkNative: {
      setContextWord: (word) => calls.push(['set', word]),
      clearContextWord: () => calls.push(['clear'])
    },
    NeoExtApi: {
      moreFeatures: () => more,
      spellLanguage: () => language
    },
    NeoWordForms: forms
  };
  context.window = context;
  context.getSelection = () => ({
    rangeCount: selection ? 1 : 0,
    isCollapsed: !selection,
    toString: () => selection,
    getRangeAt: () => range
  });
  vm.createContext(context);
  vm.runInContext(CODE, context);
  return {
    calls,
    added: () => added,
    context,
    rightClick: (editableNow = editable) => listener({ target: { closest: () => ({ isContentEditable: editableNow }) }, clientX: 0, clientY: 0 })
  };
}

test('one capture listener, and a word for an editable English editor', () => {
  const h = load();
  assert.equal(h.added(), 1, 'exactly one contextmenu listener');
  h.rightClick();
  assert.deepEqual(h.calls, [['set', 'batch']]);
  const held = h.context.NeoWordContext.current();
  assert.equal(held.word, 'batch');
  assert.equal(h.context.NeoWordContext.matches('Batch'), true);
});

test('a multi-word selection stores no word', () => {
  const h = load({ selection: 'a batch of' });
  h.rightClick();
  assert.deepEqual(h.calls, []);
  assert.equal(h.context.NeoWordContext.current(), null);
});

test('a non-English language stores no word', () => {
  const h = load({ language: 'fr' });
  h.rightClick();
  assert.deepEqual(h.calls, []);
});

test('Simple NEO stores no word', () => {
  const h = load({ more: false });
  h.rightClick();
  assert.deepEqual(h.calls, []);
});

test('a target outside an editable editor stores no word', () => {
  const h = load({ editable: false });
  h.rightClick();
  assert.deepEqual(h.calls, []);
});

test('a later miss clears a word stored earlier', () => {
  const h = load();
  h.rightClick(true);
  assert.deepEqual(h.calls, [['set', 'batch']]);
  assert.ok(h.context.NeoWordContext.current());
  h.rightClick(false); // the next right-click lands outside the editor
  assert.deepEqual(h.calls, [['set', 'batch'], ['clear']]);
  assert.equal(h.context.NeoWordContext.current(), null);
});
