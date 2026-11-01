// NEO fork — Grammar… in the editor (adr-017)
//
// Captures a selection (one block, up to 1,200 characters), asks the local model
// for issues or CLEAN, draws the corrected text and the original with joined
// cards, and can replace the selection as one undoable edit.

'use strict';

(function () {
  const issues = window.NeoGrammarIssues;
  const rules = window.NeoRephraseContext;
  const check = window.NeoRephraseCheck;
  const api = window.NeoExtApi;
  const board = window.NeoGrammarBoard;
  if (!issues || !rules || !check || !api || !board) return;
  const { element, buildModel, renderBoard, drawLines } = board;

  const reasons = window.NeoRephraseReasons;
  const bridge = () => window.NeoForkNative || null;
  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);
  const MAX_CORRECTED = issues.MAX_CORRECTED;

  let last = null;
  let win = null;
  let opening = false;

  function toast(message) {
    try { if (window.NeoExt && window.NeoExt.toast) return window.NeoExt.toast(message); } catch { /* no toast */ }
    return null;
  }

  function more() {
    return !!(api && typeof api.moreFeatures === 'function' && api.moreFeatures());
  }

  function reasonText(reason) {
    if (reason === 'session') return x('That grammar window expired. Try again.');
    if (reason === 'limits') return x('That passage is too long for this check.');
    return reasons && reasons.reasonText ? reasons.reasonText(reason, x) : x('That could not be completed.');
  }

  function capture(selection) {
    try {
      const evaluated = rules.evaluate({
        text: selection && selection.text,
        sameBlock: !!(selection && selection.sameBlock),
        inChapter: !!(selection && selection.body),
        moreFeatures: more()
      });
      if (!evaluated.ok) { last = null; return false; }
      const parent = selection.range && selection.range.startContainer
        ? selection.range.startContainer.parentElement : null;
      if (parent && parent.closest && parent.closest('.fn, .fncall, .footnote')) { last = null; return false; }
      const body = selection.body;
      const nodes = api.paragraphNodes(body);
      const blocks = nodes.map((node) => (node.classList.contains('ghost') || node.classList.contains('scene-break') ? '' : node.textContent || ''));
      const index = Math.max(0, nodes.indexOf(selection.paragraphEl));
      last = {
        ok: true,
        range: selection.range.cloneRange(),
        text: evaluated.text,
        before: rules.takeBefore(blocks, index),
        after: rules.takeAfter(blocks, index),
        block: selection.paragraphEl
      };
      return true;
    } catch {
      last = null;
      return false;
    }
  }

  function has() {
    return !!(last && last.ok);
  }

  function close(current) {
    if (!win || win !== current) return;
    const session = current.session;
    win = null;
    current.closed = true;
    if (current.onKey) window.removeEventListener('keydown', current.onKey, true);
    if (current.watch) clearInterval(current.watch);
    if (current.onScroll) { try { current.view.body.removeEventListener('scroll', current.onScroll); } catch { /* gone */ } }
    if (current.onResize) { try { window.removeEventListener('resize', current.onResize); } catch { /* gone */ } }
    if (current.observer) { try { current.observer.disconnect(); } catch { /* gone */ } current.observer = null; }
    try { const apiBridge = bridge(); if (apiBridge && typeof apiBridge.grammarEnd === 'function') apiBridge.grammarEnd({ session }); } catch { /* the page moved on */ }
    try { current.el.remove(); } catch { /* gone */ }
    try {
      const range = last && last.range;
      const body = range && document.contains(range.startContainer) && range.startContainer.parentElement
        ? range.startContainer.parentElement.closest('.chapter-body')
        : (api && api.currentChapter && api.chapterBody ? api.chapterBody(api.currentChapter()) : null);
      if (body) body.focus({ preventScroll: true });
    } catch { /* the page moved on */ }
  }

  function setLoading(current) {
    current.content.textContent = '';
    current.content.setAttribute('aria-busy', 'true');
    const line = element(document, 'p', 'neo-grammar-loading', x('Checking the text…'));
    line.setAttribute('role', 'status');
    line.tabIndex = -1;
    current.content.append(line);
    try { line.focus({ preventScroll: true }); } catch { /* focus */ }
  }

  function setFailure(current, message) {
    if (!win || win !== current || current.closed) return;
    current.content.textContent = '';
    current.content.setAttribute('aria-busy', 'false');
    const line = element(document, 'p', 'neo-grammar-failure', message);
    line.setAttribute('role', 'alert');
    const retry = element(document, 'button', 'neo-grammar-retry', x('Try again'));
    retry.type = 'button';
    retry.addEventListener('click', () => {
      if (current.closed) return;
      current.styleRetried = false;
      current.sessionRestarted = false;
      runGrammar(current, false).catch(() => {});
    });
    current.content.append(line, retry);
    retry.focus({ preventScroll: true });
  }

  function fitBoard(view) {
    try {
      const width = view.body.offsetWidth;
      view.element.classList.toggle('neo-grammar-narrow', width > 0 && width < 560);
    } catch { /* decoration */ }
  }

  function renderBoardView(current) {
    if (current.onResize) { try { window.removeEventListener('resize', current.onResize); } catch { /* gone */ } }
    if (current.onScroll) { try { current.view.body.removeEventListener('scroll', current.onScroll); } catch { /* gone */ } }
    if (current.observer) { try { current.observer.disconnect(); } catch { /* gone */ } current.observer = null; }
    const model = buildModel(current.entry, current.parsed, current.style, current.styleNotice);
    const view = renderBoard(document, model);
    current.model = model;
    current.view = view;
    current.content.textContent = '';
    current.content.setAttribute('aria-busy', 'false');
    current.content.append(view.element);
    view.style.addEventListener('click', () => {
      suggestStyle(current).catch(() => {
        if (current.closed || win !== current) return;
        current.styleBusy = false;
        current.styleNotice = x('The style pass could not be read.');
        try { renderBoardView(current); } catch { /* gone */ }
      });
    });
    view.close.addEventListener('click', () => close(current));
    view.replace.addEventListener('click', () => replace(current));
    current.onScroll = () => drawLines(view);
    current.onResize = () => { fitBoard(view); drawLines(view); };
    try { view.body.addEventListener('scroll', current.onScroll); } catch { /* decoration */ }
    try { window.addEventListener('resize', current.onResize); } catch { /* decoration */ }
    if (typeof ResizeObserver === 'function') {
      current.observer = new ResizeObserver(() => { fitBoard(view); drawLines(view); });
      try { current.observer.observe(view.element); } catch { /* decoration */ }
    }
    fitBoard(view);
    drawLines(view);
    setTimeout(() => {
      if (current.closed || current.view !== view) return;
      fitBoard(view);
      drawLines(view);
    }, 0);
    try { (view.replace.disabled ? view.close : view.replace).focus({ preventScroll: true }); } catch { /* focus */ }
  }

  async function startSession(current) {
    try {
      const previous = current.session;
      const started = await bridge().grammarStart();
      if (!started || !started.ok) return false;
      if (current.closed || win !== current) {
        try { bridge().grammarEnd({ session: started.session }); } catch { /* gone */ }
        return false;
      }
      current.session = started.session;
      if (previous && previous !== current.session) {
        try { bridge().grammarEnd({ session: previous }); } catch { /* gone */ }
      }
      return true;
    } catch {
      return false;
    }
  }

  async function sendGrammar(current) {
    try {
      return await bridge().grammarRun({
        session: current.session,
        text: current.entry.text,
        before: current.entry.before,
        after: current.entry.after
      });
    } catch (err) {
      return { ok: false, reason: String((err && err.message) || err) };
    }
  }

  async function runGrammar(current, isRetry) {
    if (!win || win !== current || current.closed) return;
    if (!more()) { close(current); return; }
    if (!isRetry) setLoading(current);
    let raw = await sendGrammar(current);
    if (current.closed) return;
    if (raw && raw.reason === 'session' && !current.sessionRestarted) {
      current.sessionRestarted = true;
      if (await startSession(current)) raw = await sendGrammar(current);
    }
    if (current.closed) return;
    if (!raw || !raw.ok) {
      if (raw && raw.reason === 'empty' && !isRetry) { await runGrammar(current, true); return; }
      setFailure(current, raw && raw.reason === 'empty' ? x('The answer could not be read.') : reasonText(raw && raw.reason));
      return;
    }
    // The before/after paragraphs travel as context only; an issue the model
    // reports inside them is dropped here rather than shown as not applied.
    const parsed = issues.parse(raw.text, current.entry.text, {
      before: current.entry.before,
      after: current.entry.after
    });
    if (parsed.retry && !isRetry) { await runGrammar(current, true); return; }
    if (parsed.status === 'unreadable') { setFailure(current, x('The answer could not be read.')); return; }
    current.parsed = parsed;
    renderBoardView(current);
  }

  async function sendStyle(current) {
    try {
      return await bridge().grammarStyle({
        session: current.session,
        text: current.entry.text,
        corrected: current.model.corrected,
        before: current.entry.before,
        after: current.entry.after
      });
    } catch (err) {
      return { ok: false, reason: String((err && err.message) || err) };
    }
  }

  async function suggestStyle(current, fromRetry) {
    if (!win || win !== current || current.closed || current.styleBusy) return;
    if (!more()) { close(current); return; }
    if (!fromRetry) {
      current.sessionRestarted = false;
      current.styleRetried = false;
    }
    const model = current.model;
    if (!model || model.blank) return;
    if (model.corrected.length > MAX_CORRECTED) {
      current.styleNotice = x('The corrected text is too long to review for style.');
      renderBoardView(current);
      return;
    }
    current.styleBusy = true;
    current.styleNotice = '';
    if (current.view) {
      current.view.style.textContent = x('Suggest style');
      current.view.style.disabled = true;
      if (current.view.spinner) current.view.spinner.hidden = false;
    }
    let raw = await sendStyle(current);
    if (current.closed) return;
    if (raw && raw.reason === 'session' && !current.sessionRestarted) {
      current.sessionRestarted = true;
      if (await startSession(current)) raw = await sendStyle(current);
    }
    if (current.closed) return;
    if (!raw || !raw.ok) {
      current.styleBusy = false;
      current.styleEmpty = false;
      if (raw && raw.reason === 'empty' && !current.styleRetried) {
        current.styleRetried = true;
        return suggestStyle(current, true);
      }
      current.styleNotice = raw && raw.reason === 'empty'
        ? x('The style pass could not be read.')
        : reasonText(raw && raw.reason);
      renderBoardView(current);
      return;
    }
    const parsed = issues.parseStyle(raw.text);
    if (parsed.retry && !current.styleRetried) {
      current.styleRetried = true;
      current.styleBusy = false;
      return suggestStyle(current, true);
    }
    current.styleBusy = false;
    if (parsed.status === 'unreadable') {
      current.styleNotice = x('The style pass could not be read.');
      renderBoardView(current);
      return;
    }
    current.style = parsed.status === 'suggestions' ? parsed.suggestions : [];
    const kept = current.style.length
      ? issues.filterStyle(current.style, current.entry.text, current.parsed.issues)
      : [];
    current.styleEmpty = kept.length === 0;
    current.styleNotice = current.styleEmpty ? x('Nothing to suggest.') : '';
    renderBoardView(current);
  }

  function replace(current) {
    if (!win || win !== current || current.closed) return;
    if (!more()) { close(current); return; }
    const entry = current.entry;
    const model = current.model;
    if (!model || !model.canReplace) return;
    try {
      const range = entry.range;
      const alive = range && document.contains(range.startContainer)
        && check.norm(range.toString()) === check.norm(entry.text);
      if (!alive) {
        close(current);
        toast(x('That text moved. Nothing was changed.'));
        return;
      }
      const editor = range.startContainer.parentElement?.closest('.chapter-body');
      if (!editor) {
        close(current);
        toast(x('That text moved. Nothing was changed.'));
        return;
      }
      editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, model.corrected); } catch { inserted = false; }
      if (!inserted) { toast(x('That text could not be replaced.')); return; }
      close(current);
      last = null;
      if (editor) editor.focus({ preventScroll: true });
      try {
        if (window.NeoHistory && typeof window.NeoHistory.record === 'function') {
          Promise.resolve(window.NeoHistory.record({
            tool: 'grammar',
            label: '',
            from: entry.text,
            to: model.corrected,
            inChapter: true
          })).catch(() => {});
        }
      } catch { /* a record never blocks the replacement */ }
    } catch {
      toast(x('That text could not be replaced.'));
    }
  }

  async function openPending() {
    if (!more()) return false;
    if (opening || win) { toast(x('A grammar review is already open.')); return false; }
    if (document.querySelector('.modal-backdrop:not([hidden])')) return false;
    const entry = last;
    const apiBridge = bridge();
    if (!apiBridge || typeof apiBridge.grammarStart !== 'function') {
      toast(x('Grammar is not available in this build'));
      return false;
    }
    if (!entry) { toast(x('Select a paragraph to check.')); return false; }
    opening = true;
    let started = null;
    let el = null;
    let current = null;
    try {
      started = await apiBridge.grammarStart().catch(() => null);
      if (!started || !started.ok) {
        toast(reasonText(started && started.reason));
        return false;
      }
      if (last !== entry || !more() || document.querySelector('.modal-backdrop:not([hidden])')) {
        try { apiBridge.grammarEnd({ session: started.session }); } catch { /* page moved on */ }
        if (last !== entry || !more()) toast(x('Select a paragraph to check.'));
        return false;
      }

      const doc = document;
      el = element(doc, 'div', 'modal-backdrop neo-grammar-backdrop');
      const card = element(doc, 'div', 'modal neo-grammar');
      card.setAttribute('role', 'dialog');
      card.setAttribute('aria-modal', 'true');
      card.setAttribute('aria-labelledby', 'neo-grammar-title');
      const title = element(doc, 'h2', 'neo-grammar-title', x('Grammar'));
      title.id = 'neo-grammar-title';
      const closeButton = element(doc, 'button', 'neo-grammar-close', '\u00d7');
      closeButton.type = 'button';
      closeButton.setAttribute('aria-label', x('Close'));
      const content = element(doc, 'div', 'neo-grammar-content');
      card.append(title, closeButton, content);
      el.append(card);
      doc.body.appendChild(el);

      current = {
        el, card, content, entry, session: started.session, parsed: null, style: [],
        styleNotice: '', styleBusy: false, styleRetried: false, styleEmpty: false,
        sessionRestarted: false, closed: false, model: null, view: null,
        onKey: null, watch: null, onScroll: null, onResize: null
      };
      closeButton.addEventListener('click', () => close(current));
      el.addEventListener('click', (event) => { if (event.target === el) close(current); });
      current.onKey = (event) => {
        if (!win || win !== current) return;
        if ((event.metaKey || event.ctrlKey) && /^[zy]$/i.test(event.key)) {
          event.preventDefault();
          event.stopPropagation();
          if (event.stopImmediatePropagation) event.stopImmediatePropagation();
          return;
        }
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(current); return; }
        if (event.key === 'Tab') {
          const items = [...current.el.querySelectorAll('button, [tabindex="0"]')]
            .filter((node) => !node.disabled && !node.hidden);
          if (!items.length) return;
          const at = items.indexOf(document.activeElement);
          const step = event.shiftKey ? -1 : 1;
          const next = at < 0 ? 0 : (at + step + items.length) % items.length;
          event.preventDefault();
          items[next].focus();
        }
      };
      window.addEventListener('keydown', current.onKey, true);
      current.watch = setInterval(() => { if (!more()) close(current); }, 750);
      win = current;
      setLoading(current);
      closeButton.focus({ preventScroll: true });
      runGrammar(current, false).catch(() => setFailure(current, x('That could not be completed.')));
      return true;
    } catch {
      if (current) {
        current.closed = true;
        if (current.onKey) { try { window.removeEventListener('keydown', current.onKey, true); } catch { /* gone */ } }
        if (current.watch) clearInterval(current.watch);
      }
      if (win === current) win = null;
      try { if (started) apiBridge.grammarEnd({ session: started.session }); } catch { /* gone */ }
      try { if (el) el.remove(); } catch { /* gone */ }
      toast(x('The grammar window could not open.'));
      return false;
    } finally {
      opening = false;
    }
  }

  window.NeoGrammar = {
    capture, has, openPending
  };
})();
