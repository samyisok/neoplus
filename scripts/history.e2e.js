// End-to-end tests for History in the right-hand pane (adr-014).
// A throwaway library with two books; a thesaurus replacement and a Rephrase
// replacement are recorded, survive a reload, and never touch the manuscript.
// Run with `npm run test:history`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const prompt = require('../neo-ext/lib/rephrase-prompt.js');

// A loopback model, never the writer's own endpoint.
const server = http.createServer((req, res) => {
  if (req.url.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"data":[]}');
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let label = '';
    try { label = /<profile label="([^"]+)"/.exec(body)[1]; } catch { /* the assertion below catches it */ }
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: `(${label}) She was exhausted and wanted to stop.` } }] }));
    }, 60);
  });
});

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-history-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-history-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const BOOK1 = 'book-the-lantern-year-1';
const BOOK2 = 'book-the-silver-sea-2';
const SENTENCE = 'She was very tired and did not want to go on.';

for (const [id, title, chapter, text] of [
  [BOOK1, 'The Lantern Year', 'The Thaw', `Ines found a batch of letters in the ice house. ${SENTENCE}`],
  [BOOK2, 'The Silver Sea', 'The Map', 'Ines drew a map of the bay.']
]) {
  const dir = path.join(lib, id);
  fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({
    id, title, author: 'Ines', chapterOrder: ['ch-1'], chapterTitles: { 'ch-1': chapter }
  }));
  fs.writeFileSync(path.join(dir, 'chapters', 'ch-1.html'), `<p>${text}</p>`);
}
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night',
  spellLanguage: 'en-US',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK1, BOOK2] }]
}));

const settings = prompt.defaultSettings();
let endpoint = '';
server.listen(0, '127.0.0.1', () => {
  endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ rephrase: { ...settings, endpoint } }));
});

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

const historyPath = (id) => path.join(lib, id, 'neo-ext-history.json');
const historyStore = (id) => {
  let text;
  try { text = fs.readFileSync(historyPath(id), 'utf8'); } catch (err) {
    if (err.code === 'ENOENT') return { format: 1, entries: [] };
    throw err;
  }
  // A corrupt file must fail the test, never read as "no replacements".
  return JSON.parse(text);
};
const historyEntries = (id) => historyStore(id).entries || [];
const waitEntries = async (id, count) => {
  const until = Date.now() + 8000;
  while (Date.now() < until) {
    if (historyEntries(id).length >= count) return historyEntries(id);
    await tick(80);
  }
  throw new Error(`history reached ${historyEntries(id).length}, wanted ${count}`);
};

const openBook = async (id) => {
  await js(`(async () => { document.getElementById('firstrun').hidden = true; await openBook(${JSON.stringify(id)}); })()`);
  await waitFor(`typeof book !== 'undefined' && book && book.id === ${JSON.stringify(id)}`);
  await tick(500);
  await js(`switchTab('manuscript')`);
  await tick(300);
};
const pinPane = (on = true) => js(`pinPane('side', ${on ? 'true' : 'false'})`);
const historyTab = async () => {
  await pinPane(true);
  await js(`document.querySelector('#neo-side-tabs [data-view="history"]')?.click()`);
  await waitFor(`document.getElementById('side-pane').classList.contains('neo-records-open') && !document.getElementById('neo-history-view').hidden`);
  await tick(300);
};
const bodyText = () => js(`document.querySelector('.chapter[data-id="ch-1"] .chapter-body').textContent`);
const tabState = () => js(`(() => {
  const tabs = document.getElementById('neo-side-tabs');
  const view = document.getElementById('neo-history-view');
  return {
    tabs: !!tabs && !tabs.hidden,
    choices: tabs && !tabs.hidden ? [...tabs.querySelectorAll('[role="tab"]')].filter((t) => !t.hidden).map((t) => t.dataset.view) : [],
    history: !!view && !view.hidden,
    rows: [...document.querySelectorAll('#neo-history-view .neo-hist-row')].map((row) => ({
      where: row.querySelector('.neo-hist-where')?.textContent || '',
      from: row.querySelector('.neo-hist-from')?.textContent || '',
      to: row.querySelector('.neo-hist-to')?.textContent || ''
    })),
    empty: document.querySelector('#neo-history-view .neo-hist-empty')?.textContent || ''
  };
})()`);

