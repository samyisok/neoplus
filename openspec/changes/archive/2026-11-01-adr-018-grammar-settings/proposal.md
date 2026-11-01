# Proposal

## Why

Grammar borrows the Rewrite settings (`settings.rephrase`), its key, and a system
prompt compiled into the app. A writer who runs a different model for checking, or
who wants the checker to follow their own house rules, cannot change any of it: the
AI tab is labelled for rewriting, and the grammar prompt is source code.

## What Changes

- Add a **Grammar** tab in Settings with its own **Endpoint**, **Model**, **API key**,
  and **Prompt**. The values live in `settings.json` under `grammar` (`{ endpoint,
  model, prompt }`), on this device, like the Rewrite settings.
- A missing endpoint or model falls back to the Rewrite setting when it is read, so a
  writer who already configured a model is not asked twice; the tab still refuses to
  save a blank model. An empty prompt uses the prompt that ships with NEO, so the
  field can stay blank.
- The key is a separate encrypted secret, `grammar-key`. A writer who never sets one
  keeps using `rephrase-key`.
- The grammar pass snapshots endpoint, model, and prompt when the window opens, so a
  settings change mid-window does not rewrite the question already asked.
- Validation and Test connection reuse the same endpoint rules as Rewrite: http(s),
  no userinfo, loopback only, redirects refused.

## Impact

- New capability: none. It extends `grammar` with a settings surface.
- Touched: `neo-ext/lib/grammar-config.js` (normalization), `neo-ext/grammar-main.js`
  (settings, key, prompt snapshot, IPC), `neo-ext/lib/grammar-prompt.js` (system
  override), `neo-ext/grammar-settings.js` (the tab), `preload.js`, `neo-ext/main.js`,
  `index.html`.
- Not touched: the manuscript, `book.json`, `library.json`, snapshots, the model
  corpus, or Pocket.
