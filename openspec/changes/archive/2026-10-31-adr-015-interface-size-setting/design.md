# Design

## Context

Interface Size is not new. Core keeps `library.uiZoom` (a tenth from 0.9 to 3),
publishes it as `--ui-zoom`, and `styles.css` applies `zoom: var(--ui-zoom)` to
the shelf, both panes, the bottom bar, the search bar, `#hint`, and every
`.modal`. View → Interface Size (`uiZoomStep` in `app.js`) writes the value and
`applyFonts()` republishes it; each device keeps its own copy through
`DEVICE_LOOK`. The fork's dialogs already use `.modal`, so they scale.

What is missing is a way in. The menu item is `more: true`, so Simple NEO strips
it; and `applyFonts()` resolves `moreOn() ? snapZoom(library.uiZoom) : 1`, so even
if a stored size existed, Simple NEO would ignore it. The fork's toast
(`.neo-ext-toast`) is a body child outside the zoomed surfaces. The Settings
window has a group registry and a small set of control types, and it is zoomed
itself, so it can host the control and show its own effect.

## Goals / Non-Goals

**Goals:**

- One visible control in Settings → General, in both Simple and full NEO.
- Live preview with the window's existing Cancel/ Save contract.
- The same value as the View menu, snapped and clamped by the same rules.
- Every interface surface, toast included, at the chosen size.

**Non-Goals:**

- A separate text-only size, a per-book size, or a theme change.
- Scaling the manuscript, the page zoom, the editor type size, or page width.
- Scaling the operating system's own menus, the native spellcheck menu, or the
  macOS Look Up popup.
- Pocket, which does not load the fork's interface layer and keeps its own UI.
- The one-time Simple NEO migration (`usesMoreFeatures`), which still treats a
  non-100% size as a sign that the writer used Show More Features. It runs once,
  it is upstream code, and changing it is a separate seam.

## Decisions

### D1 — Reuse `library.uiZoom` and `--ui-zoom`; store nothing new

The setting already has one owner, one range, and one per-device copy. A second
"UI text size" field would immediately need its own merge and device rules for no
gain. Everything reads the existing value, and a value between steps is snapped by
core's `snapZoom`, so Settings and the menu cannot disagree.

### D2 — A `zoom` control type in the settings registry

`neo-ext/settings.js` gains one control type: a label, a **Smaller** button, the
percentage, a **Larger** button, and **Reset**, with the percentage in an
`output` (announced as text). The group supplies the value and a `preview`
callback; the registry does not know what a zoom is. This keeps the window's
markup untouched and follows the existing "a group declares controls" rule.

### D3 — Preview through the stylesheet, save through the library

`preview(z)` sets `--ui-zoom`, toggles `ui-zoomed`, and tells the native menu the
new value (`window.neo.uiZoomState`), exactly as `applyFonts` does for a committed
size. It deliberately does not write the library, so stepping through 90–300%
costs nothing and Cancel is a plain restore.

**Save** calls `api.setUiZoom(z)`: clamp; if the value already matches the stored
one, answer `{ ok: true }` without a write; otherwise set `library.uiZoom`,
`writeLibrary`, then `applyFonts()`. A rejected write returns
`{ ok: false, reason }`; the dialog shows it and stays open with the choice still
on screen. `writeLibrary` also keeps this device's copy, as every other view
setting does.

**Cancel** (button, Escape, or backdrop) calls the group's `onClose(values, false)`,
which reads `api.uiZoom()` — the value actually stored, so a step taken from the
View menu while the window was open is kept — and previews that. Save calls the
hook with `true`, which does nothing. The registry gains that optional hook; a
group without it closes as before.

The native menu can still act while the window is open; in that case the preview
follows the menu until the next press of a control, whose value the writer can see
and which Save writes. Cancel restores the menu's value.

### D4 — One seam in `applyFonts`, policy in the fork

Simple NEO must honor the choice, but `applyFonts` is upstream code. The whole
change there is one marked line:

```js
const uiZoom = window.NeoExt && NeoExt.uiZoom
  ? NeoExt.uiZoom(library, moreOn())
  : (moreOn() ? snapZoom(library.uiZoom) : 1); /* NEO-EXT seam */
```

`neo-ext/boot.js` delegates to `neo-ext/interface-size.js`, which returns the
snapped size in both modes (falling back to the legacy rule when the module is
not loaded). The alternative — leave the `moreOn()` gate and hide the control in
Simple NEO — was rejected: a size control that exists but does nothing is worse
than no control, and this is an accessibility choice, not a panel or a tool.

### D5 — The toast joins the zoomed surfaces

`.neo-ext-toast` is appended to `body`, outside `#side-pane` and outside `.modal`.
One rule gives it `zoom: var(--ui-zoom)` and a matching `max-width`, so a long
message wraps instead of running off a narrow window. No other fork surface lives
outside a zoomed ancestor: the pane views are inside `#side-pane`, and every fork
dialog's card is `.modal`.

### D6 — The page is fenced off

Nothing in this change touches `--page-zoom`, `--editor-size`, or the page-width
variables. Interface Size is applied to interface selectors only. Ctrl/⌘ + and −
keep their current meaning (page and text), and the two can be combined.

### D7 — The menu label follows Settings

`applyFonts` already reports the committed value through `uiZoomState`; the
preview reports it too, so the View menu label reads the same number while the
dialog is open. On Cancel the restore reports the old value back.

## Risks / Trade-offs

- **The dialog resizes under the pointer** → buttons stay where they are in the
  dialog's own layout; growth is centered and capped by the existing
  `max-height: calc(85vh / --ui-zoom)` rule, and the e2e drives the buttons by
  selector, not coordinates.
- **300% makes the settings window large** → the same cap keeps it on screen; the
  control row stays at the top of General.
- **A native menu step while Settings is open** → the menu can still change the
  library value, and the preview follows it until the writer presses a control.
  The control's percentage can lag until it is pressed; Save writes the visible
  choice, Cancel restores the value stored at that moment (the menu's, if newer).
- **A toast at 300%** → `max-width` and wrapping keep it inside the window.
- **Simple NEO policy change** → deliberate and documented; the alternative is
  recorded above.

## Migration Plan

None. Existing `uiZoom` values keep working; a value between steps snaps on the
next read; Simple NEO starts honoring the value already in the library, so a
writer who had set 130% in full NEO sees it in Simple NEO from then on.
