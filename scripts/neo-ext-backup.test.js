// NEO fork — backup and settings helpers (adr-001)
//
// The pure parts are unit-tested here; the copy itself is tested against real
// temporary folders at the bottom. Nothing here touches the writer's library.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');

const names = require('../neo-ext/lib/backup-name.js');
const dirs = require('../neo-ext/lib/backup-dir.js');
const merge = require('../neo-ext/lib/settings-merge.js');
const copyBook = require('../neo-ext/lib/copy-book.js');

const tmpRoot = () => fsp.mkdtemp(path.join(os.tmpdir(), 'neo-ext-'));

test('backup name: slug from the title', () => {
  assert.equal(names.slug('The Long Way Home', 'book-1'), 'the-long-way-home');
  assert.equal(names.slug('Capítulo Ñandú', 'book-1'), 'capitulo-nandu');
  assert.equal(names.slug('', 'book-abc123'), 'book-abc123');
  assert.equal(names.slug('   ', 'book-abc123'), 'book-abc123');
});

test('backup name: reserved characters and trailing dots', () => {
  assert.equal(names.slug('A/B\\C:D*E?F"G<H>I|J', 'id'), 'a-b-c-d-e-f-g-h-i-j');
  assert.equal(names.slug('Name...', 'id'), 'name');
  assert.equal(names.slug('CON', 'id'), 'id');
  assert.equal(names.slug('lpt1', 'id'), 'id');
});

test('backup name: timestamp has no characters a filesystem dislikes', () => {
  const stamp = names.timestamp(new Date('2026-10-25T09:08:07'));
  assert.match(stamp, /^\d{4}-\d{2}-\d{2}-\d{6}$/);
  assert.equal(stamp, '2026-10-25-090807');
});

test('backup name: collision gets a numeric suffix', () => {
  const now = new Date('2026-10-25T09:08:07');
  const taken = new Set(['the-book-2026-10-25-090807']);
  assert.equal(names.folderName({ title: 'The Book', id: 'x', now, taken }), 'the-book-2026-10-25-090807-2');
  taken.add('the-book-2026-10-25-090807-2');
  assert.equal(names.folderName({ title: 'The Book', id: 'x', now, taken }), 'the-book-2026-10-25-090807-3');
});

test('backup dir: default and configured', () => {
  assert.equal(dirs.resolveBackupDir({ libraryDir: '/lib', configured: '' }), path.join('/lib', 'Backups'));
  assert.equal(dirs.resolveBackupDir({ libraryDir: '/lib', configured: '/mnt/backups' }), '/mnt/backups');
  assert.throws(() => dirs.resolveBackupDir({ libraryDir: '/lib', configured: 'relative/dir' }), /absolute/i);
});

test('backup dir: inside a book folder is refused', () => {
  const lib = '/lib';
  assert.equal(dirs.insideBook({ folder: '/lib/book-x/backups', libraryDir: lib }), true);
  assert.equal(dirs.insideBook({ folder: '/lib/book-x', libraryDir: lib }), true);
  assert.equal(dirs.insideBook({ folder: '/lib/Backups', libraryDir: lib }), false);
  assert.equal(dirs.insideBook({ folder: '/lib/my-backups', libraryDir: lib }), false);
  assert.equal(dirs.insideBook({ folder: '/elsewhere/book-x/backups', libraryDir: lib }), false);
});

test('backup dir: deeper than the library root is refused', () => {
  assert.equal(dirs.validateBackupDir({ folder: '/lib/handmade-book/backups', libraryDir: '/lib' }).ok, false);
  assert.equal(dirs.validateBackupDir({ folder: '/lib/my-backups', libraryDir: '/lib' }).ok, true);
});

test('backup dir: the open book itself is refused as a destination', () => {
  const res = dirs.validateBackupDir({ folder: '/lib/book-x', libraryDir: '/lib', ownBookDir: '/lib/book-x' });
  assert.equal(res.ok, false);
  assert.match(res.reason, /book/i);
});

test('backup dir: a symlinked path that lands inside a book is refused', async () => {
  const root = await tmpRoot();
  const lib = path.join(root, 'lib');
  const book = path.join(lib, 'book-sym');
  const outside = path.join(root, 'outside');
  await fsp.mkdir(book, { recursive: true });
  await fsp.mkdir(outside, { recursive: true });
  await fsp.symlink(book, path.join(outside, 'link'), 'dir');
  const res = dirs.validateBackupDir({ folder: path.join(outside, 'link', 'bk'), libraryDir: lib });
  assert.equal(res.ok, false);
});

