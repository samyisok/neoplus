# Review — adr-013-rephrase-hardening

## What was fixed

From the ADR-012 reviews: the timeout now spans the response body; Rephrase refuses to stack over another dialog; **Try again** is a focusable button and cards are keyboard-selectable; Test connection uses the reason table; a bare 404 has its own sentence; an emptied model/endpoint is refused; the selection/reference caps have one owner; the secret name comes from the settings read; a failed settings read shows defaults; Simple NEO off mid-window stops the queue and refuses replacement; label+quotes strip in the right order; missing locale keys added; the group separator is per tab; the window follows `--ui-zoom`.

## Verification

- `npm test` — 568 pass (stalled body, empty model, 404, limits, label+quotes, existing suite).
- `npm run test:rephrase` — 14 pass (modal guard, keyboard retry, Tab, Simple NEO mid-window, plus prior flow).
- inventory 30, records 14, tags 12, notes 14, dictionary 13.
- `npm run lint` clean in touched files; `npx oxlint neo-ext/` clean.
- `node neo-ext/check-seams.js` and `openspec validate adr-013-rephrase-hardening --strict` pass.
- `code-reviewer`, `security-reviewer`, `ts-cop`: their blockers/majors are the list above; re-checked in the same diff.
