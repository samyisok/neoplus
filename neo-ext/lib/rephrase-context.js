// NEO fork — what counts as a rephrase selection (adr-012)
//
// Pure: the rule the menu and the window share. The page hands in the text and
// whether both ends sit in one block; nothing here touches the DOM.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoRephraseContext = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const MAX_CHARS = 1200;
  const CONTEXT_CHARS = 700;

  function evaluate(input) {
    const text = input && typeof input.text === 'string' ? input.text : '';
    const out = { ok: true, text, reason: '' };
    if (!text.replace(/\s+/g, ' ').trim()) return { ...out, ok: false, reason: 'empty' };
    if (!input.sameBlock) return { ...out, ok: false, reason: 'block' };
    if (!input.inChapter) return { ...out, ok: false, reason: 'editor' };
    if (!input.moreFeatures) return { ...out, ok: false, reason: 'gate' };
    if (text.length > MAX_CHARS) return { ...out, ok: false, reason: 'long' };
    return out;
  }

  function takeBefore(blocks, index) {
    const texts = Array.isArray(blocks) ? blocks : [];
    for (let i = index - 1; i >= 0; i -= 1) {
      const text = typeof texts[i] === 'string' ? texts[i].replace(/\s+/g, ' ').trim() : '';
      if (text) return text.slice(-CONTEXT_CHARS);
    }
    return '';
  }

  function takeAfter(blocks, index) {
    const texts = Array.isArray(blocks) ? blocks : [];
    for (let i = index + 1; i < texts.length; i += 1) {
      const text = typeof texts[i] === 'string' ? texts[i].replace(/\s+/g, ' ').trim() : '';
      if (text) return text.slice(0, CONTEXT_CHARS);
    }
    return '';
  }

  return { MAX_CHARS, CONTEXT_CHARS, evaluate, takeBefore, takeAfter };
});
