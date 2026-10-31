# Tasks

- [x] 1.1 Red: `scripts/rephrase-main.test.js` — a server that sends headers then stalls yields `timeout` and releases the session; a bare 404 yields `notFound`; an emptied model yields `modelId`; over-long text/reference yields `limits`.
- [x] 1.2 Green: `requestJson` reads the body inside the abort timer; `reasonForStatus` maps 404 to `notFound`; `validate` refuses an empty model/endpoint; request caps report `limits`; reasons gain `notFound`.
- [x] 1.3 Red: `scripts/rephrase-check.test.js` — `Natural: “…”` loses both label and quotes.
- [x] 1.4 Green: `checkReply` strips the label before quotes.
- [x] 2.1 Red: `scripts/rephrase.e2e.js` — Rephrase refuses to open over Settings; the failed card's **Try again** is a focused `BUTTON`; Tab stays inside; turning Simple NEO off mid-window stops requests and refuses a replacement.
- [x] 2.2 Green: modal guard before and after `rephraseStart`; cards are `role=button` with Enter/Space; retry is a real button, focused on failure; Tab targets visible cards/retry/cancel; `runProfile`, queue, and `choose` re-check Show More Features.
- [x] 3.1 Green: `rephrase-context` owns the caps, `rephrase-prompt` requires it; settings read returns the secret name and uses it on save; failed read shows defaults with a note.
- [x] 3.2 Green: every failure string used by the window and Settings exists in `neo-ext/locales/en.json`; the orphan key is gone; `logError` uses `('rephrase', Error)`; dead imports/fields removed.
- [x] 3.3 Green: separators between groups are per tab; the rephrase window divides height/width by `--ui-zoom`; one backdrop class.
- [x] 4.1 Gates: `npm test` (568), `npm run test:rephrase` (14), inventory 30, records 14, tags 12, notes 14, dictionary 13; `npm run lint` clean in touched files; `npx oxlint neo-ext/` clean; seams and `openspec validate --strict` pass.
- [x] 4.2 Review gate on the diff (`code-reviewer`, `security-reviewer`, `ts-cop`); fix blockers, record verdicts in `review.md`.
- [x] 4.3 `/opsx-sync` then archive as `2026-10-31-adr-013-rephrase-hardening`; raise the fork to `1.6.0+fork.13`, add the changelog, commit, and reinstall.
