# Proposal

## Why

Interface Size scales the whole interface, boxes included. A writer who wants to
read the dense parts — the right-hand pane, the dialogs, the messages — finds
that enlarging them also widens every pane and window, and shrinking them back
leaves the text small again. The fork's own CSS sizes its text in pixels, so
today there is no way to grow the reading text without growing the frame.

## What Changes

- Add **Interface text** to Settings → General, beside Interface Size: 90% to
  200% in 10% steps, with **Smaller**, **Larger**, and **Reset**.
- It scales only the text of the fork's own surfaces — the right-hand pane
  (Notes, Records, Inventory, History), the Settings, Thesaurus, Dictionary,
  Rephrase, and Inventory dialogs, and the fork's toasts and hints. Pane widths,
  buttons, spacing, and dialog boxes stay where they are.
- It previews live and obeys the settings window's contract: Cancel or Escape
  restores the stored size; Save keeps it.
- It is the same kind of setting as Interface Size: per device, kept with the
  library, re-applied from the device's own storage, and present in Simple NEO.
- It does not touch Interface Size, the page's text or zoom, or the core
  interface's own chrome (shelf, navigation pane, menus), which continue to
  follow Interface Size.
- No View-menu item: this is a reading choice, not a window scale.

## Capabilities

### New Capabilities
- `ui-text-size`: a text-only scale for the fork's panes, dialogs, and messages —
  where it lives, what it changes, what it leaves alone, and how it previews,
  saves, cancels, and follows the device.

## Impact

- `neo-ext/interface-size.js`: a second control and its preview/save/restore, on
  the same group.
- `neo-ext/settings.js`: the `zoom` control already carries a label, format,
  step, and preview; the group gets a second row, and the per-key touched flag
  already exists.
- `neo-ext/api.js`: `uiText`, `snapUiText`, `stepUiText`, `setUiText`, mirroring
  the interface-size adapter.
- `app.js`: one marked seam publishing the text size from `applyFonts`, and
  `uiText` added to the per-device look list (a second marked line).
- `neo-ext/neo-ext.css`: every fork font size becomes
  `calc(<size> * var(--ui-text, 1))`; no core stylesheet is touched, which is
  what bounds the scope to the fork's surfaces.
- `neo-ext/boot.js`: the existing re-apply also publishes the text size; the seam
  keeps core's fallback.
- `index.html`/`check-seams.js`, `AGENTS.md` (two seams), `locales/en.json`.
- Tests: `scripts/api.test.js`, `scripts/interface-size.test.js`,
  `scripts/interface-size-css.test.js`, `scripts/interface-size.e2e.js`.
- No change to the page, editor size, page width, `book.json`, or the library's
  shape beyond `uiText`.