test('settings merge: keeps foreign keys and patches one', () => {
  const merged = merge.mergeSettings({ exportFolder: '/x', window: { w: 1 } }, { backupFolder: '/b' });
  assert.deepEqual(merged, { exportFolder: '/x', window: { w: 1 }, backupFolder: '/b' });
});

test('settings merge: undefined clears only the patched key', () => {
  const merged = merge.mergeSettings({ backupFolder: '/b', exportFolder: '/x' }, { backupFolder: undefined });
  assert.deepEqual(merged, { exportFolder: '/x' });
});

test('settings merge: corrupt or missing file yields defaults', () => {
  assert.deepEqual(merge.readSettingsSafe(() => { throw new Error('bad json'); }), {});
  assert.deepEqual(merge.readSettingsSafe(() => ({ a: 1 })), { a: 1 });
  assert.deepEqual(merge.readSettingsSafe(() => null), {});
});

test('settings merge: an unreadable file is refused, not treated as empty', () => {
  let wrote = false;
  assert.throws(() => merge.patchSettingsFile({ read: () => { throw new Error('EACCES'); }, write: () => { wrote = true; }, patch: { backupFolder: '/b' } }));
  assert.equal(wrote, false);
});

test('settings merge: a save keeps keys it was not asked to change', async () => {
  let stored = { exportFolder: '/exports', window: { w: 9 } };
  const write = (obj) => { stored = obj; };
  merge.patchSettingsFile({ read: () => stored, write, patch: { backupFolder: '/backups' } });
  assert.deepEqual(stored, { exportFolder: '/exports', window: { w: 9 }, backupFolder: '/backups' });
});

