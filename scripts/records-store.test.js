// NEO fork — the library's record store (adr-005)
//
// Pure: no DOM, no filesystem. The main process uses the same rules before it
// writes, so a merged file and a merged view agree.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const store = require('../neo-ext/lib/records-store.js');

const at = 1_700_000_000_000;
const folder = (id, name, t = at) => ({ id, name, nameAt: t, createdAt: t, deletedAt: 0 });
const record = (id, title, t = at, extra = {}) => ({
  id, folderId: null, title, titleAt: t, body: '', bodyAt: t, folderAt: t, createdAt: t, deletedAt: 0, ...extra
});

test('records-store: an empty store is valid and sorts to nothing', () => {
  const empty = store.empty();
  assert.deepEqual(empty, { format: 1, folders: [], records: [] });
  assert.deepEqual(store.normalize(empty).store, empty);
  assert.deepEqual(store.activeRecords(empty), []);
  assert.deepEqual(store.activeFolders(empty), []);
});

test('records-store: a missing or malformed store is refused, not guessed', () => {
  for (const value of [null, undefined, '', [], {}, { format: 2, folders: [], records: [] }, { format: 1, records: 'x' }]) {
    const out = store.normalize(value);
    assert.equal(out.ok, false, JSON.stringify(value));
    assert.equal(typeof out.reason, 'string');
  }
});

test('records-store: titles, bodies, ids, and folders are normalised', () => {
  const value = {
    format: 1,
    folders: [folder('f1', '  The Silver Series  ')],
    records: [record('r1', '  John Silver  ', at, { body: 'a leg\nand a parrot', folderId: 'f1' })]
  };
  const out = store.normalize(value);
  assert.equal(out.ok, true);
  assert.equal(out.store.folders[0].name, 'The Silver Series');
  assert.equal(out.store.records[0].title, 'John Silver');
  assert.equal(out.store.records[0].body, 'a leg\nand a parrot');
});

test('records-store: a body or title over its cap is refused', () => {
  const out = store.normalize({ format: 1, folders: [], records: [record('r1', 'x'.repeat(201))] });
  assert.equal(out.ok, false);
  const body = store.normalize({ format: 1, folders: [], records: [record('r1', 'ok', at, { body: 'x'.repeat(100001) })] });
  assert.equal(body.ok, false);
});

test('records-store: new records and folders have stable ids and stamps', () => {
  const f = store.newFolder('Worlds', at);
  assert.equal(f.name, 'Worlds');
  assert.equal(f.nameAt, at);
  assert.ok(f.id.length > 10);
  const r = store.newRecord('John Silver', null, at);
  assert.equal(r.title, 'John Silver');
  assert.equal(r.folderId, null);
  assert.equal(r.titleAt, at);
  assert.equal(r.deletedAt, 0);
});

test('records-store: merge keeps records added on either side', () => {
  const a = store.normalize({ format: 1, folders: [], records: [record('r1', 'John Silver')] }).store;
  const b = store.normalize({ format: 1, folders: [], records: [record('r2', 'The parrot', at + 1)] }).store;
  const merged = store.merge(a, b, at + 2).store;
  assert.deepEqual(store.activeRecords(merged).map((r) => r.title).sort(), ['John Silver', 'The parrot']);
});

test('records-store: merge keeps a newer title and a newer body from different devices', () => {
  const a = store.normalize({ format: 1, folders: [], records: [record('r1', 'John Silver', at, { body: 'old' })] }).store;
  const b = store.normalize({ format: 1, folders: [], records: [record('r1', 'Long John Silver', at + 1, { body: 'old' })] }).store;
  const c = store.normalize({ format: 1, folders: [], records: [record('r1', 'Long John Silver', at + 2, { body: 'a leg and a parrot' })] }).store;
  const merged = store.merge(a, store.merge(b, c, at + 3).store, at + 4).store;
  const r = store.activeRecords(merged).find((x) => x.id === 'r1');
  assert.equal(r.title, 'Long John Silver');
  assert.equal(r.body, 'a leg and a parrot');
});

test('records-store: a newer folder choice wins, and an unknown folder means Unsorted', () => {
  const a = store.normalize({ format: 1, folders: [folder('f1', 'One')], records: [record('r1', 'John', at, { folderId: 'f1' })] }).store;
  const b = store.normalize({ format: 1, folders: [folder('f1', 'One')], records: [record('r1', 'John', at + 1, { folderId: null })] }).store;
  assert.equal(store.activeRecords(store.merge(a, b, at + 2).store)[0].folderId, null);
  const gone = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { folderId: 'missing' })] }).store;
  assert.equal(store.activeRecords(gone)[0].folderId, null);
});

