# Proposal

## Why

The right-hand pane is the only place NEO shows notes, loose outline cards, and book snapshots, and it is fixed at 250 px. That is narrow for cards and for the Character and Inventory tabs the fork plans to put there, and it is wasted room for a writer who only keeps short notes. Because the pane is an overlay that the writer pulls in on hover, it cannot learn a width from the page or the window: the writer has to choose one, per device.

## What Changes

- **A resize handle on the pane's left edge.** Dragging it changes the width as the pointer moves. The pane keeps at least 220 px, at most 840 px, never more than 67.5% of the window, and — while pinned — never wider than the room that leaves the page visible. A narrow window clamps the pane without forgetting the writer's choice; widening the window brings that choice back.
- **Keyboard and pointer, quietly.** The handle is a focusable separator: Left/Right change the width by 16 px, Shift with either changes it by 64 px, Home and End go to the limits, and a double-click restores 250 px. It stays invisible until the pane is hovered or the handle has keyboard focus, then shows as a one-pixel line and a resize cursor. No popup, no toast, no new menu item.
- **Remembered per device.** The chosen width is kept in this device's `localStorage`, beside the pinned panes and the interface zoom. It is not written to `book.json`, `library.json`, or a chapter, so one device's screen does not dictate another's.
- **The page follows.** When the pane is pinned, when the Darlings tab shows snapshots, and when the Outline fills the space with cards, the page column moves to clear the pane at its new width, at every interface size. Unpinned, the pane stays an overlay, exactly as it is now. With the left pane also pinned, the right pane stops where the page would otherwise go under it, and keeps its 220 px minimum on a window too small for both.
- **Behind Show More Features.** Simple NEO keeps the pane at 250 px. A width chosen with more features on is left in `localStorage` for the switch's return rather than erased.
- **Every tab that shares the pane.** The manuscript's notes, the Notes tab's chapter notes, the Outline's loose cards, and the Darlings snapshots all use the same pane, so one width serves them all.
- **A drag keeps the pane open.** The pane cannot slide away when the pointer leaves it mid-gesture; it closes on release as hover always would, unless it is pinned or holding snapshots.
- **Nothing else moves.** Hover, pin, focus, drop targets, and the pane's contents are unchanged. Resizing writes no book or library file, sends no IPC, and leaves the manuscript, the caret, the selection, the save state, and the undo history untouched.
- Desktop only. Pocket's pane is a different, already full-width layout and does not load the fork layer.

### Out of scope

- The planned Character and Inventory tabs, their data, and their storage. This change only gives their future container a width.
- Resizing the left Chapters pane, per-book widths, or preset width menu items.
- Any change to NEO's page width, interface zoom, or page theme.

## Capabilities

### New Capabilities

- `side-pane`: the right-hand pane's width, how the writer changes and remembers it, how the page and the pane's own tabs follow it, and the guarantee that resizing never reaches the book.

### Modified Capabilities

<!-- None: no existing capability changes behaviour. -->

## Impact

- New: `neo-ext/side-resize.js` (handle, pointer and keyboard, state refresh) and `neo-ext/lib/side-resize.js` (pure bounds, clamps, and saved value), CSS in `neo-ext/neo-ext.css`, two script tags in the existing fork block in `index.html`, strings in `neo-ext/locales/en.json`.
- `neo-ext/check-seams.js` and the seam list in `AGENTS.md` learn the new script; no new upstream seam is added. The only upstream files touched are `index.html`'s fork script block (already a seam) and this fork's own `neo-ext/` files.
- Upstream `styles.css` is not edited. Its six page-offset rules that assume a 250 px pane are overridden from `neo-ext/neo-ext.css`; a contract test fails if upstream renames one of them.
- New tests: pure width rules, the CSS offset contract, and a real-launch `npm run test:sidepane` covering drag, keyboard, limits, persistence, pinned geometry, interface zoom, tab switches, simple NEO, and the absence of book writes.
- No new dependency, no network call, no data file. The fork version becomes `1.6.0+fork.4` when this ADR is archived.
