// NEO fork — the grammar board (adr-017)
//
// The DOM is faked to the shape grammar.js uses; the model is pure and the board
// is built from text nodes, never markup.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const issues = require('../neo-ext/lib/grammar-issues.js');

function makeNode(tag) {
  const node = {
    tagName: String(tag || 'div').toUpperCase(),
    children: [],
    _text: '',
    className: '',
    id: '',
    hidden: false,
    disabled: false,
    title: '',
    dataset: {},
    attrs: {},
    listeners: 0
  };
  Object.defineProperty(node, 'textContent', {
    get() { return node._text + node.children.map((child) => child.textContent).join(''); },
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

function byTag(root, tag) {
  const out = [];
  const walk = (node) => {
    if (node.tagName === tag) out.push(node);
    for (const kid of node.children) walk(kid);
  };
  walk(root);
  return out;
}

function load() {
  const context = {
    console,
    Promise,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    document: {
      createElement: (tag) => makeNode(tag),
      querySelector: () => null,
      addEventListener: () => {}
    },
    NeoGrammarIssues: issues,
    NeoRephraseContext: require('../neo-ext/lib/rephrase-context.js'),
    NeoRephraseCheck: require('../neo-ext/lib/rephrase-check.js'),
    NeoExtApi: {
      moreFeatures: () => true,
      paragraphNodes: () => [],
      bookId: () => ''
    },
    NeoExt: { x: (text) => text, toast: () => {} },
    NeoForkNative: {},
    NeoHistory: { record: () => {} }
  };
  context.window = context;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'grammar-board.js'), 'utf8'),
    context
  );
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'grammar.js'), 'utf8'),
    context
  );
  return context;
}

const twoFixes = (text) => issues.parse(
  '{"quote":"stand","fix":"stood","message":"past tense"}\n'
  + '{"quote":"midle","fix":"middle","message":"spelling"}',
  text
);

test('grammar-view: the model assembles the corrected text and green ranges', () => {
  const g = load();
  const text = 'He stand in the midle.';
  const model = g.NeoGrammarBoard.buildModel({ text }, twoFixes(text));
  assert.equal(model.corrected, 'He stood in the middle.');
  assert.deepEqual(model.spans, [{ start: 3, end: 8 }, { start: 16, end: 22 }]);
  assert.equal(model.canReplace, true);
  assert.equal(model.clean, false);
});

test('grammar-view: the corrected block comes first with green spans only', () => {
  const g = load();
  const text = 'He stand in the midle.';
  const model = g.NeoGrammarBoard.buildModel({ text }, twoFixes(text));
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  const corrected = byClass(view.element, 'neo-grammar-corrected')[0];
  const original = byClass(view.element, 'neo-grammar-original')[0];
  assert.ok(corrected);
  assert.ok(original);
  const top = byClass(view.element, 'neo-grammar-top')[0];
  const body = byClass(view.element, 'neo-grammar-body')[0];
  assert.ok(view.element.children.indexOf(top) < view.element.children.indexOf(body));
  assert.ok(byClass(top, 'neo-grammar-corrected').length === 1);
  assert.ok(byClass(body, 'neo-grammar-original').length === 1);
  assert.equal(byClass(corrected, 'neo-grammar-text')[0].textContent, 'He stood in the middle.');
  assert.equal(byClass(corrected, 'neo-grammar-green').length, 2);
});

test('grammar-view: grammar is red, style is yellow, cards are in text order', () => {
  const g = load();
  const text = 'He stand in the midle of the pile.';
  const parsed = twoFixes(text);
  const style = [
    { quote: 'midle', example: 'middle', message: 'overlap' },
    { quote: 'pile', example: 'heap', message: 'word' }
  ];
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed, style);
  assert.deepEqual(model.cards.map((card) => card.quote), ['stand', 'midle', 'pile']);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  assert.equal(byClass(view.original, 'neo-grammar-red').length, 2);
  assert.equal(byClass(view.original, 'neo-grammar-yellow').length, 1);
  const nums = byClass(view.element, 'neo-grammar-num').map((node) => node.textContent);
  assert.deepEqual(nums, ['1', '2', '3']);
});

test('grammar-view: an unapplied issue has no marker and says so', () => {
  const g = load();
  const text = 'He stand here.';
  const parsed = issues.parse('{"quote":"zzz","fix":"x","message":"nowhere"}', text);
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  assert.equal(model.spans.length, 0);
  assert.equal(model.nothingApplied, true);
  assert.equal(model.canReplace, false);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  assert.equal(byClass(view.original, 'neo-grammar-red').length, 0);
  assert.match(byClass(view.element, 'neo-grammar-status')[0].textContent, /Nothing was applied/);
  assert.match(byClass(view.element, 'neo-grammar-not-applied')[0].textContent, /not applied/i);
});

