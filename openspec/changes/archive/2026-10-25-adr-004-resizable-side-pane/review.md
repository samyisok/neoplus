# Planning Review

Scope: `openspec/changes/adr-004-resizable-side-pane/` (proposal, side-pane spec, design, tasks). Run before any code exists, as the fork's flow requires.

## GRASP

- **Ownership.** One capability, `side-pane`, owns one behaviour: the right-hand pane's width, its memory, and the layout that follows it. Nothing it claims belongs to `thesaurus`, `dictionary`, `settings`, or `backup`. No second capability is needed.
- **Information Expert.** The numbers live in a pure module that owns no DOM; the DOM module owns the handle and the saved value; the page offsets stay in CSS, where layout already lives. The design does not compute page geometry in JavaScript.
- **Indirection.** The feature asks `NeoExtApi.moreFeatures()` instead of reading `library`, so an upstream rename breaks one guarded adapter rather than this feature.
- **Protected Variations.** Upstream's six hardcoded offsets are a known point of change. The CSS contract test fails when one moves, instead of letting the page drift.
- **Coupling.** No new seam is introduced. The only upstream file touched is the fork's existing script block, and the feature uses the existing menu subscription.
- **Cohesion.** The DOM module has one reason to change: how the writer sets the pane's width. The Show More Features gate, persistence, pointer input, and keyboard input all serve that one job.

No GRASP blockers for planning.

## DDD

- **Ubiquitous language.** The artifacts use NEO's own words: right-hand pane, book, chapter, library, page, Notes, Outline, Darlings, Show More Features, Simple NEO, interface size. No new vocabulary is invented for core concepts.
- **Boundaries.** The capability does not read another capability's data or write into another's storage. It keeps one device-local view preference outside `book.json` and `library.json`, which is the fork's rule for plugin data.
- **Requirements are observable.** Every requirement describes what the writer sees or what the book does not lose. Class names, functions, `localStorage`, and observers appear only in `design.md` and `tasks.md`.
- **No storage or transport leak.** The spec talks about "remembered on this device" and "not written to the book or library", not about keys, IPC, or files.
- **Aggregate respected.** The resize never edits a chapter, so it cannot violate the manuscript's invariants.

## Findings fixed during this review

1. **Spec contradiction:** the control was said to be available only while the pane is open, yet a scenario focused it while closed. The requirement now says it resizes on every tab that shows the pane and is keyboard-reachable while closed, with keyboard focus opening the pane.
2. **Page geometry was overstated:** "shift by half the pane's width" is false when the left pane is also pinned. The requirement now says the page stays centred in the room the pane leaves, which covers both panes and matches the six core rules.
3. **Interface size broke the 67.5% limit:** the pane is inside `zoom`, so a 840 px width at 300% would exceed the window. `bounds` now takes the interface size and applies `0.675 × viewport / zoom`, with 220 px as a floor; the design and tasks name the `uiZoomStep` refresh.
4. **Simple NEO wording:** "removed or hidden" was ambiguous; the design and tasks now say the handle is hidden and the stored width is kept.
5. **Task order:** the manual check no longer claims the installed `1.6.0+fork.4` build before the release task creates it.

## Second pass

A deeper read against the core layout and input code found two more problems, plus one task-order error. All are fixed in the artifacts.

### Blocker: a drag could close the pane under the pointer

`wireHoverPane` closes an unpinned pane on `mouseleave`. Dragging the edge to the left leaves the pane almost immediately, so the pane would slide away mid-gesture with the pointer still captured. The requirement now says the pane stays open while a drag lasts; design D2 registers a later `mouseleave` handler that restores `.open` for the duration and closes the pane on release when the pointer is outside it, matching today's hover behaviour afterwards.

### Blocker: a 67.5% pane can cover the page when both panes are pinned

`#paper-scroll` keeps its width; the six offset rules only move it. At 1280 px, a 248 px left pane, a 760 px page, and a 840 px right pane leave 472 px for a 760 px page, putting 288 px of the page under the pane. The requirement and design now cap a pinned pane at the room the page leaves (`innerWidth − pinned nav − #paper-scroll`), measured from the DOM and re-applied through a `ResizeObserver`; the 220 px minimum still wins when the window cannot hold both, which is the overlap the fixed 250 px pane already has. The Outline's board is exempt because its card area is meant to shrink.

### Major: the save/focus claim was too broad

