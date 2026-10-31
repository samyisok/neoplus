# Design

## Context

Rephrase already owns the whole path this feature needs: a selection captured in one
chapter block, its neighbouring paragraphs, a session snapshot of the local
endpoint/model, a loopback-only request with a 30-second budget, and an undoable
replacement through `execCommand('insertText')`. History already accepts a
replacement from any tool. What is new is the answer's shape and the board.

A spike against the machine's `qwen3.5-4b` shaped the design:

- a minimal one-object prompt found 1 of 3 errors;
- a few-shot prompt found 3 of 3 but mislabelled spelling as its own type and once
  returned `stands` where its own message said `stood`;
- **one JSON object per line, asked only for grammar**, returned all three correct
  fixes with exact quotes;
- a separate "style only" pass repeated the grammar errors and offered no real
  style advice; a free rewrite invented facts ("clutching", "mangled heap");
- asked to "output nothing" when clean, the model answered `No errors found.` as
  prose; asked for `NONE`, it answered a no-op issue (`quote` = `fix`) plus
  reasoning; asked for `CLEAN`, it answered `CLEAN`; one verbose answer was cut off
  mid-object by the token limit.

So: grammar is a reliable, single-purpose pass; style is advice that the model is
weak at, and asking for it on demand keeps the board from promising something the
model usually cannot give. The clean path needs an explicit sentinel, because an
empty answer and a non-answer look the same otherwise.

## Goals / Non-Goals

**Goals:**

- A grammar review whose corrected text is provably the writer's words with only
  grammar fixes applied.
- A board that shows each problem and its explanation, joined to the span.
- Style advice that is optional, clearly advice, and never applied.
- Reuse Rephrase's selection, context, endpoint, timeout, replacement, and History.

**Non-Goals:**

- Rewriting for style, applying suggestions, or a prose explanation of the passage.
- Notes pages, footnotes, the shelf, or Pocket.
- New settings, a grammar prompt editor, or non-English explanations.
- A second AI profile list: grammar has one job.

## Decisions

### D1 — Two passes: grammar is automatic, style is on demand

The board opens with the grammar result. A **Suggest style** button runs the second
pass. This matches what the model can do: grammar answers are useful; style answers
are uneven, and an on-demand result reads as an answer to a question rather than a
missing section. If the style pass fails or returns nothing, the grammar board is
untouched. At most three suggestions are shown, so the board stays a review and not
a second manuscript.

### D2 — Three outcomes: issues, CLEAN, unreadable

The grammar pass is asked for one object per line:

```json
{"quote":"exact words","fix":"replacement","message":"one sentence"}
```

and, when there is nothing to fix, the single line `CLEAN`.

No outer array or wrapper, so one malformed line costs one issue. The parser takes
the first `{` and the last `}` on each line; a line with no braces is ignored. If
the whole answer is one JSON array of objects, it is accepted as a fallback (the
model produced that shape in the spike). The outcome is exactly one of:

- **clean** — a line equal to `CLEAN`, or an answer whose only objects are no-ops,
  and no usable issue; the not-applied issues are dropped and no retry is made for
  them;
- **issues** — at least one usable issue;
- **unreadable** — empty, no `CLEAN`, and no usable issue, including a prose-only
  answer.

An object is an issue when `quote` is a non-empty string. A no-op fix (`fix` equals
`quote`) is dropped before the outcome is decided and is never a card. An issue is
usable when `fix` is a string (empty means delete) and `message` is a non-empty
string. Duplicate quotes take occurrences in issue order. Issues are accepted in
answer order up to 40, then located, sorted by position, and the leftmost of an
overlapping pair is kept; the later one becomes not applied.

A parsed issue is **not applied** when its `fix` or `message` is missing or not a
string, its quote is not found, or it overlaps an earlier accepted span. When it has
a quote it is shown on the board with no marker and no line; a missing message uses
the fixed sentence "The model gave no explanation."

Any not-applied parsed issue, any brace-bearing line that fails to parse, or an
unreadable outcome triggers **one silent retry** of the whole pass. The retry
replaces the first answer; nothing is merged, and a `CLEAN` from the retry wins.
After the retry, remaining not-applied issues are shown as such and an unreadable
answer offers **Try again**.

