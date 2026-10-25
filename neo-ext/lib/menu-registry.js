// NEO fork — the editor's right-click menu, one registry (adr-003)
//
// The dictionary and the thesaurus both add an item to the native context
// menu. This registry is the only place that knows their order and that asks
// each one whether it can answer: a feature whose data is missing contributes
// nothing, and a third lexical tool is a registration, not another branch.

'use strict';

function create() {
  const features = [];

  function register(feature) {
    if (!feature || typeof feature.menuItem !== 'function') return;
    features.push({
      id: String(feature.id || feature.action || features.length),
      order: Number(feature.order) || 0,
      menuItem: feature.menuItem
    });
    features.sort((a, b) => a.order - b.order);
  }

  // word in, menu descriptors out. A feature that throws or declines is simply
  // absent; it never takes the other feature's item down with it.
  function items(word) {
    const out = [];
    for (const feature of features) {
      let item = null;
      try { item = feature.menuItem(word); } catch { item = null; }
      if (!item) continue;
      out.push({ action: item.action || feature.id, label: item.label, word: item.word || word });
    }
    return out;
  }

  function clear() {
    features.length = 0;
  }

  function ids() {
    return features.map((feature) => feature.id);
  }

  return { register, items, clear, ids };
}

module.exports = { create };
