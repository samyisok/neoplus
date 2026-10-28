// NEO fork — backup and settings, main process (adr-001)
//
// Registered through one seam in main.js's startup. Everything the renderer
// can ask for is named here; no path ever arrives from the window, only a book
// id, which is resolved through the core's own libName()/bookDir().

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');

const names = require('./lib/backup-name.js');
const dirs = require('./lib/backup-dir.js');
const settings = require('./lib/settings-merge.js');
const { copyBookDir } = require('./lib/copy-book.js');
const menuRegistry = require('./lib/menu-registry.js').create();
const contextWord = require('./word-context-main.js');
const { t } = require('../i18n.js');

let deps = null;

function libraryDir() {
  try { return deps && deps.libraryDir ? deps.libraryDir() : ''; } catch { return ''; }
}

function configuredFolder() {
  const read = (deps && deps.readSettings) || (() => ({}));
  return settings.readSettingsSafe(read).backupFolder || '';
}

function resolvedFolder() {
  const lib = libraryDir();
  if (!lib) return '';
  return dirs.resolveBackupDir({ libraryDir: lib, configured: configuredFolder() });
}

// Called by the daily-backup seam; a bad configured path falls back to the
// default so the automatic backup never silently stops happening.
function backupDir(lib) {
  const root = lib || libraryDir();
  try {
    const chosen = dirs.resolveBackupDir({ libraryDir: root, configured: configuredFolder() });
    const check = dirs.validateBackupDir({ folder: chosen, libraryDir: root });
    if (!check.ok) {
      log('backup folder refused: ' + check.reason);
      return dirs.defaultBackupDir(root);
    }
    return chosen;
  } catch (err) {
    log('backup folder: ' + (err && err.message));
    return dirs.defaultBackupDir(root);
  }
}

function log(msg) {
  try { deps && deps.logError && deps.logError('neo-ext', new Error(String(msg))); } catch { /* logging is a nicety */ }
}

function probe(folder) {
  dirs.ensureDir(folder);
  const file = path.join(folder, `.neo-ext-write-check-${process.pid}`);
  fs.writeFileSync(file, 'ok');
  fs.unlinkSync(file);
}

async function readBookTitle(bookId) {
  const file = path.join(deps.bookDir(bookId), 'book.json');
  try {
    // a book.json still in iCloud must not hold the main process: ask, wait a
    // little, then fall back to the id as the name
    let away = new Set();
    try { away = deps.cloudOnlyAmong ? deps.cloudOnlyAmong([file]) : new Set(); } catch { away = new Set(); }
    if (away.size) {
      try { deps.requestDownload && deps.requestDownload(away); } catch { /* the wait below decides */ }
      const until = Date.now() + 4000;
      while (Date.now() < until) {
        await new Promise((resolve) => setTimeout(resolve, 300));
        try { away = deps.cloudOnlyAmong ? deps.cloudOnlyAmong([file]) : new Set(); } catch { away = new Set(); }
        if (!away.size) break;
      }
      if (away.size) return { title: '', id: bookId };
    }
    const raw = await fsp.readFile(file, 'utf8');
    const meta = JSON.parse(raw);
    return { title: meta.title || '', id: meta.id || bookId };
  } catch {
    return { title: '', id: bookId };
  }
}

let backupRunning = false;

async function backupBook(bookId) {
  if (typeof bookId !== 'string' || !bookId) return { ok: false, error: 'No book to back up' };
  if (backupRunning) return { ok: false, error: 'A backup is already running' };
  backupRunning = true;
  try {
    return await backupBookNow(bookId);
  } finally {
    backupRunning = false;
  }
}

async function backupBookNow(bookId) {
  let dir;
  try { dir = deps.bookDir(bookId); } catch { return { ok: false, error: 'That book cannot be found' }; }
  try { if (!fs.existsSync(dir)) return { ok: false, error: 'That book cannot be found' }; } catch { return { ok: false, error: 'That book cannot be found' }; }

  const lib = libraryDir();
  let dest;
  try { dest = resolvedFolder(); } catch (err) { return { ok: false, error: String(err.message || err) }; }
  if (!dest) return { ok: false, error: 'The library folder is not known yet' };
  const check = dirs.validateBackupDir({ folder: dest, libraryDir: lib, ownBookDir: dir });
  if (!check.ok) return { ok: false, error: check.reason };

  try {
    dirs.ensureDir(dest);
    const meta = await readBookTitle(bookId);
    const taken = new Set(await fsp.readdir(dest));
    const folderName = names.folderName({ title: meta.title, id: meta.id, now: new Date(), taken });
    const extras = [];
    for (const name of ['records.json', 'records.json.bak']) {
      const source = path.join(lib, name);
      try { if (fs.existsSync(source)) extras.push({ src: source, name }); } catch { /* listed if it cannot be read */ }
    }
    const res = await copyBookDir({
      src: dir,
      dest,
      folderName,
      extraFiles: extras,
      isCloudOnly: (f) => (deps.isCloudOnly ? deps.isCloudOnly(f) : false),
      requestDownload: (files) => { try { deps.requestDownload && deps.requestDownload(files); } catch { /* listed as left out */ } },
      log
    });
    if (!res.ok) {
      log('backup failed: ' + res.error);
      return { ok: false, error: res.error };
    }
    return {
      ok: true,
      path: res.path,
      name: res.name,
      incomplete: res.incomplete,
      skipped: res.skipped
    };
  } catch (err) {
    log('backup failed: ' + (err && err.message));
    return { ok: false, error: String((err && err.message) || err) };
  }
}

