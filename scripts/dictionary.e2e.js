// End-to-end tests for Dictionary… on a real page and a throwaway library.
// The definition window is read-only: opening it must leave the chapter, the
// save state, and the undo history exactly as they were.
// Run with `npm run test:dictionary`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-dictionary-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-dictionary-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
// The book is on disk before the app starts: no import race in setup.
const BOOK_ID = 'book-the-lantern-year-1';
const bookDir = path.join(lib, BOOK_ID);
fs.mkdirSync(path.join(bookDir, 'chapters'), { recursive: true });
fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify({
  id: BOOK_ID,
  title: 'The Lantern Year',
  author: 'Ines',
  chapterOrder: ['ch-1'],
  chapterTitles: { 'ch-1': 'The Thaw' },
  tabNames: { notes: 'Notes', outline: 'Outline' }
}));
fs.writeFileSync(path.join(bookDir, 'chapters', 'ch-1.html'),
  '<p>Ines found the lantern in the ice house. A batch of letters waited.</p>');
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night',
  spellLanguage: 'en-US',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK_ID] }]
}));
const loadFile = BrowserWindow.prototype.loadFile;
BrowserWindow.prototype.loadFile = function (file, opts) {
  return loadFile.call(this, path.resolve(__dirname, '..', file), opts);
};
require('../main.js');

let wc;
const js = (code) => wc.executeJavaScript(code, true);
const tick = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

const storyId = () => js(`book.chapterOrder.filter((c) => isStory(c))[0]`);

// Open the real definition window on a word, the way the menu action does.
const openReal = async (word) => {
  await js(`NeoDictionary.openWord(${JSON.stringify(word)})`);
  for (let i = 0; i < 20 && !(await js(`!!document.querySelector('.neo-ext-dict')`)); i++) await tick(50);
  return js(`(() => {
    const el = document.querySelector('.neo-ext-dict');
    if (!el) return null;
    return {
      title: el.querySelector('.neo-ext-dict-title').textContent,
      role: el.getAttribute('role'),
      modal: el.getAttribute('aria-modal'),
      labelled: el.getAttribute('aria-labelledby'),
      groups: [...el.querySelectorAll('.neo-ext-dict-group h3')].map((h) => h.textContent),
      defs: el.querySelectorAll('.neo-ext-dict-def').length,
      examples: [...el.querySelectorAll('.neo-ext-dict-ex')].map((p) => p.textContent),
      scrolls: (() => { const list = el.querySelector('.neo-ext-dict-list'); return list.scrollHeight > list.clientHeight; })(),
      focused: document.activeElement && document.activeElement.className
    };
  })()`);
};

const pressed = async (key) => {
  wc.sendInputEvent({ type: 'keyDown', keyCode: key });
  wc.sendInputEvent({ type: 'keyUp', keyCode: key });
  await tick(120);
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the main process answers with definitions, not synonyms', async () => {
  const res = await js(`NeoForkNative.dictionary('batch')`);
  assert.equal(res.ok, true);
  assert.equal(res.word, 'batch');
  assert.ok(res.groups.length >= 2);
  assert.ok(res.groups.some((g) => g.senses.some((s) => Array.isArray(s.ex) && s.ex.length)));
  const inflected = await js(`NeoForkNative.dictionary('batches')`);
  assert.equal(inflected.word, 'batch');
  const possessive = await js(`NeoForkNative.dictionary("writer's")`);
  assert.equal(possessive.word, 'writer');
  const miss = await js(`NeoForkNative.dictionary('xyzzyplugh')`);
  assert.equal(miss.reason, 'none');
});

