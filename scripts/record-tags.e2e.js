// End-to-end tests for record tags (adr-006).
// Run with `npm run test:tags`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-tags-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-tags-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const BOOK1 = 'book-the-lantern-year-1';
const BOOK2 = 'book-the-silver-sea-2';
for (const [id, title] of [[BOOK1, 'The Lantern Year'], [BOOK2, 'The Silver Sea']]) {
  const dir = path.join(lib, id);
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({ id, title, author: 'Ines', chapterOrder: ['ch-1'], chapterTitles: { 'ch-1': 'One' } }));
  fs.writeFileSync(path.join(dir, 'chapters', 'ch-1.html'), '<p>I went to Long Chen house on First Street.</p>');
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({ authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night', spellLanguage: 'en-US', shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK1, BOOK2] }] }));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) { return loadFile.call(this, path.resolve(__dirname, '..', file), opts); };
require('../main.js');

let wc, win;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const waitFor = async (code, ms = 8000) => {
  const until = Date.now() + ms;
  while (Date.now() < until) { try { if (await js(code)) return true; } catch { /* reloading */ } await tick(80); }
  return false;
};
const openBook = async (id) => {
  await js(`(async () => { document.getElementById('firstrun').hidden = true; await openBook(${JSON.stringify(id)}); })()`);
  await waitFor(`typeof book !== 'undefined' && book && book.id === ${JSON.stringify(id)}`);
  await tick(500);
};
const type = (sel, text) => js(`(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; if (el.tagName === 'INPUT') el.value = ${JSON.stringify(text)}; else el.textContent = ${JSON.stringify(text)}; el.dispatchEvent(new Event('input', { bubbles: true })); return true; })()`);
const key = (sel, k) => js(`document.querySelector(${JSON.stringify(sel)})?.dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, bubbles: true, cancelable: true }))`);
const recordsState = () => js(`(() => ({
  view: !!document.getElementById('side-pane')?.classList.contains('neo-records-open'),
  panePinned: document.getElementById('side-pane')?.dataset.pinned === '1',
  query: document.getElementById('neo-records-search')?.value || '',
  rows: [...document.querySelectorAll('.neo-record-title')].map((b) => b.textContent),
  tags: [...document.querySelectorAll('.neo-tag-name')].map((b) => b.textContent),
  eye: !!document.getElementById('records-eye') && !document.getElementById('records-eye').hidden,
  eyeOn: document.getElementById('records-eye')?.getAttribute('aria-pressed') === 'true',
  find: !document.getElementById('searchbar').hidden,
  findValue: document.getElementById('search-input')?.value || ''
}))()`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('create a record from a phrase: pin, title, first tag, description focus', async () => {
  await js(`switchTab('manuscript')`);
  await tick(300);
  const ok = await js(`NeoRecords.openFromSelection('Long Chen', 'create')`);
  await waitFor(`!!document.querySelector('.neo-record-title')`);
  await tick(300);
  assert.equal(ok, true);
  const s = await recordsState();
  assert.equal(s.view, true);
  assert.equal(s.panePinned, true);
  assert.deepEqual(s.rows, ['Long Chen']);
  assert.deepEqual(s.tags, ['Long Chen']);
  assert.equal(await js(`document.activeElement?.classList.contains('neo-record-text')`), true);
  assert.equal(await js(`NeoRecords.tagExists('long chen')`), true);
});

test('find an existing tag opens Records with the phrase in the search', async () => {
  await js(`NeoRecords.openFromSelection('Long Chen', 'find')`);
  await tick(400);
  const s = await recordsState();
  assert.equal(s.view, true);
  assert.equal(s.query, 'Long Chen');
  assert.deepEqual(s.rows, ['Long Chen']);
});

test('a multi-word phrase stays one title and one tag', async () => {
  await js(`NeoRecords.openFromSelection('Ice Metal Core', 'create')`);
  await waitFor(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'Ice Metal Core')`);
  assert.equal(await js(`[...document.querySelectorAll('.neo-tag-name')].some((b) => b.textContent === 'Ice Metal Core')`), true);
});

test('manual tags add, dedupe, remove with confirmation', async () => {
  await js(`(() => { const row = [...document.querySelectorAll('.neo-record')].find((r) => r.querySelector('.neo-record-title')?.textContent === 'Long Chen'); if (!row?.classList.contains('open')) row.querySelector('.neo-record-title').click(); })()`);
  await tick(100);
  await js(`(() => { const row = [...document.querySelectorAll('.neo-record')].find((r) => r.querySelector('.neo-record-title')?.textContent === 'Long Chen'); row.querySelector('.neo-tag-add').click(); })()`);
  await tick(100);
  await type('.neo-tag-input', 'Silver Series');
  await key('.neo-tag-input', 'Enter');
  await tick(300);
  assert.equal(await js(`[...document.querySelectorAll('.neo-tag-name')].some((b) => b.textContent === 'Silver Series')`), true);
  await js(`(() => { const row = [...document.querySelectorAll('.neo-record')].find((r) => r.querySelector('.neo-record-title')?.textContent === 'Long Chen'); row.querySelector('.neo-tag-add').click(); })()`);
  await type('.neo-tag-input', 'long chen');
  await key('.neo-tag-input', 'Enter');
  await tick(300);
  assert.equal(await js(`[...document.querySelectorAll('.neo-tag-name')].filter((b) => b.textContent.toLowerCase() === 'long chen').length`), 1);
  await js(`(() => { const chip = [...document.querySelectorAll('.neo-tag')].find((c) => c.querySelector('.neo-tag-name')?.textContent === 'Silver Series'); chip.querySelector('.neo-tag-remove').click(); })()`);
  await tick(100);
  await js(`document.querySelector('.neo-tag-confirm-cancel')?.click()`);
  await tick(100);
  assert.equal(await js(`[...document.querySelectorAll('.neo-tag-name')].some((b) => b.textContent === 'Silver Series')`), true);
  await js(`(() => { const chip = [...document.querySelectorAll('.neo-tag')].find((c) => c.querySelector('.neo-tag-name')?.textContent === 'Silver Series'); chip.querySelector('.neo-tag-remove').click(); })()`);
  await tick(100);
  await js(`document.querySelector('.neo-tag-confirm-remove')?.click()`);
  await tick(300);
  assert.equal(await js(`[...document.querySelectorAll('.neo-tag-name')].some((b) => b.textContent === 'Silver Series')`), false);
});

test('a tag chip opens Find over the manuscript', async () => {
  await js(`(() => { const chip = [...document.querySelectorAll('.neo-tag')].find((c) => c.querySelector('.neo-tag-name')?.textContent === 'Long Chen'); chip.querySelector('.neo-tag-name').click(); })()`);
  await waitFor(`!document.getElementById('searchbar').hidden`);
  await tick(300);
  const s = await recordsState();
  assert.equal(s.find, true);
  assert.equal(s.findValue, 'Long Chen');
  assert.match(await js(`document.getElementById('search-count').textContent`), /1 (of 1|found)/);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'Long Chen')`), true);
});

test('the eye toggles a subtle tag highlight and survives reload', async () => {
  await waitFor(`!!document.getElementById('records-eye') && !document.getElementById('records-eye').hidden`);
  assert.equal((await recordsState()).eyeOn, false);
  await js(`document.getElementById('records-eye').click()`);
  await tick(500);
  assert.equal((await recordsState()).eyeOn, true);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), true);
  await js(`document.getElementById('records-eye').click()`);
  await tick(200);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), false);
  await js(`document.getElementById('records-eye').click()`);
  await tick(200);
  await wc.reload();
  assert.equal(await waitFor(`typeof library !== 'undefined' && !!library`), true);
  await openBook(BOOK1);
  await js(`switchTab('manuscript')`);
  await waitFor(`!!document.getElementById('records-eye') && !document.getElementById('records-eye').hidden`);
  await tick(500);
  assert.equal((await recordsState()).eyeOn, true);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), true, 'the book-open scan restores the tint');
});

