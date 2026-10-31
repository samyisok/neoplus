// End-to-end tests for Grammar… (adr-017).
// Run with `npm run test:grammar`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const prompt = require('../neo-ext/lib/rephrase-prompt.js');
const grammarMain = require('../neo-ext/grammar-main.js');

let mode = 'issues';
let styleMode = 'ok';
let grammarHits = 0;
let styleHits = 0;
let queued = null;

const server = http.createServer((req, res) => {
  if (req.url.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"data":[]}');
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    let parsed = null;
    try { parsed = JSON.parse(body); } catch { parsed = null; }
    const system = parsed && parsed.messages && parsed.messages[0] ? parsed.messages[0].content : '';
    if (/line editor/i.test(system)) {
      styleHits += 1;
      if (styleMode === 'fail') {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end('{"error":{"message":"stub failure"}}');
        return;
      }
      let content = styleMode === 'clean'
        ? 'CLEAN'
        : '{"quote":"stood","example":"remained","message":"corrected only"}\n'
          + '{"quote":"pile of bodies","example":"heap of bodies","message":"word"}';
      if (styleMode === 'filtered') content = '{"quote":"stood","example":"remained","message":"corrected only"}';
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      return;
    }
    grammarHits += 1;
    if (mode === 'auth') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{}');
      return;
    }
    let content = '{"quote":"stand","fix":"stood","message":"past tense"}\n'
      + '{"quote":"midle","fix":"middle","message":"spelling"}\n'
      + '{"quote":"white hat","fix":"a white hat","message":"article"}';
    if (mode === 'contextLeak') {
      content = '{"quote":"stand","fix":"stood","message":"past tense"}\n'
        + '{"quote":"She paid and left.","fix":"She paid and left the inn.","message":"missing word"}';
    }
    if (mode === 'insertFirst') content = '{"quote":"white hat","fix":"a white hat","message":"missing article"}';
    if (mode === 'noopOnly') content = '{"quote":"He stood in the middle.","fix":"He stood in the middle.","message":"No errors"}';
    if (mode === 'whole') content = '{"quote":"He stand in the midle of the pile of bodies. He wore white hat.","fix":"He stood in the midle of the pile of bodies. He wore white hat.","message":"past tense"}';
    if (mode === 'empty') content = '';
    if (mode === 'clean') content = 'CLEAN';
    if (mode === 'noop') content = '{"quote":"stood","fix":"stood","message":"No errors"}\nCLEAN';
    if (mode === 'prose') content = 'No errors found.';
    if (mode === 'unlocatable') content = '{"quote":"zzz","fix":"x","message":"nowhere"}';
    if (mode === 'overlap') content = '{"quote":"white hat","fix":"a white hat","message":"article"}\n{"quote":"hat","fix":"caps","message":"word"}';
    if (mode === 'delete') content = '{"quote":"He stand in the midle of the pile of bodies. He wore white hat.","fix":"","message":"cut"}';
    if (mode === 'partial') content = '{"quote":"midle","fix":"","message":"cut"}';
    if (queued && queued.length) content = queued.shift();
    if (mode === 'slowIssues') {
      setTimeout(() => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }, 700);
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
});

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-grammar-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-grammar-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
let endpoint = '';
const settings = prompt.defaultSettings();
server.listen(0, '127.0.0.1', () => {
  endpoint = `http://127.0.0.1:${server.address().port}/v1`;
  fs.writeFileSync(path.join(tmp, 'app', 'settings.json'), JSON.stringify({ rephrase: { ...settings, endpoint } }));
});

const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const BOOK = 'book-the-lantern-year-1';
const dir = path.join(lib, BOOK);
fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({
  id: BOOK, title: 'The Lantern Year', author: 'Ines',
  chapterOrder: ['ch-1', 'ch-2'], chapterTitles: { 'ch-1': 'One', 'ch-2': 'Two' }
}));
fs.writeFileSync(path.join(dir, 'chapters', 'ch-1.html'),
  '<p>The inn was loud.</p><p>He stand in the midle of the pile of bodies. He wore white hat.</p><p>She paid and left.</p>');
