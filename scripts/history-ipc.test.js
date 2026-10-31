// NEO fork — the book's history file (adr-014)
//
// The file is always <book folder>/neo-ext-history.json. The handler takes a
// book id, never a path; it stamps the entry's id and time, merges the disk
// before writing, and refuses to overwrite an unreadable file or a cloud
// placeholder.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const history = require('../neo-ext/history-main.js');
const log = require('../neo-ext/lib/history-log.js');

const at = 1_700_000_000_000;

function room() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-history-ipc-'));
  const book = 'book-the-lantern-year-1';
  fs.mkdirSync(path.join(dir, book));
  const deps = {
    libName: (n) => n,
    bookDir: (id) => path.join(dir, id),
    isCloudOnly: () => false,
    whenLocal: () => null,
    writeFileDurable: (file, data) => fs.writeFileSync(file, data),
    logError: () => {}
  };
  return { dir, book, deps, file: path.join(dir, book, 'neo-ext-history.json') };
}

function payload(over) {
  return {
    tool: 'thesaurus',
    label: 'Thesaurus',
    from: 'batch',
    to: 'pile',
    chapterId: 'ch-1',
    chapterNumber: 3,
    chapterTitle: 'The Thaw',
    ...(over || {})
  };
}

test('history-ipc: a missing history reads as empty and writes only the book file', async () => {
  const { deps, book, file } = room();
  const read = await history.readStore(deps, book);
  assert.equal(read.ok, true);
  assert.equal(read.exists, false);
  assert.deepEqual(read.store, log.empty());
  const out = await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  assert.equal(out.ok, true);
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.readdirSync(path.dirname(file)).length, 1, 'nothing but the history is written');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(stored.entries[0].id, 'e1');
  assert.equal(stored.entries[0].at, at);
});

test('history-ipc: a write merges an entry that arrived on disk, and keeps a backup', async () => {
  const { deps, book, file } = room();
  await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  const out = await history.addEntry(deps, book, payload({ tool: 'rephrase', label: 'Heroic', from: 'tired', to: 'spent' }), { now: at + 5, id: 'e2' });
  assert.equal(out.ok, true);
  assert.deepEqual(out.store.entries.map((e) => e.id), ['e2', 'e1']);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(stored.entries.length, 2);
  const backup = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'));
  assert.deepEqual(backup.entries.map((e) => e.id), ['e1']);
});

test('history-ipc: an unreadable history is reported and never overwritten', async () => {
  const { deps, book, file } = room();
  fs.writeFileSync(file, '{not json');
  const before = fs.readFileSync(file, 'utf8');
  const read = await history.readStore(deps, book);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'unreadable');
  const out = await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'unreadable');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('history-ipc: a corrupt main file is shown from its backup and never overwritten', async () => {
  const { deps, book, file } = room();
  await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  fs.copyFileSync(file, file + '.bak');
  fs.writeFileSync(file, '{ half a write');
  const read = await history.readStore(deps, book);
  assert.equal(read.ok, true);
  assert.equal(read.recovered, true);
  assert.deepEqual(read.store.entries.map((e) => e.id), ['e1']);
  const before = fs.readFileSync(file, 'utf8');
  const out = await history.addEntry(deps, book, payload({ from: 'good', to: 'fine' }), { now: at + 1, id: 'e2' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'unreadable');
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'the corrupt file is left for the writer to repair');
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).entries.map((e) => e.id), ['e1']);
});

test('history-ipc: two recordings at once both land', async () => {
  const { deps, book, file } = room();
  await Promise.all([
    history.addEntry(deps, book, payload({ from: 'a', to: 'A' }), { now: at, id: 'e1' }),
    history.addEntry(deps, book, payload({ from: 'b', to: 'B' }), { now: at + 1, id: 'e2' })
  ]);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(stored.entries.map((e) => e.id).sort(), ['e1', 'e2']);
});

test('history-ipc: a symlinked history file is not followed', async () => {
  const { deps, book, file } = room();
  const outside = path.join(path.dirname(file), 'outside.json');
  fs.writeFileSync(outside, JSON.stringify(log.empty()));
  fs.symlinkSync(outside, file);
  const read = await history.readStore(deps, book);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'read');
  const out = await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  assert.equal(out.ok, false);
  assert.equal(JSON.parse(fs.readFileSync(outside, 'utf8')).entries.length, 0);
});

