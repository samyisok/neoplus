// NEO fork — History in the right-hand pane (adr-014)
//
// The pane's fourth view: what each tool replaced, newest first, read-only.
// The DOM is faked to the shape history.js uses; nothing here touches a book.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const read = (name) => fs.readFileSync(path.join(__dirname, '..', 'neo-ext', name), 'utf8');
const at = 1_700_000_000_000;

function makeNode(tag) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [],
    _text: '',
    className: '',
    id: '',
    hidden: false,
    dataset: {},
    attrs: {},
    listeners: 0
  };
  Object.defineProperty(node, 'textContent', {
    get() { return node._text + node.children.map((c) => c.textContent).join(''); },
    set(value) { node._text = value === undefined ? '' : String(value); node.children = []; }
  });
  node.append = (...kids) => { for (const kid of kids) if (kid) node.children.push(kid); };
  node.appendChild = (kid) => { node.children.push(kid); return kid; };
  node.setAttribute = (key, value) => { node.attrs[key] = String(value); };
  node.getAttribute = (key) => node.attrs[key];
  node.addEventListener = () => { node.listeners += 1; };
  const classes = () => String(node.className || '').split(/\s+/).filter(Boolean);
  node.classList = {
    add: (cls) => { if (!classes().includes(cls)) node.className = [...classes(), cls].join(' '); },
    remove: (cls) => { node.className = classes().filter((held) => held !== cls).join(' '); },
    contains: (cls) => classes().includes(cls),
    toggle: (cls, on) => {
      const has = classes().includes(cls);
      const want = on === undefined ? !has : !!on;
      if (want && !has) node.className = [...classes(), cls].join(' ');
      if (!want && has) node.className = classes().filter((held) => held !== cls).join(' ');
    }
  };
  return node;
}

function byClass(root, cls) {
  const out = [];
  const walk = (node) => {
    if (String(node.className || '').split(/\s+/).includes(cls)) out.push(node);
    for (const kid of node.children) walk(kid);
  };
  walk(root);
  return out;
}

