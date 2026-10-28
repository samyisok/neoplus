// NEO fork — the library-wide record store (adr-005)
//
// Pure: no DOM, no filesystem. Validation and merge are shared by the
// renderer and the main process, so two devices agree on what a record is.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRecordsStore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // The tag module is the one owner of tag identity. Without it the store has
  // no honest answer, so it refuses to load instead of guessing with a copy.
  const tagRules = (() => {
    let rules = null;
    try { if (typeof require === 'function') rules = require('./record-tags.js'); } catch { /* browser */ }
    if (!rules && typeof globalThis !== 'undefined') rules = globalThis.NeoRecordTags;
    if (!rules || typeof rules.tagKey !== 'function') throw new Error('records-store needs record-tags.js');
    return rules;
  })();
  const FORMAT = 1;
  const MAX_TITLE = 200;
  const MAX_BODY = 100000;
  const MAX_FUTURE = 60000;
  const MAX_ITEMS = 20000;

  function empty() {
    return { format: FORMAT, folders: [], records: [] };
  }

  function isObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function stamp(value, now) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), now + MAX_FUTURE);
  }

  function cleanId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= 80 && !/\s/.test(value) ? value : '';
  }

  function cleanFolder(value, now) {
    if (!isObject(value)) return null;
    const id = cleanId(value.id);
    if (!id) return null;
    const deletedAt = stamp(value.deletedAt, now);
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    if (!name && !deletedAt) return null;
    if (name.length > MAX_TITLE) return null;
    return {
      id,
      name,
      nameAt: stamp(value.nameAt, now),
      createdAt: stamp(value.createdAt, now),
      deletedAt
    };
  }

  function tagEvent(tag) {
    return Math.max(Number(tag.at) || 0, Number(tag.removedAt) || 0);
  }

  // The newer event wins for one tag. Equal stamps resolve toward the removal,
  // so an equally old copy cannot revive a tag the writer took away.
  function betterTag(prior, next) {
    if (!prior) return next;
    const a = tagEvent(prior);
    const b = tagEvent(next);
    if (a !== b) return b > a ? next : prior;
    if (next.removedAt && !prior.removedAt) return next;
    return prior;
  }

  function tagList(value, now) {
    const byKey = new Map();
    for (const raw of value) {
      if (!isObject(raw)) continue;
      const text = tagRules.normalizeTag(raw.text);
      if (!text || text.length > tagRules.MAX_TAG) continue;
      const key = tagRules.tagKey(text);
      const next = { text, at: stamp(raw.at, now), removedAt: stamp(raw.removedAt, now) };
      byKey.set(key, betterTag(byKey.get(key), next));
    }
    return [...byKey.values()].sort((a, b) => a.text.localeCompare(b.text));
  }

  // Reading never drops a live tag or a removal mark to fit the limit; the
  // limit is a rule for adding (see addTag).
  function cleanTags(value, now) {
    return Array.isArray(value) ? tagList(value, now) : [];
  }

  function cleanRecord(value, now) {
    if (!isObject(value)) return null;
    const id = cleanId(value.id);
    if (!id) return null;
    const deletedAt = stamp(value.deletedAt, now);
    const title = typeof value.title === 'string' ? value.title.trim() : '';
    const body = typeof value.body === 'string' ? value.body : '';
    if (!title && !deletedAt) return null;
    if (title.length > MAX_TITLE || body.length > MAX_BODY) return null;
    const folderId = value.folderId === null || value.folderId === undefined ? null : cleanId(value.folderId);
    const tags = cleanTags(value.tags, now);
    return {
      id,
      folderId: folderId || null,
      title,
      titleAt: stamp(value.titleAt, now),
      body,
      bodyAt: stamp(value.bodyAt, now),
      folderAt: stamp(value.folderAt, now),
      createdAt: stamp(value.createdAt, now),
      tags,
      deletedAt
    };
  }

  function sortStore(store) {
    store.folders.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
    store.records.sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
    return store;
  }

  function normalize(value, now = Date.now()) {
    if (!isObject(value) || value.format !== FORMAT) return { ok: false, reason: 'format' };
    const foldersIn = value.folders === undefined ? [] : value.folders;
    const recordsIn = value.records === undefined ? [] : value.records;
    if (!Array.isArray(foldersIn) || !Array.isArray(recordsIn)) return { ok: false, reason: 'shape' };
    if (foldersIn.length + recordsIn.length > MAX_ITEMS) return { ok: false, reason: 'count' };
    const folders = [];
    const records = [];
    for (const raw of foldersIn) {
      const folder = cleanFolder(raw, now);
      if (!folder) return { ok: false, reason: 'folder' };
      folders.push(folder);
    }
    for (const raw of recordsIn) {
      const record = cleanRecord(raw, now);
      if (!record) return { ok: false, reason: 'record' };
      records.push(record);
    }
    const active = new Set(folders.filter((f) => !f.deletedAt).map((f) => f.id));
    for (const record of records) if (record.folderId && !active.has(record.folderId)) record.folderId = null;
    return { ok: true, store: sortStore({ format: FORMAT, folders, records }) };
  }

  function newFolder(name, now = Date.now()) {
    return { id: cryptoId(), name: String(name || '').trim(), nameAt: now, createdAt: now, deletedAt: 0 };
  }

  function newRecord(title, folderId = null, now = Date.now(), tags = []) {
    return {
      id: cryptoId(),
      folderId: folderId || null,
      title: String(title || '').trim(),
      titleAt: now,
      body: '',
      bodyAt: now,
      folderAt: now,
      createdAt: now,
      tags: Array.isArray(tags) ? tags : [],
      deletedAt: 0
    };
  }

  function cryptoId() {
    try {
      if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* fall through */ }
    return 'r-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function newer(a, b, contentKey, stampKey) {
    return (Number(b[stampKey]) || 0) > (Number(a[stampKey]) || 0) ? b[contentKey] : a[contentKey];
  }

  function mergeFolder(a, b) {
    const deadA = Number(a.deletedAt) || 0;
    const deadB = Number(b.deletedAt) || 0;
    const deletedAt = Math.max(deadA, deadB);
    return {
      id: a.id,
      name: newer(a, b, 'name', 'nameAt'),
      nameAt: Math.max(Number(a.nameAt) || 0, Number(b.nameAt) || 0),
      createdAt: Math.min(Number(a.createdAt) || 0, Number(b.createdAt) || 0),
      deletedAt
    };
  }

  function mergeTags(a, b, now) {
    const kept = [...(a || []), ...(b || [])]
      .filter((raw) => raw && tagRules.normalizeTag(raw.text))
      .map((raw) => ({
        text: tagRules.normalizeTag(raw.text),
        at: Number(raw.at) || 0,
        removedAt: Number(raw.removedAt) || 0
      }));
    return tagList(kept, now);
  }

  function mergeRecord(a, b, now) {
    const deadA = Number(a.deletedAt) || 0;
    const deadB = Number(b.deletedAt) || 0;
    if (deadA || deadB) {
      return {
        id: a.id,
        folderId: newer(a, b, 'folderId', 'folderAt'),
        title: newer(a, b, 'title', 'titleAt'),
        titleAt: Math.max(Number(a.titleAt) || 0, Number(b.titleAt) || 0),
        body: newer(a, b, 'body', 'bodyAt'),
        bodyAt: Math.max(Number(a.bodyAt) || 0, Number(b.bodyAt) || 0),
        folderAt: Math.max(Number(a.folderAt) || 0, Number(b.folderAt) || 0),
        createdAt: Math.min(Number(a.createdAt) || 0, Number(b.createdAt) || 0),
        tags: mergeTags(a.tags, b.tags, now),
        deletedAt: Math.max(deadA, deadB)
      };
    }
    return {
      id: a.id,
      folderId: newer(a, b, 'folderId', 'folderAt'),
      title: newer(a, b, 'title', 'titleAt'),
      titleAt: Math.max(Number(a.titleAt) || 0, Number(b.titleAt) || 0),
      body: newer(a, b, 'body', 'bodyAt'),
      bodyAt: Math.max(Number(a.bodyAt) || 0, Number(b.bodyAt) || 0),
      folderAt: Math.max(Number(a.folderAt) || 0, Number(b.folderAt) || 0),
      createdAt: Math.min(Number(a.createdAt) || 0, Number(b.createdAt) || 0),
      tags: mergeTags(a.tags, b.tags, now),
      deletedAt: 0
    };
  }

  function merge(left, right, now = Date.now()) {
    const a = normalize(left, now);
    const b = normalize(right, now);
    if (!a.ok || !b.ok) return { ok: false, reason: !a.ok ? a.reason : b.reason };

    const folders = new Map();
    for (const folder of a.store.folders) folders.set(folder.id, folder);
    for (const folder of b.store.folders) {
      const prior = folders.get(folder.id);
      folders.set(folder.id, prior ? mergeFolder(prior, folder) : folder);
    }

    const records = new Map();
    for (const record of a.store.records) records.set(record.id, record);
    for (const record of b.store.records) {
      const prior = records.get(record.id);
      records.set(record.id, prior ? mergeRecord(prior, record, now) : record);
    }

    const active = new Set([...folders.values()].filter((f) => !f.deletedAt).map((f) => f.id));
    for (const record of records.values()) {
      if (record.folderId && !active.has(record.folderId)) record.folderId = null;
    }
    return { ok: true, store: sortStore({ format: FORMAT, folders: [...folders.values()], records: [...records.values()] }) };
  }

  function activeFolders(store) {
    return (store.folders || []).filter((f) => !f.deletedAt).sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  function activeRecords(store) {
    return (store.records || []).filter((r) => !r.deletedAt).sort((a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  }


  function activeTags(record) {
    return tagRules.activeTags(record);
  }

  function tagExists(store, text) {
    const key = tagRules.tagKey(text);
    if (!key) return false;
    return activeRecords(store).some((rec) => activeTags(rec).some((tag) => tagRules.tagKey(tag) === key));
  }

  function recordsWithTag(store, text) {
    const key = tagRules.tagKey(text);
    if (!key) return [];
    return activeRecords(store).filter((rec) => activeTags(rec).some((tag) => tagRules.tagKey(tag) === key));
  }

  // Every distinct active tag in the library, in the order the store lists its
  // records. Bounded by the paint bound so the eye and the matcher agree.
  function storeTags(store) {
    const seen = new Set();
    const out = [];
    for (const rec of activeRecords(store)) {
      for (const tag of activeTags(rec)) {
        const key = tagRules.tagKey(tag);
        if (!key || seen.has(key)) continue;
        if (out.length >= tagRules.MAX_MATCH_TAGS) return out;
        seen.add(key);
        out.push(tag);
      }
    }
    return out;
  }

  function addTag(store, id, text, now = Date.now()) {
    const record = findRecord(store, id);
    if (!record) return { ok: false, reason: 'missing' };
    const clean = tagRules.normalizeTag(text);
    if (!clean) return { ok: false, reason: 'tag' };
    if (clean.length > tagRules.MAX_TAG) return { ok: false, reason: 'long' };
    const key = tagRules.tagKey(clean);
    if (!Array.isArray(record.tags)) record.tags = [];
    const active = record.tags.filter((tag) => !tag.removedAt).length;
    const existing = record.tags.find((tag) => tagRules.tagKey(tag.text) === key);
    if (existing) {
      if (!existing.removedAt) return { ok: true, existing: true };
      if (active >= tagRules.MAX_TAGS) return { ok: false, reason: 'many' };
      existing.text = clean;
      existing.at = now;
      existing.removedAt = 0;
      return { ok: true };
    }
    if (active >= tagRules.MAX_TAGS) return { ok: false, reason: 'many' };
    record.tags.push({ text: clean, at: now, removedAt: 0 });
    record.tags.sort((a, b) => a.text.localeCompare(b.text));
    return { ok: true };
  }

  function removeTag(store, id, text, now = Date.now()) {
    const record = findRecord(store, id);
    if (!record) return { ok: false, reason: 'missing' };
    const key = tagRules.tagKey(text);
    if (!key) return { ok: false, reason: 'tag' };
    const tag = (record.tags || []).find((x) => !x.removedAt && tagRules.tagKey(x.text) === key);
    if (!tag) return { ok: false, reason: 'missing' };
    tag.removedAt = now;
    return { ok: true };
  }

  function findRecord(store, id) {
    return (store.records || []).find((r) => r.id === id && !r.deletedAt) || null;
  }

  function findFolder(store, id) {
    return (store.folders || []).find((f) => f.id === id && !f.deletedAt) || null;
  }

  function folderOf(store, record) {
    return record && record.folderId && findFolder(store, record.folderId) ? record.folderId : null;
  }

  function addRecord(store, title, folderId = null, now = Date.now(), tags = []) {
    const clean = String(title || '').trim();
    if (!clean) return { ok: false, reason: 'title' };
    if (clean.length > MAX_TITLE) return { ok: false, reason: 'title' };
    if (folderId && !findFolder(store, folderId)) folderId = null;
    const list = Array.isArray(tags) ? tags.map((tag) => (typeof tag === 'string' ? { text: tag, at: now, removedAt: 0 } : tag)) : [];
    const cleaned = cleanTags(list, now);
    if (list.length && !cleaned.length) return { ok: false, reason: 'tag' };
    if (cleaned.filter((tag) => !tag.removedAt).length > tagRules.MAX_TAGS) return { ok: false, reason: 'many' };
    const record = newRecord(clean, folderId, now, cleaned);
    store.records.push(record);
    sortStore(store);
    return { ok: true, record };
  }

  function deleteRecord(store, id, now = Date.now()) {
    const record = findRecord(store, id);
    if (!record) return { ok: false, reason: 'missing' };
    record.deletedAt = now;
    return { ok: true };
  }

  function renameRecord(store, id, title, now = Date.now()) {
    const record = findRecord(store, id);
    const clean = String(title || '').trim();
    if (!record) return { ok: false, reason: 'missing' };
    if (!clean || clean.length > MAX_TITLE) return { ok: false, reason: 'title' };
    record.title = clean;
    record.titleAt = now;
    sortStore(store);
    return { ok: true };
  }

  function setBody(store, id, body, now = Date.now()) {
    const record = findRecord(store, id);
    const text = String(body === undefined || body === null ? '' : body);
    if (!record) return { ok: false, reason: 'missing' };
    if (text.length > MAX_BODY) return { ok: false, reason: 'body' };
    record.body = text;
    record.bodyAt = now;
    return { ok: true };
  }

  function moveRecord(store, id, folderId, now = Date.now()) {
    const record = findRecord(store, id);
    if (!record) return { ok: false, reason: 'missing' };
    const target = folderId && findFolder(store, folderId) ? folderId : null;
    record.folderId = target;
    record.folderAt = now;
    return { ok: true };
  }

  function duplicateName(store, name, exceptId) {
    const clean = String(name || '').trim().toLocaleLowerCase();
    if (!clean || clean === 'unsorted') return true;
    return (store.folders || []).some((f) => !f.deletedAt && f.id !== exceptId && f.name.toLocaleLowerCase() === clean);
  }

  function addFolder(store, name, now = Date.now()) {
    const clean = String(name || '').trim();
    if (!clean || clean.length > MAX_TITLE || duplicateName(store, clean)) return { ok: false, reason: 'name' };
    const folder = newFolder(clean, now);
    store.folders.push(folder);
    sortStore(store);
    return { ok: true, folder };
  }

  function renameFolder(store, id, name, now = Date.now()) {
    const folder = findFolder(store, id);
    const clean = String(name || '').trim();
    if (!folder) return { ok: false, reason: 'missing' };
    if (!clean || clean.length > MAX_TITLE || duplicateName(store, clean, id)) return { ok: false, reason: 'name' };
    folder.name = clean;
    folder.nameAt = now;
    sortStore(store);
    return { ok: true };
  }

  function deleteFolder(store, id, now = Date.now()) {
    const folder = findFolder(store, id);
    if (!folder) return { ok: false, reason: 'missing' };
    folder.deletedAt = now;
    for (const record of store.records) {
      if (record.folderId === id) { record.folderId = null; record.folderAt = now; }
    }
    return { ok: true };
  }

  return {
    FORMAT, MAX_TITLE, MAX_BODY, MAX_FUTURE, MAX_ITEMS,
    empty, normalize, merge, newFolder, newRecord,
    activeFolders, activeRecords, activeTags, tagExists, recordsWithTag, storeTags, addTag, removeTag, findRecord, findFolder, folderOf,
    addRecord, deleteRecord, renameRecord, setBody, moveRecord,
    addFolder, renameFolder, deleteFolder,
    sortStore
  };
});
