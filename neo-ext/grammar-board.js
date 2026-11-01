// NEO fork — the grammar board's model and drawing (adr-017)
//
// The board is DOM and layout only: cards in text order, the corrected text with
// its green spans, the original with red and yellow marks, and the SVG lines.
// Pure answer rules stay in lib/grammar-issues.js.

'use strict';

(function () {
  const issues = window.NeoGrammarIssues;
  if (!issues) return;
  const x = (s, vars) => (window.NeoExt && typeof window.NeoExt.x === 'function' ? window.NeoExt.x(s, vars) : s);
  const MAX_CORRECTED = issues.MAX_CORRECTED;

  // One card per issue, in text order; a style suggestion that only exists in the
  // correction has already been dropped by filterStyle.
  function buildModel(entry, parsed, styleRaw, notice) {
    const text = entry && typeof entry.text === 'string' ? entry.text : '';
    const list = parsed && Array.isArray(parsed.issues) ? parsed.issues : [];
    const applied = list.filter((issue) => issue && !issue.reason && Number.isInteger(issue.start));
    const result = issues.apply(list, text);
    const kept = Array.isArray(styleRaw) ? issues.filterStyle(styleRaw, text, list) : [];
    const cards = [];
    for (const issue of list) {
      cards.push({
        kind: 'grammar',
        quote: issue.quote,
        fix: typeof issue.fix === 'string' ? issue.fix : null,
        message: issue.message || '',
        start: issue.start,
        end: issue.end,
        applied: !issue.reason,
        reason: issue.reason || ''
      });
    }
    for (const suggestion of kept) {
      cards.push({
        kind: 'style',
        quote: suggestion.quote,
        example: suggestion.example || '',
        message: suggestion.message || '',
        start: suggestion.start,
        end: suggestion.end,
        applied: false,
        reason: ''
      });
    }
    cards.sort((a, b) => {
      const left = a.start === null || a.start === undefined ? Number.MAX_SAFE_INTEGER : a.start;
      const right = b.start === null || b.start === undefined ? Number.MAX_SAFE_INTEGER : b.start;
      if (left !== right) return left - right;
      return (a.kind === 'grammar' ? 0 : 1) - (b.kind === 'grammar' ? 0 : 1);
    });
    cards.forEach((card, index) => { card.index = index + 1; });

    const clean = !!(parsed && parsed.status === 'clean');
    const nothingApplied = !clean && list.length > 0 && applied.length === 0;
    const blank = result.text.trim() === '';
    const tooLong = applied.length > 0 && result.text.length > MAX_CORRECTED;
    const canReplace = applied.length > 0 && result.text !== text && !blank && !tooLong;
    const status = blank
      ? x('The passage would be emptied.')
      : tooLong
        ? x('The correction is too long to apply.')
        : clean
          ? x('The text is clean.')
          : nothingApplied
            ? x('Nothing was applied.')
            : '';
    return {
      original: text,
      corrected: result.text,
      spans: result.spans,
      cards,
      clean,
      nothingApplied,
      blank,
      tooLong,
      canReplace,
      status,
      notice: typeof notice === 'string' ? notice : ''
    };
  }

  function element(doc, tag, className, text) {
    const node = doc.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function addMarked(doc, parent, text, markers) {
    const list = (Array.isArray(markers) ? markers : [])
      .filter((marker) => marker && Number.isInteger(marker.start) && Number.isInteger(marker.end) && (marker.end > marker.start || marker.caret))
      .sort((a, b) => a.start - b.start || (a.kind === 'grammar' ? 0 : 1) - (b.kind === 'grammar' ? 0 : 1));
    let at = 0;
    for (const marker of list) {
      if (marker.start < at) continue;
      if (marker.start > at) parent.append(element(doc, 'span', '', text.slice(at, marker.start)));
      const span = element(doc, 'span', marker.cls, text.slice(marker.start, marker.end));
      if (marker.card !== undefined) {
        span.dataset.card = String(marker.card);
        span.setAttribute('data-card', String(marker.card));
        span.id = `neo-grammar-span-${marker.card}`;
        span.setAttribute('id', span.id);
      }
      parent.append(span);
      at = marker.end;
    }
    if (at < text.length) parent.append(element(doc, 'span', '', text.slice(at)));
  }

  function renderBoard(doc, model) {
    const root = element(doc, 'div', 'neo-grammar-board');
    const top = element(doc, 'div', 'neo-grammar-top');

    const corrected = element(doc, 'div', 'neo-grammar-corrected');
    corrected.append(element(doc, 'p', 'neo-grammar-label', x('Corrected')));
    const correctedText = element(doc, 'div', 'neo-grammar-text');
    addMarked(doc, correctedText, model.corrected, model.spans.map((span) => ({
      start: span.start, end: span.end, cls: 'neo-grammar-green'
    })));
    corrected.append(correctedText);

    const style = element(doc, 'button', 'neo-grammar-style', x('Suggest style'));
    style.type = 'button';
    style.disabled = model.corrected.length > MAX_CORRECTED || model.blank;
    if (model.corrected.length > MAX_CORRECTED) style.title = x('The corrected text is too long to review for style.');
    else if (model.blank) style.title = x('The passage is empty.');
    // The style pass can take a while on a local model, so the wait is visible
    // beside the button that started it.
    const spinner = element(doc, 'span', 'neo-grammar-spinner');
    spinner.hidden = true;
    spinner.setAttribute('aria-hidden', 'true');
    const styleRow = element(doc, 'div', 'neo-grammar-style-row');
    styleRow.append(style, spinner);
    top.append(corrected, styleRow);

    const body = element(doc, 'div', 'neo-grammar-body');
    body.tabIndex = 0;
    body.setAttribute('aria-label', x('Review text'));
    const original = element(doc, 'div', 'neo-grammar-original');
    original.append(element(doc, 'p', 'neo-grammar-label', x('Your text')));
    const originalText = element(doc, 'div', 'neo-grammar-text');
    const markers = [];
    for (const card of model.cards) {
      if (card.kind === 'grammar' && card.applied && Number.isInteger(card.start)) {
        // An inserted word has no wrong words to mark, so the card gets a caret at
        // the gap; without it the first card has nothing to join its line to.
        if (card.end > card.start) {
          markers.push({ start: card.start, end: card.end, cls: 'neo-grammar-red', card: card.index, kind: 'grammar' });
        } else {
          markers.push({ start: card.start, end: card.start, cls: 'neo-grammar-caret', card: card.index, kind: 'grammar', caret: true });
        }
      } else if (card.kind === 'style') {
        if (card.end > card.start) {
          markers.push({ start: card.start, end: card.end, cls: 'neo-grammar-yellow', card: card.index, kind: 'style' });
        } else {
          markers.push({ start: card.start, end: card.start, cls: 'neo-grammar-caret neo-grammar-yellow', card: card.index, kind: 'style', caret: true });
        }
      }
    }
    addMarked(doc, originalText, model.original, markers);
    original.append(originalText);

    const cards = element(doc, 'div', 'neo-grammar-cards');
    for (const card of model.cards) {
      const item = element(doc, 'div', 'neo-grammar-card');
      item.dataset.kind = card.kind;
      item.dataset.card = String(card.index);
      item.setAttribute('data-card', String(card.index));
      if (card.kind === 'grammar' && card.applied) {
        item.setAttribute('aria-describedby', `neo-grammar-span-${card.index}`);
      }
      item.append(element(doc, 'span', 'neo-grammar-num', String(card.index)));
      item.append(element(doc, 'span', 'neo-grammar-quote', card.quote === '' ? x('(insert)') : card.quote));
      const change = card.kind === 'grammar'
        ? (card.fix === '' ? x('(delete)') : card.fix === null ? x('(no replacement)') : card.fix)
        : (card.example || '');
      item.append(element(doc, 'span', 'neo-grammar-change', change));
      item.append(element(doc, 'span', 'neo-grammar-why', card.message));
      if (card.kind === 'grammar' && !card.applied) {
        item.append(element(doc, 'span', 'neo-grammar-not-applied', x('Not applied')));
      }
      cards.append(item);
    }

    const svg = doc.createElementNS
      ? doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
      : doc.createElement('svg');
    svg.setAttribute('class', 'neo-grammar-lines');
    svg.setAttribute('aria-hidden', 'true');
    body.append(original, cards, svg);

    const status = element(doc, 'p', 'neo-grammar-status', model.status);
    status.id = 'neo-grammar-status';
    status.setAttribute('role', 'status');
    const notice = element(doc, 'p', 'neo-grammar-notice', model.notice);
    notice.setAttribute('role', 'status');
    // "Nothing to suggest." belongs beside the button that asked, not under the
    // window where it reads as a page-level message.
    notice.hidden = !model.notice;
    top.append(notice);
    const actions = element(doc, 'div', 'neo-grammar-actions');
    const close = element(doc, 'button', 'neo-grammar-cancel', x('Close'));
    close.type = 'button';
    const replace = element(doc, 'button', 'neo-grammar-replace', x('Replace'));
    replace.type = 'button';
    replace.disabled = !model.canReplace;
    replace.setAttribute('aria-describedby', 'neo-grammar-status');
    if (model.blank) replace.title = x('The passage would be emptied.');
    actions.append(close, replace);
    root.append(top, body, status);
    root.append(actions);

    return {
      element: root, top, corrected: correctedText, original: originalText,
      cards, body, svg, status, notice, style, spinner, close, replace, model
    };
  }

  function rectToLocal(rect, box, zoom) {
    const scale = Number(zoom) > 0 ? Number(zoom) : 1;
    const left = Number(rect.left) - Number(box.left);
    const top = Number(rect.top) - Number(box.top);
    const right = Number(rect.right) - Number(box.left);
    const bottom = Number(rect.bottom) - Number(box.top);
    return {
      left: left / scale,
      top: top / scale,
      right: right / scale,
      bottom: bottom / scale,
      width: (right - left) / scale,
      height: (bottom - top) / scale
    };
  }

  // The cards stand clear of the text, so a line can leave the middle of the marked
  // word's underline, drop through empty space, and meet the middle of the card's
  // top border. Starting at the word's edge made the line hug the sentence.
  function lineEnds(from, to) {
    return {
      x1: from.left + from.width / 2,
      y1: from.bottom,
      x2: to.left + to.width / 2,
      y2: to.top
    };
  }

  // The modal is inside core's .modal, which carries the Interface Size zoom, so
  // viewport rects are divided by the same ratio core uses for its own measures.
  function drawLines(view) {
    try {
      if (!view || !view.body || typeof view.body.getBoundingClientRect !== 'function') return;
      const body = view.body;
      const box = body.getBoundingClientRect();
      if (!box || !box.width) return;
      const zoom = body.offsetWidth ? box.width / body.offsetWidth : 1;
      while (view.svg.firstChild) view.svg.removeChild(view.svg.firstChild);
      view.svg.style.width = `${body.scrollWidth}px`;
      view.svg.style.height = `${body.scrollHeight}px`;
      const shiftX = body.scrollLeft || 0;
      const shiftY = body.scrollTop || 0;
      for (const marked of view.original.querySelectorAll('[data-card]')) {
        const index = marked.getAttribute('data-card');
        const card = view.cards.querySelector(`[data-card="${index}"]`);
        if (!card) continue;
        const range = document.createRange();
        range.selectNodeContents(marked);
        let rects = [...range.getClientRects()].filter((rect) => rect.width > 0 && rect.height > 0);
        if (!rects.length) {
          const own = typeof marked.getBoundingClientRect === 'function' ? marked.getBoundingClientRect() : null;
          if (own && own.height > 0 && own.width > 0) rects = [own];
        }
        if (!rects.length) continue;
        const last = rects[rects.length - 1];
        const from = rectToLocal(last, box, zoom);
        const to = rectToLocal(card.getBoundingClientRect(), box, zoom);
        const ends = lineEnds(from, to);
        const x1 = ends.x1 + shiftX;
        const y1 = ends.y1 + shiftY;
        const x2 = ends.x2 + shiftX;
        const y2 = ends.y2 + shiftY;
        const path = document.createElementNS
          ? document.createElementNS('http://www.w3.org/2000/svg', 'path')
          : document.createElement('path');
        // Leave the word straight down, then bend across the gap to the card.
        path.setAttribute('d', `M ${x1} ${y1} C ${x1} ${y1 + 26}, ${x2} ${y2 - 26}, ${x2} ${y2}`);
        path.dataset.card = String(index);
        const yellow = marked.classList.contains('neo-grammar-yellow');
        path.setAttribute('class', `neo-grammar-line neo-grammar-line-${yellow ? 'style' : 'grammar'}`);
        view.svg.appendChild(path);
      }
    } catch { /* lines are decoration */ }
  }

  window.NeoGrammarBoard = { element, buildModel, renderBoard, rectToLocal, lineEnds, drawLines };
})();