The style pass uses the same reader, with `CLEAN` meaning "nothing to suggest". It
is sent the **original selection** as `<selection>`, the **corrected text** as
`<reference side="corrected">` (capped at 2,000 characters), and the same before and
after references. Quotes must come from the original. A quote not in the original,
or overlapping an accepted grammar span, is dropped rather than shown; at most three
survive, in text order. A style answer retries only when it is unreadable or a line
that looks like an issue cannot be parsed; a dropped overlap or a quote that exists
only in the corrected text is not a reason to retry.

Both passes POST to `/chat/completions` with `redirect: 'manual'`, the shared
30-second timeout, `stream: false`, `top_p: 0.9`, temperature 0.2 for grammar and
0.3 for style, and `max_tokens` 900 and 600. Each pass has at most one retry, so the
grammar board costs at most two calls and a style pass at most two more. A response
body over 2 MB is refused before parsing; a fix is capped at 2,000 characters, a
message at 300, and an example at 400. A correction over 2,000 characters is shown
but Replace is disabled.

### D3 — The corrected text is assembled, never accepted

Grammar issues are sorted by their located index and applied right-to-left to the
original selection, so earlier offsets stay valid. Each applied fix is recorded with
its range in the result; the renderer paints exactly those spans green. A deletion
removes its words and has no green span, so its card is the cue. Style bytes never
enter this text, and a no-op or not-applied issue changes nothing. If no fix changes
anything and nothing is listed as not applied, corrected equals the selection, the
board says the text is clean, and Replace is disabled. If nothing was applied but
issues are listed, the board says so instead of calling the text clean. **Replace
inserts exactly this string**, so what the writer sees green is what lands in the
chapter. If the result is empty, Replace is also disabled and the window says the
passage would be emptied.

### D4 — The board and its lines

```
corrected (green fixes)          full width
+--------------------------------------------+
| original (left)   | cards (right)           |
| [span] ---------> | 1 quote -> fix / why    |
|                   | 2 ...                   |
+--------------------------------------------+
| Close                              Replace  |
+--------------------------------------------+
```

