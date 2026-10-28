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
  const tagRules = (() => {
    let rules = null;
    try { if (typeof require === 'function') rules = require('./record-tags.js'); } catch { /* browser */ }
    if (!rules && typeof globalThis !== 'undefined') rules = globalThis.NeoRecordTags;
    if (!rules || typeof rules.activeTags !== 'function') throw new Error('records-search needs record-tags.js');
    return rules;
  })();

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

  // Tag text comes from the one owner of what a tag is, not a second reading
  // of the stamp fields.
  function tagTexts(record) {
    return tagRules ? tagRules.activeTags(record) : [];
  }

  function test(title, body, query, tags = []) {
    const q = normalizeQuery(query);
    if (!q) return true;
    if (lowerSameLength(String(title || '')).includes(q) || lowerSameLength(String(body || '')).includes(q)) return true;
    return (tags || []).some((tag) => lowerSameLength(String(tag || '')).includes(q));
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
    if (!q) return { title: false, body: false, tags: false };
    return {
      title: lowerSameLength(String(record.title || '')).includes(q),
      body: lowerSameLength(String(record.body || '')).includes(q),
      tags: tagTexts(record).some((tag) => lowerSameLength(tag).includes(q))
    };
  }

  function testRecord(record, query) {
    return test(record.title, record.body, query, tagTexts(record));
  }

  return { normalizeQuery, test, testRecord, ranges, matches, tagTexts, lowerSameLength };
});
