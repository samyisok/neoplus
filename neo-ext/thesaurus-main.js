// NEO fork — thesaurus main process (adr-002)
//
// Owns the shard cache and the place a right-click grows Electron's native
// menu (seam 5). The renderer resolves the word and hands it over
// synchronously, because the native menu is built in the same turn.

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const rules = require('./lib/thesaurus-lookup.js');
const { t } = require('../i18n.js');

const gunzip = promisify(zlib.gunzip);
const DEFAULT_DATA = path.join(__dirname, 'thesaurus', 'en');
const MAX_WORD = rules.MAX_WORD || 120;
const MAX_SHARD = 32 * 1024 * 1024;
const CACHED_SHARDS = 3;

let state = null;

function log(msg) {
  try { state && state.deps && state.deps.logError && state.deps.logError('neo-ext', new Error(String(msg))); } catch { /* logging is a nicety */ }
}

function init(deps) {
  state = {
    deps: deps || {},
    dataDir: (deps && deps.dataDir) || DEFAULT_DATA,
    shards: new Map(),
    status: null,
    words: new Map()
  };
  const ipc = state.deps.ipcMain;
  if (!ipc) return;

  ipc.on('neo-ext:context-word', (event, word) => {
    const key = senderKey(event);
    const text = typeof word === 'string' ? word.slice(0, MAX_WORD) : '';
    if (text) state.words.set(key, { word: text, at: Date.now() });
    else state.words.delete(key);
    try { event.returnValue = true; } catch { /* fire-and-forget send */ }
  });

  ipc.handle('neo-ext:thesaurus-status', async () => status());
  ipc.handle('neo-ext:thesaurus', async (_event, word) => lookup(word));
}

function senderKey(event) {
  const id = event && event.sender && event.sender.id;
  return id === undefined || id === null ? '0' : String(id);
}

function status() {
  if (!state) return { ok: true, available: false, language: 'en' };
  if (state.status) return state.status;
  let report = { ok: true, available: false, language: 'en' };
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(state.dataDir, 'manifest.json'), 'utf8'));
    const readable = fs.existsSync(path.join(state.dataDir, 'shards'));
    if (manifest && manifest.format === 2 && manifest.language === 'en' && readable) {
      report = { ok: true, available: true, language: 'en', headwords: manifest.headwords || 0 };
    }
  } catch (err) {
    log('thesaurus data: ' + (err && err.message));
  }
  state.status = report;
  return report;
}

function trimShards() {
  while (state.shards.size > CACHED_SHARDS) state.shards.delete(state.shards.keys().next().value);
}

async function shard(letter) {
  if (!state) return null;
  if (state.shards.has(letter)) return state.shards.get(letter);
  const file = path.join(state.dataDir, 'shards', `${letter}.json.gz`);
  const loading = fsp.readFile(file)
    .then((gz) => gunzip(gz, { maxOutputLength: MAX_SHARD }))
    .then((buf) => JSON.parse(buf.toString('utf8')))
    .catch((err) => {
      log('thesaurus shard ' + letter + ': ' + (err && err.message));
      state.shards.delete(letter); // a transient read failure must be retryable
      return null;
    });
  state.shards.set(letter, loading);
  trimShards();
  return loading;
}

async function lookup(raw) {
  if (!state) return { ok: false, reason: 'unavailable' };
  if (!status().available) return { ok: false, reason: 'unavailable' };
  if (typeof raw !== 'string') return { ok: false, reason: 'none' };
  const text = raw.trim();
  if (!text || text.length > MAX_WORD) return { ok: false, reason: 'none' };
  const forms = rules.candidates(text);
  if (!forms.length) return { ok: false, reason: 'none' };
  for (const form of forms) {
    const letter = rules.shardFor(form);
    if (!letter) continue;
    let entries = null;
    try { entries = await shard(letter); } catch { entries = null; }
    if (!entries || !Object.hasOwn(entries, form)) continue;
    const merged = rules.mergeSenses(entries[form], text);
    if (merged.count > 0) {
      return { ok: true, word: form, query: text, groups: merged.groups, count: merged.count };
    }
    // The exact word is in the data but has nothing else to offer. Answering
    // with a fallback form's synonyms would name a different word.
    if (form === forms[0]) return { ok: false, reason: 'none' };
  }
  return { ok: false, reason: 'none' };
}

function label() {
  try { return t('Thesaurus…'); } catch { return 'Thesaurus…'; }
}

function menuItem(word, send) {
  return {
    label: label(),
    click: () => {
      try { send(word); } catch (err) { log('thesaurus send: ' + (err && err.message)); }
    }
  };
}

// Seam 5: called before Menu.buildFromTemplate(items).popup(). The word was
// stored by the renderer's capture-phase listener in this same turn.
function contextMenu(items, params, win) {
  if (!Array.isArray(items)) return;
  const id = win && win.webContents && win.webContents.id;
  const key = id === undefined || id === null ? '0' : String(id);
  const held = state ? state.words.get(key) : null;
  if (state) state.words.delete(key);
  // a word stored for a menu that the renderer replaced with its own (the
  // spellcheck list, Look Up) must not resurface minutes later
  const word = held && Date.now() - held.at < 5000 ? held.word : '';
  if (!word || !status().available) return;
  const send = (text) => {
    try { win.webContents.send('menu', { type: 'neo-ext', action: 'thesaurus', word: text }); } catch { /* window closed */ }
  };
  items.unshift(menuItem(word, send), { type: 'separator' });
}

module.exports = { init, lookup, status, contextMenu };