test('history-ipc: a cloud placeholder is not read or written over', async () => {
  const { deps, book, file } = room();
  fs.writeFileSync(file, JSON.stringify(log.empty()));
  deps.isCloudOnly = () => true;
  deps.whenLocal = async () => new Set([file]);
  const read = await history.readStore(deps, book);
  assert.equal(read.reason, 'cloud');
  const out = await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  assert.equal(out.reason, 'cloud');
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(log.empty()));
});

test('history-ipc: an oversized entry is refused and the file is left alone', async () => {
  const { deps, book, file } = room();
  await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  const before = fs.readFileSync(file, 'utf8');
  const out = await history.addEntry(deps, book, payload({ from: 'x'.repeat(5000) }), { now: at + 1, id: 'e2', maxBytes: 400 });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'large');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('history-ipc: a bad book id or a bad entry is refused', async () => {
  const { deps, book } = room();
  for (const bad of ['', '../book-other-2', 'book/../../x', null, 7]) {
    const out = await history.addEntry(deps, bad, payload(), { now: at, id: 'e1' });
    assert.equal(out.ok, false, String(bad));
  }
  for (const entry of [{ ...payload(), tool: '' }, { ...payload(), from: '' }, null]) {
    const out = await history.addEntry(deps, book, entry, { now: at, id: 'e1' });
    assert.equal(out.ok, false);
    assert.equal(out.reason, 'invalid');
  }
});

test('history-ipc: a write for book A never lands in book B', async () => {
  const { deps, book, file } = room();
  const other = deps.bookDir('book-other-2');
  fs.mkdirSync(other);
  await history.addEntry(deps, 'book-other-2', payload({ from: 'other', to: 'elsewhere' }), { now: at, id: 'other-1' });
  const otherBefore = fs.readFileSync(path.join(other, 'neo-ext-history.json'), 'utf8');
  const out = await history.addEntry(deps, book, payload(), { now: at + 1, id: 'e1' });
  assert.equal(out.ok, true);
  assert.equal(fs.readFileSync(path.join(other, 'neo-ext-history.json'), 'utf8'), otherBefore, 'book B is untouched');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).entries.length, 1);
});

test('history-ipc: a planted .bak symlink is replaced, not followed', async () => {
  const { deps, book, file } = room();
  await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  const outside = path.join(path.dirname(file), 'outside.json');
  fs.writeFileSync(outside, '{"keep":true}');
  fs.rmSync(file + '.bak', { force: true });
  fs.symlinkSync(outside, file + '.bak');
  const out = await history.addEntry(deps, book, payload({ from: 'good', to: 'fine' }), { now: at + 1, id: 'e2' });
  assert.equal(out.ok, true);
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"keep":true}', 'nothing was written through the link');
  const bak = fs.lstatSync(file + '.bak');
  assert.equal(bak.isFile(), true, 'the backup is a regular file again');
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).entries.map((e) => e.id), ['e1']);
});

test('history-ipc: the handlers are registered and answer the bridge shape', async () => {
  const handlers = new Map();
  const { deps, book } = room();
  history.init(deps, { handle: (name, fn) => handlers.set(name, fn) });
  assert.equal(handlers.has('neo-ext:history-read'), true);
  assert.equal(handlers.has('neo-ext:history-add'), true);
  const read = await handlers.get('neo-ext:history-read')({}, book);
  assert.equal(read.ok, true);
  const added = await handlers.get('neo-ext:history-add')({}, book, payload());
  assert.equal(added.ok, true);
  assert.equal(added.store.entries.length, 1);
});

test('history-ipc: a failing durable write reports it and keeps a readable copy', async () => {
  const { deps, book, file } = room();
  await history.addEntry(deps, book, payload(), { now: at, id: 'e1' });
  await history.addEntry(deps, book, payload({ from: 'good', to: 'fine' }), { now: at + 1, id: 'e2' });
  deps.writeFileDurable = () => { const err = new Error('disk full'); err.code = 'ENOSPC'; throw err; };
  const out = await history.addEntry(deps, book, payload({ from: 'more', to: 'less' }), { now: at + 2, id: 'e3' });
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'ENOSPC');
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).entries.map((e) => e.id), ['e2', 'e1'], 'the main file is the last good one');
  assert.deepEqual(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).entries.map((e) => e.id), ['e2', 'e1'], 'the backup is a readable copy of it');
});
