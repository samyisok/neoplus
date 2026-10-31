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
  let openState = null;
  let pending = false;
  let saving = false;
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
    if (control.key) wrap.dataset.key = control.key;
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

    if (control.type === 'textarea') {
      const area = document.createElement('textarea');
      area.id = id;
      area.className = 'neo-ext-textarea';
      area.rows = control.rows || 4;
      area.value = values[control.key] || control.defaultValue || '';
      area.addEventListener('input', () => { values[control.key] = area.value; });
      wrap.appendChild(area);
      return wrap;
    }

    if (control.type === 'secret') {
      const line = document.createElement('div');
      line.className = 'neo-ext-pathline';
      const input = document.createElement('input');
      input.type = 'password';
      input.id = id;
      input.className = 'neo-ext-path';
      input.autocomplete = 'off';
      input.value = '';
      input.placeholder = values.__hasKey ? x('key saved') : x('API key');
      input.addEventListener('input', () => { values[control.key] = input.value; values.__keyTouched = true; });
      const replace = document.createElement('button');
      replace.type = 'button';
      replace.className = 'neo-ext-choose';
      replace.textContent = x('Replace…');
      replace.addEventListener('click', () => { input.value = ''; values[control.key] = ''; values.__keyTouched = true; input.focus(); });
      line.append(input, replace);
      wrap.appendChild(line);
      if (!values.__secure) {
        const warn = document.createElement('p');
        warn.className = 'neo-ext-hint';
        warn.textContent = x('This computer offers no encrypted secret storage; the key is stored without encryption.');
        wrap.appendChild(warn);
      }
      return wrap;
    }

    if (control.type === 'profiles') {
      const holder = document.createElement('div');
      holder.className = 'neo-ext-profiles';
      const list = () => (Array.isArray(values[control.key]) ? values[control.key] : []);
      const paint = () => {
        holder.textContent = '';
        const rows = list();
        rows.forEach((profile, index) => {
          const row = document.createElement('div');
          row.className = 'neo-ext-profile';
          const label = document.createElement('input');
          label.type = 'text';
          label.className = 'neo-ext-profile-label';
          label.placeholder = x('Label');
          label.value = profile.label || '';
          label.addEventListener('input', () => { profile.label = label.value; });
          const instruction = document.createElement('input');
          instruction.type = 'text';
          instruction.className = 'neo-ext-profile-instruction';
          instruction.placeholder = x('Instruction');
          instruction.value = profile.instruction || '';
          instruction.addEventListener('input', () => { profile.instruction = instruction.value; });
          const remove = document.createElement('button');
          remove.type = 'button';
          remove.className = 'neo-ext-profile-remove';
          remove.textContent = '×';
          remove.setAttribute('aria-label', x('Remove profile'));
          remove.disabled = rows.length <= 2;
          remove.addEventListener('click', () => { rows.splice(index, 1); paint(); });
          row.append(label, instruction, remove);
          holder.appendChild(row);
        });
        const add = document.createElement('button');
        add.type = 'button';
        add.className = 'neo-ext-profile-add';
        add.textContent = '+ ' + x('Profile');
        add.disabled = rows.length >= (control.max || 8);
        add.addEventListener('click', () => {
          rows.push({ label: '', instruction: '' });
          paint();
          const inputs = holder.querySelectorAll('.neo-ext-profile-label');
          inputs[inputs.length - 1]?.focus();
        });
        holder.appendChild(add);
      };
      values[control.key] = list();
      paint();
      wrap.appendChild(holder);
      return wrap;
    }

    if (control.type === 'zoom') {
      const line = document.createElement('div');
      line.className = 'neo-ext-zoombar';
      const value = document.createElement('output');
      value.className = 'neo-ext-zoom-value';
      value.id = id;
      value.setAttribute('aria-live', 'polite');
      const format = typeof control.format === 'function' ? control.format : (v) => String(v);
      const buttons = [];
      const refresh = () => {
        const held = values[control.key];
        value.textContent = format(held);
        const down = typeof control.step === 'function' ? control.step(held, -1) : held;
        const up = typeof control.step === 'function' ? control.step(held, 1) : held;
        buttons[0].disabled = down === held;
        buttons[1].disabled = up === held;
        buttons[2].disabled = held === 1;
      };
      const make = (label, dir) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'neo-ext-zoom-step';
        button.dataset.dir = String(dir);
        button.textContent = x(label);
        button.setAttribute('aria-label', x('{label}: {action}', { label: x(control.label), action: x(label) }));
        button.addEventListener('click', () => {
          values['__touched_' + control.key] = true;
          values[control.key] = typeof control.step === 'function' ? control.step(values[control.key], dir) : values[control.key];
          refresh();
          try { if (control.preview) control.preview(values[control.key]); } catch { /* preview is a nicety */ }
        });
        buttons.push(button);
        return button;
      };
      const smaller = make('Smaller', -1);
      const larger = make('Larger', 1);
      const reset = make('Reset', 0);
      line.append(smaller, value, larger, reset);
      refresh();
      wrap.appendChild(line);
      return wrap;
    }

    if (control.type === 'button') {
      const line = document.createElement('div');
      line.className = 'neo-ext-pathline';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'neo-ext-choose';
      button.textContent = x(control.label);
      const status = document.createElement('span');
      status.className = 'neo-ext-hint';
      status.setAttribute('role', 'status');
      button.addEventListener('click', async () => {
        button.disabled = true;
        status.textContent = x('Checking…');
        let res = null;
        try { res = control.run ? await control.run(values) : null; } catch (err) { res = { ok: false, reason: String(err && err.message || err) }; }
        button.disabled = false;
        status.textContent = res && res.ok ? x('Reachable') : (res && res.reason) || x('Could not connect');
      });
      line.append(button, status);
      wrap.appendChild(line);
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

  function close(saved) {
    if (!openEl) return;
    const state = openState;
    openState = null;
    openEl.remove();
    openEl = null;
    document.removeEventListener('keydown', onKey, true);
    restoreSelection();
    if (!state) return;
    for (const group of state.live) {
      if (typeof group.onClose !== 'function') continue;
      try { group.onClose(state.values, !!saved); } catch { /* a group cannot block closing */ }
    }
  }

  function onKey(e) {
    if (!openEl || saving) return;
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
    if (!info || openEl) { pending = false; return; } // another window won the race

    const values = {
      backupFolder: info.configured || info.folder || info.defaultFolder || '',
      __useDefault: !info.configured
    };
    const live = groups.filter(shown);
    openState = null;
    const loads = await Promise.all(live.map(async (group) => {
      if (typeof group.load !== 'function') return {};
      try { return (await group.load()) || {}; } catch { return {}; }
    }));
    pending = false;
    saving = false;
    for (const part of loads) if (part && typeof part === 'object') Object.assign(values, part);
    openState = { values, live };

    openEl = document.createElement('div');
    openEl.className = 'modal-backdrop neo-ext-backdrop';
    openEl.innerHTML = `
      <div class="modal neo-ext-settings">
        <h2 id="neo-ext-title"></h2>
        <div class="neo-ext-tabs" role="tablist"></div>
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
    // Close paths exist before any group renders, so a broken group can never
    // leave a window with no way out.
    openEl.addEventListener('click', (e) => { if (!saving && e.target === openEl) close(); });
    openEl.querySelector('.neo-ext-cancel').addEventListener('click', () => { if (!saving) close(false); });
    document.addEventListener('keydown', onKey, true);

    const holder = openEl.querySelector('.neo-ext-groups');
    const errorEl = openEl.querySelector('.neo-ext-error');
    const tabStrip = openEl.querySelector('.neo-ext-tabs');
    const tabs = [];
    for (const group of live) {
      const name = group.tab || 'General';
      if (!tabs.includes(name)) tabs.push(name);
    }
    const sections = [];
    const showTab = (name) => {
      for (const button of tabStrip.querySelectorAll('button')) {
        const active = button.dataset.tab === name;
        button.setAttribute('aria-selected', active ? 'true' : 'false');
        button.tabIndex = active ? 0 : -1;
      }
      for (const section of sections) section.hidden = section.dataset.tab !== name;
      const first = sections.find((section) => section.dataset.tab === name);
      first?.querySelector('input, select, textarea, button')?.focus({ preventScroll: true });
    };
    if (tabs.length > 1) {
      for (const name of tabs) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'neo-ext-tab';
        button.dataset.tab = name;
        button.setAttribute('role', 'tab');
        button.textContent = x(name);
        button.addEventListener('click', () => showTab(name));
        button.addEventListener('keydown', (e) => {
          if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
          e.preventDefault();
          const at = tabs.indexOf(button.dataset.tab);
          const next = e.key === 'Home' ? 0
            : e.key === 'End' ? tabs.length - 1
              : (at + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
          tabStrip.querySelector(`button[data-tab="${CSS.escape(tabs[next])}"]`)?.click();
          tabStrip.querySelector(`button[data-tab="${CSS.escape(tabs[next])}"]`)?.focus();
        });
        tabStrip.appendChild(button);
      }
    }
    for (const group of live) {
      try {
        const section = document.createElement('section');
        section.className = 'neo-ext-group';
        section.dataset.group = group.id;
        section.dataset.tab = group.tab || 'General';
        const heading = document.createElement('h3');
        heading.textContent = x(group.title);
        section.appendChild(heading);
        const controls = typeof group.controls === 'function' ? group.controls(info, values) : (group.controls || []);
        for (const control of controls) section.appendChild(controlRow(group, control, values, info));
        holder.appendChild(section);
        sections.push(section);
      } catch { /* one broken group cannot break the window */ }
    }
    for (const tab of tabs) {
      const own = sections.filter((section) => section.dataset.tab === tab);
      own.forEach((section, index) => section.classList.toggle('neo-ext-group-sep', index < own.length - 1));
    }
    if (tabs.length > 1) showTab(tabs[0]);
    else tabStrip.hidden = true;

    openEl.querySelector('.neo-ext-save').addEventListener('click', async () => {
      if (saving) return;
      saving = true;
      const saveButton = openEl.querySelector('.neo-ext-save');
      if (saveButton) saveButton.disabled = true;
      const steps = [...openEl.querySelectorAll('.neo-ext-zoom-step')].map((button) => ({ button, was: button.disabled }));
      for (const stepButton of steps) stepButton.button.disabled = true;
      errorEl.hidden = true;
      try {
        const bookId = typeof book !== 'undefined' && book ? book.id : null;
        for (const group of live) {
          if (typeof group.validate !== 'function') continue;
          let checked = null;
          try { checked = await group.validate(values, { info, bookId }); } catch (err) { checked = { ok: false, reason: String(err && err.message || err) }; }
          if (checked && checked.ok === false) {
            errorEl.textContent = checked.reason || x('NEO could not save these settings');
            errorEl.hidden = false;
            return;
          }
        }
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
        close(true);
        if (window.NeoExt && window.NeoExt.toast) window.NeoExt.toast(x('Settings saved'));
      } finally {
        saving = false;
        if (saveButton) saveButton.disabled = false;
        for (const stepButton of steps) stepButton.button.disabled = stepButton.was;
      }
    });

    const first = openEl.querySelector('input, select');
    if (first) first.focus();
  }

  window.NeoSettings = { registerGroup, open, close, groups };
})();
