// NEO fork — the definition window (adr-003)
//
// One responsibility: show the word, its parts of speech, and each sense's
// definition and examples, and let the writer dismiss it. There is no button
// that writes, no filter, and no Range: the dictionary never edits the page.

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

  // WordNet's parts of speech, in the fork's own words.
  const POS = { noun: 'Noun', verb: 'Verb', adj: 'Adjective', adv: 'Adverb' };

  let openEl = null;
  let onKey = null;
  let returnFocus = null;
  let anchor = null;

  function otherModalOpen() {
    return !!document.querySelector('.modal-backdrop:not([hidden])');
  }

  function close() {
    if (!openEl) return false;
    const el = openEl;
    openEl = null;
    el.remove();
    if (onKey) document.removeEventListener('keydown', onKey, true);
    onKey = null;
    // The writer lands back where they were. The editor the word came from
    // wins: after the macOS popup, DOM focus is on <body>, and the chapter the
    // caret was last in may not be the one the word was looked up in.
    try {
      const target = anchor && document.contains(anchor)
        ? anchor
        : (returnFocus && returnFocus.closest && returnFocus.closest('[contenteditable="true"], .chapter-body, #aux-editor')
          ? returnFocus
          : null);
      if (target && typeof target.focus === 'function') target.focus({ preventScroll: true });
    } catch { /* the page moved on */ }
    returnFocus = null;
    anchor = null;
    return true;
  }

  function focusables(el) {
    return [...el.querySelectorAll('button:not([disabled])')].filter((n) => n.offsetParent !== null);
  }

  function groupTitle(pos) {
    return Object.hasOwn(POS, pos) ? x(POS[pos]) : pos;
  }

  function open({ word, groups, count, editor }) {
    if (openEl) return false;
    if (otherModalOpen()) return false;

    const all = Array.isArray(groups) ? groups : [];
    const total = Number(count) || all.reduce((n, group) => n + (Array.isArray(group.senses) ? group.senses.length : 0), 0);
    if (!total || !all.length || !word) return false;

    returnFocus = document.activeElement;
    anchor = editor || null;

    const el = document.createElement('div');
    el.className = 'modal-backdrop neo-ext-backdrop neo-ext-dict-backdrop';
    const titleId = 'neo-ext-dict-title';
    el.innerHTML = `
      <div class="modal neo-ext-dict" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <h2 id="${titleId}" class="neo-ext-dict-title"></h2>
        <div class="neo-ext-dict-list"></div>
        <button type="button" class="neo-ext-dict-close" aria-label=""></button>
      </div>`;
    document.body.appendChild(el);
    openEl = el;

    const title = el.querySelector('.neo-ext-dict-title');
    title.textContent = total === 1
      ? x('One definition for “{word}”', { word })
      : x('{n} definitions for “{word}”', { n: total, word });

    const closeButton = el.querySelector('.neo-ext-dict-close');
    closeButton.setAttribute('aria-label', x('Close'));
    closeButton.textContent = '×';

    const list = el.querySelector('.neo-ext-dict-list');
    for (const group of all) {
      const senses = Array.isArray(group.senses) ? group.senses : [];
      if (!senses.length) continue;
      const section = document.createElement('section');
      section.className = 'neo-ext-dict-group';
      const head = document.createElement('h3');
      head.textContent = groupTitle(group.pos);
      section.appendChild(head);
      for (const sense of senses) {
        if (!sense || typeof sense.def !== 'string' || !sense.def.trim()) continue;
        const def = document.createElement('p');
        def.className = 'neo-ext-dict-def';
        def.textContent = sense.def;
        section.appendChild(def);
        for (const example of Array.isArray(sense.ex) ? sense.ex : []) {
          if (typeof example !== 'string' || !example.trim()) continue;
          const line = document.createElement('p');
          line.className = 'neo-ext-dict-ex';
          line.textContent = `“${example}”`;
          section.appendChild(line);
        }
      }
      list.appendChild(section);
    }

    // On document (capture), not on the backdrop: clicking the dialog's own
    // whitespace moves focus to <body>, and a handler on the box would never
    // see Esc again.
    onKey = (e) => {
      if (!openEl) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        close();
        return;
      }
      if (e.key === 'Tab') {
        const nodes = focusables(el);
        if (!nodes.length) {
          e.preventDefault();
          el.querySelector('.neo-ext-dict').focus();
          return;
        }
        const at = nodes.indexOf(document.activeElement);
        const next = (at + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
        e.preventDefault();
        e.stopPropagation();
        nodes[next].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    el.addEventListener('mousedown', (e) => {
      if (e.target === el) {
        e.preventDefault();
        close();
      }
    });
    closeButton.addEventListener('click', () => close());

    closeButton.focus();
    return true;
  }

  window.NeoDictionaryWindow = { open, close, otherModalOpen };
})();
