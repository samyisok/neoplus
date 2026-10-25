// NEO fork — Dictionary… in the editor and in the macOS Look Up popup (adr-003)
//
// The dictionary is display only. It offers an item under the same word the
// thesaurus does, opens the definition window on the word, and never receives
// the range that a replacement would need.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const DIR = path.join(__dirname, '..', 'neo-ext');
const read = (name) => fs.readFileSync(path.join(DIR, name), 'utf8');

function load({ dictionaryAvailable = true, thesaurusAvailable = true } = {}) {
  const calls = [];
  const opened = [];
  const sent = [];
  const node = { nodeType: 3, data: 'batch', parentElement: { closest: () => ({ focus() {} }) } };
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
      contains: () => true,
      execCommand: () => { throw new Error('the dictionary must not edit'); }
    },
    NeoForkNative: {
      setContextWord: (word) => calls.push(['set', word]),
      clearContextWord: () => calls.push(['clear']),
      dictionaryStatus: () => Promise.resolve({ available: dictionaryAvailable }),
      thesaurusStatus: () => Promise.resolve({ available: thesaurusAvailable }),
      dictionary: (word) => {
        sent.push(['dictionary', word]);
        return Promise.resolve({ ok: true, word, count: 2, groups: [{ pos: 'noun', senses: [{ def: 'a group of things' }] }] });
      },
      thesaurus: (word) => {
        sent.push(['thesaurus', word]);
        return Promise.resolve({ ok: true, word, groups: [{ pos: 'noun', rel: '', syns: ['deal'] }], count: 1 });
      }
    },
    NeoExtApi: { moreFeatures: () => true, spellLanguage: () => 'en-US', dictionaryStatus: async () => ({ available: dictionaryAvailable }) },
    NeoExt: { toast: () => {} },
    NeoWordForms: require('../neo-ext/lib/word-forms.js'),
    NeoThesaurusRules: require('../neo-ext/lib/thesaurus-lookup.js'),
    NeoDictionaryWindow: {
      otherModalOpen: () => false,
      open: (opts) => { opened.push(opts); return true; }
    },
    NeoThesaurusWindow: { otherModalOpen: () => false, open: () => true }
  };
  context.window = context;
  context.getSelection = () => ({ rangeCount: 0, isCollapsed: true, toString: () => '' });
  vm.createContext(context);
  for (const name of ['word-context.js', 'dictionary.js', 'thesaurus.js']) vm.runInContext(read(name), context);
  return {
    context,
    calls,
    opened,
    sent,
    rightClick: () => listener({ target: { closest: () => ({ isContentEditable: true }) }, clientX: 0, clientY: 0 }),
    settle: () => new Promise((resolve) => setImmediate(resolve))
  };
}

test('Look Up: Dictionary… then Thesaurus…, then the word is spent once', async () => {
  const h = load();
  await h.settle();
  h.rightClick();
  assert.deepEqual(h.calls[0], ['set', 'batch']);
  const items = [];
  assert.equal(h.context.NeoWordContext.lookUpMenu(items, 'batch'), true);
  assert.deepEqual(items, [
    { label: 'Dictionary…', value: 'dictionary' },
    { label: 'Thesaurus…', value: 'thesaurus' }
  ]);
  const clears = h.calls.filter((c) => c[0] === 'clear');
  assert.equal(clears.length, 1, 'one clear for the pair');
});

test('Look Up: only the feature with data offers an item', async () => {
  const h = load({ thesaurusAvailable: false });
  await h.settle();
  h.rightClick();
  const items = [];
  assert.equal(h.context.NeoWordContext.lookUpMenu(items, 'batch'), true);
  assert.deepEqual(items, [{ label: 'Dictionary…', value: 'dictionary' }]);

  const other = load({ dictionaryAvailable: false });
  await other.settle();
  other.rightClick();
  const only = [];
  assert.equal(other.context.NeoWordContext.lookUpMenu(only, 'batch'), true);
  assert.deepEqual(only, [{ label: 'Thesaurus…', value: 'thesaurus' }]);
});

test('Look Up: a word the context does not hold offers nothing', async () => {
  const h = load();
  await h.settle();
  h.rightClick();
  const items = [];
  assert.equal(h.context.NeoWordContext.lookUpMenu(items, 'other'), false);
  assert.deepEqual(items, []);
});

test('action: the definition window opens with the word and its senses only', async () => {
  const h = load();
  await h.settle();
  h.context.NeoDictionary.openWord('batch');
  await h.settle();
  assert.deepEqual(h.sent, [['dictionary', 'batch']]);
  assert.equal(h.opened.length, 1);
  assert.deepEqual(Object.keys(h.opened[0]).sort(), ['count', 'editor', 'groups', 'word']);
  assert.equal('range' in h.opened[0], false, 'the dictionary never receives the replacement range');
  assert.equal(h.opened[0].word, 'batch');
});

test('action: a missing word message names it, and no window opens', async () => {
  const h = load();
  await h.settle();
  h.context.NeoForkNative.dictionary = () => Promise.resolve({ ok: false, reason: 'none' });
  h.context.NeoDictionary.openWord('xyzzyplugh');
  await h.settle();
  assert.equal(h.opened.length, 0);
});

test('action: the shared word is spent once the dictionary opens', async () => {
  const h = load();
  await h.settle();
  h.rightClick();
  assert.ok(h.context.NeoWordContext.current(), 'a word is held before the lookup');
  h.context.NeoDictionary.openWord('batch');
  await h.settle();
  assert.equal(h.context.NeoWordContext.current(), null);
  assert.ok(h.calls.some((c) => c[0] === 'clear'));
});

test('lookUpChoice: only the chosen feature answers', async () => {
  const h = load();
  await h.settle();
  h.rightClick();
  h.context.NeoWordContext.lookUpMenu([], 'batch');
  h.context.NeoWordContext.lookUpChoice('dictionary', 'batch');
  await h.settle();
  assert.deepEqual(h.sent, [['dictionary', 'batch']], 'Dictionary… must not open the thesaurus');

  const other = load();
  await other.settle();
  other.rightClick();
  other.context.NeoWordContext.lookUpMenu([], 'batch');
  other.context.NeoWordContext.lookUpChoice('thesaurus', 'batch');
  await other.settle();
  assert.deepEqual(other.sent, [['thesaurus', 'batch']], 'Thesaurus… must not open the dictionary');
});
