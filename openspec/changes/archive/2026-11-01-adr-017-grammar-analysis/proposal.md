# Proposal

## Why

Rephrase rewrites a passage but never explains what was wrong with it. A writer who
wants to learn — or who wants to check a passage without changing its voice — has
to leave NEO. The local model already answers Rephrase on this machine; a grammar
pass can ask it for the errors and fixes instead of a rewrite, and show them on a
board that keeps the writer's own words.

## What Changes

- Add **Grammar…** to the right-click menu of a chapter selection, with the same
  selection rules as Rephrase (one block, up to 1,200 characters) and the same
  surrounding paragraphs as context. On macOS a one-word selection offers it in the
  Look Up popup too.
- Ask the local model for grammar problems as one JSON object per line, or the
  single line `CLEAN` when there is nothing to fix. Each issue carries the exact
  quoted span, the exact replacement, and a short English explanation. The app
  anchors each quote, checks it, drops no-op fixes, retries once when an issue
  cannot be applied or the answer cannot be read, and assembles the corrected text
  itself — the model never supplies a prose "corrected version".
- Open a review board: the corrected text on top with every applied fix in green;
  the writer's original below, each problem marked in red, each explanation card
  joined to its span by a red line. A problem that could not be applied is listed as
  not applied, with no marker and no line.
- Add a **Suggest style** button. Style advice is a second, on-demand pass over the
  original, with the corrected text as reference; its cards are yellow, advice only,
  never applied, and at most three. A style quote that is not in the original or
  overlaps a grammar fix is dropped.
- **Replace** inserts the grammar-only corrected text as one undo step and records
  the replacement in History as Grammar; **Close** changes nothing. Replace is
  disabled when the text is unchanged or the correction would empty the passage;
  with nothing to fix the board says the text is clean.
- Behind Show More Features, chapters only, English explanations from the request,
  no new settings: the same endpoint, model, and key the AI tab already holds.
  Pocket is unchanged.

## Capabilities

### New Capabilities
- `grammar`: a grammar review of the selected passage — the offer, the context it
  sends, the issue contract and its clean/unreadable outcomes, the review board,
  on-demand style advice, and the replace-or-close outcome.

## Impact

- New pure modules: `neo-ext/lib/grammar-issues.js` (parse, validate, locate,
  overlap, apply, style filter, three outcomes) and
  `neo-ext/lib/grammar-prompt.js` (system and user turns, sharing
  `rephrase-context.js` caps).
- New main module `neo-ext/grammar-main.js` for the two passes. The request,
  redirect, timeout, and status plumbing is extracted to `neo-ext/llm-client.js`
  beside `rephrase-main.js` (`neo-ext/lib/` stays pure), and settings are normalised
  with `rephrase-prompt.normalizeSettings`.
- New renderer `neo-ext/grammar.js` (window, board, zoom-aware lines, Replace) plus
  wiring in `word-context.js`, `word-context-main.js`, `preload.js` (the seventh
  phrase argument and four call methods), `neo-ext/main.js`, and `boot.js`.
- `neo-ext/neo-ext.css` gains the board, markers, cards, and SVG layer; `index.html`
  loads the three new scripts; `check-seams.js` lists them.
- History gains `grammar -> Grammar` and names Grammar in its empty state; no other
  capability changes.
- `package.json` gains `test:grammar`; `AGENTS.md` gains the feature note;
  `neo-ext/locales/en.json` gains the strings for a future translation (it is not
  loaded at runtime today).
- Tests: pure rules and prompts, the shared client, main handlers, the menu door,
  the board including 300 % interface size, and an e2e with a loopback stub for
  issues, CLEAN, unreadable, malformed, no-op, overlapping, unlocatable, blank, and
  style cases.
