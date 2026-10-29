// NEO fork — the book's inventory ledger (adr-008)
//
// Pure: no DOM, no filesystem. Balances and logs are derived from the
// transactions, never stored as totals.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const ledger = require('../neo-ext/lib/inventory-ledger.js');

const at = 1_700_000_000_000;
const item = (id, name, extra = {}) => ({ id, name, category: 'Items', createdAt: at, ...extra });
const order = ['ch-1', 'ch-2', 'ch-3', 'ch-4'];
const storeOf = (...items) => ledger.normalize({ format: 1, items, transactions: [] }).store;

test('inventory-ledger: an empty ledger is valid', () => {
  assert.deepEqual(ledger.empty(), { format: 1, items: [], transactions: [] });
  const out = ledger.normalize(ledger.empty());
  assert.equal(out.ok, true);
  assert.deepEqual(out.store, ledger.empty());
});

test('inventory-ledger: malformed ledgers are refused', () => {
  for (const value of [null, undefined, {}, { format: 2 }, { format: 1, items: 'x' }, { format: 1, items: [], transactions: [{}] }]) {
    assert.equal(ledger.normalize(value).ok, false, JSON.stringify(value));
  }
});

test('inventory-ledger: amounts accept zero and negatives, reject NaN and huge values', () => {
  const s = storeOf(item('i1', 'gold coin'));
  assert.equal(ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 0 }, at).ok, true);
  assert.equal(ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: -50 }, at).ok, true);
  assert.equal(ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: NaN }, at).ok, false);
  assert.equal(ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 1e12 }, at).ok, false);
  assert.equal(ledger.addTransaction(s, { itemId: 'missing', chapterId: 'ch-1', amount: 1 }, at).ok, false);
});

test('inventory-ledger: balances count only the open chapter and the chapters before it', () => {
  const s = storeOf(item('i1', 'gold coin'), item('i2', 'Health Points'));
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 200, paragraph: 1 }, at);
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-3', amount: -25, paragraph: 1 }, at + 1);
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-4', amount: -50, paragraph: 1 }, at + 2);
  ledger.addTransaction(s, { itemId: 'i2', chapterId: 'ch-4', amount: 100, paragraph: 2 }, at + 3);
  assert.deepEqual(ledger.balances(s, order, 'ch-3'), [
    { itemId: 'i1', amount: 175 },
    { itemId: 'i2', amount: 0 }
  ]);
  assert.deepEqual(ledger.balances(s, order, 'ch-4').map((b) => b.amount).sort((a, b) => a - b), [100, 125]);
});

test('inventory-ledger: the whole book is the balance when no chapter is current', () => {
  const s = storeOf(item('i1', 'gold coin'));
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-4', amount: 50 }, at);
  assert.equal(ledger.balances(s, order, null)[0].amount, 50);
  assert.equal(ledger.balances(s, order, 'ch-1')[0].amount, 0);
});

test('inventory-ledger: a retired transaction stops counting everywhere', () => {
  const s = storeOf(item('i1', 'gold coin'));
  const added = ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 200 }, at);
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-4', amount: -50 }, at + 1);
  assert.equal(ledger.retireTransaction(s, added.transaction.id, at + 2).ok, true);
  assert.equal(ledger.balances(s, order, 'ch-4')[0].amount, -50);
  assert.equal(ledger.log(s, order, 'ch-4', 'i1').length, 1);
});

test('inventory-ledger: the log is in book order, then page order, and stops at the open chapter', () => {
  const s = storeOf(item('i1', 'gold coin'));
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-4', amount: -50, paragraph: 3 }, at + 3);
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 200, paragraph: 1 }, at + 1);
  ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 25, paragraph: 2 }, at + 2);
  const all = ledger.log(s, order, 'ch-4', 'i1');
  assert.deepEqual(all.map((e) => [e.chapterId, e.paragraph, e.amount]), [
    ['ch-1', 1, 200], ['ch-1', 2, 25], ['ch-4', 3, -50]
  ]);
  assert.deepEqual(ledger.log(s, order, 'ch-2', 'i1').map((e) => e.amount), [200, 25]);
});

test('inventory-ledger: a merge unions by id and never revives a retired transaction', () => {
  const a = storeOf(item('i1', 'gold coin'));
  ledger.addTransaction(a, { itemId: 'i1', chapterId: 'ch-1', amount: 200 }, at);
  const b = storeOf(item('i1', 'gold coin'), item('i2', 'Silver'));
  ledger.addTransaction(b, { itemId: 'i2', chapterId: 'ch-2', amount: 5 }, at + 1);
  const merged = ledger.merge(a, b, at + 2).store;
  assert.equal(ledger.balances(merged, order, 'ch-4').length, 2);
  const retired = JSON.parse(JSON.stringify(merged));
  const id = retired.transactions.find((x) => x.amount === 200).id;
  ledger.retireTransaction(retired, id, at + 5);
  const back = ledger.merge(retired, merged, at + 6).store;
  assert.equal(ledger.balances(back, order, 'ch-4').find((b2) => b2.itemId === 'i1').amount, 0);
});