fs.writeFileSync(path.join(dir, 'chapters', 'ch-2.html'), '<p>' + 'word '.repeat(300) + '</p>');
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true,
  pageTheme: 'night', spellLanguage: 'en-US',
  shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK] }]
}));

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
const openBook = async () => {
  await js(`(async () => { document.getElementById('firstrun').hidden = true; await openBook(${JSON.stringify(BOOK)}); })()`);
  await waitFor(`typeof book !== 'undefined' && book && book.id === ${JSON.stringify(BOOK)}`);
  await tick(700);
  await js(`switchTab('manuscript')`);
  await tick(200);
};
const select = (phrase) => js(`(() => {
  const body = document.querySelector('.chapter[data-id="ch-1"] .chapter-body');
  body.focus();
  const p = [...body.querySelectorAll('p')].find((node) => node.textContent.includes(${JSON.stringify(phrase)}));
  if (!p) return false;
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
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
  const range = document.createRange();
  range.setStart(start.node, start.offset);
  range.setEnd(end.node, end.offset + 1);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
  body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
  return true;
})()`);
const bodyText = () => js(`document.querySelector('.chapter[data-id="ch-1"] .chapter-body').textContent`);
const has = () => js(`!!(window.NeoGrammar && NeoGrammar.has())`);
const openWindow = async () => {
  await js(`NeoGrammar.openPending()`);
  await waitFor(`!!document.querySelector('.neo-grammar')`);
};
const closeWindow = async () => {
  await js(`document.querySelector('.neo-grammar-close')?.click()`);
  await waitFor(`!document.querySelector('.neo-grammar')`);
};
const historyEntries = () => {
  try { return JSON.parse(fs.readFileSync(path.join(dir, 'neo-ext-history.json'), 'utf8')).entries; } catch { return []; }
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('a chapter selection opens the board with green fixes, red cards, and lines', async () => {
  mode = 'issues';
  styleMode = 'ok';
  await openBook();
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  assert.equal(await has(), true);
  const item = grammarMain.menuItem({ grammar: true }, (text) => text);
  assert.deepEqual(item, { label: 'Grammar…', action: 'grammar-open' });
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  const green = await js(`[...document.querySelectorAll('.neo-grammar-green')].map((n) => n.textContent)`);
  assert.equal(green.length, 3, JSON.stringify(green));
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 3);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-red').length`), 2);
  await waitFor(`document.querySelectorAll('.neo-grammar-line-grammar').length >= 1`);
  assert.ok(await js(`document.querySelectorAll('.neo-grammar-line-grammar').length >= 1`));
  assert.equal(await js(`document.querySelector('.neo-grammar-replace').disabled`), false);
});

test('Replace inserts the corrected text, one undo restores it, and History records Grammar', async () => {
  const before = await bodyText();
  await js(`document.querySelector('.neo-grammar-replace').click()`);
  await waitFor(`!document.querySelector('.neo-grammar')`);
  await tick(250);
  const after = await bodyText();
  assert.match(after, /He stood in the middle of the pile of bodies\. He wore a white hat\./);
  assert.equal(after.includes('He stand'), false);
  const entries = historyEntries();
  const entry = entries.find((row) => row.tool === 'grammar');
  assert.ok(entry, `history: ${JSON.stringify(entries)}`);
  assert.equal(entry.from, 'He stand in the midle of the pile of bodies. He wore white hat.');
  assert.equal(entry.to, 'He stood in the middle of the pile of bodies. He wore a white hat.');
  assert.equal(entry.chapterId, 'ch-1');
  assert.equal(await js(`!!document.activeElement.closest('.chapter-body')`), true, 'focus returns to the chapter');
  await js(`document.execCommand('undo')`);
  await tick(250);
  assert.equal(await bodyText(), before);
});

test('Close writes nothing', async () => {
  const before = await bodyText();
  const historyBefore = historyEntries().length;
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  await closeWindow();
  assert.equal(await bodyText(), before);
  assert.equal(historyEntries().length, historyBefore);
});

test('an unlocatable quote is listed as not applied and disables Replace', async () => {
  mode = 'unlocatable';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-not-applied').length`), 1);
  assert.match(await js(`document.querySelector('.neo-grammar-status').textContent`), /Nothing was applied/);
  assert.equal(await js(`document.querySelector('.neo-grammar-replace').disabled`), true);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-red').length`), 0);
  await closeWindow();
});

