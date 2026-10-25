// NEO fork — Thesaurus… in the editor (adr-002, one shared word context in adr-003)
//
// Reads the word the shared context resolved, hands its own menu item to the
// native menu, and replaces the word when the synonym window returns a choice.
// The window itself is neo-ext/thesaurus-window.js; the rules are in
// neo-ext/lib/thesaurus-lookup.js; the word and its range are in
// neo-ext/word-context.js.

'use strict';

(function () {
  const rules = window.NeoThesaurusRules;
  const context = window.NeoWordContext;
  if (!rules || !context) return;

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

  function report(err) {
    try { if (window.neo && window.neo.logError) window.neo.logError('thesaurus: ' + ((err && err.message) || err)); } catch { /* logging is a nicety */ }
  }

  // The entry this feature is acting on. The shared context spends its word
  // when the window opens, so the range lives here until the choice is made.
  let active = null;
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

  function available() {
    return !!(dataStatus && dataStatus.available);
  }

  function editorFor(range) {
    try {
      return range && range.startContainer && range.startContainer.parentElement
        ? range.startContainer.parentElement.closest(context.EDITOR)
        : null;
    } catch { return null; }
  }

  function spend() {
    active = null;
    context.clear();
  }

  function restore(entry) {
    spend();
    const range = entry && entry.range;
    if (!range) return;
    try {
      if (!document.contains(range.startContainer)) return;
      const editor = editorFor(range);
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
    spend();
    const range = entry.range;
    let alive = false;
    try {
      alive = !!range && document.contains(range.startContainer) && range.toString() === entry.word;
    } catch { alive = false; }
    if (!alive) {
      try {
        if (range && document.contains(range.startContainer)) {
          const lost = editorFor(range);
          if (lost && lost.focus) lost.focus({ preventScroll: true });
        }
      } catch { /* the page moved on */ }
      toast(x('That word moved. Nothing was changed.'));
      return;
    }

    try {
      const editor = editorFor(range);
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
    // The live context always wins: a Look Up popup the writer dismissed leaves
    // its entry behind, and that entry may be the same word in another chapter.
    // The stash is only the popup's own path, where the context was spent.
    let entry = null;
    if (context.matches(word)) entry = context.current();
    else if (active && rules.normalize(active.word) === rules.normalize(word)) entry = active;
    active = null;
    context.clear();
    if (!entry) return;
    if (!entry) return;
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

  // What the shared Look Up popup asks for. The range is kept here: the popup
  // takes over from the native menu and the shared context spends its word
  // once both features have offered theirs.
  function lookUpItem() {
    if (!available()) return null;
    active = context.current();
    return { label: x('Thesaurus…'), value: 'thesaurus' };
  }

  askStatus();

  window.NeoThesaurus = { openWord, lookUpItem, lookUpChoice: openWord };
})();
