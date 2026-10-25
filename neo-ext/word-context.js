// NEO fork — one word context for both lexical features (adr-003)
//
// Resolves the word under a right-click, remembers its range for the feature
// that will act on it, and hands the word to the native menu before it is
// built. The thesaurus replaces that range; the dictionary only reads its
// word. Neither adds a listener of its own.
//
// The gate here is generic (editable editor, Show More Features, English, one
// word). Whether a feature has its data is each feature's own question, so a
// missing thesaurus does not hide the dictionary.

'use strict';

(function () {
  const forms = window.NeoWordForms || null;
  if (!forms) return;

  const EDITOR = '.chapter-body, #aux-editor, .fn-text';
  const MAX_WORD = forms.MAX_WORD || 120;

  const bridge = () => window.NeoForkNative || null;

  let pending = null;
  let stored = false;

  function storeWord(word) {
    const api = bridge();
    if (!api || typeof api.setContextWord !== 'function') return;
    stored = true;
    api.setContextWord(word);
  }

  // Clearing is the common case (every right-click that is not on a word), so
  // it uses the fire-and-forget channel: a synchronous IPC on the shelf would
  // block the page on whatever the main process is writing.
  function clearWord() {
    const api = bridge();
    if (!api) return;
    if (!stored && typeof api.clearContextWord === 'function') return;
    stored = false;
    if (typeof api.clearContextWord === 'function') api.clearContextWord();
    else if (typeof api.setContextWord === 'function') api.setContextWord('');
  }

  function languageIsEnglish() {
    const api = window.NeoExtApi;
    const code = api && typeof api.spellLanguage === 'function' ? api.spellLanguage() : '';
    return /^en(-|$)/i.test(code);
  }

  function menuAllowed() {
    const api = window.NeoExtApi;
    if (!api || typeof api.moreFeatures !== 'function' || !api.moreFeatures()) return false;
    return languageIsEnglish();
  }

  function pointRange(x0, y0) {
    try {
      if (document.caretRangeFromPoint) return document.caretRangeFromPoint(x0, y0);
      if (document.caretPositionFromPoint) {
        const pos = document.caretPositionFromPoint(x0, y0);
        if (!pos) return null;
        const range = document.createRange();
        range.setStart(pos.offsetNode, pos.offset);
        range.collapse(true);
        return range;
      }
    } catch { /* outside the page */ }
    return null;
  }

  // A selection of one word wins. Two or more words suppress the features: the
  // writer asked about a word, not a phrase, and replacing a phrase would
  // surprise them.
  function resolveWord(event) {
    const selection = window.getSelection();
    const before = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    let chosen = '';
    if (selection && selection.rangeCount && !selection.isCollapsed) chosen = selection.toString().trim();
    if (chosen && /\s/.test(chosen)) return null;

    let node = null;
    let bounds = null;
    const at = pointRange(event.clientX, event.clientY);
    if (at && at.startContainer && at.startContainer.nodeType === Node.TEXT_NODE) {
      node = at.startContainer;
      bounds = forms.wordBounds(node.data, at.startOffset);
    }

    if (chosen) {
      const range = selection.getRangeAt(0);
      if (range.startContainer.nodeType === Node.TEXT_NODE && range.endContainer === range.startContainer) {
        const own = forms.wordBounds(range.startContainer.data, range.startOffset);
        if (!own || forms.normalize(own.word) !== forms.normalize(chosen)) return null;
        node = range.startContainer;
        bounds = own;
      } else if (!bounds || forms.normalize(bounds.word) !== forms.normalize(chosen)) {
        return null;
      }
    }

    if (!node || !bounds) return null;
    const range = document.createRange();
    range.setStart(node, bounds.start);
    range.setEnd(node, bounds.end);
    return { word: bounds.word, range, before, selected: !!chosen };
  }

  function onContextMenu(event) {
    try {
      pending = null;
      const api = bridge();
      if (!api || typeof api.setContextWord !== 'function') return;
      const editor = event.target && event.target.closest && event.target.closest(EDITOR);
      if (!editor || !editor.isContentEditable || !menuAllowed()) {
        clearWord();
        return;
      }
      const found = resolveWord(event);
      if (!found || found.word.length > MAX_WORD) {
        clearWord();
        return;
      }
      pending = found;
      storeWord(found.word);
    } catch { /* a right-click must never throw */ }
  }

  // What the feature that owns the menu item reads. The range stays here: a
  // dictionary that never receives it cannot replace anything by accident.
  function current() {
    return pending;
  }

  function matches(word) {
    return !!pending && forms.normalize(pending.word) === forms.normalize(word);
  }

  // The element the word was found in. The dictionary gets this and nothing
  // else, so it can put the writer back where they were without ever holding
  // the range that a replacement would need.
  function editor() {
    try {
      const held = pending;
      return held && held.range && held.range.startContainer && held.range.startContainer.parentElement
        ? held.range.startContainer.parentElement.closest(EDITOR)
        : null;
    } catch { return null; }
  }

  // Spends the context: the native menu, or the Look Up popup, takes over.
  function clear() {
    pending = null;
    clearWord();
  }

  // The macOS Look Up popup is the other place the same word is offered. Each
  // lexical feature contributes its own item; the context is spent once, after
  // both have had their look at it.
  function features() {
    return [window.NeoDictionary, window.NeoThesaurus].filter((feature) => feature && typeof feature.lookUpItem === 'function');
  }

  function lookUpMenu(items, word) {
    if (!Array.isArray(items) || !matches(word)) return false;
    const offered = [];
    for (const feature of features()) {
      let item = null;
      try { item = feature.lookUpItem(word); } catch { item = null; }
      if (item) offered.push(item);
    }
    clear();
    if (!offered.length) return false;
    items.push(...offered);
    return true;
  }

  // The popup reports which item was chosen; only that feature opens. Opening
  // both would put one window on top of the other and, for the thesaurus,
  // replace a word the writer never asked about.
  function lookUpChoice(choice, word) {
    const feature = choice === 'dictionary' ? window.NeoDictionary
      : choice === 'thesaurus' ? window.NeoThesaurus
        : null;
    try { if (feature && typeof feature.lookUpChoice === 'function') feature.lookUpChoice(word); } catch { /* the page moved on */ }
  }

  document.addEventListener('contextmenu', onContextMenu, true);

  window.NeoWordContext = { current, matches, editor, clear, lookUpMenu, lookUpChoice, EDITOR, MAX_WORD };
})();