test('the window names the word, groups by part of speech, and quotes examples', async () => {
  await js(`NeoDictionary.openWord('batch')`);
  for (let i = 0; i < 20 && !(await js(`!!document.querySelector('.neo-ext-dict')`)); i++) await tick(50);
  const win = await js(`(() => {
    const el = document.querySelector('.neo-ext-dict');
    return {
      title: el.querySelector('.neo-ext-dict-title').textContent,
      groups: [...el.querySelectorAll('.neo-ext-dict-group h3')].map((h) => h.textContent),
      defs: el.querySelectorAll('.neo-ext-dict-def').length,
      examples: [...el.querySelectorAll('.neo-ext-dict-ex')].map((p) => p.textContent)
    };
  })()`);
  assert.match(win.title, /definitions? for “batch”/);
  assert.deepEqual(win.groups, ['Noun', 'Verb']);
  assert.ok(win.defs >= 2);
  const withExample = win.examples.find((e) => e.startsWith('“') && e.endsWith('”'));
  assert.ok(withExample, 'an example is shown in quotation marks');
  await pressed('Escape');
  assert.equal(await js(`!!document.querySelector('.neo-ext-dict')`), false);
});

test('a long entry scrolls inside a window that keeps its size', async () => {
  const groups = [{ pos: 'verb', senses: Array.from({ length: 40 }, (_, i) => ({ def: `definition number ${i + 1}`, ex: [`example sentence ${i + 1}`] })) }];
  await js(`NeoDictionaryWindow.open({ word: 'run', groups: ${JSON.stringify(groups)}, count: 40 })`);
  const win = await js(`(() => {
    const el = document.querySelector('.neo-ext-dict');
    const list = el.querySelector('.neo-ext-dict-list');
    const box = el.getBoundingClientRect();
    return { scrolls: list.scrollHeight > list.clientHeight, height: box.height, viewport: innerHeight, scrollY };
  })()`);
  assert.equal(win.scrolls, true);
  assert.ok(win.height <= win.viewport);
  assert.equal(win.scrollY, 0, 'the manuscript page did not move');
  await js(`NeoDictionaryWindow.close()`);
});

test('Esc closes the real window and focus returns to the editor', async () => {
  const ch = await storyId();
  await js(`document.querySelector('.chapter[data-id="${ch}"] .chapter-body').focus()`);
  await openReal('batch');
  assert.equal(await js(`document.activeElement.closest('.neo-ext-dict') !== null`), true);
  await pressed('Escape');
  assert.equal(await js(`document.activeElement.closest('.chapter-body') !== null`), true);
});

test('reading and closing changes no word, no save state, no undo entry', async () => {
  const ch = await storyId();
  const before = await js(`({
    html: chapterHTML[${JSON.stringify(ch)}],
    saved: savedHTML[${JSON.stringify(ch)}],
    undo: undoStack.length,
    redo: redoStack.length,
    events: 0
  })`);
  await js(`(() => {
    window.__neoDictInputs = 0;
    document.addEventListener('input', () => { window.__neoDictInputs += 1; }, true);
  })()`);
  await openReal('batch');
  await pressed('Escape');
  const after = await js(`({
    html: chapterHTML[${JSON.stringify(ch)}],
    saved: savedHTML[${JSON.stringify(ch)}],
    undo: undoStack.length,
    redo: redoStack.length,
    events: window.__neoDictInputs
  })`);
  assert.equal(after.html, before.html);
  assert.equal(after.saved, before.saved);
  assert.equal(after.undo, before.undo);
  assert.equal(after.redo, before.redo);
  assert.equal(after.events, 0);
});

test('the right-click word offers Dictionary… and Thesaurus…, in order', async () => {
  const ch = await storyId();
  const at = await js(`(async () => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    body.innerHTML = '<p>a batch of letters</p>';
    syncChapter(body, ${JSON.stringify(ch)});
    const node = body.firstChild.firstChild;
    const at = node.data.indexOf('batch');
    const r = document.createRange();
    r.setStart(node, at + 2);
    r.setEnd(node, at + 2);
    const box = r.getBoundingClientRect();
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 2, clientY: box.top + 2 }));
    return NeoWordContext.current() && NeoWordContext.current().word;
  })()`);
  assert.equal(at, 'batch');
  const items = await js(`(() => { const list = []; NeoExtApi.lookUpMenu(list, 'batch'); return list; })()`);
  assert.deepEqual(items, [
    { label: 'Dictionary…', value: 'dictionary' },
    { label: 'Thesaurus…', value: 'thesaurus' }
  ]);
});