test('grammar-view: a clean text and a blank result disable Replace', () => {
  const g = load();
  const clean = g.NeoGrammarBoard.buildModel({ text: 'He stood here.' }, issues.parse('CLEAN', 'He stood here.'));
  assert.equal(clean.clean, true);
  const cleanView = g.NeoGrammarBoard.renderBoard(g.document, clean);
  assert.equal(cleanView.replace.disabled, true);
  assert.match(byClass(cleanView.element, 'neo-grammar-status')[0].textContent, /clean/i);

  const text = 'very';
  const blank = g.NeoGrammarBoard.buildModel(
    { text },
    issues.parse('{"quote":"very","fix":"","message":"cut"}', text)
  );
  assert.equal(blank.blank, true);
  assert.equal(blank.canReplace, false);
  const blankView = g.NeoGrammarBoard.renderBoard(g.document, blank);
  assert.equal(blankView.replace.disabled, true);
  assert.match(byClass(blankView.element, 'neo-grammar-status')[0].textContent, /emptied/i);
});

test('grammar-view: a style quote that exists only in the corrected text is absent', () => {
  const g = load();
  const text = 'He stand here.';
  const parsed = issues.parse('{"quote":"stand","fix":"stood","message":"past"}', text);
  const model = g.NeoGrammarBoard.buildModel(
    { text },
    parsed,
    [{ quote: 'stood', example: 'remained', message: 'corrected only' }]
  );
  assert.equal(model.cards.filter((card) => card.kind === 'style').length, 0);
  assert.equal(model.cards.length, 1);
});

test('grammar-view: a failed style pass leaves the grammar board standing', () => {
  const g = load();
  const text = 'He stand here.';
  const parsed = issues.parse('{"quote":"stand","fix":"stood","message":"past"}', text);
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed, null, 'The style pass could not be read.');
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  assert.equal(model.cards.length, 1);
  assert.match(byClass(view.element, 'neo-grammar-notice')[0].textContent, /could not be read/);
  assert.equal(byClass(view.element, 'neo-grammar-red').length, 1);
});

test('grammar-view: model text stays text, never markup', () => {
  const g = load();
  const text = 'He <b>stand</b> here.';
  const parsed = issues.parse('{"quote":"<b>stand</b>","fix":"X","message":"<i>past</i>"}', text);
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  const card = byClass(view.element, 'neo-grammar-card')[0];
  assert.match(card.textContent, /<b>stand<\/b>/);
  assert.match(card.textContent, /<i>past<\/i>/);
  assert.equal(byTag(card, 'B').length, 0);
  assert.equal(byTag(card, 'I').length, 0);
});

test('grammar-view: a correction that leaves only whitespace is blank', () => {
  const g = load();
  const text = 'He stand here.';
  const parsed = {
    status: 'issues',
    issues: [
      { quote: 'He stand here.', fix: ' ', message: 'cut', order: 0, start: 0, end: 14, reason: '', applied: true }
    ],
    malformed: false,
    retry: false,
    clean: false
  };
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  assert.equal(model.corrected.trim(), '');
  assert.equal(model.blank, true);
  assert.equal(model.canReplace, false);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  assert.equal(view.replace.disabled, true);
  assert.match(byClass(view.element, 'neo-grammar-status')[0].textContent, /emptied/i);
});

test('grammar-view: an issue with no fix says there is no replacement, not a deletion', () => {
  const g = load();
  const text = 'He stand here.';
  const parsed = {
    status: 'issues',
    issues: [{ quote: 'stand', fix: null, message: 'no fix', order: 0, start: null, end: null, reason: 'unusable', applied: false }],
    malformed: true,
    retry: true,
    clean: false
  };
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  assert.equal(byClass(view.element, 'neo-grammar-change')[0].textContent, '(no replacement)');
  assert.notEqual(byClass(view.element, 'neo-grammar-change')[0].textContent, '(delete)');
  assert.equal(view.replace.disabled, true);
});

test('grammar-view: an insertion card says (insert) and greens only the insertion', () => {
  const g = load();
  const text = 'he was slim young man';
  const parsed = issues.parse(
    JSON.stringify({ quote: text, fix: 'he was a slim young man', message: 'article' }),
    text
  );
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  assert.equal(byClass(view.element, 'neo-grammar-quote')[0].textContent, '(insert)');
  assert.equal(byClass(view.element, 'neo-grammar-change')[0].textContent, 'a ');
  assert.equal(byClass(view.corrected, 'neo-grammar-green')[0].textContent, 'a ');
});

