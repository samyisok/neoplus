// NEO fork — Dictionary… and Thesaurus… share one menu seam (adr-003)
//
// The registry decides the order and asks each feature whether it can answer.
// The seam must add the items before the menu is built, each one only when its
// own data is readable, and never more than one separator.

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const registryLib = require('../neo-ext/lib/menu-registry.js');
const plugin = require('../neo-ext/main.js');

function feature(id, order, label, available) {
  return {
    id,
    order,
    menuItem: (word) => (available() ? { action: id, label: label(word), word } : null)
  };
}

test('registry: ordered by feature, not by registration', () => {
  const registry = registryLib.create();
  registry.register(feature('thesaurus', 20, () => 'Thesaurus…', () => true));
  registry.register(feature('dictionary', 10, () => 'Dictionary…', () => true));
  assert.deepEqual(registry.ids(), ['dictionary', 'thesaurus']);
  assert.deepEqual(registry.items('batch').map((i) => i.label), ['Dictionary…', 'Thesaurus…']);
});

test('registry: a feature without data is absent, the other stays', () => {
  const registry = registryLib.create();
  registry.register(feature('dictionary', 10, () => 'Dictionary…', () => false));
  registry.register(feature('thesaurus', 20, () => 'Thesaurus…', () => true));
  assert.deepEqual(registry.items('batch').map((i) => i.action), ['thesaurus']);
});

test('registry: a feature that throws does not take the other down', () => {
  const registry = registryLib.create();
  registry.register({ id: 'broken', order: 5, menuItem: () => { throw new Error('no data'); } });
  registry.register(feature('thesaurus', 20, () => 'Thesaurus…', () => true));
  assert.deepEqual(registry.items('batch').map((i) => i.action), ['thesaurus']);
});

function fakeMain() {
  const handlers = new Map();
  const listeners = new Map();
  const sent = [];
  plugin.init({
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) },
    logError: () => {},
    libraryDir: () => '',
    readSettings: () => ({}),
    writeSettings: () => {},
    bookDir: () => '',
    BrowserWindow: { getFocusedWindow: () => null, getAllWindows: () => [] }
  });
  const win = { webContents: { id: 7, send: (channel, msg) => sent.push({ channel, msg }) } };
  return { handlers, listeners, sent, win };
}

function seed(listeners, word, id = 7) {
  const event = { sender: { id }, returnValue: undefined };
  listeners.get('neo-ext:context-word')(event, word);
}

test('seam: the real pair appears in order with one separator', () => {
  const { listeners, win } = fakeMain();
  seed(listeners, 'batch');
  const items = [{ role: 'copy' }];
  plugin.contextMenu(items, {}, win);
  assert.deepEqual(items.map((i) => i.label || i.role || i.type), ['Dictionary…', 'Thesaurus…', 'separator', 'copy']);
});

test('seam: Dictionary…, Thesaurus…, then one separator', () => {
  const { listeners, win } = fakeMain();
  plugin.menuRegistry.clear();
  plugin.menuRegistry.register(feature('dictionary', 10, () => 'Dictionary…', () => true));
  plugin.menuRegistry.register(feature('thesaurus', 20, () => 'Thesaurus…', () => true));
  seed(listeners, 'batch');
  const items = [{ role: 'cut' }, { role: 'copy' }];
  plugin.contextMenu(items, {}, win);
  assert.deepEqual(items.map((i) => i.label || i.role || i.type), ['Dictionary…', 'Thesaurus…', 'separator', 'cut', 'copy']);
});

test('seam: only the available feature appears', () => {
  const { listeners, win } = fakeMain();
  plugin.menuRegistry.clear();
  plugin.menuRegistry.register(feature('dictionary', 10, () => 'Dictionary…', () => false));
  plugin.menuRegistry.register(feature('thesaurus', 20, () => 'Thesaurus…', () => true));
  seed(listeners, 'batch');
  const items = [{ role: 'copy' }];
  plugin.contextMenu(items, {}, win);
  assert.deepEqual(items.map((i) => i.label || i.role || i.type), ['Thesaurus…', 'separator', 'copy']);
});

test('seam: no word leaves every item untouched', () => {
  const { win } = fakeMain();
  const items = [{ role: 'cut' }, { type: 'separator' }, { role: 'copy' }];
  plugin.contextMenu(items, {}, win);
  assert.deepEqual(items, [{ role: 'cut' }, { type: 'separator' }, { role: 'copy' }]);
});

test('seam: a click sends the feature action with the word', () => {
  const { listeners, win, sent } = fakeMain();
  plugin.menuRegistry.clear();
  plugin.menuRegistry.register(feature('dictionary', 10, () => 'Dictionary…', () => true));
  seed(listeners, 'batch');
  const items = [];
  plugin.contextMenu(items, {}, win);
  items[0].click();
  assert.deepEqual(sent, [{ channel: 'menu', msg: { type: 'neo-ext', action: 'dictionary', word: 'batch' } }]);
});

test('seam: the word is spent once', () => {
  const { listeners, win } = fakeMain();
  plugin.menuRegistry.clear();
  plugin.menuRegistry.register(feature('dictionary', 10, () => 'Dictionary…', () => true));
  seed(listeners, 'batch');
  plugin.contextMenu([{ role: 'copy' }], {}, win);
  const second = [{ role: 'copy' }];
  plugin.contextMenu(second, {}, win);
  assert.deepEqual(second, [{ role: 'copy' }]);
});