test('copy: a book folder is copied whole, including snapshots', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-a');
  const dest = path.join(root, 'out');
  await fsp.mkdir(path.join(src, 'chapters'), { recursive: true });
  await fsp.mkdir(path.join(src, 'snapshots', 's1'), { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{"id":"book-a"}');
  await fsp.writeFile(path.join(src, 'chapters', 'c1.html'), '<p>words</p>');
  await fsp.writeFile(path.join(src, 'snapshots', 's1', 'snapshot.json'), '{}');
  const res = await copyBook.copyBookDir({ src, dest, folderName: 'book-a-2026-10-25-090807' });
  assert.equal(res.ok, true);
  assert.equal(await fsp.readFile(path.join(dest, 'book-a-2026-10-25-090807', 'chapters', 'c1.html'), 'utf8'), '<p>words</p>');
  assert.equal(fs.existsSync(path.join(dest, 'book-a-2026-10-25-090807', 'snapshots', 's1', 'snapshot.json')), true);
  assert.equal(fs.existsSync(path.join(dest, 'book-a-2026-10-25-090807.partial')), false);
});

test('copy: an unreadable file is named, not silently dropped', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-b');
  const dest = path.join(root, 'out');
  await fsp.mkdir(src, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  const locked = path.join(src, 'chapters-locked.html');
  await fsp.writeFile(locked, 'secret');
  await fsp.chmod(locked, 0o000);
  const res = await copyBook.copyBookDir({ src, dest, folderName: 'b-1' });
  await fsp.chmod(locked, 0o600);
  assert.equal(res.ok, true);
  assert.equal(res.skipped.includes('chapters-locked.html'), true);
  assert.equal(res.incomplete, true);
});

test('copy: a cloud-only file is named and left out', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-c');
  const dest = path.join(root, 'out');
  await fsp.mkdir(src, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  await fsp.writeFile(path.join(src, 'chapter.html'), '<p>x</p>');
  const res = await copyBook.copyBookDir({
    src, dest, folderName: 'c-1',
    isCloudOnly: async (f) => f.endsWith('chapter.html'),
    requestDownload: () => {},
    cloudWaitMs: 10
  });
  assert.equal(res.ok, true);
  assert.equal(res.skipped.includes('chapter.html'), true);
  assert.equal(res.incomplete, true);
});

test('copy: extra library files travel beside the book, and a cloud extra is named', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-x');
  const dest = path.join(root, 'out');
  const lib = path.join(root, 'lib');
  await fsp.mkdir(src, { recursive: true });
  await fsp.mkdir(lib, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  await fsp.writeFile(path.join(lib, 'records.json'), '{"format":1}');
  await fsp.writeFile(path.join(lib, 'records.json.bak'), '{"format":1}');
  const res = await copyBook.copyBookDir({
    src, dest, folderName: 'x-1',
    extraFiles: [
      { src: path.join(lib, 'records.json'), name: 'records.json' },
      { src: path.join(lib, 'records.json.bak'), name: 'records.json.bak' }
    ]
  });
  assert.equal(res.ok, true);
  assert.equal(await fsp.readFile(path.join(dest, 'x-1', 'records.json'), 'utf8'), '{"format":1}');
  assert.equal(await fsp.readFile(path.join(dest, 'x-1', 'records.json.bak'), 'utf8'), '{"format":1}');
});

test('copy: a cloud-only extra is named, not waited on forever', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-y');
  const dest = path.join(root, 'out');
  const lib = path.join(root, 'lib');
  await fsp.mkdir(src, { recursive: true });
  await fsp.mkdir(lib, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  await fsp.writeFile(path.join(lib, 'records.json'), '{}');
  const res = await copyBook.copyBookDir({
    src, dest, folderName: 'y-1',
    extraFiles: [{ src: path.join(lib, 'records.json'), name: 'records.json' }],
    isCloudOnly: async (f) => f.endsWith('records.json'),
    requestDownload: () => {},
    cloudWaitMs: 10
  });
  assert.equal(res.ok, true);
  assert.equal(res.skipped.includes('records.json'), true);
  assert.match(await fsp.readFile(path.join(dest, 'y-1', '_left-out-of-this-backup.txt'), 'utf8'), /records\.json/);
});

test('copy: a read-only destination fails whole, leaving nothing behind', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-e');
  const dest = path.join(root, 'readonly');
  await fsp.mkdir(src, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  await fsp.mkdir(dest, { recursive: true });
  await fsp.chmod(dest, 0o555);
  const res = await copyBook.copyBookDir({ src, dest, folderName: 'e-1' });
  await fsp.chmod(dest, 0o755);
  assert.equal(res.ok, false);
  assert.deepEqual(await fsp.readdir(dest), []);
});

test('copy: left-out files are named inside the copy', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-f');
  const dest = path.join(root, 'out');
  await fsp.mkdir(src, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  await fsp.writeFile(path.join(src, 'away.html'), 'x');
  const res = await copyBook.copyBookDir({ src, dest, folderName: 'f-1', isCloudOnly: (f) => f.endsWith('away.html'), cloudWaitMs: 5 });
  const note = await fsp.readFile(path.join(res.path, '_left-out-of-this-backup.txt'), 'utf8');
  assert.match(note, /away\.html/);
});

test('copy: each run has its own partial folder (two at once)', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-g');
  const dest = path.join(root, 'out');
  await fsp.mkdir(src, { recursive: true });
  for (let i = 0; i < 40; i++) await fsp.writeFile(path.join(src, `f${i}.html`), 'word '.repeat(50));
  const [one, two] = await Promise.all([
    copyBook.copyBookDir({ src, dest, folderName: 'g-1' }),
    copyBook.copyBookDir({ src, dest, folderName: 'g-1' })
  ]);
  assert.equal(one.ok, true);
  assert.equal(two.ok, true);
  assert.notEqual(one.name, two.name);
  assert.equal((await fsp.readdir(one.path)).length, 40);
  assert.equal((await fsp.readdir(two.path)).length, 40);
});

test('copy: a symlink is named, never followed out of the book', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-h');
  const dest = path.join(root, 'out');
  const secret = path.join(root, 'outside.txt');
  await fsp.mkdir(src, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  await fsp.writeFile(secret, 'not the book');
  await fsp.symlink(secret, path.join(src, 'link.html'));
  const res = await copyBook.copyBookDir({ src, dest, folderName: 'h-1' });
  assert.equal(res.ok, true);
  assert.equal(res.skipped.includes('link.html'), true);
  assert.equal(fs.existsSync(path.join(res.path, 'link.html')), false);
});

test('copy: a taken name is never overwritten', async () => {
  const root = await tmpRoot();
  const src = path.join(root, 'book-d');
  const dest = path.join(root, 'out');
  await fsp.mkdir(src, { recursive: true });
  await fsp.writeFile(path.join(src, 'book.json'), '{}');
  await fsp.mkdir(path.join(dest, 'd-1'), { recursive: true });
  await fsp.writeFile(path.join(dest, 'd-1', 'keep.txt'), 'old');
  const res = await copyBook.copyBookDir({ src, dest, folderName: 'd-1' });
  assert.equal(res.ok, true);
  assert.equal(res.name, 'd-1-2');
  assert.equal(await fsp.readFile(path.join(dest, 'd-1', 'keep.txt'), 'utf8'), 'old');
});
