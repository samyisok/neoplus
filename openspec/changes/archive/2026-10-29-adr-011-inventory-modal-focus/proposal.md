# Proposal

## Why

The ADR-010 review found the Inventory dialog still fighting the rest of NEO. It draws its own dark surface with hardcoded colours, so in the day theme its text is `--ink` (near black) on `#202020`; it skips the core `.modal` class, losing Interface Size zoom and theme handling. Its focus, error text, and list scroll are three pieces of state mutated in different handlers, so collapsing the new-item fields or a failed Save drops focus to the page behind an `aria-modal` dialog, and an old message can outlive the action that fixed it. The amount field still has two definitions of "amount" (whole digits in the UI, decimals in the ledger), and a mid-string sign is silently merged (`5-3` → `53`).

## What Changes

- **The dialog is a NEO modal.** It carries the core `modal` class, so it inherits the app's surface, text colour, zoom, and light-theme rules; only its size, padding, and internal layout are overridden. Fields use theme tokens, not `#282828`.
- **One state for focus, error, and scroll.** Closing the new-item fields, picking an item, a failed Save, and typing all project from one place: focus goes to a named control, the message matches the state, and the list keeps its scroll.
- **A picked item stays visible.** Typing a search that excludes the picked item still shows that row (marked picked), so Save never records against something the writer cannot see.
- **One amount contract.** The ledger owns `parseAmountInput`: one leading sign and digits, separators and mid-string signs refused (the field keeps its last valid value and says why). The stored-value parser stays as it is for old ledgers.
- **The list keeps a working height** (9 rem minimum) so a short list does not collapse to one row.
- **Spec wording matches the code:** non-amount characters are refused and the previous value kept, not silently dropped.

### Out of scope

- Decimal entry in the field (stored decimals stay readable).
- New Inventory capabilities or domain refactors beyond the amount contract.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `inventory`: modal theme and zoom, focus and error projection, picked-row visibility, amount input contract, list minimum height.

## Impact

- `neo-ext/inventory.js`, `neo-ext/lib/inventory-ledger.js` (`parseAmountInput`), `neo-ext/neo-ext.css`, `neo-ext/locales/en.json`, `scripts/inventory.e2e.js`, `openspec/specs/inventory/spec.md` (via this change's delta).
- No new file, IPC, storage, or dependency.
