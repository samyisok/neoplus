# Proposal

## Why

The review of ADR-008 found four ways Inventory can lose or wrongly change a writer's ledger: a chapter the app cannot read looks like an empty one, a pending transaction can be dropped when the book changes, a two-device merge can write a file Inventory itself refuses to read, and turning Show More Features off stops the view but not the reconcile-and-write work behind it. The same review found smaller breaks: the modal sits under the pane, a fold outlives the view, typing rescans the whole book, and a selection in a placeholder records an anchor the reconciler can never match.

## What Changes

- **An unreadable chapter stops retirement.** A chapter whose file is a cloud placeholder or cannot be read is reported as unreadable; while any chapter of the book is unreadable, no transaction is retired or moved. The pane says the balances wait for that chapter.
- **The ledger follows the book.** A pending save belongs to the book it was recorded in: switching books writes it first, and a save can never land in another book or a chapter no longer in the book.
- **A merge never writes an unreadable file.** The merged ledger is checked against the same limits the reader applies; a merge that would exceed them is refused with the words still on screen.
- **Simple NEO means untouched.** With the switch off, Inventory neither reconciles nor writes; hiding it flushes only a save already in flight and then stops.
- **The modal is on top.** It covers the page above the panes and other dialogs, carries the app's dialog marker, and Esc cancels a pending **Remove this transaction?**.
- **Smaller corrections.** A placeholder paragraph offers no Inventory item; a transaction whose chapter is no longer in the book says so instead of vanishing; folds reset when the view is reopened; scrolling to another chapter updates the balances; typing re-reads only the typed chapter; the jump is offered only when the phrase can be found; the modal names too-long and not-a-number amounts apart.

### Out of scope

- New Inventory features (item rename/delete, currency, formulas).
- Changing how transactions merge beyond the limit check.
- Inventing a transaction without a selection.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `inventory`: unreadable chapters, book-scoped pending saves, merge limits, Simple NEO, modal layering and focus, fold lifetime, chapter-change rendering, ghost selections, jump availability, and amount messages.

## Impact

- `neo-ext/inventory.js`, `neo-ext/inventory-main.js` (unreadable-chapter query, merge limit), `neo-ext/lib/inventory-ledger.js` (one limit check), `neo-ext/lib/inventory-anchor.js` (deferral input), `neo-ext/api.js` (chapter/body/text primitives, unreadable set), `preload.js` (read-only unreadable query), `neo-ext/records.js` (hide flush semantics), `neo-ext/neo-ext.css` (layer), `neo-ext/word-context.js` (ghost gate, one pending context), `neo-ext/locales/en.json`.
- Tests: `scripts/inventory*.test.js`, `scripts/inventory.e2e.js`.
- No new seam beyond the fork's existing scripts, no new library file, no dependency.
