// End-to-end tests for Inventory (adr-008).
// Run with `npm run test:inventory`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-inv-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-inv-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const BOOK = 'book-the-lantern-year-1';
const dir = path.join(lib, BOOK);
const chapters = {
  'ch-1': ['Hero opened the pouch and saw 200 gold coins.'],
  'ch-2': ['The road was long.'],
  'ch-3': ['He paid 25 gold coins for a bed.'],
  'ch-4': ['He paid for room in the INN 50 gold coins.'],
  'ch-5': ['The purse felt light.']
};
fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
const order = Object.keys(chapters);
fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({
  id: BOOK, title: 'The Lantern Year', author: 'Ines', chapterOrder: order,
  chapterTitles: { 'ch-1': 'One', 'ch-2': 'Two', 'ch-3': 'Three', 'ch-4': 'Four', 'ch-5': 'Five' },
  sectionNotes: { 'ch-2': [{ id: 'sec-a' }, { id: 'sec-b' }] }
}));
for (const [id, lines] of Object.entries(chapters)) {
  if (id === 'ch-2') {
    fs.writeFileSync(path.join(dir, 'chapters', `${id}.html`),
      '<p data-sec-id="sec-a">The road was long.</p><p class="scene-break">***</p><p data-sec-id="sec-b">A trader sold 40 silver bars.</p>');
    continue;
  }
  fs.writeFileSync(path.join(dir, 'chapters', `${id}.html`), lines.map((line) => `<p>${line}</p>`).join(''));
}
const BOOK2 = 'book-the-silver-sea-2';
const dir2 = path.join(lib, BOOK2);
fs.mkdirSync(path.join(dir2, 'chapters'), { recursive: true });
fs.writeFileSync(path.join(dir2, 'book.json'), JSON.stringify({
  id: BOOK2, title: 'The Silver Sea', author: 'Ines', chapterOrder: ['ch-1'], chapterTitles: { 'ch-1': 'One' }
}));
fs.writeFileSync(path.join(dir2, 'chapters', 'ch-1.html'), '<p>Silver everywhere.</p>');
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night',
  spellLanguage: 'en-US', shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK, BOOK2] }]
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
const openBook = async (id = BOOK) => {
  await js(`(async () => { document.getElementById('firstrun').hidden = true; await openBook(${JSON.stringify(id)}); })()`);
  await waitFor(`typeof book !== 'undefined' && book && book.id === ${JSON.stringify(id)}`);
  await tick(700);
  await js(`switchTab('manuscript')`);
  await tick(200);
};
const select = (chapterId, phrase) => js(`(() => {
  const body = document.querySelector('.chapter[data-id="${chapterId}"] .chapter-body');
  body.focus();
  const p = [...body.querySelectorAll('p')].find((node) => node.textContent.includes(${JSON.stringify(phrase)}));
  if (!p) return null;
  const walker = document.createTreeWalker(p, NodeFilter.SHOW_TEXT);
  let text = '';
  const nodes = [];
  let node;
  while ((node = walker.nextNode())) { nodes.push({ node, start: text.length }); text += node.data; }
  const at = text.indexOf(${JSON.stringify(phrase)});
  if (at < 0) return null;
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
  return NeoInventory.selectionAnchor({ phrase: ${JSON.stringify(phrase)}, body, paragraphEl: p, range });
})()`);
const openModal = async (chapterId, phrase) => {
  const anchor = await select(chapterId, phrase);
  assert.ok(anchor, `anchor for ${phrase}`);
  await js(`NeoInventory.openFromSelection(${JSON.stringify(phrase)}, ${JSON.stringify(anchor)})`);
  await waitFor(`!!document.querySelector('.neo-inv-modal')`);
  await tick(150);
  return anchor;
};
const fillNew = async (name, category, amount) => {
  await js(`(() => {
    const set = (sel, value) => { const el = document.querySelector(sel); if (!el) return false; el.value = value; el.dispatchEvent(new Event('input', { bubbles: true })); return true; };
    set('.neo-inv-name-input', ${JSON.stringify(name)});
    set('.neo-inv-category-input', ${JSON.stringify(category)});
    set('.neo-inv-amount-input', ${JSON.stringify(amount)});
  })()`);
};
const fillExisting = async (name, amount) => {
  await js(`(() => {
    const pick = [...document.querySelectorAll('.neo-inv-pick')].find((b) => b.textContent.startsWith(${JSON.stringify(name)} + ' —'));
    if (pick) pick.click();
  })()`);
  await tick(120);
  await js(`(() => { const el = document.querySelector('.neo-inv-amount-input'); el.value = ${JSON.stringify(amount)}; el.dispatchEvent(new Event('input', { bubbles: true })); })()`);
};
const saveModal = async () => {
  await js(`document.querySelector('.neo-inv-save').click()`);
  await waitFor(`!document.querySelector('.neo-inv-modal')`);
  await tick(900);
};
const inventoryState = () => js(`(() => ({
  rows: [...document.querySelectorAll('.neo-inv-item')].map((row) => ({
    name: row.querySelector('.neo-inv-name')?.textContent,
    amount: row.querySelector('.neo-inv-amount')?.textContent
  })),
  where: document.getElementById('neo-inventory-where')?.textContent || '',
  status: document.getElementById('neo-inventory-status')?.textContent || '',
  tabs: [...document.querySelectorAll('#neo-side-tabs .neo-side-tab')].filter((t) => !t.hidden).map((t) => t.textContent)
}))()`);
const openItemLog = async (name) => {
  await js(`(() => {
    const row = [...document.querySelectorAll('.neo-inv-item')].find((node) => node.querySelector('.neo-inv-name')?.textContent === ${JSON.stringify(name)});
    const button = row && row.querySelector('.neo-inv-name');
    if (button && button.getAttribute('aria-expanded') !== 'true') button.click();
  })()`);
  await waitFor(`!!document.getElementById('neo-inventory-log')`);
  await tick(200);
};
const showInventory = async () => {
  await js(`document.querySelector('#neo-side-tabs .neo-side-tab[data-view="inventory"]')?.click()`);
  await waitFor(`!document.getElementById('neo-inventory-view').hidden`);
  await tick(400);
};

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the pane offers Notes | Records | Inventory and keeps the manuscript', async () => {
  await js(`switchTab('manuscript')`);
  await tick(400);
  const s = await inventoryState();
  assert.deepEqual(s.tabs, ['Notes', 'Records', 'Inventory']);
  await showInventory();
  assert.equal(await js(`document.querySelector('.tab.active')?.dataset.tab || document.body.dataset.tab`), 'manuscript');
  assert.match((await inventoryState()).where, /One|Whole book/);
});

