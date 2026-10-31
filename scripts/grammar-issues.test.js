// NEO fork — the grammar answer's rules (adr-017)
//
// The model answers in one JSON object per line, or CLEAN. This file owns that
// contract: parsing, locating, overlaps, the corrected text, and style filtering.

'use strict';

const test = require('node:test');
const assert = require('node:assert');

const rules = require('../neo-ext/lib/grammar-issues.js');

const line = (quote, fix, message) => JSON.stringify({ quote, fix, message });

test('grammar-issues: one object per line parses and locates', () => {
  const selection = 'He stand in the midle.';
  const out = rules.parse(
    `${line('stand', 'stood', 'past tense')}\n${line('midle', 'middle', 'spelling')}`,
    selection
  );
  assert.equal(out.status, 'issues');
  assert.equal(out.issues.length, 2);
  assert.equal(out.issues[0].start, 3);
  assert.equal(out.issues[0].end, 8);
  assert.equal(out.issues[0].reason, '');
  assert.equal(out.issues[1].start, 16);
  assert.equal(out.retry, false);
});

test('grammar-issues: a line with no braces is ignored', () => {
  const selection = 'He stand here.';
  const out = rules.parse(`Here is the issue:\n${line('stand', 'stood', 'past tense')}`, selection);
  assert.equal(out.status, 'issues');
  assert.equal(out.issues.length, 1);
  assert.equal(out.malformed, false);
});

test('grammar-issues: a one-line JSON array is accepted', () => {
  const selection = 'He stand in the midle.';
  const out = rules.parse(
    `[${line('stand', 'stood', 'past tense')},${line('midle', 'middle', 'spelling')}]`,
    selection
  );
  assert.equal(out.status, 'issues');
  assert.equal(out.issues.length, 2);
});

test('grammar-issues: a brace line that fails to parse is flagged', () => {
  const out = rules.parse('{"quote":"stand",', 'He stand here.');
  assert.equal(out.status, 'unreadable');
  assert.equal(out.malformed, true);
  assert.equal(out.retry, true);
});

test('grammar-issues: a missing or non-string quote is dropped', () => {
  const out = rules.parse('{"fix":"stood","message":"x"}', 'He stand here.');
  assert.equal(out.status, 'unreadable');
  assert.equal(out.malformed, true);
  assert.equal(out.issues.length, 0);
});

test('grammar-issues: a missing fix or message is not applied', () => {
  const noFix = rules.parse('{"quote":"stand","message":"x"}', 'He stand here.');
  assert.equal(noFix.status, 'issues');
  assert.equal(noFix.issues[0].reason, 'unusable');
  assert.equal(noFix.issues[0].applied, false);

  const noMessage = rules.parse('{"quote":"stand","fix":"stood"}', 'He stand here.');
  assert.equal(noMessage.issues[0].reason, 'unusable');
  assert.match(noMessage.issues[0].message, /no explanation/);
});

test('grammar-issues: an issue with no fix and no message still explains itself', () => {
  const out = rules.parse('{"quote":"stand"}', 'He stand here.');
  assert.equal(out.status, 'issues');
  assert.equal(out.issues[0].reason, 'unusable');
  assert.equal(out.issues[0].message, rules.NO_MESSAGE);
});

test('grammar-issues: an unlocatable quote is not applied', () => {
  const out = rules.parse(line('zzz', 'x', 'nowhere'), 'He stand here.');
  assert.equal(out.status, 'issues');
  assert.equal(out.issues[0].reason, 'unlocatable');
  assert.equal(out.issues[0].applied, false);
  assert.equal(out.retry, true);
});

test('grammar-issues: duplicate quotes take occurrences in order', () => {
  const selection = 'the cat and the cat';
  const out = rules.parse(
    `${line('cat', 'dog', 'first')}\n${line('cat', 'fox', 'second')}`,
    selection
  );
  assert.equal(out.issues.length, 2);
  assert.equal(out.issues[0].start, 4);
  assert.equal(out.issues[1].start, 16);
  assert.equal(out.issues[0].reason, '');
  assert.equal(out.issues[1].reason, '');
});

