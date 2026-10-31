// NEO fork — Rephrase… in the editor (adr-012)
//
// Captures a selection (one block, up to 1,200 characters), opens a window with
// one card per profile, asks the local model one profile at a time, validates
// each reply, and replaces the selection as one undoable edit.

'use strict';

(function () {
  const rules = window.NeoRephraseContext;
  const endpointRules = window.NeoRephraseEndpoint;
  const check = window.NeoRephraseCheck;
  const api = window.NeoExtApi;
  if (!rules || !endpointRules || !check || !api) return;

  const reasons = window.NeoRephraseReasons;
  const bridge = () => window.NeoForkNative || null;
  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);

  let last = null;
  let win = null;
  let opening = false;
  const BUDGET_MS = 120000;

  function toast(message) {
    try { if (window.NeoExt && window.NeoExt.toast) return window.NeoExt.toast(message); } catch { /* no toast */ }
    return null;
  }

  function capture(selection) {
    try {
      const more = !!(api && typeof api.moreFeatures === 'function' && api.moreFeatures());
      const evaluated = rules.evaluate({
        text: selection && selection.text,
        sameBlock: !!(selection && selection.sameBlock),
        inChapter: !!(selection && selection.body),
        moreFeatures: more
      });
      if (!evaluated.ok) { last = null; return false; }
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

  function reasonText(reason) {
    return reasons && reasons.reasonText ? reasons.reasonText(reason, x) : x('That could not be completed.');
  }

  function close(session) {
    if (!win) return;
    const current = win;
    win = null;
    current.closed = true;
    try { bridge().rephraseEnd({ session }); } catch { /* the page moved on */ }
    document.removeEventListener('keydown', current.onKey, true);
    current.el.remove();
    try {
      const range = last && last.range;
      if (range && document.contains(range.startContainer) && range.startContainer.parentElement) {
        range.startContainer.parentElement.closest('.chapter-body')?.focus({ preventScroll: true });
      }
    } catch { /* the page moved on */ }
  }

  function replace(entry, text) {
    try {
      const range = entry.range;
      const alive = range && document.contains(range.startContainer)
        && check.norm(range.toString()) === check.norm(entry.text);
      if (!alive) { last = null; toast(x('That text moved. Nothing was changed.')); return false; }
      const editor = range.startContainer.parentElement?.closest('.chapter-body');
      if (editor) editor.focus({ preventScroll: true });
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      let inserted = false;
      try { inserted = document.execCommand('insertText', false, text); } catch { inserted = false; }
      if (!inserted) { toast(x('That text could not be replaced.')); return false; }
      last = null;
      return true;
    } catch {
      toast(x('That text could not be replaced.'));
      return false;
    }
  }

  async function runProfile(current, profile, retry = false) {
    const card = current.cards.get(String(profile.id));
    if (!card || current.closed) return;
    card.state = 'writing';
    card.status.textContent = x('writing…');
    card.button.disabled = true;
    let attempt = 0;
    let result = null;
    while (attempt < 2 && !current.closed) {
      if (Date.now() - current.startedAt > BUDGET_MS) { result = { ok: false, reason: reasonText('slow') }; break; }
      attempt += 1;
      let raw = null;
      try {
        raw = await bridge().rephraseRun({
          session: current.session,
          profileId: profile.id,
          text: current.entry.text,
          before: current.entry.before,
          after: current.entry.after
        });
      } catch (err) { raw = { ok: false, reason: String(err && err.message || err) }; }
      if (current.closed) return;
      if (!raw || !raw.ok) { result = { ok: false, reason: reasonText(raw && raw.reason) }; break; }
      let checked = null;
      try { checked = check.checkReply({
        reply: raw.text,
        text: current.entry.text,
        before: current.entry.before,
        after: current.entry.after,
        label: profile.label
      }); } catch { checked = { ok: false, reason: 'empty' }; }
      if (checked && checked.ok) { result = { ok: true, text: checked.text }; break; }
      result = { ok: false, reason: reasonText(checked.reason) };
    }
    if (current.closed) return;
    if (result && result.ok) {
      card.state = 'text';
      card.text.textContent = result.text;
      card.text.hidden = false;
      card.status.hidden = true;
      card.button.disabled = false;
      card.labelText = result.text;
    } else {
      card.state = 'failed';
      card.status.hidden = false;
      card.status.textContent = (result && result.reason) || reasonText('network');
      card.retry.hidden = false;
      card.button.disabled = false;
      if (retry) card.retry.focus({ preventScroll: true });
    }
  }

  async function openPending() {
    if (opening || win) { toast(x('A rephrase is already open.')); return false; }
    const entry = last;
    const apiBridge = bridge();
    if (!apiBridge || typeof apiBridge.rephraseStart !== 'function') {
      toast(x('Rephrase is not available in this build'));
      return false;
    }
    opening = true;
    let started = null;
    try { started = await apiBridge.rephraseStart(); } catch { started = null; }
    if (!started || !started.ok) {
      opening = false;
      toast(reasonText(started && started.reason));
      return false;
    }
    if (last !== entry || !entry || !(api && api.moreFeatures && api.moreFeatures())) {
      opening = false;
      try { apiBridge.rephraseEnd({ session: started.session }); } catch { /* page moved on */ }
      toast(x('Select a paragraph to rephrase.'));
      return false;
    }

    try {
    const el = document.createElement('div');
    el.className = 'modal-backdrop neo-ext-backdrop neo-rephrase-backdrop';
    const card = document.createElement('div');
    card.className = 'modal neo-rephrase';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'neo-rephrase-title');
    const title = document.createElement('h2');
    title.id = 'neo-rephrase-title';
    title.className = 'neo-rephrase-title';
    title.textContent = x('Rephrase');
    const quote = document.createElement('p');
    quote.className = 'neo-rephrase-quote';
    quote.textContent = entry.text;
    const list = document.createElement('div');
    list.className = 'neo-rephrase-cards';
    const actions = document.createElement('div');
    actions.className = 'neo-rephrase-actions';
    const cancel = document.createElement('button');
    cancel.type = 'button';
    cancel.className = 'neo-rephrase-cancel';
    cancel.textContent = x('Cancel');
    actions.appendChild(cancel);
    card.append(title, quote, list, actions);
    el.appendChild(card);
    document.body.appendChild(el);

    const current = { el, entry, session: started.session, cards: new Map(), closed: false, startedAt: Date.now(), onKey: null };
    const profiles = Array.isArray(started.profiles) ? started.profiles : [];
    for (const profile of profiles) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'neo-rephrase-card';
      button.dataset.profile = String(profile.id);
      const label = document.createElement('span');
      label.className = 'neo-rephrase-label';
      label.textContent = profile.label;
      const text = document.createElement('span');
      text.className = 'neo-rephrase-text';
      text.hidden = true;
      const status = document.createElement('span');
      status.className = 'neo-rephrase-status';
      status.textContent = x('waiting…');
      const retry = document.createElement('span');
      retry.className = 'neo-rephrase-retry';
      retry.textContent = x('Try again');
      retry.hidden = true;
      retry.addEventListener('click', (event) => {
        event.stopPropagation();
        retry.hidden = true;
        runProfile(current, profile);
      });
      button.append(label, text, status, retry);
      const state = { button, label, text, status, retry, state: 'waiting', labelText: '' };
      current.cards.set(String(profile.id), state);
      button.addEventListener('click', () => {
        if (state.state === 'text' && state.labelText) choose(current, state.labelText);
      });
      list.appendChild(button);
    }

    const keyHandler = (event) => {
      if (!win || win !== current) return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(current.session); return; }
      const buttons = [...list.querySelectorAll('.neo-rephrase-card')];
      const at = buttons.indexOf(document.activeElement);
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const next = at < 0 ? 0 : (at + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
        return;
      }
      if (event.key === 'Tab') {
        const focusable = [...current.el.querySelectorAll('button')].filter((node) => !node.disabled);
        if (!focusable.length) return;
        const atButton = focusable.indexOf(document.activeElement);
        const next = (atButton + (event.shiftKey ? -1 : 1) + focusable.length) % focusable.length;
        event.preventDefault();
        focusable[next].focus();
        return;
      }
      const number = Number(event.key);
      if (Number.isInteger(number) && number >= 1 && number <= profiles.length) {
        const profile = profiles[number - 1];
        const state = current.cards.get(String(profile.id));
        if (state && state.state === 'text' && state.labelText) { event.preventDefault(); choose(current, state.labelText); }
      }
    };
    current.onKey = keyHandler;
    document.addEventListener('keydown', keyHandler, true);
    cancel.addEventListener('click', () => close(current.session));
    el.addEventListener('click', (event) => { if (event.target === el) close(current.session); });
    win = current;
    opening = false;
    list.querySelector('.neo-rephrase-card')?.focus();

    (async () => {
      for (const profile of profiles) {
        if (current.closed) return;
        if (Date.now() - current.startedAt > BUDGET_MS) {
          const state = current.cards.get(String(profile.id));
          if (state && state.state === 'waiting') {
            state.state = 'failed';
            state.status.textContent = x('The local model is slow. Try again.');
            state.retry.hidden = false;
            state.button.disabled = false;
          }
          continue;
        }
        await runProfile(current, profile);
      }
    })();
    return true;
    } catch {
      try { apiBridge.rephraseEnd({ session: started.session }); } catch { /* page moved on */ }
      if (win && win.session === started.session) { win.el.remove(); win = null; }
      opening = false;
      toast(x('The rephrase window could not open.'));
      return false;
    }
  }

  function choose(current, text) {
    if (!win || win !== current) return;
    const entry = current.entry;
    close(current.session);
    replace(entry, text);
  }

  window.NeoRephrase = { capture, has, openPending };
})();
