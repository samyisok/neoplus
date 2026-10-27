// End-to-end tests for Records in the right-hand pane (adr-005).
// A throwaway library with two books; records are library-wide and must never
// touch a book.
// Run with `npm run test:records`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-records-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-records-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const BOOK1 = 'book-the-lantern-year-1';
const BOOK2 = 'book-the-silver-sea-2';
for (const [id, title, chapter] of [[BOOK1, 'The Lantern Year', 'The Thaw'], [BOOK2, 'The Silver Sea', 'The Map']]) {
  const dir = path.join(lib, id);
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({
    id, title, author: 'Ines', chapterOrder: ['ch-1'], chapterTitles: { 'ch-1': chapter }
  }));
  fs.writeFileSync(path.join(dir, 'chapters', 'ch-1.html'), '<p>Ines found the lantern in the ice house. A batch of letters waited.</p>');
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night',
  spellLanguage: 'en-US',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK1, BOOK2] }]
}));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
let win;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (code, ms = 8000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    try { if (await js(code)) return true; } catch { /* reloading */ }
    await tick(80);
  }
  return false;
};
const click = (sel) => js(`document.querySelector(${JSON.stringify(sel)})?.click()`);
const type = (sel, text) => js(`(() => {
  const el = document.querySelector(${JSON.stringify(sel)});
  if (!el) return false;
  if (el.tagName === 'INPUT') el.value = ${JSON.stringify(text)};
  else el.textContent = ${JSON.stringify(text)};
  el.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
const key = (sel, key, shift = false) => js(`document.querySelector(${JSON.stringify(sel)})?.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, shiftKey: ${shift}, bubbles: true, cancelable: true }))`);
const openBook = async (id) => {
  await js(`(async () => { document.getElementById('firstrun').hidden = true; await openBook(${JSON.stringify(id)}); })()`);
  await waitFor(`typeof book !== 'undefined' && book && book.id === ${JSON.stringify(id)}`);
  await tick(500);
};
const pinPane = (on = true) => js(`pinPane('side', ${on ? 'true' : 'false'})`);
const recordsTab = async () => {
  await pinPane(true);
  await js(`document.querySelector('#neo-side-tabs [data-view="records"]')?.click()`);
  await waitFor(`document.getElementById('side-pane').classList.contains('neo-records-open')`);
  await tick(300);
};
const notesTab = async () => {
  await pinPane(true);
  await js(`document.querySelector('#neo-side-tabs [data-view="notes"]')?.click()`);
  await tick(200);
};
const viewState = () => js(`(() => {
  const tabs = document.getElementById('neo-side-tabs');
  const pane = document.getElementById('side-pane');
  const view = document.getElementById('neo-records-view');
  const sticky = document.getElementById('sticky-list');
  return {
    tabs: !!tabs && !tabs.hidden,
    choices: tabs && !tabs.hidden ? [...tabs.querySelectorAll('[role="tab"]')].filter((t) => !t.hidden).map((t) => t.dataset.view) : [],
    active: tabs?.querySelector('[role="tab"][aria-selected="true"]')?.dataset.view,
    records: !!view && !view.hidden && !pane.hidden,
    paneOpen: pane.classList.contains('neo-records-open'),
    sticky: !!sticky && !!sticky.offsetParent,
    bottom: document.querySelector('#tabs .tab.active')?.dataset.tab || ''
  };
})()`);
const openRow = async (title) => js(`(() => {
  const r = [...document.querySelectorAll('.neo-record')].find((r) => r.querySelector('.neo-record-title')?.textContent === ${JSON.stringify(title)});
  if (!r) return false;
  if (!r.classList.contains('open')) r.querySelector('.neo-record-title').click();
  return true;
})()`);
const group = async (name) => js(`(() => {
  const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === ${JSON.stringify(name)});
  return !!g;
})()`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the right pane offers Notes | Records while writing, and Notes shows the old content', async () => {
  await js(`switchTab('manuscript')`);
  await tick(300);
  await pinPane(true);
  await tick(150);
  const s = await viewState();
  assert.equal(s.tabs, true);
  assert.deepEqual(s.choices, ['notes', 'records']);
  assert.equal(s.active, 'notes');
  assert.equal(s.records, false);
  assert.equal(s.sticky, true);
  assert.equal(s.bottom, 'manuscript');
});

test('choosing Records fills the pane and leaves the manuscript tab active', async () => {
  await recordsTab();
  const s = await viewState();
  assert.equal(s.records, true);
  assert.equal(s.paneOpen, true);
  assert.equal(s.sticky, false);
  assert.equal(s.bottom, 'manuscript');
  const gripOverSearch = await js(`(() => {
    const grip = document.querySelector('.neo-ext-side-grip');
    const search = document.getElementById('neo-records-search');
    const box = search.getBoundingClientRect();
    const pane = document.getElementById('side-pane').getBoundingClientRect();
    return document.elementFromPoint(pane.left + 4, box.top + box.height / 2) === grip;
  })()`);
  assert.equal(gripOverSearch, true, 'the resize grip stays above the records toolbar');
  const tabsAboveTitle = await js(`(() => {
    const tabs = document.getElementById('neo-side-tabs').getBoundingClientRect();
    const head = document.getElementById('side-head').getBoundingClientRect();
    return tabs.bottom <= head.top + 1;
  })()`);
  assert.equal(tabsAboveTitle, true, 'the tabs sit above the pane title block');
});

test('choosing Notes returns the pane to its notes', async () => {
  await notesTab();
  const s = await viewState();
  assert.equal(s.records, false);
  assert.equal(s.sticky, true);
});

test('a record is added, opened, edited, and survives a reload', async () => {
  await recordsTab();
  console.log('     ready-debug', JSON.stringify(await js(`({ loaded: document.getElementById('neo-records-add')?.disabled, status: document.getElementById('neo-records-status')?.textContent || '', tagReady: window.NeoRecords?.tagReady?.() })`)));
  await click('#neo-records-add');
  await tick(100);
  console.log('     draft-debug', JSON.stringify(await js(`({ err: document.body.dataset.neoError, html: document.getElementById('neo-records-list').innerHTML.slice(0,200), state: document.body.dataset.neoDraft, draft: !!document.querySelector('.neo-record-draft input'), rows: document.querySelectorAll('.neo-record').length, view: document.getElementById('neo-records-view')?.hidden, status: document.querySelector('.neo-records-status-text')?.textContent || '' })`)));
  assert.equal(await js(`!!document.querySelector('.neo-record-draft input')`), true);
  await type('.neo-record-draft input', 'John Silver');
  await key('.neo-record-draft input', 'Enter');
  await tick(300);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'John Silver')`), true);
  if (!(await js(`!!document.querySelector('.neo-record-body .neo-record-text')`))) {
    await openRow('John Silver');
    await tick(100);
  }
  await type('.neo-record-body .neo-record-text', 'A missing leg.\nA parrot called Flint.');
  await tick(900);
  await wc.reload();
  assert.equal(await waitFor(`typeof library !== 'undefined' && !!library`), true);
  await openBook(BOOK1);
  await js(`switchTab('manuscript')`);
  await recordsTab();
  await openRow('John Silver');
  await tick(100);
  const body = await js(`(() => {
    const r = [...document.querySelectorAll('.neo-record')].find((r) => r.querySelector('.neo-record-title')?.textContent === 'John Silver');
    return r ? r.querySelector('.neo-record-text')?.textContent || '' : '';
  })()`);
  assert.match(String(body), /missing leg/);
});

