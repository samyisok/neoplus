# Review — adr-017-grammar-analysis

Planning review of the artifacts only, per the fork's "Planning review: right after
propose" step.

> **Status:** the first pass's "no blocker" verdict was superseded by the second,
> line-by-line pass below, which found four blockers and sixteen should-fix items.
> All of them were folded into the artifacts on 2026-11-01; see
> [Disposition](#disposition-2026-11-01). The planning verdict is now "ready for
> implementation".

## GRASP Verification — 2026-11-01

**Findings:** 0 blockers, 2 accepted, 1 artifact fix.

### Checked

- **Ownership:** `grammar` owns the offer, the two passes, the board, and the
  Replace outcome. History owns the stored record through its existing recorder;
  the grammar spec does not restate History's storage rules. Rephrase owns the
  selection limits, and grammar cites the same numbers rather than inventing a
  second policy; if a third selection tool arrives, those limits become one shared
  rule.
- **Information Expert:** the issue rules and prompts are pure modules; the main
  module owns the endpoint snapshot and the requests; the renderer owns layout and
  input. The transport (endpoint/TLS/redirect/timeout) moves to one shared client so
  the security-critical path is not duplicated.
- **Low cohesion:** issue parsing/anchoring/apply is separate from the board; the
  prompt is separate from both. The design keeps `grammar.js` to window and drawing,
  with the pure work behind it.
- **Protected Variations:** the shared transport hides the endpoint rules; the
  History recorder is the stable seam; the phrase menu is a small explicit item for
  now, with the provider-list refactor named for when a third phrase tool appears.
- **Accepted:** the same 1,200/700-character limits appear in both Rephrase and
  Grammar; extracting a `selection` rule now would churn a working feature for one
  constant. The two explicit phrase menu items (Rephrase, Grammar) stay explicit
  until a third needs the registry.

### Artifact fix

- `specs/grammar/spec.md` promised the entry would "explain why if the writer
  reaches it anyway" for an unusable selection. There is no such path — the menu
  item simply does not appear — so the clause claimed untestable behaviour. Removed.

## DDD Verification — 2026-11-01

**Findings:** 0 blockers, 1 advisory.

### Checked

- **Ubiquitous language:** selection, passage, context, grammar, style, fix,
  corrected text, replacement, History — the words already used by Rephrase and the
  History tab. The model's prose is never called "the corrected text".
- **Boundaries:** grammar never writes a chapter or notes file directly; the
  replacement goes through the editor and History through the recorder. No book
  metadata, snapshot, or library field is touched. Style advice never crosses into
  the text.
- **Requirements stay observable:** they name what the writer sees and does, not
  fields, IPC names, prompts, or file paths. The endpoint/model/key are named only
  as the settings already configured for Rephrase.
- **God class:** the board is the largest piece; the design puts parsing, anchoring,
  applying, prompts, and requests in their own modules, so `grammar.js` should stay
  a view and controller.
- **Advisory:** the spec repeatedly says "the same as Rephrase" for selection and
  endpoint rules. That is deliberate reuse, but each such sentence also states the
  rule itself, so grammar remains readable and testable without the other spec.

## Verdict

No blocker remains. The artifacts are ready for implementation.

---

## Second pass — detailed audit (2026-11-01)

The first pass reviewed ownership and vocabulary. This pass checked every proposal
bullet, every requirement bullet and scenario, every design decision and risk, and
every task against the code in this checkout and against a live `qwen3.5-4b` probe.
**Four blockers** must be closed before `/opsx-apply`; they change the answer
contract, not just wording.

### Blockers

#### B1 — "clean" and "unreadable" are not distinguishable

Spec req 3 says "with no issues, the answer SHALL be treated as 'the text is
clean'"; its "A failed request" scenario says an answer with "nothing usable" says
so and offers Try again; task 3.2 says an empty answer is refused. One empty answer
cannot mean all three.

The live model makes the gap ordinary:

- asked to "output nothing" when clean, it answered `No errors found.` (prose);
- asked for `NONE`, it answered a no-op issue (`quote` = `fix`) plus reasoning;
- another clean sample answered `CLEAN` when `CLEAN` was requested;
- one faulty run was cut off mid-message, indistinguishable from an empty answer.

Consequences: a model that ignores the format tells the writer "clean"; an
unreadable answer is called clean; or a genuinely clean answer is called a failure.
No deterministic test can be written until the contract is three-way.

Required: the prompt asks for a single `CLEAN` line when there is nothing to fix;
the parser returns `clean` only for that sentinel; any non-empty answer with no
usable issue and no sentinel, and any empty answer, is `unreadable` (one retry, then
**Try again**); a `fix` equal to its `quote` is not an issue. Update spec req 3,
scenarios "A clean answer" / "A failed request", design D2/D6, tasks
1.1/2.1/3.2/6.1.

#### B2 — style quotes are sent from one text and marked on another

Spec req 6 sends the corrected text to the style pass. Spec req 5 says style marks
and lines are yellow and "never touch the corrected text", so their spans must live
in the original below. A style quote containing a grammar fix exists only in the
corrected text, so it cannot be anchored in the original. The design says only that
a style suggestion "whose span overlaps a grammar fix" is dropped, which requires
the overlapping span to exist first.

The live style probe quotes the original (`He stand … midle …`), not the corrected
text. The artifacts do not say which text the model is told to quote from.

Required: pick one source and state it. Recommended: send the corrected text as
`<selection>` and the original as `<reference side="original">`, require quotes
copied from the **original**, and drop a style suggestion whose quote is not found
in the original or overlaps an accepted grammar span. Update spec req 5/6, design
D2/D4, task 2.1, and add a scenario: a style quote covering a corrected word is
dropped.

#### B3 — the retry and "not applied" rules contradict their own scenarios

Spec req 3 lumps four different failures together: invalid JSON, missing field,
unlocatable quote, overlapping span. A line that is not JSON cannot be "listed as
not applied" — it has no quote and no message; the scenario says it is "left out".
A parsed issue with a missing message cannot be "explained" either. The retry is
"one silent retry of the whole pass", but the artifacts do not say whether the
retry replaces the first answer or merges with it, whether a clean sentinel from
the retry wins, or what happens to good issues from the first answer. "Keeps the
earlier issue" does not say earlier by text position or by answer line.

Required: malformed/prose lines are dropped (never cards); parsed issues with a
non-string or blank `quote`, `fix`, or `message` are unusable; unlocatable and
overlapping issues are **not applied** cards with no marker and no line; one retry
replaces the whole answer; the overlap winner is the leftmost span, ties by line
order; a style answer follows the same rules but its unusable suggestions are
dropped, not shown. Add a total budget and request shape (30 s per call, one retry,
`max_tokens`), which are currently unstated. Update spec req 3, design D2/D6, tasks
1.1/2.1/3.2/5.1/6.1.

#### B4 — the task list omits the wiring that makes the feature load

Proposal Impact says `word-context.js`, `preload.js`, `neo-ext/main.js`, and
`boot.js` gain "one small hook each", and lists `index.html`, `check-seams.js`, and
`locales/en.json`. The tasks do not cover:

- `neo-ext/word-context-main.js`: the phrase payload is parsed, stored, spent, and
  returned there; without a `grammar` field the native item never sees the flag.
  `preload.js` is also only "the argument" in task 4.2; the four IPC methods
  (`grammarStart`, `grammarRun`, `grammarStyle`, `grammarEnd`) are absent from every
  task, and the e2e cannot run without them.
- `index.html`: no task adds the `grammar-issues.js`, `grammar-prompt.js`, and
  `grammar.js` script tags; without them the renderer has no `NeoGrammar`.
- `neo-ext/check-seams.js`: no task adds the new scripts to its `index.html` anchors
  or its ordered list; the proposal names the file, the tasks do not.
- `package.json`: task 6.1 says add `test:grammar` (good) but proposal Impact does
  not mention it.
- `neo-ext/locales/en.json`: listed in Impact, in no task, and not loaded at runtime
  (`window.NeoExtLocale` is never set), so it is a translation placeholder, not a
  functional string file.
- History: task 5.2 records the entry but no task adds `grammar: 'Grammar'` to
  `TOOL_LABELS` or updates the empty-state sentence that names Rephrase and the
  thesaurus.

An implementation that follows the tasks exactly produces a menu item that never
appears and a window the page cannot open. Required: add one task per bullet, and
correct the Impact sentence.

### Should fix

| # | Finding | Where |
|---|---|---|
| S1 | SVG lines and Interface Size: `.modal` is `zoom: var(--ui-zoom)` (`styles.css:1677`), so `getClientRects()` returns scaled viewport px while the SVG layer inside the zoomed element uses unscaled local px. `app.js:1185` already divides a rect delta by `box.width / offsetWidth` for the same reason. Design D4 says "same coordinate space" without the division, and no test covers 200 %/300 %. | design D4, tasks 5.1/5.2/6.2 |
| S2 | The style pass sends the corrected text, which can exceed the 1,200-character selection cap (grammar fixes add words). `rephrase-main.runOne` refuses `text.length > MAX_SELECTION`; a grammar request that copied that check would refuse style on a full paragraph. Define a corrected-text cap (or allow selection length plus the fix delta) and test it. | spec req 6, design D2/D5, task 3.3 |
| S3 | No cap on style suggestions. The spike prompt asked for at most three; the spec and design have no number, so a runaway answer can produce hundreds of cards and lines. Add a cap (recommended 3) and a test. | spec req 6, design D2 |
| S4 | macOS parity: ADR-012 requires one-word Rephrase in the Look Up popup and `word-context.lookUpMenu` still offers it; ADR-017 req 1 says "the same rules as Rephrase" but only the native item is planned. Add Grammar to the popup or state the exclusion and test it. | spec req 1, design D5, task 4.2 |
| S5 | `neo-ext/lib/*.js` is documented as pure (AGENTS.md TDD rules). A transport module with DNS, `fetch`, redirects, and secret reads is not. Put it at `neo-ext/llm-client.js` (beside `rephrase-main.js`) or amend the rule; also name where grammar reads endpoint/model (the only public normaliser is `rephrase-prompt.normalizeSettings`). | proposal Impact, design D5, task 3.1 |
| S6 | Security wording is thinner than ADR-012's: no "rendered as text, never markup" for the model's `quote`/`message`/`example` and the manuscript; logs forbid the endpoint/key/reference but not the selection or prompt; no "no direct chapter/notes/`book.json`/`library.json` writes"; design D5 says the session snapshots the key, while Rephrase re-reads it per request and never keeps it in a session. | spec req 2, design D5, tasks 3.2/3.3 |
| S7 | Show More Features turned off while the board is open: req 8 says no window/request shall exist; Rephrase closes on the next step and discards late replies. The design does not say Grammar closes, discards a late style answer, or refuses a second window. | spec req 8, design D6 |
| S8 | "The entry SHALL not appear … in a placeholder" is not a state: placeholders are inline `.ph-mark` spans inside `.chapter-body`, and Rephrase is already offered around them. The real exclusions are automatic (`#aux-editor` is not `.chapter-body`, `.fn-text` sits outside it, `.snap-body` is not editable). Remove the clause or define "a selection that is only a placeholder mark". | spec req 1 |
| S9 | A deletion-only fix can make the corrected text empty (a one-word selection replaced by nothing). `history-record.js` refuses `!to.trim()`, so "the replacement SHALL be recorded" cannot hold for that edit. Decide: disable Replace when the result is blank, or allow it and state that History records no entry, with a status sentence. | spec req 7, task 5.2 |
| S10 | "Explanations SHALL be in English" is a model guarantee, not observable behaviour. Reword to "the request SHALL ask for English explanations" and test the system text (task 2.1 can). | spec req 8 |
| S11 | Ordering: task 6.4 adds the changelog entry "keyed by the archive name" and raises the fork version, but 6.5 is where the archive happens and the `changelog-update` skill reads `openspec/changes/archive/*/`. Move the changelog and version after the archive. | tasks 6.4/6.5 |
| S12 | Task wording that cannot be executed as written: 6.1 "the menu appears for a chapter selection" (a native menu cannot be clicked in the e2e; `rephrase.e2e.js` drives `openPending()` and checks `lookUpMenu` separately); 3.1 "the main tests" (name `node --test scripts/rephrase-main.test.js`); 6.2 omits `npm run test:interface-size` for S1; 3.3 has the typo "Rehrase". | tasks 3.1/3.3/6.1/6.2 |
| S13 | Scenario coverage is thin for testable bullets: the 40-issue cap, the 700-character context caps, "no request before choosing", an empty selection, a cross-block selection, and a notes-page selection have no scenario. Add at least the 40 cap, the no-request rule, and one exclusion. | spec |
| S14 | History's screen copy: `TOOL_LABELS` has only `rephrase` and `thesaurus`; the empty state says "Rephrase and the thesaurus record what they change here." A Grammar entry would render as the raw slug and the empty state would omit the tool. | `neo-ext/history.js`, task 5.2 |
| S15 | No request shape: `temperature`, `max_tokens`, `stream`, and the session-map size are unstated; the spike showed a verbose answer truncated at 500 tokens. Reuse Rephrase's 30 s/`redirect: manual` shape and set a token budget that fits 40 short lines. | design D2, task 3.3 |
| S16 | Session lifetime: the board's session expires after five minutes; pressing **Suggest style** later (or **Try again** after a timeout) must transparently start a new session or say the board must be reopened. Neither is stated. | design D6, task 3.2 |

### Advisories

- `grammar-prompt.js` should `require('./rephrase-context.js')` for the 1,200/700
  caps, as `rephrase-prompt.js` already does, instead of repeating the numbers;
  task 2.2 says "shared" but does not say how.
- Design D5 says endpoint resolution lives in `rephrase-main.js`; the endpoint
  *rule* already lives in `lib/rephrase-endpoint.js`. Say "the request/status/timeout
  plumbing moves; the rule is already shared".
- Design D2's "an empty fix (deletion is allowed only as `""`)" reads as both
  forbidden and allowed. Reword: a non-string `fix` is unusable; `""` is a deletion.
- `grammar.js` will capture the selection a second time, next to `rephrase.js`
  (`capture` + `last`). Accept it, or extract `lib/selection-capture.js`; say which.
- A deletion leaves no green span in the corrected block; say whether the card is
  the only cue or a gap mark is shown.
- Menu order in `contextMenu` is unstated; place Grammar after Rephrase.
- The lines' colours cannot be asserted in the e2e; assert the card classes and the
  SVG path count/colour class instead.
- The per-line parser could accept a one-line JSON array as a fallback; the model
  returned one in the spike. Not required, but the current rule loses the whole
  answer for that shape.
- Proposal says `main.js`; the item is built in `neo-ext/main.js`. Say the latter.

### Per-requirement bullet audit

| Req | Bullets | Scenarios | Result |
|---|---|---|---|
| 1 Offer | 4 | 3 | pass; placeholder bullet S8; Look Up S4 |
| 2 Local/context | 4 | 1 | pass; security wording S6 |
| 3 Issue contract | 5 | 4 | **fail**: B1, B3; 40 cap untested S13 |
| 4 Assembled text | 4 | 2 | pass; no-op drop is B1; deletion note |
| 5 Board | 7 | 4 | pass except zoom math S1 and no interface-size test |
| 6 Style | 4 | 2 | **fail**: B2; length/count caps S2/S3 |
| 7 Replace/close | 5 | 3 | pass; blank-result edge S9 |
| 8 Gate/Pocket | 4 | 1 | pass; open-window case S7; English S10 |

Proposal: all six What Changes bullets are covered in the spec except the style
anchor (B2) and the wiring list (B4); the capability line and Impact are accurate
apart from S5 and B4. Design: D1, D3, D7 and the Goals/Migration hold; D2 and D6
carry B1-B3, S2/S3/S15/S16; D4 carries S1; D5 carries S4/S5/S6. Tasks: 1.1-1.3,
2.1-2.2, 5.1 are sound but need the B1/B3 cases; 3.1-3.3 need S5/S8/S12/S15/S16;
4.1-4.2 need B4 and the Look Up case; 6.1-6.5 need B1, S11, S12.

### Code claims checked

Verified against this checkout: `rephrase-main.js` (endpoint resolution, redirect
and final-URL checks, key read, 30 s timeout, status map, 5-minute session,
8-session cap); `lib/rephrase-context.js` (1,200/700, one-block rule);
`lib/rephrase-prompt.js` (delimiters and `asData`); `word-context.js` (phrase flag
path, 120-character phrase cap, native and Look Up menus); `word-context-main.js`
(payload fields and TTL); `preload.js` (six positional phrase arguments, no grammar
methods); `neo-ext/main.js` (`contextMenu` build order); `boot.js`
(`rephrase-open` routing); `history-record.js` (`record` guard and empty-side
refusal); `history.js` (`TOOL_LABELS`, empty copy); `index.html` (script list has
no grammar scripts); `check-seams.js` (hardcoded script order);
`.modal { zoom: var(--ui-zoom) }` and `app.js:1185` (rect divided by zoom);
snapshot/footnote/notes exclusions; `scripts/pocket-www.js` (no `neo-ext/` copy).
The live probe used `qwen3.5-4b` at `127.0.0.1:8080` on 2026-11-01; no request left
the machine.

### Disposition (2026-11-01)

All findings were folded into the planning artifacts. No code was written. The
second-pass table above records the state before the fix; this table is the current
state.

| Finding | Where fixed |
|---|---|
| B1 clean / unreadable | spec req 3 (`CLEAN`, three outcomes, no-op drop); design D2/D6; tasks 1.1/2.1/3.2/6.1 |
| B2 style anchor | spec req 5/6 (original is the text advised on, quotes from the original); design D2/D4; tasks 2.1/6.1 |
| B3 retry / not applied | spec req 3 (malformed dropped, retry replaces, leftmost overlap, missing-message sentence); design D2/D6; tasks 1.1/2.1/3.2/5.1/6.1 |
| B4 missing wiring | proposal Impact; tasks 4.1/4.2 (`word-context-main`, preload methods, Look Up), 5.2 (`index.html`, `check-seams`, History), 6.1 (`test:grammar`) |
| S1 zoom and lines | design D4 (`box.width / offsetWidth`, 300 %); tasks 5.1/5.2/6.2 |
| S2 style length | spec req 6 (2,000-character corrected reference); design D2; task 3.3 |
| S3 style count | spec req 6 (three); design D1/D2 |
| S4 macOS Look Up | spec req 1; design D5; tasks 4.1/4.2 |
| S5 client location | design D5 (`neo-ext/llm-client.js`, settings via `rephrase-prompt.normalizeSettings`); task 3.1 |
| S6 security | spec req 2 (text never markup, logs reasons only, no direct writes, key not in session); design D5; tasks 3.2/3.3 |
| S7 switch-off / late answers | spec req 8; design D6 |
| S8 placeholder clause | spec req 1 (removed; shelf, snapshot, notes, and footnotes named) |
| S9 blank result | spec req 4/7 (Replace disabled, passage would be emptied); design D3/D7; task 5.1 |
| S10 English | spec req 8 (the request asks for it); task 2.1 |
| S11 order | tasks 6.5/6.6 (archive, then changelog and version) |
| S12 task wording | tasks 3.1/6.1/6.2 |
| S13 scenarios | spec req 1/3/6/7/8 (two blocks, macOS, no-op, nothing usable, deletion, style source/length, blank, switch-off) |
| S14 History | design D5; task 5.2 (`grammar -> Grammar`, empty state) |
| S15 request shape | design D2/D5 (timeout, redirect, temperature, tokens, session cap); task 3.3 |
| S16 session lifetime | design D5/D6 (15-minute TTL, new session once, late answers discarded); task 3.2 |

Advisories: the shared caps, the deletion cue, the platform naming, the menu order,
the array fallback, and the colour assertions were adopted; the duplicate selection
capture is accepted deliberately (each window owns one live range, and the rule
itself is already shared); `locales/en.json` is recorded as a translation
placeholder, not a runtime string file.

### Planning verdict

**No blocker remains.** The artifacts are ready for `/opsx-apply`. The first red
tests are tasks 1.1, 2.1, 3.1, and 3.2; B1-B3 must stay as written there. The
first-pass sections remain valid for ownership and language; their "no blocker"
verdict was incomplete, not wrong about ownership.

---

## Implementation review gate — 2026-11-01

Diff: `git diff HEAD` (grammar feature). Lint: `npm run lint` exits 1 only on
pre-existing upstream files; zero findings in the changed files.

### GRASP — no blocker

- **Information Expert:** `lib/grammar-issues.js` owns parsing, locating, applying,
  and style filtering; `lib/grammar-prompt.js` owns both prompts; `grammar-main.js`
  owns the session and requests; `grammar-board.js` owns the DOM; `grammar.js` owns
  capture, window, and Replace. Each operation sits with its data.
- **Creator:** `llm-client.js` owns the request; Rephrase and Grammar both use it.
- **Controller:** the three phrase flags are explicit in `word-context.js`; accepted
  until a fourth phrase tool needs a provider list.
- **Coupling / cohesion:** the first implementation had `grammar.js` at 556 lines
  with the model and line drawing inside it. The board was extracted during the
  gate to `grammar-board.js` (253 lines); `grammar.js` is now 397 lines of
  view/controller. Accepted.
- **Advisories accepted:** the session shell (TTL, `busy`, cap) is duplicated
  between `rephrase-main.js` and `grammar-main.js`; extracting it now would churn a
  working Rephrase path for one shared shape. `word-context.js` walks the chapter's
  paragraph text once per capture rather than sharing the block list; a later
  cleanup.

### DDD — no blocker

- **Ubiquitous language:** selection, issue, fix, message, corrected text, style,
  replacement, History, Grammar — the names the spec and History already use.
- **Boundaries:** Grammar never writes a chapter or notes page; the only writes are
  the editor's own replacement and the History entry. The pure modules have no DOM,
  disk, or network.
- **God class:** `grammar.js` 397 and `grammar-board.js` 253; the board is below
  the 350-line heuristic, and the remaining file is a controller. Accepted.
- No aggregate or cross-aggregate calls, and no infrastructure leak into the rules.

### ts-cop — 1 blocker, fixed

- **Blocker:** `openPending` checked for another dialog before the awaited
  `grammarStart` and never again. Fixed: the check is repeated after the await, the
  new session is ended on that path, and `opening` is cleared in `finally`.
- Fixed: resize listeners accumulated on every re-render; a throw in the window
  build could wedge `opening`; a fix containing a line break could insert a break;
  no Tab trap or initial focus; an old session was not ended on restart; the History
  promise was floating; dead `current.retried` state; a false comment in
  `grammar-issues.js`.
- Accepted: duplicate paragraph sweeps on capture; `end` accepts any session id
  (UUIDs, same shape as Rephrase); `drawLines` is covered by the e2e rather than a
  fake DOM; a shifted green range now has a unit test.

### code-reviewer — 2 blockers, fixed

- **Blocker:** the session-restart budget was per window, so a second expiry made
  Try again a dead button. Fixed: it resets per Try again and per Suggest style, and
  the old session is ended.
- **Blocker:** the 300 % board kept two columns because the breakpoint was the
  viewport width. Fixed: `fitBoard` toggles `neo-grammar-narrow` on the board's local
  width under 560 px; the e2e asserts the stack and a readable original column.
- Fixed: an empty answer now gets the silent retry before it is called unreadable;
  CLEAN beside a malformed object line retries; the style retry is per press; status
  and style notice are separate lines; the style button's title matches the reason;
  `last` is cleared after Replace; focus trap; `aria-describedby`; a footnote
  selection offers nothing.
- E2E gaps closed: Try again, retry replaces, empty answer, partial deletion, style
  CLEAN, long/two-block, 300 % column, late answer after the switch goes off.
  Accepted gaps: `drawLines` unit (e2e covers it), a second open over another dialog
  (same guard as Rephrase), style over 2,000 (view test).

### security-reviewer — 0 blockers

- Fixed: response bodies are capped at 2 MB (`large` reason); fixes at 2,000
  characters, messages at 300, examples at 400; Replace is disabled over 2,000;
  async failures are caught.
- Accepted: plain-HTTP loopback trusts a same-user listener (the ADR-012 posture,
  now recorded in the design's Risks); DNS is resolved twice; sessions are not
  sender-bound (UUIDs, same as Rephrase); manuscript text can steer the local model
  (bounded by text-only output and a deliberate Replace).
- Verified: `textContent` only, no `eval` or inline script; loopback only, no
  redirects, TLS not relaxed; the key is read per request and never returned; logs
  carry fixed reasons only; no disk access from the renderer; Pocket untouched.

### Final evidence

`npm test` 713/713, `npm run test:grammar` 20/20, `test:rephrase` 15/15,
`test:history` 8/8, `test:simple` 14/14, `test:interface-size` 11/11;
`node neo-ext/check-seams.js` passes; `openspec validate --strict` is valid; lint
is clean in the changed files.

**Implementation verdict: no blocker.** Ready for sync and archive.

---

## Second implementation review — 2026-11-01

A fresh code-reviewer and security-reviewer pass on the committed feature plus the
two post-gate fixes. **2 blockers, 0 security blockers.**

### Blockers fixed

- **A whitespace-only correction was not blank.** `buildModel` compared
  `result.text === ''`, so a model answer leaving `' '` enabled Replace, inserted the
  space, and `history-record.js` then refused the empty side: the edit landed with no
  History entry. `blank` now uses `trim()`; Replace is disabled and the view test
  covers the whitespace case.
- **The session-restart path had no test.** The blocker fixed in the first gate was
  a dead Try again after a second expiry, but no test entered the renderer's restart
  branch. The e2e now clears `grammar-main.sessions` while the board is open and
  proves one restart on Try again and one on Suggest style.

### Advisories fixed

- A session started after the board closed is ended; `ResizeObserver` re-fits and
  redraws the board when Interface Size changes under it (e2e proves 100 % ↔ 300 %).
- `readCapped` cancels a declared-large body and treats a no-reader body as capped;
  `postChat` logs the fixed `endpoint`, `large`, and `empty` reasons.
- The board's body is keyboard-scrollable; style `busy` resets on an unexpected
  failure; `setFailure` ignores a closed board; `limits` has a grammar sentence;
  `Replace` is in `locales/en.json`; `openPending` checks the gate before a session;
  an unresolved editor is treated as a moved range; focus falls back to the open
  chapter; ⌘Z/⇧⌘Z are intercepted on window capture; status, notice, loading, and
  failure lines are live regions and Replace points at the status.
- The e2e now asserts focus returned to the chapter before undo.

### Accepted

- Sessions are not sender-bound (UUIDs, one window; Rephrase has the same shape).
- Closing does not abort an in-flight request; it is bounded by the 30-second
  timeout and the answer is discarded.
- Exact line geometry is asserted by path presence and the 100 %/300 % column test,
  not by a pixel comparison.
- A manuscript can still steer the local model; output is text-only and Replace is a
  deliberate click, as recorded in the design's Risks.

### Evidence

`npm test` 714/714; `npm run test:grammar` 23/23; `test:rephrase` 15/15;
`test:history` 8/8; `test:simple` 14/14; `test:interface-size` 11/11; lint clean in
the changed files; `check-seams` and `openspec validate --all --strict` pass.

**Verdict: no blocker.**

### Follow-up after the second review

- Sessions are now bound to the renderer that opened them (`grammar-main.js` stores
  the sender id and `take`/`end` refuse another renderer); `end` aborts the in-flight
  request through an `AbortController` composed with the client's timeout.
- `llm-client.postChat` accepts an external `signal`; `grammar-main` passes the
  session's controller and clears it when the call settles.
- The e2e now scrolls the board, pairs each SVG path with its card by `data-card`,
  and asserts the path endpoint lands within 3 px of the card at the measured zoom.
- Tests: `grammar-main` covers the owner check and abort; `llm-client` covers an
  external abort. `npm test` 716, `test:grammar` 24.

---

## Third review — DDD / GRASP / ts-cop (2026-11-01)

Scope: `HEAD^..HEAD` (the adr-017 feature). Working tree was clean at the start.

### DDD Verification Report

**Files changed:** 39
**Findings:** 1 advisory

- [ ] `neo-ext/grammar.js:1` — God class heuristic: 435 lines, and the module carries
  capture, window lifecycle, two retry state machines, Style, Replace, and History.
  Recommendation: extract a pure `lib/grammar-run.js` or a `grammar-window.js`.
  **Accepted:** the file is a renderer controller, not a domain class; the pure rules
  are in `lib/grammar-issues.js`, the prompts in `lib/grammar-prompt.js`, and the DOM
  model/renderer in `grammar-board.js` (260 lines). No domain logic, persistence, or
  aggregate boundary issue was found; splitting the controller now would add
  indirection without changing behavior.

No anemic model, service-layer domain logic, repository leak, missing aggregate
boundary, cross-aggregate call, or generic domain name was found. The ubiquitous
language (selection, issue, fix, message, corrected text, style, replacement,
History, Grammar) matches the spec.

### GRASP Verification Report

**Files changed:** 39
**Findings:** 2 advisories

- [ ] `neo-ext/grammar.js:1` — Low cohesion / high coupling: one controller imports
  the rule module, board module, context rule, reply check, API, reasons, bridge,
  History, and Ext. Recommendation: split the retry/request pair from the window.
  **Accepted** for the same reason as the DDD finding; the board and rules already
  carry the feature's cohesive pieces.
- [ ] `neo-ext/word-context.js:210` — Three phrase flags are now explicit in the
  context menu. Recommendation: a provider list when a fourth phrase tool arrives.
  **Accepted:** the third tool is still one item; the provider refactor is named in
  the design.

Fixed during this pass: the renderer no longer re-exports `buildModel`/`renderBoard`/
`rectToLocal`/`drawLines`; the view test reads `NeoGrammarBoard` directly.

### ts-cop

**1 blocker fixed.**

- A model issue with no usable `fix` was rendered as **“(delete)”** while marked
  “Not applied”, and an issue with neither `fix` nor `message` skipped the fixed
  “The model gave no explanation.” sentence. `locate` now sets `NO_MESSAGE` before
  the fix check, `buildModel` keeps `fix: null`, and the board says
  “(no replacement)”; tests cover both.

Advisories fixed: the window-build catch removed its keydown listener from
`document` instead of `window`; Try again lost focus when loading replaced the retry
button (the loading line is focusable); `end` from another renderer now has a test;
a caller abort is logged as `cancelled`, not `timeout`; the CLEAN-with-unusable-issues
rule is stated in the spec/design and tested; the duplicated board min-height has a
comment. Accepted: the 435-line controller (above), and the 750 ms Simple NEO poll
(the board is modal; a menu-subscription refactor is deferred).

### Evidence

`npm test` 720/720; `test:grammar` 24/24; `test:rephrase` 15/15; `test:history` 8/8;
`test:simple` 14/14; `test:interface-size` 11/11; `check-seams` pass;
`openspec validate --all --strict` 12/12; lint clean in changed files.

**Verdict: no blocker.**

### Follow-up from the writer's report (2026-11-01)

- **Whole-sentence answers are trimmed to the changed words.** The model often
  quotes a sentence and returns the same sentence with one word changed. `locate`
  now keeps the full quote for anchoring and overlap, then trims to the differing
  characters and expands a partial word to the whole word (`stand -> stood`, not
  `an -> oo`). A pure insertion stays an insertion (`(insert)` card, green insertion,
  no red marker); a deletion keeps the removed word and `(delete)`. The corrected
  text is still assembled from the trimmed fix, so it remains exactly what Replace
  inserts.
- **Prompts name the two cases the model missed.** The grammar turn now says an
  article is grammar and that a common noun after a name or brand stays lowercase
  (`Qi crystals`, not `Qi Crystals`); the style turn forbids article changes. A live
  probe with the new prompts returned `He was a slim young man` and `Qi crystals` as
  grammar issues, and a phrasing example for style (no article advice).
- **A no-op-only answer is clean.** `qwen3.5-4b` often answers a clean passage with a
  no-op object instead of `CLEAN`; the app now treats that as clean (and a no-op-only
  style answer as “no suggestions”) instead of calling the answer unreadable.
- **No suggestions is visible.** After a clean style pass the button reads
  **No style suggestions**, the notice stays on the board, and a later press resets
  the label.
- Tests: whole-sentence trim (grammar and style), word-internal replacement,
  insertion/deletion, no-op-only clean, article/capitalization prompt rules, and e2e
  cases for the whole-sentence board, no-op-only board, and the style button label.

### Follow-up: visible empty style result (2026-11-01)

The missing indication was caused by suggestions that were returned but **all
filtered out** (corrected-only quote or a grammar overlap): the raw suggestion list
was non-empty, so the board left the button and notice unchanged even though no
style card survived. `suggestStyle` now counts the kept suggestions after
`filterStyle`; when none survive, the notice reads **Nothing to suggest.** and the
button reads **No style suggestions**. The same notice covers `CLEAN`, a no-op-only
answer, and an all-filtered answer. The e2e adds the all-filtered case; `test:grammar`
is 27/27.

### Prompt tuning against a 120-case model benchmark (2026-11-01)

`qwen3.5-4b` at 0.2 missed one error in three, so the grammar prompt was measured
instead of guessed at. The corpus (`scripts/fixtures/grammar-cases.json`) is 100
single-error cases, ten per kind (tense, agreement, articles, plurals, spelling,
capitalisation, prepositions, pronouns, comparatives, missing/extra words), plus 20
clean controls. A case passes when the corrected text equals the expected sentence
with exactly one applied issue; a clean case passes when nothing is applied. The
runner (`scripts/grammar-model.e2e.js`) is tooling: not in `npm test`, CI, or
packaging, and it skips with no key.

| Candidate | Score | Clean |
|---|---|---|
| Shipped prompt before tuning | 81/120 (68%) | 17/20 |
| Rules only | 93/120 (78%) | 19/20 |
| Rules + examples (longest) | 96/120 (80%) | 16/20 |
| Examples only | 101/120 (84%) | 13/20 |
| Rules + examples + safety rules | **111/120 (93%)** | **19/20** |

What the measurement taught: rules raise error recall, examples raise it further,
and both tempt the model to invent a change in a clean sentence; the safety lines
("change only the error", "never replace a word with a synonym", "delete only a
repeated or extra word", "a grammatical sentence gets CLEAN even when it could be
phrased better") are what buy the clean controls back. Rewriting the winning prompt
into a tidier, shorter form dropped the score to 99/120 and made the model answer
`{"quote":"<the sentence>","fix":"CLEAN"}`, so the shipped prompt is kept verbatim
as measured.

Three parser rules came out of the same failures, each with a red test first:

- A quote the model lowercased (`"the both"` for `"The both"`) is now matched
  without case and takes the selection's own characters, so it anchors instead of
  becoming an unlocatable card.
- Deleting a whole word takes one neighbouring space with it: `We arrived at home.`
  no longer becomes `We arrived  home.` and `dinner already.` no longer becomes
  `dinner .`. The reported span stays on the word.
- A fix that opens a sentence takes the capital, including a deletion that removed
  the word carrying it (`The both of them` -> `Both of them`). A change inside a
  sentence keeps the writer's case (`Qi Crystals` -> `Qi crystals`).

The grammar pass now runs at temperature 0 (from 0.2): a checker should answer the
same passage the same way twice, and the prompt scores 111 rather than 109 at 0.

The 9 remaining misses are the 4B's ceiling, not prompt shape: it deletes a word in
a clean sentence (`She has eaten dinner already.`), corrupts a word it should leave
(`He was a slim young man.` -> `He ws ...`), writes `Who's book`, keeps `insisted on
come`, and leaves `where were I going` in a reported question. Raising the score
further needs a larger model, not another rule.

### Second corpus: literary prose (held-out)

The first corpus is plain sentences, and a prompt tuned on it can still fail on a
manuscript. A second corpus of the same shape was written from scratch in a novel
voice (`scripts/fixtures/grammar-cases-literary.json`): 100 single-error cases, ten
per kind, each inside a literary line ("The bell ringed twice, and the hall fell
silent"), and 20 clean controls of long, comma-heavy prose. `--corpus` selects it.

| Prompt | Plain | Plain clean | Literary | Literary clean |
|---|---|---|---|---|
| rules + examples + safety (first tuning) | 111 (93%) | 19/20 | 92 (77%) | 11/20 |
| + article/case/truncation rules | 89 (74%) | 10/20 | — | — |
| **clean check as Step 1 + two agreement/verb-pattern rules** | **112 (93%)** | **20/20** | **101 (84%)** | **19/20** |

What the literary corpus exposed: the 4B deletes the definite article from correct
prose ("The village kept its dead" -> "kept its dead"), invents capitals on ordinary
words ("dead" -> "DEAD", "Its" -> "IT'S"), and trims the end of a sentence. Adding
rules about articles and case made all three worse, because a longer prompt gives
this model more to copy from. What worked was structure, not volume: the turn now
opens with "Step 1. Is the sentence already grammatical? If it is, reply with the
single line CLEAN and nothing else, even when you would phrase it differently", and
the JSON shape comes second. That alone moved literary clean controls from 11/20 to
20/20 and did not cost a single plain case.

The shipped prompt adds two more measured lines (subject-verb agreement with the
head noun; -ing after suggest, insist on, look forward to, used to), which took
literary to 101/120 and plain to 112/120.

Both corpora are kept. A later prompt change has to be measured on both, at
temperature 0, three runs; `scripts/grammar-model.e2e.js --corpus <name>`.

### Third corpus: a chapter's own voice, with the error place checked

A writer's chapter (fantasy, first person, invented names, shouted dialogue) was the
source for a third corpus, `scripts/fixtures/grammar-cases-chapter.json`: 100
single-error lines in that voice and 20 clean controls taken from or shaped like it.

This corpus adds the check the other two lacked. Each error case carries `quote`, the
words that are actually wrong, derived by a word-level diff of the sentence against
its correction (not from the app's own trimming). A case passes only when the one
applied issue covers exactly that span or a whole-word part of it, so a card that
highlights the sentence, or points at the wrong word, fails even when the corrected
text is right. `scripts/grammar-model.e2e.js` prints the got span beside the wanted
one when it does not line up.

The first run of this corpus is a lesson in writing the check, not the prompt: with
hand-written expected spans (`arrived to`, `more thicker`) every preposition and
comparative case "failed" although the text was correct, because the app trims to
the smallest wrong words (`to`, `thicker`), which is the useful card. Deriving the
span by word diff fixed the corpus, not the code.

| Prompt | Plain | Literary | Chapter | Clean (plain/lit/ch) |
|---|---|---|---|---|
| shipped before this corpus | 112 | 101 | 95 | 20 / 19 / 17 |
| + capitalise a name you do not recognise | 112 | **102** | 95 | 20 / **20** / **19** |
| + "keep every word as written" (longer) | — | — | 94 | — / — / 19 |
| name rule moved into an existing line | — | — | 92 | — / — / 18 |

The one-line rule that survived: "Capitalise a name you do not recognise (person,
town, order, technique): ringobell -> Ringobell, Xuan yuan -> Xuan Yuan, dao armor
-> Dao Armor." It lifted the chapter corpus's capitalisation cases from 4/10 to
6/10 without touching the other corpora, and clean controls rose on all three
(17 -> 19, 19 -> 20, 19 -> 20). Saying the same thing twice, or folding it into an
existing rule, scored worse — the same lesson as the first two corpora.

Every place check passes on the shipped prompt: when the text is corrected, the card
points at the wrong words. The chapter's 25 misses are the 4B's own, mostly the
names it does not know (`Du dong`, `black mountain`, `foundation level`) and forms
it will not repair (`used to wake`, `where were the town hall`, `its an long walk`).

### Follow-up: duplicate reports became "Not applied" cards (2026-11-01)

The writer saw a board full of **Not applied** cards that had no line to the text:
"missing article" on `slim young man`, "wrong preposition" on `smirk at his
good-looking face`, "missing article" on `plain white robe`. Reproduced on his own
chapter: `qwen3.5-4b` reports one error twice, once with a wide quote and once with
the narrow one, both with the same correction.

The overlap rule kept the wider span (it starts first) and marked the narrow one
`overlap`, which the board shows as a second card with no marker and no line. The
retry then replaced the whole answer, so the writer could end up looking at a worse
second answer. Two changes, red test first:

- Every issue is trimmed **before** overlap resolution, and a later issue whose
  trimmed span and replacement equal a kept one is dropped as a duplicate
  (`reason: 'duplicate'`) instead of being shown. A different fix over the same words
  is still a real conflict and still appears as not applied.
- A quote asked for again after its last occurrence anchors to its first occurrence,
  so a repeated report is classified instead of turning into an unlocatable card.

On his paragraph the same six lines now give three cards, all applied, and the
corrected text is unchanged. Over the three corpora nothing regressed: plain
112/120, literary 102/120, chapter 95/120, clean 20/20, 20/20, 19/20.

### Follow-up: board layout, waiting line, and the 30-second wall (2026-11-01)

Three things the writer saw:

- **A white rectangle around "Checking the text…".** The waiting line is focused so a
  screen reader announces the wait, and the focus ring drew a box around a sentence,
  which reads as a selection. The rule keeps the focus and drops the ring
  (`.neo-grammar-loading:focus`), and the e2e asserts the line is `document.activeElement`
  with no outline.
- **"The local model did not answer in time".** The page asked for a grammar pass with
  no timeout of its own, so the client's 30-second default applied. A 1,200-character
  passage asking for a JSONL answer takes longer than that on a 4B on a laptop. The
  service now uses `GRAMMAR_TIMEOUT_MS` (90 s) unless a caller sets one; the client
  default stays for the other tools. Waiting beats reporting a timeout that never
  happened.
- **Cards beside the text, with lines crossing it.** The board was a two-column grid
  (text | cards) and every line ran from a word across the paragraph to a card's left
  edge. The body is now a column: the text keeps the full width, the card list sits
  under it aligned right and scrolls on its own, and `lineEnds` sends each line from
  the word to a point on the card's **top** edge, 14 px in (by the card number).

Tests: `scripts/grammar-css.test.js` (loading mark, column layout), a `lineEnds` case
in `grammar-view.test.js`, a `GRAMMAR_TIMEOUT_MS` case in `grammar-main.test.js`, and
two e2e cases (the waiting line's focus, a scrolled line ending at the card's top).

### Follow-up: cards in rows, top border, and the context paragraph (2026-11-01)

The writer's screenshot showed four **Not applied** cards whose words were not in his
selection at all (`slim young man`, `smirk at his good-looking face`, `plain white
robe`, `In another he held shieth`). They came from the next paragraph, which travels
as `<reference side="after">`. The prompt already says the reference is data and must
not be analysed; a 4B ignores that often enough to matter. The page now drops an issue
whose quote is unlocatable in the selection **but present in the before/after text**
(`parse(answer, selection, { before, after })`); when that was the whole answer the
result is a clean selection, not a retry. Any other unlocatable quote still shows as
not applied, and an invalid object still makes the answer unreadable.

Three layout changes from the same screenshot:

- **Cards sit in a few rows**, not one column: the list under the text is a grid
  (`repeat(auto-fill, minmax(15rem, 1fr))`), so a long review is scanned across.
- **The border moved to the top of the card** (`border-top` red for grammar, amber for
  style), which is where its connector line arrives.
- **The first card, a missing article, had no line** because an insertion marks no
  wrong words. It now carries an empty `neo-grammar-caret` span at the gap, and
  `drawLines` falls back to the marker's own rect for a zero-length mark, so the card
  joins the text like the rest.

Tests: two `grammar-issues` cases (context dropped, context-only answer is clean), a
`grammar-view` case (caret present and empty), two CSS cases (grid rows, top border),
and two e2e cases (a context fix is dropped from the board; a missing-article card
still draws its line).

## Code review — code-reviewer + security-reviewer (2026-11-01)

Two read-only reviewers passed the whole feature.

- **code-reviewer: APPROVE.** 0 critical, 0 high, 1 medium, 2 low. No manuscript,
  `book.json`, or `library.json` write violation; the only mutation is the
  one-undo-step `insertText` on Replace, and the only write is the History record.
- **security-reviewer: LOW risk.** 0 critical/high/medium, 3 low. Loopback-only
  endpoint with userinfo/redirect/scheme rejection, key read per request in main and
  never returned to the renderer, delimiter-stripped prompt, `textContent` rendering,
  2 MB body cap, owner-bound IPC sessions, no fs surface in the feature.

Fixed from the findings, red test first:

- **MEDIUM** `inReference` dropped a genuine error: a bare case-insensitive substring
  match, so a misquoted short token (`was`, `a`) that also appeared in the context
  could tip a real issue to `clean`. Now matched on whole-word boundaries and only
  for phrases of 4+ characters.
- **LOW** a pure-insertion *style* suggestion rendered a card with no mark or line.
  It now carries the same caret as a grammar insertion, in amber.
- **LOW** `object.quote` was uncapped while every other field is sliced; it is now
  `MAX_QUOTE` (2,000).
- **LOW** the connector drawing was the one untested board path; `grammar-view.test.js`
  now drives `drawLines` with rect/range stubs and asserts a caret yields one line.

Accepted advisories, recorded not fixed: a `localhost` DNS-rebinding TOCTOU between the
pre-flight lookup and `fetch` (a local attacker who can steer the resolver already has
the key on disk), and the key travelling as `Bearer` over plaintext loopback (the local
model is loopback by design). Both are defense-in-depth, not reachable vulnerabilities.

### Follow-up: connector geometry (2026-11-01)

The writer asked for two things in a screenshot: the line should leave the **middle**
of the word, and the cards should stand **far enough from the text** that a line can
travel without crossing it. `lineEnds` now starts at `from.left + width / 2` on
`from.bottom` (under the underline, not the word's right edge), and ends at
`to.left + width / 2` on `to.top`; the curve leaves straight down and then bends
across. The card list gained a 34 px top margin, so the line has empty room beneath
the paragraph. `grammar-view.test.js` asserts the four numbers, `grammar-css.test.js`
asserts the gap, and the e2e scroll case now measures against the card's centre.
