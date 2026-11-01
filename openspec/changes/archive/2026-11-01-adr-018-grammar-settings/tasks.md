# Tasks

## 1. Configuration

- [x] 1.1 `neo-ext/lib/grammar-config.js`: defaults, normalization with Rewrite fallback, prompt resolution, field caps, secret name.
- [x] 1.2 `neo-ext/lib/grammar-prompt.js`: `grammarMessages` accepts a configured system prompt; blank keeps the built-in.

## 2. Service

- [x] 2.1 `grammar-main.js` reads `settings.grammar`, snapshots endpoint/model/prompt at start.
- [x] 2.2 Grammar key: `grammar-key` first, `rephrase-key` as fallback.
- [x] 2.3 IPC `get/save/validate/test-grammar-settings`, validation on loopback rule and caps.
- [x] 2.4 `neo-ext/main.js` passes `writeSettings`; `preload.js` exposes the four methods.

## 3. Interface

- [x] 3.1 `neo-ext/grammar-settings.js`: a Grammar tab with Endpoint, Model, API key, Prompt, Test connection.
- [x] 3.2 Script loaded in `index.html`; the tab shows only with Show More Features.

## 4. Tests

- [x] 4.1 `scripts/grammar-config.test.js`: defaults, fallback, caps, prompt resolution.
- [x] 4.2 `scripts/grammar-prompt.test.js`: custom system prompt, blank keeps built-in.
- [x] 4.3 `scripts/grammar-main.test.js`: settings, prompt snapshot, key order, save/validate.
- [x] 4.4 `scripts/grammar.e2e.js`: the tab's fields, a save that writes the grammar block.
- [x] 4.5 `npm test`, `npm run test:grammar`, `npm run test:rephrase`, `node neo-ext/check-seams.js`.

## 5. Review

- [ ] 5.1 GRASP/DDD verification of the change.
- [ ] 5.2 Security review: key handling, endpoint validation, prompt injection.