test('grammar-view: a correction over 2,000 characters cannot be applied', () => {
  const g = load();
  const text = 'x'.repeat(1200);
  const parsed = {
    status: 'issues',
    issues: [{ quote: 'x', fix: 'y'.repeat(1200), message: 'long', order: 0, start: 0, end: 1, reason: '', applied: true }],
    malformed: false,
    retry: false,
    clean: false
  };
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  assert.equal(model.tooLong, true);
  assert.equal(model.canReplace, false);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  assert.equal(view.replace.disabled, true);
  assert.match(byClass(view.element, 'neo-grammar-status')[0].textContent, /too long/i);
});

test('grammar-view: a rect is converted by the interface zoom', () => {
  const g = load();
  const local = g.NeoGrammarBoard.rectToLocal(
    { left: 110, top: 70, right: 130, bottom: 90 },
    { left: 10, top: 10 },
    2
  );
  assert.equal(local.left, 50);
  assert.equal(local.top, 30);
  assert.equal(local.right, 60);
  assert.equal(local.bottom, 40);
});

test('grammar-view: a connector leaves the middle of the word and meets the middle of the card top', () => {
  const g = load();
  const from = { left: 10, top: 40, right: 60, bottom: 56, width: 50, height: 16 };
  const to = { left: 300, top: 400, right: 620, bottom: 460, width: 320, height: 60 };
  const ends = g.NeoGrammarBoard.lineEnds(from, to);
  assert.equal(ends.x1, 35, 'the line starts at the middle of the word');
  assert.equal(ends.y1, 56, 'and at its bottom, so it leaves under the underline');
  assert.equal(ends.y2, 400, 'the line meets the top edge, not the left');
  assert.equal(ends.x2, 460, 'at the middle of the card');
});

test('grammar-view: a missing-article card carries a caret at the gap so it can be joined', () => {
  const g = load();
  const text = 'he was slim young man';
  const parsed = issues.parse(
    JSON.stringify({ quote: text, fix: 'he was a slim young man', message: 'missing article' }),
    text
  );
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  const carets = byClass(view.original, 'neo-grammar-caret');
  assert.equal(carets.length, 1, 'an insertion still gets a place in the text');
  assert.equal(carets[0].textContent, '');
  assert.equal(carets[0].getAttribute('data-card'), '1');
});

test('grammar-view: a style insertion still gets a caret so its card can be joined', () => {
  const g = load();
  const text = 'I live in the house by the river.';
  const parsed = issues.parse('CLEAN', text);
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed, [
    { quote: 'the house', example: 'the old house', message: 'word' }
  ]);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);
  const carets = byClass(view.original, 'neo-grammar-caret');
  assert.equal(carets.length, 1);
  assert.ok(String(carets[0].className).split(/\s+/).includes('neo-grammar-yellow'));
});

test('grammar-view: drawLines joins an insertion caret with exactly one line', () => {
  const g = load();
  const text = 'he was slim young man';
  const parsed = issues.parse(JSON.stringify({ quote: text, fix: 'he was a slim young man', message: 'm' }), text);
  const model = g.NeoGrammarBoard.buildModel({ text }, parsed);
  const view = g.NeoGrammarBoard.renderBoard(g.document, model);

  view.body.getBoundingClientRect = () => ({ left: 0, top: 0, right: 400, bottom: 600, width: 400, height: 600 });
  view.body.scrollWidth = 400; view.body.scrollHeight = 600; view.body.scrollLeft = 0; view.body.scrollTop = 0;
  view.body.offsetWidth = 400;
  const caret = byClass(view.original, 'neo-grammar-caret')[0];
  caret.getBoundingClientRect = () => ({ left: 14, top: 20, right: 16, bottom: 36, width: 2, height: 16 });
  const card = byClass(view.cards, 'neo-grammar-card')[0];
  card.getBoundingClientRect = () => ({ left: 300, top: 400, right: 600, bottom: 460, width: 300, height: 60 });
  view.original.querySelectorAll = () => [caret];
  view.cards.querySelector = () => card;
  view.svg.style = {};
  g.document.createRange = () => ({ selectNodeContents() {}, getClientRects: () => [] });
  g.document.createElementNS = (ns, tag) => {
    const el = { tagName: tag, dataset: {}, attrs: {}, appendChild() {} };
    el.setAttribute = (key, value) => { el.attrs[key] = String(value); };
    return el;
  };

  g.NeoGrammarBoard.drawLines(view);
  const lines = view.svg.children.filter((child) => child.tagName === 'path');
  assert.equal(lines.length, 1, 'the caret yields one connector line');
  assert.match(lines[0].attrs.d, /^M /);
});
