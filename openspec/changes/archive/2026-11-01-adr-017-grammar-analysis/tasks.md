# Tasks

## 1. Issue rules, red first

- [x] 1.1 Write `scripts/grammar-issues.test.js`: one object per line parses; a line
  with no braces is ignored; a one-line JSON array is accepted; a brace line that
  fails to parse is flagged; a missing or non-string `quote` is dropped; a
  missing/non-string `fix` or `message` is not applied (with the fixed sentence when
  the message is missing); a quote not in the selection is unlocatable; duplicate
  quotes take occurrences in order; overlapping spans keep the leftmost; `""` is a
  deletion and `fix === quote` is not an issue; at most 40 are kept in answer order;
  CLEAN with no usable issue is clean, CLEAN with a usable issue is issues, and a
  prose/empty answer with no CLEAN is unreadable; a style quote not in the original
  or overlapping a grammar span is dropped and at most three are kept. Confirm it
  fails on the missing module.
- [x] 1.2 Write `neo-ext/lib/grammar-issues.js`: `parse` (the three outcomes),
  `locate`, `apply` (right-to-left, returning the corrected text and the applied
  spans), `overlaps`, `filterStyle`, and the limit constants (`MAX_ISSUES` 40,
  `MAX_STYLE` 3, `MAX_CORRECTED` 2000). Re-run to green.
- [x] 1.3 Add: applying two fixes returns exact green ranges; a deletion has no green
  span; a clean result equals the selection; style text never affects `apply`; an
  unlocatable issue is excluded from both text and spans; a no-op fix changes
  nothing.

## 2. Prompts, red first

- [x] 2.1 Write `scripts/grammar-prompt.test.js`: the grammar system asks for one
  object per line with `quote`, `fix`, `message`, and the single line CLEAN when
  there is nothing to fix; it asks for English messages and forbids a corrected
  passage; the style system asks for `quote`, `example`, `message`, says grammar is
  already fixed, requires quotes from `<selection>` (the original), asks for at most
  three, and accepts CLEAN; the selection is inside a delimiter and the before/after
  paragraphs are labelled reference data; the corrected reference is labelled and
  capped at 2,000; delimiter words are stripped from the manuscript; the 1,200/700
  caps come from `rephrase-context.js`. Confirm it fails first.
- [x] 2.2 Write `neo-ext/lib/grammar-prompt.js` to green: `grammarMessages`,
  `styleMessages`, the fixed English system texts, `MAX_CORRECTED`, `MAX_ISSUES`,
  `MAX_STYLE`, and the shared caps (require `rephrase-context.js`, as
  `rephrase-prompt.js` does). Load as a page script and in Node.

## 3. Transport and main, red first

- [x] 3.1 Extract the endpoint resolution, redirect and final-URL checks, key read,
  timeout, and status mapping from `neo-ext/rephrase-main.js` into
  `neo-ext/llm-client.js`, beside `rephrase-main.js` (`neo-ext/lib/` stays pure; the
  pure endpoint rule is already `lib/rephrase-endpoint.js`). Add
  `scripts/llm-client.test.js` for a redirect, a non-loopback final URL, a timeout,
  and a 401. Run `node --test scripts/rephrase-main.test.js` and
  `npm run test:rephrase` unchanged.
- [x] 3.2 Write `scripts/grammar-main.test.js` with a loopback stub: a grammar
  request returns the stub's text; a style request returns its own; missing session,
  a second concurrent run, an original over 1,200 characters, a corrected text over
  2,000, and an empty answer is refused with its reason; the session stores
  endpoint and model but not the key; the session expires after 15 minutes; the
  8-session cap holds; a style payload without the corrected reference is refused.
  Confirm it fails before the module.
- [x] 3.3 Write `neo-ext/grammar-main.js` (`start`, `runGrammar`, `runStyle`, `end`,
  `menuItem`) and register its handlers beside Rephrase's in `neo-ext/main.js`.
  Normalise `settings.rephrase` with `rephrase-prompt.normalizeSettings`; read the
  key per request; send `stream: false`, `redirect: 'manual'`, temperature 0.2/0.3,
  `max_tokens` 900/600; log fixed reasons only. Re-run to green.

## 4. The menu door, red first