test('overlapping grammar spans keep the leftmost and mark the other', async () => {
  mode = 'overlap';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 2);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-not-applied').length`), 1);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-green').length`), 1);
  await closeWindow();
});

test('CLEAN and a no-op answer show a clean text with Replace disabled', async () => {
  mode = 'clean';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.match(await js(`document.querySelector('.neo-grammar-status').textContent`), /clean/i);
  assert.equal(await js(`document.querySelector('.neo-grammar-replace').disabled`), true);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 0);
  await closeWindow();

  mode = 'noop';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.match(await js(`document.querySelector('.neo-grammar-status').textContent`), /clean/i);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 0);
  await closeWindow();
});

test('a no-op-only answer shows a clean text', async () => {
  mode = 'noopOnly';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.match(await js(`document.querySelector('.neo-grammar-status').textContent`), /clean/i);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 0);
  assert.equal(await js(`document.querySelector('.neo-grammar-replace').disabled`), true);
  await closeWindow();
});

test('a prose answer retries once and then offers Try again', async () => {
  mode = 'prose';
  const before = grammarHits;
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-retry')`);
  assert.equal(grammarHits - before, 2, 'one silent retry');
  assert.equal(await js(`document.querySelector('.neo-grammar-retry').tagName`), 'BUTTON');
  await closeWindow();
});

test('Suggest style adds only original quotes and never changes the corrected text', async () => {
  mode = 'issues';
  styleMode = 'ok';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  const corrected = await js(`document.querySelector('.neo-grammar-corrected .neo-grammar-text').textContent`);
  await js(`document.querySelector('.neo-grammar-style').click()`);
  await waitFor(`document.querySelectorAll('.neo-grammar-card[data-kind="style"]').length >= 1`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-yellow').length`), 1);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card[data-kind="style"]').length`), 1, 'the corrected-only quote was dropped');
  assert.match(await js(`document.querySelector('.neo-grammar-card[data-kind="style"]').textContent`), /pile/);
  assert.equal(await js(`document.querySelector('.neo-grammar-corrected .neo-grammar-text').textContent`), corrected);
  await closeWindow();
});

test('a fix the model reports in the context paragraph is dropped, not shown', async () => {
  mode = 'contextLeak';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 1);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-not-applied').length`), 0);
  assert.equal(await js(`document.querySelector('.neo-grammar-card .neo-grammar-quote').textContent`), 'stand');
  await closeWindow();
  mode = 'issues';
});

test('a missing-article card still joins a line through its caret', async () => {
  mode = 'insertFirst';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-caret').length`), 1);
  await tick(200);
  const lines = await js(`[...document.querySelectorAll('.neo-grammar-line-grammar')].map((p) => p.dataset.card)`);
  assert.deepEqual(lines, ['1']);
  await closeWindow();
  mode = 'issues';
});

test('a style answer whose suggestions are all filtered says nothing to suggest', async () => {
  mode = 'issues';
  styleMode = 'filtered';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  await js(`document.querySelector('.neo-grammar-style').click()`);
  await waitFor(`/nothing to suggest/i.test(document.querySelector('.neo-grammar-notice')?.textContent || '')`);
  assert.equal(await js(`document.querySelector('.neo-grammar-style').textContent`), 'No style suggestions');
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card[data-kind="style"]').length`), 0);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 3);
  await closeWindow();
  styleMode = 'ok';
});

test('a failed style pass leaves the grammar board standing', async () => {
  mode = 'issues';
  styleMode = 'fail';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  await js(`document.querySelector('.neo-grammar-style').click()`);
  await waitFor(`/could not|not reachable|refused|too much/i.test(document.querySelector('.neo-grammar-notice')?.textContent || '')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 3);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-red').length`), 2);
  await closeWindow();
  styleMode = 'ok';
});

