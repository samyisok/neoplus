# Review — adr-015-interface-size-setting

Planning review of the change's artifacts only (no code), per the fork's
"Planning review: right after propose" step.

## GRASP Verification — 2026-10-31

**Findings:** 0 blockers, 1 artifact fix.

### Checked

- **Ownership:** one capability (`interface-size`) owns the setting. The
  `settings` capability owns the window, the group registry, and group
  visibility; the new group is an extension of it, not a second policy. The
  `side-pane` capability owns the pane's width; this change only scales it, as
  the existing View menu already does.
- **Information Expert:** the range, snapping, and stepping stay in core's
  `snapZoom`/`nextZoomStep`; the adapter exposes them; the fork module owns only
  percent text, the group, the preview, and the Simple NEO policy.
- **Low cohesion:** the group, its preview, and the Simple NEO policy are one
  concern (how large the interface reads), in one new module; the settings
  registry gains a generic `zoom` control type and a close hook, not zoom policy.
- **Protected variations:** the core seam is one line in `applyFonts`; the policy
  lives behind `NeoExt.uiZoom` so an upstream rewrite breaks one line.
- **No duplicate behavior:** the `settings` spec's device-scoped requirement is
  about machine-local resources in `settings.json` (backup folder, model), while
  the interface size follows the existing `DEVICE_LOOK` view settings; the new
  spec states that mechanism, it does not restate the other.

### Artifact fix applied

- The spec and proposal spoke of "the fork's toasts" and a "fork dialog" — writer
  vocabulary, not product vocabulary. They now say **NEO's toasts** and name the
  dialogs. No behavior changed.

## DDD Verification — 2026-10-31

**Findings:** 0 blockers, 0 fixes after the vocabulary pass.

### Checked

- **Ubiquitous language:** *interface size*, *page*, *text zoom*, *Show More
  Features*, *Settings*, *Save/Cancel* — the words the UI already uses. No class,
  file, IPC, or field name appears in a requirement.
- **Aggregates:** the setting belongs to the device's view state and is already
  part of the library's look. The spec does not reach into the settings file, the
  manuscript, or the pane's width.
- **Boundaries:** the page's zoom, the editor's type size, and the pane's width
  stay owned by their existing requirements; this change only multiplies the
  interface, and the design explicitly fences the page off.
- **Storage:** no new file, no new field — `library.uiZoom` and the device copy
  already exist.
- **Simple NEO:** the spec states the choice plainly (present and working), which
  is a deliberate product decision recorded in `design.md` D4 with its
  alternative.

## Verdict

No blocker remains. The artifacts are ready for implementation.

## Artifact review — pass 2 (requested)

Re-read the four artifacts against the code they touch. Eight issues, all fixed
in the artifacts.

- **Cancel would undo a menu step** — `specs/interface-size` R3 and `design.md` D3 said Cancel restores the size "in use when the window opened". If the writer stepped the size from View → Interface Size while Settings was open, Cancel would silently roll that back. Cancel now restores the value stored at that moment, and task 1.1 tests `onClose(false)` against `api.uiZoom()` rather than an opening snapshot.
- **R5 contradicted itself** — "the interface SHALL NOT be left at a size no device will remember" sat beside "the choice SHALL stay visible in the window". Reworded: the choice previews while the window is open, is not treated as saved, and the stored size returns once the window closes.
- **R4 vs the menu's gating** — "two doors" implied the View item was reachable in Simple NEO, where it is stripped. R1 now says the menu item keeps its place behind Show More Features and Settings is the Simple NEO door.
- **Task 3.4 was vague** — "extend `scripts/simple-neo.test.js` or the new unit test" is not actionable. It now names the `applyFonts` slice and its two outcomes (fork value with `moreOn()` false; legacy `1` with `NeoExt` absent).
- **Task 4.1 risked a false test** — it grouped `#paper-scroll` with the page selectors, but `#paper-scroll`'s offsets intentionally multiply by `--ui-zoom`. The test now asserts no `zoom` on `#paper-scroll` and that the `--page-zoom`/`--editor-size` rules are unchanged.
- **A save with no change wrote the library** — D3 now answers `{ ok: true }` without a write when the snapped value already matches.
- **Pocket was unstated** — added to the proposal and design non-goals: Pocket does not load the fork's interface layer.
- **The toast e2e step was unspecified** — task 5.1 now raises it with `NeoExt.toast('test')`.

## Verdict (pass 2)