- [x] 4.1 Write `scripts/grammar-menu.test.js`: a selection stores a `grammar` flag
  beside `rephrase`; the native menu offers **Grammar…** only when the flag is set,
  Show More Features is on, and the selection is one chapter block; the item sits
  after Rephrase; choosing it sends `grammar-open`; a one-word selection offers
  Grammar… in the Look Up popup and its choice routes. Update the fakes in
  `scripts/record-tags-menu.test.js` and `scripts/inventory-menu.test.js` to capture
  the seventh phrase argument so the flag is asserted, not silently dropped.
- [x] 4.2 Add the flag to `word-context.js` (capture, store, Look Up item and
  choice), `word-context-main.js` (accept, store, spend, return), the seventh
  argument and four call methods (`grammarStart`, `grammarRun`, `grammarStyle`,
  `grammarEnd`) to `preload.js`, the **Grammar…** item and gating to
  `neo-ext/main.js`, and the `grammar-open` route to `boot.js`. Re-run to green.

## 5. The board

- [x] 5.1 Write `scripts/grammar-view.test.js` with the pane test's fake DOM where
  possible: the corrected block renders first with green spans only for applied
  fixes; the original gets red markers for grammar and yellow for style; cards are
  numbered in anchor order; an unapplied issue has no marker and names its span; when
  every issue is unapplied the board says nothing was applied instead of calling the
  text clean; Replace is disabled on a clean text and on a blank result; a style
  quote from the corrected text is absent; a failed style pass leaves the grammar
  board standing; a `quote` containing `<b>` stays text; Close leaves the manuscript
  untouched; a rect is converted by the interface zoom before a line is drawn.
- [x] 5.2 Write `neo-ext/grammar.js`: window, loading and failure states, grammar
  board, **Try again**, **Suggest style**, Close, Replace, the alive check, the
  History record, the zoom-aware SVG line layer (after render, on scroll, and on
  resize), and the discard rules when the window closes or Show More Features goes
  off. Add the board and line styles to `neo-ext/neo-ext.css`; add
  `grammar: 'Grammar'` to `TOOL_LABELS` and name Grammar in History's empty state;
  add the three scripts to `index.html` and to `check-seams.js`. Re-run to green.

## 6. End to end

- [x] 6.1 Write `scripts/grammar.e2e.js` with a loopback stub and add `test:grammar`:
  a chapter selection stores the grammar flag and `grammar-main.menuItem` builds the
  item; `openPending()` opens the board (a native menu cannot be clicked in the
  e2e, as `rephrase.e2e.js` shows); the corrected text has green spans and the cards
  and lines are red; Replace inserts it, one undo restores it, and History gains a
  Grammar entry; Close writes nothing; the text moved writes nothing; an unlocatable
  quote is not applied; an overlapping pair keeps the leftmost; CLEAN and a no-op
  answer show a clean text with Replace disabled; a prose answer retries once and
  then offers Try again; Suggest style adds yellow cards only for quotes in the
  original and never changes the corrected text; a deleted passage disables Replace;
  at Interface Size 300 % the board fits and its actions stay visible; Simple NEO has
  no entry.
- [x] 6.2 Run `npm test`, `npm run test:grammar`, `npm run test:rephrase`,
  `npm run test:history`, `npm run test:simple`, `npm run test:interface-size`,
  `node neo-ext/check-seams.js`, and
  `openspec validate adr-017-grammar-analysis --strict`.
- [x] 6.3 Run the review gate on the diff (`grasp-verify`, `ddd-verify`, `ts-cop`,
  `code-reviewer`, `security-reviewer`) and record the verdicts in `review.md`.
- [x] 6.4 Add the Grammar note to `AGENTS.md`; add the new strings to
  `neo-ext/locales/en.json` for a future translation (it is not loaded at runtime
  today).
- [x] 6.5 `/opsx-sync`, then archive as `2026-11-01-adr-017-grammar-analysis`.
- [x] 6.6 After the archive: add the changelog entry keyed by the archived change
  path, raise the fork version (`npm pkg set version="1.6.0+fork.17"` and the root
  version in `package-lock.json`), run `npm run check:version` and
  `~/.local/bin/neo-reinstall`, then check by hand that a faulty paragraph shows its
  red lines, a clean one says so, a style pass adds yellow cards, and Replace gives
  one undo and one History entry.