test('delete asks first; Cancel and Esc keep the record, Delete removes only it', async () => {
  await recordsTab();
  const minus = (title) => js(`(() => {
    const r = [...document.querySelectorAll('.neo-record')].find((r) => r.querySelector('.neo-record-title')?.textContent === ${JSON.stringify(title)});
    r?.querySelector('.neo-record-minus')?.click();
  })()`);
  await minus('John Silver');
  await tick(100);
  assert.equal(await js(`!!document.querySelector('.neo-record-confirm')`), true);
  await click('.neo-record-confirm-cancel');
  await tick(100);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'John Silver')`), true);
  await minus('John Silver');
  await tick(100);
  await key('#side-pane', 'Escape');
  await tick(100);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'John Silver')`), true);
  await click('#neo-records-add');
  await tick(100);
  await type('.neo-record-draft input', 'The parrot');
  await key('.neo-record-draft input', 'Enter');
  await tick(300);
  await minus('John Silver');
  await tick(100);
  await click('.neo-record-confirm-delete');
  await tick(300);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'John Silver')`), false);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'The parrot')`), true);
});

test('folders group records, rename, and deleting one moves its records to Unsorted', async () => {
  await recordsTab();
  await click('#neo-records-add-folder');
  await tick(100);
  await type('.neo-folder-input', 'The Silver Series');
  await key('.neo-folder-input', 'Enter');
  await tick(300);
  assert.equal(await group('The Silver Series'), true);
  assert.equal(await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'The Silver Series'); return g.querySelector('.neo-record-folder-head').lastElementChild?.classList.contains('neo-record-folder-count'); })()`), true, 'the count is the last item, right of the hidden controls');
  await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'The Silver Series'); g.querySelector('.neo-record-folder-add').click(); })()`);
  await tick(100);
  await type('.neo-record-draft input', 'Flint');
  await key('.neo-record-draft input', 'Enter');
  await tick(300);
  assert.equal(await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'The Silver Series'); return !!g?.querySelector('.neo-record-title'); })()`), true);
  await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'The Silver Series'); g.querySelector('.neo-record-folder-name').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true })); })()`);
  await tick(100);
  await type('.neo-folder-input', 'Silver Series');
  await key('.neo-folder-input', 'Enter');
  await tick(250);
  assert.equal(await group('Silver Series'), true);
  await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'Silver Series'); g.querySelector('.neo-folder-minus').click(); })()`);
  await tick(100);
  await click('.neo-folder-confirm-cancel');
  await tick(100);
  assert.equal(await group('Silver Series'), true);
  await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'Silver Series'); g.querySelector('.neo-folder-minus').click(); })()`);
  await tick(100);
  await click('.neo-folder-confirm-delete');
  await tick(300);
  assert.equal(await group('Silver Series'), false);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'Flint')`), true);
});

test('search finds titles and descriptions, highlights, clears, and no-match explains', async () => {
  await recordsTab();
  if (!(await js(`!!document.querySelector('.neo-record-body .neo-record-text')`))) { await openRow('Flint'); await tick(100); }
  await type('.neo-record-body .neo-record-text', 'A missing leg. A parrot called Flint.');
  await tick(900);
  await type('#neo-records-search', 'parrot');
  await tick(250);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'Flint')`), true);
  assert.equal(await js(`CSS.highlights.has('neo-record-search')`), true);
  await type('#neo-records-search', 'xyzzy');
  await tick(250);
  assert.match(await js(`document.querySelector('.neo-records-empty')?.textContent || ''`), /xyzzy/);
  await key('#neo-records-search', 'Escape');
  await tick(250);
  assert.equal(await js(`document.getElementById('neo-records-search').value`), '');
  assert.equal(await js(`CSS.highlights.has('neo-record-search')`), false);
});