The board is a grid: the original and the card column share one scroll container,
with an absolutely positioned SVG layer in the same coordinate space. For each
issue, the anchor is a `Range` over its span; `getClientRects()` gives one rect per
wrapped line, and the line is drawn from the last rect's right edge (plus a small
bar on the earlier rects) to the card's left edge. Grammar is red, style yellow.
Cards are sorted by their anchor's top, so lines run mostly downward. Lines are
`aria-hidden`; each card is numbered, names its span, and is linked to the span with
`aria-describedby`. Recalculation runs after render, on scroll, resize, font load,
and a style pass. Below a local width of 560 px (the board's own width after the Interface Size zoom,
not the viewport's) the board becomes one column, cards below the text, and the
lines are hidden.

The modal sits inside core's `.modal`, which carries `zoom: var(--ui-zoom)`, so
`getClientRects()` reports scaled viewport pixels while the SVG layer uses unscaled
local pixels. The board converts each rect with the same ratio core uses at
`app.js:1185` (`box.width / offsetWidth`), or divides by `api.uiZoom()`. It is
checked at 100 % and 300 %, with the action row outside the scroller so it stays on
screen. Board text is built from text nodes, never `innerHTML`, for the manuscript
and for every model field (`quote`, `fix`, `message`, `example`).

### D5 — What is reused, and what is extracted

- **Selection and context:** the same rule as Rephrase (`rephrase-context.js`:
  one block, 1,200 characters, 700-character neighbours). The grammar capture
  records the range and block exactly as Rephrase does; a second capture module is
  not extracted, because each window owns one live range and the rule itself is
  already shared.
- **Transport:** the endpoint resolution, redirect and final-URL checks, key read,
  timeout, and status mapping currently inside `rephrase-main.js` move to
  `neo-ext/llm-client.js`, beside `rephrase-main.js`. `neo-ext/lib/` stays pure; the
  pure endpoint rule is already `lib/rephrase-endpoint.js`. The client reads the key
  per request, so no secret is stored in a session.
- **Settings:** `grammar-main.js` reads `settings.rephrase` and normalises it with
  `rephrase-prompt.normalizeSettings` (`endpoint`, `model`). Grammar has no profile,
  prompt, or base-instruction setting of its own.
- **Session:** `grammar-main.js` snapshots endpoint and model for the window with a
  15-minute TTL (a board is read, not a card) and the same 8-session cap. If the
  session is missing or expired when Try again or Suggest style runs, the renderer
  starts a new session once and repeats the call; the new session reads the settings
  in force then.
- **Menu:** `word-context.js` already stores the phrase for the native menu. The
  phrase payload gains a `grammar` flag beside `rephrase`; `word-context-main.js`
  accepts, stores, spends, and returns it; `preload.js` passes a seventh argument and
  exposes `grammarStart`, `grammarRun`, `grammarStyle`, and `grammarEnd`;
  `neo-ext/main.js` builds the **Grammar…** item after Rephrase; `boot.js` routes
  `grammar-open` and the Look Up choice. A one-word selection offers Grammar… in the
  Look Up popup, as Rephrase does.
- **Replacement and History:** the alive check normalises both ranges as Rephrase
  does; the insertion uses `execCommand('insertText')`;
  `NeoHistory.record({ tool: 'grammar', from, to, inChapter: true })` follows, and
  History gains `grammar -> Grammar` plus its empty state naming it.
- **Gate:** the same `moreFeatures()` check as Rephrase.
- **Constants:** `grammar-prompt.js` requires `rephrase-context.js` for the
  1,200/700 caps, as `rephrase-prompt.js` does; `MAX_CORRECTED` (2,000),
  `MAX_ISSUES` (40), and `MAX_STYLE` (3) live beside the prompt.

### D6 — Window lifecycle

Choosing Grammar opens the window at once with a loading state and sends the grammar
pass. The corrected text and red board appear when it answers. A failure shows a
sentence and **Try again**; `Try again` reuses the session, or starts a new one once
if it expired. The style pass is a button in the board's header; it is disabled while
running, and its failure leaves the grammar board standing with a short message. A
late answer is discarded if the window was closed or Show More Features went off.
Turning the switch off closes an open board and discards pending work. One board
exists at a time, and it refuses to open over another NEO dialog, as Rephrase does.
Esc and Close discard the request; nothing is written until Replace. No toast
interrupts the manuscript.

### D7 — Replace and Close

Replace re-checks that the captured range still holds the captured text
(normalising whitespace), focuses the editor, and inserts the corrected string as one
edit. A moved range writes nothing and says so. History is recorded after the insert
succeeds. Replace is disabled when the corrected text equals the selection or is
empty. Close, Escape, and the close control write nothing.

## Risks / Trade-offs

- **A wrong fix that reads plausible** (`stands` for `stood` in one spike run) → every
  grammar card shows `quote -> fix` beside its message, so the writer sees the
  exact change before Replace; the corrected text is only a preview until asked for.
- **The model misses an error** → the board cannot invent one; a second opinion is
  out of scope. Try again exists for a failed answer, not for a thin one.
- **A model that ignores the format** → the `CLEAN` sentinel and the unreadable
  outcome keep a prose answer from being called clean; one retry, then a clear
  failure.
- **Style advice is sparse** → expected with this model; the button makes that an
  answer, not a broken promise.
- **A style quote from the corrected text** → quotes are anchored to the original,
  so such a suggestion is dropped instead of misplacing a line.
- **Long JSON lines and quotes containing braces** → per-line parsing with the
  first/last brace is tolerant; a quote containing a newline is rejected (the
  selection is one block, so this is a malformed answer).
- **Duplicate quotes** → occurrences are assigned in issue order; a second issue on
  the same words is marked not applied if no second occurrence exists.
- **Lines over a wrapped or scrolled text, and at 300 %** → one scroll container,
  rects divided by the interface zoom, a local-width breakpoint that stacks the
  columns under 560 px, recalculation on scroll/resize; the lines are decorative
  and the cards stand alone.
- **The loopback listener is trusted by the same-user assumption** → `http` on
  loopback is allowed for the local model, as Rephrase already allows; a process
  that binds the port first would see the selection and key. The endpoint rule
  refuses everything else, and the model's output is only text or a deliberate,
  undoable edit.
- **A manuscript can steer the local model** → the prompt marks the passage and
  references as data and the app never executes model output; a steered reply can
  hide an issue (CLEAN) or show a wrong fix, which the writer sees before Replace.
- **Two sequential model calls** → grammar first and style only on request; a slow
  style pass never delays the grammar board.

## Migration Plan

None. No stored data changes; the feature reads the existing Rephrase settings and
writes only chapters (through the editor) and History (on Replace).
