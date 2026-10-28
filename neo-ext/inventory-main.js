// NEO fork — the book's inventory ledger file (adr-008)
//
// One fixed file in the book folder. Reads wait for iCloud instead of blocking
// the main process; writes re-read and merge, keep a .bak, and go through
// core's durable write. The renderer never names a path, only a book id.

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const ledger = require('./lib/inventory-ledger.js');
const fileRules = require('./lib/records-file.js');

const NAME = 'neo-ext-inventory.json';
const WAIT_MS = 8000;
const BOOK_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;

function fail(reason) {
  return { ok: false, reason };
}

function cleanBookId(value) {
  if (typeof value !== 'string' || !BOOK_ID.test(value) || value.includes('..')) return '';
  return value;
}

function fileOf(deps, bookId) {
  const id = cleanBookId(bookId);
  if (!id) return '';
  const dir = deps.bookDir(id);
  return path.join(dir, deps.libName(NAME));
}

async function readOne(file) {
  let text;
  try { text = await fsp.readFile(file, 'utf8'); } catch (err) {
    return { ok: false, reason: err.code === 'ENOENT' ? 'missing' : (err.code || 'read') };
  }
  let value;
  try { value = JSON.parse(text); } catch { return { ok: false, reason: 'unreadable' }; }
  const out = ledger.normalize(value);
  return out.ok ? { ok: true, store: out.store } : { ok: false, reason: 'unreadable' };
}

async function readStore(deps, bookId) {
  let file;
  try { file = fileOf(deps, bookId); } catch { return fail('path'); }
  if (!file) return fail('path');

  let st;
  try { st = await fsp.stat(file); } catch (err) {
    if (err.code !== 'ENOENT') return fail(err.code || 'read');
    return { ok: true, exists: false, store: ledger.empty() };
  }
  if (!st.isFile()) return fail('read');
  if (st.size > fileRules.MAX_BYTES) return fail('large');

  try {
    if (deps.whenLocal) {
      const away = await deps.whenLocal([file], WAIT_MS);
      if (away && away.size) return fail('cloud');
    } else if (deps.isCloudOnly && deps.isCloudOnly(file)) {
      return fail('cloud');
    } else if (deps.cloudOnlyAmong) {
      const away = await deps.cloudOnlyAmong([file]);
      if (away && away.size) return fail('cloud');
    }
  } catch { return fail('cloud'); }

  const read = await readOne(file);
  if (read.ok) return { ok: true, exists: true, store: read.store };
  if (read.reason === 'missing') return { ok: true, exists: false, store: ledger.empty() };
  if (read.reason === 'unreadable') {
    try {
      const backup = file + '.bak';
      if (deps.whenLocal) {
        const away = await deps.whenLocal([backup], WAIT_MS);
        if (away && away.size) return fail('unreadable');
      } else if (deps.isCloudOnly && deps.isCloudOnly(backup)) {
        return fail('unreadable');
      }
    } catch { return fail('unreadable'); }
    let bakSize = 0;
    try { bakSize = (await fsp.stat(file + '.bak')).size; } catch { bakSize = 0; }
    if (bakSize && bakSize <= fileRules.MAX_BYTES) {
      const bak = await readOne(file + '.bak');
      if (bak.ok) return { ok: true, exists: true, store: bak.store, recovered: true };
    }
  }
  return fail(read.reason || 'read');
}

let writeChain = Promise.resolve();

async function writeNow(deps, bookId, payload, options) {
  const clean = ledger.normalize(payload);
  if (!clean.ok) return fail('invalid');
  const maxBytes = options && Number.isFinite(options.maxBytes) ? options.maxBytes : fileRules.MAX_BYTES;
  let file;
  try { file = fileOf(deps, bookId); } catch { return fail('path'); }
  if (!file) return fail('path');

  const payloadText = JSON.stringify(clean.store, null, 2);
  if (fileRules.sizeOfText(payloadText) > maxBytes) return fail('large');

  try {
    if (deps.isCloudOnly && deps.isCloudOnly(file)) return fail('cloud');
  } catch { return fail('cloud'); }

  const disk = await readStore(deps, bookId);
  if (!disk.ok) return disk;
  if (disk.recovered) {
    try { deps.logError && deps.logError('inventory write: recovered from the ledger backup'); } catch { /* logging is a nicety */ }
  }

  const merged = ledger.merge(disk.store, clean.store, Date.now());
  if (!merged.ok) return fail('unreadable');
  const text = JSON.stringify(merged.store, null, 2);
  if (fileRules.sizeOfText(text) > maxBytes) return fail('large');

  try {
    if (disk.exists && !disk.recovered) {
      try { await fsp.copyFile(file, file + '.bak'); } catch { /* the write itself decides */ }
    }
    const write = deps.writeFileDurable;
    if (typeof write !== 'function') return fail('write');
    await write(file, text);
    return { ok: true, store: merged.store };
  } catch (err) {
    try { deps.logError && deps.logError('inventory write', err); } catch { /* logging is a nicety */ }
    return fail(err.code || 'write');
  }
}

function writeStore(deps, bookId, payload, options) {
  const run = writeChain.then(() => writeNow(deps, bookId, payload, options), () => writeNow(deps, bookId, payload, options));
  writeChain = run.then(() => {}, () => {});
  return run;
}

function init(deps, ipcMain) {
  if (!deps || !ipcMain) return;
  ipcMain.handle('neo-ext:inventory-read', (_e, bookId) => readStore(deps, bookId));
  ipcMain.handle('neo-ext:inventory-write', (_e, bookId, payload) => writeStore(deps, bookId, payload));
}

// The native selection menu: one item when the selection can carry a
// transaction. The renderer has already decided that.
function menuItem(info, t) {
  if (!info || !info.phrase || !info.inventory) return null;
  return { label: t('Inventory…'), action: 'inventory-open', phrase: info.phrase };
}

module.exports = { NAME, readStore, writeStore, init, fileOf, menuItem, cleanBookId };
