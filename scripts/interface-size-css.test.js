// NEO fork — what the Interface Size may and may not scale (adr-015)
//
// The toast is the one fork surface outside a zoomed ancestor. The page keeps
// its own zoom and type size, so the interface size must never reach it.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'neo-ext.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '');

function blocks(selector) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(css))) {
    if (m[1].split(',').some((part) => part.trim() === selector)) out.push(m[2]);
  }
  return out;
}

test('interface-size css: the toast follows the interface size and wraps inside the window', () => {
  const [toast] = blocks('.neo-ext-toast');
  assert.ok(toast, 'the toast rule is present');
  assert.match(toast, /zoom:\s*var\(--ui-zoom/);
  assert.match(toast, /max-width:[^;]*100vw\s*\/\s*var\(--ui-zoom/);
});

test('interface-size css: the page is never zoomed with the interface', () => {
  for (const block of blocks('#paper-scroll')) {
    assert.doesNotMatch(block, /zoom:\s*var\(--ui-zoom/, '#paper-scroll keeps its own size');
  }
  assert.doesNotMatch(css, /--page-zoom:\s*var\(--ui-zoom/);
  assert.doesNotMatch(css, /--editor-size:\s*var\(--ui-zoom/);
});

test('ui-text css: every fork font size follows the text size', () => {
  const plain = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'neo-ext.css'), 'utf8');
  assert.equal(/font-size:\s*[0-9.]+px/.test(plain), false, 'no fork font size opts out of --ui-text');
  assert.ok((plain.match(/var\(--ui-text, 1\)/g) || []).length >= 60, 'the fork text sizes carry the multiplier');

  const core = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
  assert.equal(/--ui-text/.test(core), false, 'core CSS is never edited for this setting');
});

test('ui-text css: text that inherits is given a scaled base', () => {
  const plain = fs.readFileSync(path.join(__dirname, '..', 'neo-ext', 'neo-ext.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const needs = [
    ['.neo-ext-settings', 'settings text'],
    ['.neo-ext-settings .neo-ext-path', 'settings fields'],
    ['.neo-ext-thes', 'thesaurus text'],
    ['.neo-ext-thes .neo-ext-thes-filter', 'thesaurus filter'],
    ['.neo-ext-dict', 'dictionary text']
  ];
  for (const [selector, why] of needs) {
    const found = blocks(selector).some((block) => /font-size: calc\([^)]*var\(--ui-text/.test(block));
    assert.ok(found, why);
  }
  const close = blocks('.neo-ext-thes-close').some((block) => /width: calc\([^)]*var\(--ui-text/.test(block));
  assert.ok(close, 'the close box grows with its glyph');
});
