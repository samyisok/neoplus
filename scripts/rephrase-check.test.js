// NEO fork — which rephrase replies may be shown (adr-012)
//
// Pure: empty, continuation, context leakage and length are refused before a
// card can show a reply.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const check = require('../neo-ext/lib/rephrase-check.js');

const base = { text: 'She was very tired and did not want to go on.', before: 'The innkeeper warned her about the pass.', after: 'By midnight the rain had found every gap in her boots.', label: 'Natural' };

test('rephrase-check: a normal rewrite is accepted', () => {
  const out = check.checkReply({ ...base, reply: 'She was exhausted and wanted to stop.' });
  assert.equal(out.ok, true);
  assert.equal(out.text, 'She was exhausted and wanted to stop.');
});

test('rephrase-check: empty and quoted replies', () => {
  assert.equal(check.checkReply({ ...base, reply: '   ' }).reason, 'empty');
  const quoted = check.checkReply({ ...base, reply: '“She was exhausted and wanted to stop.”' });
  assert.equal(quoted.ok, true);
  assert.equal(quoted.text, 'She was exhausted and wanted to stop.');
});

test('rephrase-check: a labelled quoted reply loses both the label and the quotes', () => {
  const out = check.checkReply({ ...base, reply: 'Natural: She was exhausted and wanted to stop.' });
  assert.equal(out.ok, true);
  assert.equal(out.text, 'She was exhausted and wanted to stop.');
  const quoted = check.checkReply({ ...base, reply: 'Natural: “She was exhausted and wanted to stop.”' });
  assert.equal(quoted.ok, true);
  assert.equal(quoted.text, 'She was exhausted and wanted to stop.');
});

test('rephrase-check: a terse but real rewrite is accepted', () => {
  const out = check.checkReply({ text: 'She was very tired and did not want to go on.', before: '', after: '', label: 'Terse', reply: 'Too tired to continue.' });
  assert.equal(out.ok, true);
});

test('rephrase-check: continuation around the selection is refused', () => {
  const reply = base.text + ' By midnight the rain had found every gap in her boots.';
  assert.equal(check.checkReply({ ...base, reply }).reason, 'continuation');
  assert.equal(check.checkReply({ ...base, reply: 'Then she said: ' + base.text }).reason, 'continuation');
});

test('rephrase-check: context copied into the reply is refused, unless it was in the selection', () => {
  const reply = 'She was exhausted. The innkeeper warned her about the pass.';
  assert.equal(check.checkReply({ ...base, reply }).reason, 'context');
  const shared = { ...base, before: 'She was very tired', text: 'She was very tired and did not want to go on.' };
  assert.equal(check.checkReply({ ...shared, reply: 'She was very tired, and she wanted to stop.' }).ok, true);
});

test('rephrase-check: an over-long reply is refused', () => {
  assert.equal(check.checkReply({ ...base, reply: 'She was tired. '.repeat(30) }).reason, 'long');
});