function load(options) {
  const opts = options || {};
  const reads = [];
  const writes = [];
  const listeners = {};
  let book = 'book-the-lantern-year-1';
  let view = null;
  const store = {
    'book-the-lantern-year-1': [
      { id: 'e2', at: at + 1000, tool: 'rephrase', label: 'Heroic', from: 'tired', to: 'spent', chapterId: 'ch-1', chapterNumber: 3, chapterTitle: 'The Thaw', shortened: '' },
      { id: 'e1', at, tool: 'thesaurus', label: 'Thesaurus', from: 'batch', to: 'pile', chapterId: '', chapterNumber: 0, chapterTitle: '', shortened: '' }
    ],
    'book-the-silver-sea-2': []
  };
  const context = {
    console,
    Promise,
    document: { createElement: (tag) => makeNode(tag) },
    addEventListener: (type, fn) => { listeners[type] = fn; },
    NeoExtApi: {
      bookId: () => book,
      moreFeatures: () => (opts.more === undefined ? true : opts.more),
      chapterSnapshot: () => ({ chapterId: 'ch-1', chapterNumber: 3, chapterTitle: 'The Thaw' })
    },
    NeoForkNative: {
      historyRead: (id) => {
        reads.push(id);
        if (opts.read) return opts.read(id, store);
        return Promise.resolve({ ok: true, exists: true, store: { format: 1, entries: store[id] || [] } });
      },
      historyAdd: (id, entry) => { writes.push({ id, entry }); return Promise.resolve({ ok: true, store: { format: 1, entries: [] } }); }
    },
    NeoRecords: { registerView: (spec) => { view = spec; return true; } },
    NeoExt: {
      x: (text, vars) => (vars ? String(text).replace(/\{(\w+)\}/g, (all, key) => (key in vars ? String(vars[key]) : all)) : text)
    }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(read('lib/history-log.js'), context);
  vm.runInContext(read('history.js'), context);
  return {
    spec: () => view,
    reads,
    writes,
    setBook: (id) => { book = id; },
    setEntry: (id, entry) => { store[id] = entry; },
    entryOf: (id) => store[id],
    refresh: () => context.NeoHistoryView.refresh(),
    say: (text, kind) => context.NeoHistoryView.status(text, kind),
    bookOpened: () => { if (listeners['neo-ext:book-opened']) listeners['neo-ext:book-opened']({ detail: { id: book } }); }
  };
}

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('history-view: the view registers with the pane and starts hidden', () => {
  const h = load();
  const spec = h.spec();
  assert.ok(spec, 'registerView was called');
  assert.equal(spec.id, 'history');
  assert.equal(spec.label, 'History');
  assert.equal(spec.element.id, 'neo-history-view');
  assert.equal(spec.element.hidden, true);
  assert.equal(typeof spec.show, 'function');
  assert.equal(spec.hide, undefined, 'no hide hook is needed for a read-only view');
});

test('history-view: no book shows the open-a-book state, and reads nothing', async () => {
  const h = load();
  h.setBook('');
  h.spec().show();
  await tick();
  const view = h.spec().element;
  const empty = byClass(view, 'neo-hist-empty');
  assert.equal(empty.length, 1);
  assert.match(empty[0].textContent, /Open a book/);
  assert.equal(h.reads.length, 0);
  const note = byClass(view, 'neo-hist-note')[0].textContent;
  assert.match(note, /cannot be restored/);
});

test('history-view: a book with nothing recorded says so', async () => {
  const h = load();
  h.setBook('book-the-silver-sea-2');
  h.spec().show();
  await tick();
  const empty = byClass(h.spec().element, 'neo-hist-empty');
  assert.equal(empty.length, 1);
  assert.match(empty[0].textContent, /No replacements/);
});

test('history-view: rows run newest first, with date, chapter, and both texts', async () => {
  const h = load();
  h.spec().show();
  await tick();
  const view = h.spec().element;
  const rows = byClass(view, 'neo-hist-row');
  assert.equal(rows.length, 2);
  const first = rows[0];
  const from = byClass(first, 'neo-hist-from')[0];
  const to = byClass(first, 'neo-hist-to')[0];
  assert.equal(from.textContent, 'tired');
  assert.equal(to.textContent, 'spent');
  assert.ok(from.children.length === 0 && to.children.length === 0, 'the texts are plain text');
  const where = byClass(first, 'neo-hist-where')[0].textContent;
  assert.match(where, /Rephrase/);
  assert.match(where, /Heroic/);
  assert.match(where, /Chapter 3/);
  assert.match(where, /The Thaw/);
  assert.match(where, new RegExp(new Date(at + 1000).toLocaleString().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const secondWhere = byClass(rows[1], 'neo-hist-where')[0].textContent;
  assert.equal(/Chapter/.test(secondWhere), false, 'a notes-page entry has no chapter');
  assert.match(secondWhere, /Thesaurus/);
});

test('history-view: manuscript text is never markup', async () => {
  const h = load();
  h.setEntry('book-the-lantern-year-1', [{
    id: 'e1', at, tool: 'thesaurus', label: '', from: '<b>batch</b>', to: '<img src=x>',
    chapterId: 'ch-1', chapterNumber: 1, chapterTitle: '', shortened: ''
  }]);
  h.spec().show();
  await tick();
  const row = byClass(h.spec().element, 'neo-hist-row')[0];
  assert.equal(byClass(row, 'neo-hist-from')[0].children.length, 0);
  assert.equal(byClass(row, 'neo-hist-from')[0].textContent, '<b>batch</b>');
  assert.equal(byClass(row, 'neo-hist-to')[0].children.length, 0);
});

test('history-view: a shortened side says so', async () => {
  const h = load();
  h.setEntry('book-the-lantern-year-1', [{
    id: 'e1', at, tool: 'rephrase', label: 'Terse', from: 'x'.repeat(20), to: 'y'.repeat(20),
    chapterId: 'ch-1', chapterNumber: 2, chapterTitle: '', shortened: 'both'
  }]);
  h.spec().show();
  await tick();
  const note = byClass(h.spec().element, 'neo-hist-shortened');
  assert.equal(note.length, 1);
  assert.match(note[0].textContent, /shortened/);
});

test('history-view: another book never shows the previous rows while it loads', async () => {
  let release = null;
  const h = load({
    read: (id) => (id === 'book-the-lantern-year-1'
      ? Promise.resolve({ ok: true, exists: true, store: { format: 1, entries: h.entryOf(id) } })
      : new Promise((resolve) => { release = () => resolve({ ok: true, exists: false, store: { format: 1, entries: [] } }); }))
  });
  h.spec().show();
  await tick();
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 2);
  h.setBook('book-the-silver-sea-2');
  h.spec().show();
  await tick();
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 0, 'the old rows are gone while loading');
  const loading = byClass(h.spec().element, 'neo-hist-empty');
  assert.match(loading[0].textContent, /Reading/);
  release();
  await tick();
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 0);
  assert.match(byClass(h.spec().element, 'neo-hist-empty')[0].textContent, /No replacements/);
});