// Resolve a word the way the editor does, at the coordinates of that word.
const wordIn = async (mount, text) => {
  for (let attempt = 0; attempt < 4; attempt++) {
    const word = await js(`(() => {
      const mount = ${JSON.stringify(mount)};
      const ed = document.querySelector(mount);
      if (!ed) return null;
      const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
      let node = null;
      while (walker.nextNode()) { if (walker.currentNode.data.includes(${JSON.stringify(text)})) { node = walker.currentNode; break; } }
      if (!node) return null;
      const at = node.data.indexOf(${JSON.stringify(text)});
      const r = document.createRange();
      r.setStart(node, at + 2);
      r.setEnd(node, at + 2);
      const box = r.getBoundingClientRect();
      ed.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 2, clientY: box.top + 2 }));
      return NeoWordContext.current() && NeoWordContext.current().word;
    })()`);
    if (word) return word;
    await tick(150);
  }
  return null;
};

test('the notes page and a footnote text offer the same word', async () => {
  await js(`switchTab('notes')`);
  await tick(300);
  await js(`document.getElementById('aux-editor').innerHTML = '<p>a batch of notes</p>'`);
  assert.equal(await wordIn('#aux-editor', 'batch'), 'batch');
  await js(`document.getElementById('aux-editor').innerHTML = ''`);
  await js(`switchTab('manuscript')`);
  await tick(300);

  const ch = await storyId();
  await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    const p = document.createElement('p');
    p.innerHTML = 'note: <span class="fn-text" contenteditable="true">batch</span>';
    body.appendChild(p);
  })()`);
  assert.equal(await wordIn('.chapter-body .fn-text', 'batch'), 'batch');
  await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    body.innerHTML = '<p>Ines found the lantern in the ice house. A batch of letters waited.</p>';
    syncChapter(body, ${JSON.stringify(ch)});
  })()`);
});

test('French and Simple NEO hide both features', async () => {
  const ch = await storyId();
  const word = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    body.innerHTML = '<p>a batch of letters</p>';
    syncChapter(body, ${JSON.stringify(ch)});
    const node = body.firstChild.firstChild;
    const at = node.data.indexOf('batch');
    const r = document.createRange();
    r.setStart(node, at + 2);
    r.setEnd(node, at + 2);
    const box = r.getBoundingClientRect();
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 2, clientY: box.top + 2 }));
    return NeoWordContext.current() && NeoWordContext.current().word;
  })()`);
  assert.equal(word, 'batch');

  const none = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    const node = body.firstChild.firstChild;
    const at = node.data.indexOf('batch');
    const r = document.createRange();
    r.setStart(node, at + 2);
    r.setEnd(node, at + 2);
    const box = r.getBoundingClientRect();
    const fire = () => body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 2, clientY: box.top + 2 }));
    const before = library.spellLanguage;
    library.spellLanguage = 'fr';
    fire();
    const french = NeoWordContext.current();
    library.spellLanguage = before;
    const more = library.moreFeatures;
    library.moreFeatures = false;
    fire();
    const simple = NeoWordContext.current();
    library.moreFeatures = more;
    fire();
    const restored = NeoWordContext.current();
    return [!!french, !!simple, !!restored];
  })()`);
  assert.deepEqual(none, [false, false, true]);
});

