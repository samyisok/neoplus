# Design

## 1. One timeout for the whole answer

`rephrase-main.js` now reads the response inside the abort scope:

```
requestJson(url, options, timeout):
  controller + timer(30 s)
  res = await fetch(..., signal)
  text = await res.text()        <- still inside the timer
  return { res, data: JSON.parse(text) if possible }
  finally clearTimeout
```

A server that sends headers and stalls now aborts at the same 30 seconds; the card shows timeout, and the session's `busy` flag is released. The connection test uses the same helper with 5 s.

## 2. The window refuses to stack

`openPending()` checks `.modal-backdrop:not([hidden])` before starting a session and again after the session await. A refused start releases the session immediately.

## 3. Retry is a real control

The card is a `div` with `role="button"`, `tabindex=0`, and Enter/Space chooses it when it holds text. **Try again** is a real `<button>` inside the card, focused when its card fails. Tab cycling targets `.neo-rephrase-card`, `.neo-rephrase-retry`, `.neo-rephrase-cancel`, skipping hidden controls, so focus never leaves the dialog.

## 4. Reason wording

The 404 case gets its own reason (`notFound`, “The endpoint or model was not found”), separate from `endpoint` (“Only the local machine…”). The Test button maps the IPC reason through the same `rephrase-reasons` table the window uses; it no longer sends `model`, because `/models` does not take one.

## 5. Caps and limits

`rephrase-context.js` owns `MAX_CHARS` / `CONTEXT_CHARS`; `rephrase-prompt.js` requires that module and re-exports `MAX_SELECTION` / `MAX_REFERENCE`. Main reports `limits` for an over-long selection, reference, or settings field, never “reply too large”.

## 6. Secret name and defaults

`neo-ext:get-rephrase-settings` returns `secret` (`SECRET`), and the AI tab writes the key with that name. A failed settings read returns the prompt module's defaults with a note; the tab shows defaults rather than empty fields.

## 7. Simple NEO mid-window

`runProfile`, the queue loop, and `choose` re-check `api.moreFeatures()`; turning the switch off closes the window with a toast, stops pending work, and refuses a replacement.

## 8. Smaller corrections

- `checkReply` strips the profile label first, then whole-reply quotes, so `Natural: “…”` arrives clean.
- The settings group marks separators per tab (`neo-ext-group-sep`), so General has no trailing rule while AI is hidden or after it.
- Rephrase width/max-height divide by `--ui-zoom`; the backdrop carries one class (`modal-backdrop neo-rephrase-backdrop`).
- Missing strings enter `neo-ext/locales/en.json`; the orphaned one is removed.
- `logError('rephrase', new Error(reason))` gives the core logger the signature it expects, with reason only.
- Dead imports/fields (`endpointRules`, `state.label`, `retry` parameter) are removed.

## Tests

Unit: stalled response body → `timeout`; empty model → `modelId`; bare 404 → `notFound`; over-long request → `limits`; label + quotes stripped.
E2E: modal guard, focusable retry button focused on failure, Tab stays inside, Simple NEO mid-window stops requests and refuses replacement.