test('grammar-issues: overlapping spans keep the leftmost', () => {
  const selection = 'white hat';
  const out = rules.parse(
    `${line('white hat', 'a white hat', 'article')}\n${line('hat', 'caps', 'word')}`,
    selection
  );
  assert.equal(out.issues.length, 2);
  assert.equal(out.issues[0].reason, '');
  assert.equal(out.issues[1].reason, 'overlap');
  assert.equal(out.issues[1].applied, false);
});

test('grammar-issues: an empty fix deletes and a no-op is no issue', () => {
  const out = rules.parse(line('very ', '', 'cut'), 'He was very tired.');
  assert.equal(out.status, 'issues');
  assert.equal(out.issues[0].applied, true);
  const applied = rules.apply(out.issues, 'He was very tired.');
  assert.equal(applied.text, 'He was tired.');
  assert.equal(applied.spans.length, 0);

  const noop = rules.parse(
    `${line('tired', 'tired', 'nothing')}\nCLEAN`,
    'He was tired.'
  );
  assert.equal(noop.status, 'clean');
  assert.equal(noop.issues.length, 0);
});

test('grammar-issues: at most 40 issues are kept in answer order', () => {
  const tokens = Array.from({ length: 45 }, (_, i) => `t${i}`);
  const selection = tokens.join(' ');
  const answer = tokens.map((token) => line(token, token + 'x', 'm')).join('\n');
  const out = rules.parse(answer, selection);
  assert.equal(out.issues.length, 40);
  assert.equal(out.issues[0].quote, 't0');
  assert.equal(out.issues[39].quote, 't39');
});

test('grammar-issues: CLEAN is clean, a usable issue wins, prose is unreadable', () => {
  assert.equal(rules.parse('CLEAN', 'He stood there.').status, 'clean');
  assert.equal(rules.parse('CLEAN', 'He stood there.').retry, false);
  const both = rules.parse(`${line('stand', 'stood', 'x')}\nCLEAN`, 'He stand there.');
  assert.equal(both.status, 'issues');
  assert.equal(both.issues.length, 1);
  assert.equal(rules.parse('No errors found.', 'He stood there.').status, 'unreadable');
  assert.equal(rules.parse('', 'He stood there.').status, 'unreadable');
  assert.equal(rules.parse('No errors found.', 'He stood there.').retry, true);
});

test('grammar-issues: apply returns the exact corrected text and green ranges', () => {
  const selection = 'He stand in the midle.';
  const out = rules.parse(
    `${line('stand', 'stood', 'past')}\n${line('midle', 'middle', 'spelling')}`,
    selection
  );
  const applied = rules.apply(out.issues, selection);
  assert.equal(applied.text, 'He stood in the middle.');
  assert.deepEqual(applied.spans, [
    { start: 3, end: 8 },
    { start: 16, end: 22 }
  ]);
});

test('grammar-issues: unlocatable issues never reach the text or spans', () => {
  const selection = 'He stand here.';
  const out = rules.parse(
    `${line('stand', 'stood', 'past')}\n${line('zzz', 'x', 'nowhere')}`,
    selection
  );
  const applied = rules.apply(out.issues, selection);
  assert.equal(applied.text, 'He stood here.');
  assert.deepEqual(applied.spans, [{ start: 3, end: 8 }]);
});

test('grammar-issues: a fix with a line break is not applied', () => {
  const out = rules.parse('{"quote":"stand","fix":"stood\\nhere","message":"past"}', 'He stand here.');
  assert.equal(out.status, 'issues');
  assert.equal(out.issues[0].reason, 'unusable');
});

test('grammar-issues: CLEAN with unusable issues is clean and does not retry', () => {
  const out = rules.parse('CLEAN\n{"quote":"zzz","fix":"x","message":"nowhere"}', 'He stood here.');
  assert.equal(out.status, 'clean');
  assert.equal(out.issues.length, 0);
  assert.equal(out.retry, false);
});

