// End-to-end tests for Rephrase… (adr-012).
// Run with `npm run test:rephrase`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const prompt = require('../neo-ext/lib/rephrase-prompt.js');

let mode = 'ok';
let failNext = false;
let hits = 0;
const labelHits = {};
const server = http.createServer((req, res) => {
  hits += 1;
  if (req.url.endsWith('/models')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end('{"data":[]}');
    return;
  }
  let body = '';
  req.on('data', (chunk) => { body += chunk; });
  req.on('end', () => {
    if (mode === 'auth') { res.writeHead(401); res.end('{}'); return; }
    if (mode === 'redirect') { res.writeHead(307, { Location: 'http://127.0.0.1:1/x' }); res.end(); return; }
    let label = 'Natural';
    try { label = /<profile label="([^"]+)"/.exec(body)[1]; } catch { /* default */ }
    labelHits[label] = (labelHits[label] || 0) + 1;
    if (failNext) {
      failNext = false;
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"stub failure"}}');
      return;
    }
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: { content: `(${label}) She was exhausted and wanted to stop.` } }] }));
    }, 250);
  });
});

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-rephrase-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-rephrase-test-${process.pid}-`));
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
fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({ id: BOOK, title: 'The Lantern Year', author: 'Ines', chapterOrder: ['ch-1', 'ch-2'], chapterTitles: { 'ch-1': 'One', 'ch-2': 'Two' } }));
fs.writeFileSync(path.join(dir, 'chapters', 'ch-1.html'), '<p>The inn was loud. She was very tired and did not want to go on. He paid and left.</p>');
fs.writeFileSync(path.join(dir, 'chapters', 'ch-2.html'), '<p>' + 'word '.repeat(300) + '</p>');
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({ authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night', spellLanguage: 'en-US', shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK] }] }));

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
const has = () => js(`!!(window.NeoRephrase && NeoRephrase.has())`);
const openWindow = async () => {
  await js(`NeoRephrase.openPending()`);
  await waitFor(`!!document.querySelector('.neo-rephrase')`);
  await tick(120);
};
const cards = () => js(`[...document.querySelectorAll('.neo-rephrase-card')].map((b) => ({
  label: b.querySelector('.neo-rephrase-label')?.textContent,
  text: b.querySelector('.neo-rephrase-text')?.hidden ? '' : b.querySelector('.neo-rephrase-text')?.textContent,
  status: b.querySelector('.neo-rephrase-status')?.hidden ? '' : b.querySelector('.neo-rephrase-status')?.textContent,
  retry: !b.querySelector('.neo-rephrase-retry')?.hidden
}))`);
const bodyText = () => js(`document.querySelector('.chapter[data-id="ch-1"] .chapter-body').textContent`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('settings gain General and AI tabs with the local endpoint', async () => {
  await js(`NeoSettings.open()`);
  await waitFor(`!!document.querySelector('.neo-ext-tabs')`);
  const tabs = await js(`[...document.querySelectorAll('.neo-ext-tab')].map((b) => b.textContent)`);
  assert.deepEqual(tabs, ['General', 'AI']);
  await js(`document.querySelector('.neo-ext-tab').focus()`);
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))`);
  await tick(150);
  assert.equal(await js(`document.querySelector('.neo-ext-tab[aria-selected="true"]')?.textContent`), 'AI');
  await js(`[...document.querySelectorAll('.neo-ext-tab')].find((b) => b.textContent === 'AI').click()`);
  await tick(200);
  assert.equal(await js(`document.querySelector('#neo-ext-rephrase-rephraseEndpoint')?.value`), endpoint);
  assert.equal(await js(`document.querySelectorAll('.neo-ext-profile').length`), 5);
  await js(`[...document.querySelectorAll('.neo-ext-choose')].find((b) => b.textContent === 'Test connection')?.click()`);
  await waitFor(`[...document.querySelectorAll('.neo-ext-hint')].some((h) => h.textContent === 'Reachable')`);
  assert.equal(await js(`[...document.querySelectorAll('.neo-ext-hint')].some((h) => h.textContent === 'Reachable')`), true);
  await js(`document.querySelector('.neo-ext-save').click()`);
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(200);
});

test('a selection captures and opens one card per profile, which fill progressively', async () => {
  await tick(300);
  await openBook();
  await select('She was very tired and did not want to go on.');
  assert.equal(await has(), true);
  await openWindow();
  let list = await cards();
  assert.equal(list.length, 5);
  assert.equal(list[0].label, 'Polite');
  assert.ok(list.every((card) => !card.text), 'no card has text at open');
  await waitFor(`[...document.querySelectorAll('.neo-rephrase-text')].filter((t) => !t.hidden).length >= 1`);
  list = await cards();
  assert.ok(list.some((card) => card.text), 'a card filled before the rest');
  assert.ok(list.some((card) => !card.text), 'the queue was still writing');
  await waitFor(`[...document.querySelectorAll('.neo-rephrase-text')].filter((t) => !t.hidden).length === 5`);
  list = await cards();
  assert.ok(list.every((card) => /exhausted/.test(card.text)));
});

