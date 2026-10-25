// NEO fork — the synonym window (adr-002)
//
// One responsibility: show the grouped synonyms, let the writer filter and
// keyboard through them, and hand the chosen word back. It never touches the
// manuscript itself; the caller does the replacement after this closes.

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
  const POS = { noun: 'Noun', verb: 'Verb', adj: 'Adjective', adv: 'Adverb', adjective: 'Adjective', adverb: 'Adverb' };
  const REL = { generic: 'Broader term', similar: 'Similar term', related: 'Related term', antonym: 'Antonym' };

  let openEl = null;
  let onKey = null;

  function otherModalOpen() {
    return !!document.querySelector('.modal-backdrop:not([hidden])');
  }

  function close() {
    if (!openEl) return null;
    const el = openEl;
    openEl = null;
    el.remove();
    if (onKey) document.removeEventListener('keydown', onKey, true);
    onKey = null;
    return el.__onCancel || null;
  }

  function focusables(el) {
    return [...el.querySelectorAll('input, button:not([disabled])')].filter((n) => n.offsetParent !== null);
  }

  function move(el, step) {
    const list = focusables(el).filter((n) => n.matches('button.neo-ext-thes-word'));
    if (!list.length) return;
    const at = list.indexOf(document.activeElement);
    const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    list[next].focus();
  }

  function open({ word, groups, onPick, onCancel }) {
    if (openEl) return false;
    if (otherModalOpen()) return false;

    const rules = window.NeoThesaurusRules;
    if (!rules || typeof rules.filterSynonyms !== 'function') return false;

    const all = Array.isArray(groups) ? groups : [];
    const count = all.reduce((n, g) => n + g.syns.length, 0);
    if (!count) return false;

    const el = document.createElement('div');
    el.className = 'modal-backdrop neo-ext-backdrop neo-ext-thes-backdrop';
    el.__onCancel = onCancel;
    const titleId = 'neo-ext-thes-title';
    el.innerHTML = `
      <div class="modal neo-ext-thes" role="dialog" aria-modal="true" aria-labelledby="${titleId}" tabindex="-1">
        <h2 id="${titleId}" class="neo-ext-thes-title"></h2>
        <input class="neo-ext-thes-filter" type="search" autocomplete="off" spellcheck="false" />
        <div class="neo-ext-thes-list"></div>
        <button type="button" class="neo-ext-thes-close" aria-label=""></button>
      </div>`;
    document.body.appendChild(el);
    openEl = el;

    const title = el.querySelector('.neo-ext-thes-title');
    title.textContent = count === 1
      ? x('One synonym for “{word}”', { word })
      : x('{n} synonyms for “{word}”', { n: count, word });
    const filter = el.querySelector('.neo-ext-thes-filter');
    filter.placeholder = x('Filter synonyms');
    filter.setAttribute('aria-label', x('Filter synonyms'));
    const list = el.querySelector('.neo-ext-thes-list');
    el.querySelector('.neo-ext-thes-close').setAttribute('aria-label', x('Close'));
    el.querySelector('.neo-ext-thes-close').textContent = '×';

    const render = (query) => {
      list.textContent = '';
      const shown = rules.filterSynonyms(all, query);
      if (!shown.length) {
        const empty = document.createElement('p');
        empty.className = 'neo-ext-hint';
        empty.textContent = x('No synonym matches that filter');
        list.appendChild(empty);
        return;
      }
      for (const group of shown) {
        const section = document.createElement('section');
        section.className = 'neo-ext-thes-group';
        const head = document.createElement('h3');
        const pos = Object.hasOwn(POS, group.pos) ? POS[group.pos] : group.pos;
        const rel = group.rel && Object.hasOwn(REL, group.rel) ? REL[group.rel] : group.rel;
        head.textContent = rel ? `${x(pos)} · ${x(rel)}` : x(pos);
        section.appendChild(head);
        const words = document.createElement('div');
        words.className = 'neo-ext-thes-words';
        for (const syn of group.syns) {
          const button = document.createElement('button');
          button.type = 'button';
          button.className = 'neo-ext-thes-word';
          button.textContent = syn;
          button.addEventListener('click', () => finish(syn));
          words.appendChild(button);
        }
        section.appendChild(words);
        list.appendChild(section);
      }
    };

    const finish = (value) => {
      const cancel = close();
      if (value !== null) {
        try { if (onPick) onPick(value); } catch { /* the page moved on */ }
      } else if (cancel) {
        try { cancel(); } catch { /* nothing to restore */ }
      }
    };

    // On document (capture), not on the backdrop: clicking the dialog's own
    // whitespace moves focus to <body>, and a handler on the box would never
    // see Esc again.
    onKey = (e) => {
      if (!openEl) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finish(null);
        return;
      }
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        move(el, 1);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        move(el, -1);
        return;
      }
      if (e.key === 'Tab') {
        const nodes = focusables(el);
        if (!nodes.length) return;
        const at = nodes.indexOf(document.activeElement);
        const next = (at + (e.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
        e.preventDefault();
        e.stopPropagation();
        nodes[next].focus();
      }
    };
    document.addEventListener('keydown', onKey, true);

    filter.addEventListener('input', () => render(filter.value));

    el.addEventListener('mousedown', (e) => {
      if (e.target === el) {
        e.preventDefault();
        finish(null);
      }
    });
    el.querySelector('.neo-ext-thes-close').addEventListener('click', () => finish(null));

    render('');
    filter.focus();
    return true;
  }

  window.NeoThesaurusWindow = { open, close, otherModalOpen };
})();
