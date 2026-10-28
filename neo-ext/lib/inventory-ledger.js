// NEO fork — the book's inventory ledger (adr-008)
//
// Pure: no DOM, no filesystem. Items and transactions only; balances and logs
// are derived from chapter order, never stored, so two devices can merge
// without agreeing on a running total.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoInventoryLedger = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const FORMAT = 1;
  const MAX_ITEM_NAME = 200;
  const MAX_CATEGORY = 80;
  const MAX_QUOTE = 120;
  const MAX_ID = 80;
  const MAX_AMOUNT = 1e9;
  const MAX_ITEMS = 500;
  const MAX_TRANSACTIONS = 50000;
  const DEFAULT_CATEGORY = 'Items';

  function empty() {
    return { format: FORMAT, items: [], transactions: [] };
  }

  function isObject(v) {
    return !!v && typeof v === 'object' && !Array.isArray(v);
  }

  function cleanId(value) {
    return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID && !/\s/.test(value) ? value : '';
  }

  function cleanText(value, max) {
    return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }

  function cleanAmount(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || Math.abs(n) > MAX_AMOUNT) return null;
    return Math.round(n * 100) / 100;
  }

  function stamp(value, now) {
    const n = Number(value);
    if (!Number.isFinite(n) || n < 0) return 0;
    return Math.min(Math.floor(n), now + 60000);
  }

  function cryptoId() {
    try {
      if (typeof crypto !== 'undefined' && crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    } catch { /* fall through */ }
    return 'inv-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function cleanItem(value, now) {
    if (!isObject(value)) return null;
    const id = cleanId(value.id);
    const name = cleanText(value.name, MAX_ITEM_NAME);
    if (!id || !name) return null;
    return {
      id,
      name,
      nameAt: stamp(value.nameAt, now),
      category: cleanText(value.category, MAX_CATEGORY) || DEFAULT_CATEGORY,
      categoryAt: stamp(value.categoryAt, now),
      createdAt: stamp(value.createdAt, now),
      deletedAt: stamp(value.deletedAt, now)
    };
  }

  function cleanTransaction(value, now) {
    if (!isObject(value)) return null;
    const id = cleanId(value.id);
    const itemId = cleanId(value.itemId);
    const chapterId = cleanId(value.chapterId);
    const amount = cleanAmount(value.amount);
    if (!id || !itemId || !chapterId || amount === null) return null;
    const paragraph = Number(value.paragraph);
    return {
      id,
      itemId,
      chapterId,
      sectionId: typeof value.sectionId === 'string' ? value.sectionId.slice(0, MAX_ID) : '',
      paragraph: Number.isFinite(paragraph) && paragraph >= 0 ? Math.floor(paragraph) : 0,
      quote: cleanText(value.quote, MAX_QUOTE),
      hash: cleanText(value.hash, 32),
      amount,
      at: stamp(value.at, now),
      anchorAt: stamp(value.anchorAt === undefined ? value.at : value.anchorAt, now),
      removedAt: stamp(value.removedAt, now)
    };
  }

  function sortItems(items) {
    return items.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  }

  function normalize(value, now = Date.now()) {
    if (!isObject(value) || value.format !== FORMAT) return { ok: false, reason: 'format' };
    const itemsIn = value.items === undefined ? [] : value.items;
    const txIn = value.transactions === undefined ? [] : value.transactions;
    if (!Array.isArray(itemsIn) || !Array.isArray(txIn)) return { ok: false, reason: 'shape' };
    if (itemsIn.length > MAX_ITEMS || txIn.length > MAX_TRANSACTIONS) return { ok: false, reason: 'count' };
    const items = [];
    const itemIds = new Set();
    for (const raw of itemsIn) {
      const item = cleanItem(raw, now);
      // One unreadable item loses that item alone, never the book's ledger.
      if (!item || itemIds.has(item.id)) continue;
      itemIds.add(item.id);
      items.push(item);
    }
    const transactions = [];
    const txIds = new Set();
    for (const raw of txIn) {
      const transaction = cleanTransaction(raw, now);
      if (!transaction || txIds.has(transaction.id)) continue;
      if (!itemIds.has(transaction.itemId)) continue;
      txIds.add(transaction.id);
      transactions.push(transaction);
    }
    // One bad record is dropped; a file where nothing survives is unreadable,
    // not an empty ledger we could write over.
    if (itemsIn.length && !items.length) return { ok: false, reason: 'item' };
    if (txIn.length && !transactions.length) return { ok: false, reason: 'transaction' };
    return { ok: true, store: { format: FORMAT, items: sortItems(items), transactions } };
  }

  function activeItems(store) {
    return sortItems((store.items || []).filter((item) => !item.deletedAt));
  }

  function findItem(store, id) {
    return (store.items || []).find((item) => item.id === id && !item.deletedAt) || null;
  }

  function nameKey(name) {
    return cleanText(name, MAX_ITEM_NAME).toLocaleLowerCase();
  }

  function addItem(store, name, category, now = Date.now()) {
    const clean = cleanText(name, MAX_ITEM_NAME);
    if (!clean || String(name || '').trim().length > MAX_ITEM_NAME) return { ok: false, reason: 'name' };
    const key = nameKey(clean);
    const existing = (store.items || []).find((held) => !held.deletedAt && nameKey(held.name) === key);
    if (existing) return { ok: true, existing: true, item: existing };
    if ((store.items || []).filter((held) => !held.deletedAt).length >= MAX_ITEMS) return { ok: false, reason: 'many' };
    const item = cleanItem({ id: cryptoId(), name: clean, category, createdAt: now, nameAt: now, categoryAt: now, deletedAt: 0 }, now);
    if (!item) return { ok: false, reason: 'name' };
    store.items.push(item);
    sortItems(store.items);
    return { ok: true, item };
  }

  function addTransaction(store, input, now = Date.now(), options = {}) {
    if (!isObject(input)) return { ok: false, reason: 'transaction' };
    const item = findItem(store, cleanId(input.itemId));
    if (!item) return { ok: false, reason: 'item' };
    if (String(input.quote || '').replace(/\s+/g, ' ').trim().length > MAX_QUOTE) return { ok: false, reason: 'quote' };
    const limit = Number.isFinite(options.maxTransactions) ? options.maxTransactions : MAX_TRANSACTIONS;
    if ((store.transactions || []).length >= limit) return { ok: false, reason: 'many' };
    const transaction = cleanTransaction({
      id: cleanId(input.id) || cryptoId(),
      itemId: item.id,
      chapterId: input.chapterId,
      sectionId: input.sectionId,
      paragraph: input.paragraph,
      quote: input.quote,
      hash: input.hash,
      amount: input.amount,
      at: now,
      anchorAt: now,
      removedAt: 0
    }, now);
    if (!transaction) return { ok: false, reason: 'transaction' };
    store.transactions.push(transaction);
    return { ok: true, transaction };
  }

  function retireTransaction(store, id, now = Date.now()) {
    const transaction = (store.transactions || []).find((tx) => tx.id === id);
    if (!transaction) return { ok: false, reason: 'missing' };
    if (!transaction.removedAt) transaction.removedAt = now;
    return { ok: true };
  }

  function chapterIndex(order, chapterId) {
    return Array.isArray(order) ? order.indexOf(chapterId) : -1;
  }

  function upTo(transaction, order, chapterId) {
    if (!chapterId) return true;
    const here = chapterIndex(order, transaction.chapterId);
    const stop = chapterIndex(order, chapterId);
    if (here < 0 || stop < 0) return false;
    return here <= stop;
  }

  function activeTransactions(store) {
    return (store.transactions || []).filter((tx) => !tx.removedAt);
  }

  function balances(store, order, chapterId) {
    const sums = new Map(activeItems(store).map((item) => [item.id, 0]));
    for (const transaction of activeTransactions(store)) {
      if (!sums.has(transaction.itemId)) continue;
      if (!upTo(transaction, order, chapterId)) continue;
      sums.set(transaction.itemId, sums.get(transaction.itemId) + transaction.amount);
    }
    return activeItems(store).map((item) => ({ itemId: item.id, amount: Math.round((sums.get(item.id) || 0) * 100) / 100 }));
  }

  function log(store, order, chapterId, itemId) {
    const rows = (store.transactions || []).filter((transaction) => transaction.itemId === itemId && !transaction.removedAt && upTo(transaction, order, chapterId));
    return rows.sort((a, b) => {
      const ai = chapterIndex(order, a.chapterId);
      const bi = chapterIndex(order, b.chapterId);
      return ai - bi || a.paragraph - b.paragraph || a.at - b.at || a.id.localeCompare(b.id);
    });
  }

  function merge(left, right, now = Date.now()) {
    const a = normalize(left, now);
    const b = normalize(right, now);
    if (!a.ok || !b.ok) return { ok: false, reason: !a.ok ? a.reason : b.reason };

    const items = new Map();
    for (const item of a.store.items) items.set(item.id, item);
    for (const item of b.store.items) {
      const prior = items.get(item.id);
      if (!prior) { items.set(item.id, item); continue; }
      const newerName = (Number(item.nameAt) || 0) >= (Number(prior.nameAt) || 0) ? item.name : prior.name;
      const newerCategory = (Number(item.categoryAt) || 0) >= (Number(prior.categoryAt) || 0) ? item.category : prior.category;
      items.set(item.id, {
        ...prior,
        name: newerName,
        nameAt: Math.max(Number(prior.nameAt) || 0, Number(item.nameAt) || 0),
        category: newerCategory,
        categoryAt: Math.max(Number(prior.categoryAt) || 0, Number(item.categoryAt) || 0),
        createdAt: Math.min(Number(prior.createdAt) || 0, Number(item.createdAt) || 0),
        deletedAt: Math.max(Number(prior.deletedAt) || 0, Number(item.deletedAt) || 0)
      });
    }

    // Two devices can invent the same item name. One survives, and its id
    // replaces the other's so no transaction is orphaned.
    const byName = new Map();
    const remap = new Map();
    for (const item of [...items.values()].sort((x, y) => (x.createdAt - y.createdAt) || x.id.localeCompare(y.id))) {
      const key = nameKey(item.name);
      const survivor = key ? byName.get(key) : null;
      if (survivor && !item.deletedAt) { remap.set(item.id, survivor.id); items.delete(item.id); continue; }
      if (key && !survivor && !item.deletedAt) byName.set(key, item);
    }

    const transactions = new Map();
    for (const transaction of [...a.store.transactions, ...b.store.transactions]) {
      const itemId = remap.get(transaction.itemId) || transaction.itemId;
      const next = { ...transaction, itemId };
      const prior = transactions.get(next.id);
      if (!prior) { transactions.set(next.id, next); continue; }
      const newerAnchor = (Number(next.anchorAt) || 0) >= (Number(prior.anchorAt) || 0) ? next : prior;
      transactions.set(next.id, {
        ...prior,
        chapterId: newerAnchor.chapterId,
        sectionId: newerAnchor.sectionId,
        paragraph: newerAnchor.paragraph,
        quote: newerAnchor.quote,
        hash: newerAnchor.hash,
        anchorAt: Math.max(Number(prior.anchorAt) || 0, Number(next.anchorAt) || 0),
        removedAt: Math.max(Number(prior.removedAt) || 0, Number(next.removedAt) || 0)
      });
    }

    return { ok: true, store: { format: FORMAT, items: sortItems([...items.values()]), transactions: [...transactions.values()] } };
  }

  return {
    FORMAT, MAX_ITEM_NAME, MAX_CATEGORY, MAX_QUOTE, MAX_AMOUNT, MAX_ITEMS, MAX_TRANSACTIONS, DEFAULT_CATEGORY,
    empty, normalize, merge,
    activeItems, findItem, addItem, addTransaction, retireTransaction,
    balances, log, nameKey
  };
});
