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

test('records-store: tags normalize, add, remove, and dedupe by key', () => {
  const s = store.normalize({ format: 1, folders: [], records: [record('r1', 'John')] }).store;
  assert.deepEqual(store.activeTags(store.activeRecords(s)[0]), []);
  assert.equal(store.addTag(s, 'r1', '  Long   Chen ', at).ok, true);
  assert.equal(store.addTag(s, 'r1', 'long chen', at + 1).existing, true);
  assert.deepEqual(store.activeTags(store.activeRecords(s)[0]), ['Long Chen']);
  assert.equal(store.tagExists(s, 'LONG CHEN'), true);
  assert.equal(store.recordsWithTag(s, 'long chen')[0].title, 'John');
  assert.equal(store.removeTag(s, 'r1', 'Long Chen', at + 2).ok, true);
  assert.deepEqual(store.activeTags(store.activeRecords(s)[0]), []);
  assert.equal(store.tagExists(s, 'Long Chen'), false);
});

test('records-store: tag additions and removals merge with the newer event', () => {
  const a = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [{ text: 'Long Chen', at: at, removedAt: 0 }] })] }).store;
  const b = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [{ text: 'Silver', at: at + 1, removedAt: 0 }] })] }).store;
  const both = store.merge(a, b, at + 2).store;
  assert.deepEqual(store.activeTags(store.activeRecords(both)[0]).sort(), ['Long Chen', 'Silver']);
  const dead = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [{ text: 'Long Chen', at: at, removedAt: at + 3 }] })] }).store;
  const merged = store.merge(both, dead, at + 4).store;
  assert.deepEqual(store.activeTags(store.activeRecords(merged)[0]), ['Silver']);
});

test('records-store: old files without tags stay valid', () => {
  const s = store.normalize({ format: 1, folders: [], records: [{ id: 'r1', title: 'Old', createdAt: at, deletedAt: 0 }] });
  assert.equal(s.ok, true);
  assert.deepEqual(s.store.records[0].tags, []);
});

test('records-store: a record stops at 50 active tags, and a removed tag can return', () => {
  const s = store.normalize({ format: 1, folders: [], records: [record('r1', 'John')] }).store;
  for (let i = 0; i < 50; i++) assert.equal(store.addTag(s, 'r1', 'tag ' + i, at + i).ok, true);
  const overflow = store.addTag(s, 'r1', 'tag 51', at + 60);
  assert.equal(overflow.ok, false);
  assert.equal(overflow.reason, 'many');
  assert.equal(store.addTag(s, 'r1', 'TAG 1', at + 61).ok, true, 'an existing key stays allowed at the cap');
  assert.equal(store.removeTag(s, 'r1', 'tag 1', at + 62).ok, true);
  assert.equal(store.addTag(s, 'r1', 'Tag 1', at + 63).ok, true);
  assert.ok(store.activeTags(store.activeRecords(s)[0]).includes('Tag 1'));
});

test('records-store: removed tags free a place at the cap, so a record cannot freeze', () => {
  const s = store.normalize({ format: 1, folders: [], records: [record('r1', 'John')] }).store;
  for (let i = 0; i < 50; i++) store.addTag(s, 'r1', 'tag ' + i, at + i);
  for (let i = 0; i < 3; i++) assert.equal(store.removeTag(s, 'r1', 'tag ' + i, at + 50 + i).ok, true);
  const added = store.addTag(s, 'r1', 'a brand new tag', at + 60);
  assert.equal(added.ok, true, 'a removal frees a place for a new tag');
  assert.equal(store.activeTags(store.activeRecords(s)[0]).length, 48);
});

test('records-store: a merge keeps every tag from both copies, past the limit', () => {
  const tagsA = Array.from({ length: 30 }, (_, i) => ({ text: 'alpha ' + i, at: at + i, removedAt: 0 }));
  const tagsB = Array.from({ length: 30 }, (_, i) => ({ text: 'beta ' + i, at: at + i, removedAt: 0 }));
  const a = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: tagsA })] }).store;
  const b = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: tagsB })] }).store;
  const merged = store.merge(a, b, at + 100).store;
  const active = store.activeTags(store.activeRecords(merged)[0]);
  assert.equal(active.length, 60, 'no live tag is dropped by the merge');
  assert.ok(active.includes('alpha 29') && active.includes('beta 29'));
});