test('a deleted passage disables Replace', async () => {
  mode = 'delete';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelector('.neo-grammar-replace').disabled`), true);
  assert.match(await js(`document.querySelector('.neo-grammar-status').textContent`), /emptied/i);
  await closeWindow();
});

test('a moved selection writes nothing', async () => {
  mode = 'issues';
  const historyBefore = historyEntries().length;
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  await js(`(() => {
    const p = [...document.querySelectorAll('.chapter[data-id="ch-1"] .chapter-body p')].find((n) => n.textContent.includes('He stand'));
    p.textContent = p.textContent.replace('He stand', 'He stood');
    p.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(150);
  await js(`document.querySelector('.neo-grammar-replace').click()`);
  await waitFor(`!document.querySelector('.neo-grammar')`);
  await tick(200);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar').length`), 0);
  assert.equal(historyEntries().length, historyBefore);
  assert.match(await bodyText(), /He stood in the midle/);
  await js(`(() => {
    const p = [...document.querySelectorAll('.chapter[data-id="ch-1"] .chapter-body p')].find((n) => n.textContent.includes('He stood in the midle'));
    p.textContent = p.textContent.replace('He stood', 'He stand');
    p.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(150);
});

test('at Interface Size 300 % the board fits and its actions stay visible', async () => {
  mode = 'issues';
  await js(`library.uiZoom = 3; applyFonts();`);
  await tick(400);
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  const fit = await js(`(() => {
    const rect = document.querySelector('.neo-grammar').getBoundingClientRect();
    const button = document.querySelector('.neo-grammar-replace').getBoundingClientRect();
    const original = document.querySelector('.neo-grammar-original').getBoundingClientRect();
    return {
      inside: rect.left >= -1 && rect.top >= -1 && rect.right <= innerWidth + 1 && rect.bottom <= innerHeight + 1,
      button: button.width > 0 && button.height > 0 && button.bottom <= innerHeight + 1,
      narrow: document.querySelector('.neo-grammar-board').classList.contains('neo-grammar-narrow'),
      column: original.width,
    };
  })()`);
  assert.equal(fit.inside, true, JSON.stringify(fit));
  assert.equal(fit.button, true, JSON.stringify(fit));
  assert.equal(fit.narrow, true, 'the board stacks its columns at 300 %: ' + JSON.stringify(fit));
  assert.ok(fit.column > 300, `the original column is readable: ${fit.column}`);
  await closeWindow();
  await js(`library.uiZoom = 1; applyFonts();`);
  await tick(300);
});

test('the board follows an Interface Size change while it is open', async () => {
  mode = 'issues';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  await js(`library.uiZoom = 3; applyFonts();`);
  await tick(350);
  assert.equal(await js(`document.querySelector('.neo-grammar-board').classList.contains('neo-grammar-narrow')`), true);
  await js(`library.uiZoom = 1; applyFonts();`);
  await tick(350);
  assert.equal(await js(`document.querySelector('.neo-grammar-board').classList.contains('neo-grammar-narrow')`), false);
  await closeWindow();
});

test('a scrolled line ends at the top of its card', async () => {
  win.setSize(1000, 400);
  await tick(300);
  mode = 'issues';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  const result = await js(`(async () => {
    const body = document.querySelector('.neo-grammar-body');
    body.style.maxHeight = '90px';
    body.scrollTop = 40;
    await new Promise((resolve) => setTimeout(resolve, 120));
    const box = body.getBoundingClientRect();
    const zoom = body.offsetWidth ? box.width / body.offsetWidth : 1;
    const path = document.querySelector('.neo-grammar-line-grammar');
    if (!path) return { count: 0 };
    const card = document.querySelector('.neo-grammar-card[data-card="' + path.dataset.card + '"]');
    if (!card) return { count: 0 };
    const nums = (path.getAttribute('d').match(/-?\\d+(?:\\.\\d+)?/g) || []).map(Number);
    const x2 = nums[nums.length - 2];
    const y2 = nums[nums.length - 1];
    const c = card.getBoundingClientRect();
    return {
      count: document.querySelectorAll('.neo-grammar-line').length,
      scroll: body.scrollTop,
      scrollable: body.scrollHeight - body.clientHeight,
      d: path.getAttribute('d'),
      nums: nums.length,
      dx: Math.abs(x2 - (((c.left + c.right) / 2 - box.left) / zoom + body.scrollLeft)),
      dy: Math.abs(y2 - ((c.top - box.top) / zoom + body.scrollTop))
    };
  })()`);
  assert.ok(result.count > 0, JSON.stringify(result));
  assert.ok(result.dx < 3, JSON.stringify(result));
  assert.ok(result.dy < 3, JSON.stringify(result));
  await closeWindow();
  win.setSize(1200, 800);
  await tick(300);
});

test('the waiting line is focused for screen readers and draws no ring', async () => {
  mode = 'slowIssues';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-loading')`);
  const line = await js(`(() => {
    const el = document.querySelector('.neo-grammar-loading');
    if (!el) return null;
    const style = getComputedStyle(el);
    const box = el.getBoundingClientRect();
    return {
      focused: document.activeElement === el,
      outline: style.outlineStyle,
      width: style.outlineWidth,
      box: [Math.round(box.width), Math.round(box.height)]
    };
  })()`);
  assert.ok(line, 'the waiting line is on screen');
  assert.equal(line.focused, true, JSON.stringify(line));
  assert.equal(line.outline === 'none' || line.width === '0px', true, JSON.stringify(line));
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  await closeWindow();
  mode = 'issues';
});

test('turning Simple NEO off mid-board closes it and discards a late answer', async () => {
  mode = 'slowIssues';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  const before = await bodyText();
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await waitFor(`!document.querySelector('.neo-grammar')`);
  await tick(1200);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-board').length`), 0);
  assert.equal(await bodyText(), before);
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(300);
});

test('an empty answer retries once and then offers Try again', async () => {
  mode = 'empty';
  const before = grammarHits;
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-retry')`);
  assert.equal(grammarHits - before, 2, 'one silent retry');
  await closeWindow();
});

test('Try again asks again after a failed answer', async () => {
  mode = 'auth';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  const retryShown = await waitFor(`!!document.querySelector('.neo-grammar-retry')`);
  assert.equal(retryShown, true, await js(`document.querySelector('.neo-grammar-content')?.textContent || 'no content'`));
  const before = grammarHits;
  mode = 'issues';
  await js(`document.querySelector('.neo-grammar-retry').click()`);
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(grammarHits, before + 1);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-green').length`), 3);
  await closeWindow();
});

test('a retry replaces the first answer rather than merging it', async () => {
  mode = 'issues';
  queued = [
    '{"quote":"zzz","fix":"x","message":"nowhere"}',
    '{"quote":"stand","fix":"stood","message":"past"}'
  ];
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 1);
  assert.match(await js(`document.querySelector('.neo-grammar-card .neo-grammar-quote').textContent`), /stand/);
  assert.equal(await js(`document.body.textContent.includes('zzz')`), false);
  queued = null;
  await closeWindow();
});

test('a partial deletion is shown but gets no green span', async () => {
  mode = 'partial';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-green').length`), 0);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-red').length`), 1);
  assert.match(await js(`document.querySelector('.neo-grammar-change').textContent`), /delete/i);
  assert.equal(await js(`document.querySelector('.neo-grammar-replace').disabled`), false);
  await closeWindow();
});

test('a style CLEAN answer says there are no suggestions and keeps the board', async () => {
  mode = 'issues';
  styleMode = 'clean';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  await js(`document.querySelector('.neo-grammar-style').click()`);
  await waitFor(`/nothing to suggest/i.test(document.querySelector('.neo-grammar-notice')?.textContent || '')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-card').length`), 3);
  assert.equal(await js(`document.querySelector('.neo-grammar-style').textContent`), 'No style suggestions');
  await closeWindow();
  styleMode = 'ok';
});

