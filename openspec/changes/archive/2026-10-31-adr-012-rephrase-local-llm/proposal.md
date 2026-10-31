# Proposal

## Why

A writer often knows a sentence is not right before knowing how to fix it: "he grabbed his meal and started eating" needs a different register, not a synonym. NEO already has a local, private language model on this machine, so the manuscript can offer five different rewrites of the selected words without sending a book to a cloud service. Today that means copying text into another window and pasting it back, which loses the sentence's context and breaks the flow of writing.

## What Changes

- **Rewriting settings.** File → Settings… gains tabs (General, AI) and the Backup group moves under General. The AI tab holds the local endpoint, model id, an API key stored as a secret, the base editing instruction, and an editable list of writing profiles (default: Polite, Common, Natural, Heroic, Terse; 2–8 entries). A **Test connection** action reports whether the endpoint answers.
- **Rephrase… from a selection.** Selecting a word up to a small paragraph (hard cap 1,200 characters, one block) and right-clicking offers **Rephrase…**; on macOS a one-word selection offers it in the Look Up popup too. The choice captures the selection, the paragraph before it, and the paragraph after it, then opens one window.
- **One rewrite per profile, filled as they arrive.** The window opens immediately with one card per profile (a snapshot of the settings at that moment); each card is written by its own model call and says "writing…" until it lands. A failed card offers **Try again**; the rest of the queue is unaffected, and the whole queue has a time budget.
- **Context without continuation.** The surrounding paragraphs are reference for tone and continuity and are never rewritten or echoed; replies that repeat that reference, or come back wildly longer or shorter than the selection, are rejected and retried rather than shown.
- **Choose and replace.** Choosing a card replaces exactly the selected text, as one undoable edit. If the selection moved or the block changed while the model was writing, nothing is replaced and the window says so.
- **Private by default.** In this version the endpoint must be the local machine (loopback); a non-local address, or any redirect away from loopback, is refused rather than silently sending book text away. The key is held by the system's secret storage when the OS provides it, never returned to the page, and the AI tab says when the OS cannot encrypt it.

### Assumptions

- Profiles are an editable list, not a fixed five; **Heroic** replaces **Literary** among the defaults, and the list is capped at 8. A rewrite window keeps the profiles it opened with, even if settings are saved meanwhile.
- A selection must stay inside one paragraph/block; a multi-paragraph selection is refused because replacing it as plain text would flatten paragraph and scene breaks.
- Settings are per device, because the model and endpoint are machine-local. Save validates every tab before writing anything, and writes the key only after the settings are stored.
- Rephrase works in manuscript chapter bodies, behind Show More Features; it is absent in Simple NEO and Pocket. Notes pages and scripts are out of scope for this first version.

### Out of scope

- Remote/cloud endpoints, streaming partial text inside one profile card, translation, or style analysis of a whole chapter.
- Preserving inline bold/italic inside a replaced selection (the thesaurus has the same limitation).
- Rewriting in the Notes tab, exports, or Pocket.
- Per-profile temperature or token limits in the UI; defaults are used.

## Capabilities

### New Capabilities

- `rephrase`: a selection-based, progressively generated set of rewrites from a local model, with context, validation, cancellation, and one-undo replacement.

### Modified Capabilities

- `settings`: tabs, the AI group, secret handling, and connection testing.

## Impact

- **New fork files:** `neo-ext/rephrase.js` (window, progressive queue, replacement), `neo-ext/lib/rephrase-context.js` (selection caps and one-block rule, pure), `neo-ext/rephrase-main.js` (settings, rewrite sessions, secret read, HTTP calls, timeouts), `neo-ext/lib/rephrase-endpoint.js` (one endpoint/loopback rule), `neo-ext/lib/rephrase-prompt.js` (prompt assembly and profile defaults), `neo-ext/lib/rephrase-check.js` (reply validation: emptiness, continuation, context leakage, length floor).
- **Changed fork files:** `neo-ext/settings.js` (tab strip and group tabs), `neo-ext/word-context.js` (full-selection context and menu flag), `neo-ext/word-context-main.js` + `preload.js` (payload field), `neo-ext/main.js` (phrase menu provider, settings handlers, `readSecret` injection), `neo-ext/boot.js` (route), `neo-ext/api.js` (guarded chapter/paragraph/selection reads as needed), `neo-ext/neo-ext.css`, `index.html`, `neo-ext/check-seams.js`, `neo-ext/locales/en.json`.
- **Upstream seam:** seam 7 passes `readSecret` into the fork's main module (one dependency on the existing seam line). No new upstream file.
- **Storage:** `settings.json` keeps endpoint, model, base prompt, and profiles per device; the key lives in `userData/secrets.json` through the existing encrypted secret path. Nothing enters the library or `book.json`.
- **Network:** only literal loopback (`127.0.0.1`/`[::1]`) or `localhost` when it resolves loopback, on http or https, only when the writer asks for a rewrite or a connection test; redirects are never followed; TLS verification is never relaxed. A 30-second timeout per call and a 2-minute budget for one window's queue.
- **Tests:** `scripts/rephrase-context.test.js`, `scripts/rephrase-prompt.test.js`, `scripts/rephrase-check.test.js`, `scripts/rephrase-endpoint.test.js`, `scripts/rephrase-main.test.js` (against a local stub HTTP server, including a 307), a `test:rephrase` npm script, settings tab coverage in the settings e2e, and `scripts/rephrase.e2e.js` with a stub endpoint.
