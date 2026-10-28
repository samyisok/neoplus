// NEO fork — keeping a transaction with its words (adr-008)
//
// Pure: the reconciler reads paragraph text and section claiming, and decides
// keep / follow / retire. It never touches the page.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const anchor = require('../neo-ext/lib/inventory-anchor.js');
const ledger = require('../neo-ext/lib/inventory-ledger.js');

const at = 1_700_000_000_000;
const storeWith = (tx) => {
  const s = ledger.normalize({ format: 1, items: [{ id: 'i1', name: 'gold coin', category: 'Items', createdAt: at }], transactions: [] }).store;
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 200, quote: 'saw 200 gold coins', ...tx }, at);
  return s;
};
const tx = (s) => s.transactions[0];
const chapter = (id, paragraphs, sections = []) => ({ id, paragraphs, sections });
const bookOf = (chapters, extra = {}) => ({ chapters, cards: [], unknown: [], ...extra });

test('inventory-anchor: an unchanged section validates by its hash', () => {
  const s = storeWith({ sectionId: 'sec-1', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([chapter('ch-1', ['I saw 200 gold coins.'], [{ id: 'sec-1', paragraphs: [0] }])]), at + 1);
  assert.equal(out.changed, false);
  assert.equal(tx(out.store).removedAt, 0);
});

test('inventory-anchor: an edit elsewhere in the section keeps the transaction', () => {
  const s = storeWith({ sectionId: 'sec-1', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([chapter('ch-1', ['A new first line.', 'I saw 200 gold coins.'], [{ id: 'sec-1', paragraphs: [1] }])]), at + 1);
  assert.equal(out.store.transactions[0].removedAt, 0);
  assert.equal(out.store.transactions[0].paragraph, 1);
});

test('inventory-anchor: a moved section is followed to its new chapter', () => {
  const s = storeWith({ sectionId: 'sec-1', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([
    chapter('ch-1', ['Something else.']),
    chapter('ch-2', ['I saw 200 gold coins.'], [{ id: 'sec-1', paragraphs: [0] }])
  ]), at + 1);
  assert.equal(out.changed, true);
  assert.equal(out.store.transactions[0].chapterId, 'ch-2');
  assert.equal(out.store.transactions[0].removedAt, 0);
});

test('inventory-anchor: a joined chapter keeps a transaction whose phrase survives', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([
    chapter('ch-2', ['New words.', 'I saw 200 gold coins.'])
  ]), at + 1);
  assert.equal(out.store.transactions[0].removedAt, 0);
  assert.equal(out.store.transactions[0].chapterId, 'ch-2');
});

test('inventory-anchor: a phrase gone from the whole book retires the transaction', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([chapter('ch-1', ['Nothing here.'])]), at + 1);
  assert.equal(out.changed, true);
  assert.ok(out.store.transactions[0].removedAt > 0);
});

test('inventory-anchor: a phrase held by a loose card is not retired', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([chapter('ch-1', ['Nothing here.'])], { cards: ['I saw 200 gold coins.'] }), at + 1);
  assert.equal(out.store.transactions[0].removedAt, 0);
});

test('inventory-anchor: an ambiguous phrase elsewhere keeps the anchor rather than guessing', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([
    chapter('ch-1', ['Nothing here.']),
    chapter('ch-2', ['I saw 200 gold coins.']),
    chapter('ch-3', ['I saw 200 gold coins.'])
  ]), at + 1);
  assert.equal(out.store.transactions[0].removedAt, 0);
  assert.equal(out.store.transactions[0].chapterId, 'ch-1');
});

test('inventory-anchor: a section-less paragraph is tracked by its quote', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const kept = anchor.reconcile(s, bookOf([chapter('ch-1', ['A line above.', 'I saw 200 gold coins.'])]), at + 1);
  assert.equal(kept.store.transactions[0].removedAt, 0);
  assert.equal(kept.store.transactions[0].paragraph, 1);
});

test('inventory-anchor: an unreadable chapter defers its transactions', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([chapter('ch-1', [''])] , { unknown: ['ch-1'] }), at + 1);
  assert.equal(out.store.transactions[0].removedAt, 0);
  assert.equal(out.changed, false);
});

test('inventory-anchor: a clean reconcile reports no change', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([chapter('ch-1', ['I saw 200 gold coins.'])]), at + 1);
  assert.equal(out.changed, false);
  assert.equal(out.store.transactions[0].paragraph, 0);
});

test('inventory-anchor: one unreadable chapter defers every transaction', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([
    chapter('ch-1', ['Nothing here.']),
    chapter('ch-2', ['I saw 200 gold coins.'])
  ], { unknown: ['ch-9'] }), at + 1);
  assert.equal(out.changed, false);
  assert.equal(out.store.transactions[0].removedAt, 0);
});

test('inventory-anchor: a chapter removed from the book retires its phrase', () => {
  const s = storeWith({ sectionId: '', hash: anchor.hashText('I saw 200 gold coins.') });
  const out = anchor.reconcile(s, bookOf([chapter('ch-2', ['Elsewhere.'])]), at + 1);
  assert.ok(out.store.transactions[0].removedAt > 0);
});