test('a long or two-block selection offers no Grammar entry', async () => {
  const long = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="ch-2"] .chapter-body');
    body.focus();
    const p = body.querySelector('p');
    const node = p.firstChild;
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, 1300);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    body.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 5, clientY: 5 }));
    return NeoGrammar.has();
  })()`);
  assert.equal(long, false);
  const two = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="ch-1"] .chapter-body');
    const p = [...body.querySelectorAll('p')].find((n) => n.textContent.includes('He stand'));
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, 4);
    return NeoGrammar.capture({ text: 'He s', range, body, paragraphEl: p, sameBlock: false });
  })()`);
  assert.equal(two, false);
});

test('a whole-sentence answer highlights only the changed word', async () => {
  mode = 'whole';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-green').length`), 1);
  assert.equal(await js(`document.querySelector('.neo-grammar-green').textContent`), 'stood');
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-red').length`), 1);
  assert.equal(await js(`document.querySelector('.neo-grammar-quote').textContent`), 'stand');
  assert.equal(await js(`document.querySelector('.neo-grammar-change').textContent`), 'stood');
  await closeWindow();
});

test('a session lost while the board is open restarts on Try again', async () => {
  mode = 'auth';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-retry')`);
  grammarMain.sessions.clear();
  mode = 'issues';
  const before = grammarHits;
  await js(`document.querySelector('.neo-grammar-retry').click()`);
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  assert.equal(grammarHits, before + 1, 'the restarted session answered');
  assert.equal(await js(`document.querySelectorAll('.neo-grammar-green').length`), 3);
  await closeWindow();
});

test('a session lost while the board is open restarts on Suggest style', async () => {
  mode = 'issues';
  styleMode = 'ok';
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  await openWindow();
  await waitFor(`!!document.querySelector('.neo-grammar-board')`);
  grammarMain.sessions.clear();
  const before = styleHits;
  await js(`document.querySelector('.neo-grammar-style').click()`);
  await waitFor(`document.querySelectorAll('.neo-grammar-card[data-kind="style"]').length >= 1`);
  assert.equal(styleHits, before + 1, 'the restarted session answered');
  await closeWindow();
});

test('Simple NEO has no Grammar entry', async () => {
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await tick(300);
  await select('He stand in the midle of the pile of bodies. He wore white hat.');
  assert.equal(await has(), false);
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(300);
});

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    win.setSize(1200, 800);
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
    await tick(300);
    await openBook();
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
