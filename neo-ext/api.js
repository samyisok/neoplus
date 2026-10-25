// NEO fork — the one adapter to core internals (adr-001)
//
// Everything here is a guarded read of bindings app.js declares globally. If
// upstream renames one, this file fails with a clear "not settled" answer
// instead of every feature breaking.

'use strict';

(function () {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function pending() {
    let waiting = false;
    try {
      if (typeof book !== 'undefined' && book && typeof chapterHTML !== 'undefined' && typeof savedHTML !== 'undefined') {
        for (const c of book.chapterOrder) {
          if (chapterHTML[c] !== undefined && chapterHTML[c] !== savedHTML[c]) { waiting = true; break; }
        }
      }
      if (!waiting && typeof sidecarPending !== 'undefined' && Object.keys(sidecarPending).length) waiting = true;
      if (!waiting && typeof auxPending !== 'undefined' && Object.keys(auxPending).length) waiting = true;
    } catch { /* a missing binding means nothing to wait for */ }
    return waiting;
  }

  // Save first, then confirm the disk caught up. A backup taken right after a
  // keystroke must hold that keystroke, not yesterday's paragraph.
  async function flushAndConfirm({ timeoutMs = 8000 } = {}) {
    try { if (typeof flushAllSaves === 'function') flushAllSaves(); } catch { /* see below */ }
    try {
      if (typeof chapterChain !== 'undefined') await Promise.allSettled(Object.values(chapterChain));
    } catch { /* a failed write is reported by NEO itself */ }
    const until = Date.now() + timeoutMs;
    while (pending()) {
      if (Date.now() > until) return false;
      await sleep(80);
    }
    return true;
  }

  // NEO's spellcheck language is library-wide (library.json), not per book.
  // Before the library loads, the interface locale is what NEO itself writes in.
  function spellLanguage() {
    try {
      const saved = typeof library !== 'undefined' && library && typeof library.spellLanguage === 'string'
        ? library.spellLanguage : '';
      if (saved) return saved;
      if (typeof NeoI18n !== 'undefined' && NeoI18n && typeof NeoI18n.getLocale === 'function') return NeoI18n.getLocale();
    } catch { /* not loaded yet */ }
    return '';
  }

  function moreFeatures() {
    try { if (typeof moreOn === 'function') return !!moreOn(); } catch { /* fall through */ }
    return false;
  }

  // Seam 10: app.js's macOS Look Up popup asks the fork for its extra item and
  // for what to do when that item is chosen.
  function lookUpMenu(items, word) {
    try { if (window.NeoExt && typeof window.NeoExt.lookUpMenu === 'function') return window.NeoExt.lookUpMenu(items, word); } catch { /* no fork UI */ }
    return false;
  }

  function lookUpChoice(word) {
    try { if (window.NeoExt && typeof window.NeoExt.lookUpChoice === 'function') window.NeoExt.lookUpChoice(word); } catch { /* no fork UI */ }
  }

  window.NeoExtApi = { flushAndConfirm, pending, spellLanguage, moreFeatures, lookUpMenu, lookUpChoice };
})();
