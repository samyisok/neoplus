# Design

## Context

See `proposal.md` for motivation and `specs/side-pane/spec.md` for the behaviour contract.

The right-hand pane is a core NEO element (`#side-pane` in `index.html`, `styles.css`), not a fork element. It is `position: fixed` on the right, 250 px wide, slides in with a transform, and holds whichever list the current tab wants: sticky notes, the Notes tab's chapter notes, loose outline cards, or the snapshots list. The fork already injects its own CSS (`neo-ext/neo-ext.css`) and loads its scripts after `app.js` from one marked block in `index.html`.

Two properties of the existing pane matter:

- It is zoomed with `zoom: var(--ui-zoom)`. A width written in CSS pixels therefore occupies `width × uiZoom` device pixels, and every page offset that clears the pane already multiplies by the same variable.
- Its pin button (`#side-pin`) is `position: fixed` inside the pane. The pane's transform makes it the containing block, so a fixed child sits at the pane's edge and stays there while the notes list scrolls. The resize control can use the same trick.

Six rules in `styles.css` hardcode the pane's 250 px when placing the page or the Outline's cards:

| Rule | Assumption |
|---|---|
| `#editor-view.side-pinned #paper-scroll` | page centre moves left by 125 px (half) |
| `#editor-view.nav-pinned.side-pinned #paper-scroll` | centre moves by (250 − 248)/2 = 1 px |
| `#editor-view.darlings-tab #paper-scroll` | page centre moves left by 125 px |
| `#editor-view.darlings-tab.nav-pinned #paper-scroll` | same (250 − 248)/2 |
| `#editor-view.board-on.side-pinned #paper-scroll` | cards end 250 px from the right |
| `#editor-view.board-on.nav-pinned.side-pinned #paper-scroll` | same, plus the left pane |

Constraints: upstream `styles.css` is not a fork seam, so it is not edited. `app.js` gets no new seam unless this feature cannot work without one. The renderer has no filesystem or network access; the fork stores no plugin data in `book.json` or `library.json`.

## Goals / Non-Goals

**Goals:**

- One width, changed from the pane's edge, shared by every tab that uses the pane.
- Page and Outline geometry that follows that width at any interface size.
- A device-local memory that never touches the book or the library.
- No new upstream logic seam, no new dependency, no DOM restructuring of core lists.

**Non-Goals:**

- The Character and Inventory tabs themselves.
- Resizing the left Chapters pane, per-book widths, or a width menu.
- Any change to hover, pin, focus, drag-and-drop, page width, or interface size.
- Pocket.

## Decisions

### D1. A fork-only module, loaded from the existing fork block

`neo-ext/lib/side-resize.js` holds the pure rules; `neo-ext/side-resize.js` holds the DOM behaviour. Both are added to the fork's script block in `index.html` (the existing seam), and `neo-ext/check-seams.js` gains both anchors. No line in `app.js`, `main.js`, or `styles.css` is added or changed.

Alternatives considered: a core edit to `styles.css` (rejected — the seam table allows no such edit, and a merge would conflict); a menu of preset widths (rejected — the request is a drag, and presets add UI without solving the future tab layout); a separate floating handle outside the pane (rejected — crossing the pane's edge would trigger the pane's own hover-close).

### D2. The handle lives inside the pane, fixed to its left edge

A `div` with `role="separator"`, `aria-orientation="vertical"`, `tabindex="0"`, and an accessible name is prepended to `#side-pane` at boot, so it is the pane's first keyboard stop. It is a zero-height `position: sticky` element at the pane's top; its pseudo-elements carry a 10 px hit area and the one-pixel line down the pane. Sticky, rather than the pin's fixed, because a fixed child inside this transformed *scrolling* pane still moves with the notes — the e2e caught it. Because it is inside the pane:

- moving the pointer from the notes onto the handle does not leave the pane, so the existing `mouseleave` close never fires;
- the pane's transform carries it off screen when the pane is closed, and back in when it opens;
- it does not scroll away with a long notes list.