test('history-view: a book opened while the tab is showing reloads for that book', async () => {
  const h = load();
  h.spec().element.hidden = false;
  h.spec().show();
  await tick();
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 2);
  h.setBook('book-the-silver-sea-2');
  h.bookOpened();
  await tick();
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 0);
  assert.match(byClass(h.spec().element, 'neo-hist-empty')[0].textContent, /No replacements/);
  assert.equal(h.reads[h.reads.length - 1], 'book-the-silver-sea-2');
});

test('history-view: a record made while the pane is hidden is read when it returns', async () => {
  const h = load();
  h.spec().show();
  await tick();
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 2);
  assert.equal(h.reads.length, 1);
  h.spec().element.hidden = true;
  h.setEntry('book-the-lantern-year-1', [
    { id: 'e3', at: at + 2000, tool: 'thesaurus', label: 'Thesaurus', from: 'good', to: 'fine', chapterId: 'ch-1', chapterNumber: 3, chapterTitle: 'The Thaw', shortened: '' },
    ...h.entryOf('book-the-lantern-year-1')
  ]);
  h.refresh();
  assert.equal(h.reads.length, 1, 'no read happens while the pane is hidden');
  h.spec().element.hidden = false;
  h.spec().show();
  await tick();
  assert.equal(h.reads.length, 2, 'the return reads again');
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 3, 'the hidden view re-read on return');
});

test('history-view: a recording failure notice belongs to its book and clears', async () => {
  const h = load();
  h.spec().element.hidden = false;
  h.spec().show();
  await tick();
  h.say('The newest replacement could not be recorded.');
  const status = byClass(h.spec().element, 'neo-hist-status');
  assert.match(status[0].textContent, /could not be recorded/);
  h.setBook('book-the-silver-sea-2');
  h.bookOpened();
  await tick();
  const after = byClass(h.spec().element, 'neo-hist-status');
  assert.equal(after[0].textContent, '', 'the next book has no notice');
  assert.equal(after[0].hidden, true);
});

test('history-view: a recording while the tab is open adds the newest row', async () => {
  const h = load();
  h.spec().element.hidden = false;
  h.spec().show();
  await tick();
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 2);
  h.setEntry('book-the-lantern-year-1', [
    { id: 'e3', at: at + 2000, tool: 'thesaurus', label: 'Thesaurus', from: 'good', to: 'fine', chapterId: 'ch-1', chapterNumber: 3, chapterTitle: 'The Thaw', shortened: '' },
    ...h.entryOf('book-the-lantern-year-1')
  ]);
  h.refresh();
  await tick();
  const rows = byClass(h.spec().element, 'neo-hist-row');
  assert.equal(rows.length, 3);
  assert.equal(byClass(rows[0], 'neo-hist-from')[0].textContent, 'good');
});

test('history-view: a failed read is reported and the rows stay empty', async () => {
  for (const [reason, pattern] of [['large', /too large/], ['cloud', /iCloud/], ['unreadable', /could not be read/]]) {
    const h = load({ read: () => Promise.resolve({ ok: false, reason }) });
    h.spec().show();
    await tick();
    const status = byClass(h.spec().element, 'neo-hist-status');
    assert.equal(status.length, 1, reason);
    assert.match(status[0].textContent, pattern, reason);
    assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 0);
    assert.equal(byClass(h.spec().element, 'neo-hist-empty').length, 0, 'a failed read does not claim to be reading or empty');
  }
});

test('history-view: a recovered read says the history could not be read', async () => {
  const h = load({ read: () => Promise.resolve({ ok: true, exists: true, recovered: true, store: { format: 1, entries: [] } }) });
  h.spec().show();
  await tick();
  const status = byClass(h.spec().element, 'neo-hist-status');
  assert.equal(status.length, 1);
  assert.match(status[0].textContent, /could not be read/);
  assert.match(status[0].textContent, /not being recorded/);
  assert.equal(status[0].classList.contains('is-error'), true);
});

test('history-view: a store the reader would refuse is not shown as empty', async () => {
  const h = load({ read: () => Promise.resolve({ ok: true, exists: true, store: { format: 2, entries: [] } }) });
  h.spec().show();
  await tick();
  const status = byClass(h.spec().element, 'neo-hist-status');
  assert.match(status[0].textContent, /could not be read/);
  assert.equal(byClass(h.spec().element, 'neo-hist-empty').length, 0);
  assert.equal(byClass(h.spec().element, 'neo-hist-row').length, 0);
});

test('history-view: viewing never writes the history or the book', async () => {
  const h = load();
  h.spec().show();
  await tick();
  h.spec().show();
  await tick();
  assert.equal(h.writes.length, 0, 'no recording comes from the view');
  for (const node of byClass(h.spec().element, 'neo-hist-row')) assert.equal(node.listeners, 0);
});
