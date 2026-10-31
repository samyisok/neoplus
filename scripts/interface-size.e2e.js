// End-to-end tests for Settings → Interface Size (adr-015).
// A throwaway library; the size previews, cancels, saves, survives a reload,
// works in Simple NEO, and never touches the page.
// Run with `npm run test:interface-size`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-interface-size-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-interface-size-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
fs.mkdirSync(path.join(tmp, 'app'), { recursive: true });
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const BOOK = 'book-the-lantern-year-1';
const dir = path.join(lib, BOOK);
fs.mkdirSync(path.join(dir, 'chapters'), { recursive: true });
fs.writeFileSync(path.join(dir, 'book.json'), JSON.stringify({
  id: BOOK, title: 'The Lantern Year', author: 'Ines', chapterOrder: ['ch-1'], chapterTitles: { 'ch-1': 'The Thaw' }
}));
fs.writeFileSync(path.join(dir, 'chapters', 'ch-1.html'), '<p>Ines found the lantern in the ice house.</p>');
fs.writeFileSync(path.join(lib, 'library.json'), JSON.stringify({
  authorName: '', penNames: [], firstRunDone: true, moreFeatures: true, pageTheme: 'night',
  spellLanguage: 'en-US', shelves: [{ id: 'shelf-1', name: 'Works in Progress', bookIds: [BOOK] }]
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

const openBook = async () => {
  await js(`(async () => { document.getElementById('firstrun').hidden = true; await openBook(${JSON.stringify(BOOK)}); })()`);
  await waitFor(`typeof book !== 'undefined' && book && book.id === ${JSON.stringify(BOOK)}`);
  await tick(500);
  await js(`switchTab('manuscript')`);
  await tick(300);
};

const zoom = () => js(`Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'))`);
const pageZoom = () => js(`getComputedStyle(document.documentElement).getPropertyValue('--page-zoom').trim()`);
const editorSize = () => js(`getComputedStyle(document.documentElement).getPropertyValue('--editor-size').trim()`);
const openSettings = async () => {
  await js(`NeoExt.openSettings()`);
  await waitFor(`!!document.querySelector('.neo-ext-settings')`);
  await tick(200);
  await js(`(() => { const tab = [...document.querySelectorAll('.neo-ext-tab')].find((b) => b.dataset.tab === 'General'); tab?.click(); })()`);
  await tick(100);
};
const rowState = (key) => js(`(() => {
  const section = document.querySelector('[data-group="interface-size"]');
  const row = section && section.querySelector('[data-key="${key}"]');
  if (!row) return null;
  const output = row.querySelector('.neo-ext-zoom-value');
  const buttons = [...row.querySelectorAll('.neo-ext-zoom-step')];
  return {
    value: output?.textContent || '',
    buttons: buttons.map((b) => b.textContent),
    disabled: buttons.map((b) => b.disabled),
    cardZoom: Number(getComputedStyle(document.querySelector('.neo-ext-settings')).zoom || 1)
  };
})()`);
const press = (label, key = 'uiZoom') => js(`(() => {
  const row = document.querySelector('[data-group="interface-size"] [data-key="${key}"]');
  const button = row && [...row.querySelectorAll('.neo-ext-zoom-step')].find((b) => b.textContent === ${JSON.stringify(label)});
  button?.click();
  return !!button;
})()`);
const closeWith = (label) => js(`(() => {
  const button = [...document.querySelectorAll('.neo-ext-actions button')].find((b) => b.textContent === ${JSON.stringify(label)});
  button?.click();
  return !!button;
})()`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('Settings offers Interface Size at 100% and previews Larger', async () => {
  await openBook();
  const pageBefore = {
    zoom: await pageZoom(),
    size: await editorSize(),
    width: await js(`document.querySelector('.chapter')?.getBoundingClientRect().width || 0`)
  };
  await openSettings();
  const before = await rowState('uiZoom');
  assert.ok(before, 'the Interface Size group is in General');
  assert.equal(before.value, '100%');
  assert.deepEqual(before.buttons, ['Smaller', 'Larger', 'Reset']);
  assert.equal(before.disabled[0], false, 'Smaller is available above 90%');
  const cardBefore = await js(`document.querySelector('.neo-ext-settings').getBoundingClientRect().width`);
  assert.equal(await press('Larger'), true);
  assert.equal(await press('Larger'), true);
  await tick(200);
  const after = await rowState('uiZoom');
  assert.equal(after.value, '120%');
  assert.equal(await zoom(), 1.2);
  assert.equal(Math.round(after.cardZoom * 10) / 10, 1.2, 'the dialog grows with the interface');
  const cardAfter = await js(`document.querySelector('.neo-ext-settings').getBoundingClientRect().width`);
  assert.ok(cardAfter > cardBefore + 50, 'the window itself grows, not only the text inside it');
  assert.equal(await js(`(() => { const r = document.querySelector('.neo-ext-settings').getBoundingClientRect(); return r.left >= 0 && r.right <= window.innerWidth; })()`), true, 'it stays on screen');
  assert.deepEqual({
    zoom: await pageZoom(),
    size: await editorSize(),
    width: await js(`document.querySelector('.chapter')?.getBoundingClientRect().width || 0`)
  }, pageBefore, 'the page did not move');
});

test('Escape takes the preview back', async () => {
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(250);
  assert.equal(await zoom(), 1);
  assert.equal(await js(`Number(library.uiZoom || 1)`), 1);
});

test('the Cancel button takes the preview back and stores nothing', async () => {
  await openSettings();
  await press('Larger');
  await tick(150);
  assert.equal(await zoom(), 1.1);
  assert.equal(await closeWith('Cancel'), true);
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(300);
  assert.equal(await zoom(), 1);
  assert.equal(await js(`Number(library.uiZoom || 1)`), 1);
});

test('clicking outside the window takes the preview back', async () => {
  await openSettings();
  await press('Larger');
  await tick(150);
  await js(`(() => {
    const card = document.querySelector('.neo-ext-settings');
    const backdrop = card && card.parentElement;
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  })()`);
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(250);
  assert.equal(await zoom(), 1);
});

test('Save keeps 120% and it survives a reload', async () => {
  await openSettings();
  await press('Larger');
  await press('Larger');
  await tick(150);
  assert.equal(await closeWith('Save'), true);
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(400);
  assert.equal(await zoom(), 1.2);
  assert.equal(await js(`library.uiZoom`), 1.2);

  await wc.reload();
  assert.equal(await waitFor(`typeof library !== 'undefined' && !!library`), true);
  await openBook();
  await tick(300);
  assert.equal(await zoom(), 1.2, 'the size survived the reload');
});

test('Interface text grows the fork text, not the boxes', async () => {
  await openBook();
  const paneW = await js(`document.getElementById('side-pane').getBoundingClientRect().width`);
  const tabBefore = await js(`parseFloat(getComputedStyle(document.querySelector('#neo-side-tabs .neo-side-tab')).fontSize)`);
  const pageFont = await js(`getComputedStyle(document.querySelector('.chapter-body')).fontSize`);
  await openSettings();
  const headingBefore = await js(`parseFloat(getComputedStyle(document.querySelector('.neo-ext-group h3')).fontSize)`);
  const cardBefore = await js(`document.querySelector('.neo-ext-settings').getBoundingClientRect().width`);
  for (let i = 0; i < 4; i += 1) assert.equal(await press('Larger', 'uiText'), true);
  await tick(200);
  assert.equal((await rowState('uiText')).value, '140%');
  const headingAfter = await js(`parseFloat(getComputedStyle(document.querySelector('.neo-ext-group h3')).fontSize)`);
  assert.ok(Math.abs(headingAfter / headingBefore - 1.4) < 0.06, `text grew: ${headingBefore} -> ${headingAfter}`);
  assert.equal(
    Math.round(await js(`document.querySelector('.neo-ext-settings').getBoundingClientRect().width`)),
    Math.round(cardBefore),
    'the dialog box did not grow'
  );
  await closeWith('Cancel');
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(200);
  assert.equal(await js(`getComputedStyle(document.documentElement).getPropertyValue('--ui-text').trim()`), '1');

  await openSettings();
  for (let i = 0; i < 4; i += 1) await press('Larger', 'uiText');
  await closeWith('Save');
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(300);
  await js(`pinPane('side', true)`);
  await tick(200);
  const tabAfter = await js(`parseFloat(getComputedStyle(document.querySelector('#neo-side-tabs .neo-side-tab')).fontSize)`);
  assert.ok(Math.abs(tabAfter / tabBefore - 1.4) < 0.06, `pane text grew: ${tabBefore} -> ${tabAfter}`);
  assert.equal(
    Math.round(await js(`document.getElementById('side-pane').getBoundingClientRect().width`)),
    Math.round(paneW),
    'the pane width did not grow'
  );
  assert.equal(await js(`getComputedStyle(document.querySelector('.chapter-body')).fontSize`), pageFont, 'the page text did not change');

  await wc.reload();
  assert.equal(await waitFor(`typeof library !== 'undefined' && !!library`), true);
  await openBook();
  await tick(300);
  assert.equal(await js(`getComputedStyle(document.documentElement).getPropertyValue('--ui-text').trim()`), '1.4', 'the text size survived the reload');
  await openSettings();
  assert.equal((await rowState('uiText')).value, '140%');

  await press('Reset', 'uiText');
  await closeWith('Save');
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(200);
});

test('Simple NEO at launch keeps the stored size and the control', async () => {
  const file = path.join(lib, 'library.json');
  const held = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.writeFileSync(file, JSON.stringify({ ...held, moreFeatures: false }));
  await wc.reload();
  assert.equal(await waitFor(`typeof library !== 'undefined' && !!library`), true);
  await tick(400);
  assert.equal(await js(`library.moreFeatures`), false);
  assert.equal(
    await waitFor(`Number(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) === 1.2`),
    true,
    'the boot re-apply honors the stored size before a book opens'
  );
  await openBook();
  await tick(300);
  assert.equal(await zoom(), 1.2, 'Simple NEO honors the stored size at launch');
  await openSettings();
  const state = await rowState('uiZoom');
  assert.ok(state, 'the group is present in Simple NEO');
  assert.ok(await rowState('uiText'), 'the text row is present in Simple NEO');
  assert.equal((await rowState('uiText')).value, '100%');
  assert.equal(state.value, '120%');
  await press('Larger');
  await tick(150);
  assert.equal(await zoom(), 1.3);
  await closeWith('Cancel');
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(250);
  assert.equal(await zoom(), 1.2, 'Cancel returns to the stored size');

  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(300);
});

test('a failed save keeps the window open and does not keep the size', async () => {
  await js(`(() => { window.__realSetUiLook = NeoExtApi.setUiLook; NeoExtApi.setUiLook = async () => ({ ok: false, reason: 'write' }); return true; })()`);
  await openSettings();
  await press('Larger');
  await tick(150);
  assert.equal(await closeWith('Save'), true);
  await tick(400);
  assert.equal(await js(`!!document.querySelector('.neo-ext-settings')`), true, 'the window stays open');
  const error = await js(`document.querySelector('.neo-ext-error')?.textContent || ''`);
  assert.match(error, /could not be saved/);
  assert.equal(await zoom(), 1.3, 'the choice previews while the window is open');
  await closeWith('Cancel');
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(300);
  assert.equal(await zoom(), 1.2, 'Cancel returns to the stored size');
  assert.equal(await js(`library.uiZoom`), 1.2);
  await js(`(() => { NeoExtApi.setUiLook = window.__realSetUiLook; return true; })()`);
});

test('Cancel or Escape cannot interrupt a save in flight', async () => {
  await js(`(() => {
    window.__realSetUiLook2 = NeoExtApi.setUiLook;
    NeoExtApi.setUiLook = (value) => new Promise((resolve) => setTimeout(() => resolve(window.__realSetUiLook2(value)), 500));
    return true;
  })()`);
  await openSettings();
  await press('Larger');
  await tick(120);
  await closeWith('Save');
  await js(`document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`);
  await tick(900);
  assert.equal(await js(`!!document.querySelector('.neo-ext-settings')`), false, 'the save finished and closed the window');
  assert.equal(await zoom(), 1.3, 'the saved size is the one applied');
  assert.equal(await js(`library.uiZoom`), 1.3);
  await js(`(() => { NeoExtApi.setUiLook = window.__realSetUiLook2; return true; })()`);
  // put the device back to 120% for the remaining checks
  await openSettings();
  await press('Reset');
  await press('Larger');
  await press('Larger');
  await closeWith('Save');
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(300);
  assert.equal(await zoom(), 1.2);
});

test('a toast follows the interface size', async () => {
  await js(`NeoExt.toast('Interface size test')`);
  assert.equal(await waitFor(`!!document.querySelector('.neo-ext-toast')`), true);
  const toastZoom = await js(`Number(getComputedStyle(document.querySelector('.neo-ext-toast')).zoom || 1)`);
  assert.equal(Math.round(toastZoom * 10) / 10, 1.2);
  assert.equal(await js(`document.querySelector('.neo-ext-toast').getBoundingClientRect().width <= document.documentElement.clientWidth`), true);
});

test('the Reset button returns to 100%', async () => {
  await openSettings();
  assert.equal(await press('Reset'), true);
  await tick(150);
  assert.equal((await rowState('uiZoom')).value, '100%');
  assert.equal(await zoom(), 1);
  await closeWith('Cancel');
  await waitFor(`!document.querySelector('.neo-ext-settings')`);
  await tick(300);
  assert.equal(await zoom(), 1.2);
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
