// NEO fork — thesaurus lookup rules (adr-002)
//
// Pure: no DOM, no filesystem, no IPC. The main process uses these against a
// shard; the renderer uses wordBounds and the display helpers.
//
// The word forms themselves live in one place (adr-003): neo-ext/lib/
// word-forms.js. This module re-exports them so every existing caller and test
// keeps its surface.

'use strict';

(function (root, factory) {
  const forms = typeof module === 'object' && module.exports
    ? require('./word-forms.js')
    : root.NeoWordForms;
  const api = factory(forms || {});
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoThesaurusRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (forms) {
  const { normalize, wordBounds, candidates, shardFor, MAX_WORD } = forms;

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
