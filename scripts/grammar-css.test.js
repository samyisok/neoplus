// NEO fork — the grammar board's layout and loading line (adr-017)
//
// Three things the writer reported: the loading line carried a white focus
// rectangle, the cards sat beside the text so the connector lines crossed it, and
// the lines met the card's left edge.

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

test('grammar css: the loading line is focused for screen readers but draws no ring', () => {
  const rules = [...blocks('.neo-grammar-loading'), ...blocks('.neo-grammar-loading:focus'),
    ...blocks('.neo-grammar-loading:focus-visible')].join('\n');
  assert.match(rules, /outline:\s*none/);
});

test('grammar css: the cards sit below the text, a few to a row', () => {
  const body = blocks('.neo-grammar-body').join('\n');
  assert.match(body, /flex-direction:\s*column/);
  const cards = blocks('.neo-grammar-cards').join('\n');
  assert.match(cards, /grid-template-columns:\s*repeat\(auto-fill/);
  assert.match(cards, /margin-top:\s*(2[0-9]|[3-9][0-9])px/, 'the cards stand clear of the text so the lines have room');
});

test('grammar css: a card meets its line with a top border, not a left one', () => {
  const card = blocks('.neo-grammar-card').join('\n');
  assert.match(card, /border-top:\s*2px solid/);
  assert.doesNotMatch(card, /border-left:\s*2px solid/);
});

test('grammar css: the style wheel turns beside the button', () => {
  const spinner = blocks('.neo-grammar-spinner').join('\n');
  assert.match(spinner, /animation:\s*neo-grammar-spin/);
  assert.match(spinner, /width:\s*14px/);
  const row = blocks('.neo-grammar-style-row').join('\n');
  assert.match(row, /display:\s*flex/);
});

test('grammar css: settings blocks are airy and their buttons match the field height', () => {
  const fs2 = require('node:fs');
  const path2 = require('node:path');
  const sheet = fs2.readFileSync(path2.join(__dirname, '..', 'neo-ext', 'neo-ext.css'), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const pick = (selector) => {
    const out = [];
    const re = /([^{}]+)\{([^}]*)\}/g;
    let m;
    while ((m = re.exec(sheet))) {
      if (m[1].split(',').some((part) => part.trim() === selector)) out.push(m[2]);
    }
    return out.join('\n');
  };
  const row = pick('.neo-ext-row');
  assert.match(row, /padding:\s*10px 12px/, 'each setting is a padded block');
  assert.match(row, /background:/, 'and reads as one panel');
  assert.match(pick('.neo-ext-row > label'), /margin:\s*0/, 'the label hugs its own field');
  assert.match(pick('.neo-ext-pathline .neo-ext-choose'), /align-self:\s*stretch/, 'Replace… matches the key field height');
});
