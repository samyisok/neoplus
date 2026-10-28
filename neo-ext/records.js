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
  let readOnly = false;
  let statusText = '';
  let statusKind = '';
  let saveTimer = 0;
  let saving = false;
  let changes = 0;
  let sentChanges = 0;
  let pendingAdopt = null;
  let searchTimer = 0;

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

  const highlight = window.NeoRecordTagHighlight
    ? window.NeoRecordTagHighlight.create({
      x,
      api,
      model,
      tagRules,
      store: () => state.store,
      host: document.getElementById('counters')
    })
    : null;
  const hl = highlight || {
    update() {}, schedule() {}, scheduleChapter() {}, scanChapter() {}, clear() {}, isOn: () => false, eye: null
  };
  const tagReady = () => loaded && !readOnly;

  function moreOn() {
    try { return !!api.moreFeatures(); } catch { return false; }
  }

  function allowedTab() {
    const tab = api.currentTabName();
    return tab === 'manuscript' || tab === 'notes';
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
      else if (res && res.reason === 'unsupported') setStatus(x('Records are not available in this build'), 'error');
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
    hl.schedule(50);
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
      if (res && res.reason === 'cloud') setStatus(x('Records are in iCloud and not available yet.'), 'cloud');
      else if (res && res.reason === 'unsupported') setStatus(x('Records are not available in this build'), 'error');
      else if (res && res.reason === 'unreadable') setStatus(x('Records could not be read. The file has been left untouched.'), 'unreadable');
      else if (res && res.reason === 'large') { readOnly = true; setStatus(x('Records could not be read: the file is too large.'), 'unreadable'); }
      else setStatus(x('Records could not be read.'), 'error');
      render();
      return false;
    }
    if (saving || changes !== gen) return false;
    readOnly = false;
    loaded = true;
    state.store = res.store;
    hl.schedule(50);
    setStatus('');
    render();
    return true;
  }

  function render() {
    applyTabs();
    hl.update();
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
    if (!visible) {
      state.tagDraft = null;
      state.tagConfirm = null;
    }
    if (!visible && state.view === 'records') setView('notes');
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
      state.tagConfirm = null;
      state.tagDraft = null;
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
      hl.schedule(50);
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
      if (res.ok) { markChanged(); hl.schedule(50); }
      render();
    },
    startTagAdd(id) { state.tagDraft = { id, text: '' }; state.tagConfirm = null; render(); },
    tagTyped(text) { if (state.tagDraft) state.tagDraft.text = text; },
    commitTag(id, text) {
      const clean = String(text || '').trim();
      if (!clean) { state.tagDraft = null; render(); return; }
      const res = model.addTag(state.store, id, clean, Date.now());
      state.tagDraft = null;
      if (!res.ok) {
        const why = res.reason === 'many' ? x('A record can have {n} tags.', { n: tagRules.MAX_TAGS })
          : res.reason === 'long' ? x('That tag is too long.')
            : res.reason === 'missing' ? x('That record is gone.')
              : x('That tag was not accepted.');
        setStatus(why, 'error');
      } else { markChanged(); hl.schedule(50); }
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
    hl.update();
    hl.schedule(100);
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
        hl.update();
        if (!moreOn()) hl.clear();
        else hl.schedule(50);
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

  applyTabs();
  if (moreOn()) loadStore(false);

  window.NeoRecords = {
    tagReady,
    tagScans: () => hl.stats(),
    tagExists: (text) => tagReady() && model.tagExists(state.store, text),
    lookUpItem(word) {
      try {
        if (!moreOn() || !tagReady() || !api.onManuscriptTab() || !word || word.length > tagRules.MAX_TAG) return null;
        const find = model.tagExists(state.store, word);
        return {
          label: x(find ? 'Find Record…' : 'Create Record…'),
          value: tagRules.tagAction(find)
        };
      } catch { return null; }
    },
    async openFromSelection(phrase, mode) {
      if (!moreOn() || !phrase) return false;
      api.pinSidePane();
      setView('records');
      if (!loaded) await loadStore(false);
      if (!loaded) return false;
      let next = tagRules.tagMode(mode === 'find' ? 'record-find' : 'record-create') || 'create';
      if (next === 'create') {
        // Re-read before deciding: another device may have added the tag while
        // the menu was open. A stale index would create a duplicate record.
        if (!saving && changes === sentChanges) await loadStore(false);
        if (!tagReady()) return false;
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
      if (!res.ok) {
        setStatus(res.reason === 'tag' ? x('That tag was not accepted.') : x('A record needs a title.'), 'error');
        render();
        return false;
      }
      state.openRows.add(res.record.id);
      markChanged();
      render();
      hl.schedule(50);
      setTimeout(() => {
        const text = listEl.querySelector(`.neo-record[data-id="${CSS.escape(res.record.id)}"] .neo-record-text`);
        if (text) text.focus({ preventScroll: true });
      }, 0);
      return true;
    }
  };
})();