test('grammar-issues: a no-op-only answer is clean and changes nothing', () => {
  const out = rules.parse(line('tired', 'tired', 'nothing'), 'He was tired.');
  assert.equal(out.status, 'clean');
  assert.equal(out.retry, false);
  const applied = rules.apply(out.issues, 'He was tired.');
  assert.equal(applied.text, 'He was tired.');
  assert.equal(applied.spans.length, 0);
});

test('grammar-issues: style drops corrected-only and grammar-overlapping quotes', () => {
  const original = 'He stood in the middle of the pile.';
  const grammar = rules.parse(line('stood', 'stands', 'tense'), original).issues;
  const suggestions = [
    { quote: 'stood', example: 'remained', message: 'overlap' },
    { quote: 'middle', example: 'center', message: 'word' },
    { quote: 'gone', example: 'away', message: 'missing' },
    { quote: 'pile', example: 'heap', message: 'word' }
  ];
  const kept = rules.filterStyle(suggestions, original, grammar);
  assert.deepEqual(kept.map((s) => s.quote), ['middle', 'pile']);
  assert.equal(kept[0].start, 16);
});

test('grammar-issues: style keeps at most three suggestions in text order', () => {
  const original = 'alpha beta gamma delta epsilon';
  const suggestions = ['epsilon', 'beta', 'delta', 'alpha', 'gamma']
    .map((quote) => ({ quote, example: quote + '!', message: 'm' }));
  const kept = rules.filterStyle(suggestions, original, []);
  assert.deepEqual(kept.map((s) => s.quote), ['alpha', 'beta', 'gamma']);
});

test('grammar-issues: a whole-sentence answer is trimmed to the changed word', () => {
  const selection = 'Underneath the blue metal shell were crystal muscles made from Qi Crystals.';
  const quote = selection;
  const fix = selection.replace('Qi Crystals', 'Qi crystals');
  const out = rules.parse(JSON.stringify({ quote, fix, message: 'common noun' }), selection);
  assert.equal(out.status, 'issues');
  assert.equal(out.issues[0].quote, 'Crystals');
  assert.equal(out.issues[0].fix, 'crystals');
  assert.equal(out.issues[0].start, selection.indexOf('Crystals'));
  const applied = rules.apply(out.issues, selection);
  assert.equal(applied.text, fix);
  assert.deepEqual(applied.spans, [{ start: selection.indexOf('Crystals'), end: selection.indexOf('Crystals') + 8 }]);
});

test('grammar-issues: a whole-sentence style answer is trimmed to the changed phrase', () => {
  const selection = 'it was made from Ice Source Metal.';
  const quote = selection;
  const example = selection.replace('from', 'of');
  const kept = rules.filterStyle([{ quote, example, message: 'natural' }], selection, []);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].quote, 'from');
  assert.equal(kept[0].example, 'of');
  assert.equal(kept[0].start, selection.indexOf('from'));
});

test('grammar-issues: an insertion becomes an empty quote and a green insertion', () => {
  const selection = 'he was slim young man';
  const out = rules.parse(JSON.stringify({ quote: selection, fix: 'he was a slim young man', message: 'article' }), selection);
  assert.equal(out.issues[0].quote, '');
  assert.equal(out.issues[0].fix, 'a ');
  const applied = rules.apply(out.issues, selection);
  assert.equal(applied.text, 'he was a slim young man');
  assert.deepEqual(applied.spans, [{ start: 7, end: 9 }]);
});

test('grammar-issues: a left fix of a different length shifts the right green range', () => {
  const selection = 'aa b c';
  const out = rules.parse(
    '{"quote":"aa","fix":"A","message":"short"}\n{"quote":"c","fix":"CC","message":"long"}',
    selection
  );
  const applied = rules.apply(out.issues, selection);
  assert.equal(applied.text, 'A b CC');
  assert.deepEqual(applied.spans, [
    { start: 0, end: 1 },
    { start: 4, end: 6 }
  ]);
});

