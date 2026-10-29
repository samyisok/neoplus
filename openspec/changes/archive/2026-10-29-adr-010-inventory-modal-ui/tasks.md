# Tasks

- [x] 1.1 Red: `scripts/inventory.e2e.js` — the modal is taller/wider than the old box, `.neo-inv-items` has a usable height with 50 items, new-item fields are absent until **+ New item** is pressed, and the amount field turns `-50 coins`, `+200`, `12x3`, `--5` into `-50`, `+200`, `123`, `-5`.
- [x] 1.2 Green: restructure `renderModal` in `neo-ext/inventory.js` into the flex column (title, quote, search, list, new-item toggle + fields, amount row, actions); add `modal.newItem` and the toggle; filter the amount input to one leading sign and digits.
- [x] 1.3 Green: `neo-ext/neo-ext.css` — wider modal, internal scroll, list flex/min/max, compact new-item grid and amount field; keep the fork's dialog layer and theme tokens.
- [x] 1.4 Green: the two new strings (`New item`, `Hide new item` or equivalent) in `neo-ext/locales/en.json` through `x()`.
- [x] 1.5 Run `npm test`, `npm run test:inventory`, `npm run test:records`, `npm run lint`, `npx oxlint neo-ext/`, `node neo-ext/check-seams.js`, `openspec validate adr-010-inventory-modal-ui --strict`; fix regressions (other e2e fill the modal fields).
- [x] 1.6 Review gate (`code-reviewer`, `security-reviewer`, `ts-cop`) on the diff; fix blockers; record verdicts in `review.md`.
- [x] 1.7 Update the Inventory section of `AGENTS.md` with the modal layout rule; `/opsx-sync` then archive as `2026-10-29-adr-010-inventory-modal-ui`; raise the fork to `1.6.0+fork.10`, add the changelog, commit, and reinstall.