const selectIn = (selector, phrase) => js(`(() => {
  const body = document.querySelector(${JSON.stringify(selector)});
  if (!body) return false;
  body.focus();
  const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
  let text = '';
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) { nodes.push({ node, start: text.length }); text += node.data; }
  const at = text.indexOf(${JSON.stringify(phrase)});
  if (at < 0) return false;
  const locate = (offset) => {
    for (const entry of nodes) {
      const end = entry.start + entry.node.data.length;
      if (offset >= entry.start && offset < end) return { node: entry.node, offset: offset - entry.start };
    }
    return null;
  };
  const start = locate(at);
  const end = locate(at + ${JSON.stringify(phrase)}.length - 1);
  if (!start || !end) return false;
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  return true;
})()`);

const thesaurusReplace = async (selector, word, synonym) => {
  assert.equal(await selectIn(selector, word), true, `selected ${word}`);
  await js(`NeoThesaurus.openWord(${JSON.stringify(word)})`);
  const offered = await waitFor(`[...document.querySelectorAll('.neo-ext-thes-word')].some((b) => b.textContent === ${JSON.stringify(synonym)})`);
  assert.ok(offered, `the thesaurus offered ${synonym}`);
  await js(`[...document.querySelectorAll('.neo-ext-thes-word')].find((b) => b.textContent === ${JSON.stringify(synonym)}).click()`);
  await waitFor(`!document.querySelector('.neo-ext-thes-backdrop')`);
  await tick(250);
};