test('the same records appear in another book', async () => {
  await openBook(BOOK2);
  await js(`switchTab('manuscript')`);
  await recordsTab();
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'Flint')`), true);
  await openBook(BOOK1);
  await js(`switchTab('manuscript')`);
  await recordsTab();
});

test('+ Record shows a draft even with a search or a collapsed Unsorted', async () => {
  await recordsTab();
  await type('#neo-records-search', 'xyzzy');
  await tick(200);
  await click('#neo-records-add');
  await tick(100);
  console.log('     draft-debug', JSON.stringify(await js(`({ err: document.body.dataset.neoError, html: document.getElementById('neo-records-list').innerHTML.slice(0,200), state: document.body.dataset.neoDraft, draft: !!document.querySelector('.neo-record-draft input'), rows: document.querySelectorAll('.neo-record').length, view: document.getElementById('neo-records-view')?.hidden, status: document.querySelector('.neo-records-status-text')?.textContent || '' })`)));
  assert.equal(await js(`!!document.querySelector('.neo-record-draft input')`), true);
  assert.equal(await js(`document.getElementById('neo-records-search').value`), '');
  await key('.neo-record-draft input', 'Escape');
  await tick(80);
  const unsorted = await js(`(() => {
    const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'Unsorted');
    if (!g) return false;
    g.querySelector('.neo-record-folder-name').click();
    return true;
  })()`);
  assert.equal(unsorted, true);
  await tick(100);
  await click('#neo-records-add');
  await tick(100);
  console.log('     draft-debug', JSON.stringify(await js(`({ err: document.body.dataset.neoError, html: document.getElementById('neo-records-list').innerHTML.slice(0,200), state: document.body.dataset.neoDraft, draft: !!document.querySelector('.neo-record-draft input'), rows: document.querySelectorAll('.neo-record').length, view: document.getElementById('neo-records-view')?.hidden, status: document.querySelector('.neo-records-status-text')?.textContent || '' })`)));
  assert.equal(await js(`!!document.querySelector('.neo-record-draft input')`), true);
  await key('.neo-record-draft input', 'Escape');
});

test('F6 reaches the records search, and moving a record changes its folder', async () => {
  await recordsTab();
  await js(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F6', bubbles: true, cancelable: true }))`);
  await tick(100);
  assert.equal(await js(`document.activeElement === document.getElementById('neo-records-search')`), true);
  await click('#neo-records-add-folder');
  await type('.neo-folder-input', 'Move Here');
  await key('.neo-folder-input', 'Enter');
  await tick(250);
  if (!(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'Flint')`))) {
    await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'Unsorted'); g?.querySelector('.neo-record-folder-name')?.click(); })()`);
    await tick(100);
  }
  await openRow('Flint');
  await tick(100);
  const moved = await js(`(() => {
    const r = [...document.querySelectorAll('.neo-record')].find((r) => r.querySelector('.neo-record-title')?.textContent === 'Flint');
    const s = r?.querySelector('.neo-record-folder-select');
    if (!s) return false;
    const opt = [...s.options].find((o) => o.textContent === 'Move Here');
    s.value = opt.value;
    s.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  assert.equal(moved, true);
  await tick(250);
  assert.equal(await js(`(() => { const g = [...document.querySelectorAll('.neo-record-group')].find((g) => g.querySelector('.neo-record-folder-name')?.textContent === 'Move Here'); return !!g?.querySelector('.neo-record-title'); })()`), true);
});

test('tabs are only in Manuscript and Notes; Outline and Darlings keep their pane', async () => {
  await js(`switchTab('outline')`);
  await tick(400);
  assert.equal((await viewState()).tabs, false);
  await js(`switchTab('darlings')`);
  await tick(400);
  assert.equal((await viewState()).tabs, false);
  await js(`switchTab('manuscript')`);
  await tick(300);
  assert.equal((await viewState()).tabs, true);
});

test('Escape inside Records does not leave the book', async () => {
  await recordsTab();
  const before = await js(`({ hidden: document.getElementById('editor-view').hidden, book: !!book })`);
  await key('#neo-records-view', 'Escape');
  await tick(200);
  const after = await js(`({ hidden: document.getElementById('editor-view').hidden, book: !!book })`);
  assert.equal(after.hidden, before.hidden);
  assert.equal(after.book, true);
});

test('Simple NEO hides the tabs and the pane returns to Notes, keeping the file', async () => {
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await tick(300);
  const s = await viewState();
  assert.equal(s.tabs, false);
  assert.equal(s.records, false);
  assert.equal(s.sticky, true);
  assert.equal(fs.existsSync(path.join(lib, 'records.json')), true);
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(300);
  assert.equal((await viewState()).tabs, true);
});

test('records never change the chapter, save state, or structural undo', async () => {
  await js(`switchTab('manuscript')`);
  await tick(300);
  const ch = await js(`book.chapterOrder[0]`);
  const before = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    return { html: chapterHTML[${JSON.stringify(ch)}], saved: savedHTML[${JSON.stringify(ch)}], undo: undoStack.length, redo: redoStack.length };
  })()`);
  await recordsTab();
  await click('#neo-records-add');
  await type('.neo-record-draft input', 'A new record');
  await key('.neo-record-draft input', 'Enter');
  await tick(800);
  await type('#neo-records-search', 'leg');
  await tick(200);
  await key('#neo-records-search', 'Escape');
  await tick(200);
  const after = await js(`(() => ({ html: chapterHTML[${JSON.stringify(ch)}], saved: savedHTML[${JSON.stringify(ch)}], undo: undoStack.length }))()`);
  assert.equal(after.html, before.html);
  assert.equal(after.saved, before.saved);
  assert.equal(after.undo, before.undo);
});

/* ---------- runner ---------- */

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    win.setSize(1200, 800);
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
    await tick(300);
    await openBook(BOOK1);
    await js(`window.addEventListener('error', (e) => { document.body.dataset.neoError = e.message + ' @ ' + e.filename + ':' + e.lineno; })`);
    win.focus();
    for (const t of tests) {
      try {
        await t.fn();
        console.log('ok   ' + t.name);
      } catch (err) {
        failed++;
        console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     '));
      }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) {
    failed++;
    console.error(err);
  } finally {
    app.exit(failed ? 1 : 0);
  }
}
main();
