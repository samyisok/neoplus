// NEO fork — one set of word forms (adr-003)
//
// Pure: no DOM, no filesystem, no IPC. Both lexical features resolve the word
// under the pointer here, so "batches → batch" means the same in the
// dictionary and the thesaurus.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoWordForms = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const WORD = /[\p{L}\p{M}\p{N}]/u;
  const JOIN = /['’-]/;
  const HEADWORD = /^[a-z][a-z' -]*$/;
  const MAX_WORD = 120;

  function normalize(word) {
    if (typeof word !== 'string') return '';
    return word
      .replace(/’/g, "'")
      .trim()
      .replace(/^[^\p{L}\p{N}]+/u, '')
      .replace(/[^\p{L}\p{N}]+$/u, '')
      .toLowerCase();
  }

  // Offset points at a character in the text node, as a caret range gives it.
  // A caret just past the last letter of a word (on its trailing space or at
  // the end of the text) still belongs to that word.
  function wordBounds(text, offset) {
    if (typeof text !== 'string' || !text.length) return null;
    const at = Number(offset) || 0;
    if (at < 0 || at > text.length) return null;
    let index = at;
    if (index >= text.length || !WORD.test(text[index])) {
      if (index > 0 && (index === text.length || /\s/.test(text[index])) && WORD.test(text[index - 1])) index -= 1;
      else return null;
    }
    let start = index;
    let end = index + 1;
    while (start > 0) {
      const ch = text[start - 1];
      if (WORD.test(ch)) start -= 1;
      else if (JOIN.test(ch) && start - 2 >= 0 && WORD.test(text[start - 2])) start -= 1;
      else break;
    }
    while (end < text.length) {
      const ch = text[end];
      if (WORD.test(ch)) end += 1;
      else if (JOIN.test(ch) && end + 1 < text.length && WORD.test(text[end + 1])) end += 1;
      else break;
    }
    return { start, end, word: text.slice(start, end) };
  }

  function push(list, form) {
    if (form && HEADWORD.test(form) && !list.includes(form)) list.push(form);
  }

  function deDouble(form) {
    const pairs = /([bcdfghjklmnpqrstvwxz])\1$/i;
    return pairs.test(form) ? form.slice(0, -1) : '';
  }

  // The exact form first. Fallbacks run only when the earlier form misses.
  function candidates(word) {
    const base = normalize(word);
    const out = [];
    push(out, base);
    if (!base) return out;

    const possessive = base.replace(/'s$/, '');
    push(out, possessive);

    if (base.endsWith('ies')) push(out, base.slice(0, -3) + 'y');
    if (base.endsWith('oes')) push(out, base.slice(0, -2)); // goes, does, heroes
    if (base.endsWith('ves')) {
      push(out, base.slice(0, -3) + 'f');  // wolves, knives
      push(out, base.slice(0, -3) + 'fe'); // wives, lives
    }
    if (base.endsWith('s')) push(out, base.slice(0, -1)); // notes, uses, hopes
    if (/(?:s|x|z|ch|sh)es$/.test(base)) push(out, base.slice(0, -2)); // batches, boxes

    if (base.endsWith('ied')) push(out, base.slice(0, -3) + 'y');
    if (base.endsWith('ed')) {
      const stem = base.slice(0, -2);
      push(out, stem + 'e');
      push(out, stem);
      push(out, deDouble(stem));
    }

    if (base.endsWith('ying')) push(out, base.slice(0, -4) + 'ie');
    if (base.endsWith('ing')) {
      const stem = base.slice(0, -3);
      push(out, stem + 'e');
      push(out, stem);
      push(out, deDouble(stem));
    }
    return out;
  }

  // The shard is the word's first letter; anything else has no shard.
  function shardFor(word) {
    const first = normalize(word)[0] || '';
    return /^[a-z]$/.test(first) ? first : '';
  }

  return { normalize, wordBounds, candidates, shardFor, MAX_WORD, HEADWORD };
});
