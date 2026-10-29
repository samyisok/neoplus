# Review — adr-010-inventory-modal-ui

## Review gate

`code-reviewer` and `ts-cop` reviewed the modal work. Findings fixed:

- **Modal could still clip** (no `overflow-y`, list `min-height` unshrinkable): the card scrolls, the list shrinks with `min-height: 0`, and a short-window media query keeps Save/Cancel on screen. e2e opens at 700×460 and asserts the card fits and Save is visible.
- **`1,5` became `15`**: the separator is now refused — the field keeps its last whole value and says **Use whole numbers only.** — so nothing is multiplied silently. The e2e enters `1,5` after `-5` and asserts `-5` stays.
- **Picking an item reset the list scroll and stole focus**: picks toggle in place, the clicked row keeps focus, and the list scroll position survives.
- **Search re-render dropped the caret**: typing filters the list node only; the search input is never rebuilt.
- **Save with no pick and hidden new-item fields** now reveals them and focuses Name; errors focus the field that needs attention and carry `role="alert"`.
- **ARIA/order**: dialog labelled by its heading, inputs named, Tab wraps inside the card, Cancel then Save.
- **Quote line** clamps to two lines instead of truncating to one; the toggle has a focus ring.

### Accepted advisories

- The modal width test uses a viewport-relative bound rather than a fixed 500 px, so it survives the interface-size setting.
- `parseAmount` still reads legacy decimal values from stored ledgers; only the field refuses them.

### Verdicts

- `code-reviewer` re-review: all prior blockers resolved; the residual notes (focus after a failed Save, error announcement, keystroke-level separator) were implemented and covered.
- `ts-cop`: no new lint errors, no dead CSS left from the old modal.

## Verification

- `npm test` — 538 pass.
- `npm run test:inventory` — 26 pass (layout, short window, reveal reset, amount keystrokes, stored value, search, pick).
- `npm run test:records` — 14 pass; `test:tags` 12; `test:notes` 14.
- `npm run lint` — clean in touched files; `npx oxlint neo-ext/` clean.
- `node neo-ext/check-seams.js` — all seams in place.
- `openspec validate adr-010-inventory-modal-ui --strict` — valid.
- Visual check at 1200×800: modal 544×743, list 539 px with 24 items, new-item fields closed.