No blocker remains. The artifacts are ready for implementation.

## Implementation review — 2026-10-31

`code-reviewer` and `security-reviewer` ran on the implemented diff. No blocker.
Four should-fix items and one security should-fix were found; all are fixed.

- **Failed save still became the device's size** — `writeLibrary` remembers the device copy before its IPC, so restoring only `library.uiZoom` left the failed value in `localStorage`, where the next library read revived it. `api.setUiZoom` now re-syncs the device copy (`rememberDeviceLook`) when it puts the value back. Tested in `scripts/api.test.js`.
- **Cancel could interrupt a save in flight** — Escape, Cancel, or a backdrop click during the write could close the window and then let the write apply afterwards. `neo-ext/settings.js` now has a `saving` guard: those three paths return while a save is pending, the Save button is disabled, and the flag clears in `finally`. Covered in `scripts/interface-size.e2e.js` with a delayed adapter.
- **At 300% the Settings window could grow off-screen** — the fork's `.neo-ext-settings` width/height overrode core's zoom-aware cap. Its width, height, and the Thesaurus and Dictionary windows' sizes now divide by `--ui-zoom`, matching the Inventory and Rephrase windows.
- **Missing tests** — added Escape, backdrop, failed save (stubbed adapter), and a Simple NEO **launch** case (library on disk with `moreFeatures: false`), which exposed a real boot-order bug: the library can resolve before `boot.js`, so core's first `applyLook` ran without the fork and Simple NEO stayed at 100%. `boot.js` now re-applies `applyFonts` once after `NeoExt` exists.
- **Unclamped fallback (security)** — `boot.js`'s fallback passed a stored value straight to CSS when the fork module was missing. It now clamps to 0.9–3 in tenths.
- **Raw write error (security)** — the group maps any failure to one sentence, so no path or EACCES text reaches the window.

Accepted, not changed: the one-time `usesMoreFeatures` migration still counts a non-100% size as a sign of full NEO (upstream, out of scope; recorded in `design.md`), and the shared settings save still writes groups in order, so a later group's failure can leave the interface size already stored. The local `x` fallback in `interface-size.js` stays, matching the other fork modules.

Verification after the fixes: `npm test` 647; `test:interface-size` 10; `test:rephrase` 15; `test:history` 8; `test:simple` 14; `test:sidepane` 20; `test:inventory` 30; `test:tabs` 9; changed files lint clean; `check-seams` passes.

## Follow-up review (final diff) — 2026-10-31

`code-reviewer` and `security-reviewer` on the final working tree. No blocker.
Every finding is addressed below: the behavioral ones are fixed, one claim was
rejected as inaccurate, and one advisory is accepted with its reason.

- **Save could undo a View-menu step** — if the writer stepped the size from the menu while Settings was open and pressed Save without touching the control, the dialog wrote the size it opened with. `interface-size.load` now records `__uiZoomStart`, and `save` writes the stored value when the control is untouched, the pressed value when it is not.
- **Zoom buttons stayed live during a save** — a press mid-write previewed a value the save would not keep. The registry disables the step buttons for the duration and restores their previous bound states afterwards.
- **A failed write could clobber a concurrent menu step** — `restore()` now puts the old value back only while `library.uiZoom` is still the value it set; a newer choice wins. Covered in `scripts/api.test.js`.
- **The boot fallback did not snap `null`/`''`** — it now delegates to core's `snapZoom` when available and guards a non-finite module answer. This also removed the fallback's own copy of the range rule.
- **A throwing group could leave an uncloseable window** — the backdrop, Cancel, and Escape listeners are attached right after the window enters the DOM, and one group's render failure is caught instead of aborting the rest.
- **Registration order made the new group the first saved** — `register()` now waits for `DOMContentLoaded`, so Backup keeps its place and is saved first; `window.NeoInterfaceSize` is still assigned synchronously for `boot.js`.
- **Tests** — the Simple NEO launch is now asserted before a book is opened (the case the boot re-apply exists for), the page is checked by its rendered width as well as its CSS variables, and the menu-step Save and concurrent-restore cases are covered.

Rejected: the claim that the failed-save unit test rebinds a different object — it mutates `h.context.NeoExtApi.setUiZoom`, the same object the module captured, and the failure branch is what produces the asserted sentence.

Accepted: `interface-size.js` keeps its own small snap fallback, like the other fork modules; it is used only if the adapter is absent.