test('tags are shared by another book', async () => {
  await openBook(BOOK2);
  await js(`switchTab('manuscript')`);
  await waitFor(`!!window.NeoRecords && NeoRecords.tagReady && NeoRecords.tagReady()`);
  await js(`NeoRecords.openFromSelection('Long Chen', 'find')`);
  await tick(500);
  assert.equal(await js(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'Long Chen')`), true);
  const stored = JSON.parse(fs.readFileSync(path.join(lib, 'records.json'), 'utf8'));
  assert.ok(stored.records.some((r) => (r.tags || []).some((t) => t.text === 'Long Chen' && !t.removedAt)), 'tags are in records.json');
});

test('tag edits leave the chapter and undo alone', async () => {
  await openBook(BOOK1);
  await js(`switchTab('manuscript')`);
  await waitFor(`!!window.NeoRecords && NeoRecords.tagReady && NeoRecords.tagReady()`);
  const ch = await js(`book.chapterOrder[0]`);
  const before = await js(`({ html: chapterHTML[${JSON.stringify(ch)}], undo: undoStack.length })`);
  await js(`NeoRecords.openFromSelection('A Tag', 'create')`);
  await waitFor(`[...document.querySelectorAll('.neo-record-title')].some((b) => b.textContent === 'A Tag')`);
  await tick(800);
  const after = await js(`({ html: chapterHTML[${JSON.stringify(ch)}], undo: undoStack.length })`);
  assert.equal(after.html, before.html);
  assert.equal(after.undo, before.undo);
});

test('replacing a chapter restores the tint on the new text', async () => {
  await js(`switchTab('manuscript')`);
  await tick(200);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), true);
  await js(`(() => { const body = document.querySelector('.chapter-body'); body.innerHTML = '<p>Long Chen came back.</p>'; })()`);
  await tick(900);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), true);
  assert.equal(await js(`!!document.querySelector('.chapter-body')`), true);
  const painted = await js(`(() => {
    const held = CSS.highlights.get('neo-record-tag');
    if (!held) return '';
    return [...held].map((range) => range.toString()).join('|');
  })()`);
  assert.ok(painted.includes('Long Chen'), 'the tint is on the new text, not detached nodes');
});

test('Simple NEO hides the eye, clears the tint, and cannot repaint it', async () => {
  await js(`switchTab('manuscript')`);
  await waitFor(`!!document.getElementById('records-eye') && !document.getElementById('records-eye').hidden`);
  if (!(await recordsState()).eyeOn) await js(`document.getElementById('records-eye').click()`);
  await tick(500);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), true);
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await tick(400);
  assert.equal(await js(`document.getElementById('records-eye').hidden`), true);
  assert.equal(await js(`document.getElementById('side-pane').classList.contains('neo-records-open')`), false);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), false, 'Simple NEO clears the tint');
  await js(`switchTab('notes')`);
  await tick(200);
  await js(`switchTab('manuscript')`);
  await tick(400);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), false, 'a tab switch cannot repaint it');
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(500);
  assert.equal(await js(`CSS.highlights.has('neo-record-tag')`), true, 'the tint returns with the switch');
});

test('typing re-reads one chapter, not the whole book', async () => {
  await js(`switchTab('manuscript')`);
  await tick(200);
  const before = await js(`NeoRecords.tagScans()`);
  await js(`(() => {
    const body = document.querySelector('.chapter-body');
    const p = document.createElement('p');
    p.textContent = 'Long Chen came back again.';
    body.appendChild(p);
    body.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(900);
  const after = await js(`NeoRecords.tagScans()`);
  assert.equal(after.book, before.book, 'a new paragraph does not rescan the book');
  assert.equal(after.chapter, before.chapter + 1, 'the edited chapter is re-read once');
});

test('a half-typed tag does not survive a view switch', async () => {
  await js(`NeoRecords.openFromSelection('Long Chen', 'find')`);
  await tick(400);
  await js(`(() => {
    const row = document.querySelector('.neo-record');
    if (row && !row.classList.contains('open')) row.querySelector('.neo-record-title').click();
  })()`);
  await tick(150);
  await js(`document.querySelector('.neo-record .neo-tag-add').click()`);
  await tick(150);
  await type('.neo-tag-input', 'half typed');
  await js(`switchTab('notes')`);
  await tick(200);
  await js(`switchTab('manuscript')`);
  await tick(200);
  await js(`NeoRecords.openFromSelection('Long Chen', 'find')`);
  await tick(400);
  assert.equal(await js(`!!document.querySelector('.neo-tag-input')`), false, 'the draft tag is gone');
});

/* runner */
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
    await js(`switchTab('manuscript')`);
    win.focus();
    for (const t of tests) {
      try { await t.fn(); console.log('ok   ' + t.name); }
      catch (err) { failed++; console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     ')); }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) { failed++; console.error(err); }
  finally { app.exit(failed ? 1 : 0); }
}
main();