test('records-store: a merge keeps a tombstone even past the limit', () => {
  const tagsA = [
    ...Array.from({ length: 50 }, (_, i) => ({ text: 'live ' + i, at: at + i, removedAt: 0 })),
    { text: 'gone', at: at, removedAt: at + 10 }
  ];
  const b = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [{ text: 'other', at: at + 60, removedAt: 0 }] })] }).store;
  const a = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: tagsA })] }).store;
  const merged = store.merge(a, b, at + 100).store;
  const tags = store.activeRecords(merged)[0].tags;
  assert.ok(tags.some((t) => t.text === 'gone' && t.removedAt), 'the tombstone survives the merge');
  assert.equal(store.activeTags(store.activeRecords(merged)[0]).length, 51);
});

test('records-store: one unreadable tag is dropped, the record is kept', () => {
  const long = 'x'.repeat(121);
  const s = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [
    { text: 'Long Chen', at, removedAt: 0 },
    { text: long, at, removedAt: 0 },
    { text: 42, at, removedAt: 0 }
  ] })] });
  assert.equal(s.ok, true);
  assert.deepEqual(store.activeTags(s.store.records[0]), ['Long Chen']);
});

test('records-store: a create whose first tag cannot be stored fails instead of making an untagged record', () => {
  const s = store.normalize({ format: 1, folders: [], records: [] }).store;
  const out = store.addRecord(s, 'Long Chen', null, at, ['x'.repeat(121)]);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'tag');
  assert.equal(store.activeRecords(s).length, 0);
});

test('records-store: a removal beats an addition at the same time, and a re-add survives', () => {
  const added = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [{ text: 'Long Chen', at: at + 5, removedAt: 0 }] })] }).store;
  const removed = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [{ text: 'Long Chen', at: at, removedAt: at + 5 }] })] }).store;
  const tie = store.merge(added, removed, at + 10).store;
  assert.deepEqual(store.activeTags(store.activeRecords(tie)[0]), [], 'an equal stamp does not revive the tag');
  const readded = store.normalize({ format: 1, folders: [], records: [record('r1', 'John', at, { tags: [{ text: 'Long Chen', at: at + 6, removedAt: 0 }] })] }).store;
  const back = store.merge(tie, readded, at + 20).store;
  assert.deepEqual(store.activeTags(store.activeRecords(back)[0]), ['Long Chen'], 'a later add wins over an older removal');
});

test('records-store: store tags and tagExists agree, and the add reasons are distinct', () => {
  const s = store.normalize({ format: 1, folders: [], records: [record('r1', 'John')] }).store;
  store.addTag(s, 'r1', 'Long Chen', at);
  store.addTag(s, 'r1', 'Silver Series', at);
  const fromStore = store.storeTags(s).map((tag) => tag.toLocaleLowerCase()).sort();
  const asked = ['long chen', 'silver series', 'nope'].filter((tag) => store.tagExists(s, tag)).sort();
  assert.deepEqual(fromStore, asked);
  assert.equal(store.addTag(s, 'missing', 'x', at).reason, 'missing');
  assert.equal(store.addTag(s, 'r1', 'x'.repeat(121), at).reason, 'long');
});

test('records-store: re-adding a removed tag cannot push a record past the active cap', () => {
  const s = store.normalize({ format: 1, folders: [], records: [record('r1', 'John')] }).store;
  for (let i = 0; i < 50; i++) store.addTag(s, 'r1', 'tag ' + i, at + i);
  store.removeTag(s, 'r1', 'tag 0', at + 60);
  assert.equal(store.addTag(s, 'r1', 'filler', at + 61).ok, true, '49 + 1 = 50');
  const back = store.addTag(s, 'r1', 'tag 0', at + 62);
  assert.equal(back.ok, false);
  assert.equal(back.reason, 'many');
  assert.equal(store.activeTags(store.activeRecords(s)[0]).length, 50);
});

test('records-store: a create cannot carry more than 50 active tags', () => {
  const s = store.normalize({ format: 1, folders: [], records: [] }).store;
  const tags = Array.from({ length: 51 }, (_, i) => 'tag ' + i);
  const out = store.addRecord(s, 'Crowded', null, at, tags);
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'many');
  assert.equal(store.activeRecords(s).length, 0);
});
