# Design

## Layout

The modal is a flex column inside a fixed, page-covering backdrop:

```
title
quote (one line, ellipsis)
Search [____________]
[ item list            ]   flex: 1 1 auto; min-height: 9rem; max-height: 40vh; overflow-y: auto
[ + New item ]             small text button
[ Name ][ Category ]       only when revealed; two compact columns
Amount [ -50 ]             one row, label beside field, field 9rem
[ Cancel ][ Save ]         right-aligned, always visible
```

`width: min(34rem, calc(100vw - 2.5rem))`, `max-height: min(84vh, 48rem)`. The modal itself scrolls only if the page is very short; normally the list absorbs the stretch, so Save/Cancel never leave the screen.

## Amount field

`inputmode="numeric"` plus an `input` filter: keep digits, allow a single leading `+` or `-`, drop everything else, put the caret at the end. `parseAmount` still understands legacy decimals from stored ledgers; the field just does not invite them.

## New item

A `modal.newItem` boolean; the toggle reveals the two inputs and focuses Name. Choosing an existing item leaves them alone (they are ignored on save). Nothing is written until Save.

## State

The reveal flag lives in modal state only; reopening the modal starts closed, so the list is never pushed down by fields the writer did not ask for.
