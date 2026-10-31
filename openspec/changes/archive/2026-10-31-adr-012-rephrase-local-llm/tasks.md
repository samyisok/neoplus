# Tasks

## 1. Pure rules (red first)

- [x] 1.1 Red: `scripts/rephrase-context.test.js` — one word accepted; 1,200 characters accepted; 1,201 refused; two blocks refused; exact text (double spaces) preserved; before/after capped at 700 and skip ghost/scene-break blocks. Green: `neo-ext/lib/rephrase-context.js`.
- [x] 1.2 Red: `scripts/rephrase-endpoint.test.js` — `127.0.0.1` and `[::1]` accepted; `localhost` accepted with `needsLookup` and a lookup result that is loopback required; `0.0.0.0`, `::`, userinfo, remote hosts, non-http schemes refused; path joining yields one `/chat/completions`. Green: `neo-ext/lib/rephrase-endpoint.js`.
- [x] 1.3 Red: `scripts/rephrase-prompt.test.js` — base instruction and profile text come only from settings; reference and selection sit in the user turn inside their delimiters; delimiter words in the text are neutralised; caps (4,000/500/40/1,200/700) enforced; defaults include Heroic, not Literary. Green: `neo-ext/lib/rephrase-prompt.js`.
- [x] 1.4 Red: `scripts/rephrase-check.test.js` — normal reply accepted; empty rejected; terse short reply accepted; selection-as-prefix continuation rejected; copied before/after 6-word shingle rejected; >2.5× rejected; whole-reply quotes and a leading profile label stripped. Green: `neo-ext/lib/rephrase-check.js`.

## 2. Settings window (tabs, load, atomic save)

- [x] 2.1 Red: settings e2e extension — General | AI tabs, Left/Right/Home/End, hidden-tab edits survive switching, Save saves both, AI tab absent with Show More Features off.
- [x] 2.2 Green: `neo-ext/settings.js` — `registerGroup({ tab, load, validate, save })`, tab strip, hidden sections, `open()` awaits every `load()` and back-fills values, Save validates **all** visible groups first and writes none if one fails.
- [x] 2.3 Red then green: AI group controls (endpoint, model, password key with “key saved”, base instruction textarea, profile rows with Add/Remove and 2–8 unique labels, Test connection). Test uses a typed unsaved key, checks the endpoint with the shared rule, calls `/models` with 5 s and no redirects, stores nothing.
- [x] 2.4 Red then green: settings round-trip and validation in `scripts/rephrase-main.test.js` — defaults; loopback rule; 2–8 profiles; unique labels; cap; atomic failure test (valid backup + invalid endpoint stores neither); key written after settings; key never returned; “stored without OS encryption” when `safeStorage` is unavailable.

## 3. Main process: sessions, secret, HTTP

- [x] 3.1 Red: `scripts/rephrase-main.test.js` — `start` snapshots profiles; `run` uses the snapshot even after settings change; unknown session/profile refused; caps re-enforced in main; one in-flight per session; `end` releases.
- [x] 3.2 Green: `rephrase-start/run/end` handlers in `neo-ext/rephrase-main.js`, 5-minute session TTL, `readSecret('rephrase-key')`, loopback + redirect guard, 30 s `AbortSignal.timeout`, plain-text reply, reason mapping (`auth`, `model`, `timeout`, `endpoint`, `network`, `http`).
- [x] 3.3 Red then green: a 307 answer is not followed and maps to `endpoint`, a response whose final URL leaves loopback maps to `endpoint`, 401/404/timeout/refused connection map to their reasons, and no log line contains the URL, key, prompt, selection, or reference text. Green: `logError('rephrase: <reason>')` only.
- [x] 3.4 Green: seam 7 passes `readSecret`; `neo-ext/main.js` registers the handlers and re-checks the endpoint on save, test, and run.

## 4. Selection and menu

- [x] 4.1 Red: `scripts/rephrase-context.test.js` covers the selector glue via the pure rule; `scripts/rephrase.e2e.js` covers the real selection (one word, 60 words, 1,201 characters, two blocks, non-chapter editor) and the macOS one-word Look Up item.
- [x] 4.2 Green: `word-context.js` builds and stores the rephrase entry (exact text, range, before/after) and flags the payload; `word-context-main.js` keeps a flag-only phrase entry above 120 characters; `neo-ext/main.js` builds the third phrase provider when `rephrase` is set; `boot.js` routes `rephrase-open`; Look Up offers it for one word.
- [x] 4.3 Green: the new page scripts (`lib/rephrase-context.js`, `lib/rephrase-endpoint.js`, `lib/rephrase-prompt.js`, `lib/rephrase-check.js`, `rephrase.js`) join seam 1 in `index.html` and `neo-ext/check-seams.js`, in that order, before `word-context.js` where needed; `check-seams.js` asserts that order (not only presence); `scripts/pocket-www.js` unchanged (desktop-only); CSS for the window and cards.

## 5. Window and queue

- [x] 5.1 Red: `scripts/rephrase.e2e.js` with a stub endpoint — window and one card per profile open before any answer; cards fill one by one; a failing profile shows Try again and retrying requests only that profile; a 307 shows an endpoint failure.
- [x] 5.2 Green: `neo-ext/rephrase.js` — start/end session, sequential queue, per-card states, keyboard (Up/Down, 1–8, Enter, Esc), Tab contained, 120 s queue budget, cancel discards late answers, all text via `textContent`.
- [x] 5.3 Red then green: a reply repeating the after paragraph, a continuation, or a short Terse reply exercises rejection/acceptance; one silent retry then the card's failure.

## 6. Replace

- [x] 6.1 Red: `scripts/rephrase.e2e.js` — choosing a card replaces exactly the selection; one undo restores; a double-space selection still replaces (normalised comparison both sides); a selection changed while cards fill writes nothing and says the text moved.
- [x] 6.2 Green: alive check with the same normalisation, reselect, `execCommand('insertText')`; cancel/failure leaves the manuscript untouched.

## 7. Docs, gates, release

- [x] 7.1 AGENTS section: settings shape and endpoint rule, session snapshot, progressive queue and budgets, prompt/validation contract, replacement/undo, Simple NEO/Pocket, log rule, `test:rephrase`.
- [x] 7.2 Add `"test:rephrase": "electron scripts/rephrase.e2e.js"` to `package.json` (unit files already run in `npm test`); run `npm test`, `npm run test:rephrase`, `npm run test:records`, `npm run test:tags`, `npm run test:inventory`, `npm run lint`, `npx oxlint neo-ext/`, `node neo-ext/check-seams.js`, `npm run check:version`, `openspec validate adr-012-rephrase-local-llm --strict`; record results.
- [x] 7.3 Review gate (`grasp-verify`, `ddd-verify`, `ts-cop`, `code-reviewer`, `security-reviewer`); fix blockers, re-run, record verdicts in `review.md`.
- [x] 7.4 `/opsx-sync` then archive as `2026-10-31-adr-012-rephrase-local-llm`; raise the fork to `1.6.0+fork.12`, add the changelog, commit, and reinstall.
