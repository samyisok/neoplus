# Tasks

## 1. Rules, red first

- [x] 1.1 Extend `scripts/api.test.js`: `uiText()` snaps and defaults to 1; `snapUiText` clamps 0.5→0.9 and 9→2; `stepUiText` moves a tenth and resets on 0; `setUiText` writes through `writeLibrary`, skips an unchanged value, restores memory and the device copy on failure, and returns `{ ok: false }`. Confirm the failures before the code.
- [x] 1.2 Extend `scripts/interface-size.test.js`: the second control formats 100%/130%, steps a tenth within 90–200%, previews `--ui-text`, load returns the snapped stored size, Save writes it, and Cancel restores both previews. Confirm it fails first.

## 2. The adapter and the device list

- [x] 2.1 Add `uiText`, `snapUiText`, `stepUiText`, `setUiText` to `neo-ext/api.js`, mirroring the interface-size functions and restoring `rememberDeviceLook` on failure. Re-run 1.1 to green.
- [x] 2.2 Add `'uiText'` to `DEVICE_LOOK` in `app.js` with a `NEO-EXT seam` marker; add the string to `neo-ext/check-seams.js` and the seam table in `AGENTS.md`.

## 3. The publishing seam

- [x] 3.1 Add the marked line in `applyFonts` (`if (window.NeoExt && NeoExt.uiText) NeoExt.uiText(library);`), export `uiText` from `neo-ext/boot.js` (delegating to `NeoInterfaceSize`), and assert the seam in `check-seams.js`. Run `node neo-ext/check-seams.js`.
- [x] 3.2 Implement `applyText(library)` and `previewText(z)` in `neo-ext/interface-size.js`, using `api.snapUiText`/`setUiText`. Re-run 1.2 to green.

## 4. The Settings row

- [x] 4.1 Add the second `zoom` control (`key: 'uiText'`, label **Interface text**, format, step, preview) to the group's `controls()`; have `save` write both while respecting each row's touched flag, and `onClose` restore both previews.
- [x] 4.2 Add a hint under the row: text grows in the side pane, dialogs, and messages; the shelf and menus follow Interface Size. Add the new strings to `neo-ext/locales/en.json`.

## 5. The text multiplier

- [x] 5.1 Write `scripts/interface-size-css.test.js` additions: every numeric `font-size` in `neo-ext/neo-ext.css` carries `var(--ui-text`; `styles.css` is unchanged; the page variables are still untouched. Confirm it fails first.
- [x] 5.2 Convert every numeric `font-size` in `neo-ext/neo-ext.css` to `calc(<size> * var(--ui-text, 1))`; check the zoom-control and dialog rules by hand. Re-run to green.

## 6. End to end

- [x] 6.1 Extend `scripts/interface-size.e2e.js`: Settings shows both rows at 100%; raise Interface text to 140% — a History entry's computed font size grows and the pane width and a button's box stay; a dialog's title font grows while the dialog width stays; Cancel restores; Save survives a reload; Simple NEO works; Interface Size and Interface text compose; the page's font size and zoom stay.
- [x] 6.2 Run `npm test`, `npm run test:interface-size`, `npm run test:history`, `npm run test:rephrase`, `npm run test:simple`, `node neo-ext/check-seams.js`, `openspec validate adr-016-ui-text-size --strict`, and lint the changed files.
- [x] 6.3 Review gate: `grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, `security-reviewer`; record the verdicts in `review.md`.
- [x] 6.4 Add the Interface text note to `AGENTS.md`; add the changelog entry keyed by the archive name.
- [x] 6.5 `/opsx-sync`, archive as `2026-10-31-adr-016-ui-text-size`, raise the fork version to `1.6.0+fork.16`, run `npm run check:version`, and `~/.local/bin/neo-reinstall`; then check by hand that the pane and a dialog read larger with their boxes unchanged.
