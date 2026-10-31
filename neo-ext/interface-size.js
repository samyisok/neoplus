// NEO fork — the Interface Size setting (adr-015)
//
// The same value the View menu changes, given a door in Settings and a policy
// that Simple NEO follows too. The group owns only presentation; snapping,
// stepping, and the write stay in the adapter and the core library.

'use strict';

(function () {
  const api = window.NeoExtApi;
  if (!api || typeof api.snapUiZoom !== 'function' || typeof api.stepUiZoom !== 'function' || typeof api.setUiZoom !== 'function') return;
  // An older adapter without the text functions keeps the Interface Size row.
  const textReady = typeof api.snapUiText === 'function' && typeof api.stepUiText === 'function'
    && typeof api.setUiText === 'function' && typeof api.uiText === 'function';
  const failedText = () => ({ ok: false, reason: x('The interface settings could not be saved.') });

  const x = (s, vars) => {
    try {
      if (window.NeoExt && typeof window.NeoExt.x === 'function') return window.NeoExt.x(s, vars);
    } catch { /* fall back to English */ }
    return vars ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : s;
  };

  // The range, snapping, and stepping live in the adapter and core; this
  // module only presents them.
  function percent(value) {
    return Math.round(api.snapUiZoom(value) * 100) + '%';
  }

  function textPercent(value) {
    return Math.round(api.snapUiText(value) * 100) + '%';
  }

  // The size this device should use, in either mode. Core's applyFonts asks
  // through NeoExt.uiZoom so Simple NEO stops forcing 100%.
  function uiZoomFor(library) {
    return api.snapUiZoom(library && library.uiZoom);
  }

  function preview(value) {
    const size = api.snapUiZoom(value);
    try { document.documentElement.style.setProperty('--ui-zoom', size); } catch { /* no page yet */ }
    try { document.documentElement.classList.toggle('ui-zoomed', size > 1); } catch { /* no page yet */ }
    try {
      if (window.neo && typeof window.neo.uiZoomState === 'function') window.neo.uiZoomState(size);
    } catch { /* the menu label is a nicety */ }
  }

  // The fork's own text: panes, dialogs, messages. Core's stylesheet is not
  // touched, so the shelf and menus keep following Interface Size.
  function applyText(library) {
    if (!textReady) return;
    const size = api.snapUiText(library && library.uiText);
    try { document.documentElement.style.setProperty('--ui-text', size); } catch { /* no page yet */ }
  }

  function previewText(value) {
    if (!textReady) return;
    const size = api.snapUiText(value);
    try { document.documentElement.style.setProperty('--ui-text', size); } catch { /* no page yet */ }
  }

  function load() {
    const values = { uiZoom: api.snapUiZoom(api.uiZoom()) };
    if (textReady) values.uiText = api.snapUiText(api.uiText());
    return values;
  }

  async function save(values) {
    const failed = failedText();
    try {
      // A View-menu step taken while the window was open is the stored value;
      // an untouched control saves that, not the percentage it opened with.
      const zoomTouched = !!(values && values.__touched_uiZoom);
      const textTouched = !!(values && values.__touched_uiText);
      const zoom = zoomTouched && typeof values.uiZoom !== 'undefined' ? values.uiZoom : api.uiZoom();
      const text = textReady && textTouched && typeof values.uiText !== 'undefined' ? values.uiText : (textReady ? api.uiText() : undefined);
      let out = null;
      if (typeof api.setUiLook === 'function') {
        out = await api.setUiLook(textReady ? { uiZoom: zoom, uiText: text } : { uiZoom: zoom });
      } else {
        out = await api.setUiZoom(zoom);
        if (out && out.ok && textReady) out = await api.setUiText(text);
      }
      return out && out.ok ? { ok: true } : failed;
    } catch {
      try { if (window.neo && typeof window.neo.logError === 'function') window.neo.logError('interface-size: save failed'); } catch { /* logging is a nicety */ }
      return failed;
    }
  }

  // Cancel restores what is stored now: a step taken from the View menu while
  // the window was open is the writer's newer choice, not something to undo.
  function onClose(values, saved) {
    if (saved) return;
    preview(api.uiZoom());
    if (textReady) previewText(api.uiText());
  }

  function register() {
    if (!window.NeoSettings || typeof window.NeoSettings.registerGroup !== 'function') return;
    window.NeoSettings.registerGroup({
      id: 'interface-size',
      title: x('Interface'),
      tab: 'General',
      controls: () => [{
        type: 'zoom',
        key: 'uiZoom',
        label: x('Interface Size'),
        format: percent,
        step: (current, direction) => api.stepUiZoom(current, direction),
        preview
      }, ...(textReady ? [{
        type: 'zoom',
        key: 'uiText',
        label: x('Interface text'),
        format: textPercent,
        step: (current, direction) => api.stepUiText(current, direction),
        preview: previewText
      }, {
        type: 'note',
        text: x('Text grows in the side pane, dialogs, and messages. The shelf and menus follow Interface Size.')
      }] : [])],
      load,
      save,
      onClose
    });
  }

  window.NeoInterfaceSize = textReady ? { uiZoomFor, applyText } : { uiZoomFor };
  // Register after the groups that were here before it, so Backup keeps its
  // place at the top of General (boot.js loads after this file); the module
  // itself is ready for boot.js now.
  if (typeof document !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', register);
  } else {
    register();
  }
})();