test('choosing a card replaces exactly the selection and one undo restores it', async () => {
  const before = await bodyText();
  await js(`document.querySelectorAll('.neo-rephrase-card')[2].click()`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
  await tick(200);
  const after = await bodyText();
  assert.notEqual(after, before);
  assert.match(after, /\(Natural\) She was exhausted/);
  await js(`document.activeElement.closest('.chapter-body')?.focus(); document.execCommand('undo')`);
  await tick(200);
  assert.equal(await bodyText(), before);
});

test('Esc stops the queue and leaves the manuscript alone', async () => {
  await select('She was very tired and did not want to go on.');
  await openWindow();
  const before = await bodyText();
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
  const seen = hits;
  await tick(600);
  assert.equal(hits, seen, 'no further requests were made');
  assert.equal(await bodyText(), before);
});

test('a moved selection writes nothing', async () => {
  await select('She was very tired and did not want to go on.');
  await openWindow();
  await waitFor(`[...document.querySelectorAll('.neo-rephrase-text')].filter((t) => !t.hidden).length >= 1`);
  await js(`(() => {
    const p = document.querySelector('.chapter[data-id="ch-1"] .chapter-body p');
    p.textContent = p.textContent.replace('She was very tired', 'She was exhausted');
    p.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(150);
  await js(`document.querySelectorAll('.neo-rephrase-card')[0].click()`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
  await tick(200);
  const after = await bodyText();
  assert.match(after, /She was exhausted/);
  assert.equal(after.includes('(Natural)'), false, 'no card text was inserted');
  await js(`(() => {
    const p = document.querySelector('.chapter[data-id="ch-1"] .chapter-body p');
    p.textContent = p.textContent.replace('She was exhausted', 'She was very tired');
    p.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(150);
});

test('a failed endpoint shows Try again on each card', async () => {
  mode = 'auth';
  await select('She was very tired and did not want to go on.');
  await openWindow();
  await waitFor(`[...document.querySelectorAll('.neo-rephrase-retry')].filter((t) => !t.hidden).length === 5`);
  mode = 'ok';
  const list = await cards();
  assert.ok(list.every((card) => card.retry));
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
});

test('the macOS one-word Look Up popup offers Rephrase…', async () => {
  await select('She');
  const items = await js(`(() => {
    const list = [{ label: 'Look Up', value: 'lookup' }];
    NeoExtApi.lookUpMenu(list, 'She');
    return list;
  })()`);
  assert.ok(items.some((item) => item.value === 'rephrase-open'), JSON.stringify(items));
});

test('an invalid endpoint blocks every settings write', async () => {
  await js(`NeoSettings.open()`);
  await waitFor(`!!document.querySelector('.neo-ext-tabs')`);
  await js(`[...document.querySelectorAll('.neo-ext-tab')].find((b) => b.textContent === 'AI').click()`);
  await tick(150);
  const file = path.join(tmp, 'app', 'settings.json');
  const before = fs.readFileSync(file, 'utf8');
  await js(`(() => {
    const el = document.querySelector('#neo-ext-rephrase-rephraseEndpoint');
    el.value = 'https://api.example.com/v1';
    el.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('.neo-ext-save').click();
  })()`);
  await waitFor(`!document.querySelector('.neo-ext-error').hidden`);
  assert.match(await js(`document.querySelector('.neo-ext-error').textContent`), /local machine/i);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'nothing was written');
  await js(`document.querySelector('.neo-ext-cancel').click()`);
});

test('a sentence above 1,200 characters and a two-paragraph selection offer nothing', async () => {
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
    return NeoRephrase.has();
  })()`);
  assert.equal(long, false);
  const two = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="ch-1"] .chapter-body');
    const p = body.querySelector('p');
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, 4);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return NeoRephrase.capture({ text: sel.toString(), range, body, paragraphEl: p, sameBlock: false });
  })()`);
  assert.equal(two, false);
});

test('one failed profile retries alone', async () => {
  if (await js(`!!document.querySelector('.neo-rephrase')`)) {
    await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
    await waitFor(`!document.querySelector('.neo-rephrase')`);
  }
  failNext = true;
  await select('She was very tired and did not want to go on.');
  await openWindow();
  await waitFor(`[...document.querySelectorAll('.neo-rephrase-retry')].filter((t) => !t.hidden).length === 1`);
  const failedLabel = await js(`[...document.querySelectorAll('.neo-rephrase-card')].find((b) => !b.querySelector('.neo-rephrase-retry').hidden)?.querySelector('.neo-rephrase-label')?.textContent`);
  assert.ok(failedLabel, 'one card shows Try again');
  await waitFor(`[...document.querySelectorAll('.neo-rephrase-text')].filter((t) => !t.hidden).length === 4`);
  const hitsBefore = hits;
  await js(`(() => { const b = [...document.querySelectorAll('.neo-rephrase-card')].find((x) => !x.querySelector('.neo-rephrase-retry').hidden); b.querySelector('.neo-rephrase-retry').click(); })()`);
  await waitFor(`(() => { const b = [...document.querySelectorAll('.neo-rephrase-card')].find((x) => x.querySelector('.neo-rephrase-label')?.textContent === ${JSON.stringify(failedLabel)}); return b && !b.querySelector('.neo-rephrase-text').hidden; })()`);
  assert.equal(hits, hitsBefore + 1, 'only the failed profile was asked again');
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
});

test('Tab stays inside the rephrase window and a second open is refused', async () => {
  await select('She was very tired and did not want to go on.');
  await openWindow();
  await js(`document.querySelector('.neo-rephrase-cancel').focus()`);
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true }))`);
  await tick(100);
  assert.equal(await js(`document.activeElement.classList.contains('neo-rephrase-card')`), true);
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
  await js(`Promise.all([NeoRephrase.openPending(), NeoRephrase.openPending()])`);
  await waitFor(`!!document.querySelector('.neo-rephrase')`);
  await tick(150);
  assert.equal(await js(`document.querySelectorAll('.neo-rephrase').length`), 1, 'one window from two near-simultaneous opens');
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await waitFor(`!document.querySelector('.neo-rephrase')`);
});

test('Simple NEO hides the AI tab and the menu item', async () => {
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await tick(300);
  await select('She was very tired and did not want to go on.');
  assert.equal(await has(), false);
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(300);
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
