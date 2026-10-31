# Proposal

## Why

An interface size already exists — View → Interface Size, 90% to 300% in tenths
— but it is behind Show More Features, lives in a menu with no hint, and is the
last place a writer looks when the right-hand pane, the dialogs, and the shelves
read too small. Simple NEO has no way to reach it at all. The writer's request is
blunt: put it in Settings, where sizes belong.

## What Changes

- Add an **Interface Size** control to Settings → General: a percentage with
  **Smaller** and **Larger** (10% steps) and **Reset**, from 90% to 300%.
- It previews live while the dialog is open, and obeys the window's existing
  contract: Cancel or Escape restores the size that was in use; Save keeps it.
- The control is present in Simple NEO as well as full NEO. Interface size is an
  accessibility choice, not an extra feature; a one-line seam lets the fork's own
  policy decide, so Simple NEO stops forcing 100%.
- One value, two doors: the control and View → Interface Size read and write the
  same setting, and the menu label follows a change made in Settings. The menu
  item keeps its current place behind Show More Features; Settings is the door
  Simple NEO gets.
- Pocket is unchanged: it does not load the fork's interface layer and keeps its
  own UI.
- Everything except the page follows the size: shelf, navigation pane, right-hand
  pane (Notes, Records, Inventory, History), bottom bar, search bar, hints,
  NEO's toasts, and every dialog — Settings, Thesaurus, Dictionary, Rephrase,
  Inventory.
- The page keeps its own text zoom (Ctrl/⌘ + and −) and its type size; changing
  Interface Size SHALL NOT touch either.
- The value stays per device, as it is today: saved with the library so a device
  new to the library starts from it, and re-applied from `localStorage` on every
  write, so two devices never fight over it.

## Capabilities

### New Capabilities
- `interface-size`: one setting for how large the application's own interface
  reads — where it lives, what it scales, how it previews, saves, cancels, and
  stays in step with the View menu, on the page and across devices.

## Impact

- New `neo-ext/interface-size.js`: the Settings group, its preview/revert/save,
  and the fork's policy for Simple NEO.
- `neo-ext/settings.js`: a `zoom` control type and an optional per-group close
  hook so a preview can be taken back.
- `neo-ext/api.js`: `uiZoom()` and `setUiZoom(percent)`, guarded, writing through
  the core library path.
- `app.js`: one line in `applyFonts`, marked as a seam, asking the fork for the
  size instead of deciding `moreOn()` inline; `neo-ext/boot.js` exposes it.
- `neo-ext/neo-ext.css`: the fork's toast joins the zoomed surfaces.
- `index.html` and `neo-ext/check-seams.js`: the new script and its seam.
- `AGENTS.md`: the seam and a short Interface Size note; version raised with the
  archive.
- Tests: pure rules in `scripts/zoom-rules.test.js`/a new settings-group test,
  and `scripts/interface-size.e2e.js`.
- No change to page zoom, page width, editor size, chapter files, `book.json`, or
  `library.json` shape beyond the existing `uiZoom` field.
