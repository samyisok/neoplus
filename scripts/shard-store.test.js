// NEO fork — the shard store behind both lexical features (adr-003)
//
// Three shards stay in memory in insertion order, a failed read is dropped so
// the next lookup may retry, and a letter that is not a letter never touches
// the disk.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');

const shardStore = require('../neo-ext/lib/shard-store.js');

function makeDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-shard-'));
  fs.mkdirSync(path.join(dir, 'shards'));
  return dir;
}

function write(dir, letter, entries) {
  fs.writeFileSync(path.join(dir, 'shards', `${letter}.json.gz`), zlib.gzipSync(Buffer.from(JSON.stringify(entries))));
}

test('three shards are kept; a fourth evicts the oldest', async () => {
  const dir = makeDir();
  try {
    for (const letter of ['a', 'b', 'c', 'd']) write(dir, letter, { [`${letter}word`]: [letter] });
    const store = shardStore.create({ dir });
    for (const letter of ['a', 'b', 'c']) assert.ok(await store.load(letter));
    assert.equal(store.size(), 3);
    assert.ok(await store.load('d'));
    assert.equal(store.size(), 3, 'the cache stays bounded');
    // "a" was the oldest and had to come off disk again
    assert.ok(await store.load('a'));
    assert.equal(store.size(), 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a failed read is retried, not remembered', async () => {
  const dir = makeDir();
  try {
    fs.writeFileSync(path.join(dir, 'shards', 'b.json.gz'), 'not gzip');
    const store = shardStore.create({ dir, name: 'test' });
    assert.equal(await store.load('b'), null);
    write(dir, 'b', { batch: [{ w: 'deal' }] });
    const again = await store.load('b');
    assert.deepEqual(again.batch, [{ w: 'deal' }]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('no letter means no read', async () => {
  const store = shardStore.create({ dir: path.join(os.tmpdir(), 'neo-shard-nowhere') });
  assert.equal(await store.load(''), null);
  assert.equal(await store.load(null), null);
  assert.equal(store.size(), 0);
});
