// NEO fork — the book's inventory ledger file (adr-008)
//
// The file is always <book folder>/neo-ext-inventory.json. The handler takes a
// book id, never a path, merges disk before writing, and refuses to overwrite
// an unreadable file or an iCloud placeholder.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const inventory = require('../neo-ext/inventory-main.js');
const ledger = require('../neo-ext/lib/inventory-ledger.js');

const at = 1_700_000_000_000;

function room() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-inventory-ipc-'));
  const book = 'book-the-lantern-year-1';
  fs.mkdirSync(path.join(dir, book));
  const deps = {
    libraryDir: () => dir,
    libName: (n) => n,
    bookDir: (id) => path.join(dir, id),
    isCloudOnly: () => false,
    whenLocal: () => null,
    writeFileDurable: (file, data) => fs.writeFileSync(file, data),
    logError: () => {}
  };
  return { dir, book, deps, file: path.join(dir, book, 'neo-ext-inventory.json') };
}

function sample(amount = 200, t = at) {
  const s = ledger.normalize({ format: 1, items: [], transactions: [] }).store;
  ledger.addItem(s, 'gold coin', 'Items', t);
  ledger.addTransaction(s, { itemId: s.items[0].id, chapterId: 'ch-1', amount, quote: 'saw 200 gold coins' }, t);
  return s;
}

test('inventory-ipc: a missing ledger reads as empty and writes only the book file', async () => {
  const { deps, book, file } = room();
  const read = await inventory.readStore(deps, book);
  assert.equal(read.ok, true);
  assert.equal(read.exists, false);
  assert.deepEqual(read.store, ledger.empty());
  const write = await inventory.writeStore(deps, book, sample());
  assert.equal(write.ok, true);
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.readdirSync(path.dirname(file)).length, 1, 'nothing but the ledger is written');
});

