# Proposal

## Why

The Inventory modal was built for one short test transaction. With real use it is cramped: the name and category fields take as much room as the whole item list, a book with many items leaves the list a few pixels tall, the amount field accepts any text, and the window is too small for its contents. Recording a purchase should not feel like filling a tax form in a matchbox.

## What Changes

- **A bigger, roomier window.** The modal is wider and taller, scrolls internally instead of clipping, and gives the item list the flexible space: the list grows with the window and scrolls on its own.
- **New-item fields out of the way.** Creating an item is a small **+ New item** toggle; the name and category fields appear only when asked for, side by side and compact, so an existing-item list is never squeezed by empty inputs.
- **An amount field that takes numbers.** It accepts one leading sign and digits only (`+200`, `-50`, `0`); pasted letters, spaces, and second signs are dropped as they are typed.
- **A calmer arrangement.** The quote sits under the title, the search and item list form one block, the amount is one compact row, and Save/Cancel stay at the bottom, reachable without scrolling the page.

### Out of scope

- Changing how transactions are stored, balanced, anchored, or merged.
- Decimal amounts (the field is sign + digits; stored ledgers with decimals stay readable).
- Item editing or deletion.

## Capabilities

### New Capabilities

<!-- None. -->

### Modified Capabilities

- `inventory`: the recording modal's size, layout, item list space, new-item reveal, and amount input.

## Impact

- `neo-ext/inventory.js` (modal render, amount filtering, new-item toggle state), `neo-ext/neo-ext.css` (modal layout), `neo-ext/locales/en.json` (two strings), `scripts/inventory.e2e.js` (layout and input tests).
- No new file, IPC, storage, or dependency.
