# Review — adr-012-rephrase-local-llm

## Planning review

Three rounds (bugs + security) closed: redirect bypass, >120-character selections unreachable through the phrase channel, settings load absent, non-atomic save, normalised-vs-raw aliveness, Look Up missing from the spec, per-call settings snapshots, typed-key test connection, Terse length floor, prompt injection, continuation detection, timeout budgets, main-side caps, encryption disclosure, test script named, seam/script-order tasks. Recorded in the archived spec/design.

## Implementation review

`code-reviewer`, `security-reviewer`, and `ts-cop` reviewed the implementation. Blockers/majors fixed:

- Debug log removed; a second Rephrase while one is open now says so.
- Double-open guard (`opening`) and session release when the window cannot be built.
- Session TTL enforced in `run` without sliding refresh; sessions capped at 8; ids use `crypto.randomUUID`.
- `profileId` must be a real integer index; `busy` refuses a second in-flight call per session (tested).
- Queue budget checked inside each attempt, so two slow attempts cannot pass it.
- A cleared key field (touched) deletes the stored secret; untouched keeps it.
- Over-long prompt/model/instruction/label are refused (`limits`), never truncated silently.
- Tab cycles inside the rephrase window; more features re-checked after `start`.
- 404 maps to `endpoint` unless the body names a model; failed replacement clears the cached entry.
- `secureStorage` defaults to true when the settings read fails rather than showing a false warning.
- Endpoint rejects query/hash, every call uses the checked URL, and the Test response URL must stay loopback.
- One reason table (`lib/rephrase-reasons.js`) and `NeoExt.x` replace the divergent copies.

### Accepted advisories

- Resolve-then-connect for `localhost` is accepted (local attacker only), with final-URL checks.
- The phrase menu label is passed to core `t()` in the main process while the renderer uses the fork table; the English label is identical.
- `execCommand('insertText')` stays for the single-undo guarantee.

### Verdicts

- `code-reviewer` re-review: all prior blockers resolved; residual notes implemented.
- `security-reviewer`: no critical/high findings; loopback, key handling, caps, logging and DOM rules hold.
- `ts-cop`: no new lint errors; the duplicated `x()` and reason maps were consolidated.

## Verification

- `npm test` — 567 pass (unit: context, endpoint, prompt, check, main incl. stub server, TTL, busy, caps).
- `npm run test:rephrase` — 12 pass.
- `npm run test:inventory` — 30; records 14; tags 12; notes 14; dictionary 13.
- `npm run lint` clean in touched files; `npx oxlint neo-ext/` clean.
- `node neo-ext/check-seams.js` — seams and rephrase script order.
- `openspec validate adr-012-rephrase-local-llm --strict` — valid.