test('inventory-ipc: an unreadable ledger is reported and never overwritten', async () => {
  const { deps, book, file } = room();
  fs.writeFileSync(file, '{not json');
  const before = fs.readFileSync(file, 'utf8');
  const read = await inventory.readStore(deps, book);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'unreadable');
  const write = await inventory.writeStore(deps, book, sample());
  assert.equal(write.ok, false);
  assert.equal(write.reason, 'unreadable');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('inventory-ipc: a cloud placeholder is not read or written over', async () => {
  const { deps, book, file } = room();
  fs.writeFileSync(file, JSON.stringify(ledger.empty()));
  deps.isCloudOnly = () => true;
  deps.whenLocal = async () => new Set([file]);
  const read = await inventory.readStore(deps, book);
  assert.equal(read.reason, 'cloud');
  const write = await inventory.writeStore(deps, book, sample());
  assert.equal(write.reason, 'cloud');
  assert.equal(fs.readFileSync(file, 'utf8'), JSON.stringify(ledger.empty()));
});

test('inventory-ipc: a write merges a transaction that arrived on disk', async () => {
  const { deps, book } = room();
  await inventory.writeStore(deps, book, sample(200));
  const second = ledger.empty();
  const one = await inventory.readStore(deps, book);
  ledger.addItem(second, 'Silver', 'Items', at);
  ledger.addTransaction(second, { itemId: second.items[0].id, chapterId: 'ch-2', amount: 5, quote: 'silver coin' }, at + 1);
  const merged = await ledger.merge(one.store, second, at + 2);
  const write = await inventory.writeStore(deps, book, merged.store);
  assert.equal(write.ok, true);
  assert.equal(write.store.transactions.length, 2);
});

test('inventory-ipc: a retirement stays retired across a merge', async () => {
  const { deps, book, file } = room();
  const s = sample();
  await inventory.writeStore(deps, book, s);
  const read = await inventory.readStore(deps, book);
  const id = read.store.transactions[0].id;
  ledger.retireTransaction(read.store, id, at + 5);
  const write = await inventory.writeStore(deps, book, read.store);
  assert.equal(write.ok, true);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(stored.transactions[0].removedAt > 0);
});

test('inventory-ipc: an oversized ledger is refused', async () => {
  const { deps, book } = room();
  const big = sample();
  big.transactions[0].quote = 'x'.repeat(120);
  const write = await inventory.writeStore(deps, book, big, { maxBytes: 100 });
  assert.equal(write.ok, false);
  assert.equal(write.reason, 'large');
});

test('inventory-ipc: a corrupt main file recovers from its backup', async () => {
  const { deps, book, file } = room();
  await inventory.writeStore(deps, book, sample());
  fs.copyFileSync(file, file + '.bak');
  fs.writeFileSync(file, '{ half a write');
  const read = await inventory.readStore(deps, book);
  assert.equal(read.ok, true);
  assert.equal(read.recovered, true);
  const write = await inventory.writeStore(deps, book, sample(300));
  assert.equal(write.ok, true);
  assert.equal(JSON.parse(fs.readFileSync(file + '.bak', 'utf8')).transactions.length, 1, 'the good copy is not overwritten with the corrupt one');
});

test('inventory-ipc: a write for book A never lands in book B, and a bad id is refused', async () => {
  const { deps, book } = room();
  fs.mkdirSync(path.join(deps.libraryDir(), 'book-other-2'));
  const write = await inventory.writeStore(deps, book, sample());
  assert.equal(write.ok, true);
  assert.equal(fs.existsSync(path.join(deps.libraryDir(), 'book-other-2', 'neo-ext-inventory.json')), false);
  for (const bad of ['', '../book-other-2', 'book/../../x', null]) {
    const out = await inventory.writeStore(deps, bad, sample());
    assert.equal(out.ok, false, String(bad));
  }
});

test('inventory-ipc: the unreadable query names cloud chapters and ignores missing ones', async () => {
  const { deps, book } = room();
  const chapters = path.join(deps.libraryDir(), book, 'chapters');
  fs.mkdirSync(chapters, { recursive: true });
  fs.writeFileSync(path.join(chapters, 'ch-1.html'), '<p>one</p>');
  fs.writeFileSync(path.join(chapters, 'ch-2.html'), '<p>two</p>');
  deps.cloudOnlyAmong = async (files) => new Set(files.filter((file) => file.endsWith('ch-2.html')));
  const out = await inventory.unreadable(deps, book, ['ch-1', 'ch-2', 'ch-missing']);
  assert.equal(out.ok, true);
  assert.deepEqual(out.ids, ['ch-2']);
  const bad = await inventory.unreadable(deps, '../book-other-2', ['ch-1']);
  assert.equal(bad.ok, true);
  assert.deepEqual(bad.ids, ['ch-1'], 'a bad book id fails closed');
});

test('inventory-ipc: a merge over the limits is refused and leaves the readable file alone', async () => {
  const { deps, book, file } = room();
  const many = (prefix) => ({
    format: 1,
    items: Array.from({ length: 300 }, (_, i) => ({ id: `${prefix}-${i}`, name: `${prefix} ${i}`, category: 'Items', createdAt: at })),
    transactions: []
  });
  await inventory.writeStore(deps, book, many('a'));
  const before = fs.readFileSync(file, 'utf8');
  const out = await inventory.writeStore(deps, book, many('b'));
  assert.equal(out.ok, false);
  assert.equal(out.reason, 'large');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal((await inventory.readStore(deps, book)).ok, true);
});

test('inventory-ipc: a chapter path that is not a readable file counts as unreadable', async () => {
  const { deps, book } = room();
  const chapters = path.join(deps.libraryDir(), book, 'chapters');
  fs.mkdirSync(chapters, { recursive: true });
  fs.writeFileSync(path.join(chapters, 'ch-1.html'), '<p>one</p>');
  fs.mkdirSync(path.join(chapters, 'ch-2.html'));
  const out = await inventory.unreadable(deps, book, ['ch-1', 'ch-2']);
  assert.deepEqual(out.ids, ['ch-2']);
});

test('inventory-ipc: a planted .bak symlink is replaced, not followed', async () => {
  const { deps, book, file } = room();
  await inventory.writeStore(deps, book, sample());
  const outside = path.join(path.dirname(file), 'outside.json');
  fs.writeFileSync(outside, '{"keep":true}');
  fs.rmSync(file + '.bak', { force: true });
  fs.symlinkSync(outside, file + '.bak');
  const out = await inventory.writeStore(deps, book, sample(300));
  assert.equal(out.ok, true);
  assert.equal(fs.readFileSync(outside, 'utf8'), '{"keep":true}', 'nothing was written through the link');
  assert.equal(fs.lstatSync(file + '.bak').isFile(), true);
});