The element is visually transparent; a one-pixel line and `cursor: col-resize` appear on `:hover`, `:focus-visible`, and while dragging. It sits above the pane's scrolling content with a small `z-index`, and the card lists keep their 12–14 px side padding, so the 10 px strip touches no interactive content.

Pointer input uses Pointer Events with `setPointerCapture`, `preventDefault` on `pointerdown` (no text selection, no focus jump), live width updates on `pointermove`, and one save on `pointerup` or `pointercancel`. A `dblclick` resets to 250 px.

A drag can leave the pane long before it ends. The core `wireHoverPane` listener closes an unpinned pane on `mouseleave`, and `closeUnpinnedPanes` closes it on the document's `mouseleave` and the window's `blur`, which would slide the handle out from under the captured pointer mid-gesture. While a drag is live the module marks `body` with `neo-ext-resizing` and re-asserts `.open` on every `pointermove`, on the pane's and document's `mouseleave`, and on the window's `blur` (cheap and idempotent; the module's pane listener is registered after the core's, so the pane never paints closed). On `pointerup`, if the pointer is outside the pane and the pane is neither pinned nor held open by the Darlings tab, the module closes it, so the hover behaviour the writer expects is unchanged after the gesture.

Alternatives considered: making the pane itself draggable within 8 px of its edge (rejected — invisible hit area, no keyboard focus target); wrapping the pane's content in a new scroll container so an absolute handle stays put (rejected — restructures core DOM for a problem the pin already solves).

### D3. One CSS variable, one pure width model

The width is published as `--neo-side-w` on `:root`; `neo-ext.css` makes `#side-pane { width: var(--neo-side-w) }` (the later stylesheet wins over the core's `250px`), and the page-offset overrides read the same variable. The CSS default is `250px`, so the pane has a sane width before the script runs.

`neo-ext/lib/side-resize.js` owns the numbers, with no DOM:

- `DEFAULT = 250`, `MIN = 220`, `MAX = 840`, `MAX_FRACTION = 0.675`, `STEP = 16`, `BIG_STEP = 64`, `KEY = 'neo-ext-side-width'`.
- `bounds(viewport, zoom = 1, room = Infinity)` → `{ min: 220, max: Math.max(220, Math.min(840, Math.floor(viewport * 0.675 / zoom), Math.floor(room / zoom))) }`. `viewport` and `room` are on-screen pixels; the pane is inside the interface zoom, so both limits are converted to CSS pixels. The `Math.max` keeps the 220 px minimum from being undercut at very large zoom, a very narrow window, or a page that leaves almost no room.
- `clamp(value, viewport, zoom, room)` → default for a non-finite or unreadable value, otherwise whole pixels inside the bounds.
- `fromDrag(startWidth, dx, viewport, zoom, room)` → `clamp(startWidth - dx / zoom, viewport, zoom, room)` (dragging left widens). The pointer travels in unzoomed window pixels while the pane's width is a CSS length inside `zoom`, so the delta is divided by the interface size; at 125%, a 120 px drag widens the pane's own width by 96 px and its on-screen edge by 120 px.
- `fromKey(current, key, viewport, zoom, room, shift)` → the next width, or `null` for a key the control does not use. Steps stay in the pane's own pixels (16 or 64), like the pane's other dimensions under the interface size.
- `read(storage)` / `remember(storage, width)` → guarded `localStorage` access; `'abc'`, `null`, a negative number, or a value above 840 reads as the default; a stored value is clamped to 220–840 on read and clamped again to the platform when applied.

The effective width is always `clamp(stored, viewport, zoom, room)`, so a narrow window, a larger interface, or a page with little room narrows the pane without rewriting what the writer chose. A resize that changes the visible width (a drag or a key step) starts from the visible width and commits it, replacing the old choice; a gesture that the clamp fully absorbs changes nothing and leaves the choice alone, so pressing Left Arrow at a 360 px clamp neither moves the pane nor forgets the 840 px behind it. Home, End, and a drag that moves the edge are the deliberate ways to replace a clamped choice.

`room` is the on-screen width the pane may take without covering the page. It is `Infinity` while the editor is hidden, on the Outline's board (where the page area is meant to shrink with the pane), and unless the pane is pinned or the Darlings tab holds it open. Otherwise it is `innerWidth` minus the pinned left pane's rect (when the left pane is pinned) minus `#paper-scroll`'s rect (which already includes the page's gutter). The DOM module measures it at the start of a drag, on each keyboard step, on `resize` (coalesced through `requestAnimationFrame`), from a `ResizeObserver` on `#paper-scroll` and `#nav-pane`, and from a `MutationObserver` on `documentElement`'s `style` and `class`, which is how `--ui-zoom` changes after the `uiZoomStep` menu message (the zoom is written after an `await`, so the message itself is too early). Observer- and resize-driven applies are skipped while `body.neo-ext-resizing` is set, and the live drag width is re-clamped instead, so the Outline's board — where the pane's width does change `#paper-scroll`'s width — cannot snap the pane back mid-gesture. Outside a drag, resizing the pane moves the page but does not change either measured width, so the observer settles. Every apply refreshes the separator's `aria-valuemax`/`aria-valuenow`.

