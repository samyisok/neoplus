// NEO fork — quick search over record titles and descriptions (adr-005)
//
// Pure: lower-cased matching and offsets, so the highlight can be painted
// without touching the text or storing markup.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRecordsSearch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeQuery(query) {
    return typeof query === 'string' ? query.trim().toLocaleLowerCase() : '';
  }

  // lower case of the same length, so an offset in it is an offset in s
  // ('İ' lowers to two characters and is left as it is)
  function lowerSameLength(s) {
    const l = s.toLocaleLowerCase();
    if (l.length === s.length) return l;
    let out = '';
    for (const c of s) {
      const lc = c.toLocaleLowerCase();
      out += lc.length === c.length ? lc : c;
    }
    return out;
  }

  function test(title, body, query) {
    const q = normalizeQuery(query);
    if (!q) return true;
    return lowerSameLength(String(title || '')).includes(q) || lowerSameLength(String(body || '')).includes(q);
  }

  function ranges(text, query) {
    const source = String(text || '');
    const q = normalizeQuery(query);
    if (!q || !source) return [];
    const lower = lowerSameLength(source);
    const found = [];
    let at = 0;
    while (at <= lower.length - q.length) {
      const hit = lower.indexOf(q, at);
      if (hit < 0) break;
      found.push({ start: hit, end: hit + q.length });
      at = hit + q.length;
    }
    return found;
  }

  function matches(record, query) {
    const q = normalizeQuery(query);
    if (!q) return { title: false, body: false };
    return {
      title: lowerSameLength(String(record.title || '')).includes(q),
      body: lowerSameLength(String(record.body || '')).includes(q)
    };
  }

  return { normalizeQuery, test, ranges, matches, lowerSameLength };
});
