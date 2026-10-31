# Tasks

## 1. The setting's rules, red first

- [x] 1.1 Write `scripts/interface-size.test.js` against `neo-ext/interface-size.js` with a fake `NeoExtApi`: `percent(1)` reads `100%` and `percent(1.25)` reads `130%` (snapped); `step` moves a tenth and stops at 90% and 300%; a step of 0 resets to 100%; `load` returns the snapped stored size; `onClose(values, false)` previews the size `api.uiZoom()` reports at that moment (not a stale opening value) and `onClose(values, true)` leaves it; `save` calls `setUiZoom` and passes a failure through. Confirm it fails on the missing module.
- [x] 1.2 Write `neo-ext/interface-size.js` to green: percent text, step, `uiZoomFor(library)`, the group (`id`, `title`, `tab: 'General'`, `controls`, `load`, `save`, `onClose`), and `preview(z)` which sets `--ui-zoom`, toggles `ui-zoomed`, and reports the menu label.
- [x] 1.3 Re-run; add any missing bound case.

## 2. The Settings control

- [x] 2.1 Add the `zoom` control type to `neo-ext/settings.js`: label, **Smaller**, the percentage in an `output`, **Larger**, **Reset**; a click steps through the group's `step` and calls its `preview`; the output updates on every change. Add the optional `group.onClose(values, saved)` hook, called by `close(saved)` — Cancel, Escape, and backdrop pass `false`, Save passes `true`.
- [x] 2.2 Register the group from `neo-ext/interface-size.js` after the settings window exists, and load the script after `neo-ext/settings.js` in `index.html`. Extend `neo-ext/check-seams.js` with the script and run it.

## 3. The adapter and the Simple NEO seam

- [x] 3.1 Extend `scripts/api.test.js`: `uiZoom()` snaps and defaults to 1; `snapUiZoom` clamps 0.5 to 0.9 and 9 to 3; `stepUiZoom` resets on 0; `setUiZoom` writes through `writeLibrary`, applies fonts, and returns `{ ok: false }` when the write rejects. Confirm the failures before the code.
- [x] 3.2 Add `uiZoom`, `snapUiZoom`, `stepUiZoom`, and `setUiZoom` to `neo-ext/api.js`, guarded reads and a guarded write through `writeLibrary` + `applyFonts`.
- [x] 3.3 Add the one-line seam in `app.js`'s `applyFonts` (marked `NEO-EXT seam`) and the delegate in `neo-ext/boot.js`; add the seam string to `neo-ext/check-seams.js` and the seam table in `AGENTS.md`, then run `node neo-ext/check-seams.js`.
- [x] 3.4 Extend the `applyFonts` slice in `scripts/simple-neo.test.js`: with `NeoExt.uiZoom` present and `moreOn()` false, the resolved size is the fork's stored size; with `NeoExt` absent, the legacy rule still forces 1. Confirm the test fails before the seam exists.

## 4. Every surface, including the toast

- [x] 4.1 Write `scripts/interface-size-css.test.js`: `.neo-ext-toast` is zoomed with `--ui-zoom` and caps its width; `#paper-scroll` gets no `zoom`; and the `--page-zoom` / `--editor-size` rules are unchanged. Confirm it fails first.
- [x] 4.2 Add the toast rules to `neo-ext/neo-ext.css`; check the page rules are untouched.

## 5. End to end and the record

- [x] 5.1 Write `scripts/interface-size.e2e.js` and add `test:interface-size`: with a throwaway library, open Settings → General, see 100%, press Larger twice, watch `--ui-zoom` become 1.2 and the dialog's own computed zoom follow; Cancel restores 1 and stores nothing; repeat and Save; reload and reopen to find 120%; the manuscript page's zoom and type size are unchanged; with Show More Features off, the control is still there and enlarging works; a toast raised with `NeoExt.toast('test')` computes a zoom above 1.
- [x] 5.2 Run `npm test`, the focused new tests, `npm run test:interface-size`, `npm run test:history`, `npm run test:inventory`, `npm run test:rephrase`, `npm run test:simple`, `node neo-ext/check-seams.js`, and `openspec validate adr-015-interface-size-setting --strict`.
- [x] 5.3 Run the review gate on the diff — `grasp-verify`, `ddd-verify`, `ts-cop`, the `code-reviewer` and `security-reviewer` agents — and record the verdicts in `review.md`.
- [x] 5.4 Add the Interface Size note and the new seam (row 12) to `AGENTS.md`; add the changelog entry keyed by the archive name.
- [x] 5.5 `/opsx-sync`, archive as `2026-10-31-adr-015-interface-size-setting`, raise the fork version, run `npm run check:version`, and `~/.local/bin/neo-reinstall`; then check by hand that the control enlarges the shelf, the right pane, a dialog, and a toast, that Cancel takes it back, and that Save survives a restart.

## 6. Review verdicts

- `code-reviewer`: no blocker; four should-fix, all fixed — the device copy is restored after a failed write; a save in flight cannot be cancelled; the Settings/Thesaurus/Dictionary windows stay on screen at 300%; and the missing Escape, backdrop, failed-save, and Simple-NEO-launch tests were added. The launch test caught the boot-order bug now handled by `boot.js`'s re-apply.
- `security-reviewer`: no blocker; the unclamped `boot.js` fallback is clamped to 0.9–3, and a raw write error never reaches the window. Accepted: the settings save writes groups in order, so a later group's failure can leave the size stored.
- `grasp-verify` / `ddd-verify`: the group, the adapter, and the seam keep one responsibility each; the value stays core's `library.uiZoom`; no storage, IPC, or field name enters the spec. No finding.
