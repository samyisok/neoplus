// NEO fork — renderer boot for neo-ext (adr-001)
//
// Loaded last on the page. Wires the fork menu messages, registers the
// Settings groups, and gives the window its own toast (NEO's #hint is
// text-only, and the backup result carries a Reveal action).

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
  window.NeoExt = { toast, backupBook, openSettings: () => window.NeoSettings.open() };
})();
