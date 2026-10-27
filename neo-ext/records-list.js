// NEO fork — the Records list inside the right-hand pane (adr-005)
//
// Rendering only. Every change goes back through records.js, which owns the
// store and its invariants.

'use strict';

(function (root) {
  const model = root.NeoRecordsStore;
  const search = root.NeoRecordsSearch;
  const tagRules = root.NeoRecordTags;

  function create(x) {
    const tx = (s, vars) => (typeof x === 'function' ? x(s, vars) : s);

    function binIcon() {
      const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('viewBox', '0 0 16 16');
      svg.setAttribute('aria-hidden', 'true');
      svg.setAttribute('focusable', 'false');
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'currentColor');
      path.setAttribute('d', 'M6.5 1.5h3L10 3h3v1.5H3V3h3l.5-1.5ZM4 5h8l-.6 9.5H4.6L4 5Zm2 1.5v6.5h1V6.5H6Zm3 0v6.5h1V6.5H9Z');
      svg.appendChild(path);
      return svg;
    }
    function el(tag, cls, text) {
      const node = document.createElement(tag);
      if (cls) node.className = cls;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function paint(listEl, query) {
      if (root.CSS && CSS.highlights) CSS.highlights.delete('neo-record-search');
      if (!query || !root.Highlight || !root.CSS || !CSS.highlights) return;
      const ranges = [];
      const add = (node) => {
        if (!node) return;
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        let text;
        while ((text = walker.nextNode())) {
          for (const r of search.ranges(text.data, query)) {
            const range = document.createRange();
            range.setStart(text, r.start);
            range.setEnd(text, r.end);
            ranges.push(range);
          }
        }
      };
      for (const row of listEl.querySelectorAll('.neo-record')) {
        add(row.querySelector('.neo-record-title'));
        add(row.querySelector('.neo-record-text'));
      }
      if (ranges.length) CSS.highlights.set('neo-record-search', new Highlight(...ranges));
    }

    function render(listEl, state, actions) {
      listEl.innerHTML = '';
      const q = search.normalizeQuery(state.query);
      const active = model.activeRecords(state.store);
      const folders = model.activeFolders(state.store);
      const groups = [{ id: null, name: tx('Unsorted'), records: [] }];
      for (const folder of folders) groups.push({ id: folder.id, name: folder.name, records: [] });
      const byId = new Map(groups.map((g) => [g.id, g]));
      for (const rec of active) byId.get(model.folderOf(state.store, rec))?.records.push(rec);

      if (state.pendingFolder && state.pendingFolder.kind === 'new') listEl.appendChild(folderNameInput('', actions, true));
      if (state.pendingFolder && state.pendingFolder.kind === 'rename') {
        // the input is rendered in its folder header below
      }

      let shown = 0;
      for (const group of groups) {
        const matches = group.records.filter((rec) => search.testRecord(rec, q));
        const draftHere = !!(state.draft && state.draft.folderId === group.id);
        if (q && !matches.length && !draftHere) continue;
        if (!q && !group.records.length && !group.id && !draftHere) {
          // Unsorted stays visible only when it has a row or is the only group
          if (groups.some((g) => g.id && g.records.length)) continue;
        }
        shown += matches.length;
        const wrap = groupHeader(group, state, actions, q, matches.length);
        listEl.appendChild(wrap);
        if (!q && !draftHere && state.collapsed.has(group.id || 'unsorted')) continue;
        if (state.pendingFolder && state.pendingFolder.kind === 'rename' && state.pendingFolder.id === group.id) continue;
        if (draftHere) wrap.appendChild(draftRow(state.draft, group.id, actions));
        for (const rec of matches) wrap.appendChild(recordRow(rec, state, actions, q));
      }

      if (!shown && !state.draft && !(state.pendingFolder && state.pendingFolder.kind === 'new')) {
        listEl.appendChild(el('div', 'neo-records-empty', q
          ? tx('No record matches “{query}”', { query: state.query.trim() })
          : tx('No records yet.')));
      }
      paint(listEl, q);
    }

    function groupHeader(group, state, actions, q, count) {
      const wrap = el('div', 'neo-record-group');
      const head = el('div', 'neo-record-folder-head');
      const label = group.id ? group.name : tx('Unsorted');
      if (state.pendingFolder && state.pendingFolder.kind === 'rename' && state.pendingFolder.id === group.id) {
        const input = folderNameInput(state.pendingFolder.value, actions, false, group.id);
        head.appendChild(input);
        wrap.appendChild(head);
        return wrap;
      }
      if (group.id && state.folderConfirm === group.id) {
        const ask = el('div', 'neo-folder-confirm');
        ask.append(el('span', '', tx('Delete “{name}”?', { name: label })));
        const yes = el('button', 'neo-folder-confirm-delete', tx('Delete'));
        yes.type = 'button';
        yes.addEventListener('click', () => actions.deleteFolder(group.id));
        const no = el('button', 'neo-folder-confirm-cancel', tx('Cancel'));
        no.type = 'button';
        no.addEventListener('click', () => actions.cancelFolderConfirm());
        ask.append(yes, no);
        head.appendChild(ask);
        wrap.appendChild(head);
        return wrap;
      }
      const toggle = el('button', 'neo-record-folder-name', label);
      toggle.type = 'button';
      toggle.setAttribute('aria-expanded', String(q ? true : !state.collapsed.has(group.id || 'unsorted')));
      toggle.addEventListener('click', () => actions.toggleFolder(group.id));
      if (group.id) {
        toggle.addEventListener('dblclick', (e) => {
          e.preventDefault();
          actions.startFolderRename(group.id);
        });
      }
      const n = el('span', 'neo-record-folder-count', String(count));
      head.append(toggle);
      if (group.id) {
        const add = el('button', 'neo-record-folder-add', '+');
        add.type = 'button';
        add.title = tx('Add a record to this folder');
        add.setAttribute('aria-label', tx('Add a record to {name}', { name: label }));
        add.addEventListener('click', () => actions.addRecord(group.id));
        const minus = el('button', 'neo-folder-minus');
        minus.type = 'button';
        minus.setAttribute('aria-label', tx('Delete folder “{name}”', { name: label }));
        minus.appendChild(binIcon());
        minus.addEventListener('click', () => actions.confirmFolder(group.id));
        head.append(add, minus);
      }
      // The count stays the last, right-hand item even while the folder's
      // add/delete controls are hidden and waiting for hover.
      head.append(n);
      wrap.appendChild(head);
      return wrap;
    }

    function folderNameInput(value, actions, isNew, id) {
      const wrap = el('div', 'neo-folder-edit');
      const input = el('input', 'neo-folder-input');
      input.type = 'text';
      input.value = value || '';
      input.placeholder = isNew ? tx('New folder') : '';
      input.setAttribute('aria-label', tx('Folder name'));
      let finished = false;
      const done = (save) => {
        if (finished) return;
        finished = true;
        if (save && input.value.trim()) {
          if (isNew) actions.addFolder(input.value);
          else actions.commitFolderRename(id, input.value);
        } else {
          actions.cancelFolderEdit();
        }
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); done(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      });
      input.addEventListener('blur', () => { if (!finished) done(true); });
      wrap.appendChild(input);
      queueMicrotask(() => { input.focus(); input.select(); });
      return wrap;
    }

    function draftRow(draft, folderId, actions) {
      const row = el('div', 'neo-record neo-record-draft');
      const input = el('input', 'neo-record-title-input');
      input.type = 'text';
      input.value = draft.title || '';
      input.placeholder = tx('Record title');
      input.setAttribute('aria-label', tx('Record title'));
      let finished = false;
      const done = (save) => {
        if (finished) return;
        finished = true;
        if (save && input.value.trim()) actions.commitDraft(input.value, folderId);
        else actions.cancelDraft();
      };
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); done(true); }
        else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
      });
      input.addEventListener('blur', () => { if (!finished) done(true); });
      row.appendChild(input);
      queueMicrotask(() => input.focus());
      return row;
    }

    function recordRow(rec, state, actions, q) {
      const matches = search.matches(rec, q);
      const open = state.openRows.has(rec.id) || (!!q && (matches.body || matches.tags));
      const row = el('div', 'neo-record' + (open ? ' open' : ''));
      row.dataset.id = rec.id;
      if (state.confirming === rec.id) {
        const ask = el('div', 'neo-record-confirm');
        ask.append(el('span', '', tx('Delete “{title}”?', { title: rec.title })));
        const yes = el('button', 'neo-record-confirm-delete', tx('Delete'));
        yes.type = 'button';
        yes.addEventListener('click', () => actions.deleteRecord(rec.id));
        const no = el('button', 'neo-record-confirm-cancel', tx('Cancel'));
        no.type = 'button';
        no.addEventListener('click', () => actions.cancelConfirm());
        ask.append(yes, no);
        row.appendChild(ask);
        queueMicrotask(() => yes.focus());
        return row;
      }
      const head = el('div', 'neo-record-head');
      if (state.renaming === rec.id) {
        const input = renameInput(rec.title);
        let finished = false;
        const done = (save) => {
          if (finished) return;
          finished = true;
          if (save && input.value.trim()) actions.commitRecordRename(rec.id, input.value);
          else actions.cancelRecordRename();
        };
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); done(true); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        });
        input.addEventListener('blur', () => { if (!finished) done(true); });
        head.appendChild(input);
        row.appendChild(head);
        queueMicrotask(() => { input.focus(); input.select(); });
        return row;
      }
      const title = el('button', 'neo-record-title', rec.title);
      title.type = 'button';
      title.setAttribute('aria-expanded', String(open));
      title.addEventListener('click', () => actions.toggleRecord(rec.id));
      title.addEventListener('dblclick', (e) => { e.preventDefault(); actions.startRecordRename(rec.id); });
      const minus = el('button', 'neo-record-minus');
      minus.type = 'button';
      minus.setAttribute('aria-label', tx('Delete “{title}”', { title: rec.title }));
      minus.appendChild(binIcon());
      minus.addEventListener('click', (e) => { e.stopPropagation(); actions.confirmRecord(rec.id); });
      head.append(title, minus);
      row.appendChild(head);
      if (!open) return row;

      const body = el('div', 'neo-record-body');
      const text = el('div', 'neo-record-text');
      text.contentEditable = 'plaintext-only';
      text.spellcheck = false;
      text.setAttribute('role', 'textbox');
      text.setAttribute('aria-multiline', 'true');
      text.setAttribute('aria-label', tx('Description of {title}', { title: rec.title }));
      text.textContent = rec.body;
      text.addEventListener('input', () => actions.setBody(rec.id, text.innerText));
      body.appendChild(text);
      const select = el('select', 'neo-record-folder-select');
      select.setAttribute('aria-label', tx('Folder for {title}', { title: rec.title }));
      const none = el('option', '', tx('Unsorted'));
      none.value = '';
      select.appendChild(none);
      for (const folder of model.activeFolders(state.store)) {
        const opt = el('option', '', folder.name);
        opt.value = folder.id;
        select.appendChild(opt);
      }
      select.value = model.folderOf(state.store, rec) || '';
      select.addEventListener('change', () => actions.moveRecord(rec.id, select.value || null));
      body.appendChild(select);
      body.appendChild(tagStrip(rec, state, actions));
      row.appendChild(body);
      return row;
    }

    function tagStrip(rec, state, actions) {
      const strip = el('div', 'neo-record-tags');
      const list = tagRules ? tagRules.activeTags(rec) : [];
      for (const text of list) {
        const chip = el('span', 'neo-tag');
        const go = el('button', 'neo-tag-name', text);
        go.type = 'button';
        go.title = tx('Find “{tag}” in the manuscript', { tag: text });
        go.addEventListener('click', () => actions.findTag(text));
        const cross = el('button', 'neo-tag-remove', '×');
        cross.type = 'button';
        cross.setAttribute('aria-label', tx('Remove tag “{tag}”', { tag: text }));
        cross.addEventListener('click', (e) => { e.stopPropagation(); actions.confirmTag(rec.id, text); });
        chip.append(go, cross);
        strip.appendChild(chip);
      }
      if (state.tagConfirm && state.tagConfirm.id === rec.id) {
        const ask = el('div', 'neo-tag-confirm');
        ask.append(el('span', '', tx('Remove tag “{tag}”?', { tag: state.tagConfirm.text })));
        const yes = el('button', 'neo-tag-confirm-remove', tx('Remove'));
        yes.type = 'button';
        yes.addEventListener('click', () => actions.removeTag(rec.id, state.tagConfirm.text));
        const no = el('button', 'neo-tag-confirm-cancel', tx('Cancel'));
        no.type = 'button';
        no.addEventListener('click', () => actions.cancelTag());
        ask.append(yes, no);
        strip.appendChild(ask);
        queueMicrotask(() => yes.focus());
      }
      if (state.tagDraft && state.tagDraft.id === rec.id) {
        const input = el('input', 'neo-tag-input');
        input.type = 'text';
        input.value = state.tagDraft.text || '';
        input.placeholder = tx('Tag');
        input.setAttribute('aria-label', tx('New tag for {title}', { title: rec.title }));
        let finished = false;
        const done = (save) => {
          if (finished) return;
          finished = true;
          if (save) actions.commitTag(rec.id, input.value);
          else actions.cancelTagEdit();
        };
        input.addEventListener('input', () => actions.tagTyped(input.value));
        input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') { e.preventDefault(); done(true); }
          else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); done(false); }
        });
        input.addEventListener('blur', () => { if (!finished) done(true); });
        strip.appendChild(input);
        queueMicrotask(() => input.focus());
      } else {
        const add = el('button', 'neo-tag-add', '+ ' + tx('Tag'));
        add.type = 'button';
        add.addEventListener('click', () => actions.startTagAdd(rec.id));
        strip.appendChild(add);
      }
      return strip;
    }

    function renameInput(value) {
      const input = el('input', 'neo-record-title-input');
      input.type = 'text';
      input.value = value;
      input.setAttribute('aria-label', tx('Record title'));
      return input;
    }

    return { render, paint, el, renameInput };
  }

  root.NeoRecordsList = { create };
})(typeof globalThis !== 'undefined' ? globalThis : this);
