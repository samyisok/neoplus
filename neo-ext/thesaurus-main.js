// NEO fork — thesaurus main process (adr-002, data moved to OEWN in adr-003)
//
// Owns the braces of the thesaurus: the data probe, the shard cache, the
// lookup, and the item it offers to the shared context-menu registry. The
// renderer resolves the word and hands it over synchronously, because the
// native menu is built in the same turn.

'use strict';

const fs = require('fs');
const path = require('path');

const rules = require('./lib/thesaurus-lookup.js');
const shardStore = require('./lib/shard-store.js');
const { t } = require('../i18n.js');

const DEFAULT_DATA = path.join(__dirname, 'thesaurus', 'en');
const FORMAT = 3;
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
    store: shardStore.create({ dir: dataDir, name: 'thesaurus', log }),
    status: null
  };
  const ipc = state.deps.ipcMain;
  if (!ipc) return;
  if (typeof ipc.handle !== 'function') return;
  ipc.handle('neo-ext:thesaurus-status', async () => status());
  ipc.handle('neo-ext:thesaurus', async (_event, word) => lookup(word));
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
    log('thesaurus data: ' + (err && err.message));
  }
  state.status = report;
  return report;
}

function shard(letter) {
  if (!state) return null;
  return state.store.load(letter);
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

// What the shared registry asks for. Null means "no item": a menu without the
// data must not offer a lookup that cannot answer.
function menuItem(word) {
  if (!word || !status().available) return null;
  return { action: 'thesaurus', label: label(), word };
}

module.exports = { init, lookup, status, menuItem };