const rephraseReplace = async (phrase) => {
  assert.equal(await selectIn(`.chapter[data-id="ch-1"] .chapter-body`, phrase), true, 'selected the sentence');
  await js(`NeoRephrase.openPending()`);
  const filled = await waitFor(`(() => {
    const card = document.querySelectorAll('.neo-rephrase-card')[2];
    const text = card && card.querySelector('.neo-rephrase-text');
    return !!text && !text.hidden;
  })()`);
  assert.ok(filled, 'the Natural rewrite arrived');
  await js(`document.querySelectorAll('.neo-rephrase-card')[2].click()`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
  await tick(300);
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('History is the fourth tab and starts empty', async () => {
  await openBook(BOOK1);
  await historyTab();
  const s = await tabState();
  assert.equal(s.tabs, true);
  assert.deepEqual(s.choices, ['notes', 'records', 'inventory', 'history']);
  assert.equal(s.history, true);
  assert.equal(s.rows.length, 0);
  assert.match(s.empty, /No replacements/);
});

test('a thesaurus replacement is recorded with its chapter, and shows at once', async () => {
  await thesaurusReplace('.chapter[data-id="ch-1"] .chapter-body', 'batch', 'pile');
  const entries = await waitEntries(BOOK1, 1);
  const entry = entries[0];
  assert.equal(entry.tool, 'thesaurus');
  assert.equal(entry.from, 'batch');
  assert.equal(entry.to, 'pile');
  assert.equal(entry.chapterId, 'ch-1');
  assert.equal(entry.chapterNumber, 1);
  assert.equal(entry.chapterTitle, 'The Thaw');
  const s = await tabState();
  assert.equal(s.rows.length, 1);
  assert.equal(s.rows[0].from, 'batch');
  assert.equal(s.rows[0].to, 'pile');
  assert.match(s.rows[0].where, /Thesaurus/);
  assert.match(s.rows[0].where, /Chapter 1/);
  // One undo restores the word and leaves the entry: it records what happened.
  await js(`document.querySelector('.chapter[data-id="ch-1"] .chapter-body').focus(); document.execCommand('undo')`);
  await tick(300);
  assert.match(await bodyText(), /a batch of letters/);
  assert.equal(historyEntries(BOOK1).length, 1, 'undo leaves the entry');
});

test('a rephrase replacement is recorded and listed newest first', async () => {
  await rephraseReplace(SENTENCE);
  const entries = await waitEntries(BOOK1, 2);
  assert.equal(entries[0].tool, 'rephrase');
  assert.equal(entries[0].label, 'Natural');
  assert.equal(entries[0].from, SENTENCE);
  assert.match(entries[0].to, /exhausted/);
  assert.equal(entries[0].chapterNumber, 1);
  const s = await tabState();
  assert.equal(s.rows.length, 2);
  assert.equal(s.rows[0].from, SENTENCE);
  assert.equal(s.rows[1].from, 'batch');
});

test('the history survives a reload, with dates and chapters', async () => {
  await wc.reload();
  assert.equal(await waitFor(`typeof library !== 'undefined' && !!library`), true);
  await openBook(BOOK1);
  await historyTab();
  const s = await tabState();
  assert.equal(s.rows.length, 2);
  assert.match(s.rows[0].where, /Chapter 1/);
  assert.match(s.rows[1].where, /Chapter 1/);
});

test('another book has its own, empty history', async () => {
  await openBook(BOOK2);
  await historyTab();
  const s = await tabState();
  assert.equal(s.rows.length, 0);
  assert.match(s.empty, /No replacements/);
  assert.equal(fs.existsSync(historyPath(BOOK2)), false, 'nothing was written for the second book');
});

test('a notes-page replacement is recorded without a chapter', async () => {
  await openBook(BOOK1);
  await js(`switchTab('notes')`);
  await tick(300);
  await js(`(() => {
    const ed = document.getElementById('aux-editor');
    ed.innerHTML = '<p>Notes about a batch of letters.</p>';
    ed.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(400);
  await thesaurusReplace('#aux-editor', 'batch', 'pile');
  const entries = await waitEntries(BOOK1, 3);
  assert.equal(entries[0].tool, 'thesaurus');
  assert.equal(entries[0].from, 'batch');
  assert.equal(entries[0].chapterId, '');
  assert.equal(entries[0].chapterNumber, 0);
  await historyTab();
  const s = await tabState();
  assert.equal(s.rows.length, 3);
  assert.equal(/Chapter/.test(s.rows[0].where), false, 'the notes-page entry has no chapter');
});

test('Simple NEO hides the tab and records nothing', async () => {
  const before = historyEntries(BOOK1).length;
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await tick(300);
  const off = await tabState();
  assert.equal(off.tabs, false);
  assert.equal(off.history, false);
  const recorded = await js(`NeoHistory.record({ tool: 'thesaurus', label: 'Thesaurus', from: 'batch', to: 'pile', inChapter: true })`);
  await tick(400);
  assert.equal(recorded, false, 'the recorder refuses while Simple NEO is on');
  assert.equal(historyEntries(BOOK1).length, before, 'no entry was added');
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(300);
  assert.equal((await tabState()).tabs, true);
  assert.equal(historyEntries(BOOK1).length, before, 'turning the switch back on adds nothing');
  assert.equal(historyEntries(BOOK1).length, 3);
});

test('viewing History never changes the manuscript, the save state, or undo', async () => {
  await js(`switchTab('manuscript')`);
  await tick(300);
  const before = await js(`(() => {
    const id = book.chapterOrder[0];
    const body = document.querySelector('.chapter[data-id="' + id + '"] .chapter-body');
    return { html: body.innerHTML, saved: savedHTML[id], undo: undoStack.length, redo: redoStack.length };
  })()`);
  await historyTab();
  await tick(400);
  const after = await js(`(() => {
    const id = book.chapterOrder[0];
    const body = document.querySelector('.chapter[data-id="' + id + '"] .chapter-body');
    return { html: body.innerHTML, saved: savedHTML[id], undo: undoStack.length, redo: redoStack.length };
  })()`);
  assert.deepEqual(after, before);
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
    win.focus();
    for (const t of tests) {
      try { await t.fn(); console.log('ok   ' + t.name); }
      catch (err) { failed++; console.log('FAIL ' + t.name + '\n     ' + String(err.message).replace(/\n/g, '\n     ')); }
    }
    console.log(`\n${tests.length - failed} passed, ${failed} failed`);
  } catch (err) { failed++; console.error(err); }
  finally { server.close(); app.exit(failed ? 1 : 0); }
}
main();