test('grammar-issues: CLEAN with a garbled line still asks for the retry', () => {
  const out = rules.parse('CLEAN\n{"quote":', 'He stood here.');
  assert.equal(out.status, 'clean');
  assert.equal(out.malformed, true);
  assert.equal(out.retry, true);
});

test('grammar-issues: limits are exported', () => {
  assert.equal(rules.MAX_ISSUES, 40);
  assert.equal(rules.MAX_STYLE, 3);
  assert.equal(rules.MAX_CORRECTED, 2000);
});

test('grammar-issues: style answers parse separately and CLEAN means none', () => {
  const one = rules.parseStyle('{"quote":"middle","example":"center","message":"word"}');
  assert.equal(one.status, 'suggestions');
  assert.equal(one.suggestions.length, 1);
  assert.equal(rules.parseStyle('CLEAN').status, 'clean');
  assert.equal(rules.parseStyle('No changes.').status, 'unreadable');
  assert.equal(rules.parseStyle('No changes.').retry, true);
  const noop = rules.parseStyle('{"quote":"middle","example":"middle","message":"same"}');
  assert.equal(noop.status, 'clean');
});

test('grammar-issues: a quote the model lowercased is still anchored', () => {
  const selection = 'The both of them agreed.';
  const out = rules.parse(line('the both', 'both', 'extra article'), selection);
  assert.equal(out.status, 'issues');
  assert.equal(out.issues[0].reason, '');
  assert.equal(out.issues[0].start, 0);
  const applied = rules.apply(out.issues, selection);
  assert.equal(applied.text, 'Both of them agreed.');
});

test('grammar-issues: a lowercase fix at a sentence start takes the capital', () => {
  const selection = 'Their going to the park.';
  const out = rules.parse(line('their', 'they are', 'homophone'), selection);
  assert.equal(out.issues[0].quote, 'Their');
  assert.equal(rules.apply(out.issues, selection).text, 'They are going to the park.');
});

test('grammar-issues: a lowercase fix inside a sentence keeps the writer case', () => {
  const selection = 'Underneath the shell were muscles made from Qi Crystals.';
  const out = rules.parse(line('Crystals', 'crystals', 'common noun'), selection);
  assert.equal(rules.apply(out.issues, selection).text, selection.replace('Crystals', 'crystals'));
});

test('grammar-issues: an empty object is a clean answer', () => {
  const out = rules.parse('{"quote":"", "fix":"", "message":"CLEAN"}', 'He stood here.');
  assert.equal(out.status, 'clean');
  assert.equal(out.retry, false);
  assert.equal(out.clean, true);
});

test('grammar-issues: deleting a whole word takes one space with it', () => {
  const atEnd = 'She has eaten dinner already.';
  const out = rules.parse(line('already', '', 'extra word'), atEnd);
  assert.equal(rules.apply(out.issues, atEnd).text, 'She has eaten dinner.');

  const inside = 'We arrived at home.';
  const middle = rules.parse(line('at', '', 'extra word'), inside);
  assert.equal(rules.apply(middle.issues, inside).text, 'We arrived home.');
  assert.deepEqual(rules.apply(middle.issues, inside).spans, []);
});

test('grammar-issues: deleting the whole selection leaves nothing', () => {
  const text = 'He stand in the midle of the pile of bodies. He wore white hat.';
  const out = rules.parse(line(text, '', 'cut'), text);
  const applied = rules.apply(out.issues, text);
  assert.equal(applied.text, '');
  assert.deepEqual(applied.spans, []);
});

