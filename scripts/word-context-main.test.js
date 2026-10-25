// NEO fork — the word the native menu is about to offer (adr-003)
//
// The renderer stores the word synchronously in the same turn as the
// right-click; the menu is built a moment later in the main process. One store
// per window, spent once, and stale after five seconds.

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const context = require('../neo-ext/word-context-main.js');

function fake(clock) {
  const listeners = new Map();
  context.init({
    ipcMain: { on: (ch, fn) => listeners.set(ch, fn), handle: () => {} },
    logError: () => {},
    now: clock ? () => clock.at : undefined
  });
  const win = (id) => ({ webContents: { id, send: () => {} } });
  return { listeners, win };
}

test('a stored word is read by its own window, once', () => {
  const { listeners, win } = fake();
  const event = { sender: { id: 1 }, returnValue: undefined };
  listeners.get('neo-ext:context-word')(event, 'batch');
  assert.equal(event.returnValue, true);
  assert.equal(context.take(win(1)), 'batch');
  assert.equal(context.take(win(1)), '', 'the second menu gets nothing');
});

test('windows do not share a stored word', () => {
  const { listeners, win } = fake();
  listeners.get('neo-ext:context-word')({ sender: { id: 1 } }, 'batch');
  assert.equal(context.take(win(2)), '');
  assert.equal(context.take(win(1)), 'batch');
});

test('a word older than five seconds is stale', () => {
  const clock = { at: 1000 };
  const { listeners, win } = fake(clock);
  listeners.get('neo-ext:context-word')({ sender: { id: 1 } }, 'batch');
  clock.at = 5999;
  assert.equal(context.take(win(1)), 'batch', 'just inside the window');
  listeners.get('neo-ext:context-word')({ sender: { id: 1 } }, 'batch');
  clock.at = 11000;
  assert.equal(context.take(win(1)), '', 'past five seconds');
});

test('an empty word clears what was stored', () => {
  const { listeners, win } = fake();
  listeners.get('neo-ext:context-word')({ sender: { id: 1 } }, 'batch');
  listeners.get('neo-ext:context-word')({ sender: { id: 1 } }, '');
  assert.equal(context.take(win(1)), '');
});

test('an overlong word is cut before it is kept', () => {
  const { listeners, win } = fake();
  listeners.get('neo-ext:context-word')({ sender: { id: 1 } }, 'x'.repeat(500));
  assert.equal(context.take(win(1)).length, context.MAX_WORD);
});
