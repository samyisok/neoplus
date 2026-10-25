// NEO fork — Dictionary… in the editor (adr-003)
//
// Registers a Look Up item with the shared word context (which pulls this
// module by name), then shows the definitions the main process returns. It
// never asks for the range the word context holds — the word alone is all it
// reads — so there is nothing here that could edit the manuscript.

'use strict';

(function () {
  const context = window.NeoWordContext;
  if (!context) return;

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
  let dataStatus = { available: false };
  let asked = false;

  function report(err) {
    try { if (window.neo && window.neo.logError) window.neo.logError('dictionary: ' + ((err && err.message) || err)); } catch { /* logging is a nicety */ }
  }

  function toast(message) {
    try { if (window.NeoExt && window.NeoExt.toast) return window.NeoExt.toast(message); } catch { /* no toast available */ }
    return null;
  }

  function askStatus() {
    if (asked) return;
    asked = true;
    try {
      const api = window.NeoExtApi;
      const answer = api && typeof api.dictionaryStatus === 'function'
        ? api.dictionaryStatus()
        : (bridge() && bridge().dictionaryStatus ? bridge().dictionaryStatus() : null);
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

  // The shared Look Up popup asks each feature for its item; this one needs no
  // range, only the word.
  function lookUpItem() {
    if (!available()) return null;
    return { label: x('Dictionary…'), value: 'dictionary' };
  }

  function openWord(word) {
    if (!word) return;
    if (window.NeoDictionaryWindow && NeoDictionaryWindow.otherModalOpen()) {
      toast(x('Close the other window first'));
      return;
    }
    // the word was only ever borrowed: nothing here needs its range, only the
    // editor it came from, so closing the window puts the caret back there
    const editor = context.editor();
    context.clear();
    const api = bridge();
    if (!api || typeof api.dictionary !== 'function') {
      toast(x('Dictionary is not available in this build'));
      return;
    }
    let pending = null;
    try { pending = api.dictionary(word); } catch (err) {
      report(err);
      toast(x('Dictionary is not available'));
      return;
    }
    if (!pending || typeof pending.then !== 'function') {
      toast(x('Dictionary is not available'));
      return;
    }
    pending.then((res) => {
      if (!res || !res.ok) {
        toast(res && res.reason === 'unavailable'
          ? x('Dictionary data is missing')
          : x('No definition for “{word}”', { word }));
        return;
      }
      if (!window.NeoDictionaryWindow) return;
      const opened = window.NeoDictionaryWindow.open({
        word: res.word,
        groups: res.groups,
        count: res.count,
        editor
      });
      if (!opened) toast(x('Could not open the dictionary'));
    }).catch((err) => {
      report(err);
      toast(x('Dictionary is not available'));
    });
  }

  askStatus();

  window.NeoDictionary = { openWord, lookUpItem, lookUpChoice: openWord };
})();
