// End-to-end tests for the resizable right-hand pane (adr-004).
// A throwaway library and a real window; the pane's width is a view
// preference, so nothing here may touch the book.
// Run with `npm run test:sidepane`.

'use strict';

const { app, BrowserWindow } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

for (const name of fs.readdirSync(os.tmpdir())) {
  const pid = /^neo-sidepane-test-(\d+)-/.exec(name);
  if (!pid || +pid[1] === process.pid) continue;
  try { process.kill(+pid[1], 0); continue; } catch (err) { if (err.code === 'EPERM') continue; }
  fs.rmSync(path.join(os.tmpdir(), name), { recursive: true, force: true });
}
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `neo-sidepane-test-${process.pid}-`));
app.setPath('userData', path.join(tmp, 'app'));
app.setPath('documents', tmp);
const lib = path.join(tmp, 'NEO Library');
fs.mkdirSync(lib);
const BOOK_ID = 'book-the-lantern-year-1';
const bookDir = path.join(lib, BOOK_ID);
fs.mkdirSync(path.join(bookDir, 'chapters'), { recursive: true });
fs.writeFileSync(path.join(bookDir, 'book.json'), JSON.stringify({
  id: BOOK_ID,
  title: 'The Lantern Year',
  author: 'Ines',
  chapterOrder: ['ch-1'],
  chapterTitles: { 'ch-1': 'The Thaw' }
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

const paneState = () => js(`(() => {
  const pane = document.getElementById('side-pane');
  const grip = document.querySelector('.neo-ext-side-grip');
  const box = pane.getBoundingClientRect();
  return {
    width: box.width,
    left: box.left,
    open: pane.classList.contains('open'),
    pinned: pane.dataset.pinned === '1',
    grip: !!grip && !grip.hidden,
    first: grip ? pane.firstElementChild === grip : false,
    role: grip && grip.getAttribute('role'),
    orientation: grip && grip.getAttribute('aria-orientation'),
    label: grip && (grip.getAttribute('aria-label') || '').trim(),
    min: grip && grip.getAttribute('aria-valuemin'),
    max: grip && grip.getAttribute('aria-valuemax'),
    now: grip && grip.getAttribute('aria-valuenow'),
    saved: localStorage.getItem('neo-ext-side-width')
  };
})()`);

const pin = (on = true) => js(`pinPane('side', ${on ? 'true' : 'false'})`);

const resetWidth = () => js(`document.querySelector('.neo-ext-side-grip').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))`);

const drag = (dx) => js(`(() => {
  const grip = document.querySelector('.neo-ext-side-grip');
  if (!grip) return null;
  const r = grip.getBoundingClientRect();
  const x = r.left + r.width / 2;
  const y = r.top + Math.min(60, r.height / 2);
  const fire = (type, at) => grip.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 7, pointerType: 'mouse', isPrimary: true,
    clientX: at, clientY: y, buttons: type === 'pointerup' ? 0 : 1
  }));
  fire('pointerdown', x);
  fire('pointermove', x + ${dx});
  fire('pointerup', x + ${dx});
  const pane = document.getElementById('side-pane');
  return { width: pane.getBoundingClientRect().width, left: pane.getBoundingClientRect().left, saved: localStorage.getItem('neo-ext-side-width'), vp: innerWidth, paper: document.getElementById('paper-scroll').getBoundingClientRect().width, zoom: getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom'), nav: document.getElementById('editor-view').classList.contains('nav-pinned'), board: document.getElementById('editor-view').classList.contains('board-on') };
})()`);

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('the pane has a separator as its first child, with its limits spoken', async () => {
  const s = await paneState();
  assert.equal(s.grip, true, 'a resize handle exists');
  assert.equal(s.first, true, 'the handle is the pane\'s first element');
  assert.equal(s.role, 'separator');
  assert.equal(s.orientation, 'vertical');
  assert.ok(s.label.length > 0, 'the handle has an accessible name');
  assert.equal(s.min, '220');
  assert.ok(Number(s.max) >= 220, 'aria-valuemax is a real maximum');
  assert.equal(s.now, '250');
});

test('a pointer drag widens the pinned pane and saves one whole value', async () => {
  await pin(true);
  const before = await paneState();
  assert.equal(before.open, true);
  assert.equal(before.pinned, true);
  const after = await drag(-100);
  assert.ok(after, 'the drag ran');
  assert.ok(Math.abs(after.width - 350) <= 2, `width ${after.width} is about 350 ${JSON.stringify(after)}`);
  assert.match(String(after.saved), /^\d+$/);
  assert.ok(Math.abs(Number(after.saved) - after.width) <= 2, 'the saved width matches the pane');
  const state = await paneState();
  assert.equal(state.now, String(Math.round(after.width)));
  assert.equal(await js(`!!document.querySelector('.neo-ext-toast') || !!document.querySelector('.modal-backdrop:not([hidden])')`), false, 'no dialog or toast');
});

test('the width survives a reload', async () => {
  await wc.reload();
  assert.equal(await waitFor(`typeof library !== 'undefined' && !!library`), true);
  await js(`document.getElementById('firstrun').hidden = true`);
  await js(`(async () => { await openBook(${JSON.stringify(BOOK_ID)}); })()`);
  await waitFor(`book && book.id === ${JSON.stringify(BOOK_ID)} && !document.getElementById('editor-view').hidden`);
  await tick(300);
  await pin(true);
  await tick(150);
  const s = await paneState();
  assert.ok(Math.abs(s.width - 350) <= 2, `width ${s.width} was restored`);
  assert.equal(s.now, String(Math.round(s.width)));
});

test('a drag right stops at 220, End reaches the maximum, and double-click resets', async () => {
  await pin(false);
  await js(`document.getElementById('side-pane').classList.add('open')`);
  await resetWidth();
  await tick(80);
  const right = await drag(2000);
  assert.ok(Math.abs(right.width - 220) <= 1, `a drag right stops at 220, not ${right.width}`);
  await resetWidth();
  await tick(80);
  assert.ok(Math.abs((await paneState()).width - 250) <= 1, 'a double-click restores 250');
  await js(`document.querySelector('.neo-ext-side-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))`);
  await tick(80);
  const end = await paneState();
  const wideLimit = await js(`Math.max(220, Math.min(840, Math.floor(innerWidth * 0.675)))`);
  assert.ok(Math.abs(end.width - wideLimit) <= 1, `End reaches ${wideLimit}, not ${end.width}`);
  assert.equal(end.saved, String(wideLimit));
});

test('a scrolled notes list leaves the handle at the pane edge', async () => {
  await pin(true);
  const tops = await js(`(() => {
    const pane = document.getElementById('side-pane');
    const list = document.getElementById('sticky-list');
    const spacer = document.createElement('div');
    spacer.id = 'neo-test-tall';
    spacer.style.height = '1600px';
    list.appendChild(spacer);
    const before = document.querySelector('.neo-ext-side-grip').getBoundingClientRect().top;
    pane.scrollTop = 400;
    const after = document.querySelector('.neo-ext-side-grip').getBoundingClientRect().top;
    return { before, after, scrolled: pane.scrollTop };
  })()`);
  assert.ok(tops.scrolled > 0, 'the notes list scrolled');
  assert.ok(Math.abs(tops.after - tops.before) <= 1, `grip moved ${tops.after - tops.before}`);
  await tick(150);
  const hits = await js(`(() => {
    const pane = document.getElementById('side-pane');
    const grip = document.querySelector('.neo-ext-side-grip');
    const box = pane.getBoundingClientRect();
    return { top: document.elementFromPoint(box.left + 4, box.top + 34) === grip };
  })()`);
  assert.equal(hits.top, true, 'the handle covers the pane\'s top edge, not just the padded content');
  await js(`(() => {
    document.getElementById('neo-test-tall')?.remove();
    document.getElementById('side-pane').scrollTop = 0;
  })()`);
});

test('a drag outside the pane keeps it open until release, then hover closes it', async () => {
  await pin(false);
  await js(`document.getElementById('side-pane').classList.add('open')`);
  const during = await js(`(async () => {
    const pane = document.getElementById('side-pane');
    const grip = document.querySelector('.neo-ext-side-grip');
    const r = grip.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + 60;
    const fire = (type, at) => grip.dispatchEvent(new PointerEvent(type, {
      bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true,
      clientX: at, clientY: y, buttons: type === 'pointerup' ? 0 : 1
    }));
    fire('pointerdown', x);
    fire('pointermove', 4);
    pane.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    document.documentElement.dispatchEvent(new MouseEvent('mouseleave', { bubbles: false }));
    window.dispatchEvent(new Event('blur'));
    await new Promise((resolve) => setTimeout(resolve, 30));
    return { open: pane.classList.contains('open'), body: document.body.classList.contains('neo-ext-resizing') };
  })()`);
  assert.equal(during.body, true, 'the drag is marked');
  assert.equal(during.open, true, 'the pane stayed open while the pointer was outside');
  const after = await js(`(() => {
    const grip = document.querySelector('.neo-ext-side-grip');
    grip.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', isPrimary: true,
      clientX: 4, clientY: 200, buttons: 0
    }));
    return { open: document.getElementById('side-pane').classList.contains('open'), body: document.body.classList.contains('neo-ext-resizing') };
  })()`);
  assert.equal(after.body, false);
  assert.equal(after.open, false, 'an unpinned pane closes after the gesture');
});

test('at interface size 125% the edge tracks the pointer', async () => {
  await pin(true);
  await js(`document.querySelector('.neo-ext-side-grip').dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))`);
  await tick(80);
  await js(`library.uiZoom = 1.25; applyFonts()`);
  await waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() === '1.25'`);
  await tick(150);
  const before = await js(`document.getElementById('side-pane').getBoundingClientRect().left`);
  const after = await drag(-30);
  assert.ok(after, 'the drag ran');
  assert.ok(Math.abs((before - after.left) - 30) <= 2, `left moved ${before - after.left}`);
  const clear = await js(`(() => {
    const page = document.getElementById('paper-scroll').getBoundingClientRect();
    const pane = document.getElementById('side-pane').getBoundingClientRect();
    return page.right <= pane.left + 2;
  })()`);
  assert.equal(clear, true, 'the page clears the pane at 125%');
  await js(`library.uiZoom = 1; applyFonts()`);
  await waitFor(`getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom').trim() === '1'`);
  await tick(100);
});

test('a pinned pane stops where the page begins, and the page moves by half', async () => {
  await pin(true);
  await js(`switchTab('manuscript')`);
  await tick(300);
  await resetWidth();
  await tick(80);
  const before = await js(`document.getElementById('paper-scroll').getBoundingClientRect().left`);
  const room = await js(`innerWidth - document.getElementById('paper-scroll').getBoundingClientRect().width`);
  const wide = await drag(-(room + 200));
  assert.ok(wide, 'the drag ran');
  assert.ok(Math.abs(wide.width - room) <= 2, `pane ${wide.width} stops at the room ${room}`);
  const clear = await js(`(() => {
    const page = document.getElementById('paper-scroll').getBoundingClientRect();
    const pane = document.getElementById('side-pane').getBoundingClientRect();
    return page.right <= pane.left + 2;
  })()`);
  assert.equal(clear, true, 'the page ends where the pane begins');

  await resetWidth();
  await tick(80);
  const base = await paneState();
  const beforeMove = await js(`document.getElementById('paper-scroll').getBoundingClientRect().left`);
  const grown = await drag(-60);
  const afterMove = await js(`document.getElementById('paper-scroll').getBoundingClientRect().left`);
  assert.ok(Math.abs((beforeMove - afterMove) - (grown.width - base.width) / 2) <= 2,
    `page moved ${beforeMove - afterMove} for a ${grown.width - base.width} px wider pane`);
});

test('both pinned panes keep the 220 px minimum and centre the page', async () => {
  await pin(true);
  await js(`pinPane('nav', true)`);
  await tick(150);
  await resetWidth();
  await tick(120);
  const s = await paneState();
  const want = await js(`(() => {
    const zoom = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--ui-zoom')) || 1;
    const nav = document.getElementById('nav-pane').getBoundingClientRect().width;
    const paper = document.getElementById('paper-scroll').getBoundingClientRect().width;
    const room = innerWidth - nav - paper;
    return Math.max(220, Math.min(840, Math.floor(innerWidth * 0.675 / zoom), Math.floor(room / zoom)));
  })()`);
  assert.ok(Math.abs(s.width - want) <= 1, `pane ${s.width} is the room's maximum ${want}`);
  const left = await js(`document.getElementById('paper-scroll').getBoundingClientRect().left`);
  const expected = await js(`(() => {
    const w = document.getElementById('side-pane').getBoundingClientRect().width;
    const paper = document.getElementById('paper-scroll').getBoundingClientRect().width;
    return innerWidth / 2 - (w - 248) / 2 - paper / 2;
  })()`);
  assert.ok(Math.abs(left - expected) <= 2, `page left ${left} is centred in the room (${expected})`);
  await js(`pinPane('nav', false)`);
  await tick(100);
});

test('Darlings holds the pane open and gets the same page cap', async () => {
  await pin(false);
  await js(`switchTab('darlings')`);
  await tick(500);
  const held = await paneState();
  assert.equal(held.open, true, 'Darlings holds the pane open');
  await resetWidth();
  await tick(80);
  const room = await js(`innerWidth - document.getElementById('paper-scroll').getBoundingClientRect().width`);
  const wide = await drag(-(room + 200));
  assert.ok(Math.abs(wide.width - room) <= 2, `pane ${wide.width} stops at the room ${room}`);
  const clear = await js(`(() => {
    const page = document.getElementById('paper-scroll').getBoundingClientRect();
    const pane = document.getElementById('side-pane').getBoundingClientRect();
    return page.right <= pane.left + 2;
  })()`);
  assert.equal(clear, true, 'the page ends where the pane begins');
  await js(`switchTab('manuscript')`);
  await tick(300);
});

test('the Outline board gives the cards the pane edge and does not snap back', async () => {
  await pin(true);
  await js(`switchTab('outline')`);
  await tick(500);
  assert.equal(await js(`document.getElementById('editor-view').classList.contains('board-on')`), true);
  await resetWidth();
  await tick(100);
  const wide = await drag(-200);
  await tick(150);
  const settled = await paneState();
  assert.ok(Math.abs(wide.width - 450) <= 2, `pane ${wide.width} took the drag`);
  assert.ok(Math.abs(settled.width - 450) <= 2, `pane ${settled.width} did not snap back`);
  const clear = await js(`(() => {
    const cards = document.getElementById('paper-scroll').getBoundingClientRect();
    const pane = document.getElementById('side-pane').getBoundingClientRect();
    return cards.right <= pane.left + 2;
  })()`);
  assert.equal(clear, true, 'the cards end where the pane begins');
  await js(`switchTab('manuscript')`);
  await tick(300);
});

test('one width serves Notes, Outline, and Darlings; a narrow window clamps and returns', async () => {
  await pin(true);
  await js(`switchTab('manuscript')`);
  await tick(300);
  await resetWidth();
  await tick(80);
  const chosen = await drag(-50);
  assert.ok(Math.abs(chosen.width - 300) <= 2, `chosen ${chosen.width}`);
  for (const tab of ['notes', 'outline', 'darlings']) {
    await js(`switchTab(${JSON.stringify(tab)})`);
    await tick(400);
    const s = await paneState();
    assert.ok(Math.abs(s.width - 300) <= 2, `${tab} kept ${s.width}`);
  }
  await js(`switchTab('manuscript')`);
  await tick(300);

  await pin(false);
  await js(`document.getElementById('side-pane').classList.add('open')`);
  await resetWidth();
  await tick(80);
  const wide = await drag(-250);
  assert.ok(Math.abs(wide.width - 500) <= 2, `unpinned width ${wide.width}`);
  await js(`document.getElementById('side-pane').classList.remove('open')`);
  win.setSize(700, 700);
  await tick(500);
  const clamped = await paneState();
  const limit = await js(`Math.max(220, Math.floor(innerWidth * 0.675))`);
  assert.ok(Math.abs(clamped.width - limit) <= 2, `narrow pane ${clamped.width} is ${limit}`);
  assert.equal(clamped.saved, '500', 'the choice is kept while clamped');
  win.setSize(1123, 800);
  await tick(500);
  const back = await paneState();
  assert.ok(Math.abs(back.width - 500) <= 2, `pane ${back.width} returned`);
});

test('resizing leaves the words, focus, selection, save state, and undo alone', async () => {
  await pin(true);
  await js(`switchTab('manuscript')`);
  await tick(300);
  const ch = await js(`book.chapterOrder[0]`);
  const before = await js(`(() => {
    const body = document.querySelector('.chapter[data-id="${ch}"] .chapter-body');
    body.innerHTML = '<p>Ines found the lantern in the ice house. A batch of letters waited. A draft line for the resize test.</p>';
    syncChapter(body, ${JSON.stringify(ch)});
    body.focus();
    const node = body.firstChild.firstChild;
    const at = node.data.indexOf('lantern');
    const range = document.createRange();
    range.setStart(node, at);
    range.setEnd(node, at + 7);
    const sel = getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
    return {
      html: chapterHTML[${JSON.stringify(ch)}],
      saved: savedHTML[${JSON.stringify(ch)}],
      selection: sel.toString(),
      chapter: currentChapterId,
      undo: undoStack.length,
      redo: redoStack.length,
      pending: chapterHTML[${JSON.stringify(ch)}] !== savedHTML[${JSON.stringify(ch)}]
    };
  })()`);
  assert.equal(before.pending, true, 'there are unsaved words');
  await drag(-40);
  const after = await js(`(() => ({
    html: chapterHTML[${JSON.stringify(ch)}],
    saved: savedHTML[${JSON.stringify(ch)}],
    selection: getSelection().toString(),
    chapter: currentChapterId,
    undo: undoStack.length,
    redo: redoStack.length,
    inEditor: !!(document.activeElement && document.activeElement.closest && document.activeElement.closest('.chapter-body'))
  }))()`);
  assert.equal(after.html, before.html);
  assert.equal(after.saved, before.saved);
  assert.equal(after.selection, before.selection);
  assert.equal(after.chapter, before.chapter);
  assert.equal(after.undo, before.undo);
  assert.equal(after.redo, before.redo);
  assert.equal(after.inEditor, true, 'a pointer resize leaves focus in the editor');

  await js(`document.querySelector('.neo-ext-side-grip').focus()`);
  await js(`document.querySelector('.neo-ext-side-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))`);
  await tick(100);
  const keyboard = await js(`(() => ({
    html: chapterHTML[${JSON.stringify(ch)}],
    selection: getSelection().toString(),
    undo: undoStack.length,
    redo: redoStack.length
  }))()`);
  assert.equal(keyboard.html, before.html);
  assert.equal(keyboard.selection, before.selection);
  assert.equal(keyboard.undo, before.undo);
  assert.equal(keyboard.redo, before.redo);
});

test('a saved, idle book is not written by a resize', async () => {
  await pin(true);
  await js(`switchTab('manuscript')`);
  await tick(300);
  await js(`flushAllSaves()`);
  await tick(1200);
  const file = path.join(bookDir, 'chapters', 'ch-1.html');
  const before = fs.statSync(file).mtimeMs;
  await drag(-30);
  await tick(1400);
  assert.equal(fs.statSync(file).mtimeMs, before, 'the chapter file did not change');
});

test('the pane does not move the page while it is unpinned', async () => {
  await pin(false);
  await js(`switchTab('manuscript')`);
  await tick(300);
  await js(`document.getElementById('side-pane').classList.add('open')`);
  const before = await js(`document.getElementById('paper-scroll').getBoundingClientRect().left`);
  await drag(-40);
  const after = await js(`document.getElementById('paper-scroll').getBoundingClientRect().left`);
  assert.ok(Math.abs(after - before) <= 0.5, `page moved ${after - before} with an unpinned pane`);
});

test('a clamped step is absorbed; a clamped drag replaces the choice', async () => {
  await pin(false);
  await js(`document.getElementById('side-pane').classList.add('open')`);
  await resetWidth();
  await tick(80);
  await js(`document.querySelector('.neo-ext-side-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }))`);
  await tick(80);
  const wideLimit = await js(`Math.max(220, Math.min(840, Math.floor(innerWidth * 0.675)))`);
  assert.equal((await paneState()).saved, String(wideLimit));
  win.setSize(900, 700);
  await tick(500);
  const narrow = await paneState();
  const limit = await js(`Math.max(220, Math.floor(innerWidth * 0.675))`);
  assert.ok(Math.abs(narrow.width - limit) <= 2, `narrow ${narrow.width} is ${limit}`);
  assert.equal(narrow.saved, String(wideLimit));
  await js(`document.querySelector('.neo-ext-side-grip').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true }))`);
  await tick(80);
  assert.equal((await paneState()).saved, String(wideLimit), 'a step the clamp absorbs keeps the choice');
  win.setSize(1123, 800);
  await tick(500);
  assert.ok(Math.abs((await paneState()).width - wideLimit) <= 1, 'the chosen width returns');
  win.setSize(900, 700);
  await tick(500);
  await drag(20);
  const committed = await paneState();
  assert.ok(Math.abs(committed.saved === null ? 0 : Number(committed.saved) - (limit - 20)) <= 2, `drag committed ${committed.saved} at width ${committed.width} (limit ${limit}, ${JSON.stringify(committed)})`);
  win.setSize(1123, 800);
  await tick(500);
  assert.ok(Math.abs((await paneState()).width - Number(committed.saved)) <= 2, 'the new choice stays after widening');
  await resetWidth();
});

test('hovering the edge shows the resize line', async () => {
  await pin(true);
  await tick(100);
  const box = await js(`(() => {
    const r = document.querySelector('.neo-ext-side-grip').getBoundingClientRect();
    return { x: Math.round(r.left + 4), y: Math.round(r.top + 120) };
  })()`);
  win.focus();
  wc.sendInputEvent({ type: 'mouseMove', x: box.x, y: box.y });
  await tick(200);
  const hover = await js(`(() => {
    const grip = document.querySelector('.neo-ext-side-grip');
    return { hover: grip.matches(':hover'), line: getComputedStyle(grip, '::after').backgroundColor };
  })()`);
  assert.equal(hover.hover, true, 'the pointer is on the handle');
  assert.notEqual(hover.line, 'rgba(0, 0, 0, 0)', 'the line became visible');
});

test('keyboard focus reaches a closed pane and opens it', async () => {
  await pin(false);
  await js(`document.getElementById('side-pane').classList.remove('open')`);
  await js(`document.activeElement && document.activeElement.blur && document.activeElement.blur()`);
  await js(`document.getElementById('nav-add').focus()`);
  let hit = null;
  for (let i = 0; i < 4 && !hit; i++) {
    wc.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' });
    wc.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
    await tick(120);
    hit = await js(`(() => {
      const grip = document.querySelector('.neo-ext-side-grip');
      const pane = document.getElementById('side-pane');
      return document.activeElement === grip
        ? { active: true, visible: grip.matches(':focus-visible'), transform: getComputedStyle(pane).transform }
        : null;
    })()`);
  }
  assert.ok(hit && hit.active, 'Tab reached the resize handle');
  assert.equal(hit.visible, true, 'the handle shows keyboard focus');
  assert.match(hit.transform, /matrix\(1, 0, 0, 1, 0, 0\)/, 'the closed pane opened for the keyboard');
  await js(`document.activeElement.blur()`);
  await pin(true);
});

test('a real double-click on the edge resets the width', async () => {
  await pin(true);
  await resetWidth();
  await tick(80);
  await drag(-40);
  assert.ok(Math.abs((await paneState()).width - 290) <= 2, 'the pane is wider than the reset');
  const at = await js(`(() => {
    const r = document.querySelector('.neo-ext-side-grip').getBoundingClientRect();
    return { x: Math.round(r.left + 5), y: Math.round(r.top + 90) };
  })()`);
  win.focus();
  for (const count of [1, 2]) {
    wc.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: count });
    wc.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: count });
    await tick(60);
  }
  await tick(150);
  assert.ok(Math.abs((await paneState()).width - 250) <= 1, 'a real double-click resets to 250');
});

