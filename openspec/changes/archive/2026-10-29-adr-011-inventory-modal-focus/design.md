# Design

## Surface: the dialog is a core `.modal`

The card becomes `class="modal neo-inv-modal"`. Core `.modal` supplies `background: var(--bg-soft)`, border, radius, `body.light` text colour and the `--ui-zoom` ceiling (`styles.css:566,1687`); `neo-inv-modal` overrides only what the ledger needs: width `min(34rem, 100vw − 2.5rem)`, `padding: 14px 16px`, `display: flex`, a gap, and its own max-height. Fields use `background: var(--bg); color: inherit; border: 1px solid var(--rule)` so they flip with the theme. The backdrop keeps only `z-index: 9000` and the dim tint; placement comes from core `.modal-backdrop`.

## State: one modal object, one projection

```
modal = { phrase, anchor, query, itemId, name, category, amount, newItem,
          error, focusSelector, scrollTop }
```

- `renderModal` projects the object: builds the card, creates/updates the error line, restores `list.scrollTop`, then focuses `modal.focusSelector` if set (else the search on first open).
- Every handler sets state and either re-renders (`toggle`, `failModal`) or paints only what changed (`amount`, pick, search) so the caret never jumps.
- `failModal(text, field)` stores `scrollTop` from the live list and `focusSelector = field || '.neo-inv-save'`; nothing can leave focus on `<body>` while the dialog is open, so the Tab trap always applies.
- Pick toggles the row in place and clears the error node through the same `clearError()` used by search/name/category/toggle.

## Picked row

`fillItems` always includes the picked item, first, even when it does not match the query, marked `is-picked`. Saving is therefore WYSIWYG.

## Amount

`inventory-ledger.parseAmountInput(text)` is the single input contract:

- accepts digits with at most one leading `+`/`-`;
- refuses a separator, a second sign, or a sign after the first character, returning `{ ok: false }`;
- returns the cleaned text, never a number (the value is parsed once at save by `parseAmount`).

The field sets its value to the parsed text when it differs and calls `showError('Use whole numbers only.')` on refusal, keeping the previous value. The stored-decimal reader (`parseAmount`) is unchanged for older ledgers.

## List height

`min-height: 9rem` on `.neo-inv-items` restores the design's floor; the list still stretches when the card has spare height from a long list. A narrow-window media query stacks the new-item fields.

## Tests

- Amount: set `7`, then `1,5` and `5-3`; both keep `7` and show the message; a valid `-50` still stores −50.
- Focus: collapsing new-item fields leaves focus on the toggle; a failed Save focuses the field named; Tab from the last control wraps to the first inside the card.
- Picked row survives a search that excludes it.
- Day theme: with `body.light`, the dialog's computed colour and background differ (contrast) and `zoom` follows `--ui-zoom`; classes restored afterwards.
- Layout: the list's computed minimum height is at least 9 rem; the short-window check keeps Save visible.
