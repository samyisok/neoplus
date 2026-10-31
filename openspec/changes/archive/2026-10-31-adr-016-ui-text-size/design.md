# Design

## Context

See `proposal.md` for motivation. Today `--ui-zoom` (ADR-015) scales whole
surfaces by `zoom`, so text and frame grow together. The fork's CSS
(`neo-ext/neo-ext.css`) sizes its text in pixels, which is why a text-only scale
needs a second variable applied to every one of those font sizes. The library
already carries per-device look fields (`DEVICE_LOOK`), the settings registry has
a `zoom` control (label, percentage, step, preview), and `applyFonts` publishes
the interface size.

## Goals / Non-Goals

**Goals:**

- A readable text scale for the fork's pane, dialogs, toasts, and hints that
  leaves their boxes untouched.
- The same preview/Cancel/Save and per-device contract as Interface Size.
- One owner for the range, snapping, and stepping.

**Non-Goals:**

- Scaling the core interface's text (shelf, navigation pane, menus); it follows
  Interface Size.
- Scaling the page, its zoom, editor type size, or page width.
- A font-family picker, a second View menu item, or a per-book size.

## Decisions

### D1 — `library.uiText`, per device

A number from 0.9 to 2, default 1, stored with the library's look and added to
the per-device list (`DEVICE_LOOK`). The line that adds it is marked as a seam, so
upstream's list stays recognisable. Existing libraries read 100%.

### D2 — Publish through one seam

`applyFonts` gains one marked line beside the interface-size seam:

```js
if (window.NeoExt && NeoExt.uiText) NeoExt.uiText(library); /* NEO-EXT seam */
```

`neo-ext/interface-size.js` answers by writing `--ui-text` (snapped). Every look
application — launch, library read, device re-apply, settings save — therefore
publishes it. `boot.js` re-applies fonts after load (ADR-015), which covers the
boot-order case for both sizes.

### D3 — Multiply the fork's font sizes; never touch core CSS

Every numeric `font-size` in `neo-ext/neo-ext.css` becomes
`calc(<size> * var(--ui-text, 1))`. That is the whole mechanism: no root font
change, no `rem`/`em` refactor, no compounding, and the scope is exactly the
fork's surfaces because core's `styles.css` is not edited. A CSS test asserts
every numeric fork font size carries the multiplier, so a later rule cannot
silently opt out.

### D4 — A second row on the same group

The settings registry's `zoom` control type already renders a label, an `output`,
and three buttons, and the click handler sets `__touched_<key>`. The group gains a
second control (`key: 'uiText'`) with its own format, step, and preview. Save
writes Interface Size and Interface text independently: each uses the stored
value when untouched and its own pressed value otherwise.

### D5 — Text preview is CSS only

`previewText(z)` sets `--ui-text`; no library write, no menu label (there is no
menu door for text). Cancel restores the stored size for both rows through the
group's `onClose`, and the dialog itself shows the effect because its own font
sizes are fork styles.

### D6 — Rules live in the adapter

`api.snapUiText`/`stepUiText` own the 0.9–2 range and tenths; `setUiText` mirrors
`setUiZoom` (write only when changed, restore memory and the device copy on
failure, then apply fonts). The view module carries no copy of the rule.

## Risks / Trade-offs

- **Core chrome text does not grow** → stated in the spec and the control's hint;
  a writer who wants everything larger uses Interface Size.
- **Fixed-width controls at 200%** → inputs keep their box and scroll their text;
  the dialog is allowed to scroll. The e2e checks a dialog at 200% for overflow of
  its box, not of every label.
- **A missed font-size declaration** → the CSS test walks every numeric fork
  declaration; one without the multiplier fails.
- **Two multipliers on text** (`--ui-zoom` on the surface and `--ui-text` on the
  font) → intended: the first scales the frame, the second the text inside it.
- **A device seam in an upstream array** → one marked line, in the table and
  `check-seams.js`.

## Migration Plan

None. `uiText` defaults to 1 for every existing library; the device list gains a
key that older versions simply ignore.
