// NEO fork — dictionary main process (adr-003)
//
// The dictionary answers with definitions, not synonyms: parts of speech in
// first-seen order, each holding its senses' definitions and examples. The
// same shard store and inflection ladder serve the thesaurus.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');

const dictionary = require('../neo-ext/dictionary-main.js');

function fake(extra) {
  const handlers = new Map();
  dictionary.init({
    ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: () => {} },
    logError: () => {},
    ...(extra || {})
  });
  return { handlers };
}

test('status: bundled data is available and names the edition', async () => {
  const { handlers } = fake();
  const status = await handlers.get('neo-ext:dictionary-status')();
  assert.equal(status.ok, true);
  assert.equal(status.available, true);
  assert.equal(status.language, 'en');
  assert.ok(status.headwords > 100000);
});

test('status: a missing data directory is reported, not thrown', async () => {
  const { handlers } = fake({ dataDir: path.join(__dirname, 'no-such-dictionary') });
  const status = await handlers.get('neo-ext:dictionary-status')();
  assert.equal(status.available, false);
  const miss = await handlers.get('neo-ext:dictionary')({}, 'batch');
  assert.equal(miss.ok, false);
  assert.equal(miss.reason, 'unavailable');
});

test('lookup: a word comes back grouped by part of speech, with examples', async () => {
  const { handlers } = fake();
  const res = await handlers.get('neo-ext:dictionary')({}, 'batch');
  assert.equal(res.ok, true);
  assert.equal(res.word, 'batch');
  const pos = res.groups.map((g) => g.pos);
  assert.ok(pos.includes('noun') && pos.includes('verb'), pos.join(','));
  assert.deepEqual(pos, [...new Set(pos)], 'parts of speech appear once');
  for (const group of res.groups) {
    assert.ok(Array.isArray(group.senses) && group.senses.length, `${group.pos} has senses`);
    for (const sense of group.senses) {
      assert.equal(typeof sense.def, 'string');
      assert.ok(sense.def.trim().length > 0);
      assert.ok(!/\((noun|verb|adj|adv)\)/.test(sense.def), 'no marker inside a definition');
    }
  }
  assert.equal(res.count, res.groups.reduce((n, g) => n + g.senses.length, 0));
  assert.ok(res.groups.some((g) => g.senses.some((s) => Array.isArray(s.ex) && s.ex.length)), 'an example travels');
});

test('lookup: an inflected form and a possessive resolve to the base word', async () => {
  const { handlers } = fake();
  const plural = await handlers.get('neo-ext:dictionary')({}, 'batches');
  assert.equal(plural.ok, true);
  assert.equal(plural.word, 'batch');
  const possessive = await handlers.get('neo-ext:dictionary')({}, "writer's");
  assert.equal(possessive.ok, true);
  assert.equal(possessive.word, 'writer');
});

test('lookup: an unknown word, a non-letter word, and an overlong word report none', async () => {
  const { handlers } = fake();
  for (const word of ['xyzzyplugh', '1990s', '', '   ', 'x'.repeat(500), 'toString', 'hasOwnProperty', 'constructor']) {
    const res = await handlers.get('neo-ext:dictionary')({}, word);
    assert.equal(res.ok, false, word);
    assert.equal(res.reason, 'none', word);
  }
});

test('lookup: a warm shard answers well under 150 ms', async () => {
  const { handlers } = fake();
  await handlers.get('neo-ext:dictionary')({}, 'batch');
  const at = process.hrtime.bigint();
  const res = await handlers.get('neo-ext:dictionary')({}, 'batch');
  const ms = Number(process.hrtime.bigint() - at) / 1e6;
  assert.equal(res.ok, true);
  assert.ok(ms < 150, `warm lookup took ${ms.toFixed(1)} ms`);
});
