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

  // The open book, its chapters, and their text. The page holds them in
  // memory; the fork only reads them.
  function bookId() {
    try { return typeof book !== 'undefined' && book && typeof book.id === 'string' ? book.id : ''; } catch { return ''; }
  }

  function currentChapter() {
    try { return typeof currentChapterId === 'string' ? currentChapterId : ''; } catch { return ''; }
  }

  function chapterOrder() {
    try { return typeof book !== 'undefined' && book && Array.isArray(book.chapterOrder) ? [...book.chapterOrder] : []; } catch { return []; }
  }

  function chapterTitle(id) {
    try {
      const titles = book && book.chapterTitles;
      return titles && typeof titles[id] === 'string' ? titles[id] : '';
    } catch { return ''; }
  }

  function chapterText(id) {
    try {
      if (typeof chapterHTML === 'undefined' || !chapterHTML || !Object.prototype.hasOwnProperty.call(chapterHTML, id)) {
        return { ok: false, text: '' };
      }
      return { ok: true, text: String(chapterHTML[id] || '') };
    } catch { return { ok: false, text: '' }; }
  }

  // The page's own pieces, so a feature never names a core selector itself.
  function chapterBody(id) {
    try { return document.querySelector(`.chapter[data-id="${CSS.escape(String(id || ''))}"] .chapter-body`); } catch { return null; }
  }

  function chaptersRoot() {
    try { return document.getElementById('chapters'); } catch { return null; }
  }

  function editorView() {
    try { return document.getElementById('editor-view'); } catch { return null; }
  }

  function paperScroll() {
    try { return document.getElementById('paper-scroll'); } catch { return null; }
  }

  function paragraphNodes(body) {
    try {
      if (!body) return [];
      return [...body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')];
    } catch { return []; }
  }

  function chapterNameOf(id) {
    try { return typeof chapterName === 'function' ? String(chapterName(id) || '') : ''; } catch { return ''; }
  }

  // Whether a phrase can still be put on screen, without moving the view.
  function phraseLocatable(spec) {
    try {
      if (!spec || !spec.quote) return false;
      const body = chapterBody(spec.chapterId);
      if (!body) return false;
      const needle = String(spec.quote).replace(/\s+/g, ' ').trim();
      if (!needle) return false;
      return paragraphNodes(body).some((paragraph) => rangeOf(paragraph, needle));
    } catch { return false; }
  }

  async function unreadChapters() {
    const orderList = chapterOrder();
    try {
      const native = window.NeoForkNative;
      const id = bookId();
      if (!native || typeof native.inventoryUnreadable !== 'function' || !id) return { ok: false, ids: orderList };
      const res = await native.inventoryUnreadable(id, orderList);
      if (!res || !res.ok || !Array.isArray(res.ids)) return { ok: false, ids: orderList };
      return { ok: true, ids: res.ids.filter((x) => typeof x === 'string') };
    } catch { return { ok: false, ids: orderList }; }
  }

  function sectionNotes() {
    try { return book && book.sectionNotes ? book.sectionNotes : {}; } catch { return {}; }
  }

  function sectionFor(body, paragraph) {
    try { if (typeof sectionOf === 'function') return sectionOf(body, paragraph); } catch { /* the page moved */ }
    return null;
  }

  // The words a loose or held card keeps. A card that holds a whole chapter or
  // scene carries its HTML; both count as "still in the book" for the ledger.
  function cardTexts() {
    const out = [];
    try {
      const held = book && book.looseCards;
      const cards = Array.isArray(held) ? held : held && typeof held === 'object' ? Object.values(held) : [];
      for (const card of cards) {
        if (!card) continue;
        if (typeof card.html === 'string' && card.html) out.push(htmlText(card.html));
        else if (typeof card.text === 'string' && card.text) out.push(card.text);
      }
    } catch { /* no cards */ }
    return out;
  }

  function htmlText(html) {
    try {
      const box = document.createElement('div');
      box.innerHTML = String(html || '');
      return box.textContent || '';
    } catch { return ''; }
  }

  // A book is open on the page. The pane asks before it shows a tag control.
  function hasBook() {
    try { return typeof book !== 'undefined' && !!book; } catch { return false; }
  }

  function isPocket() {
    try { return !!IS_POCKET; } catch { return false; }
  }

  function currentTabName() {
    try { return typeof currentTab === 'string' ? currentTab : ''; } catch { return ''; }
  }

  function onManuscriptTab() {
    try { return currentTab === 'manuscript'; } catch { return false; }
  }

  function pinSidePane() {
    try { if (typeof pinPane === 'function') pinPane('side', true); } catch { /* not settled */ }
  }

  function moreFeatures() {
    try { if (typeof moreOn === 'function') return !!moreOn(); } catch { /* fall through */ }
    return false;
  }

  // A tag chip asks for every mention in the manuscript: switch to the
  // manuscript and reuse the core Find bar rather than a second scanner.
  function openFind(query) {
    try {
      if (typeof book === 'undefined' || !book || typeof openSearch !== 'function') return false;
      if (typeof currentTab !== 'undefined' && currentTab !== 'manuscript' && typeof switchTab === 'function') switchTab('manuscript');
      openSearch();
      const input = document.querySelector('#search-input');
      if (!input) return false;
      input.value = String(query || '');
      if (typeof runSearch === 'function') runSearch();
      return true;
    } catch { return false; }
  }

  // One transaction's phrase, put on screen and selected. It moves the view and
  // the selection only: no chapter write, no undo entry.
  function revealPhrase(spec) {
    try {
      if (!spec || !spec.quote) return false;
      if (typeof currentTab !== 'undefined' && currentTab !== 'manuscript' && typeof switchTab === 'function') switchTab('manuscript');
      const chapter = document.querySelector(`.chapter[data-id="${CSS.escape(String(spec.chapterId || ''))}"]`);
      if (!chapter) return false;
      chapter.scrollIntoView({ block: 'start' });
      const body = chapter.querySelector('.chapter-body');
      if (!body) return false;
      const paragraphs = [...body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')];
      const needle = String(spec.quote).replace(/\s+/g, ' ').trim();
      const candidates = [];
      if (paragraphs[spec.paragraph]) candidates.push(paragraphs[spec.paragraph]);
      for (const paragraph of paragraphs) if (!candidates.includes(paragraph)) candidates.push(paragraph);
      for (const paragraph of candidates) {
        const range = rangeOf(paragraph, needle);
        if (!range) continue;
        body.focus({ preventScroll: true });
        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        range.startContainer.parentElement?.scrollIntoView({ behavior: 'auto', block: 'center' });
        return true;
      }
      return false;
    } catch { return false; }
  }

  // A phrase can be split by inline markup, so walk the text nodes and build
  // one range across them.
  function rangeOf(root, needle) {
    const nodes = [];
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let text = '';
    let node;
    while ((node = walker.nextNode())) {
      nodes.push({ node, start: text.length });
      text += node.data;
    }
    let at = text.indexOf(needle);
    let length = needle.length;
    if (at < 0) {
      const words = needle.split(' ').filter(Boolean).map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
      if (!words.length) return null;
      const match = new RegExp(words.join('\\s+')).exec(text);
      if (!match) return null;
      at = match.index;
      length = match[0].length;
    }
    const locate = (offset) => {
      for (const entry of nodes) {
        const end = entry.start + entry.node.data.length;
        if (offset >= entry.start && offset < end) return { node: entry.node, offset: offset - entry.start };
      }
      return null;
    };
    const start = locate(at);
    const end = locate(at + length - 1);
    if (!start || !end) return null;
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset + 1);
    return range;
  }

  // Seam 10: app.js's macOS Look Up popup asks the fork for its extra item and
  // for what to do when that item is chosen.
  function lookUpMenu(items, word) {
    try { if (window.NeoExt && typeof window.NeoExt.lookUpMenu === 'function') return window.NeoExt.lookUpMenu(items, word); } catch { /* no fork UI */ }
    return false;
  }

  function lookUpChoice(choice, word) {
    try { if (window.NeoExt && typeof window.NeoExt.lookUpChoice === 'function') window.NeoExt.lookUpChoice(choice, word); } catch { /* no fork UI */ }
  }

  // The dictionary's data probe. A bridge that is absent, refusing, or not yet
  // listening reads as "not available", so a right-click never waits on it.
  async function dictionaryStatus() {
    const away = { ok: true, available: false };
    try {
      const native = window.NeoForkNative;
      if (!native || typeof native.dictionaryStatus !== 'function') return away;
      const res = await native.dictionaryStatus();
      return res && typeof res === 'object' ? res : away;
    } catch { return away; }
  }

  window.NeoExtApi = { flushAndConfirm, pending, spellLanguage, hasBook, isPocket, currentTabName, onManuscriptTab, pinSidePane, bookId, currentChapter, chapterOrder, chapterTitle, chapterText, sectionNotes, sectionFor, cardTexts, revealPhrase, phraseLocatable, unreadChapters, chapterBody, chaptersRoot, editorView, paperScroll, paragraphNodes, chapterNameOf, moreFeatures, lookUpMenu, lookUpChoice, openFind, dictionaryStatus };
})();
