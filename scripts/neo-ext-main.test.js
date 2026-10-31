// NEO fork — main-process wiring for backup and settings (adr-001)
//
// The renderer is faked away: these tests drive the same IPC handlers the
// window calls, against a temporary library.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const fsp = fs.promises;
const os = require('node:os');
const path = require('node:path');

const plugin = require('../neo-ext/main.js');

const tmpRoot = () => fsp.mkdtemp(path.join(os.tmpdir(), 'neo-ext-main-'));

function fake(lib) {
  const handlers = new Map();
  const store = { settings: {} };
  const deps = {
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn) },
    dialog: { showOpenDialog: async () => ({ canceled: true, filePaths: [] }) },
    shell: { openPath: async () => '', showItemInFolder: () => {} },
    BrowserWindow: { getFocusedWindow: () => null },
    app: {},
    readSettings: () => store.settings,
    writeSettings: (obj) => { store.settings = obj; },
    logError: () => {},
    bookDir: (id) => {
      if (typeof id !== 'string' || !/^book-[a-z0-9-]+$/.test(id)) throw new Error('Invalid library name');
      return path.join(lib, id);
    },
    libName: (n) => {
      if (typeof n !== 'string' || !n || n === '.' || n === '..' || /[\\/\0]/.test(n)) throw new Error('Invalid library name');
      return n;
    },
    isCloudOnly: () => false,
    cloudOnlyAmong: () => new Set(),
    requestDownload: () => {},
    libraryDir: () => lib
  };
  plugin.init(deps);
  return { handlers, store, deps };
}

async function makeBook(lib, id, title) {
  const dir = path.join(lib, id);
  await fsp.mkdir(path.join(dir, 'chapters'), { recursive: true });
  await fsp.writeFile(path.join(dir, 'book.json'), JSON.stringify({ id, title }));
  await fsp.writeFile(path.join(dir, 'chapters', 'c1.html'), '<p>words</p>');
  return dir;
}

test('history: the read and add handlers are registered', async () => {
  const lib = await tmpRoot();
  const { handlers } = fake(lib);
  assert.equal(handlers.has('neo-ext:history-read'), true);
  assert.equal(handlers.has('neo-ext:history-add'), true);
  const read = await handlers.get('neo-ext:history-read')({}, 'book-missing-1');
  assert.equal(read.ok, true);
});

test('menu: Backup and Settings are added once, Backup follows the book state', async () => {
  const lib = await tmpRoot();
  fake(lib);
  const template = [{ label: 'File', submenu: [{ label: 'Take Snapshot' }] }];
  plugin.appMenu(template, { bookOpen: false });
  const labels = template[0].submenu.map((i) => i.label || i.type);
  assert.deepEqual(labels.slice(-3), ['separator', 'Backup Book…', 'Settings…']);
  const backupItem = template[0].submenu.find((i) => i.id === 'neo-ext-backup');
  assert.equal(backupItem.enabled, false);
  // Simple NEO shows it: no `more` flag on either item
  assert.equal('more' in backupItem, false);
  assert.equal('more' in template[0].submenu.find((i) => i.id === 'neo-ext-settings'), false);

  plugin.appMenu(template, { bookOpen: true });
  assert.equal(template[0].submenu.filter((i) => i.id === 'neo-ext-backup').length, 1);
  assert.equal(template[0].submenu.find((i) => i.id === 'neo-ext-backup').enabled, true);
});

test('menu: Quit stays last, above Backup and Settings', async () => {
  fake(await tmpRoot());
  const template = [{ label: 'File', submenu: [{ label: 'Take Snapshot' }, { type: 'separator' }, { role: 'quit', label: 'Quit' }] }];
  plugin.appMenu(template, { bookOpen: true });
  const ids = template[0].submenu.map((i) => i.id || i.role || i.label || i.type);
  assert.deepEqual(ids.slice(-4), ['neo-ext-sep', 'neo-ext-backup', 'neo-ext-settings', 'quit']);
  assert.equal(template[0].submenu.filter((i) => i.type === 'separator').length, 1);
});

test('menu: a template without a File menu is left alone', async () => {
  fake(await tmpRoot());
  const template = [{ label: 'Edit', submenu: [] }];
  plugin.appMenu(template, { bookOpen: true });
  assert.equal(template[0].submenu.length, 0);
});

test('init registers every fork channel', async () => {
  const { handlers } = fake(await tmpRoot());
  for (const ch of ['neo-ext:get-backup-settings', 'neo-ext:pick-backup-folder', 'neo-ext:check-backup-folder',
    'neo-ext:save-backup-settings', 'neo-ext:backup-book', 'neo-ext:reveal-backup',
    'neo-ext:thesaurus-status', 'neo-ext:thesaurus', 'neo-ext:dictionary-status', 'neo-ext:dictionary']) {
    assert.equal(typeof handlers.get(ch), 'function', ch);
  }
});

test('backup: default folder, then a configured folder', async () => {
  const lib = await tmpRoot();
  const { handlers, store } = fake(lib);
  await makeBook(lib, 'book-one', 'The Long Way Home');

  const first = await handlers.get('neo-ext:backup-book')(null, 'book-one');
  assert.equal(first.ok, true);
  assert.match(first.name, /^the-long-way-home-\d{4}-\d{2}-\d{2}-\d{6}$/);
  assert.equal(first.path, path.join(lib, 'Backups', first.name));
  assert.equal(fs.existsSync(path.join(first.path, 'chapters', 'c1.html')), true);

  const elsewhere = await tmpRoot();
  store.settings = { exportFolder: '/kept', backupFolder: elsewhere };
  const second = await handlers.get('neo-ext:backup-book')(null, 'book-one');
  assert.equal(second.ok, true);
  assert.equal(path.dirname(second.path), elsewhere);
  assert.equal(store.settings.exportFolder, '/kept');
});

