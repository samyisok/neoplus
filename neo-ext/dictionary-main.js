// NEO fork — dictionary main process (adr-003)
//
// Owns the data probe, the shard store, and the lookup that answers with
// definitions. The dictionary never writes: it hands the window a word and the
// senses recorded for it, and nothing else.
//
// IPC:
//   neo-ext:dictionary-status  → { ok, available, language, headwords }
//   neo-ext:dictionary         → { ok, word, query, groups, count }
//                                | { ok: false, reason: 'none' | 'unavailable' }

'use strict';

const fs = require('fs');
const path = require('path');

const rules = require('./lib/word-forms.js');
const shardStore = require('./lib/shard-store.js');
const { t } = require('../i18n.js');

const DEFAULT_DATA = path.join(__dirname, 'dictionary', 'en');
const FORMAT = 1;
const MAX_WORD = rules.MAX_WORD || 120;

let state = null;

function log(msg) {
  try { state && state.deps && state.deps.logError && state.deps.logError('neo-ext', new Error(String(msg))); } catch { /* logging is a nicety */ }
}

function init(deps) {
  const dataDir = (deps && deps.dataDir) || DEFAULT_DATA;
  state = {
    deps: deps || {},
    dataDir,
    store: shardStore.create({ dir: dataDir, name: 'dictionary', log }),
    status: null
  };
  const ipc = state.deps.ipcMain;
  if (!ipc || typeof ipc.handle !== 'function') return;
  ipc.handle('neo-ext:dictionary-status', async () => status());
  ipc.handle('neo-ext:dictionary', async (_event, word) => lookup(word));
}

function status() {
  if (!state) return { ok: true, available: false, language: 'en' };
  if (state.status) return state.status;
  let report = { ok: true, available: false, language: 'en' };
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(state.dataDir, 'manifest.json'), 'utf8'));
    const readable = fs.existsSync(path.join(state.dataDir, 'shards'));
    if (manifest && manifest.format === FORMAT && manifest.language === 'en' && readable) {
      report = { ok: true, available: true, language: 'en', headwords: manifest.headwords || 0 };
    }
  } catch (err) {
    log('dictionary data: ' + (err && err.message));
  }
  state.status = report;
  return report;
}

function groupByPos(senses) {
  const groups = [];
  for (const sense of Array.isArray(senses) ? senses : []) {
    if (!sense || typeof sense.def !== 'string' || !sense.def.trim()) continue;
    let group = groups.find((g) => g.pos === sense.pos);
    if (!group) {
      group = { pos: sense.pos, senses: [] };
      groups.push(group);
    }
    const out = { def: sense.def };
    if (Array.isArray(sense.ex) && sense.ex.length) out.ex = sense.ex;
    group.senses.push(out);
  }
  return groups;
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
    try { entries = await state.store.load(letter); } catch { entries = null; }
    if (!entries || !Object.hasOwn(entries, form)) continue;
    const groups = groupByPos(entries[form]);
    const count = groups.reduce((n, g) => n + g.senses.length, 0);
    if (count > 0) return { ok: true, word: form, query: text, groups, count };
    // The exact word is in the data but has no definition to show. Answering
    // with a fallback form would describe a different word.
    if (form === forms[0]) return { ok: false, reason: 'none' };
  }
  return { ok: false, reason: 'none' };
}

function label() {
  try { return t('Dictionary…'); } catch { return 'Dictionary…'; }
}

// What the shared registry asks for. Null means "no item": a menu without the
// data must not offer a lookup that cannot answer.
function menuItem(word) {
  if (!word || !status().available) return null;
  return { action: 'dictionary', label: label(), word };
}

module.exports = { init, lookup, status, menuItem };
