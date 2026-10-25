// NEO fork — thesaurus lookup rules (adr-002)
//
// Pure: no DOM, no filesystem, no IPC. The main process uses these against a
// shard; the renderer uses wordBounds and the display helpers.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoThesaurusRules = api;
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

  function shardFor(word) {
    const first = normalize(word)[0] || '';
    return /^[a-z]$/.test(first) ? first : '';
  }

  // entry: [{ pos, syns: [{ w, rel }] }]. Merge same parts of speech and
  // relations in first-seen order, de-duplicate across the whole entry, and
  // never offer the looked-up word. Plain synonyms come before marked ones.
  const REL_ORDER = { '': 0, generic: 1, similar: 2, related: 3, antonym: 4 };

  function mergeSenses(entry, word) {
    const groups = [];
    const seen = new Set();
    const skip = normalize(word);
    for (const sense of Array.isArray(entry) ? entry : []) {
      if (!sense || typeof sense.pos !== 'string') continue;
      for (const raw of Array.isArray(sense.syns) ? sense.syns : []) {
        const text = typeof raw === 'string' ? raw : raw && raw.w;
        const rel = raw && typeof raw === 'object' && typeof raw.rel === 'string' ? raw.rel : '';
        const key = normalize(text);
        if (!key || key === skip || seen.has(key)) continue;
        seen.add(key);
        let group = groups.find((g) => g.pos === sense.pos && g.rel === rel);
        if (!group) {
          group = { pos: sense.pos, rel, syns: [] };
          groups.push(group);
        }
        group.syns.push(String(text).trim());
      }
    }
    const posOrder = new Map();
    for (const group of groups) if (!posOrder.has(group.pos)) posOrder.set(group.pos, posOrder.size);
    const rank = (rel) => (Object.hasOwn(REL_ORDER, rel) ? REL_ORDER[rel] : 9);
    groups.sort((a, b) => (posOrder.get(a.pos) - posOrder.get(b.pos))
      || (rank(a.rel) - rank(b.rel)));
    return { groups, count: seen.size };
  }

  function applyCase(chosen, original) {
    const text = String(chosen || '');
    const source = String(original || '');
    const letters = source.match(/\p{L}/gu) || [];
    if (letters.length > 1 && source === source.toUpperCase()) return text.toUpperCase();
    if (letters.length === 1) return text;
    const first = source.match(/\p{L}/u);
    if (first && first[0] === first[0].toUpperCase()) {
      return text.replace(/^\p{L}/u, (ch) => ch.toUpperCase());
    }
    return text;
  }

  function smartApostrophes(text) {
    return String(text || '').replace(/'/g, '’');
  }

  function filterSynonyms(groups, query) {
    const term = String(query || '').trim().toLowerCase();
    if (!term) return groups;
    const out = [];
    for (const group of groups || []) {
      const syns = group.syns.filter((s) => s.toLowerCase().includes(term));
      if (syns.length) out.push({ ...group, syns });
    }
    return out;
  }

  return { normalize, wordBounds, candidates, shardFor, mergeSenses, applyCase, smartApostrophes, filterSynonyms, MAX_WORD };
});
