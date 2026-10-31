# Proposal

## Why

The review of ADR-012 found the rephrase window is sound in the happy path but weak where it matters: the 30-second timeout stops at the headers, so a stalled local server can wedge a card and its session forever; a failed card can only be retried with a mouse; Settings prints raw reason codes; the window can open over another NEO dialog; and the selection cap has two owners that can disagree. Several smaller defects follow the same pattern: one rule, two places.

## What Changes

- **The timeout covers the whole answer.** The abort covers the response body as well as the headers; a stalled body becomes a card failure and releases the session.
- **Rephrase refuses to stack.** It will not open over another NEO dialog, before or after the session starts.
- **Retry is a real control.** A failed card carries a focusable **Try again** button, and Enter on a card with text chooses it.
- **Every failure has one sentence.** Test connection and the window both use the reason table; a 404 gets its own “not found” wording instead of telling the writer to fix the host.
- **One cap owner.** The selection/reference limits live in the context module and the prompt module reads them; a request over the limit reports `limits`, not “reply too large”.
- **The key name is not in the UI.** The settings read returns the secret name; the tab writes with it.
- **Simple NEO stops the flow.** Turning Show More Features off while the window is open stops pending requests and refuses a replacement.
- **Smaller corrections.** An emptied model/endpoint is refused rather than replaced by a default; a reply labelled `Natural: “…”` loses both label and quotes; a failed settings read shows defaults, not empty fields; missing strings enter the locale file; log lines use the logger's real signature.
- **Tests** cover the stalled body, modal guard, keyboard retry, reason wording, 404, empty model, label+quotes, mid-window Simple NEO and the AI load failure.

### Out of scope

- New rephrase features, remote endpoints, or changes to the prompt/profile model.
- Rewriting the settings window into separate testable modules; that stays a recorded advisory.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `rephrase`: whole-answer timeout, modal guard, retry control, reason wording, one cap owner, Simple NEO mid-window, reply label/quote order.
- `settings`: secret name from the read, empty model/endpoint refusal, defaults on a failed read, Test wording.

## Impact

- `neo-ext/rephrase.js`, `neo-ext/rephrase-settings.js`, `neo-ext/rephrase-main.js`, `neo-ext/lib/rephrase-context.js`, `neo-ext/lib/rephrase-prompt.js`, `neo-ext/lib/rephrase-check.js`, `neo-ext/lib/rephrase-reasons.js`, `neo-ext/settings.js`, `neo-ext/neo-ext.css`, `neo-ext/locales/en.json`, `scripts/rephrase*.js`.
- No new dependency, IPC name, or file in the library.
