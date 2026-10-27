// NEO fork — the guarded records.json reader/writer (adr-005)
//
// The file is always <library>/records.json. The handler never takes a path,
// merges what is on disk before writing, and refuses to overwrite an
// unreadable file or an iCloud placeholder.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const records = require('../neo-ext/records-main.js');
const model = require('../neo-ext/lib/records-store.js');

const at = 1_700_000_000_000;

function room() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-records-ipc-'));
  const deps = {
    libraryDir: () => dir,
    libName: (n) => n,
    isCloudOnly: () => false,
    requestDownload: () => {},
    whenLocal: () => null,
    writeFileDurable: (file, data) => fs.writeFileSync(file, data),
    logError: () => {}
  };
  return { dir, deps, file: path.join(dir, 'records.json') };
}

function sample(title, t = at) {
  return model.normalize({ format: 1, folders: [], records: [model.newRecord(title, null, t)] }).store;
}

test('records-ipc: a missing store reads as empty and writes only records.json', async () => {
  const { deps, file } = room();
  const read = await records.readStore(deps);
  assert.equal(read.ok, true);
  assert.equal(read.exists, false);
  const write = await records.writeStore(deps, sample('John Silver'));
  assert.equal(write.ok, true);
  assert.equal(fs.existsSync(file), true);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).records[0].title, 'John Silver');
  assert.equal(fs.readdirSync(path.dirname(file)).filter((n) => n.includes('records')).length, 1);
});

test('records-ipc: an invalid or oversized payload is refused', async () => {
  const { deps, file } = room();
  assert.equal((await records.writeStore(deps, { format: 2, records: [] })).ok, false);
  const huge = { format: 1, folders: [], records: [model.newRecord('x'.repeat(201), null, at)] };
  assert.equal((await records.writeStore(deps, huge)).ok, false);
  assert.equal(fs.existsSync(file), false);
});

test('records-ipc: an oversized file is refused before it is parsed', async () => {
  const { deps, file } = room();
  fs.writeFileSync(file, 'x'.repeat(model.MAX_BYTES + 1));
  const read = await records.readStore(deps);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'large');
});

test('records-ipc: an unreadable file is reported and never overwritten', async () => {
  const { deps, file } = room();
  fs.writeFileSync(file, '{not json');
  const before = fs.readFileSync(file, 'utf8');
  const read = await records.readStore(deps);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'unreadable');
  const write = await records.writeStore(deps, sample('John Silver'));
  assert.equal(write.ok, false);
  assert.equal(write.reason, 'unreadable');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('records-ipc: a cloud placeholder is not read or written over', async () => {
  const { deps, file } = room();
  fs.writeFileSync(file, '{}');
  deps.isCloudOnly = () => true;
  deps.whenLocal = async () => new Set([file]);
  const read = await records.readStore(deps);
  assert.equal(read.ok, false);
  assert.equal(read.reason, 'cloud');
  const write = await records.writeStore(deps, sample('John Silver'));
  assert.equal(write.ok, false);
  assert.equal(write.reason, 'cloud');
  assert.equal(fs.readFileSync(file, 'utf8'), '{}');
});

test('records-ipc: writing merges a record that arrived on disk after the read', async () => {
  const { deps, file } = room();
  await records.writeStore(deps, sample('John Silver'));
  const disk = JSON.parse(fs.readFileSync(file, 'utf8'));
  const payload = sample('The parrot');
  const write = await records.writeStore(deps, payload);
  assert.equal(write.ok, true);
  assert.deepEqual(write.store.records.map((r) => r.title).sort(), ['John Silver', 'The parrot']);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(after.records.length, 2);
  assert.ok(disk.records.length === 1);
});

test('records-ipc: two writes at once both survive', async () => {
  const { deps, file } = room();
  const [a, b] = await Promise.all([
    records.writeStore(deps, sample('John Silver')),
    records.writeStore(deps, sample('The parrot'))
  ]);
  assert.equal(a.ok, true);
  assert.equal(b.ok, true);
  const after = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(after.records.map((r) => r.title).sort(), ['John Silver', 'The parrot']);
});

test('records-ipc: the previous readable file is kept as .bak', async () => {
  const { deps, file } = room();
  await records.writeStore(deps, sample('First'));
  await records.writeStore(deps, sample('Second'));
  assert.equal(fs.existsSync(file + '.bak'), true);
  const bak = JSON.parse(fs.readFileSync(file + '.bak', 'utf8'));
  assert.equal(bak.records[0].title, 'First');
});

test('records-ipc: the path never comes from the caller', async () => {
  const { deps } = room();
  await records.writeStore(deps, { ...sample('One'), name: '../../outside' });
  assert.equal(fs.existsSync(path.join(path.dirname(deps.libraryDir()), 'outside')), false);
});