test('create an item and a transaction from a phrase', async () => {
  await showInventory();
  await openModal('ch-1', 'saw 200 gold coins');
  await fillNew('gold coin', 'Items', '+200');
  await saveModal();
  const s = await inventoryState();
  assert.deepEqual(s.rows, [{ name: 'gold coin', amount: '+200' }]);
  assert.equal(fs.existsSync(path.join(dir, 'neo-ext-inventory.json')), true);
});

test('a later chapter subtracts, and an earlier chapter still shows the old balance', async () => {
  await openModal('ch-4', '50 gold coins');
  await fillExisting('gold coin', '-50');
  await saveModal();
  let s = await inventoryState();
  assert.deepEqual(s.rows, [{ name: 'gold coin', amount: '+150' }]);
  await js(`document.querySelector('.chapter[data-id="ch-3"] .chapter-body').focus()`);
  await tick(300);
  s = await inventoryState();
  assert.deepEqual(s.rows, [{ name: 'gold coin', amount: '+200' }]);
  await js(`document.querySelector('.chapter[data-id="ch-5"] .chapter-body').focus()`);
  await tick(300);
});

test('the log lists one line per transaction and a line jumps to its phrase', async () => {
  await showInventory();
  await openItemLog('gold coin');
  const lines = await js(`[...document.querySelectorAll('.neo-inv-line-go')].map((b) => b.textContent)`);
  assert.deepEqual(lines, ['One: +200', 'Four: -50']);
  await js(`document.querySelector('.neo-inv-line-go').click()`);
  await tick(400);
  assert.equal(await js(`window.getSelection().toString()`), 'saw 200 gold coins');
});

