// NEO fork — History in the right-hand pane (adr-014)
//
// The pane's fourth view: every replacement a tool made in the open book,
// newest first. Read-only by construction: rows are text nodes and nothing in
// the view writes the history or the book.

'use strict';

(function () {
  const model = window.NeoHistoryLog;
  const api = window.NeoExtApi;
  if (!model || !api) return;

  // Read the bridge per call: a preload that is not ready at load time still
  // answers once it is.
  const bridge = () => window.NeoForkNative || null;
  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);

  const state = {
    book: '',
    loaded: false,
    failed: false,
    store: model.empty(),
    status: { text: '', kind: '' },
    notice: { text: '', kind: '' }
  };

  let loadToken = 0;

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const view = el('section', 'neo-history-view');
  view.id = 'neo-history-view';
  view.hidden = true;
  const head = el('div', 'neo-hist-head');
  const note = el('p', 'neo-hist-note', x('A record of replacements. Entries cannot be restored here; Snapshots is where words come back.'));
  const status = el('div', 'neo-hist-status');
  status.hidden = true;
  head.append(note, status);
  const list = el('div', 'neo-hist-list');
  list.setAttribute('role', 'list');
  view.append(head, list);

  function setStatus(text, kind) {
    state.status = { text: text || '', kind: kind || '' };
    render();
  }

  const TOOL_LABELS = { rephrase: 'Rephrase', thesaurus: 'Thesaurus', grammar: 'Grammar' };

  function toolLabel(tool) {
    const known = TOOL_LABELS[tool];
    return known ? x(known) : String(tool || '');
  }

  function chapterText(entry) {
    if (!entry.chapterNumber) return '';
    const name = x('Chapter {n}', { n: entry.chapterNumber });
    return entry.chapterTitle ? x('{chapter} — {title}', { chapter: name, title: entry.chapterTitle }) : name;
  }

  function whereText(entry) {
    let when = '';
    try {
      const at = new Date(entry.at);
      when = Number.isNaN(at.getTime()) ? '' : at.toLocaleString();
    } catch { when = ''; }
    const tool = toolLabel(entry.tool);
    const label = entry.label && entry.label !== tool ? entry.label : '';
    return [tool, label, when, chapterText(entry)].filter(Boolean).join(' · ');
  }

  function row(entry) {
    const node = el('div', 'neo-hist-row');
    node.setAttribute('role', 'listitem');
    node.append(el('div', 'neo-hist-where', whereText(entry)));
    const change = el('div', 'neo-hist-change');
    change.append(
      el('span', 'neo-hist-from', entry.from),
      el('span', 'neo-hist-arrow', ' → '),
      el('span', 'neo-hist-to', entry.to)
    );
    node.append(change);
    if (entry.shortened) node.append(el('div', 'neo-hist-shortened', shortenedText(entry.shortened)));
    return node;
  }

  function shortenedText(side) {
    if (side === 'from') return x('The replaced text was shortened.');
    if (side === 'to') return x('The replacement was shortened.');
    return x('Both texts were shortened.');
  }

  function render() {
    status.hidden = !(state.notice.text || state.status.text);
    status.textContent = state.notice.text || state.status.text;
    status.classList.toggle('is-error', (state.notice.text ? state.notice.kind : state.status.kind) === 'error');
    list.textContent = '';
    if (!state.book) {
      list.append(el('p', 'neo-hist-empty', x('Open a book to see its history.')));
      return;
    }
    if (!state.loaded) {
      if (!state.failed) list.append(el('p', 'neo-hist-empty', x('Reading the history…')));
      return;
    }
    const entries = model.sorted(state.store.entries || []);
    if (!entries.length) {
      list.append(el('p', 'neo-hist-empty', x('No replacements recorded yet. Rephrase, Grammar, and the thesaurus record what they change here.')));
      return;
    }
    for (const entry of entries) list.append(row(entry));
  }

  function reasonText(reason) {
    if (reason === 'large') return x('History could not be read: the file is too large.');
    if (reason === 'cloud') return x('History is in iCloud and not available yet.');
    if (reason === 'unreadable') return x('History could not be read. The file has been left untouched.');
    if (reason === 'path' || reason === 'read') return x('History could not be read.');
    return x('History could not be read.');
  }

  function startLoad(id, quiet) {
    load(id, quiet).catch(() => {
      state.loaded = false;
      state.failed = true;
      setStatus(reasonText('read'), 'error');
    });
  }

  async function load(id, quiet) {
    const token = ++loadToken;
    if (state.book !== id) state.notice = { text: '', kind: '' };
    state.book = id;
    state.status = { text: '', kind: '' };
    state.failed = false;
    if (!quiet) {
      state.loaded = false;
      state.store = model.empty();
      render();
    }
    const native = bridge();
    if (!native || typeof native.historyRead !== 'function') {
      state.loaded = false;
      state.failed = true;
      setStatus(x('History is not available in this build.'), 'error');
      return false;
    }
    let res = null;
    try { res = await native.historyRead(id); } catch (err) { res = { ok: false, reason: String((err && err.message) || err) }; }
    if (token !== loadToken || api.bookId() !== id) return false;
    if (!res || !res.ok) {
      // A failure never leaves the view claiming a successful read, so the
      // next time the tab is shown the read is tried again.
      state.loaded = false;
      state.failed = true;
      setStatus(reasonText(res && res.reason), 'error');
      return false;
    }
    const clean = model.normalize(res.store);
    if (!clean.ok) {
      // A store the reader would refuse is not an empty history.
      state.loaded = false;
      state.failed = true;
      setStatus(reasonText('unreadable'), 'error');
      return false;
    }
    state.store = clean.store;
    state.loaded = true;
    if (res.recovered) setStatus(x('History could not be read. Its last good copy is shown, and new replacements are not being recorded.'), 'error');
    else setStatus('', '');
    render();
    return true;
  }

  function show() {
    const id = api.bookId();
    if (!id) {
      loadToken += 1;
      state.book = '';
      state.loaded = false;
      state.failed = false;
      state.store = model.empty();
      state.status = { text: '', kind: '' };
      render();
      return;
    }
    if (state.book !== id || !state.loaded) startLoad(id, false);
    else render();
  }

  // Seam 4: a book was opened while History was showing. The rows must belong
  // to the book that is open now, not the one they were read for.
  window.addEventListener('neo-ext:book-opened', () => {
    state.loaded = false;
    state.notice = { text: '', kind: '' };
    if (!view.hidden) show();
  });

  // A recorded replacement asks for this. Quiet so the rows already on screen
  // never flash away while the read catches up.
  function refresh() {
    if (view.hidden) {
      // Nothing to show now, but the rows on screen are stale: the next look
      // at the tab must read again.
      state.loaded = false;
      return false;
    }
    const id = api.bookId();
    if (!id) return false;
    startLoad(id, id === state.book && state.loaded);
    return true;
  }

  // The recorder's failure notice waits here until a recording succeeds.
  function say(text, kind) {
    state.notice = { text: text || '', kind: kind || '' };
    render();
  }

  if (window.NeoRecords && typeof window.NeoRecords.registerView === 'function') {
    window.NeoRecords.registerView({ id: 'history', label: x('History'), element: view, show });
  }

  window.NeoHistoryView = { refresh, status: say };
})();
