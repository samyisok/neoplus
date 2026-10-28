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
  let saving = false;
  let changes = 0;

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
  modalHost.className = 'neo-inv-backdrop';
  modalHost.setAttribute('role', 'dialog');
  modalHost.setAttribute('aria-modal', 'true');

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
    return api.chapterTitle(id) || x('Chapter');
  }

  function active() {
    return !view.hidden;
  }

  let loadToken = 0;

  async function load() {
    const id = openBookId();
    const token = ++loadToken;
    // Nothing may be written for the new book until its ledger is in hand.
    state.loaded = false;
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
    reconcile();
    render();
    return true;
  }

  function markChanged() {
    changes += 1;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, SAVE_MS);
  }

  async function flush() {
    clearTimeout(saveTimer);
    saveTimer = 0;
    if (saving || !state.loaded || state.readOnly || !changes) return;
    if (!bridge.inventoryWrite) { setStatus(x('Inventory is not available in this build'), 'error'); return; }
    const book = state.book;
    if (book !== openBookId()) { state.loaded = false; return; }
    const gen = changes;
    saving = true;
    let res;
    try { res = await bridge.inventoryWrite(book, state.store); } catch (err) { res = { ok: false, reason: String(err && err.message || err) }; }
    saving = false;
    if (state.book !== book || openBookId() !== book) return;
    if (!res || !res.ok) {
      const why = res && res.reason === 'large' ? x('Inventory could not be saved: the ledger is too large.')
        : res && res.reason === 'unreadable' ? x('Inventory could not be saved. The ledger has been left untouched.')
          : res && res.reason === 'cloud' ? x('Inventory is in iCloud and cannot be saved yet.')
            : x('Inventory could not be saved.');
      setStatus(why, 'error');
      if (changes) setTimeout(flush, 3000);
      return;
    }
    if (state.book !== openBookId()) return;
    const merged = model.merge(res.store, state.store, Date.now());
    if (merged.ok) state.store = merged.store;
    if (changes === gen) { changes = 0; setStatus(''); } else setTimeout(flush, 20);
    render();
  }

  // ── the book's text, as the reconciler needs it ──────────────────────────

  const PARAGRAPH = 'p, li, h1, h2, h3, h4, h5, h6';

  function paragraphList(bodyEl) {
    return [...bodyEl.querySelectorAll(PARAGRAPH)].filter((node) => !node.closest('.chapter-body') || node.closest('.chapter-body') === bodyEl);
  }

  function paragraphNodes(bodyEl) {
    return paragraphList(bodyEl).filter((node) => !node.classList.contains('ghost'));
  }

  // One reading of core's section claiming: a claim starts at its first
  // paragraph and runs to the next claim within the same scene segment.
  function sectionMap(bodyEl) {
    const id = chapterIdOf(bodyEl);
    const notes = (api.sectionNotes() || {})[id] || [];
    const keys = new Set(notes.map((note) => note.id));
    const nodes = paragraphNodes(bodyEl);
    const indexOf = new Map(nodes.map((node, index) => [node, index]));
    const sections = [];
    const claimed = new Set();
    let current = null;
    for (const node of bodyEl.children) {
      if (node.classList && node.classList.contains('scene-break')) { current = null; continue; }
      if (!indexOf.has(node)) continue;
      const claim = node.dataset && node.dataset.secId;
      if (claim && keys.has(claim) && !claimed.has(claim)) {
        current = { id: claim, paragraphs: [] };
        claimed.add(claim);
        sections.push(current);
      }
      if (current) current.paragraphs.push(indexOf.get(node));
    }
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

  function bookTexts() {
    const chapters = [];
    const unknown = [];
    for (const id of order()) {
      const bodyEl = document.querySelector(`.chapter[data-id="${CSS.escape(id)}"] .chapter-body`);
      if (!bodyEl) { unknown.push(id); continue; }
      chapters.push({ id, paragraphs: paragraphsFor(bodyEl), sections: sectionsFor(bodyEl) });
    }
    return { chapters, cards: api.cardTexts(), unknown };
  }

  function reconcile() {
    if (!state.loaded || !state.store.transactions.length) return;
    const out = anchorRules.reconcile(state.store, bookTexts(), Date.now());
    state.store = out.store;
    if (out.changed) markChanged();
  }

  function scheduleReconcile(ms = RECONCILE_MS) {
    if (!state.loaded) return;
    clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(() => {
      if (state.book !== openBookId()) { load(); return; }
      reconcile();
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

  function render() {
    if (!active()) return;
    const asOf = chapterId();
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
      const go = el('button', 'neo-inv-line-go', `${chapterName(transaction.chapterId)}: ${numberText(transaction.amount)}`);
      go.type = 'button';
      go.disabled = !transaction.quote;
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
    state.modal = {
      phrase: String(phrase).slice(0, model.MAX_QUOTE),
      anchor: anchor || null,
      query: '',
      itemId: '',
      name: '',
      category: DEFAULT_CATEGORY,
      amount: '',
      error: ''
    };
    renderModal();
    return true;
  }

  function closeModal() {
    state.modal = null;
    modalHost.hidden = true;
    modalHost.innerHTML = '';
  }

  function renderModal() {
    const modal = state.modal;
    if (!modal) { modalHost.hidden = true; return; }
    modalHost.hidden = false;
    modalHost.innerHTML = '';
    const card = el('div', 'neo-inv-modal');
    card.setAttribute('role', 'document');
    card.append(el('h2', 'neo-inv-title', x('Inventory')));
    card.append(el('p', 'neo-inv-quote', modal.phrase));

    const label = el('label', 'neo-inv-label', x('Item'));
    const search = el('input', 'neo-inv-search');
    search.type = 'search';
    search.placeholder = x('Find an item');
    search.value = modal.query;
    search.addEventListener('input', () => { modal.query = search.value; renderModal(); });
    label.appendChild(search);
    card.appendChild(label);

    const list = el('div', 'neo-inv-items');
    const sums = new Map(model.balances(state.store, order(), chapterId() || null).map((row) => [row.itemId, row.amount]));
    const items = model.activeItems(state.store).filter((item) => !modal.query || item.name.toLowerCase().includes(modal.query.toLowerCase()));
    for (const item of items) {
      const pick = el('button', 'neo-inv-pick' + (modal.itemId === item.id ? ' is-picked' : ''));
      pick.type = 'button';
      pick.textContent = `${item.name} — ${numberText(sums.get(item.id) || 0)}`;
      pick.addEventListener('click', () => { modal.itemId = item.id; modal.error = ''; renderModal(); });
      list.appendChild(pick);
    }
    if (!items.length) list.appendChild(el('p', 'neo-inv-empty', x('No items yet.')));
    card.appendChild(list);

    const newBox = el('div', 'neo-inv-new');
    newBox.append(el('h3', 'neo-inv-subtitle', x('Or a new item')));
    const name = el('input', 'neo-inv-name-input');
    name.type = 'text';
    name.placeholder = x('Name');
    name.value = modal.name;
    name.addEventListener('input', () => { modal.name = name.value; });
    const category = el('input', 'neo-inv-category-input');
    category.type = 'text';
    category.placeholder = x('Category');
    category.value = modal.category;
    category.addEventListener('input', () => { modal.category = category.value; });
    newBox.append(name, category);
    card.appendChild(newBox);

    const amountLabel = el('label', 'neo-inv-label', x('Amount'));
    const amount = el('input', 'neo-inv-amount-input');
    amount.type = 'text';
    amount.inputMode = 'decimal';
    amount.placeholder = '+200 or -50';
    amount.value = modal.amount;
    amount.addEventListener('input', () => { modal.amount = amount.value; });
    amountLabel.appendChild(amount);
    card.appendChild(amountLabel);

    if (modal.error) card.append(el('p', 'neo-inv-error', modal.error));

    const actions = el('div', 'neo-inv-actions');
    const save = el('button', 'neo-inv-save', x('Save'));
    save.type = 'button';
    save.addEventListener('click', saveModal);
    const cancel = el('button', 'neo-inv-cancel', x('Cancel'));
    cancel.type = 'button';
    cancel.addEventListener('click', closeModal);
    actions.append(save, cancel);
    card.appendChild(actions);
    modalHost.appendChild(card);
    setTimeout(() => search.focus({ preventScroll: true }), 0);
  }

  function saveModal() {
    const modal = state.modal;
    if (!modal) return;
    if (!state.loaded || state.readOnly) {
      modal.error = x('Inventory could not be read. The ledger has been left untouched.');
      renderModal();
      return;
    }
    if (!String(modal.amount).trim()) { modal.error = x('Enter a number for the amount.'); renderModal(); return; }
    const amount = Number(String(modal.amount).replace(',', '.'));
    if (!Number.isFinite(amount) || Math.abs(amount) > model.MAX_AMOUNT) { modal.error = x('Enter a number for the amount.'); renderModal(); return; }
    const next = JSON.parse(JSON.stringify(state.store));
    let itemId = modal.itemId;
    if (!itemId) {
      const created = model.addItem(next, modal.name, modal.category, Date.now());
      if (!created.ok) { modal.error = x('An item needs a name.'); renderModal(); return; }
      itemId = created.item.id;
    }
    const added = model.addTransaction(next, {
      itemId,
      chapterId: modal.anchor && modal.anchor.chapterId ? modal.anchor.chapterId : chapterId(),
      sectionId: modal.anchor ? modal.anchor.sectionId : '',
      paragraph: modal.anchor ? modal.anchor.paragraph : 0,
      quote: modal.phrase,
      hash: modal.anchor ? modal.anchor.hash : '',
      amount
    }, Date.now());
    if (!added.ok) { modal.error = x('That transaction could not be saved.'); renderModal(); return; }
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
    const map = sectionMap(bodyEl);
    const index = map.nodes.indexOf(context.paragraphEl);
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
      return !!(api.bookId() && api.moreFeatures() && api.onManuscriptTab() && !state.readOnly);
    } catch { return false; }
  }

  // ── wiring ───────────────────────────────────────────────────────────────

  function onShow() {
    if (state.book !== openBookId() || !state.loaded) load();
    else { reconcile(); render(); }
  }

  function onHide() {
    flush();
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
    if (document.querySelector('.modal-backdrop:not([hidden])')) return;
    const target = e.target;
    const inside = (target && view.contains(target)) || document.activeElement === view;
    if (!inside) return;
    e.preventDefault();
    e.stopPropagation();
  }, true);

  modalHost.addEventListener('click', (e) => { if (e.target === modalHost) closeModal(); });

  const chapters = document.getElementById('chapters');
  if (chapters) {
    chapters.addEventListener('input', () => { if (state.loaded) scheduleReconcile(); });
      chapters.addEventListener('focusin', () => { if (bookChanged()) return; if (active()) render(); });
    new MutationObserver(() => { if (state.loaded) scheduleReconcile(); })
      .observe(chapters, { childList: true, subtree: true });
  }
  window.addEventListener('focus', () => { if (bookChanged()) return; if (state.loaded) scheduleReconcile(300); });
  window.addEventListener('blur', () => { flush(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { flush(); return; }
    if (state.loaded) scheduleReconcile(300);
  });
  window.addEventListener('pagehide', () => { flush(); });

  window.neo?.onMenu?.((msg) => {
    if (!msg) return;
    if (msg.type === 'moreFeatures' && !msg.checked) flush();
  });

  // A book switch happens while the view may be open; the ledger belongs to
  // the book, so a different id reloads before anything is drawn.
  const editor = document.getElementById('editor-view');
  if (editor) {
    new MutationObserver(() => {
      if (state.book !== openBookId()) {
        closeModal();
        state.item = null;
        state.confirming = null;
        if (openBookId()) load();
      }
    }).observe(editor, { attributes: true, attributeFilter: ['class', 'hidden'] });
  }

  register();
})();
