// NEO fork — the library-level records.json store (adr-005)
//
// One fixed file at the library root. Reads wait for iCloud without blocking
// the main process; writes re-read and merge, keep a .bak, and go through
// core's durable write. The renderer never names a path.

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const model = require('./lib/records-store.js');

const NAME = 'records.json';
const WAIT_MS = 8000;

function fileOf(deps) {
  return path.join(deps.libraryDir(), deps.libName(NAME));
}

function fail(reason) {
  return { ok: false, reason };
}

async function readStore(deps) {
  let file;
  try { file = fileOf(deps); } catch { return fail('path'); }
  let st;
  try { st = await fsp.stat(file); } catch (err) {
    if (err.code !== 'ENOENT') return fail(err.code || 'read');
    return { ok: true, exists: false, store: model.empty() };
  }
  if (!st.isFile()) return fail('read');
  if (st.size > model.MAX_BYTES) return fail('large');

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

  let text;
  try { text = await fsp.readFile(file, 'utf8'); } catch (err) {
    if (err.code === 'ENOENT') return { ok: true, exists: false, store: model.empty() };
    return fail(err.code || 'read');
  }
  let value;
  try { value = JSON.parse(text); } catch { return fail('unreadable'); }
  const out = model.normalize(value);
  if (!out.ok) return fail('unreadable');
  return { ok: true, exists: true, store: out.store };
}

let writeChain = Promise.resolve();

async function writeNow(deps, payload) {
  const clean = model.normalize(payload);
  if (!clean.ok) return fail('invalid');
  let file;
  try { file = fileOf(deps); } catch { return fail('path'); }
  if (model.sizeOf(clean.store) > model.MAX_BYTES) return fail('large');

  try {
    if (deps.isCloudOnly && deps.isCloudOnly(file)) return fail('cloud');
  } catch { return fail('cloud'); }

  const disk = await readStore(deps);
  if (!disk.ok) return disk;
  const merged = model.merge(disk.store, clean.store, Date.now());
  if (!merged.ok) return fail('unreadable');
  if (model.sizeOf(merged.store) > model.MAX_BYTES) return fail('large');

  try {
    if (disk.exists) {
      try { await fsp.copyFile(file, file + '.bak'); } catch { /* the write itself decides */ }
    }
    const write = deps.writeFileDurable;
    if (typeof write !== 'function') return fail('write');
    await write(file, JSON.stringify(merged.store, null, 2));
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