test('a status item lives beside the purse and zero/negative show as they are', async () => {
  await showInventory();
  await openModal('ch-4', '50 gold coins');
  await fillNew('Health Points', 'Status', '+100');
  await saveModal();
  await openModal('ch-4', '50 gold coins');
  await fillExisting('Health Points', '-10');
  await saveModal();
  await openModal('ch-4', '50 gold coins');
  await fillExisting('Health Points', '-10');
  await saveModal();
  await openModal('ch-4', '50 gold coins');
  await fillExisting('Health Points', '-10');
  await saveModal();
  const s = await inventoryState();
  assert.deepEqual(s.rows.map((row) => row.name).sort(), ['Health Points', 'gold coin']);
  assert.equal(s.rows.find((row) => row.name === 'Health Points').amount, '+70');
  const categories = await js(`[...document.querySelectorAll('.neo-inv-category')].map((b) => b.textContent.trim())`);
  assert.ok(categories.some((c) => c.includes('Items')) && categories.some((c) => c.includes('Status')));
});

test('a half-typed transaction is not written when the modal is cancelled', async () => {
  const before = fs.readFileSync(path.join(dir, 'neo-ext-inventory.json'), 'utf8');
  await showInventory();
  await openModal('ch-4', '50 gold coins');
  await fillNew('Silver', 'Items', '+5');
  await js(`document.querySelector('.neo-inv-cancel').click()`);
  await tick(700);
  assert.equal(fs.readFileSync(path.join(dir, 'neo-ext-inventory.json'), 'utf8'), before);
});

test('removing a transaction by hand retires it after a confirmation', async () => {
  await showInventory();
  await openItemLog('gold coin');
  assert.equal(await js(`document.querySelectorAll('.neo-inv-line-go').length`), 2);
  await js(`document.querySelectorAll('.neo-inv-line .neo-inv-remove')[1].click()`);
  await tick(150);
  await js(`document.querySelector('.neo-inv-remove-cancel').click()`);
  await tick(150);
  assert.equal(await js(`document.querySelectorAll('.neo-inv-line-go').length`), 2);
  await js(`document.querySelectorAll('.neo-inv-line .neo-inv-remove')[1].click()`);
  await tick(150);
  await js(`document.querySelector('.neo-inv-remove-confirm').click()`);
  await tick(900);
  const s = await inventoryState();
  assert.equal(s.rows.find((row) => row.name === 'gold coin').amount, '+200');
  assert.equal(await js(`document.querySelectorAll('.neo-inv-line-go').length`), 1);
});

