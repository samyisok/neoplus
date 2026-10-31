// NEO fork — the book's replacement history file (adr-014)
//
// One fixed file in the book folder. Reads wait for iCloud instead of blocking
// the main process; a write re-reads the file, merges, appends the new entry,
// keeps a .bak, and goes through core's durable write. The renderer never names
// a path, only a book id.

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');
const log = require('./lib/history-log.js');
const fileRules = require('./lib/records-file.js');

const NAME = 'neo-ext-history.json';
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
  const out = log.normalize(value);
  return out.ok ? { ok: true, store: out.store } : { ok: false, reason: 'unreadable' };
}

async function readStore(deps, bookId) {
  let file;
  try { file = fileOf(deps, bookId); } catch { return fail('path'); }
  if (!file) return fail('path');

  let st;
  try { st = await fsp.lstat(file); } catch (err) {
    if (err.code !== 'ENOENT') return fail(err.code || 'read');
    return { ok: true, exists: false, store: log.empty() };
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
  if (read.reason === 'missing') return { ok: true, exists: false, store: log.empty() };
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
    try {
      const bak = await fsp.lstat(file + '.bak');
      // The backup is read like the main file: a link, FIFO, or device is not
      // a history, and reading one could wait forever on the write chain.
      if (!bak.isFile()) return fail('unreadable');
      bakSize = bak.size;
    } catch { bakSize = 0; }
    if (bakSize && bakSize <= fileRules.MAX_BYTES) {
      const bak = await readOne(file + '.bak');
      if (bak.ok) return { ok: true, exists: true, store: bak.store, recovered: true };
    }
  }
  return fail(read.reason || 'read');
}

let writeChain = Promise.resolve();

async function writeNow(deps, bookId, payload, options) {
  const now = options && Number.isFinite(options.now) ? options.now : Date.now();
  const id = (options && typeof options.id === 'string' && options.id) || crypto.randomUUID();
  const made = log.makeEntry(payload, { now, id });
  if (!made.ok) return fail('invalid');

  let file;
  try { file = fileOf(deps, bookId); } catch { return fail('path'); }
  if (!file) return fail('path');

  const maxBytes = options && Number.isFinite(options.maxBytes) ? options.maxBytes : fileRules.MAX_BYTES;
  const write = deps.writeFileDurable;
  if (typeof write !== 'function') return fail('write');

  try {
    if (deps.isCloudOnly && deps.isCloudOnly(file)) return fail('cloud');
  } catch { return fail('cloud'); }

  const disk = await readStore(deps, bookId);
  if (!disk.ok) return disk;
  // A corrupt main file is shown from its backup and never written over: the
  // writer can still read the last good copy while the file is repaired.
  if (disk.recovered) {
    try { deps.logError && deps.logError('history write', new Error('the main file is unreadable')); } catch { /* logging is a nicety */ }
    return fail('unreadable');
  }

  const appended = log.append(disk.store, made.entry);
  if (!appended.ok) return fail(appended.reason === 'count' ? 'large' : 'unreadable');
  const checked = log.normalize(appended.store, now);
  if (!checked.ok) return fail(checked.reason === 'count' ? 'large' : 'unreadable');

  const text = JSON.stringify(checked.store, null, 2);
  if (fileRules.sizeOfText(text) > maxBytes) return fail('large');

  try {
    if (disk.exists) {
      // Copy to a fresh name and rename over the backup. Rename replaces a
      // planted `.bak` link itself, and a failed copy leaves the previous
      // backup in place rather than deleting it first.
      const tmp = file + '.bak.tmp';
      try {
        await fsp.rm(tmp, { force: true });
        await fsp.copyFile(file, tmp);
        await fsp.rename(tmp, file + '.bak');
      } catch (err) {
        try { deps.logError && deps.logError('history backup', err); } catch { /* logging is a nicety */ }
      }
    }
    await write(file, text);
    return { ok: true, store: checked.store };
  } catch (err) {
    try { deps.logError && deps.logError('history write', err); } catch { /* logging is a nicety */ }
    return fail(err.code || 'write');
  }
}

function addEntry(deps, bookId, payload, options) {
  const run = writeChain.then(
    () => writeNow(deps, bookId, payload, options),
    () => writeNow(deps, bookId, payload, options)
  );
  writeChain = run.then(() => {}, () => {});
  return run;
}

function init(deps, ipcMain) {
  if (!deps || !ipcMain) return;
  ipcMain.handle('neo-ext:history-read', (_e, bookId) => readStore(deps, bookId));
  ipcMain.handle('neo-ext:history-add', (_e, bookId, payload) => addEntry(deps, bookId, payload));
}

module.exports = { NAME, readStore, addEntry, init, fileOf, cleanBookId };
