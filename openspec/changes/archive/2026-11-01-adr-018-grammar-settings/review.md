# Review — adr-018 grammar settings

## Security review (security-reviewer, 2026-11-01)

Verdict: 1 medium, 4 low, 1 informational. No new non-loopback path, no key readable
by the window, no arbitrary `settings.json` keys, no manuscript or library write.
The renderer cannot widen the settings block (only `endpoint`, `model`, `prompt`,
`keyCleared`), and the endpoint is re-validated at request time even if the file is
hand-edited.

Fixed in this change:

- **Medium — a save could erase `settings.json`.** The core reader returns `{}` for
  both a missing and a corrupt file, so `{ ...{}, grammar }` would drop `libraryDir`,
  the export folder, and the window bounds. The service now remembers the last real
  settings it read and refuses to save once an empty read follows it.
- **Low — Test connection could aim the stored key at another port.** The stored key
  now goes only to the stored endpoint; a different endpoint requires a key typed in
  the tab beside it.
- **Low — clearing the key silently borrowed the Rewrite key.** The save stores
  `grammar.keyCleared`, and a cleared key stays cleared.
- **Low — a save could report success with nothing written.** A missing writer now
  fails the save instead.

Accepted, recorded not fixed: a custom prompt may name a block tag that the data
sanitizer does not strip (`<passage>`); the structural guards still hold — a fix is
applied only when its quote occurs in the selection and the range is re-checked — and
the writer approves the diff. Also accepted: `rephrase-main.js` has the same
"settings could be erased" shape (pre-existing, not introduced here).

## Domain / responsibility check

- `lib/grammar-config.js` is pure: defaults, fallback, caps, prompt resolution. No
  storage, no IPC, no DOM.
- `grammar-main.js` owns the settings block, the key order, and the prompt snapshot;
  it still never touches a book file.
- `grammar-settings.js` owns only the tab's fields and its save sequence.
- One capability (`grammar`) gains a settings surface; no other capability reads or
  writes `settings.grammar`.

## Follow-up from the writer's report (2026-11-01)

- **The Prompt field is filled in.** The service returns `defaultPrompt` with the
  settings, and the tab shows the prompt in force — the stored one, else NEO's — so it
  can be edited without hunting for the text. Saving an untouched default stores `''`,
  which keeps the writer following NEO's prompt.
- **Restore default prompt** on both tabs. `neo-ext/settings.js` now renders an optional
  `reset` button on a `textarea`, with `resetValue(values)` for the text to put back;
  Grammar uses the built-in prompt, Rewrite uses `defaultSettings().prompt`.
- **Tabs renamed:** `AI` → **AI Rephrasing**, `Grammar` → **AI Grammar** (one tab each,
  so the two model settings are not confused).
- **The style wait is visible.** `Suggest style` shows a spinner beside the button
  while the pass runs, and the notice ("Nothing to suggest.") now renders in the board's
  top block under that button instead of at the window's foot.

Tests: a `grammar-view` case (spinner hidden until asked, notice under the button), a CSS
case (the wheel turns), the grammar e2e (prompt prefilled, Restore puts it back, a save
writes the edited prompt), a slow-style e2e (wheel appears and clears), the filtered-style
e2e now asserts the notice's place, and the Rewrite e2e checks its restore button and the
new tab names.

### Follow-up: settings blocks and the profiles reset (2026-11-01)

- **Spacing.** A row's label sat closer to the block above than to its own field, so
  "Endpoint" or "Test connection" read as part of the previous setting. Each
  `.neo-ext-row` is now a padded, faintly tinted block (10 × 12 px, 8 px radius) with
  a 4 px label gap, so every setting — General, AI Rephrasing, AI Grammar — separates
  from its neighbour.
- **Button height.** Replace…/Choose… are stretched to their field's height
  (`.neo-ext-pathline .neo-ext-choose { align-self: stretch }`), so the key button is
  no longer shorter than the key field.
- **Restore default profiles.** The profiles control accepts the same `reset` option as
  a textarea; the Rewrite tab restores its five shipped profiles (Polite, Common,
  Natural, Heroic, Terse) after an experiment.

Tests: a CSS case (padded row, label margin, stretched button) and the Rewrite e2e
(restore button removes and puts back a profile).

## Code review of the change (code-reviewer, 2026-11-01)

Verdict: warning. 0 critical, 1 high, 4 medium, 2 low. Fixed here:

- **High — a corrupt `settings.json` could be replaced by `{ grammar }`.** The first
  save in a fresh process had no "last good read" to compare against, so a corrupt or
  half-synced file (read as `{}` by core) would be overwritten, forgetting `libraryDir`,
  the export folder, and the window bounds. The guard now asks the file itself:
  `neo-ext/main.js` gains `settingsBroken()` (an empty or unparsable file is broken, a
  missing one is not) and hands it to both the grammar and the Rewrite save.
- **Medium — `neo-ext/lib/grammar-config.js` was never loaded in the window.** The tab
  read `window.NeoGrammarConfig`, which no `<script>` provided, so its defaults and
  secret name were dead code. The tag is in `index.html` and the e2e asserts the module
  is there.
- **Medium — a failed load could erase a stored prompt.** The note was never rendered,
  and a blank form then saved `prompt: ''`. The tab renders `__loadNote` and refuses to
  save while it is set.
- **Medium — every Save pinned the endpoint and model**, contradicting the tab's own
  copy. `getSettings` now returns `stored` (what the file holds) beside `settings` (what
  the pass will use); the fields show `stored`, inherit as placeholders, and an empty
  field is stored empty, so the fallback keeps working after a save.
- **Medium — the prompt compare was untrimmed**, so a paste with a trailing space could
  pin the prompt forever. Comparison normalises CRLF and surrounding space; the stored
  text keeps the writer's exact characters.
- **Low — the style button repeated the notice** ("No style suggestions" beside "Nothing
  to suggest."). The button keeps its own label; the notice carries the news.
- **Low — the style click's catch could re-render after close.** It now returns when the
  window is gone.

The reviewer also confirmed the spinner always stops, the notice is never lost, the
reset buttons cannot break Save, and nothing writes a chapter, `book.json`,
`library.json`, or a snapshot.
