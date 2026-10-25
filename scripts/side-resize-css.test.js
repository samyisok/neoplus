// NEO fork — the page offsets that follow the resizable right pane (adr-004)
//
// Upstream styles.css keeps its fixed 250 px geometry. The fork overrides the
// six rules that assume it from neo-ext.css; if upstream renames or drops one,
// this fails before the page can drift under the pane.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const core = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');
const fork = fs.readFileSync(path.join(root, 'neo-ext', 'neo-ext.css'), 'utf8');

const SELECTORS = [
  '#editor-view.side-pinned #paper-scroll',
  '#editor-view.nav-pinned.side-pinned #paper-scroll',
  '#editor-view.darlings-tab #paper-scroll',
  '#editor-view.darlings-tab.nav-pinned #paper-scroll',
  '#editor-view.board-on.side-pinned #paper-scroll',
  '#editor-view.board-on.nav-pinned.side-pinned #paper-scroll'
];

function block(css, selector) {
  const at = css.indexOf(selector);
  if (at < 0) return '';
  const open = css.indexOf('{', at);
  const close = css.indexOf('}', open);
  if (open < 0 || close < 0) return '';
  return css.slice(open + 1, close);
}

test('side-resize-css: every core page offset still assumes the 250 px pane', () => {
  for (const selector of SELECTORS) {
    assert.ok(core.includes(selector), `${selector} is still in styles.css`);
  }
  const board = block(core, '#editor-view.board-on.nav-pinned.side-pinned #paper-scroll');
  assert.match(board, /left:\s*calc\(248px/, 'the board keeps its left-pane offset');
  assert.match(core, /#editor-view\.side-pinned #paper-scroll \{ left: calc\(50% - 125px \* var\(--ui-zoom\)\); \}/,
    'the zoomed centre offset is still 125px');
  assert.match(core, /#editor-view\.nav-pinned\.side-pinned #paper-scroll \{ left: calc\(50% - 1px \* var\(--ui-zoom\)\); \}/,
    'the zoomed both-pinned offset is still 1px');
  assert.match(core, /#editor-view\.darlings-tab #paper-scroll \{ left: calc\(50% - 125px \* var\(--ui-zoom\)\); \}/,
    'the darlings offset is still 125px');
  assert.match(core, /#editor-view\.board-on\.side-pinned #paper-scroll \{ left: 0; right: calc\(250px \* var\(--ui-zoom\)\); \}/,
    'the zoomed board right offset is still 250px');
});

test('side-resize-css: the fork overrides every one with the variable', () => {
  for (const selector of SELECTORS) {
    assert.ok(fork.includes(selector), `${selector} has a fork override`);
  }
  assert.match(fork, /:root\s*\{[^}]*--neo-side-w:\s*250px/, 'the fork sets the 250 px default');
  assert.match(fork, /#side-pane\s*\{[^}]*width:\s*var\(--neo-side-w\)/, 'the pane width follows the variable');
});

test('side-resize-css: the core still reveals a pane by keyboard focus', () => {
  assert.match(core, /#nav-pane:has\(:focus-visible\), #side-pane:has\(:focus-visible\)/);
});

test('side-resize-css: the fork stylesheet is loaded after the core one', () => {
  const boot = fs.readFileSync(path.join(root, 'neo-ext', 'boot.js'), 'utf8');
  assert.match(boot, /document\.head\.appendChild\(link\)/);
  assert.match(boot, /neo-ext\/neo-ext\.css/);
});

test('side-resize-css: the offset rules use the interface size, and board keeps its left', () => {
  const side = block(fork, '#editor-view.side-pinned #paper-scroll');
  assert.match(side, /--neo-side-w/);
  assert.match(side, /--ui-zoom/);
  const board = block(fork, '#editor-view.board-on.nav-pinned.side-pinned #paper-scroll');
  assert.match(board, /right:\s*calc\(var\(--neo-side-w\)/);
  assert.doesNotMatch(board, /(^|[^-])left\s*:/, 'the board override must not replace the core left offset');
});

test('side-resize-css: the grip is fixed to the pane edge and above its lists', () => {
  const rule = block(fork, '.neo-ext-side-grip');
  assert.match(rule, /position:\s*sticky/);
  assert.match(rule, /cursor:\s*col-resize/);
  assert.match(rule, /z-index:/);
  assert.match(fork, /\.neo-ext-side-grip:focus-visible::after\s*\{[^}]*width:\s*2px/, 'keyboard focus thickens the line');
  assert.match(fork, /\.neo-ext-side-grip:focus-visible\s*\{[^}]*outline:\s*none/, 'no degenerate focus outline');
});