test('the thesaurus still replaces one word from the new data', async () => {
  const ch = await storyId();
  await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    body.innerHTML = '<p>a good idea</p>';
    syncChapter(body, ${JSON.stringify(ch)});
    const node = body.firstChild.firstChild;
    const at = node.data.indexOf('good');
    const r = document.createRange();
    r.setStart(node, at + 2);
    r.setEnd(node, at + 2);
    const box = r.getBoundingClientRect();
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 2, clientY: box.top + 2 }));
  })()`);
  assert.equal(await js(`NeoWordContext.current().word`), 'good');
  await js(`NeoThesaurus.openWord('good')`);
  for (let i = 0; i < 20 && !(await js(`!!document.querySelector('.neo-ext-thes')`)); i++) await tick(50);
  const label = await js(`[...document.querySelectorAll('.neo-ext-thes-group h3')].map((h) => h.textContent).join(' | ')`);
  assert.match(label, /Antonym/);
  const picked = await js(`(() => {
    const button = [...document.querySelectorAll('.neo-ext-thes-word')].find((b) => b.textContent === 'bad');
    if (!button) return '';
    button.click();
    return button.textContent;
  })()`);
  assert.equal(picked, 'bad');
  await tick(150);
  assert.equal(await js(`document.querySelector('.chapter[data-id="${ch}"] .chapter-body').innerHTML.replace(' data-first=""', '')`), '<p>a bad idea</p>');
  assert.equal(await js(`!!document.querySelector('.neo-ext-thes')`), false);
});

test('Dictionary… returns focus to the chapter it was opened from', async () => {
  const ch = await storyId();
  await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    body.innerHTML = '<p>a batch of letters</p>';
    syncChapter(body, ${JSON.stringify(ch)});
    const node = body.firstChild.firstChild;
    const at = node.data.indexOf('batch');
    const r = document.createRange();
    r.setStart(node, at + 2);
    r.setEnd(node, at + 2);
    const box = r.getBoundingClientRect();
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 2, clientY: box.top + 2 }));
  })()`);
  // the Look Up popup path leaves DOM focus on <body> when the item is chosen
  await js(`document.activeElement.blur()`);
  await js(`NeoWordContext.lookUpChoice('dictionary', 'batch')`);
  for (let i = 0; i < 20 && !(await js(`!!document.querySelector('.neo-ext-dict')`)); i++) await tick(50);
  await pressed('Escape');
  const focused = await js(`(() => {
    const el = document.activeElement && document.activeElement.closest && document.activeElement.closest('.chapter-body');
    return el ? el.closest('.chapter').dataset.id : '';
  })()`);
  assert.equal(focused, ch);
});

test('a click outside the window closes it', async () => {
  await openReal('batch');
  await js(`document.querySelector('.neo-ext-dict-backdrop').dispatchEvent(new MouseEvent('mousedown', { bubbles: true }))`);
  await tick(100);
  assert.equal(await js(`!!document.querySelector('.neo-ext-dict')`), false);
});

test('the menu action from the main process opens the definition window', async () => {
  wc.send('menu', { type: 'neo-ext', action: 'dictionary', word: 'batch' });
  for (let i = 0; i < 20 && !(await js(`!!document.querySelector('.neo-ext-dict')`)); i++) await tick(50);
  const title = await js(`document.querySelector('.neo-ext-dict-title') && document.querySelector('.neo-ext-dict-title').textContent`);
  assert.match(String(title), /definitions? for “batch”/);
  await pressed('Escape');
  assert.equal(await js(`!!document.querySelector('.neo-ext-dict')`), false);
});

test('another NEO dialog keeps the definition window closed, and says why', async () => {
  await js(`document.getElementById('firstrun').hidden = false`);
  await tick(100);
  await js(`NeoDictionary.openWord('batch')`);
  await tick(300);
  assert.equal(await js(`!!document.querySelector('.neo-ext-dict')`), false);
  const toast = await js(`(() => { const el = [...document.querySelectorAll('.neo-ext-toast')].pop(); return el && el.textContent; })()`);
  assert.match(String(toast), /Close the other window first/);
  await js(`document.getElementById('firstrun').hidden = true`);
  await js(`document.querySelectorAll('.neo-ext-toast').forEach((el) => el.remove())`);
});

/* ---------- runner ---------- */

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    let win;
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await openBook(${JSON.stringify(BOOK_ID)});
    })()`);
    await tick(500);
    // let the dictionary and thesaurus data probes settle
    await tick(300);
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