async function checkFolder(folder, bookId, { create = false } = {}) {
  if (typeof folder !== 'string' || !folder.trim()) return { ok: false, reason: 'Choose a folder for backups' };
  const lib = libraryDir();
  let own = '';
  if (bookId) { try { own = deps.bookDir(bookId); } catch { own = ''; } }
  const check = dirs.validateBackupDir({ folder, libraryDir: lib, ownBookDir: own });
  if (!check.ok) return { ok: false, reason: check.reason };
  try {
    // a check never creates anything; only a save (or the backup itself) does
    if (create) dirs.ensureDir(check.folder);
    if (fs.existsSync(check.folder)) probe(check.folder);
    return { ok: true, folder: check.folder };
  } catch (err) {
    return { ok: false, reason: `NEO cannot write there (${(err && err.code) || 'error'})` };
  }
}

function init(injected) {
  deps = injected;
  if (!deps || !deps.ipcMain) return;
  const { ipcMain, dialog, shell, BrowserWindow } = deps;

  // the renderer stores the word in this same turn; the menu is built below
  try { contextWord.init({ ipcMain, logError: deps.logError }); } catch (err) { log('word context init: ' + (err && err.message)); }

  try {
    require('./records-main.js').init({
      ipcMain,
      libraryDir: deps.libraryDir,
      libName: deps.libName,
      whenLocal: deps.whenLocal,
      isCloudOnly: deps.isCloudOnly,
      requestDownload: deps.requestDownload,
      writeFileDurable: deps.writeFileDurable,
      logError: deps.logError
    });
  } catch (err) { log('records init: ' + (err && err.message)); }

  try {
    require('./inventory-main.js').init({
      bookDir: deps.bookDir,
      libName: deps.libName,
      whenLocal: deps.whenLocal,
      isCloudOnly: deps.isCloudOnly,
      writeFileDurable: deps.writeFileDurable,
      logError: deps.logError
    }, ipcMain);
  } catch (err) { log('inventory init: ' + (err && err.message)); }

  // each lexical feature owns its data, cache, and menu item; this file only
  // hands it the process objects and its place in the menu
  menuRegistry.clear();
  try {
    const dictionary = require('./dictionary-main.js');
    dictionary.init({ ipcMain, logError: deps.logError });
    menuRegistry.register({ id: 'dictionary', order: 10, menuItem: dictionary.menuItem });
  } catch (err) { log('dictionary init: ' + (err && err.message)); }
  try {
    const thesaurus = require('./thesaurus-main.js');
    thesaurus.init({ ipcMain, logError: deps.logError });
    menuRegistry.register({ id: 'thesaurus', order: 20, menuItem: thesaurus.menuItem });
  } catch (err) { log('thesaurus init: ' + (err && err.message)); }

  ipcMain.handle('neo-ext:get-backup-settings', async () => {
    const lib = libraryDir();
    const defaultFolder = lib ? dirs.defaultBackupDir(lib) : '';
    let folder = defaultFolder;
    try { folder = resolvedFolder(); } catch { /* default stands */ }
    return { configured: configuredFolder(), folder, defaultFolder };
  });

  ipcMain.handle('neo-ext:pick-backup-folder', async (_e, current) => {
    const win = BrowserWindow.getFocusedWindow();
    const fallback = resolvedFolder() || os.homedir();
    const { canceled, filePaths } = await dialog.showOpenDialog(win, {
      title: t('Choose a folder for backups'),
      defaultPath: typeof current === 'string' && path.isAbsolute(current) ? current : fallback,
      properties: ['openDirectory', 'createDirectory']
    });
    if (canceled || !filePaths || !filePaths[0]) return null;
    return filePaths[0];
  });

  ipcMain.handle('neo-ext:check-backup-folder', (_e, folder, bookId) => checkFolder(folder, bookId));

  ipcMain.handle('neo-ext:save-backup-settings', async (_e, folder, bookId) => {
    if (folder === null || folder === '') {
      try {
        settings.patchSettingsFile({
          read: deps.readSettings,
          write: deps.writeSettings,
          patch: { backupFolder: undefined }
        });
        return { ok: true, folder: resolvedFolder() };
      } catch (err) {
        return { ok: false, reason: String((err && err.message) || err) };
      }
    }
    const check = await checkFolder(folder, bookId, { create: true });
    if (!check.ok) return check;
    try {
      settings.patchSettingsFile({
        read: deps.readSettings,
        write: deps.writeSettings,
        patch: { backupFolder: check.folder }
      });
      return { ok: true, folder: check.folder };
    } catch (err) {
      return { ok: false, reason: String((err && err.message) || err) };
    }
  });

  ipcMain.handle('neo-ext:backup-book', (_e, bookId) => backupBook(bookId));

  ipcMain.handle('neo-ext:reveal-backup', (_e, folder) => {
    if (typeof folder !== 'string' || !path.isAbsolute(folder)) return false;
    if (/^[\\/]{2}/.test(folder) || folder.startsWith('\\\\?\\')) return false; // no UNC
    const dest = resolvedFolder();
    if (!dest) return false;
    const rel = path.relative(dirs.realish(dest), dirs.realish(folder));
    if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) return false;
    try { shell.showItemInFolder(folder); return true; } catch { return false; }
  });
}