Persisting only on commit keeps `localStorage` writes to one per gesture; the value is a small integer string under `neo-ext-side-width`, beside `neo-pinned-panes` and the per-device look. It is not part of `library.json`, so no library generation check and no sync conflict exist.

Alternatives considered: storing the width in `library.json` so devices share it (rejected — a laptop and a desktop need different widths, and fork data does not belong there); storing a fraction of the window (rejected — resizing the window would silently change the writer's pane); percentages in CSS (rejected — the same sync problem at read time).

### D4. Page geometry through overrides, guarded by a contract test

`neo-ext.css` reproduces the six rules with the variable, keeping the core's `--ui-zoom` factor and its existing selectors and order:

```css
:root { --neo-side-w: 250px; }

#side-pane { width: var(--neo-side-w); }

#editor-view.side-pinned #paper-scroll,
#editor-view.darlings-tab #paper-scroll {
  left: calc(50% - var(--neo-side-w) * 0.5 * var(--ui-zoom));
}

#editor-view.nav-pinned.side-pinned #paper-scroll,
#editor-view.darlings-tab.nav-pinned #paper-scroll {
  left: calc(50% - (var(--neo-side-w) - 248px) * 0.5 * var(--ui-zoom));
}

#editor-view.board-on.side-pinned #paper-scroll,
#editor-view.board-on.nav-pinned.side-pinned #paper-scroll {
  right: calc(var(--neo-side-w) * var(--ui-zoom));
}
```

Multiplying by `0.5` instead of dividing by `2` keeps the expression inside widely supported `calc()` syntax. At the default 250 px the formulas reproduce the core's 125 px, 1 px, and 250 px exactly, so nothing moves until the writer resizes.

A contract test reads both stylesheets and asserts that each of the six core selectors still exists in `styles.css` and has an override in `neo-ext.css` that mentions `--neo-side-w`. If upstream renames a selector or changes the pane's place in the layout, the test fails before the page can drift out of alignment.

Alternatives considered: `!important` on a single broad rule (rejected — cannot express the three different offsets); computing offsets in JavaScript (rejected — duplicates layout logic and fights zoom and window resize); editing `styles.css` to use a variable (rejected — not an allowed seam).

### D5. Show More Features, and when the state is applied

The pane belongs to Simple NEO, but resizing it follows the fork rule that a new feature sits behind File → Show More Features. `apply()` computes `enabled = NeoExtApi.moreFeatures()`:

- **on**: the handle is unhidden, and `--neo-side-w` is the effective stored width;
- **off**: the handle is hidden and `--neo-side-w` is `250px`; the stored value stays untouched.

It runs at boot, on a `moreFeatures` menu message, on a `uiZoomStep` message, and on a `MutationObserver` watching `#editor-view`'s `hidden` and `class` attributes (and `documentElement`'s `style`/`class` for the zoom, per D3). The module registers its own `window.neo.onMenu` subscription because boot's handler returns early for anything that is not `neo-ext`; it reads `{ type: 'moreFeatures', checked }` and `{ type: 'uiZoomStep', value }` and ignores the rest. The `#editor-view` observer covers the case that matters: at boot `library` has not loaded yet, so `moreOn()` is false; by the time a book opens, `library` is loaded, and the observer applies the real state. No timer polls, and no seam is added to `openBook`.

