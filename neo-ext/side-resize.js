// NEO fork — resize the right-hand pane from its left edge (adr-004)
//
// The pane is core NEO. This module adds only a fixed separator inside it,
// publishes the width as --neo-side-w, and remembers one per device. It
// never edits a chapter and never sends IPC.

'use strict';

(function () {
  const rules = window.NeoExtSideRules;
  const api = window.NeoExtApi;
  if (!rules || !api) return;

  const pane = document.getElementById('side-pane');
  const gripId = 'neo-ext-side-grip';
  if (!pane || document.getElementById(gripId)) return;

  const editorView = document.getElementById('editor-view');
  const paper = document.getElementById('paper-scroll');
  const nav = document.getElementById('nav-pane');
  const BODY_CLASS = 'neo-ext-resizing';

  const x = (s, vars) => {
    if (window.NeoExt && typeof window.NeoExt.x === 'function') return window.NeoExt.x(s, vars);
    const dict = (typeof window !== 'undefined' && window.NeoExtLocale) || {};
    const text = typeof dict[s] === 'string' ? dict[s] : s;
    if (text !== s) {
      return vars ? String(text).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text;
    }
    return s;
  };

  let stored = readStore();
  let current = stored;
  let applied = false;
  let drag = null;
  let resizeFrame = 0;
  let lastZoom = null;

  function store() {
    try { return window.localStorage; } catch { return null; }
  }

  function readStore() {
    return rules.read(store());
  }

  function zoom() {
    const root = document.documentElement;
    const raw = parseFloat(getComputedStyle(root).getPropertyValue('--ui-zoom'));
    if (Number.isFinite(raw) && raw > 0) return raw;
    const inline = parseFloat(root.style.getPropertyValue('--ui-zoom'));
    return Number.isFinite(inline) && inline > 0 ? inline : 1;
  }

  function viewport() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
  }

  function heldOpen() {
    return pane.dataset.pinned === '1' || !!(editorView && editorView.classList.contains('darlings-tab'));
  }

  // The on-screen room the pane may take without covering the page. Only a
  // pinned pane, or the Darlings tab's held-open one, uses it; the Outline's
  // board shrinks its card area with the pane instead.
  function room() {
    if (!editorView || editorView.hidden) return Infinity;
    if (editorView.classList.contains('board-on')) return Infinity;
    if (!heldOpen()) return Infinity;
    const used = editorView.classList.contains('nav-pinned') && nav ? nav.getBoundingClientRect().width : 0;
    const page = paper ? paper.getBoundingClientRect().width : 0;
    return rules.roomWidth(viewport(), used, page);
  }

  function enabled() {
    try { return api.moreFeatures(); } catch { return false; }
  }

  function updateAria() {
    if (!grip) return;
    const b = rules.bounds(viewport(), zoom(), room());
    grip.setAttribute('aria-valuemin', String(b.min));
    grip.setAttribute('aria-valuemax', String(b.max));
    grip.setAttribute('aria-valuenow', String(current));
  }

  function setWidth(width) {
    const next = Math.round(width);
    if (next === current && applied) { updateAria(); return; }
    current = next;
    applied = true;
    document.documentElement.style.setProperty('--neo-side-w', current + 'px');
    updateAria();
  }

  function showGrip(on) {
    if (!grip) return;
    grip.hidden = !on;
  }

  // The one place the observeds state is resolved. A drag owns the width
  // until it ends, so resize/observer callbacks must not overwrite it.
  function refresh() {
    if (!enabled()) {
      showGrip(false);
      setWidth(rules.DEFAULT);
      return;
    }
    showGrip(true);
    if (drag) {
      setWidth(rules.clamp(current, viewport(), zoom(), room()));
      return;
    }
    setWidth(rules.clamp(stored, viewport(), zoom(), room()));
  }

  function onDown(e) {
    if (!enabled()) return;
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    drag = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startWidth: current,
      moved: false
    };
    document.body.classList.add(BODY_CLASS);
    pane.classList.add('open');
    try { grip.setPointerCapture(e.pointerId); } catch { /* synthetic or already gone */ }
  }

  function onMove(e) {
    if (!drag || e.pointerId !== drag.pointerId) return;
    pane.classList.add('open');
    const next = rules.fromDrag(drag.startWidth, e.clientX - drag.startX, viewport(), zoom(), room());
    if (next !== current) drag.moved = true;
    setWidth(next);
  }

  function onUp(e) {
    if (!drag || (e && e.pointerId !== drag.pointerId)) return;
    const held = drag;
    drag = null;
    document.body.classList.remove(BODY_CLASS);
    try { grip.releasePointerCapture(held.pointerId); } catch { /* not captured */ }
    if (held.moved && current !== held.startWidth) {
      stored = current;
      rules.remember(store(), stored);
    }
    // Settle on what the stored choice can actually be here. A drag fully
    // absorbed by a clamp leaves the old choice for a wider window.
    setWidth(rules.clamp(stored, viewport(), zoom(), room()));
    if (e && e.type === 'pointerup' && !heldOpen()) {
      const box = pane.getBoundingClientRect();
      const outside = e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom;
      if (outside) pane.classList.remove('open');
    }
  }

  function onKey(e) {
    if (!enabled()) return;
    const next = rules.fromKey(current, e.key, viewport(), zoom(), room(), e.shiftKey);
    if (next === null) return;
    e.preventDefault();
    if (next === current) return; // the clamp absorbed the step; keep the choice behind it
    stored = next;
    rules.remember(store(), stored);
    setWidth(next);
  }

  function onReset(e) {
    if (!enabled()) return;
    e.preventDefault();
    stored = rules.DEFAULT;
    rules.remember(store(), stored);
    setWidth(rules.clamp(stored, viewport(), zoom(), room()));
  }

  // While a drag is live the core hover-close must not slide the pane away.
  function keepOpen(e) {
    if (!drag) return;
    if (e && e.type === 'blur') {
      // let the rest of the blur listeners see the drag, then reopen
      setTimeout(() => { if (drag) pane.classList.add('open'); }, 0);
      return;
    }
    pane.classList.add('open');
  }

  function onResize() {
    if (resizeFrame) return;
    resizeFrame = requestAnimationFrame(() => {
      resizeFrame = 0;
      refresh();
    });
  }

  const grip = document.createElement('div');
  grip.id = gripId;
  grip.className = 'neo-ext-side-grip';
  grip.setAttribute('role', 'separator');
  grip.setAttribute('aria-orientation', 'vertical');
  grip.setAttribute('aria-label', x('Resize the notes pane'));
  grip.title = x('Drag to resize the notes pane');
  grip.tabIndex = 0;
  pane.prepend(grip);
  lastZoom = zoom();

  grip.addEventListener('pointerdown', onDown);
  grip.addEventListener('keydown', onKey);
  grip.addEventListener('dblclick', onReset);
  window.addEventListener('pointermove', onMove, true);
  window.addEventListener('pointerup', onUp, true);
  window.addEventListener('pointercancel', onUp, true);
  pane.addEventListener('mouseleave', keepOpen);
  document.documentElement.addEventListener('mouseleave', keepOpen);
  window.addEventListener('blur', keepOpen);
  window.addEventListener('resize', onResize);

  if (window.ResizeObserver) {
    const ro = new ResizeObserver(() => { if (!drag) refresh(); });
    if (paper) ro.observe(paper);
    if (nav) ro.observe(nav);
  }

  if (editorView) {
    new MutationObserver(() => { if (!drag) refresh(); })
      .observe(editorView, { attributes: true, attributeFilter: ['hidden', 'class'] });
  }

  // The interface size is written after an await, so its menu message is too
  // early; the root's style changing is the reliable signal.
  new MutationObserver(() => {
    const z = zoom();
    if (z === lastZoom) return;
    lastZoom = z;
    if (!drag) refresh();
  }).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class'] });

  if (window.neo && typeof window.neo.onMenu === 'function') {
    window.neo.onMenu((msg) => {
      if (!msg) return;
      if (msg.type === 'moreFeatures') refresh();
    });
  }

  refresh();
})();
