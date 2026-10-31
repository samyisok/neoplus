// NEO fork — what counts as a rephrase selection (adr-012)
//
// Pure: exact text, one block, 1,200 characters, context caps.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const ctx = require('../neo-ext/lib/rephrase-context.js');

test('rephrase-context: a word and a paragraph are allowed, 1,201 characters are not', () => {
  assert.equal(ctx.evaluate({ text: 'word', sameBlock: true, inChapter: true, moreFeatures: true }).ok, true);
  assert.equal(ctx.evaluate({ text: 'x'.repeat(1200), sameBlock: true, inChapter: true, moreFeatures: true }).ok, true);
  const long = ctx.evaluate({ text: 'x'.repeat(1201), sameBlock: true, inChapter: true, moreFeatures: true });
  assert.equal(long.ok, false);
  assert.equal(long.reason, 'long');
});

test('rephrase-context: empty, two blocks, outside a chapter, Simple NEO are refused', () => {
  const base = { text: 'two words', sameBlock: true, inChapter: true, moreFeatures: true };
  assert.equal(ctx.evaluate({ ...base, text: '   ' }).reason, 'empty');
  assert.equal(ctx.evaluate({ ...base, sameBlock: false }).reason, 'block');
  assert.equal(ctx.evaluate({ ...base, inChapter: false }).reason, 'editor');
  assert.equal(ctx.evaluate({ ...base, moreFeatures: false }).reason, 'gate');
});

test('rephrase-context: the exact selection is kept, double spaces and all', () => {
  const out = ctx.evaluate({ text: '  one  two  ', sameBlock: true, inChapter: true, moreFeatures: true });
  assert.equal(out.ok, true);
  assert.equal(out.text, '  one  two  ');
});

test('rephrase-context: before and after are capped and taken from neighbouring blocks', () => {
  const before = ctx.takeBefore(['a'.repeat(800), 'b'.repeat(800)], 1);
  assert.equal(before.length, 700);
  assert.equal(before, 'a'.repeat(700), 'the end nearest the selection');
  const after = ctx.takeAfter(['c'.repeat(800), 'd'.repeat(800)], 0);
  assert.equal(after, 'd'.repeat(700), 'the start of the following block');
  assert.equal(ctx.takeBefore(['x'], 0), '');
  assert.equal(ctx.takeAfter(['x'], 0), '');
});