test('Simple NEO hides the handle and stays at 250 px, keeping the choice', async () => {
  await pin(true);
  await resetWidth();
  await tick(80);
  const before = await paneState();
  const kept = before.saved;
  wc.send('menu', { type: 'moreFeatures', checked: false });
  await waitFor(`library && library.moreFeatures === false`);
  await tick(300);
  const simple = await paneState();
  assert.equal(simple.grip, false, 'no handle in Simple NEO');
  assert.ok(Math.abs(simple.width - 250) <= 1, `pane ${simple.width} is 250`);
  assert.equal(simple.saved, kept, 'the chosen width is kept');
  wc.send('menu', { type: 'moreFeatures', checked: true });
  await waitFor(`library && library.moreFeatures === true`);
  await tick(300);
  const back = await paneState();
  assert.equal(back.grip, true);
  assert.ok(Math.abs(back.width - Number(kept)) <= 2, `pane ${back.width} came back`);
});

/* ---------- runner ---------- */

async function main() {
  await app.whenReady();
  let failed = 0;
  try {
    while (!(win = BrowserWindow.getAllWindows()[0])) await tick(50);
    wc = win.webContents;
    win.setSize(1600, 900);
    while (!(await js(`typeof library !== 'undefined' && !!library`).catch(() => false))) await tick(50);
    await tick(300);
    await js(`(async () => {
      document.getElementById('firstrun').hidden = true;
      await openBook(${JSON.stringify(BOOK_ID)});
    })()`);
    while (!(await js(`typeof book !== 'undefined' && !!book`).catch(() => false))) await tick(50);
    await tick(500);
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
