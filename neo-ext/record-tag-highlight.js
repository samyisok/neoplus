// NEO fork — the status-bar eye and the tag tint (adr-007)
//
// The pane controller asks this module to keep the manuscript's tagged names
// tinted. Nothing here writes to the page or the book: ranges live in the CSS
// Highlight API, and the on/off choice stays on this device. A book-wide scan
// is expensive, so typing re-reads only the chapter that was typed in.

'use strict';

(function (root) {
  const KEY = 'neo-record-tag-highlight';
  const HIGHLIGHT = 'neo-record-tag';
  const CHAPTER_MS = 600;
  const BOOK_MS = 250;

  function create(opts) {
    const { x, api, model, tagRules, host } = opts;
    if (!api || !model || !tagRules) return null;

    let enabled = false;
    try { enabled = localStorage.getItem(KEY) === '1'; } catch { /* storage can be off */ }

    let bookTimer = 0;
    const chapterTimers = new WeakMap();
    let rangesByChapter = new Map();

    const scans = { book: 0, chapter: 0 };

    function eyeIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 20 20');
      svg.setAttribute('aria-hidden', 'true');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('d', 'M10 4c4.5 0 7.6 4.1 8.6 5.6.2.3.2.6 0 .9C17.6 12 14.5 16 10 16S2.4 12 1.4 10.5a.9.9 0 0 1 0-.9C2.4 8.1 5.5 4 10 4Zm0 2C6.9 6 4.4 8.7 3.4 10c1 1.3 3.5 4 6.6 4s5.6-2.7 6.6-4c-1-1.3-3.5-4-6.6-4Zm0 1.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z');
      svg.appendChild(path);
      return svg;
    }

    const eye = document.createElement('button');
    eye.className = 'neo-records-eye';
    eye.id = 'records-eye';
    eye.type = 'button';
    eye.hidden = true;
    eye.appendChild(eyeIcon());
    eye.setAttribute('aria-pressed', 'false');
    eye.setAttribute('aria-label', x('Highlight record names'));
    eye.title = x('Highlight record names');
    if (host) {
      const zoom = document.getElementById('zoom-control');
      host.insertBefore(eye, zoom || null);
    }

    function tags() {
      try { return model.storeTags ? model.storeTags(opts.store()) : []; } catch { return []; }
    }

    function allowed() {
      try { return !!(api.moreFeatures() && api.hasBook() && !api.isPocket()); } catch { return false; }
    }

    function clear() {
      rangesByChapter = new Map();
      if (window.CSS && CSS.highlights) CSS.highlights.delete(HIGHLIGHT);
    }

    function locate(rootNode, offset, end) {
      const walker = document.createTreeWalker(rootNode, NodeFilter.SHOW_TEXT);
      let at = 0;
      let node;
      while ((node = walker.nextNode())) {
        const len = node.data.length;
        if (end ? (offset > at && offset <= at + len) : (offset >= at && offset < at + len)) return { node, offset: offset - at };
        at += len;
      }
      return null;
    }

    function quoteRanges(block, matcher, out, limit = tagRules.MAX_RANGES) {
      const text = block.textContent;
      if (!text) return;
      for (const hit of matcher.ranges(text, limit - out.length)) {
        const start = locate(block, hit.start, false);
        const end = locate(block, hit.end, true);
        if (!start || !end) continue;
        try {
          const range = document.createRange();
          range.setStart(start.node, start.offset);
          range.setEnd(end.node, end.offset);
          out.push(range);
        } catch { /* a block changed under us */ }
        if (out.length >= limit) return;
      }
    }

    function scanBody(body, matcher, out, limit = tagRules.MAX_RANGES) {
      for (const block of body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')) {
        if (out.length >= limit) return;
        quoteRanges(block, matcher, out, limit);
      }
    }

    function paint() {
      if (!window.CSS || !CSS.highlights) return;
      const all = [];
      const bodies = new Map();
      for (const body of document.querySelectorAll('.chapter-body')) {
        const id = body.closest('.chapter')?.dataset.id || '';
        bodies.set(id, body.isConnected);
      }
      for (const [chapter, ranges] of rangesByChapter) {
        // A chapter the page replaced holds ranges on detached nodes; drop it
        // rather than hand them to the highlighter.
        if (bodies.has(chapter) && !bodies.get(chapter)) { rangesByChapter.delete(chapter); continue; }
        all.push(...ranges);
      }
      if (all.length) CSS.highlights.set(HIGHLIGHT, new Highlight(...all.slice(0, tagRules.MAX_RANGES)));
      else CSS.highlights.delete(HIGHLIGHT);
    }

    function matcherNow() {
      const list = tags();
      return list.length ? tagRules.buildMatcher(list) : null;
    }

    function scanBook() {
      bookTimer = 0;
      if (!enabled || !allowed()) { clear(); return; }
      const matcher = matcherNow();
      if (!matcher) { clear(); return; }
      scans.book += 1;
      rangesByChapter = new Map();
      const out = [];
      for (const body of document.querySelectorAll('.chapter-body')) {
        const chapter = body.closest('.chapter')?.dataset.id || '';
        const ranges = [];
        scanBody(body, matcher, ranges);
        if (ranges.length) rangesByChapter.set(chapter, ranges);
        for (const range of ranges) { out.push(range); if (out.length >= tagRules.MAX_RANGES) break; }
        if (out.length >= tagRules.MAX_RANGES) break;
      }
      paint();
      update();
    }

    function scanChapter(body) {
      chapterTimers.delete(body);
      if (!enabled || !allowed() || !body) { if (!enabled) clear(); return; }
      const matcher = matcherNow();
      if (!matcher) { clear(); return; }
      scans.chapter += 1;
      const chapter = body.closest('.chapter')?.dataset.id || '';
      // The cap is for the whole book, so this chapter gets what the others
      // have not already spent.
      let spent = 0;
      for (const [id, held] of rangesByChapter) if (id !== chapter) spent += held.length;
      const ranges = [];
      scanBody(body, matcher, ranges, Math.max(0, tagRules.MAX_RANGES - spent));
      if (ranges.length) rangesByChapter.set(chapter, ranges); else rangesByChapter.delete(chapter);
      paint();
    }

    function schedule(ms = BOOK_MS) {
      if (!enabled || !allowed()) { clear(); return; }
      if (bookTimer) clearTimeout(bookTimer);
      bookTimer = setTimeout(scanBook, ms);
    }

    function scheduleChapter(body, ms = CHAPTER_MS) {
      if (!enabled || !allowed() || !body) return;
      const held = chapterTimers.get(body);
      if (held) clearTimeout(held);
      chapterTimers.set(body, setTimeout(() => scanChapter(body), ms));
    }

    function update() {
      if (!eye) return;
      const show = allowed() && tags().length > 0;
      eye.hidden = !show;
      eye.setAttribute('aria-pressed', enabled && show ? 'true' : 'false');
      if (!show) clear();
    }

    function toggle() {
      enabled = !enabled;
      try { localStorage.setItem(KEY, enabled ? '1' : '0'); } catch { /* fine */ }
      eye.setAttribute('aria-pressed', enabled ? 'true' : 'false');
      if (enabled) schedule(0); else clear();
    }

    eye.addEventListener('click', toggle);

    // The page's editing surface is this module's to watch: a keystroke or a
    // new paragraph re-reads one chapter, a mounted or replaced chapter scans
    // the book, and a resize waits for the debounce.
    const chapters = document.getElementById('chapters');
    if (chapters) {
      chapters.addEventListener('input', (e) => {
        const body = e.target && e.target.closest && e.target.closest('.chapter-body');
        if (body) scheduleChapter(body);
      });
      new MutationObserver((records) => {
        for (const record of records) {
          const target = record.target;
          const body = target && target.nodeType === 1 ? target.closest('.chapter-body') : null;
          // A chapter changed under the reader (undo, a disk refresh, a card
          // move): re-read the chapters that changed, not the whole book.
          if (body) scheduleChapter(body, CHAPTER_MS);
          else if (record.type === 'childList') schedule();
        }
      }).observe(chapters, { childList: true, subtree: true });
    }
    window.addEventListener('resize', () => schedule());

    return {
      eye,
      enabled: () => enabled,
      toggle,
      update,
      schedule,
      scheduleChapter,
      scanChapter,
      clear,
      stats: () => ({ ...scans }),
      isOn: () => enabled && allowed() && tags().length > 0
    };
  }

  root.NeoRecordTagHighlight = { create, BOOK_MS, CHAPTER_MS };
})(typeof globalThis !== 'undefined' ? globalThis : this);
