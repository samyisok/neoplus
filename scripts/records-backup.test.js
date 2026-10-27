// NEO fork — records in the daily zip (adr-005)
//
// The backup worker runs as its own Node child here, exactly as NEO forks it.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const JSZip = require('jszip');
const WORKER = path.join(__dirname, '..', 'backup-worker.js');

function room() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'neo-records-backup-'));
  const lib = path.join(dir, 'NEO Library');
  const book = path.join(lib, 'book-one');
  fs.mkdirSync(path.join(book, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(book, 'book.json'), '{"id":"book-one","title":"One"}');
  fs.writeFileSync(path.join(book, 'chapters', 'ch-1.html'), '<p>words</p>');
  return { dir, lib, target: path.join(dir, 'out.zip') };
}

function backup(job) {
  return new Promise((resolve, reject) => {
    const child = fork(WORKER, [], { stdio: ['ignore', 'ignore', 'ignore', 'ipc'] });
    const timer = setTimeout(() => { child.kill(); reject(new Error('backup worker did not answer')); }, 10000);
    child.on('message', (msg) => { clearTimeout(timer); child.kill(); resolve(msg); });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
    child.send(job);
  });
}

test('daily zip: records.json and .bak travel, a .tmp does not', async () => {
  const { lib, target } = room();
  fs.writeFileSync(path.join(lib, 'records.json'), '{"format":1,"folders":[],"records":[]}');
  fs.writeFileSync(path.join(lib, 'records.json.bak'), '{"format":1,"folders":[],"records":[]}');
  fs.writeFileSync(path.join(lib, 'records.json.tmp'), 'half');
  const msg = await backup({ libraryDir: lib, target, keep: 14, fileLimitMs: 1000 });
  assert.equal(msg.ok, true);
  const zip = await JSZip.loadAsync(fs.readFileSync(target));
  assert.ok(zip.file('records.json'));
  assert.ok(zip.file('records.json.bak'));
  assert.equal(zip.file('records.json.tmp'), null);
});

test('daily zip: a symlink named records.json is named, not followed', async () => {
  const { dir, lib, target } = room();
  const outside = path.join(dir, 'outside.txt');
  fs.writeFileSync(outside, 'do not read me');
  fs.symlinkSync(outside, path.join(lib, 'records.json'));
  const msg = await backup({ libraryDir: lib, target, keep: 14, fileLimitMs: 1000 });
  assert.equal(msg.ok, true);
  const zip = await JSZip.loadAsync(fs.readFileSync(target));
  assert.equal(zip.file('records.json'), null);
  assert.match(msg.missed.join('\n'), /records\.json \(link\)/);
});

test('daily zip: no records means no empty file invented', async () => {
  const { lib, target } = room();
  const msg = await backup({ libraryDir: lib, target, keep: 14, fileLimitMs: 1000 });
  assert.equal(msg.ok, true);
  const zip = await JSZip.loadAsync(fs.readFileSync(target));
  assert.equal(zip.file('records.json'), null);
});
