// NEO fork — the word or phrase the native menu is about to offer (adr-003, adr-006)
//
// The renderer stores it in the same turn as the right-click; the menu is built
// a moment later in the main process. One store per window, spent once, and
// stale after five seconds, so a word or phrase left behind by a menu the
// renderer replaced (the spellcheck list, Look Up) never resurfaces minutes
// later. A word is asynchronous to store and clear; a phrase is synchronous at
// the menu turn, so a stale phrase cannot label the menu being built.

'use strict';

const { MAX_WORD } = require('./lib/word-forms.js');
const { MAX_PHRASE } = require('./lib/record-tags.js');

const TTL_MS = 5000;

let state = null;

function init(deps) {
  state = {
    deps: deps || {},
    words: new Map(),
    phrases: new Map(),
    now: (deps && typeof deps.now === 'function' && deps.now) || Date.now
  };
  const ipc = state.deps.ipcMain;
  if (!ipc || typeof ipc.on !== 'function') return;
  ipc.on('neo-ext:context-word', (event, word) => {
    const key = senderKey(event);
    const text = typeof word === 'string' ? word.slice(0, MAX_WORD) : '';
    if (text) state.words.set(key, { word: text, at: state.now() });
    else state.words.delete(key);
    try { event.returnValue = true; } catch { /* fire-and-forget send */ }
  });
  ipc.on('neo-ext:context-phrase', (event, payload) => {
    const key = senderKey(event);
    const phrase = payload && typeof payload.phrase === 'string' && payload.phrase.length <= MAX_PHRASE ? payload.phrase : '';
    if (phrase) state.phrases.set(key, { phrase, hasTag: !!(payload && payload.hasTag), at: state.now() });
    else state.phrases.delete(key);
    try { event.returnValue = true; } catch { /* fire-and-forget send */ }
  });
}

function senderKey(event) {
  const id = event && event.sender && event.sender.id;
  return id === undefined || id === null ? '0' : String(id);
}

function windowKey(win) {
  const id = win && win.webContents && win.webContents.id;
  return id === undefined || id === null ? '0' : String(id);
}

// Reads and spends the word for this window. Empty means "no word": either the
// renderer cleared it or the menu it was stored for never appeared.
function take(win) {
  if (!state) return '';
  const key = windowKey(win);
  const held = state.words.get(key);
  state.words.delete(key);
  return held && state.now() - held.at < TTL_MS ? held.word : '';
}

function takePhrase(win) {
  if (!state) return null;
  const key = windowKey(win);
  const held = state.phrases.get(key);
  state.phrases.delete(key);
  return held && state.now() - held.at < TTL_MS ? { phrase: held.phrase, hasTag: !!held.hasTag } : null;
}

module.exports = { init, take, takePhrase, MAX_WORD, MAX_PHRASE, TTL_MS };
