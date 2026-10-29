# Tasks

- [x] 1.1 Red: `scripts/inventory.e2e.js` — with a known amount `7`, entering `1,5` and `5-3` keeps `7` and shows the whole-numbers message; a valid `-50` stores −50.
- [x] 1.2 Red: `scripts/inventory.e2e.js` — collapsing new-item fields leaves focus on the toggle; a failed Save focuses the named field; Tab from the last control wraps inside the card; a picked row survives a search that excludes it.
- [x] 1.3 Red: `scripts/inventory.e2e.js` — with `body.light`, the dialog's computed text/background pair has contrast and its `zoom` follows `--ui-zoom`; the list's computed minimum height is at least 9 rem.
- [x] 1.4 Green: `neo-ext/lib/inventory-ledger.js` gains `parseAmountInput`; the modal uses it and the old `cleanAmountInput` goes.
- [x] 1.5 Green: `neo-ext/inventory.js` — `modal` class on the card, one state object (`error`, `focusSelector`, `scrollTop`), projection in `renderModal`, `failModal` capturing focus/scroll, pick/search/name/category clearing through one `clearError`, picked row kept in `fillItems`.
- [x] 1.6 Green: `neo-ext/neo-ext.css` — core `.modal` surface with only size/padding/layout overrides, token-based fields, `min-height: 9rem` list, thin backdrop rule, focus rings on picks/actions, narrow-window stack, remove dead rules.
- [x] 1.7 Green: placeholder through `x()` + locale key; remove the unused old modal string.
- [x] 1.8 Gates: `npm test`, `npm run test:inventory`, `npm run test:records`, `npm run test:tags`, `npm run test:notes`, `npm run lint`, `npx oxlint neo-ext/`, `node neo-ext/check-seams.js`, `openspec validate adr-011-inventory-modal-focus --strict`; record results.
- [x] 1.9 Review gate (`code-reviewer`, `security-reviewer`, `ts-cop`), fix blockers, record in `review.md`; update the Inventory bullet in `AGENTS.md`.
- [x] 1.10 `/opsx-sync` then archive as `2026-10-29-adr-011-inventory-modal-focus`; raise the fork to `1.6.0+fork.11`, add the changelog, commit, and reinstall.
