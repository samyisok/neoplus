# Review — adr-011-inventory-modal-focus

## Review gate

`code-reviewer` and `ts-cop` reviewed the modal fixes. Findings and resolutions:

- **Dialog surface/theme/zoom.** Card now carries `.modal.neo-inv-modal`, so core surface, text colour, `--ui-zoom`, and `body.light` apply. Width, card height, and list height divide by `--ui-zoom`; a `body.light { --rule }` token makes borders visible on the light card; item names and amounts inherit text colour instead of `var(--ink)` (which is dark in the default theme); core `.modal p/label` specificity is beaten only by scoped `.neo-inv-modal` selectors, so the amount row stays one flex row and error/empty text keeps its size; the sticky header has a real background.
- **One modal state.** `focusSelector` and `scrollTop` are captured before every re-render; `failModal` and the toggle set them; `renderModal` restores both and focuses a control inside the card, so the Tab trap always applies. Error text is projected from `modal.error` through one `showError`/`clearError` pair; pick, search, name, category, and toggle clear it. When no element was focused on open, close falls back to the Inventory tab.
- **Picked row.** A picked item is prepended when the search excludes it; opening the new-item fields or typing a name clears the pick, so Save matches what is shown.
- **Amount.** `inventory-ledger.parseAmountInput` owns the field contract (one leading sign, digits; separator/second sign/mid-string sign refused; letters dropped). The field keeps its last value and caret, and says "whole numbers" for a separator or "one sign, at the start" for a sign. `parseAmount` keeps reading stored decimals. A successful flush now clears a previous save error.
- **View.** Media query uses the zoom-aware selector; a pending modal closes when Show More Features turns off.
- **Tests.** `try/finally` now restores the window size, the light theme, and the unreadable-chapter stub; assertions set a known starting amount instead of riding the previous one; light-theme contrast, zoom, list minimum height, focus after collapse/failed Save, Tab wrapping, and picked-row visibility are covered.

### Accepted advisories

- The amount placeholder (`+200 or -50`) stays behind `x()` with a locale key rather than inlined; a translation can adjust the example.
- `setStatus('')` also resets `statusKind`, so one assignment is redundant; harmless.
- Caret position after a refusal is restored but not asserted in the e2e; a follow-up can pin `selectionStart`.

## Verification

- `npm test` — 539 pass.
- `npm run test:inventory` — 30 pass.
- `npm run test:records` — 14 pass; `test:tags` 12; `test:notes` 14; `test:dictionary` 13.
- `npm run lint` — clean in touched files; `npx oxlint neo-ext/` clean.
- `node neo-ext/check-seams.js` — all seams in place.
- `openspec validate adr-011-inventory-modal-focus --strict` — valid.
- Visual: modal adopts the core surface; amount row inline; list 539 px with 24 items; `--rule` present under `body.light`.
