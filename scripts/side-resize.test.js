// NEO fork — the right-hand pane's width rules (adr-004)
//
// Pure: no DOM, no storage of its own. The module that owns the handle reads
// these answers, so the same clamp applies to a drag, a key, and a restart.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const rules = require('../neo-ext/lib/side-resize.js');

test('side-resize: the constants are the ones the spec names', () => {
  assert.equal(rules.DEFAULT, 250);
  assert.equal(rules.MIN, 220);
  assert.equal(rules.MAX, 840);
  assert.equal(rules.STEP, 16);
  assert.equal(rules.BIG_STEP, 64);
  assert.equal(rules.KEY, 'neo-ext-side-width');
});

test('side-resize: 840 px, 67.5% of the window, or the room the page leaves', () => {
  assert.deepEqual(rules.bounds(1600, 1, Infinity), { min: 220, max: 840 });
  assert.deepEqual(rules.bounds(1280, 1, Infinity), { min: 220, max: 840 });
  assert.deepEqual(rules.bounds(1000, 1, Infinity), { min: 220, max: 675 });
  assert.deepEqual(rules.bounds(800, 1, Infinity), { min: 220, max: 540 });
  assert.deepEqual(rules.bounds(400, 1, Infinity), { min: 220, max: 270 });
  assert.deepEqual(rules.bounds(1280, 1, 272), { min: 220, max: 272 });
  assert.deepEqual(rules.bounds(1280, 1, 100), { min: 220, max: 220 });
});

test('side-resize: the room the page leaves is viewport minus a pinned nav and the page', () => {
  assert.equal(rules.roomWidth(1123, 0, 760), 363);
  assert.equal(rules.roomWidth(1123, 248, 760), 115);
  assert.equal(rules.roomWidth(1280, 248, 760), 272);
  assert.equal(rules.roomWidth(700, 248, 760), 0);
  assert.equal(rules.roomWidth(undefined, undefined, undefined), 0);
});

test('side-resize: the 67.5% limit accounts for the interface size', () => {
  assert.deepEqual(rules.bounds(1280, 1.25, Infinity), { min: 220, max: 691 });
  assert.deepEqual(rules.bounds(1280, 3, Infinity), { min: 220, max: 288 });
  assert.deepEqual(rules.bounds(1280, 1.25, 575), { min: 220, max: 460 });
});

test('side-resize: missing or nonsense numbers still give a usable bound', () => {
  assert.deepEqual(rules.bounds(undefined, undefined, undefined), { min: 220, max: 220 });
  assert.deepEqual(rules.bounds('', '', ''), { min: 220, max: 220 });
  assert.deepEqual(rules.bounds(1280, 0, Infinity), { min: 220, max: 840 });
});

test('side-resize: clamp keeps a whole width inside the bounds', () => {
  assert.equal(rules.clamp(250, 1600, 1, Infinity), 250);
  assert.equal(rules.clamp(100, 1600, 1, Infinity), 220);
  assert.equal(rules.clamp(900, 1600, 1, Infinity), 840);
  assert.equal(rules.clamp(400.6, 1600, 1, Infinity), 401);
  assert.equal(rules.clamp(400, 1280, 1, 272), 272);
  assert.equal(rules.clamp('nonsense', 1600, 1, Infinity), 250);
  assert.equal(rules.clamp(NaN, 1600, 1, Infinity), 250);
});

test('side-resize: a drag to the left widens, and its delta follows the interface size', () => {
  assert.equal(rules.fromDrag(250, -120, 1600, 1, Infinity), 370);
  assert.equal(rules.fromDrag(250, 40, 1600, 1, Infinity), 220);
  assert.equal(rules.fromDrag(400, -120, 1600, 1.25, Infinity), 496);
  assert.equal(rules.fromDrag(250, 0, 1600, 1, Infinity), 250);
});

test('side-resize: the keys move by 16 or 64, and Home and End go to the limits', () => {
  assert.equal(rules.fromKey(250, 'ArrowLeft', 1600, 1, Infinity), 266);
  assert.equal(rules.fromKey(250, 'ArrowRight', 1600, 1, Infinity), 234);
  assert.equal(rules.fromKey(250, 'ArrowLeft', 1600, 1, Infinity, true), 314);
  assert.equal(rules.fromKey(250, 'ArrowRight', 1600, 1, Infinity, true), 220);
  assert.equal(rules.fromKey(400, 'Home', 1600, 1, Infinity), 220);
  assert.equal(rules.fromKey(400, 'End', 1600, 1, Infinity), 840);
  assert.equal(rules.fromKey(400, 'End', 1280, 1, 272), 272);
  assert.equal(rules.fromKey(250, 'Enter', 1600, 1, Infinity), null);
  assert.equal(rules.fromKey(540, 'ArrowLeft', 800, 1, Infinity), 540);
  assert.equal(rules.fromKey(250, 'ArrowLeft', 1600, 1.25, Infinity), 263);
  assert.equal(rules.fromKey(250, 'ArrowLeft', 1600, 1.25, Infinity, true), 301);
});

test('side-resize: a saved value is whole, in range, and never trusted blindly', () => {
  const fake = (value) => ({ getItem: () => value });
  assert.equal(rules.read(fake('400')), 400);
  assert.equal(rules.read(fake('400.6')), 401);
  assert.equal(rules.read(fake('100')), 220);
  assert.equal(rules.read(fake('9999')), 840);
  assert.equal(rules.read(fake('abc')), 250);
  assert.equal(rules.read(fake(null)), 250);
  assert.equal(rules.read(null), 250);
  assert.equal(rules.read({ getItem: () => { throw new Error('denied'); } }), 250);
});

test('side-resize: remembering writes one integer, and a locked store is not fatal', () => {
  let written = null;
  const store = { setItem: (key, value) => { written = [key, value]; } };
  assert.equal(rules.remember(store, 370.4), true);
  assert.deepEqual(written, ['neo-ext-side-width', '370']);
  assert.equal(rules.remember(store, 9999), true);
  assert.deepEqual(written, ['neo-ext-side-width', '840']);
  assert.equal(rules.remember(store, 'nonsense'), false);
  assert.equal(rules.remember({ setItem: () => { throw new Error('denied'); } }, 300), false);
});