test('records-store: a tombstone is final, even against later content', () => {
  const a = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at)] }).store;
  const dead = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { deletedAt: at + 1 })] }).store;
  const edited = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at + 5)] }).store;
  for (const out of [store.merge(a, dead, at + 6), store.merge(dead, edited, at + 7), store.merge(edited, dead, at + 8)]) {
    const merged = out.store;
    assert.deepEqual(store.activeRecords(merged), []);
  }
});

test('records-store: deleting a folder moves its records to Unsorted', () => {
  const a = store.normalize({ format: 1, folders: [folder('f1', 'One')], records: [record('r1', 'John', at, { folderId: 'f1' })] }).store;
  const dead = { ...a, folders: a.folders.map((f) => ({ ...f, deletedAt: at + 1 })) };
  const merged = store.merge(a, dead, at + 2).store;
  assert.deepEqual(store.activeFolders(merged), []);
  assert.equal(store.activeRecords(merged)[0].folderId, null);
});

test('records-store: merge is idempotent and order independent', () => {
  const a = store.normalize({ format: 1, folders: [folder('f1', 'One')], records: [record('r1', 'A')] }).store;
  const b = store.normalize({ format: 1, folders: [folder('f2', 'Two')], records: [record('r2', 'B', at + 1)] }).store;
  const ab = store.merge(a, b, at + 2).store;
  assert.deepEqual(store.merge(ab, b, at + 3).store, ab);
  assert.deepEqual(store.merge(b, a, at + 3).store, ab);
});

test('records-store: a clock far in the future is clamped', () => {
  const future = store.normalize({ format: 1, folders: [], records: [record('r1', 'Future', at + 86_400_000)] }, at).store;
  assert.equal(future.records[0].titleAt, at + 60_000);
  const later = store.normalize({ format: 1, folders: [], records: [record('r1', 'Later', at + 120_000)] }, at + 120_000).store;
  const merged = store.merge(future, later, at + 120_000).store;
  assert.equal(store.activeRecords(merged)[0].title, 'Later');
});

test('records-store: active lists and sorting are stable', () => {
  const s = store.normalize({
    format: 1,
    folders: [folder('f2', 'Zulu'), folder('f1', 'Alpha')],
    records: [record('r2', 'beta', at, { title: 'beta' }), record('r1', 'Alpha', at, { title: 'Alpha' })]
  }).store;
  assert.deepEqual(store.activeFolders(s).map((f) => f.name), ['Alpha', 'Zulu']);
  assert.deepEqual(store.activeRecords(s).map((r) => r.title), ['Alpha', 'beta']);
});

test('records-store: mutations keep id and folder invariants', () => {
  const s = store.empty();
  const f = store.addFolder(s, 'The Silver Series', at);
  assert.equal(f.ok, true);
  const r = store.addRecord(s, 'John Silver', f.folder.id, at);
  assert.equal(r.ok, true);
  assert.equal(store.folderOf(s, r.record), f.folder.id);
  assert.equal(store.renameRecord(s, r.record.id, 'Long John Silver', at + 1).ok, true);
  assert.equal(store.setBody(s, r.record.id, 'a leg', at + 2).ok, true);
  assert.equal(store.moveRecord(s, r.record.id, null, at + 3).ok, true);
  assert.equal(store.folderOf(s, r.record), null);
  assert.equal(store.renameFolder(s, f.folder.id, 'Silver Series', at + 4).ok, true);
  assert.equal(store.addFolder(s, 'silver series', at + 5).ok, false);
  assert.equal(store.addFolder(s, 'Unsorted', at + 6).ok, false);
  assert.equal(store.deleteFolder(s, f.folder.id, at + 7).ok, true);
  assert.deepEqual(store.activeFolders(s), []);
  assert.equal(store.deleteRecord(s, r.record.id, at + 8).ok, true);
  assert.deepEqual(store.activeRecords(s), []);
});

test('records-store: an invalid merge is refused, never silently emptied', () => {
  const good = store.normalize({ format: 1, folders: [], records: [record('r1', 'A')] }).store;
  const bad = store.merge(good, { format: 2 }, at);
  assert.equal(bad.ok, false);
  assert.equal(typeof bad.reason, 'string');
});

test('records-store: a store with too many items is refused before it is parsed', () => {
  const many = { format: 1, folders: [], records: Array.from({ length: 20001 }, (_, i) => record('r' + i, 'x')) };
  const out = store.normalize(many);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'count');
});