Tabbing to the control blurs the editor and can flush pending words; that is NEO's normal focus behaviour, not a resize writing. The requirement now separates a pointer resize (focus must stay in the editor) from a keyboard resize (text, caret, selection, save state, and undo unchanged; only focus moves). The "no files written" scenario waits past the save delay on an already-saved book instead of closing it.

### Task order

The release group bumped the version before archiving, which `check:version` rejects because the fork count comes from archived ADRs. Archive, then bump, then changelog/commit/reinstall.

## Independent implementation review

A second reviewer traced every claim to the core code. Three blockers and five majors were real; all are now in the artifacts.

### Blockers

1. **Drag distance ignored interface size.** `pointermove.clientX` is in unzoomed window pixels, while the width is a CSS length inside `zoom`. At 125%, a 120 px drag would have widened by 150 layout px. `fromDrag` now divides the delta by the interface size, with a pure test and an e2e check at 125%.
2. **The Darlings tab was exempt from the page cap.** The pane is held open there without being pinned, so `room` read `Infinity` while the page had already moved. `room` is now applied when the pane is pinned *or* the Darlings tab holds it, with an e2e case.
3. **A drag could snap back on the Outline board.** There the pane's width changes `#paper-scroll`'s width, so the `ResizeObserver` fires every frame; an apply from the stored value would reset the pane mid-drag. Observer and resize applies are now skipped while `body.neo-ext-resizing` is set, and the live width is re-clamped instead.

### Majors

- **Leaving the window** fires `closeUnpinnedPanes` on the document and on blur, not just the pane's `mouseleave`. The module now re-asserts `.open` on every live `pointermove` and on the document's `mouseleave`, and re-shows the pane on focus before release.
- **Boot's menu handler ignores non-`neo-ext` messages.** The module registers its own `window.neo.onMenu` subscription and reads `{ type: 'moreFeatures', checked }` and `{ type: 'uiZoomStep', value }`.
- **`uiZoomStep` arrives before the zoom is written** (app.js awaits `writeLibrary` first). The cap now follows `documentElement`'s `style`/`class` with a `MutationObserver` rather than the message.
- **A nudge at a clamped width erased the remembered width.** The spec now says a deliberate resize while clamped becomes the new choice; narrowing or widening the window alone never does.
- **The e2e could not drive a drag.** It now dispatches real `PointerEvent`s, pins the pane before dragging, and dispatches `mouseleave` mid-drag; the cursor check stays manual.

### Minors

- `aria-orientation="vertical"` is named, and the handle is the pane's first child so it is the first keyboard stop.
- The accessible name uses the fork's key-equals-English helper; boot must export it or the module keeps the same local pattern.
- The CSS contract also asserts the board-on override leaves the core's `left: 248px` intact.
- Task 2.1 names the Electron binary prerequisite; task 6.3 merges the feature branch into `fork` before reinstalling.

### Re-check after the fixes

The same reviewer verified 1–13 and found four follow-ups, now fixed:

- **A fully absorbed key step no longer commits.** A commit happens only when the new value differs from the visible width; Left Arrow at a clamp moves nothing and leaves 840 px remembered. Home, End, and a drag that moves the edge still replace a clamped choice. Spec scenario "A step the clamp absorbs" pins it.
- **The unpinned-overlay rule contradicted the Darlings rule.** The overlay bullet now applies only to a tab that does not hold the pane open and is not pinned, so the Darlings page move and its room cap stand.
- **The keep-open e2e could pass vacuously.** Task 2.2 now dispatches `mouseleave` on the pane and `documentElement` and a window `blur` during the drag, then asserts `.open`, and `pointerup` asserts the close.
- **The room-cap e2e named no numbers.** Task 3.3 now fixes the window at 1280×800, measures `#paper-scroll`, and asserts the pane stops at `1280 − 248 − paper width` (about 272 px) with the page's right edge clear.

The risk note about the `ResizeObserver` was corrected: the board does change `#paper-scroll`'s width, which is why observer applies are skipped during a drag.

## Implementation note

The handle could not use the pin's `position: fixed` trick: inside a transformed, scrolling pane a fixed child still moves with the list (the e2e measured a 400 px shift). It is a zero-height `position: sticky` element instead, with pseudo-elements for the hit area and the line. Design D2 and the CSS contract test were updated before the task was marked done.