Tab switches need no work: the pane and its width are outside the tab content.

Alternatives considered: adding seam 4 (`NeoExt.bookOpened`) (rejected — the observer covers the same moment without touching `app.js`); polling until `library` loads (rejected — a timer for a value that becomes knowable through a DOM change).

### D6. Nothing is saved but the width

The module writes only `localStorage`, reads the page's geometry to cap a pinned width, and subscribes to the existing `window.neo.onMenu` channel; it sends no IPC, calls no other `window.neo` method, and makes no `fetch`. Pointer and key handlers never touch a range or a chapter, so the caret, selection, save state, and undo/redo stack cannot move. The existing `#side-pane` is not re-rendered, so its lists and their scroll positions survive a resize.

### D7. Tests

- `scripts/side-resize.test.js` — pure rules: defaults, bounds at several window widths, interface sizes, and page-room values (including the 67.5% or the room below the minimum), corrupt/oversized stored values, drag direction, every key and Shift, Home/End, guarded storage that throws.
- `scripts/side-resize-css.test.js` — the six-selector contract above plus the pane and root default.
- `scripts/side-resize.e2e.js` (`npm run test:sidepane`) — a real launch with a throwaway library:
  - the handle exists only with more features on;
  - pointer drag widens and narrows, live, and commits one value; dragging far outside the pane keeps it open until release;
  - limits hold, and a narrow window clamps then restores;
  - keyboard, Shift, Home/End, and double-click reset;
  - a reload restores the width;
  - pinned page shift equals half the change; both pinned centres; the page is not covered when both are pinned; Darlings and Outline geometry; interface size 125%;
  - the same width on Notes, Outline, and Darlings;
  - a long notes list scrolled to the bottom leaves the handle at the pane's edge;
  - pointer resizing keeps focus in the editor, writes no chapter/library file, adds no undo entry, and leaves the caret and selection where they were;
  - Simple NEO has no handle and stays 250 px with the stored width intact.

## Risks / Trade-offs

- **Upstream moves or changes one of the six offsets** → the CSS contract test fails and names the selector; the override is updated in one place.
- **A fixed child inside a transformed, scrolling pane** → the pin has used this for releases; the e2e check scrolls the notes list and asserts the handle's position.
- **A wide pane plus both pinned panes leaves no room for the page** → while pinned, the width stops at the room the page leaves (220 px minimum); the Outline's card area is exempt because it is meant to shrink. The writer can unpin the left pane for the full 840 px range.
- **Measuring the page to cap the width causes a feedback loop** → the page moves with the pane but does not change width on the manuscript, Darlings, and Notes tabs; on the Outline's board it does, so observer-driven applies are skipped while a drag is live and the board is exempt from the room cap. Outside a drag the observer settles on the same width.
- **Pointer capture under Wayland or a touchscreen** → Pointer Events are used instead of mouse-only events; the drag is also fully available from the keyboard.
- **A 10 px strip at the card margin feels too fine** → the cursor and the focus line make the edge discoverable; the width can grow later without changing the model.
- **Show More Features toggled mid-drag** → the drag ends, the width is committed, and `apply()` resets to 250 px because the writer has chosen Simple NEO.
- **Two windows of NEO open at once** → each keeps its own `localStorage` value and its own pane; last write wins per device, which is acceptable for a view preference.

## Migration Plan

None. A missing or unreadable saved width falls back to 250 px. Removing the feature leaves one unused `localStorage` key.

## Open Questions

None.
