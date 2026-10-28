// NEO fork — the library-level records.json store (adr-005)
//
// One fixed file at the library root. Reads wait for iCloud without blocking
// the main process; writes re-read and merge, keep a .bak, and go through
// core's durable write. The renderer never names a path.

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const fileRules = require('./lib/records-file.js');
let model = null;
try { model = require('./lib/records-store.js'); } catch (err) {
  model = null;
  try { console.error('records: store unavailable:', err && err.message); } catch { /* no console */ }
}

const NAME = 'records.json';
const WAIT_MS = 8000;

function fileOf(deps) {
  return path.join(deps.libraryDir(), deps.libName(NAME));
}

function fail(reason) {
  return { ok: false, reason };
}

async function readStore(deps) {
  if (!model) return fail('unsupported');
  let file;
  try { file = fileOf(deps); } catch { return fail('path'); }
  let st;
  try { st = await fsp.stat(file); } catch (err) {
    if (err.code !== 'ENOENT') return fail(err.code || 'read');
    return { ok: true, exists: false, store: model.empty() };
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
  if (read.reason === 'missing') return { ok: true, exists: false, store: model.empty() };
  if (read.reason === 'unreadable') {
    // The last version that read whole is kept beside the file; use it rather
    // than leave the writer with a store NEO refuses to open.
    let bakSize = 0;
    try { bakSize = (await fsp.stat(file + '.bak')).size; } catch { bakSize = 0; }
    if (bakSize && bakSize <= fileRules.MAX_BYTES) {
      const bak = await readOne(file + '.bak');
      if (bak.ok) return { ok: true, exists: true, store: bak.store, recovered: true };
    }
  }
  return fail(read.reason || 'read');
}

async function readOne(file) {
  let text;
  try { text = await fsp.readFile(file, 'utf8'); } catch (err) {
    return { ok: false, reason: err.code === 'ENOENT' ? 'missing' : (err.code || 'read') };
  }
  let value;
  try { value = JSON.parse(text); } catch { return { ok: false, reason: 'unreadable' }; }
  const out = model.normalize(value);
  return out.ok ? { ok: true, store: out.store } : { ok: false, reason: 'unreadable' };
}

let writeChain = Promise.resolve();

async function writeNow(deps, payload) {
  if (!model) return fail('unsupported');
  const clean = model.normalize(payload);
  if (!clean.ok) return fail('invalid');
  let file;
  try { file = fileOf(deps); } catch { return fail('path'); }
  const payloadText = JSON.stringify(clean.store, null, 2);
  if (fileRules.sizeOfText(payloadText) > fileRules.MAX_BYTES) return fail('large');

  try {
    if (deps.isCloudOnly && deps.isCloudOnly(file)) return fail('cloud');
  } catch { return fail('cloud'); }

  const disk = await readStore(deps);
  if (!disk.ok) return disk;
  if (disk.recovered) {
    try { deps.logError && deps.logError('records write: recovered from records.json.bak'); } catch { /* logging is a nicety */ }
  }
  const merged = model.merge(disk.store, clean.store, Date.now());
  if (!merged.ok) return fail('unreadable');
  const mergedText = JSON.stringify(merged.store, null, 2);
  if (fileRules.sizeOfText(mergedText) > fileRules.MAX_BYTES) return fail('large');

  try {
    if (disk.exists && !disk.recovered) {
      try { await fsp.copyFile(file, file + '.bak'); } catch { /* the write itself decides */ }
    }
    const write = deps.writeFileDurable;
    if (typeof write !== 'function') return fail('write');
    await write(file, mergedText);
    return { ok: true, store: merged.store };
  } catch (err) {
    try { deps.logError && deps.logError('records write', err); } catch { /* logging is a nicety */ }
    return fail(err.code || 'write');
  }
}

function writeStore(deps, payload) {
  const run = writeChain.then(() => writeNow(deps, payload), () => writeNow(deps, payload));
  writeChain = run.then(() => {}, () => {});
  return run;
}

function init(deps) {
  if (!deps || !deps.ipcMain) return;
  deps.ipcMain.handle('neo-ext:records-read', () => readStore(deps));
  deps.ipcMain.handle('neo-ext:records-write', (_e, payload) => writeStore(deps, payload));
}

module.exports = { NAME, readStore, writeStore, init, fileOf };