The e2e window could not exceed the 1123 px screen here, so the both-pinned case asserts the 220 px minimum and the centring formula rather than the 1280 px room number; the room cap itself is asserted on the pinned, Darlings, and pure-rule cases.

## Verdict

No blockers remain in the plan. The change is still one capability, one device-local preference, no new seam, and no storage in the book. Proceed to `/opsx-apply` when the writer is ready.

## Implemented-diff review

### GRASP

- The pure rules own the numbers; `side-resize.js` owns the DOM, observers, and one saved value; CSS owns the page geometry. No responsibility is split between two files.
- No seam was added. The only upstream file touched is `index.html`'s existing fork block; `#side-pane` is extended with a child, not rewritten.
- `NeoExtApi.moreFeatures()` is the guarded adapter for Simple NEO, and `NeoExt.x` is reused instead of a fourth copy of the string helper.
- The stateful pieces (stored width, drag, observers) are one feature's concern, and the module has no second job.
- No GRASP blocker.

### DDD

- Vocabulary matches the code: right-hand pane, notes, Darlings, Outline, board, page, Show More Features, interface size.
- The capability touches no book or library aggregate; its one preference is device-local.
- `room` is now measured by a pure `roomWidth` so the layout arithmetic is testable beside the bounds, and the DOM half only supplies numbers.
- No domain or storage leak; no DDD blocker.

### ts-cop (plain JavaScript)

- `npx oxlint neo-ext/` clean. No TypeScript in the change, so no `tsc` pass applies.
- Findings fixed: the CSS contract could pass on the pre-zoom core duplicate (now asserts the exact zoomed rules), the focus-ring assertion scanned past its rule (now a single-rule regex), and `onUp` dereferenced `#editor-view` unguarded (now `heldOpen()`).
- `roomWidth` moved into the pure module with unit tests (1123/0/760 → 363; 1123/248/760 → 115; 1280/248/760 → 272; below zero → 0).
- No blocker.

### code-reviewer

- No blockers. Majors fixed: focus cue is a 2 px line with no degenerate outline; the both-pinned e2e expectation is computed from the real nav, page, and zoom; the commit rules now have e2e coverage at a clamp; the pseudo height accounts for padding and zoom; key steps follow the interface size; `setWidth` no longer re-fires the root observer; the release point decides whether an unpinned pane closes; the CSS contract pins the core values; boot exports `x` and the module loads after it.
- Remaining majors fixed after the re-check: a real `Tab` reaches a closed pane and opens it (e2e, plus a core-selector contract assertion), and a real double-click (two `sendInputEvent` click pairs) resets the width.
- Accepted advisory: no second-device e2e; the preference is a single `localStorage` key and the pure `read`/`remember` tests cover it.

### security-reviewer

Not run: the diff adds no IPC, preload method, filesystem path, secret, network call, or dependency. Its only storage is the existing device `localStorage`, holding one integer width.


## Final verification

- `npm test`: 425 pass.
- `npm run test:sidepane`: 20 pass on a real launch.
- `node neo-ext/check-seams.js`, `npm run check:version` (1.6.0+fork.4), `openspec validate --all`, and `npx oxlint neo-ext/` pass. Repo-wide lint still reports only the pre-existing upstream findings in `app.js`.
- A visual capture of a pinned, hovered pane showed the 250 px pane, the accent edge, and the page shifted clear.
- The installed `1.6.0+fork.4` packaged app answered with the separator, dragged 250 → 310, and persisted the value.
- This checkout has no `fork` branch; the work is on `main`, like ADR-001–003.

## Post-release fix — the pane's top edge

The first installed build left the pane's first 36 px (its top padding) outside the handle: the sticky element starts at the content edge, so the visible line was draggable only from below the header padding even though it looked like one border. The pseudo-elements now start 36 px above the grip and run to the pane's bottom, so the whole left edge is the same target, and the e2e checks `elementFromPoint` at the pane's top edge. Rebuilt and reinstalled.

## Wider maximum — 2026-10-25

At the writer's request the ceiling moved from `min(560 px, 45%)` to `min(840 px, 67.5%)`: on a 1123 px window the pane now reaches 758 px instead of 505 px (50% wider), and on a 1920 px window it reaches the 840 px cap. The 220 px minimum, the page-room cap while pinned, and the stored-value clamps moved with it. Pure tests, e2e limits, the delta spec, the archived artifacts, and the live main spec were updated; the installed build was rebuilt.
