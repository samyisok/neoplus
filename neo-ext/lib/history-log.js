// NEO fork — the book's replacement history (adr-014)
//
// Pure: no DOM, no filesystem. Entries are append-only and merged by id, so two
// devices add to each other instead of overwriting. Newest-first order is
// applied on every read and write; a file's own order is never trusted.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoHistoryLog = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FORMAT = 1;
  const MAX_SIDE = 5000;
  const MAX_LABEL = 80;
  const MAX_TITLE = 200;
  const MAX_CHAPTER_ID = 80;
  const MAX_ID = 80;
  const MAX_ENTRIES = 10000;

  const TOOL = /^[a-z][a-z0-9-]{0,39}$/;

  function empty() {
    return { format: FORMAT, entries: [] };
  }

  function isObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function cleanId(value, max) {
    const limit = Number.isFinite(max) ? max : MAX_ID;
    return typeof value === 'string' && value.length > 0 && value.length <= limit && /^[A-Za-z0-9._:-]+$/.test(value) ? value : '';
  }

  // Titles and labels are one line; the manuscript's own text is not, so the
  // two sides keep their whitespace and are only trimmed at the ends.
  function cleanLine(value, max) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }

  function cleanSide(value) {
    if (typeof value !== 'string') return { text: '', truncated: false };
    const text = value.trim();
    if (text.length <= MAX_SIDE) return { text, truncated: false };
    return { text: text.slice(0, MAX_SIDE), truncated: true };
  }

  // A time is kept as the device recorded it. Nothing clamps a future stamp on
  // read, or a write would rewrite another device's clock into this one's. A
  // string or boolean is not a time, however Number() would read it.
  function stamp(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return 0;
    // The last millisecond a Date can represent; a wild clock still renders.
    return Math.min(Math.floor(value), 8640000000000000);
  }

  function cryptoId() {
    try {
      if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* fall through */ }
    return 'hist-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function markOf(value) {
    return value === 'from' || value === 'to' || value === 'both' ? value : '';
  }

  function withSide(mark, side) {
    const hasFrom = mark === 'from' || mark === 'both';
    const hasTo = mark === 'to' || mark === 'both';
    if (side === 'from') {
      if (hasFrom) return mark;
      return hasTo ? 'both' : 'from';
    }
    if (hasTo) return mark;
    return hasFrom ? 'both' : 'to';
  }

  function cleanEntry(value, now) {
    if (!isObject(value)) return null;
    const id = cleanId(value.id);
    const at = stamp(value.at, now);
    const tool = typeof value.tool === 'string' && TOOL.test(value.tool) ? value.tool : '';
    const from = cleanSide(value.from);
    const to = cleanSide(value.to);
    if (!id || !at || !tool || !from.text || !to.text) return null;
    const chapterId = cleanId(value.chapterId, MAX_CHAPTER_ID);
    const number = value.chapterNumber;
    const chapterNumber = chapterId && typeof number === 'number' && Number.isFinite(number) && number >= 0 && number <= 1000000
      ? Math.floor(number) : 0;
    let shortened = markOf(value.shortened);
    if (from.truncated) shortened = withSide(shortened, 'from');
    if (to.truncated) shortened = withSide(shortened, 'to');
    return {
      id,
      at,
      tool,
      label: cleanLine(value.label, MAX_LABEL),
      from: from.text,
      to: to.text,
      chapterId,
      chapterNumber,
      chapterTitle: chapterId ? cleanLine(value.chapterTitle, MAX_TITLE) : '',
      shortened
    };
  }

  // Newest first, with the id as a stable tiebreak so two readings agree.
  function sorted(entries) {
    return [...entries].sort((a, b) => (b.at - a.at) || b.id.localeCompare(a.id));
  }

  function normalize(value, now = Date.now()) {
    if (!isObject(value) || value.format !== FORMAT) return { ok: false, reason: 'format' };
    const source = value.entries === undefined ? [] : value.entries;
    if (!Array.isArray(source)) return { ok: false, reason: 'shape' };
    if (source.length > MAX_ENTRIES) return { ok: false, reason: 'count' };
    const entries = [];
    const seen = new Set();
    for (const raw of source) {
      const clean = cleanEntry(raw, now);
      // One unreadable entry loses that entry alone, never the book's history.
      if (!clean || seen.has(clean.id)) continue;
      seen.add(clean.id);
      entries.push(clean);
    }
    // A file where nothing survives is unreadable, not an empty history we
    // could write over.
    if (source.length && !entries.length) return { ok: false, reason: 'entry' };
    return { ok: true, store: { format: FORMAT, entries: sorted(entries) } };
  }

  // The main process stamps the time and the id; the renderer supplies meaning.
  function makeEntry(value, options) {
    const opts = options || {};
    const now = Number.isFinite(opts.now) ? opts.now : Date.now();
    const id = cleanId(opts.id) || cleanId(value && value.id) || cryptoId();
    const clean = cleanEntry({ ...(isObject(value) ? value : {}), id, at: now }, now);
    if (!clean) return { ok: false, reason: 'entry' };
    return { ok: true, entry: clean };
  }

  function append(store, entry) {
    const base = normalize(store, Date.now());
    if (!base.ok) return base;
    const one = cleanEntry(entry, Date.now());
    if (!one) return { ok: false, reason: 'entry' };
    if (base.store.entries.some((held) => held.id === one.id)) return { ok: true, store: base.store };
    if (base.store.entries.length >= MAX_ENTRIES) return { ok: false, reason: 'count' };
    return { ok: true, store: { format: FORMAT, entries: sorted([...base.store.entries, one]) } };
  }

  function merge(left, right, now = Date.now()) {
    const a = normalize(left, now);
    const b = normalize(right, now);
    if (!a.ok || !b.ok) return { ok: false, reason: !a.ok ? a.reason : b.reason };
    const byId = new Map();
    for (const entry of a.store.entries) byId.set(entry.id, entry);
    for (const entry of b.store.entries) if (!byId.has(entry.id)) byId.set(entry.id, entry);
    if (byId.size > MAX_ENTRIES) return { ok: false, reason: 'count' };
    return { ok: true, store: { format: FORMAT, entries: sorted([...byId.values()]) } };
  }

  return {
    FORMAT, MAX_SIDE, MAX_LABEL, MAX_TITLE, MAX_CHAPTER_ID, MAX_ENTRIES,
    empty, normalize, makeEntry, append, merge, sorted
  };
});
