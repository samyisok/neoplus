// NEO fork — record tags and the manuscript scanner (adr-006, adr-007)
//
// Pure: no DOM, no filesystem. This module owns what a tag is: its key, its
// active form, the limits, and the action a selection's menu item maps to.
// The store owns records and the tag list; this module owns identity.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRecordTags = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_TAG = 120;
  const MAX_PHRASE = MAX_TAG;
  const MAX_TAGS = 50;
  const MAX_RANGES = 2000;
  const MAX_MATCH_TAGS = 200;

  function normalizeTag(text) {
    return typeof text === 'string' ? text.replace(/\s+/g, ' ').trim() : '';
  }

  function tagKey(text) {
    return normalizeTag(text).toLocaleLowerCase();
  }

  function activeTags(record) {
    return (record && Array.isArray(record.tags) ? record.tags : [])
      .filter((t) => t && !t.removedAt && normalizeTag(t.text))
      .map((t) => normalizeTag(t.text));
  }

  // One vocabulary for Create/Find across the renderer, the native menu, and
  // the router: the action the menu item carries and the mode it means.
  function tagAction(hasTag) {
    return hasTag ? 'record-find' : 'record-create';
  }

  function tagMode(action) {
    if (action === 'record-create') return 'create';
    if (action === 'record-find') return 'find';
    return '';
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function buildMatcher(list) {
    const seen = new Map();
    for (const raw of list || []) {
      if (seen.size >= MAX_MATCH_TAGS) break;
      const text = normalizeTag(raw);
      const key = tagKey(text);
      if (!key || key.length > MAX_TAG || seen.has(key)) continue;
      seen.set(key, text);
    }
    const entries = [...seen.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
    const byKey = new Map(entries);
    let re = null;
    if (entries.length) {
      const alt = entries.map(([, text]) => escapeRe(text)).join('|');
      try { re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${alt})(?![\\p{L}\\p{N}])`, 'giu'); } catch { re = null; }
    }
    function ranges(text, limit = MAX_RANGES) {
      if (!re || typeof text !== 'string' || !text) return [];
      const out = [];
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(text)) && out.length < limit) {
        const key = tagKey(m[0]);
        out.push({ start: m.index, end: m.index + m[0].length, tag: byKey.get(key) || m[0] });
        if (m[0].length === 0) re.lastIndex += 1;
      }
      return out;
    }
    return { ranges, tags: entries.map(([, text]) => text) };
  }

  return {
    MAX_TAG, MAX_PHRASE, MAX_TAGS, MAX_RANGES, MAX_MATCH_TAGS,
    normalizeTag, tagKey, activeTags, tagAction, tagMode, buildMatcher
  };
});
