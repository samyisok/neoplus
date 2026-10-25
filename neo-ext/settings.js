// NEO fork — the Settings window (adr-001)
//
// A section registry: a group declares its title, its controls, when it
// should show, and how its values save. The window renders groups in order
// with one rule between them; adding a future group is a registerGroup()
// call, never a rebuild of this file's markup.

'use strict';

(function () {
  const groups = [];
  let openEl = null;
  let pending = false;
  let savedRange = null;

  const x = (s, vars) => {
    const dict = (typeof window !== 'undefined' && window.NeoExtLocale) || {};
    const text = typeof dict[s] === 'string' ? dict[s] : s;
    if (text !== s) {
      return vars ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
    }
    if (typeof t === 'function') {
      try { return t(s, vars); } catch { /* fall back to English */ }
    }
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };

  function registerGroup(group) {
    if (!group || !group.id) throw new Error('A settings group needs an id');
    const at = groups.findIndex((g) => g.id === group.id);
    if (at >= 0) groups[at] = group;
    else groups.push(group);
  }

  function shown(group) {
    if (typeof group.show !== 'function') return true;
    try { return !!group.show(); } catch { return true; }
  }

  function otherModalOpen() {
    return !!document.querySelector('.modal-backdrop:not([hidden])');
  }

  function rememberSelection() {
    try {
      const sel = window.getSelection();
      savedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
    } catch { savedRange = null; }
  }

  function restoreSelection() {
    if (!savedRange) return;
    try {
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(savedRange);
    } catch { /* the page moved on */ }
    savedRange = null;
  }

  function controlRow(group, control, values, info) {
    const id = `neo-ext-${group.id}-${control.key}`;
    const wrap = document.createElement('div');
    wrap.className = 'neo-ext-row';
    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = x(control.label);
    wrap.appendChild(label);

    if (control.type === 'path') {
      const line = document.createElement('div');
      line.className = 'neo-ext-pathline';
      const input = document.createElement('input');
      input.type = 'text';
      input.id = id;
      input.className = 'neo-ext-path';
      input.spellcheck = false;
      input.value = values[control.key] || control.defaultValue || '';
      input.placeholder = control.defaultValue || '';
      input.addEventListener('input', () => {
        values[control.key] = input.value.trim();
        values.__useDefault = false;
      });
      const choose = document.createElement('button');
      choose.type = 'button';
      choose.className = 'neo-ext-choose';
      choose.textContent = x('Choose…');
      choose.addEventListener('click', async () => {
        const bridge = window.NeoForkNative;
        if (!bridge || !bridge.pickBackupFolder) return;
        const picked = await bridge.pickBackupFolder(values[control.key] || control.defaultValue || '');
        if (typeof picked === 'string' && picked) {
          values[control.key] = picked;
          values.__useDefault = false;
          input.value = picked;
        }
      });
      line.append(input, choose);
      wrap.appendChild(line);

      const reset = document.createElement('button');
      reset.type = 'button';
      reset.className = 'neo-ext-reset';
      reset.textContent = x('Use Default');
      reset.addEventListener('click', () => {
        values[control.key] = '';
        values.__useDefault = true;
        input.value = control.defaultValue || '';
      });
      wrap.appendChild(reset);

      const hint = document.createElement('p');
      hint.className = 'neo-ext-hint';
      hint.textContent = x('Default: {path}', { path: control.defaultValue || '' });
      wrap.appendChild(hint);
      return wrap;
    }

    if (control.type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = id;
      input.className = 'neo-ext-path';
      input.value = values[control.key] || control.defaultValue || '';
      input.addEventListener('input', () => { values[control.key] = input.value; });
      wrap.appendChild(input);
      return wrap;
    }

    if (control.type === 'checkbox') {
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = id;
      input.checked = !!values[control.key];
      input.addEventListener('change', () => { values[control.key] = input.checked; });
      wrap.appendChild(input);
      return wrap;
    }

    if (control.type === 'select') {
      const select = document.createElement('select');
      select.id = id;
      select.className = 'neo-ext-select';
      for (const option of control.options || []) {
        const el = document.createElement('option');
        el.value = String(option.value);
        el.textContent = x(option.label);
        if (String(values[control.key]) === String(option.value)) el.selected = true;
        select.appendChild(el);
      }
      select.addEventListener('change', () => { values[control.key] = select.value; });
      wrap.appendChild(select);
      return wrap;
    }

    if (control.type === 'note') {
      const note = document.createElement('p');
      note.className = 'neo-ext-hint';
      note.textContent = x(control.text, { default: (info && info.defaultFolder) || '' });
      wrap.appendChild(note);
    }
    return wrap;
  }

  function close() {
    if (!openEl) return;
    openEl.remove();
    openEl = null;
    document.removeEventListener('keydown', onKey, true);
    restoreSelection();
  }

  function onKey(e) {
    if (!openEl) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
  }

  async function open() {
    const bridge = window.NeoForkNative;
    if (!bridge) return;
    if (openEl) { openEl.querySelector('.neo-ext-path')?.focus(); return; }
    if (pending || otherModalOpen()) return;
    pending = true;
    rememberSelection();

    let info = null;
    try { info = await bridge.getBackupSettings(); } catch { info = null; }
    pending = false;
    if (!info || openEl) return; // another window won the race

    const values = {
      backupFolder: info.configured || info.folder || info.defaultFolder || '',
      __useDefault: !info.configured
    };

    openEl = document.createElement('div');
    openEl.className = 'modal-backdrop neo-ext-backdrop';
    openEl.innerHTML = `
      <div class="modal neo-ext-settings">
        <h2 id="neo-ext-title"></h2>
        <div class="neo-ext-groups"></div>
        <p class="neo-ext-error" role="alert" hidden></p>
        <div class="neo-ext-actions">
          <button type="button" class="neo-ext-cancel"></button>
          <button type="button" class="btn-gold neo-ext-save"></button>
        </div>
      </div>`;
    openEl.querySelector('#neo-ext-title').textContent = x('Settings');
    openEl.querySelector('.neo-ext-cancel').textContent = x('Cancel');
    openEl.querySelector('.neo-ext-save').textContent = x('Save');
    document.body.appendChild(openEl);

    const holder = openEl.querySelector('.neo-ext-groups');
    const errorEl = openEl.querySelector('.neo-ext-error');
    const live = groups.filter(shown);
    for (const group of live) {
      const section = document.createElement('section');
      section.className = 'neo-ext-group';
      section.dataset.group = group.id;
      const heading = document.createElement('h3');
      heading.textContent = x(group.title);
      section.appendChild(heading);
      const controls = typeof group.controls === 'function' ? group.controls(info) : (group.controls || []);
      for (const control of controls) section.appendChild(controlRow(group, control, values, info));
      holder.appendChild(section);
    }

    openEl.addEventListener('click', (e) => { if (e.target === openEl) close(); });
    openEl.querySelector('.neo-ext-cancel').addEventListener('click', close);
    document.addEventListener('keydown', onKey, true);

    openEl.querySelector('.neo-ext-save').addEventListener('click', async () => {
      errorEl.hidden = true;
      const bookId = typeof book !== 'undefined' && book ? book.id : null;
      for (const group of live) {
        if (typeof group.save !== 'function') continue;
        let res = null;
        try { res = await group.save(values, { info, bookId }); } catch (err) { res = { ok: false, reason: String(err && err.message || err) }; }
        if (!res || !res.ok) {
          errorEl.textContent = (res && res.reason) || x('NEO could not save these settings');
          errorEl.hidden = false;
          return;
        }
      }
      close();
      if (window.NeoExt && window.NeoExt.toast) window.NeoExt.toast(x('Settings saved'));
    });

    const first = openEl.querySelector('input, select');
    if (first) first.focus();
  }

  window.NeoSettings = { registerGroup, open, close, groups };
})();
