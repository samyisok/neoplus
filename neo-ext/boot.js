// NEO fork — renderer boot for neo-ext (adr-001)
//
// Loaded after settings.js and interface-size.js, and BEFORE the feature modules
// (rephrase, grammar, records, inventory, history): it wires the fork menu
// messages those modules answer, registers the Settings groups, and gives the
// window its own toast (NEO's #hint is text-only, and the backup result carries
// a Reveal action).

'use strict';

(function () {
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

  function toast(msg, { ms = 5000, action, run } = {}) {
    const el = document.createElement('div');
    el.className = 'neo-ext-toast';
    el.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.textContent = msg;
    el.appendChild(text);
    if (action) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'neo-ext-toast-action';
      button.textContent = action;
      button.addEventListener('click', () => {
        try { if (run) run(); } finally { el.remove(); }
      });
      el.appendChild(button);
    }
    document.body.appendChild(el);
    setTimeout(() => el.remove(), ms);
  }

  function css() {
    if (document.querySelector('link[data-neo-ext]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'neo-ext/neo-ext.css';
    link.dataset.neoExt = '1';
    document.head.appendChild(link);
  }

  async function backupBook() {
    const bridge = window.NeoForkNative;
    if (typeof book === 'undefined' || !book) { toast(x('Open a book first')); return; }
    if (!bridge) { toast(x('This build has no backup support')); return; }
    const settled = await window.NeoExtApi.flushAndConfirm();
    if (!settled) { toast(x('NEO could not finish saving. Try again in a moment.'), { ms: 7000 }); return; }
    let res = null;
    try { res = await bridge.backupBook(book.id); } catch (err) { res = { ok: false, error: String(err && err.message || err) }; }
    if (!res || !res.ok) {
      toast(x('Backup failed: {reason}', { reason: (res && res.error) || x('unknown error') }), { ms: 9000 });
      return;
    }
    const message = res.incomplete
      ? x('Backup incomplete — {n} file(s) left out. Saved to {path}', { n: (res.skipped || []).length, path: res.path })
      : x('Backup saved to {path}', { path: res.path });
    toast(message, {
      ms: 12000,
      action: x('Reveal'),
      run: () => bridge.revealBackup(res.path)
    });
  }

  function wireMenu() {
    if (!window.neo || typeof window.neo.onMenu !== 'function') return;
    window.neo.onMenu((msg) => {
      if (!msg || msg.type !== 'neo-ext') return;
      if (msg.action === 'settings') window.NeoSettings.open();
      else if (msg.action === 'backup-book') backupBook();
      else if (msg.action === 'thesaurus' && window.NeoThesaurus) window.NeoThesaurus.openWord(msg.word);
      else if (msg.action === 'dictionary' && window.NeoDictionary) window.NeoDictionary.openWord(msg.word);
      else if (msg.action === 'rephrase-open' && window.NeoRephrase) {
        try { window.NeoRephrase.openPending(); } catch { /* the page moved on */ }
      }
      else if (msg.action === 'grammar-open' && window.NeoGrammar) {
        try { window.NeoGrammar.openPending(); } catch { /* the page moved on */ }
      }
      else if (msg.action === 'inventory-open' && window.NeoInventory) {
        try {
          const opened = window.NeoInventory.openFromSelection(msg.phrase, msg.anchor);
          if (opened && typeof opened.catch === 'function') opened.catch(() => {});
        } catch { /* the page moved on */ }
      }
      else if (window.NeoRecords && window.NeoRecordTags) {
        const mode = window.NeoRecordTags.tagMode(msg.action)
          || (msg.action === 'record-find' ? 'find' : msg.action === 'record-create' ? 'create' : '');
        if (mode) {
          try {
            const opened = window.NeoRecords.openFromSelection(msg.phrase, mode);
            if (opened && typeof opened.catch === 'function') opened.catch(() => {});
          } catch { /* the page moved on */ }
        }
      }
    });
  }

  function registerGroups() {
    window.NeoSettings.registerGroup({
      id: 'backup',
      title: 'Backup',
      show: () => true,
      controls: (info) => [
        {
          key: 'backupFolder',
          type: 'path',
          label: 'Backup folder',
          defaultValue: (info && info.defaultFolder) || ''
        },
        {
          type: 'note',
          text: 'Manual backups copy the open book there. The daily backup writes a zip of the whole library there too. Default: {default}'
        }
      ],
      save: (values, { bookId }) => {
        const folder = values.__useDefault ? null : (values.backupFolder || null);
        return window.NeoForkNative.saveBackupSettings(folder, bookId);
      }
    });
  }

  css();
  registerGroups();
  wireMenu();
  // Seam 4: a book is open. The fork's views hear it without naming core's
  // openBook, so a view that is already showing can reload for the new book.
  function bookOpened(book) {
    try {
      window.dispatchEvent(new CustomEvent('neo-ext:book-opened', {
        detail: { id: book && typeof book.id === 'string' ? book.id : '' }
      }));
    } catch { /* a missing listener is not an error */ }
  }

  // Seam 12: how large the interface reads. The fork owns the policy (the
  // setting works in Simple NEO too); core keeps the fallback when the fork
  // is not loaded, as on Pocket.
  function uiZoom(library, more) {
    try {
      if (window.NeoInterfaceSize && typeof window.NeoInterfaceSize.uiZoomFor === 'function') {
        const size = window.NeoInterfaceSize.uiZoomFor(library);
        if (Number.isFinite(size)) return size;
      }
    } catch { /* fall through */ }
    try { if (more && typeof snapZoom === 'function') return snapZoom(library && library.uiZoom); } catch { /* fall through */ }
    return 1;
  }

  // Seam 14: the fork's own text size, published beside the interface size.
  function uiText(library) {
    try {
      if (window.NeoInterfaceSize && typeof window.NeoInterfaceSize.applyText === 'function') {
        window.NeoInterfaceSize.applyText(library);
      }
    } catch { /* the look applies on the next read */ }
  }

  window.NeoExt = {
    x,
    toast,
    backupBook,
    bookOpened,
    uiZoom,
    uiText,
    openSettings: () => window.NeoSettings.open(),
    lookUpMenu: (items, word) => (window.NeoWordContext ? window.NeoWordContext.lookUpMenu(items, word) : false),
    lookUpChoice: (choice, word) => { if (window.NeoWordContext) window.NeoWordContext.lookUpChoice(choice, word); }
  };

  // The library can resolve before this script finishes loading, in which case
  // core's first applyLook ran without the fork and Simple NEO sits at 100%.
  // Re-apply once now that NeoExt exists; later reads re-apply it as usual.
  try {
    if (typeof library !== 'undefined' && library && typeof applyFonts === 'function') applyFonts();
  } catch { /* the look applies on the next library read */ }
})();
