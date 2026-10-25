// NEO fork — Thesaurus… in the editor (adr-002)
//
// Resolves the word under a right-click, hands it to the native menu before it
// is built, and replaces the word when the synonym window returns a choice.
// The window itself is neo-ext/thesaurus-window.js; the rules are in
// neo-ext/lib/thesaurus-lookup.js.

'use strict';

(function () {
  const rules = window.NeoThesaurusRules;
  if (!rules) return;

  const x = (s, vars) => {
    const dict = (typeof window !== 'undefined' && window.NeoExtLocale) || {};
    const text = typeof dict[s] === 'string' ? dict[s] : s;
    if (text !== s) {
      return vars ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
    }
    if (typeof t === 'function') {
      try { return t(s, vars); } catch { /* English below */ }
    }
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };

  const bridge = () => window.NeoForkNative || null;
  const MAX_WORD = rules.MAX_WORD || 120;
  const EDITOR = '.chapter-body, #aux-editor, .fn-text';

  function report(err) {
    try { if (window.neo && window.neo.logError) window.neo.logError('thesaurus: ' + ((err && err.message) || err)); } catch { /* logging is a nicety */ }
  }

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
  let dataStatus = { available: false };
  let asked = false;

  function toast(message) {
    try { if (window.NeoExt && window.NeoExt.toast) return window.NeoExt.toast(message); } catch { /* no toast available */ }
    return null;
  }

  function askStatus() {
    if (asked) return;
    asked = true;
    try {
      const answer = bridge() && bridge().thesaurusStatus ? bridge().thesaurusStatus() : null;
      if (answer && answer.then) {
        answer.then((res) => { dataStatus = res || { available: false }; }).catch((err) => {
          report(err);
          dataStatus = { available: false };
        });
      }
    } catch (err) { report(err); }
  }

  function languageIsEnglish() {
    const api = window.NeoExtApi;
    const code = api && typeof api.spellLanguage === 'function' ? api.spellLanguage() : '';
    return /^en(-|$)/i.test(code);
  }

  function menuAllowed() {
    const api = window.NeoExtApi;
    if (!api || typeof api.moreFeatures !== 'function' || !api.moreFeatures()) return false;
    if (!languageIsEnglish()) return false;
    return !!(dataStatus && dataStatus.available);
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

  // A selection of one word wins. Two or more words suppress the feature: the
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
      bounds = rules.wordBounds(node.data, at.startOffset);
    }

    if (chosen) {
      const range = selection.getRangeAt(0);
      if (range.startContainer.nodeType === Node.TEXT_NODE && range.endContainer === range.startContainer) {
        const own = rules.wordBounds(range.startContainer.data, range.startOffset);
        if (!own || rules.normalize(own.word) !== rules.normalize(chosen)) return null;
        node = range.startContainer;
        bounds = own;
      } else if (!bounds || rules.normalize(bounds.word) !== rules.normalize(chosen)) {
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

  function restore(entry) {
    pending = null;
    const range = entry && entry.range;
    if (!range) return;
    try {
      if (!document.contains(range.startContainer)) return;
      const editor = range.startContainer.parentElement
        && range.startContainer.parentElement.closest(EDITOR);
      if (editor && editor.focus) editor.focus({ preventScroll: true });
      let target = range;
      if (entry.before && document.contains(entry.before.startContainer)) target = entry.before;
      else if (!entry.selected) range.collapse(false);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(target);
    } catch (err) { report(err); }
  }

  function replace(entry, synonym) {
    pending = null;
    const range = entry.range;
    let alive = false;
    try {
      alive = !!range && document.contains(range.startContainer) && range.toString() === entry.word;
    } catch { alive = false; }
    if (!alive) {
      try {
        if (range && document.contains(range.startContainer)) {
          const lost = range.startContainer.parentElement && range.startContainer.parentElement.closest(EDITOR);
          if (lost && lost.focus) lost.focus({ preventScroll: true });
        }
      } catch { /* the page moved on */ }
      toast(x('That word moved. Nothing was changed.'));
      return;
    }

    try {
      const editor = range.startContainer.parentElement
        && range.startContainer.parentElement.closest(EDITOR);
      if (editor && editor.focus) editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);

      const text = rules.smartApostrophes(rules.applyCase(synonym, entry.word));
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, text); } catch { inserted = false; }
      if (!inserted) {
        // Never write the DOM by hand: NEO saves, counts, and seals undo on
        // `input`, so a silent mutation would show a word disk never got.
        if (editor && editor.focus) editor.focus({ preventScroll: true });
        toast(x('That word could not be replaced.'));
      }
    } catch (err) {
      report(err);
      toast(x('That word could not be replaced.'));
    }
  }

  function openWord(word) {
    if (!pending || rules.normalize(pending.word) !== rules.normalize(word)) return;
    const entry = pending;
    if (window.NeoThesaurusWindow && NeoThesaurusWindow.otherModalOpen()) {
      toast(x('Close the other window first'));
      return;
    }
    const api = bridge();
    if (!api || typeof api.thesaurus !== 'function') {
      toast(x('Thesaurus is not available in this build'));
      return;
    }
    api.thesaurus(entry.word).then((res) => {
      if (!res || !res.ok) {
        pending = null;
        toast(res && res.reason === 'unavailable'
          ? x('Thesaurus data is missing')
          : x('No synonyms for “{word}”', { word: entry.word }));
        return;
      }
      if (!window.NeoThesaurusWindow) return;
      const opened = window.NeoThesaurusWindow.open({
        word: res.word,
        groups: res.groups,
        onPick: (synonym) => replace(entry, synonym),
        onCancel: () => restore(entry)
      });
      if (!opened) toast(x('Could not open the thesaurus'));
    }).catch((err) => {
      report(err);
      toast(x('Thesaurus is not available'));
    });
  }

  function lookUpMenu(items, word) {
    if (!Array.isArray(items)) return false;
    if (!pending || rules.normalize(pending.word) !== rules.normalize(word)) return false;
    // the popup takes over from the native menu, so the stored word is spent
    clearWord();
    if (!menuAllowed()) return false;
    items.push({ label: x('Thesaurus…'), value: 'thesaurus' });
    return true;
  }

  askStatus();
  document.addEventListener('contextmenu', onContextMenu, true);

  window.NeoThesaurus = { openWord, lookUpMenu, lookUpChoice: openWord };
})();
