// NEO fork — Inventory in the right-hand pane (adr-008)
//
// The pane's third view: balances as of the open chapter, one log per item, and
// the modal that records a transaction against a selected phrase. The ledger is
// the book's; the page is only read, never written.

'use strict';

(function () {
  const model = window.NeoInventoryLedger;
  const anchorRules = window.NeoInventoryAnchor;
  const api = window.NeoExtApi;
  if (!model || !anchorRules || !api) return;

  const bridge = window.NeoForkNative || {};
  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);
  const SAVE_MS = 600;
  const RECONCILE_MS = 1200;
  const DEFAULT_CATEGORY = model.DEFAULT_CATEGORY;

  const state = {
    store: model.empty(),
    book: '',
    loaded: false,
    readOnly: false,
    status: '',
    statusKind: '',
    item: null,
    folded: new Set(),
    confirming: null,
    modal: null
  };

  let saveTimer = 0;
  let reconcileTimer = 0;

  const el = (tag, cls, text) => {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  };

  const view = el('section', 'neo-inventory-view');
  view.id = 'neo-inventory-view';
  view.hidden = true;
  const head = el('div', 'neo-inv-head');
  const where = el('div', 'neo-inv-where');
  where.id = 'neo-inventory-where';
  const status = el('div', 'neo-inv-status');
  status.id = 'neo-inventory-status';
  status.hidden = true;
  head.append(where, status);
  const body = el('div', 'neo-inv-body');
  body.id = 'neo-inventory-body';
  view.append(head, body);

  const modalHost = el('div', 'neo-inv-backdrop');
  modalHost.id = 'neo-inventory-modal';
  modalHost.hidden = true;
  modalHost.className = 'modal-backdrop neo-inv-backdrop';
  modalHost.setAttribute('role', 'dialog');
  modalHost.setAttribute('aria-modal', 'true');
  modalHost.setAttribute('aria-labelledby', 'neo-inv-modal-title');

  const numberText = (value) => {
    const n = Math.round(Number(value) * 100) / 100;
    return n > 0 ? '+' + String(n) : String(n);
  };

  function setStatus(text, kind = '') {
    state.status = text || '';
    state.statusKind = kind;
    status.hidden = !state.status;
    status.textContent = state.status;
    status.classList.toggle('is-error', kind === 'error');
  }

  function openBookId() {
    return api.bookId();
  }

  function chapterId() {
    return api.currentChapter();
  }

  function order() {
    return api.chapterOrder();
  }

  function chapterName(id) {
    return api.chapterTitle(id) || api.chapterNameOf(id) || x('Chapter');
  }

  function active() {
    return !view.hidden;
  }

  function enabled() {
    try { return !!(api.moreFeatures() && api.bookId()); } catch { return false; }
  }

  let loadToken = 0;
  let waiting = false;

  async function load() {
    if (!enabled()) { state.loaded = false; render(); return false; }
    const id = openBookId();
    if (pending.size) await flush();
    const token = ++loadToken;
    // Nothing may be written for the new book until its ledger is in hand.
    state.loaded = false;
    if (id !== state.book) {
      state.store = model.empty();
      state.item = null;
      state.confirming = null;
    }
    state.book = id;
    if (!id) { state.store = model.empty(); state.loaded = false; render(); return false; }
    if (!bridge.inventoryRead) { state.readOnly = true; setStatus(x('Inventory is not available in this build'), 'error'); render(); return false; }
    let res;
    try { res = await bridge.inventoryRead(id); } catch (err) { res = { ok: false, reason: String(err && err.message || err) }; }
    if (token !== loadToken || id !== openBookId()) return false;
    if (!res || !res.ok) {
      state.loaded = false;
      state.readOnly = true;
      const why = res && res.reason === 'cloud' ? x('Inventory is in iCloud and not available yet.')
        : res && res.reason === 'large' ? x('Inventory could not be read: the ledger is too large.')
          : res && res.reason === 'unreadable' ? x('Inventory could not be read. The ledger has been left untouched.')
            : x('Inventory could not be read.');
      setStatus(why, 'error');
      render();
      return false;
    }
    state.store = res.store;
    state.loaded = true;
    state.readOnly = false;
    setStatus('');
    await reconcile();
    render();
    return true;
  }

  // A pending save belongs to the book it was recorded in. The stores are held
  // by reference: loading another book replaces state.store, never this one.
  const pending = new Map();

  function markChanged() {
    pending.set(state.book, state.store);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_MS);
  }

  let flushChain = Promise.resolve();

  function flush() {
    flushChain = flushChain.then(doFlush, doFlush);
    return flushChain;
  }

  async function doFlush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (!pending.size) return;
    if (!bridge.inventoryWrite) { setStatus(x('Inventory is not available in this build'), 'error'); return; }
    while (pending.size) {
      const [book, store] = pending.entries().next().value;
      pending.delete(book);
      let res;
      try { res = await bridge.inventoryWrite(book, store); } catch (err) { res = { ok: false, reason: String(err && err.message || err) }; }
      if (!res || !res.ok) {
        // Keep the words for a retry; never trade them for a quiet failure. A
        // newer recording for the same book must not be replaced by this one.
        if (!pending.has(book)) pending.set(book, store);
        const why = res && res.reason === 'large' ? x('Inventory could not be saved: the ledger is too large.')
          : res && res.reason === 'unreadable' ? x('Inventory could not be saved. The ledger has been left untouched.')
            : res && res.reason === 'cloud' ? x('Inventory is in iCloud and cannot be saved yet.')
              : x('Inventory could not be saved.');
        setStatus(why, 'error');
        setTimeout(flush, 3000);
        return;
      }
      const merged = model.merge(res.store, store, Date.now());
      if (state.book === book && state.store === store && merged.ok) state.store = merged.store;
    }
    if (!waiting) state.statusKind = '';
    if (!waiting) setStatus('');
    render();
  }

  // ── the book's text, as the reconciler needs it ──────────────────────────

  function paragraphNodes(bodyEl) {
    return api.paragraphNodes(bodyEl);
  }

  // Core's claiming rule decides a paragraph's section; a ghost has none, but
  // its text still counts when the reconciler looks for a quote.
  function sectionMap(bodyEl) {
    const nodes = paragraphNodes(bodyEl);
    const sections = [];
    let current = null;
    nodes.forEach((node, index) => {
      if (node.classList.contains('scene-break')) { current = null; return; }
      const id = api.sectionFor(bodyEl, node) || '';
      if (id && (!current || current.id !== id)) {
        current = { id, paragraphs: [] };
        sections.push(current);
      }
      if (current) current.paragraphs.push(index);
    });
    return {
      nodes,
      sections,
      forIndex(index) {
        return sections.find((section) => section.paragraphs.includes(index)) || null;
      },
      text(section) {
        if (!section) return '';
        return section.paragraphs.map((index) => nodes[index]?.textContent || '').join(' ');
      }
    };
  }

  function chapterIdOf(bodyEl) {
    return bodyEl.closest('.chapter')?.dataset.id || '';
  }

  function paragraphsFor(bodyEl) {
    return paragraphNodes(bodyEl).map((node) => node.textContent || '');
  }

  function sectionsFor(bodyEl) {
    return sectionMap(bodyEl).sections;
  }

  async function bookTexts(scope = '') {
    const ids = scope ? [scope] : order();
    const chapters = [];
    const unknown = [];
    for (const id of ids) {
      const bodyEl = api.chapterBody(id);
      if (!bodyEl) { unknown.push(id); continue; }
      chapters.push({ id, paragraphs: paragraphsFor(bodyEl), sections: sectionsFor(bodyEl) });
    }
    // A scoped pass is the typed chapter only; the iCloud probe is for whole-book
    // passes, which are the ones that can retire something.
    if (!scope) {
      const unread = await api.unreadChapters();
      const away = unread.ok ? unread.ids : order();
      for (const id of away) if (!unknown.includes(id)) unknown.push(id);
    }
    return { chapters, cards: scope ? [] : api.cardTexts(), unknown };
  }

  async function reconcile(scope = '') {
    if (!state.loaded || !enabled() || !state.store.transactions.length) return;
    const book = state.book;
    const texts = await bookTexts(scope);
    if (state.book !== book || !state.loaded) return;
    if (texts.unknown.length) {
      waiting = true;
      setStatus(x('Waiting for a chapter to arrive.'));
      return;
    }
    waiting = false;
    if (scope) texts.scope = scope;
    if (state.statusKind !== 'error') setStatus('');
    const out = anchorRules.reconcile(state.store, texts, Date.now());
    if (state.book !== book) return;
    state.store = out.store;
    if (out.changed) markChanged();
  }

  function scheduleReconcile(ms = RECONCILE_MS, scope = '') {
    if (!state.loaded || !enabled()) return;
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(async () => {
      if (state.book !== openBookId()) { await load(); return; }
      await reconcile(scope);
      render();
    }, ms);
  }

  function bookChanged() {
    if (!state.loaded && !state.book) return false;
    if (state.book === openBookId()) return false;
    load();
    return true;
  }

  // ── view ─────────────────────────────────────────────────────────────────

  let renderedChapter = null;

  function render() {
    if (!active()) return;
    const asOf = chapterId();
    renderedChapter = asOf;
    where.textContent = asOf ? x('As of {chapter}', { chapter: chapterName(asOf) }) : x('Whole book');
    body.innerHTML = '';
    if (!state.loaded && state.status) return;
    const sums = new Map(model.balances(state.store, order(), asOf || null).map((row) => [row.itemId, row.amount]));
    const items = model.activeItems(state.store);
    if (!items.length) {
      body.appendChild(el('p', 'neo-inv-empty', x('No inventory yet. Select a phrase in a chapter and choose Inventory…')));
      return;
    }
    const groups = new Map();
    for (const item of items) {
      const category = item.category || DEFAULT_CATEGORY;
      if (!groups.has(category)) groups.set(category, []);
      groups.get(category).push(item);
    }
    for (const [category, list] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      const folded = state.folded.has(category);
      const heading = el('button', 'neo-inv-category');
      heading.type = 'button';
      heading.setAttribute('aria-expanded', folded ? 'false' : 'true');
      heading.textContent = `${folded ? '▸' : '▾'} ${category}`;
      heading.addEventListener('click', () => {
        if (state.folded.has(category)) state.folded.delete(category); else state.folded.add(category);
        render();
      });
      body.appendChild(heading);
      if (folded) continue;
      for (const item of list) {
        const amount = sums.get(item.id) || 0;
        const row = el('div', 'neo-inv-item');
        row.dataset.id = item.id;
        const name = el('button', 'neo-inv-name', item.name);
        name.type = 'button';
        name.setAttribute('aria-expanded', state.item === item.id ? 'true' : 'false');
        name.addEventListener('click', () => { state.item = state.item === item.id ? null : item.id; render(); });
        const value = el('span', 'neo-inv-amount', numberText(amount));
        row.append(name, value);
        body.appendChild(row);
        if (state.item === item.id) body.appendChild(logBox(item));
      }
    }
  }

  function logBox(item) {
    const box = el('div', 'neo-inv-log');
    box.id = 'neo-inventory-log';
    const rows = model.log(state.store, order(), chapterId() || null, item.id);
    for (const transaction of state.store.transactions) {
      if (transaction.itemId !== item.id || transaction.removedAt) continue;
      if (order().includes(transaction.chapterId)) continue;
      if (!rows.includes(transaction)) rows.push(transaction);
    }
    if (!rows.length) {
      box.appendChild(el('p', 'neo-inv-empty', x('No transactions up to this chapter.')));
      return box;
    }
    for (const transaction of rows) {
      const line = el('div', 'neo-inv-line');
      line.dataset.id = transaction.id;
      if (state.confirming === transaction.id) {
        line.append(el('span', '', x('Remove this transaction?')));
        const yes = el('button', 'neo-inv-remove-confirm', x('Remove'));
        yes.type = 'button';
        yes.addEventListener('click', () => {
          model.retireTransaction(state.store, transaction.id, Date.now());
          state.confirming = null;
          markChanged();
          render();
        });
        const no = el('button', 'neo-inv-remove-cancel', x('Cancel'));
        no.type = 'button';
        no.addEventListener('click', () => { state.confirming = null; render(); });
        line.append(yes, no);
        box.appendChild(line);
        continue;
      }
      const label = order().includes(transaction.chapterId) ? chapterName(transaction.chapterId) : x('Unplaced');
      const go = el('button', 'neo-inv-line-go', `${label}: ${numberText(transaction.amount)}`);
      go.type = 'button';
      go.disabled = !transaction.quote || !api.phraseLocatable({ chapterId: transaction.chapterId, quote: transaction.quote });
      go.addEventListener('click', () => {
        if (!api.revealPhrase || !api.revealPhrase({ chapterId: transaction.chapterId, quote: transaction.quote, paragraph: transaction.paragraph })) {
          setStatus(x('That phrase is no longer on the page.'), 'error');
        }
      });
      const remove = el('button', 'neo-inv-remove', '×');
      remove.type = 'button';
      remove.setAttribute('aria-label', x('Remove transaction'));
      remove.addEventListener('click', (event) => { event.stopPropagation(); state.confirming = transaction.id; render(); });
      line.append(go, remove);
      box.appendChild(line);
    }
    return box;
  }

  // ── the modal ────────────────────────────────────────────────────────────

  async function openFromSelection(phrase, anchor) {
    if (!phrase) return false;
    if (!canRecord()) return false;
    if (!document.getElementById('neo-inventory-view')) return false;
    if (document.querySelector('.modal-backdrop:not([hidden])')) return false;
    if (anchor && anchor.quote && anchor.quote.length > model.MAX_QUOTE) return false;
    if (!state.loaded || state.book !== openBookId()) {
      const ready = await load();
      if (!ready) {
        setStatus(x('Inventory could not be read. The ledger has been left untouched.'), 'error');
        return false;
      }
    }
    modalReturn = document.activeElement && document.activeElement !== document.body ? document.activeElement : null;
    state.modal = {
      phrase: String(phrase).slice(0, model.MAX_QUOTE),
      anchor: anchor || null,
      query: '',
      itemId: '',
      name: '',
      category: DEFAULT_CATEGORY,
      amount: '',
      newItem: false,
      focusSearch: true,
      focusSelector: '',
      scrollTop: 0,
      error: ''
    };
    renderModal();
    return true;
  }

  let modalReturn = null;

  function closeModal() {
    state.modal = null;
    modalHost.hidden = true;
    modalHost.innerHTML = '';
    try {
      if (modalReturn && modalReturn.isConnected && typeof modalReturn.focus === 'function') modalReturn.focus({ preventScroll: true });
      else document.querySelector('#neo-side-tabs [data-view="inventory"]')?.focus({ preventScroll: true });
    } catch { /* the page moved */ }
    modalReturn = null;
  }

  function failModal(text, field) {
    const modal = state.modal;
    if (!modal) return;
    const list = document.querySelector('.neo-inv-items');
    if (list) modal.scrollTop = list.scrollTop;
    modal.error = text;
    modal.focusSelector = field || '.neo-inv-save';
    renderModal();
  }

  // One projection of the message; every handler clears or sets it here.
  let errorNode = null;
  let errorAnchor = null;

  function showError(text) {
    const modal = state.modal;
    if (!modal) return;
    modal.error = text;
    if (!errorNode && errorAnchor) {
      errorNode = el('p', 'neo-inv-error');
      errorNode.setAttribute('role', 'alert');
      errorAnchor.parentNode?.insertBefore(errorNode, errorAnchor);
    }
    if (errorNode) errorNode.textContent = text;
  }

  function clearError() {
    const modal = state.modal;
    if (modal) modal.error = '';
    if (errorNode) { errorNode.remove(); errorNode = null; }
  }

  function renderModal() {
    const modal = state.modal;
    if (!modal) { modalHost.hidden = true; return; }
    modalHost.hidden = false;
    modalHost.innerHTML = '';
    const card = el('div', 'modal neo-inv-modal');
    card.setAttribute('role', 'document');
    const heading = el('h2', 'neo-inv-title', x('Inventory'));
    heading.id = 'neo-inv-modal-title';
    card.append(heading, el('p', 'neo-inv-quote', modal.phrase));

    const search = el('input', 'neo-inv-search');
    search.type = 'search';
    search.placeholder = x('Find an item');
    search.setAttribute('aria-label', x('Find an item'));
    search.value = modal.query;
    card.appendChild(search);

    const list = el('div', 'neo-inv-items');
    const sums = new Map(model.balances(state.store, order(), chapterId() || null).map((row) => [row.itemId, row.amount]));

    function fillItems() {
      list.innerHTML = '';
      const all = model.activeItems(state.store);
      const picked = modal.itemId ? all.find((item) => item.id === modal.itemId) : null;
      const matching = all.filter((item) => !modal.query || item.name.toLowerCase().includes(modal.query.toLowerCase()));
      // A picked item stays visible even when the query excludes it: Save must
      // record what the writer can see.
      const items = picked && !matching.includes(picked) ? [picked, ...matching] : matching;
      for (const item of items) {
        const pick = el('button', 'neo-inv-pick' + (modal.itemId === item.id ? ' is-picked' : ''));
        pick.type = 'button';
        pick.dataset.id = item.id;
        pick.textContent = `${item.name} — ${numberText(sums.get(item.id) || 0)}`;
        pick.addEventListener('click', () => {
          modal.itemId = item.id;
          modal.focusSearch = false;
          clearError();
          for (const other of list.querySelectorAll('.neo-inv-pick')) other.classList.toggle('is-picked', other === pick);
          pick.focus({ preventScroll: true });
        });
        list.appendChild(pick);
      }
      if (!items.length) list.appendChild(el('p', 'neo-inv-empty', x('No items yet.')));
    }

    fillItems();
    search.addEventListener('input', () => { modal.query = search.value; clearError(); fillItems(); list.scrollTop = 0; });
    card.appendChild(list);

    const toggle = el('button', 'neo-inv-new-toggle', `${modal.newItem ? '−' : '+'} ${x('New item')}`);
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', modal.newItem ? 'true' : 'false');
    toggle.addEventListener('click', () => {
      modal.scrollTop = list.scrollTop;
      modal.newItem = !modal.newItem;
      modal.error = '';
      if (modal.newItem) modal.itemId = '';
      modal.focusSelector = modal.newItem ? '.neo-inv-name-input' : '.neo-inv-new-toggle';
      renderModal();
    });
    card.appendChild(toggle);

    if (modal.newItem) {
      const newBox = el('div', 'neo-inv-new');
      const name = el('input', 'neo-inv-name-input');
      name.type = 'text';
      name.placeholder = x('Name');
      name.setAttribute('aria-label', x('Name'));
      name.value = modal.name;
      name.addEventListener('input', () => {
        modal.name = name.value;
        modal.itemId = '';
        for (const other of list.querySelectorAll('.neo-inv-pick')) other.classList.remove('is-picked');
        clearError();
      });
      const category = el('input', 'neo-inv-category-input');
      category.type = 'text';
      category.placeholder = x('Category');
      category.setAttribute('aria-label', x('Category'));
      category.value = modal.category;
      category.addEventListener('input', () => { modal.category = category.value; clearError(); });
      newBox.append(name, category);
      card.appendChild(newBox);
    }

    const amountRow = el('label', 'neo-inv-amount-row');
    amountRow.append(el('span', 'neo-inv-amount-label', x('Amount')));
    const amount = el('input', 'neo-inv-amount-input');
    amount.type = 'text';
    amount.inputMode = 'numeric';
    amount.autocomplete = 'off';
    amount.placeholder = x('+200 or -50');
    amount.value = modal.amount;
    amountRow.appendChild(amount);
    card.appendChild(amountRow);

    const actions = el('div', 'neo-inv-actions');
    const cancel = el('button', 'neo-inv-cancel', x('Cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', closeModal);
    const save = el('button', 'neo-inv-save', x('Save'));
    save.type = 'button';
    save.addEventListener('click', saveModal);
    actions.append(cancel, save);
    card.appendChild(actions);

    errorNode = null;
    errorAnchor = actions;
    if (modal.error) {
      errorNode = el('p', 'neo-inv-error', modal.error);
      errorNode.setAttribute('role', 'alert');
      card.insertBefore(errorNode, actions);
    }
    amount.addEventListener('input', () => {
      const caret = amount.selectionStart;
      const clean = model.parseAmountInput(amount.value);
      if (!clean.ok) {
        amount.value = modal.amount;
        try { amount.setSelectionRange(caret, caret); } catch { /* field moved */ }
        showError(clean.reason === 'sign' ? x('A number has one sign, at the start.') : x('Use whole numbers only.'));
        return;
      }
      if (amount.value !== clean.value) amount.value = clean.value;
      modal.amount = clean.value;
      clearError();
    });

    card.addEventListener('keydown', (e) => {
      if (e.key !== 'Tab') return;
      const focusable = [...card.querySelectorAll('button, input')].filter((node) => !node.disabled && node.tabIndex !== -1);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    modalHost.appendChild(card);
    list.scrollTop = modal.scrollTop || 0;
    const focusSelector = modal.focusSelector;
    modal.focusSelector = '';
    if (focusSelector) setTimeout(() => card.querySelector(focusSelector)?.focus({ preventScroll: true }), 0);
    else if (modal.focusSearch) {
      modal.focusSearch = false;
      setTimeout(() => search.focus({ preventScroll: true }), 0);
    }
  }

  function saveModal() {
    const modal = state.modal;
    if (!modal) return;
    if (!state.loaded || state.readOnly) {
      failModal(x('Inventory could not be read. The ledger has been left untouched.'));
      return;
    }
    if (state.book !== openBookId()) {
      failModal(x('The book changed. Nothing was saved.'));
      return;
    }
    const chapter = modal.anchor && modal.anchor.chapterId ? modal.anchor.chapterId : chapterId();
    if (!chapter || !order().includes(chapter)) {
      failModal(x('That chapter is no longer in the book. Nothing was saved.'));
      return;
    }
    const parsed = model.parseAmount(modal.amount);
    if (!parsed.ok) {
      failModal(parsed.reason === 'blank' ? x('Enter an amount.')
        : parsed.reason === 'range' ? x('That amount is too large.')
          : x('Enter a number for the amount.'), '.neo-inv-amount-input');
      return;
    }
    const amount = parsed.amount;
    const next = JSON.parse(JSON.stringify(state.store));
    let itemId = modal.itemId;
    if (!itemId && !modal.newItem) {
      modal.newItem = true;
      failModal(x('Pick an item or name a new one.'), '.neo-inv-name-input');
      return;
    }
    if (!itemId) {
      const created = model.addItem(next, modal.name, modal.category, Date.now());
      if (!created.ok) { failModal(x('An item needs a name.'), '.neo-inv-name-input'); return; }
      itemId = created.item.id;
    }
    const added = model.addTransaction(next, {
      itemId,
      chapterId: chapter,
      sectionId: modal.anchor ? modal.anchor.sectionId : '',
      paragraph: modal.anchor ? modal.anchor.paragraph : 0,
      quote: modal.phrase,
      hash: modal.anchor ? modal.anchor.hash : '',
      amount
    }, Date.now());
    if (!added.ok) { failModal(x('That transaction could not be saved.')); return; }
    state.store = next;
    state.item = itemId;
    markChanged();
    closeModal();
    render();
  }

  // ── selection ────────────────────────────────────────────────────────────

  function selectionAnchor(context) {
    if (!context || !context.body || !context.paragraphEl || !context.range) return null;
    const bodyEl = context.body;
    if (!context.paragraphEl || context.paragraphEl.classList.contains('ghost')) return null;
    const map = sectionMap(bodyEl);
    const index = map.nodes.indexOf(context.paragraphEl);
    if (index < 0) return null;
    const section = map.forIndex(index);
    return {
      chapterId: chapterIdOf(bodyEl),
      sectionId: section ? section.id : '',
      paragraph: index < 0 ? 0 : index,
      quote: context.phrase,
      hash: anchorRules.hashText(section ? map.text(section) : (context.paragraphEl.textContent || ''))
    };
  }

  function canRecord() {
    try {
      return !!(enabled() && api.onManuscriptTab() && !state.readOnly);
    } catch { return false; }
  }

  // ── wiring ───────────────────────────────────────────────────────────────

  function onShow() {
    state.folded = new Set();
    state.item = null;
    state.confirming = null;
    if (!enabled()) return;
    if (state.book !== openBookId() || !state.loaded) { load(); return; }
    reconcile().then(render);
  }

  function onHide() {
    flush();
    if (!enabled()) {
      clearTimeout(reconcileTimer);
      clearTimeout(saveTimer);
      state.loaded = false;
    }
  }

  function register() {
    if (window.NeoRecords && typeof window.NeoRecords.registerView === 'function') {
      window.NeoRecords.registerView({ id: 'inventory', label: x('Inventory'), element: view, show: onShow, hide: onHide });
    }
    document.body.appendChild(modalHost);
  }

  window.NeoInventory = {
    canRecord,
    selectionAnchor,
    openFromSelection,
    isOpen: () => active()
  };

  // A bare Esc in the ledger stays in the book; in the modal it closes.
  window.addEventListener('keydown', (e) => {
    if (!active() && !state.modal) return;
    if (e.key !== 'Escape') return;
    if (state.modal) { e.preventDefault(); e.stopPropagation(); closeModal(); return; }
    if (state.confirming) { e.preventDefault(); e.stopPropagation(); state.confirming = null; render(); return; }
    if (document.querySelector('.modal-backdrop:not([hidden])')) return;
    const target = e.target;
    const inside = (target && view.contains(target)) || document.activeElement === view;
    if (!inside) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  modalHost.addEventListener('click', (e) => { if (e.target === modalHost) closeModal(); });

  const chapters = api.chaptersRoot();
  if (chapters) {
    chapters.addEventListener('input', (e) => {
      if (!state.loaded || !enabled()) return;
      const body = e.target && e.target.closest && e.target.closest('.chapter-body');
      scheduleReconcile(RECONCILE_MS * 2, body ? chapterIdOf(body) : '');
    });
    chapters.addEventListener('focusin', () => { if (bookChanged()) return; if (active()) render(); });
    new MutationObserver(() => { if (state.loaded && enabled()) scheduleReconcile(); })
      .observe(chapters, { childList: true, subtree: true });
  }
  window.addEventListener('focus', () => { if (bookChanged()) return; if (state.loaded && enabled()) scheduleReconcile(300); });
  window.addEventListener('blur', () => { flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flush(); return; }
    if (state.loaded && enabled()) scheduleReconcile(300);
  });
  window.addEventListener('pagehide', () => { flush(); });

  // Scrolling or moving the caret can change the chapter without a click; the
  // balances follow within a frame.
  let chapterTick = 0;
  function onChapterMaybe() {
    if (!active() || chapterTick) return;
    chapterTick = requestAnimationFrame(() => {
      chapterTick = 0;
      if (active() && chapterId() !== renderedChapter) render();
    });
  }
  api.paperScroll()?.addEventListener('scroll', onChapterMaybe, { passive: true });
  document.addEventListener('selectionchange', onChapterMaybe);

  window.neo?.onMenu?.((msg) => {
    if (!msg || msg.type !== 'moreFeatures') return;
    if (!msg.checked) {
      flush();
      closeModal();
      clearTimeout(reconcileTimer);
      state.loaded = false;
    } else if (active()) {
      load();
    }
  });

  // A book switch happens while the view may be open; the ledger belongs to
  // the book, so a different id reloads before anything is drawn.
  const editor = api.editorView();
  if (editor) {
    new MutationObserver(() => {
      if (state.book !== openBookId()) {
        closeModal();
        state.item = null;
        state.confirming = null;
        flush().then(() => { if (openBookId() && state.book !== openBookId()) load(); });
      }
    }).observe(editor, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  register();
})();
