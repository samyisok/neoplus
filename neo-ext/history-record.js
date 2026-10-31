// NEO fork — recording a replacement in the book's history (adr-014)
//
// One recorder for every tool that replaces the writer's text. It owns the
// guard and the chapter snapshot; the view owns display. A failed record is
// visible in the view and silent over the manuscript.

'use strict';

(function () {
  const api = window.NeoExtApi;
  if (!api) return;

  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);
  const TOOL = /^[a-z][a-z0-9-]{0,39}$/;
  const EMPTY_CHAPTER = { chapterId: '', chapterNumber: 0, chapterTitle: '' };

  function view() {
    try { return window.NeoHistoryView && typeof window.NeoHistoryView === 'object' ? window.NeoHistoryView : null; } catch { return null; }
  }

  function status(text, kind) {
    const target = view();
    if (!target || typeof target.status !== 'function') return;
    try { target.status(text, kind || ''); } catch { /* display is a nicety */ }
  }

  function refresh() {
    const target = view();
    if (!target || typeof target.refresh !== 'function') return;
    try { target.refresh(); } catch { /* display is a nicety */ }
  }

  function logError(message) {
    try {
      if (window.neo && typeof window.neo.logError === 'function') window.neo.logError(message);
    } catch { /* logging is a nicety */ }
  }

  // The handler answers with a fixed reason; a rejected invoke can carry a
  // message with a path in it, so only a known reason is ever written down.
  const REASONS = new Set(['large', 'unreadable', 'cloud', 'path', 'read', 'invalid', 'write']);

  function logFailure(reason) {
    logError('history: ' + (REASONS.has(reason) ? reason : 'write failed'));
  }

  function failText(reason) {
    if (reason === 'large') return x('The newest replacement could not be recorded: the history is full.');
    if (reason === 'unreadable') return x('The newest replacement could not be recorded: the history could not be read.');
    if (reason === 'cloud') return x('The newest replacement could not be recorded: the history is in iCloud.');
    return x('The newest replacement could not be recorded.');
  }

  async function record(spec) {
    try {
      if (!spec || typeof spec.tool !== 'string' || !TOOL.test(spec.tool)) return false;
      if (!api.moreFeatures()) return false;
      const bookId = api.bookId();
      if (!bookId) return false;
      const native = window.NeoForkNative;
      if (!native || typeof native.historyAdd !== 'function') return false;
      const from = typeof spec.from === 'string' ? spec.from : '';
      const to = typeof spec.to === 'string' ? spec.to : '';
      if (!from.trim() || !to.trim() || from === to) return false;
      const chapter = spec.inChapter && typeof api.chapterSnapshot === 'function'
        ? api.chapterSnapshot() : EMPTY_CHAPTER;
      let res = null;
      try {
        res = await native.historyAdd(bookId, {
          tool: spec.tool,
          label: typeof spec.label === 'string' ? spec.label : '',
          from,
          to,
          chapterId: chapter && chapter.chapterId ? chapter.chapterId : '',
          chapterNumber: chapter && Number.isFinite(chapter.chapterNumber) ? chapter.chapterNumber : 0,
          chapterTitle: chapter && chapter.chapterTitle ? chapter.chapterTitle : ''
        });
      } catch (err) {
        res = { ok: false, reason: String((err && err.message) || err) };
      }
      if (!res || !res.ok) {
        const reason = res && res.reason ? String(res.reason) : 'write';
        status(failText(reason), 'error');
        logFailure(reason);
        return false;
      }
      // The writer may have opened another book while the write was in flight;
      // the entry still belongs to the book it was made in, but this view must
      // not adopt that book's history.
      if (api.bookId() !== bookId) return true;
      status('', '');
      refresh();
      return true;
    } catch {
      return false;
    }
  }

  window.NeoHistory = { record };
})();
