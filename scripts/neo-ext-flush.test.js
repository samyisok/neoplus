// NEO fork — flushAndConfirm (adr-001)
//
// Loads neo-ext/api.js against faked core bindings: the same names app.js
// declares globally, so the wait is exercised without a browser.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'api.js'), 'utf8');

function load(core) {
  const context = vm.createContext({ window: {}, setTimeout, clearTimeout, console });
  vm.runInContext(source, context);
  vm.runInContext(core, context);
  return vm.runInContext('window.NeoExtApi', context);
}

const bindings = (extra = '') => `
  let book = { chapterOrder: ['a'] };
  let chapterHTML = { a: 'typed words' };
  let savedHTML = { a: '' };
  let sidecarPending = {};
  let auxPending = {};
  let chapterChain = {};
  ${extra}
  function flushAllSaves() { flushes++; }
`;

test('flush waits for the chapter write to land', async () => {
  const api = load(bindings(`
    let flushes = 0;
    flushAllSaves = function () { flushes++; setTimeout(() => { savedHTML.a = 'typed words'; }, 120); };
  `));
  assert.equal(await api.flushAndConfirm({ timeoutMs: 2000 }), true);
  assert.equal(await api.pending(), false);
});

test('flush gives up when the write never lands', async () => {
  const api = load(bindings(`let flushes = 0;`));
  assert.equal(await api.flushAndConfirm({ timeoutMs: 150 }), false);
});

test('flush waits for sidecars and notes too', async () => {
  const api = load(bindings(`
    let flushes = 0;
    flushAllSaves = function () { flushes++; savedHTML.a = 'typed words'; setTimeout(() => { delete sidecarPending.x; delete auxPending.y; }, 100); };
    sidecarPending = { x: {} };
    auxPending = { y: {} };
  `));
  assert.equal(await api.flushAndConfirm({ timeoutMs: 2000 }), true);
});
