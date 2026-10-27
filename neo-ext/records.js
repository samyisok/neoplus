// NEO fork — Records in the right-hand slide-over pane (adr-005)
//
// Tabs under the pane's header: Notes keeps the pane's current content,
// Records shows the library's shared records. The Notes page, left nav, and
// bottom tabs are not touched.

'use strict';

(function () {
  const model = window.NeoRecordsStore;
  const search = window.NeoRecordsSearch;
  const tagRules = window.NeoRecordTags;
  const listFactory = window.NeoRecordsList;
  const api = window.NeoExtApi;
  if (!model || !search || !listFactory || !api) return;

  const bridge = window.NeoForkNative || {};
  const pane = document.getElementById('side-pane');
  const head = document.getElementById('side-head');
  if (!pane || !head || document.getElementById('neo-records-view')) return;

  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);
  const SAVE_MS = 600;
  const TAG_HIGHLIGHT_KEY = 'neo-record-tag-highlight';

  const state = {
    store: model.empty(),
    view: 'notes',
    query: '',
    openRows: new Set(),
    collapsed: new Set(),
    draft: null,
    confirming: null,
    folderConfirm: null,
    pendingFolder: null,
    renaming: null,
    tagConfirm: null,
    tagDraft: null
  };
  let loaded = false;
  let tagReady = false;
  let readOnly = false;
  let statusText = '';
  let statusKind = '';
  let saveTimer = 0;
  let saving = false;
  let changes = 0;
  let sentChanges = 0;
  let pendingAdopt = null;
  let searchTimer = 0;
  let tagScanTimer = 0;
  let chapterScanTimer = 0;
  let tagPaint = new Map();
  let tagHighlight = false;
  try { tagHighlight = localStorage.getItem(TAG_HIGHLIGHT_KEY) === '1'; } catch { /* storage can be off */ }

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const tabs = el('div', 'neo-side-tabs');
  tabs.id = 'neo-side-tabs';
  tabs.setAttribute('role', 'tablist');
  tabs.hidden = true;
  const tabNotes = el('div', 'neo-side-tab', x('Notes'));
  tabNotes.dataset.view = 'notes';
  tabNotes.setAttribute('role', 'tab');
  tabNotes.tabIndex = 0;
  const tabRecords = el('div', 'neo-side-tab', x('Records'));
  tabRecords.dataset.view = 'records';
  tabRecords.setAttribute('role', 'tab');
  tabRecords.tabIndex = -1;
  tabs.append(tabNotes, tabRecords);
  pane.insertBefore(tabs, head);

  const viewEl = el('div', 'neo-records-view');
  viewEl.id = 'neo-records-view';
  viewEl.hidden = true;
  const toolbar = el('div', 'neo-records-toolbar');
  const searchInput = el('input', 'neo-records-search');
  searchInput.id = 'neo-records-search';
  searchInput.type = 'search';
  searchInput.placeholder = x('Search records');
  searchInput.setAttribute('aria-label', x('Search records'));
  searchInput.spellcheck = false;
  const addButton = el('button', 'neo-records-add', '+ ' + x('Record'));
  addButton.id = 'neo-records-add';
  addButton.type = 'button';
  const folderButton = el('button', 'neo-records-add', '+ ' + x('Folder'));
  folderButton.id = 'neo-records-add-folder';
  folderButton.type = 'button';
  toolbar.append(searchInput, addButton, folderButton);
  const statusEl = el('div', 'neo-records-status');
  statusEl.id = 'neo-records-status';
  statusEl.hidden = true;
  const statusSpan = el('span', 'neo-records-status-text');
  const retry = el('button', 'neo-records-retry', x('Try again'));
  retry.type = 'button';
  retry.hidden = true;
  statusEl.append(statusSpan, retry);
  const listEl = el('div', 'neo-records-list');
  listEl.id = 'neo-records-list';
  viewEl.append(toolbar, statusEl, listEl);
  pane.appendChild(viewEl);

  const list = listFactory.create(x);

  function moreOn() {
    try { return !!api.moreFeatures(); } catch { return false; }
  }

  function allowedTab() {
    try { return currentTab === 'manuscript' || currentTab === 'notes'; } catch { return false; }
  }

  function setStatus(text, kind = '') {
    statusText = text || '';
    statusKind = kind;
    statusEl.hidden = !statusText;
    statusEl.classList.toggle('is-error', kind === 'error');
    statusSpan.textContent = statusText;
    retry.hidden = !(kind === 'cloud' || kind === 'unreadable');
  }

  function markChanged() {
    changes += 1;
    pendingAdopt = null;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_MS);
    if (statusKind === 'save') setStatus('');
  }

  function hasFocusedField() {
    const active = document.activeElement;
    return !!(active && viewEl.contains(active) && (
      active.isContentEditable || active.tagName === 'INPUT' || active.tagName === 'SELECT' || active.tagName === 'TEXTAREA'
    ));
  }

  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (saving || !loaded || readOnly || changes === sentChanges) return;
    if (!bridge.recordsWrite) { setStatus(x('Records are not available in this build'), 'error'); return; }
    const gen = changes;
    saving = true;
    let res;
    try { res = await bridge.recordsWrite(state.store); } catch (err) { res = { ok: false, reason: String(err && err.message || err) }; }
    saving = false;
    if (!res || !res.ok) {
      pendingAdopt = null;
      if (res && res.reason === 'cloud') setStatus(x('Records are in iCloud and not available yet.'), 'cloud');
      else if (res && res.reason === 'unreadable') { readOnly = true; setStatus(x('Records could not be read. Nothing is being saved.'), 'unreadable'); }
      else if (res && res.reason === 'large') setStatus(x('Records could not be saved: the store is too large.'), 'error');
      else setStatus(x('Records could not be saved.'), 'error');
      return;
    }
    sentChanges = gen;
    // The response is the disk, never the page: always union it with what the
    // writer has now. Replacing the local store with a response that started
    // before a new record or folder would make that change vanish.
    const merged = model.merge(res.store, state.store, Date.now());
    if (!merged.ok) { setStatus(x('Records could not be saved.'), 'error'); return; }
    state.store = merged.store;
    if (tagHighlight) scheduleTagScan(50);
    if (changes === gen) {
      if (hasFocusedField()) pendingAdopt = state.store;
      else { pendingAdopt = null; render(); }
    } else {
      setTimeout(flush, 20);
    }
  }

  async function loadStore(showStatus = true) {
    if (saving || changes !== sentChanges) return false;
    if (!bridge.recordsRead) { readOnly = true; if (showStatus) setStatus(x('Records are not available in this build'), 'error'); return false; }
    const gen = changes;
    let res;
    try { res = await bridge.recordsRead(); } catch (err) { res = { ok: false, reason: String(err && err.message || err) }; }
    if (!res || !res.ok) {
      readOnly = true;
      tagReady = false;
      if (res && res.reason === 'cloud') setStatus(x('Records are in iCloud and not available yet.'), 'cloud');
      else if (res && res.reason === 'unreadable') setStatus(x('Records could not be read. The file has been left untouched.'), 'unreadable');
      else if (res && res.reason === 'large') { readOnly = true; setStatus(x('Records could not be read: the file is too large.'), 'unreadable'); }
      else setStatus(x('Records could not be read.'), 'error');
      render();
      return false;
    }
    if (saving || changes !== gen) return false;
    readOnly = false;
    loaded = true;
    tagReady = true;
    state.store = res.store;
    if (tagHighlight) scheduleTagScan(50);
    setStatus('');
    render();
    return true;
  }

  function activeTagList() {
    const seen = new Set();
    const out = [];
    for (const rec of model.activeRecords(state.store)) {
      const list = tagRules ? tagRules.activeTags(rec) : [];
      for (const tag of list) {
        if (out.length >= 2000) return out;
        const key = tagRules ? tagRules.tagKey(tag) : tag.toLocaleLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        out.push(tag);
      }
    }
    return out;
  }

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

  const eye = el('button', 'neo-records-eye');
  eye.id = 'records-eye';
  eye.type = 'button';
  eye.hidden = true;
  eye.appendChild(eyeIcon());
  eye.setAttribute('aria-pressed', 'false');
  eye.setAttribute('aria-label', x('Highlight record names'));
  eye.title = x('Highlight record names');
  const counters = document.getElementById('counters');
  if (counters) {
    const zoom = document.getElementById('zoom-control');
    counters.insertBefore(eye, zoom || null);
  }

  function updateEye() {
    if (!eye) return;
    const tags = activeTagList();
    let pocket = false;
    try { pocket = !!IS_POCKET; } catch { /* not settled */ }
    const show = moreOn() && !pocket && !!book && tags.length > 0;
    eye.hidden = !show;
    eye.setAttribute('aria-pressed', tagHighlight && show ? 'true' : 'false');
    if (!show) clearTagHighlight();
  }

  function clearTagHighlight() {
    tagPaint = new Map();
    if (window.CSS && CSS.highlights) CSS.highlights.delete('neo-record-tag');
  }

  function locate(root, offset, end) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let at = 0;
    let node;
    while ((node = walker.nextNode())) {
      const len = node.data.length;
      if (end ? (offset > at && offset <= at + len) : (offset >= at && offset < at + len)) return { node, offset: offset - at };
      at += len;
    }
    return null;
  }

  function quoteRanges(block, matcher, out) {
    const text = block.textContent;
    if (!text) return;
    for (const hit of matcher.ranges(text, 2000 - out.length)) {
      const start = locate(block, hit.start, false);
      const end = locate(block, hit.end, true);
      if (!start || !end) continue;
      try {
        const range = document.createRange();
        range.setStart(start.node, start.offset);
        range.setEnd(end.node, end.offset);
        out.push(range);
      } catch { /* a block changed under us */ }
      if (out.length >= 2000) return;
    }
  }

  function scanBody(body, matcher, out) {
    for (const block of body.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')) quoteRanges(block, matcher, out);
  }

  function paintTags() {
    if (window.CSS && CSS.highlights) {
      const all = [];
      for (const ranges of tagPaint.values()) all.push(...ranges);
      if (all.length) CSS.highlights.set('neo-record-tag', new Highlight(...all.slice(0, 2000)));
      else CSS.highlights.delete('neo-record-tag');
    }
  }

  function scanTags() {
    tagScanTimer = 0;
    if (!tagHighlight || !tagRules) { clearTagHighlight(); return; }
    const tags = activeTagList();
    if (!tags.length) { clearTagHighlight(); return; }
    const matcher = tagRules.buildMatcher(tags);
    tagPaint = new Map();
    const out = [];
    for (const body of document.querySelectorAll('.chapter-body')) {
      const chapter = body.closest('.chapter')?.dataset.id || '';
      const ranges = [];
      scanBody(body, matcher, ranges);
      if (ranges.length) tagPaint.set(chapter, ranges);
      for (const range of ranges) { out.push(range); if (out.length >= 2000) break; }
      if (out.length >= 2000) break;
    }
    paintTags();
    if (eye) eye.setAttribute('aria-pressed', tagHighlight ? 'true' : 'false');
  }

  function scanChapter(body) {
    if (!tagHighlight || !tagRules || !body) return;
    const tags = activeTagList();
    if (!tags.length) { clearTagHighlight(); return; }
    const matcher = tagRules.buildMatcher(tags);
    const ranges = [];
    scanBody(body, matcher, ranges);
    const chapter = body.closest('.chapter')?.dataset.id || '';
    if (ranges.length) tagPaint.set(chapter, ranges); else tagPaint.delete(chapter);
    paintTags();
  }

  function scheduleTagScan(ms = 0) {
    if (tagScanTimer) clearTimeout(tagScanTimer);
    tagScanTimer = setTimeout(scanTags, ms);
  }

  function render() {
    document.body.dataset.neoDraft = JSON.stringify(state.draft);
    applyTabs();
    updateEye();
    addButton.disabled = !loaded;
    folderButton.disabled = !loaded;
    if (state.view !== 'records') { viewEl.hidden = true; return; }
    viewEl.hidden = false;
    list.render(listEl, state, actions);
    if (!statusText) statusEl.hidden = true;
  }

  function applyTabs() {
    const visible = moreOn() && allowedTab();
    tabs.hidden = !visible;
    tabRecords.hidden = !moreOn();
    tabNotes.setAttribute('aria-selected', state.view === 'notes' ? 'true' : 'false');
    tabRecords.setAttribute('aria-selected', state.view === 'records' ? 'true' : 'false');
    tabNotes.tabIndex = state.view === 'notes' ? 0 : -1;
    tabRecords.tabIndex = state.view === 'records' ? 0 : -1;
    if (!visible && state.view === 'records') setView('notes');
    if (!moreOn() && state.view === 'records') setView('notes');
  }

  function setView(next) {
    if (next === 'records' && (!moreOn() || !allowedTab())) next = 'notes';
    if (next === state.view) return;
    if (state.view === 'records') {
      flush();
      if (window.CSS && CSS.highlights) CSS.highlights.delete('neo-record-search');
    }
    state.view = next;
    pane.classList.toggle('neo-records-open', next === 'records');
    viewEl.hidden = next !== 'records';
    searchInput.value = next === 'records' ? searchInput.value : '';
    if (next === 'records') {
      setStatus('');
      loadStore();
      setTimeout(() => searchInput.focus({ preventScroll: true }), 0);
    } else {
      state.query = '';
      state.draft = null;
      state.confirming = null;
      state.folderConfirm = null;
      state.pendingFolder = null;
      state.renaming = null;
    }
    applyTabs();
    render();
  }

  const actions = {
    setQuery(value) {
      state.query = value;
      render();
    },
    addRecord(folderId) {
      state.query = '';
      searchInput.value = '';
      state.draft = { folderId: folderId || null, title: '' };
      state.confirming = null;
      render();
    },
    commitDraft(title, folderId) {
      const res = model.addRecord(state.store, title, folderId, Date.now());
      state.draft = null;
      if (!res.ok) { setStatus(x('A record needs a title.'), 'error'); render(); return; }
      state.openRows.add(res.record.id);
      markChanged();
      render();
      if (tagHighlight) scheduleTagScan(50);
    },
    cancelDraft() { state.draft = null; render(); },
    toggleRecord(id) {
      if (state.openRows.has(id)) state.openRows.delete(id); else state.openRows.add(id);
      render();
    },
    confirmRecord(id) { state.confirming = id; render(); },
    cancelConfirm() { state.confirming = null; render(); },
    deleteRecord(id) {
      model.deleteRecord(state.store, id, Date.now());
      state.confirming = null;
      state.openRows.delete(id);
      markChanged();
      render();
    },
    setBody(id, body) {
      if (model.setBody(state.store, id, body, Date.now()).ok) markChanged();
    },
    startRecordRename(id) { state.renaming = id; render(); },
    commitRecordRename(id, title) {
      const res = model.renameRecord(state.store, id, title, Date.now());
      state.renaming = null;
      if (!res.ok) setStatus(x('A record needs a title.'), 'error');
      else markChanged();
      render();
    },
    cancelRecordRename() { state.renaming = null; render(); },
    toggleFolder(id) {
      const key = id || 'unsorted';
      if (state.collapsed.has(key)) state.collapsed.delete(key); else state.collapsed.add(key);
      render();
    },
    addFolder(name) {
      const res = model.addFolder(state.store, name, Date.now());
      state.pendingFolder = null;
      if (!res.ok) setStatus(x('A folder with that name already exists.'), 'error');
      else markChanged();
      render();
    },
    startFolderRename(id) { state.pendingFolder = { kind: 'rename', id }; render(); },
    commitFolderRename(id, name) {
      const res = model.renameFolder(state.store, id, name, Date.now());
      state.pendingFolder = null;
      if (!res.ok) setStatus(x('A folder with that name already exists.'), 'error');
      else markChanged();
      render();
    },
    cancelFolderEdit() { state.pendingFolder = null; render(); },
    confirmFolder(id) { state.folderConfirm = id; render(); },
    cancelFolderConfirm() { state.folderConfirm = null; render(); },
    deleteFolder(id) {
      model.deleteFolder(state.store, id, Date.now());
      state.folderConfirm = null;
      state.collapsed.delete(id);
      markChanged();
      render();
    },
    moveRecord(id, folderId) {
      model.moveRecord(state.store, id, folderId, Date.now());
      markChanged();
      render();
    },
    findTag(text) {
      if (!api.openFind || !api.openFind(text)) setStatus(x('Find is not available'), 'error');
    },
    confirmTag(id, text) { state.tagConfirm = { id, text }; state.tagDraft = null; render(); },
    cancelTag() { state.tagConfirm = null; render(); },
    removeTag(id, text) {
      const res = model.removeTag(state.store, id, text, Date.now());
      state.tagConfirm = null;
      if (res.ok) { markChanged(); scheduleTagScan(50); }
      render();
    },
    startTagAdd(id) { state.tagDraft = { id, text: '' }; state.tagConfirm = null; render(); },
    tagTyped(text) { if (state.tagDraft) state.tagDraft.text = text; },
    commitTag(id, text) {
      const clean = String(text || '').trim();
      if (!clean) { state.tagDraft = null; render(); return; }
      const res = model.addTag(state.store, id, clean, Date.now());
      state.tagDraft = null;
      if (!res.ok) setStatus(res.reason === 'many' ? x('A record can have 50 tags.') : x('That tag is too long.'), 'error');
      else { markChanged(); scheduleTagScan(50); }
      render();
    },
    cancelTagEdit() { state.tagDraft = null; render(); }
  };

  function tabList() {
    return [tabNotes, tabRecords].filter((t) => !t.hidden);
  }

  function moveTab(current, delta) {
    const list = tabList();
    if (!list.length) return;
    let index = list.indexOf(current);
    index = (index + delta + list.length) % list.length;
    const next = list[index];
    next.focus();
    if (next === tabRecords) setView('records'); else setView('notes');
  }

  tabNotes.addEventListener('click', () => setView('notes'));
  tabRecords.addEventListener('click', () => setView('records'));
  for (const tab of [tabNotes, tabRecords]) {
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); moveTab(tab, 1); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); moveTab(tab, -1); }
      else if (e.key === 'Home') { e.preventDefault(); tabNotes.focus(); setView('notes'); }
      else if (e.key === 'End') { e.preventDefault(); if (moreOn()) { tabRecords.focus(); setView('records'); } }
    });
  }

  searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => actions.setQuery(searchInput.value), 120);
  });
  searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      searchInput.value = '';
      actions.setQuery('');
    }
  });
  addButton.addEventListener('click', () => actions.addRecord(null));
  folderButton.addEventListener('click', () => { state.pendingFolder = { kind: 'new' }; render(); });
  eye.addEventListener('click', () => {
    tagHighlight = !tagHighlight;
    try { localStorage.setItem(TAG_HIGHLIGHT_KEY, tagHighlight ? '1' : '0'); } catch { /* fine */ }
    eye.setAttribute('aria-pressed', tagHighlight ? 'true' : 'false');
    if (tagHighlight) scheduleTagScan(); else clearTagHighlight();
  });
  retry.addEventListener('click', () => { readOnly = false; if (!loaded) loadStore(); else if (changes !== sentChanges) flush(); else loadStore(); });

  // window capture runs before NEO's document capture listeners, which can
  // otherwise turn a bare Esc into "back to the shelf"
  window.addEventListener('keydown', (e) => {
    if (state.view !== 'records') return;
    if (e.key === 'F6' || (e.key === 'Tab' && e.ctrlKey && !e.metaKey && !e.altKey)) {
      e.preventDefault();
      e.stopPropagation();
      searchInput.focus({ preventScroll: true });
      return;
    }
    if (e.key !== 'Escape') return;
    if (document.querySelector('.modal-backdrop:not([hidden])')) return;
    const active = document.activeElement;
    if (!pane.contains(e.target) && !(active && pane.contains(active))) return;
    e.preventDefault();
    e.stopPropagation();
    if (state.draft) { actions.cancelDraft(); return; }
    if (state.confirming) { actions.cancelConfirm(); return; }
    if (state.folderConfirm) { actions.cancelFolderConfirm(); return; }
    if (state.pendingFolder) { actions.cancelFolderEdit(); return; }
    if (state.renaming) { actions.cancelRecordRename(); return; }
    if (state.tagConfirm) { actions.cancelTag(); return; }
    if (state.tagDraft) { actions.cancelTagEdit(); return; }
    if (state.query) { searchInput.value = ''; actions.setQuery(''); }
  }, true);

  new MutationObserver(() => {
    if (!allowedTab() && state.view === 'records') setView('notes');
    if (moreOn() && !loaded) loadStore(false);
    applyTabs();
    updateEye();
    if (tagHighlight) scheduleTagScan(100);
  }).observe(document.getElementById('editor-view'), { attributes: true, attributeFilter: ['class', 'hidden'] });

  new MutationObserver(() => {
    if (!moreOn() && state.view === 'records') setView('notes');
    applyTabs();
  }).observe(document.getElementById('tabs'), { subtree: true, attributes: true, attributeFilter: ['class'] });

  if (window.neo && typeof window.neo.onMenu === 'function') {
    window.neo.onMenu((msg) => {
      if (!msg) return;
      if (msg.type === 'moreFeatures') {
        if (!moreOn() && state.view === 'records') setView('notes');
        if (moreOn() && !loaded) loadStore(false);
        applyTabs();
        updateEye();
        if (!moreOn()) clearTagHighlight();
        else if (tagHighlight) scheduleTagScan(50);
      }
    });
  }

  window.addEventListener('focus', () => {
    if (state.view === 'records' && !readOnly && !hasFocusedField() && changes === sentChanges) loadStore(false);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) flush();
    else if (state.view === 'records' && !hasFocusedField() && changes === sentChanges) loadStore(false);
  });
  viewEl.addEventListener('focusout', () => {
    setTimeout(() => {
      if (state.view === 'records' && pendingAdopt && !hasFocusedField()) {
        state.store = pendingAdopt;
        pendingAdopt = null;
        render();
      }
    }, 0);
  });
  window.addEventListener('blur', () => {
    if (state.view === 'records' && pendingAdopt && !hasFocusedField()) {
      state.store = pendingAdopt;
      pendingAdopt = null;
      render();
    }
  });

  const chapters = document.getElementById('chapters');
  if (chapters) {
    chapters.addEventListener('input', (e) => {
      const body = e.target && e.target.closest && e.target.closest('.chapter-body');
      if (!body || !tagHighlight) return;
      clearTimeout(chapterScanTimer);
      chapterScanTimer = setTimeout(() => scanChapter(body), 600);
    });
    new MutationObserver(() => { if (tagHighlight) scheduleTagScan(250); })
      .observe(chapters, { childList: true, subtree: true });
  }
  window.addEventListener('resize', () => { if (tagHighlight) scheduleTagScan(250); });

  applyTabs();
  if (moreOn()) loadStore(false);

  window.NeoRecords = {
    tagReady: () => tagReady,
    tagExists: (text) => tagReady && model.tagExists(state.store, text),
    lookUpItem(word) {
      try {
        if (!moreOn() || !tagReady || currentTab !== 'manuscript' || !word || word.length > 120) return null;
        const find = model.tagExists(state.store, word);
        return { label: x(find ? 'Find Record…' : 'Create Record…'), value: find ? 'record-find' : 'record-create' };
      } catch { return null; }
    },
    async openFromSelection(phrase, mode) {
      if (!moreOn() || !phrase) return false;
      try { if (typeof pinPane === 'function') pinPane('side', true); } catch { /* not settled */ }
      setView('records');
      if (!loaded) await loadStore(false);
      if (!loaded) return false;
      let next = mode === 'find' ? 'find' : 'create';
      if (next === 'create') {
        // Re-read before deciding: another device may have added the tag while
        // the menu was open. A stale index would create a duplicate record.
        if (!saving && changes === sentChanges) await loadStore(false);
        if (!tagReady) return false;
        if (model.tagExists(state.store, phrase)) {
          next = 'find';
          setStatus(x('That tag already has a record. Showing it.'), '');
        }
      }
      if (next === 'find') {
        state.query = phrase;
        searchInput.value = phrase;
        render();
        setTimeout(() => searchInput.focus({ preventScroll: true }), 0);
        return true;
      }
      state.query = '';
      searchInput.value = '';
      const res = model.addRecord(state.store, phrase, null, Date.now(), [phrase]);
      if (!res.ok) { setStatus(x('A record needs a title.'), 'error'); render(); return false; }
      state.openRows.add(res.record.id);
      markChanged();
      render();
      if (tagHighlight) scheduleTagScan(50);
      setTimeout(() => {
        const text = listEl.querySelector(`.neo-record[data-id="${CSS.escape(res.record.id)}"] .neo-record-text`);
        if (text) text.focus({ preventScroll: true });
      }, 0);
      return true;
    }
  };
})();