test('backup: a second backup at once is refused, not interleaved', async () => {
  const lib = await tmpRoot();
  const { handlers } = fake(lib);
  const dir = await makeBook(lib, 'book-nine', 'Nine');
  for (let i = 0; i < 20; i++) await fsp.writeFile(path.join(dir, 'chapters', `c${i}.html`), '<p>x</p>');
  const [one, two] = await Promise.all([
    handlers.get('neo-ext:backup-book')(null, 'book-nine'),
    handlers.get('neo-ext:backup-book')(null, 'book-nine')
  ]);
  const ok = [one, two].filter((r) => r.ok);
  assert.equal(ok.length, 1);
  assert.equal([one, two].filter((r) => !r.ok && /already running/i.test(r.error)).length, 1);
  assert.equal((await fsp.readdir(path.join(ok[0].path, 'chapters'))).length, 20);
});

test('backup: a malformed book id is refused', async () => {
  const { handlers } = fake(await tmpRoot());
  for (const bad of ['../etc', 'book/../x', '', null, 42]) {
    const res = await handlers.get('neo-ext:backup-book')(null, bad);
    assert.equal(res.ok, false);
  }
});

test('backup: a folder inside the book is refused', async () => {
  const lib = await tmpRoot();
  const { handlers, store } = fake(lib);
  const dir = await makeBook(lib, 'book-two', 'Two');
  store.settings = { backupFolder: path.join(dir, 'bk') };
  const res = await handlers.get('neo-ext:backup-book')(null, 'book-two');
  assert.equal(res.ok, false);
  assert.match(res.error, /inside the book/i);
  assert.equal(fs.existsSync(path.join(dir, 'bk')), false);
});

test('settings: saving keeps other keys, refusing an unwritable folder', async () => {
  const lib = await tmpRoot();
  const { handlers, store } = fake(lib);
  store.settings = { exportFolder: '/exports', window: { w: 1 } };

  const good = await tmpRoot();
  const nested = path.join(good, 'deep', 'nested');
  const saved = await handlers.get('neo-ext:save-backup-settings')(null, nested, null);
  assert.equal(saved.ok, true);
  assert.equal(store.settings.backupFolder, nested);
  assert.equal(fs.existsSync(nested), true);
  assert.equal(store.settings.exportFolder, '/exports');

  const readOnly = await tmpRoot();
  await fsp.chmod(readOnly, 0o555);
  const bad = await handlers.get('neo-ext:save-backup-settings')(null, path.join(readOnly, 'sub'), null);
  await fsp.chmod(readOnly, 0o755);
  assert.equal(bad.ok, false);
  assert.equal(store.settings.backupFolder, nested);
});

test('reveal: only a folder inside the resolved backup folder', async () => {
  const lib = await tmpRoot();
  const { handlers, store, deps } = fake(lib);
  const dest = await tmpRoot();
  store.settings = { backupFolder: dest };
  const shown = [];
  deps.shell.showItemInFolder = (p) => shown.push(p);
  assert.equal(await handlers.get('neo-ext:reveal-backup')(null, path.join(dest, 'a-backup')), true);
  assert.equal(await handlers.get('neo-ext:reveal-backup')(null, '/etc'), false);
  assert.equal(await handlers.get('neo-ext:reveal-backup')(null, '\\\\server\\share'), false);
  assert.deepEqual(shown, [path.join(dest, 'a-backup')]);
});

test('settings: a settings file that cannot be read is not overwritten', async () => {
  const lib = await tmpRoot();
  const { handlers, deps } = fake(lib);
  deps.readSettings = () => { throw new Error('EACCES'); };
  const folder = await tmpRoot();
  const res = await handlers.get('neo-ext:save-backup-settings')(null, folder, null);
  assert.equal(res.ok, false);
  assert.match(res.reason, /could not be read/i);
});

test('check: never creates a folder; save does', async () => {
  const lib = await tmpRoot();
  const { handlers } = fake(lib);
  const target = path.join(await tmpRoot(), 'not-yet', 'deep');
  const checked = await handlers.get('neo-ext:check-backup-folder')(null, target, null);
  assert.equal(checked.ok, true);
  assert.equal(fs.existsSync(target), false);
  const saved = await handlers.get('neo-ext:save-backup-settings')(null, target, null);
  assert.equal(saved.ok, true);
  assert.equal(fs.existsSync(target), true);
});

test('settings: null goes back to the default', async () => {
  const lib = await tmpRoot();
  const { handlers, store } = fake(lib);
  store.settings = { backupFolder: '/somewhere', exportFolder: '/x' };
  const res = await handlers.get('neo-ext:save-backup-settings')(null, null, null);
  assert.equal(res.ok, true);
  assert.equal('backupFolder' in store.settings, false);
  assert.equal(store.settings.exportFolder, '/x');
  assert.equal(plugin.backupDir(lib), path.join(lib, 'Backups'));
});

test('settings: the daily backup resolves the configured folder', async () => {
  const lib = await tmpRoot();
  const { store } = fake(lib);
  store.settings = { backupFolder: '/mnt/backups' };
  assert.equal(plugin.backupDir(lib), '/mnt/backups');
  store.settings = {};
  assert.equal(plugin.backupDir(lib), path.join(lib, 'Backups'));
});