Verification: `npm test` 648; `test:interface-size` 10; `test:rephrase` 15; `test:history` 8; `test:simple` 14; changed files lint clean; `check-seams` passes; `openspec validate --all` 10/10.

## GRASP Verification — 2026-10-31 (final diff)

**Scope:** `git diff HEAD` + `neo-ext/interface-size.js` and the three test scripts
**Files changed:** 19 · **Findings:** 2 fixed, 2 advisories accepted

### Problems (fixed)

- [x] `neo-ext/interface-size.js:20-35` — Information Expert: the module carried its own snap/step fallbacks, a second copy of a rule core and the adapter already own. Removed; it now calls `api.snapUiZoom` / `api.stepUiZoom` directly and guards those at load.
- [x] `neo-ext/interface-size.js:96` — Protected Variations: `window.NeoInterfaceSize` exported `percent`, `step`, `preview`, `load`, `save`, `onClose` only for tests. Reduced to `{ uiZoomFor }` (the seam's one need); tests read the registered group.

### Recommendations (accepted)

- `neo-ext/settings.js`'s control factory is an if-chain over `type`, and the `zoom` branch follows it. A control registry would be a worthwhile refactor, but it touches every existing control type; keep it for a separate change.
- `neo-ext/settings.js` is 499 lines. The god-class threshold is already crossed; this change adds ~45 lines for the control and the save guard. Extracting the control factory is a separate, testable refactor.

## DDD Verification — 2026-10-31 (final diff)

**Scope:** same · **Files changed:** 19 · **Findings:** 0 blockers, 1 advisory

### Checked

- **Ubiquitous language:** interface size, page, text zoom, Show More Features — the UI's own words. No class, file, IPC, or field name in a requirement.
- **Aggregates:** the size is part of the library's look; the view never reaches into `library.json` or the settings file.
- **Layers:** `interface-size.js` is presentation (DOM, group, preview); snapping/stepping live in the adapter and core; persistence is core's `writeLibrary`.
- **No domain logic in the view** after the duplicate rule was removed.
- **No cross-aggregate calls:** no book, chapter, inventory, or records access.
- **God class:** `neo-ext/settings.js` (advisory above) — pre-existing size, not introduced here.

## ts-cop — 2026-10-31 (final diff)

**Findings:** no blockers; two should-fix, both fixed; six advisories, four fixed.

- Fixed: the Save "untouched" test now uses an explicit `__touched_uiZoom` flag set by the control, so a press can never be mistaken for an untouched control; the duplicated range rule is gone; `boot.js` no longer re-clamps an already-snapped value; a save failure now reports through `window.neo.logError`; the `applyFonts` test slice ends at the function's own close brace instead of a nearby comment.
- Fixed (surface): `window.NeoInterfaceSize` exports only `uiZoomFor`.
- Rejected: the claim that registration order already puts Backup first. `boot.js` (which registers Backup) loads **after** `interface-size.js`, so synchronous registration would place Interface Size on top; the `DOMContentLoaded` deferral is what keeps Backup first. The "silent vanish" case cannot occur because `settings.js` loads earlier and `DOMContentLoaded` always fires.
- Accepted: `preview` mirrors the three things `applyFonts` publishes (calling `applyFonts` itself would republish the whole look and needs the live library mutated before Save); the group tests use a fake adapter while `scripts/api.test.js` guards the real rule; `written === false` is kept as defence for a future handler that reports a failed write without rejecting.

Verification after these fixes: `npm test` 648; `test:interface-size` 10; `test:rephrase` 15; `test:history` 8; `test:simple` 14; changed files lint clean; `check-seams` passes; `openspec validate --all` 10/10.

## Reported defect: dialog windows did not grow — 2026-10-31

**Cause:** keeping the fork dialogs on screen at 300% divided their fixed widths and heights by `--ui-zoom`, which froze the *physical* box at 560/600/34rem while only the text inside grew. Core's dialogs did grow, because their width is not divided.

**Fix:** the fixed size stays un-divided (so it grows with the interface), and only the viewport terms divide by the zoom (`calc(100vw / var(--ui-zoom) - …)`, `calc(78vh / var(--ui-zoom))`). Applied to Settings, Thesaurus, Dictionary, Inventory, Rephrase, and the fork toast. At 120% the Settings window is 672 px wide instead of 560, and it still fits the window.

**Regression test:** `scripts/interface-size.e2e.js` now measures the Settings card's rendered width before and after two Larger presses (must grow by more than 50 px) and asserts it stays inside the window.