// Seam 5: the native context menu is built in the main process, so the fork's
// items have to be added here, in the same turn the renderer stored the word.
// The registry decides order and availability; one separator follows the pair.
function contextMenu(items, params, win) {
  if (!Array.isArray(items)) return;
  try {
    const word = contextWord.take(win);
    const phrase = contextWord.takePhrase(win);
    const present = word ? menuRegistry.items(word) : [];
    const record = phrase ? require('./lib/record-tags-main.js').menuItem(phrase, t) : null;
    const inventory = phrase ? require('./inventory-main.js').menuItem({ phrase: phrase.phrase, inventory: phrase.inventory }, t) : null;
    if (!present.length && !record && !inventory) return;
    const choose = (item) => () => {
      try {
        const msg = { type: 'neo-ext', action: item.action };
        if (item.word !== undefined) msg.word = item.word;
        if (item.phrase !== undefined) msg.phrase = item.phrase;
        if (item.anchor !== undefined) msg.anchor = item.anchor;
        win.webContents.send('menu', msg);
      } catch { /* window closed */ }
    };
    const extras = [];
    if (record) extras.push({ label: record.label, click: choose(record) });
    if (inventory) extras.push({ label: inventory.label, click: choose({ ...inventory, anchor: phrase.anchor }) });
    extras.push(...present.map((item) => ({ label: item.label, click: choose(item) })));
    items.unshift(...extras, { type: 'separator' });
  } catch (err) { log('context menu: ' + (err && err.message)); }
}

// Called from the File-menu seam, before the template is turned into a menu.
function appMenu(template, opts) {
  try {
    if (!Array.isArray(template)) return;
    // macOS puts the app menu first, so find File by its label (the same t()
    // core used to build it)
    const file = template.find((m) => m && m.label === t('File') && Array.isArray(m.submenu));
    if (!file) return;
    const backupItem = { id: 'neo-ext-backup', label: t('Backup Book…'), enabled: !!(opts && opts.bookOpen), click: () => send('backup-book') };
    const settingsItem = { id: 'neo-ext-settings', label: t('Settings…'), click: () => send('settings') };
    // a rebuilt menu starts from a fresh template, but guard against doubles
    file.submenu = file.submenu.filter((it) => !(it && (it.id === 'neo-ext-backup' || it.id === 'neo-ext-settings' || it.id === 'neo-ext-sep')));
    // keep Quit/Close last and Settings above it, where a writer looks for it
    let cut = file.submenu.length;
    const last = file.submenu[cut - 1];
    if (last && (last.role === 'quit' || last.role === 'close')) cut--;
    const before = file.submenu[cut - 1];
    const needsRule = !(before && before.type === 'separator');
    file.submenu.splice(cut, 0, ...(needsRule ? [{ type: 'separator', id: 'neo-ext-sep' }] : []), backupItem, settingsItem);
    if (!needsRule) {
      // the existing rule now sits above our items; mark it so a rebuild can drop it too
      file.submenu[cut - 1].id = 'neo-ext-sep';
    }
  } catch (err) {
    log('menu: ' + (err && err.message));
  }
}

function send(action) {
  try {
    const win = deps && deps.BrowserWindow
      ? (deps.BrowserWindow.getFocusedWindow() || deps.BrowserWindow.getAllWindows()[0])
      : null;
    if (win) win.webContents.send('menu', { type: 'neo-ext', action });
  } catch (err) {
    log('menu send: ' + (err && err.message));
  }
}

module.exports = { init, appMenu, contextMenu, menuRegistry, backupDir, backupBook, checkFolder, resolvedFolder };
