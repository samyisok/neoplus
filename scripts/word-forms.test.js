// NEO fork — one set of word forms for every lexical feature (adr-003)
//
// The dictionary must resolve an inflected word the way the thesaurus already
// does. Rather than copy the ladder, both read neo-ext/lib/word-forms.js, and
// the old module re-exports it so its public surface does not move.

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const forms = require('../neo-ext/lib/word-forms.js');
const thesaurus = require('../neo-ext/lib/thesaurus-lookup.js');

test('word-forms: the four exports are there', () => {
  assert.equal(typeof forms.normalize, 'function');
  assert.equal(typeof forms.wordBounds, 'function');
  assert.equal(typeof forms.candidates, 'function');
  assert.equal(forms.MAX_WORD, 120);
});

test('word-forms: the thesaurus re-exports the same functions', () => {
  assert.equal(thesaurus.normalize, forms.normalize);
  assert.equal(thesaurus.wordBounds, forms.wordBounds);
  assert.equal(thesaurus.candidates, forms.candidates);
  assert.equal(thesaurus.MAX_WORD, forms.MAX_WORD);
});

test('word-forms: casing, curly apostrophes, and surrounding punctuation', () => {
  assert.equal(forms.normalize('Writer’s'), "writer's");
  assert.equal(forms.normalize('  “batch” '), 'batch');
  assert.equal(forms.normalize(42), '');
});

test('word-forms: the caret inside a word resolves that word', () => {
  assert.deepEqual(forms.wordBounds('a batch of letters', 3), { start: 2, end: 7, word: 'batch' });
  assert.deepEqual(forms.wordBounds('a batch of letters', 7), { start: 2, end: 7, word: 'batch' });
  assert.deepEqual(forms.wordBounds('a batch of letters', 10), { start: 8, end: 10, word: 'of' });
  assert.equal(forms.wordBounds('a batch of letters', -1), null);
});

test('word-forms: the inflection ladder reaches the base form', () => {
  for (const [word, expected] of [['batches', 'batch'], ['writers', 'writer'], ["writer's", 'writer'], ['batted', 'bat'], ['batting', 'bat'], ['writing', 'write']]) {
    const found = forms.candidates(word);
    assert.ok(found.includes(expected), `${word} → ${found.join(', ')} misses ${expected}`);
    assert.equal(found[0], forms.normalize(word), 'the exact form is always tried first');
  }
});
