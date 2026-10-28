// NEO fork — the selection menu's Inventory item (adr-008)
//
// The renderer stores the phrase and its anchor in the same turn as the
// right-click; the main process only turns that into a menu item.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const inventory = require('../neo-ext/inventory-main.js');
const tags = require('../neo-ext/lib/record-tags.js');
const forms = require('../neo-ext/lib/word-forms.js');

const anchor = { chapterId: 'ch-1', sectionId: 'sec-1', paragraph: 2, quote: 'saw 200 gold coins', hash: 'deadbeef' };

function room({ phrase = 'saw 200 gold coins', selected = true, books = true, records = true } = {}) {
  const calls = { phrase: [], choice: null };
  const p = { closest: (sel) => (String(sel).split(',').map((s) => s.trim()).includes('p') ? p : null) };
  const node = { nodeType: 3, data: phrase, parentElement: p };
  const range = { startContainer: node, endContainer: node, startOffset: 0, endOffset: 4, cloneRange() { return this; } };
  const body = { isContentEditable: true, closest: () => body };
  const selection = {
    rangeCount: selected ? 1 : 0, isCollapsed: !selected,
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
    document,
    getSelection: () => selection,
    NeoWordForms: forms,
    NeoRecordTags: tags,
    NeoExtApi: { moreFeatures: () => true, spellLanguage: () => 'en-US', x: (s) => s },
    NeoExt: { x: (s) => s },
    NeoForkNative: {
      setContextWord: () => {},
      clearContextWord: () => {},
      setContextPhrase: (p2, has, a, inv, records) => calls.phrase.push([p2, has, a, inv, records]),
      clearContextPhrase: () => {}
    },
    NeoRecords: records ? {
      tagReady: () => true,
      tagExists: () => false,
      lookUpItem: () => ({ label: 'Create Record…', value: 'record-create' })
    } : null,
    NeoInventory: books ? {
      canRecord: () => true,
      selectionAnchor: () => (selected ? anchor : null),
      openFromSelection: (phrase2, a) => { calls.choice = [phrase2, a]; }
    } : null
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'word-context.js'), 'utf8'), context);
  return { calls, fire: () => handler({ target: { closest: () => body }, clientX: 0, clientY: 0 }), context };
}

test('inventory-menu: a selection stores the phrase, the anchor, and the inventory flag', () => {
  const r = room();
  r.fire();
  const [phrase, hasTag, sentAnchor, inv] = r.calls.phrase.at(-1);
  assert.equal(phrase, 'saw 200 gold coins');
  assert.equal(hasTag, false);
  assert.deepEqual({ ...sentAnchor }, anchor);
  assert.equal(inv, true);
});

test('inventory-menu: an unreadable records file does not disable Inventory', () => {
  const r = room({ records: false });
  r.fire();
  assert.deepEqual(r.calls.phrase.at(-1), ['saw 200 gold coins', false, anchor, true, false]);
});

test('inventory-menu: the native item is one line and only when it applies', () => {
  const t = (s) => s;
  assert.deepEqual(inventory.menuItem({ phrase: 'saw 200 gold coins', inventory: true }, t), {
    label: 'Inventory…', action: 'inventory-open', phrase: 'saw 200 gold coins'
  });
  assert.equal(inventory.menuItem({ phrase: 'x', inventory: false }, t), null);
  assert.equal(inventory.menuItem(null, t), null);
});

test('inventory-menu: the Look Up popup offers Inventory for one word and routes its anchor', () => {
  const r = room({ phrase: 'gold' });
  r.fire();
  const items = [{ label: 'Look Up', value: 'lookup' }];
  assert.equal(r.context.NeoWordContext.lookUpMenu(items, 'gold'), true);
  assert.ok(items.some((item) => item.value === 'inventory-open'));
  r.context.NeoWordContext.lookUpChoice('inventory-open', 'gold');
  assert.deepEqual(r.calls.choice, ['gold', anchor]);
});

test('inventory-menu: no selection offers no inventory item', () => {
  const r = room({ selected: false });
  r.fire();
  assert.equal(r.calls.phrase.length, 0);
});

test('inventory-menu: the selection menu still carries the record item', () => {
  const r = room({ phrase: 'gold' });
  r.fire();
  const items = [{ label: 'Look Up', value: 'lookup' }];
  r.context.NeoWordContext.lookUpMenu(items, 'gold');
  assert.ok(items.some((item) => item.value === 'record-create'));
  assert.ok(items.some((item) => item.value === 'inventory-open'));
});