test('inventory-ledger: items with the same name fold into one, and their transactions follow', () => {
  const a = storeOf(item('i1', 'gold coin'));
  const b = storeOf(item('i2', 'Gold Coin'));
  const t1 = ledger.addTransaction(a, { itemId: 'i1', chapterId: 'ch-1', amount: 10 }, at).transaction;
  const t2 = ledger.addTransaction(b, { itemId: 'i2', chapterId: 'ch-2', amount: 20 }, at + 1).transaction;
  const merged = ledger.merge(a, b, at + 2).store;
  assert.equal(ledger.activeItems(merged).length, 1);
  assert.deepEqual(merged.transactions.map((t) => t.itemId), [merged.transactions[0].itemId, merged.transactions[0].itemId]);
  assert.equal(ledger.balances(merged, order, 'ch-4')[0].amount, 30);
  assert.ok([t1.id, t2.id].every((id) => merged.transactions.some((t) => t.id === id)));
});

test('inventory-ledger: a new item reuses an existing name, ignoring case', () => {
  const s = storeOf(item('i1', 'Gold Coin'));
  const again = ledger.addItem(s, 'gold coin', 'Items', at + 1);
  assert.equal(again.ok, true);
  assert.equal(again.existing, true);
  assert.equal(again.item.id, 'i1');
  assert.equal(ledger.activeItems(s).length, 1);
});

test('inventory-ledger: the caps refuse rather than truncate', () => {
  const s = storeOf(item('i1', 'gold coin'));
  assert.equal(ledger.addItem(s, 'x'.repeat(201), 'Items', at).ok, false);
  assert.equal(ledger.addTransaction(s, { itemId: 'i1', chapterId: 'ch-1', amount: 1, quote: 'x'.repeat(121) }, at).ok, false);
  const many = storeOf(item('i2', 'silver'));
  for (let i = 0; i < 20; i++) ledger.addTransaction(many, { itemId: 'i2', chapterId: 'ch-1', amount: 1 }, at + i);
  assert.equal(ledger.addTransaction(many, { itemId: 'i2', chapterId: 'ch-1', amount: 1 }, at + 99, { maxTransactions: 20 }).ok, false);
});

test('inventory-ledger: a merge keeps the newer anchor, not the older text position', () => {
  const a = storeWithAnchor('ch-1', 2, at);
  const b = storeWithAnchor('ch-3', 5, at + 50);
  const merged = ledger.merge(a, b, at + 100).store;
  assert.equal(merged.transactions[0].chapterId, 'ch-3');
  assert.equal(merged.transactions[0].paragraph, 5);
});

function storeWithAnchor(chapterId, paragraph, t) {
  const s = ledger.normalize({ format: 1, items: [{ id: 'i1', name: 'gold coin', category: 'Items', createdAt: t }], transactions: [] }).store;
  ledger.addTransaction(s, { id: 'tx-1', itemId: 'i1', chapterId, paragraph, amount: 5, quote: 'a phrase', hash: 'aa' }, t);
  s.transactions[0].anchorAt = t;
  return s;
}

test('inventory-ledger: one bad transaction is dropped and the good ones stay', () => {
  const s = ledger.normalize({ format: 1, items: [{ id: 'i1', name: 'gold coin', category: 'Items', createdAt: at }], transactions: [
    { id: 'tx-1', itemId: 'i1', chapterId: 'ch-1', amount: 5, at },
    { id: 'tx-2', itemId: 'i1', chapterId: 'ch-1', amount: 'not a number', at }
  ] }).store;
  assert.equal(s.transactions.length, 1);
  assert.equal(s.transactions[0].id, 'tx-1');
});

test('inventory-ledger: one amount parser separates blank, not-a-number, and range', () => {
  assert.deepEqual(ledger.parseAmount('  '), { ok: false, reason: 'blank' });
  assert.deepEqual(ledger.parseAmount('abc'), { ok: false, reason: 'number' });
  assert.deepEqual(ledger.parseAmount('1e12'), { ok: false, reason: 'range' });
  assert.deepEqual(ledger.parseAmount('-50'), { ok: true, amount: -50 });
  assert.deepEqual(ledger.parseAmount('12,5'), { ok: true, amount: 12.5 });
});