test('grammar-issues: the same fix reported twice is one card, not a not-applied twin', () => {
  const selection = 'He was slim young man with a smirk at his good-looking face.';
  const out = rules.parse(
    `${line('slim young man', 'a slim young man', 'missing article')}\n`
    + `${line('He was slim young man', 'He was a slim young man', 'missing article')}`,
    selection
  );
  assert.equal(out.status, 'issues');
  assert.equal(out.issues.length, 1);
  assert.equal(out.issues[0].reason, '');
  assert.equal(out.issues[0].quote, '');
  assert.equal(rules.apply(out.issues, selection).text, 'He was a slim young man with a smirk at his good-looking face.');
});

test('grammar-issues: a wider and a narrower quote of one error collapse', () => {
  const selection = 'He wore plain white robe, but even from here I could feel Qi.';
  const out = rules.parse(
    `${line('smirk at his good-looking face', 'smirk on his good-looking face', 'preposition')}\n`
    + `${line('at his good-looking face', 'on his good-looking face', 'preposition')}`,
    selection
  );
  // Neither quote is in this selection, so both are unlocatable and stay listed.
  assert.equal(out.issues.filter((issue) => !issue.reason).length, 0);

  const inText = 'He had a smirk at his good-looking face.';
  const both = rules.parse(
    `${line('smirk at his good-looking face', 'smirk on his good-looking face', 'preposition')}\n`
    + `${line('at his good-looking face', 'on his good-looking face', 'preposition')}`,
    inText
  );
  assert.equal(both.issues.length, 1);
  assert.equal(both.issues[0].reason, '');
  assert.equal(both.issues[0].quote, 'at');
  assert.equal(rules.apply(both.issues, inText).text, 'He had a smirk on his good-looking face.');
});

test('grammar-issues: two different fixes on one span still show the second as not applied', () => {
  const selection = 'The white hat lay on the bench.';
  const out = rules.parse(
    `${line('white hat', 'a white hat', 'article')}\n${line('white hat', 'grey hat', 'word')}`,
    selection
  );
  assert.equal(out.issues.length, 2);
  assert.equal(out.issues[0].reason, '');
  assert.equal(out.issues[1].reason, 'overlap');
});

test('grammar-issues: an issue in the reference context is dropped, not shown', () => {
  const selection = 'I looked at my metallic left hand.';
  const answer = `${line('metallic left hand', '', 'extra word')}\n`
    + `${line('slim young man', 'a slim young man', 'missing article')}\n`
    + `${line('plain white robe', 'a plain white robe', 'missing article')}`;
  const context = { before: 'The hall was quiet.', after: 'He was slim young man with a plain white robe.' };

  const without = rules.parse(answer, selection);
  assert.equal(without.issues.filter((issue) => issue.reason === 'unlocatable').length, 2);

  const out = rules.parse(answer, selection, context);
  assert.equal(out.issues.length, 1, 'the two context issues are gone');
  assert.equal(out.issues[0].reason, '');
  assert.equal(out.status, 'issues');
  assert.equal(out.retry, false);
});

test('grammar-issues: an answer that only reports the context is clean for this selection', () => {
  const selection = 'The hall was quiet.';
  const answer = line('slim young man', 'a slim young man', 'missing article');
  const out = rules.parse(answer, selection, { before: '', after: 'He was slim young man there.' });
  assert.equal(out.status, 'clean');
  assert.equal(out.issues.length, 0);
  assert.equal(out.retry, false);
});

test('grammar-issues: a short unlocatable quote is not mistaken for context', () => {
  const selection = 'The water is cool.';
  const answer = line('was', 'were', 'agreement');
  const out = rules.parse(answer, selection, { before: '', after: 'It was a long walk.' });
  assert.equal(out.issues.length, 1);
  assert.equal(out.issues[0].reason, 'unlocatable');
  assert.equal(out.status, 'issues');
});

test('grammar-issues: a model quote is capped to a sane length', () => {
  const selection = 'He stood here.';
  const huge = 'x'.repeat(5000);
  const out = rules.parse(line(huge, 'fixed', 'noise'), selection);
  assert.ok(out.issues[0].quote.length <= rules.MAX_QUOTE);
  assert.equal(rules.MAX_QUOTE, 2000);
});
