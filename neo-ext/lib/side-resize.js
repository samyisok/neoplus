// NEO fork — the right-hand pane's width rules (adr-004)
//
// Pure: no DOM, no storage of its own. The handle in neo-ext/side-resize.js
// calls these, so a drag, a key, and a restart all agree on the bounds.

'use strict';

(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.NeoExtSideRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const DEFAULT = 250;
  const MIN = 220;
  const MAX = 840;
  const MAX_FRACTION = 0.675;
  const STEP = 16;
  const BIG_STEP = 64;
  const KEY = 'neo-ext-side-width';

  // viewport and room are on-screen pixels; zoom is the interface size. The
  // pane is inside that zoom, so every limit becomes a smaller CSS width as
  // the interface grows. The minimum always wins when a narrow window or a
  // page with little room would leave less than that.
  function bounds(viewport, zoom = 1, room = Infinity) {
    const vp = Number.isFinite(viewport) && viewport > 0 ? viewport : 0;
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const rm = Number.isFinite(room) ? room : Infinity;
    const forWindow = Math.floor((vp * MAX_FRACTION) / z);
    const forRoom = Math.floor(rm / z);
    const max = Math.max(MIN, Math.min(MAX, forWindow, forRoom));
    return { min: MIN, max };
  }

  function roomWidth(viewport, navWidth, pageWidth) {
    const vp = Number.isFinite(viewport) && viewport > 0 ? viewport : 0;
    const nav = Number.isFinite(navWidth) && navWidth > 0 ? navWidth : 0;
    const page = Number.isFinite(pageWidth) && pageWidth > 0 ? pageWidth : 0;
    return Math.max(0, vp - nav - page);
  }

  function clamp(value, viewport, zoom, room) {
    const { min, max } = bounds(viewport, zoom, room);
    const n = Number(value);
    if (!Number.isFinite(n)) return Math.min(max, Math.max(min, DEFAULT));
    return Math.min(max, Math.max(min, Math.round(n)));
  }

  // The pointer travels in unzoomed window pixels while the pane's width is a
  // CSS length inside `zoom`; dragging left widens.
  function fromDrag(startWidth, dx, viewport, zoom, room) {
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    const start = Number.isFinite(Number(startWidth)) ? Number(startWidth) : DEFAULT;
    const delta = Number.isFinite(Number(dx)) ? Number(dx) : 0;
    return clamp(start - delta / z, viewport, z, room);
  }

  function fromKey(current, key, viewport, zoom, room, shift) {
    const step = shift ? BIG_STEP : STEP;
    const z = Number.isFinite(zoom) && zoom > 0 ? zoom : 1;
    if (key === 'ArrowLeft') return clamp(Number(current) + step / z, viewport, z, room);
    if (key === 'ArrowRight') return clamp(Number(current) - step / z, viewport, z, room);
    if (key === 'Home') return clamp(bounds(viewport, zoom, room).min, viewport, zoom, room);
    if (key === 'End') return clamp(bounds(viewport, zoom, room).max, viewport, zoom, room);
    return null;
  }

  function read(storage) {
    try {
      const raw = storage && storage.getItem(KEY);
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) return DEFAULT;
      return Math.min(MAX, Math.max(MIN, Math.round(n)));
    } catch { return DEFAULT; }
  }

  function remember(storage, width) {
    const n = Number(width);
    if (!Number.isFinite(n)) return false;
    try {
      storage.setItem(KEY, String(Math.min(MAX, Math.max(MIN, Math.round(n)))));
      return true;
    } catch { return false; }
  }

  return { DEFAULT, MIN, MAX, MAX_FRACTION, STEP, BIG_STEP, KEY, bounds, roomWidth, clamp, fromDrag, fromKey, read, remember };
});