test('deleting the anchored words retires the transaction and lowers later balances', async () => {
  await showInventory();
  await js(`(() => {
    const body = document.querySelector('.chapter[data-id="ch-1"] .chapter-body');
    body.querySelector('p').textContent = 'The pouch was empty.';
    body.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(1600);
  const s = await inventoryState();
  assert.equal(s.rows.find((row) => row.name === 'gold coin').amount, '0');
  await js(`document.querySelector('.chapter[data-id="ch-5"] .chapter-body').focus()`);
  await tick(300);
  assert.equal((await inventoryState()).rows.find((row) => row.name === 'gold coin').amount, '0');
});

test('inventory never changes the chapter or the structural undo', async () => {
  const before = await js(`({ html: chapterHTML['ch-4'], undo: undoStack.length })`);
  await openModal('ch-4', 'INN 50 gold coins');
  await fillExisting('gold coin', '-5');
  await saveModal();
  const after = await js(`({ html: chapterHTML['ch-4'], undo: undoStack.length })`);
  assert.equal(after.html, before.html);
  assert.equal(after.undo, before.undo);
});

test('the ledger belongs to the open book', async () => {
  await openBook(BOOK2);
  await showInventory();
  const empty = await inventoryState();
  assert.equal(empty.rows.length, 0, 'another book starts with no inventory');
  await openBook(BOOK);
  await showInventory();
  assert.ok((await inventoryState()).rows.some((row) => row.name === 'Health Points'));
});

test('a transaction in a later section keeps its section and is not rewritten', async () => {
  await showInventory();
  const seedAnchor = await select('ch-2', '40 silver bars');
  await js(`NeoInventory.openFromSelection('40 silver bars', ${JSON.stringify(seedAnchor)})`);
  await waitFor(`!!document.querySelector('.neo-inv-modal')`);
  await fillNew('silver bar', 'Items', '+40');
  await saveModal();
  const file = path.join(dir, 'neo-ext-inventory.json');
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  const silver = stored.transactions.find((tx) => tx.quote === '40 silver bars');
  assert.equal(silver.sectionId, 'sec-b');
  const before = fs.readFileSync(file, 'utf8');
  await js(`document.querySelector('.chapter[data-id="ch-2"] .chapter-body').focus()`);
  await js(`window.dispatchEvent(new Event('focus'))`);
  await tick(1800);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'an unchanged section is not rewritten');
});

test('a clean reconcile does not write the ledger', async () => {
  await showInventory();
  await tick(900);
  const file = path.join(dir, 'neo-ext-inventory.json');
  const before = fs.readFileSync(file, 'utf8');
  await tick(1600);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('a chapter changed on disk retires its transaction on focus', async () => {
  await showInventory();
  await openModal('ch-5', 'purse felt light');
  await fillNew('rope', 'Items', '+3');
  await saveModal();
  assert.ok((await inventoryState()).rows.some((row) => row.name === 'rope'));
  fs.writeFileSync(path.join(dir, 'chapters', 'ch-5.html'), '<p>The purse felt empty.</p>');
  await js(`refreshFromDisk()`);
  await tick(2600);
  await tick(400);
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'neo-ext-inventory.json'), 'utf8'));
  const rope = stored.transactions.find((tx) => tx.quote === 'purse felt light');
  assert.ok(rope, 'the transaction is still in the file');
  assert.ok(rope.removedAt > 0, 'the transaction is retired after the disk change');
  await showInventory();
  const row = (await inventoryState()).rows.find((entry) => entry.name === 'rope');
  assert.equal(row.amount, '0');
});

test('a save pending when the book changes lands in the book it was recorded in', async () => {
  await showInventory();
  await openModal('ch-3', '25 gold coins');
  await fillNew('gem', 'Items', '+5');
  await js(`document.querySelector('.neo-inv-save').click()`);
  await openBook(BOOK2);
  await tick(1400);
  await openBook(BOOK);
  const stored = JSON.parse(fs.readFileSync(path.join(dir, 'neo-ext-inventory.json'), 'utf8'));
  const gem = stored.items.find((item) => item.name === 'gem');
  assert.ok(gem, 'the item was saved');
  assert.ok(stored.transactions.some((tx) => tx.itemId === gem.id && tx.quote === '25 gold coins'), 'the transaction was saved in its own book');
  assert.equal(fs.existsSync(path.join(dir2, 'neo-ext-inventory.json')), false, 'nothing landed in the other book');
});

test('typing with Simple NEO off never touches the ledger', async () => {
  await showInventory();
  await tick(800);
  const file = path.join(dir, 'neo-ext-inventory.json');
  const before = fs.readFileSync(file, 'utf8');
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await js(`(() => {
    const body = document.querySelector('.chapter[data-id="ch-2"] .chapter-body');
    const p = document.createElement('p');
    p.textContent = '40 silver bars were counted again.';
    body.appendChild(p);
    body.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await tick(2200);
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(400);
});

test('a fold is open again after Inventory is reopened', async () => {
  await showInventory();
  await js(`document.querySelector('.neo-inv-category').click()`);
  await tick(200);
  assert.equal(await js(`document.querySelector('.neo-inv-category').getAttribute('aria-expanded')`), 'false');
  await js(`document.querySelector('#neo-side-tabs .neo-side-tab[data-view="notes"]').click()`);
  await tick(250);
  await showInventory();
  assert.equal(await js(`document.querySelector('.neo-inv-category').getAttribute('aria-expanded')`), 'true');
});

test('Escape cancels a pending transaction removal', async () => {
  await showInventory();
  await openItemLog('Health Points');
  const count = await js(`document.querySelectorAll('.neo-inv-line-go').length`);
  await js(`document.querySelector('.neo-inv-line .neo-inv-remove').click()`);
  await tick(150);
  await js(`document.querySelector('.neo-inv-remove-cancel').focus()`);
  await js(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`);
  await tick(200);
  assert.equal(await js(`document.querySelectorAll('.neo-inv-line-go').length`), count);
  assert.equal(await js(`!!document.querySelector('.neo-inv-remove-confirm')`), false);
});

test('scrolling to another chapter moves the balances with it', async () => {
  await showInventory();
  await js(`document.querySelector('.chapter[data-id="ch-3"] .chapter-body').focus()`);
  await tick(200);
  await js(`(() => {
    currentChapterId = 'ch-5';
    document.getElementById('paper-scroll').dispatchEvent(new Event('scroll'));
  })()`);
  await tick(300);
  assert.match((await inventoryState()).where, /Five/);
});

test('a placeholder paragraph cannot host a transaction', async () => {
  const anchor = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="ch-1"] .chapter-body');
    const p = document.createElement('p');
    p.className = 'ghost';
    p.textContent = 'ghost words here';
    body.appendChild(p);
    const range = document.createRange();
    range.setStart(p.firstChild, 0);
    range.setEnd(p.firstChild, 5);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return NeoInventory.selectionAnchor({ phrase: 'ghost', body, paragraphEl: p, range });
  })()`);
  assert.equal(anchor, null);
});

test('an unreadable chapter defers retirement', async () => {
  await showInventory();
  const file = path.join(dir, 'neo-ext-inventory.json');
  await js(`(() => {
    const api = window.NeoExtApi;
    window.__originalUnread = api.unreadChapters;
    api.unreadChapters = async () => ({ ok: true, ids: ['ch-1'] });
    const body = document.querySelector('.chapter[data-id="ch-1"] .chapter-body');
    body.querySelector('p').textContent = 'The pouch vanished.';
    body.dispatchEvent(new Event('input', { bubbles: true }));
    window.dispatchEvent(new Event('focus'));
  })()`);
  await tick(1800);
  const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(stored.transactions.every((tx) => tx.removedAt > 0 || tx.quote !== 'saw 200 gold coins'), 'nothing retired while a chapter is unreadable');
  assert.match((await inventoryState()).status, /Waiting/);
  await js(`(() => { window.NeoExtApi.unreadChapters = window.__originalUnread; delete window.__originalUnread; })()`);
});

test('Simple NEO hides the tab and closes the view', async () => {
  await showInventory();
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await tick(400);
  const tabs = await js(`[...document.querySelectorAll('#neo-side-tabs .neo-side-tab')].filter((t) => !t.hidden).map((t) => t.textContent)`);
  assert.deepEqual(tabs, ['Notes']);
  assert.equal(await js(`document.getElementById('neo-inventory-view').hidden`), true);
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
