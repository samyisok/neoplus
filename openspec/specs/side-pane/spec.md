# side-pane Specification

## Purpose

Gives the writer control over how much room the right-hand pane takes, on this device and at this window size, so its notes, cards, snapshots, and future tabs stay readable without stealing more of the page than the writer wants.

## Requirements

### Requirement: Resizing the right-hand pane

The system SHALL let the writer change the width of the right-hand pane from its left edge, with a pointer or the keyboard, on every tab that shows that pane.

- The resize control SHALL resize the pane on every tab that shows it: the manuscript's notes, the Notes tab's chapter notes, the Outline's loose cards, and the Darlings tab's snapshots.
- Dragging SHALL set the width as the pointer moves, rounded to a whole pixel, without waiting for the drag to end.
- The width SHALL be at least 220 px and at most the smallest of 840 px, 67.5% of the window's width at the current interface size, and the room that leaves a pinned page fully visible; the 220 px minimum SHALL win when those limits leave less than that. A drag past any limit SHALL stop at it and SHALL NOT be remembered beyond it.
- When the pane is pinned beside the page, or held open by the Darlings tab, the pane SHALL also stop at the width that still leaves the page column fully visible beside any pinned left pane. The 220 px minimum SHALL still be available when the window cannot hold both.
- While the writer drags the edge, the pane SHALL stay open, even when the pointer leaves it.
- When the window becomes too narrow for the chosen width, the pane SHALL clamp to the current maximum without discarding the chosen width; when the window widens again, the chosen width SHALL return, up to the current maximum.
- A resize that changes the visible width while the width is clamped (a drag or a keyboard step) SHALL become the new chosen width. A gesture that cannot change the visible width SHALL NOT change the chosen width, and merely narrowing or widening the window SHALL NOT change it.
- The resize control SHALL be reachable by keyboard and SHALL respond to Left Arrow by widening and Right Arrow by narrowing, by 16 px normally and 64 px with Shift; Home SHALL set the minimum, End the maximum, and a double-click SHALL restore 250 px.
- The chosen width SHALL be remembered on this device across launches, and SHALL NOT be written to the book, the library, or any chapter.
- With no remembered width, and after a reset, the pane SHALL be 250 px.
- While Show More Features is off, the pane SHALL stay 250 px and the resize control SHALL NOT be shown; a width remembered from before SHALL be kept for when more features return.
- Opening, closing, hovering, pinning, dropping onto, and focusing inside the pane SHALL behave as they do without this change.

#### Scenario: Drag the pane wider

- **WHEN** the writer presses the pane's left edge, drags 120 px to the left, and releases
- **THEN** the pane is about 370 px wide and the page has reflowed around it if it is pinned

#### Scenario: Drag past the limits

- **WHEN** the writer drags the edge far past the left or right limit
- **THEN** the pane stops at 220 px, or at the smallest of 840 px, 67.5% of the window, and the room the page leaves, and does not grow or shrink further

#### Scenario: A narrow window

- **WHEN** the writer has chosen 840 px and the window is narrowed until 67.5% is 360 px
- **THEN** the pane is 360 px wide, and it returns to 840 px when the window widens again

#### Scenario: Resizing while clamped

- **WHEN** the pane is clamped to 360 px by a narrow window and the writer drags it 20 px narrower
- **THEN** 340 px becomes the new chosen width, and widening the window keeps it there

#### Scenario: A step the clamp absorbs

- **WHEN** the pane is clamped to 360 px with 840 px chosen and the writer presses Left Arrow to widen it
- **THEN** the pane stays at 360 px, and widening the window still restores 840 px

#### Scenario: Both panes pinned

- **WHEN** both panes are pinned on a window where a wider pane would cover the page
- **THEN** the pane stops at the last width that leaves the page fully visible, and the page does not move under it

#### Scenario: Dragging outside the pane

- **WHEN** the writer presses the edge and drags the pointer far to the left, outside the pane
- **THEN** the pane stays open while the drag lasts and takes the width the pointer asks for

#### Scenario: Keyboard resize

- **WHEN** the resize control has keyboard focus and the writer presses Left Arrow, Shift+Right Arrow, End, and Home in turn
- **THEN** the pane widens by 16 px, narrows by 64 px, goes to the maximum, and goes to the minimum

#### Scenario: Reset the width

- **WHEN** the writer double-clicks the resize control
- **THEN** the pane returns to 250 px

#### Scenario: Remembered after a restart

- **WHEN** the writer sets the pane to 400 px, quits NEO, and opens it again
- **THEN** the pane opens at 400 px

#### Scenario: Simple NEO

- **WHEN** Show More Features is off
- **THEN** no resize control appears and the pane is 250 px wide, even if a wider pane was chosen before

#### Scenario: One width for every tab

- **WHEN** the writer resizes the pane during the manuscript, then opens the Notes tab, the Outline, and Darlings
- **THEN** the pane keeps that width on each tab

### Requirement: The page keeps clear of the pane

The system SHALL keep the manuscript and the Outline's cards clear of the right-hand pane at whatever width the writer chooses.

- When the pane is pinned, the page column SHALL move so that it stays centred in the room the pane leaves, at every interface size.
- When the Darlings tab holds the pane open for snapshots, the page SHALL move the same way.
- When the Outline fills the space between pinned panes with cards, the cards' area SHALL end at the pane's edge.
- With both panes pinned, the page SHALL be centred in the room that remains.
- While the pane is open on a tab that does not hold it open and is not pinned, it SHALL remain an overlay and SHALL NOT move the page, exactly as before.
- While the room exists for the page and both panes, resizing SHALL NOT cover the page or clip it. When the window is too small for a 220 px pane beside the page, the pane MAY cover the page's edge, as the fixed 250 px pane already can.

#### Scenario: Pinned pane grows

- **WHEN** the left pane is not pinned, the right pane is pinned at 250 px, and the writer widens it to 400 px on a window with room for that
- **THEN** the page column moves left by 75 px and remains fully visible beside the pane

#### Scenario: Outline cards

- **WHEN** the pane is pinned on the Outline and the writer widens it
- **THEN** the cards' area narrows to end at the pane's edge, and no card is hidden behind it

#### Scenario: Enlarged interface

- **WHEN** the interface size is above 100% and the pane's width changes
- **THEN** the page still clears the pane at that size

#### Scenario: Unpinned pane

- **WHEN** the pane is open but not pinned and the writer widens it
- **THEN** the page does not move, and the wider pane overlays it as before

### Requirement: A quiet, accessible resize control

The system SHALL present the resize control without interrupting the writer, and SHALL make it usable without a pointer.

- The control SHALL be invisible while the pane is neither hovered nor focused, and SHALL show a thin edge and a resize cursor while it is hovered, focused, or being dragged.
- The resize control SHALL take keyboard focus even while the pane is closed, and reaching it by keyboard SHALL open the pane.
- Assistive technology SHALL read it as a vertical separator with an accessible name, and with its minimum, maximum, and current width.
- Resizing SHALL NOT open a dialog, show a toast, add a menu item, or write text anywhere on the page.
- The control SHALL NOT appear in Simple NEO or in Pocket.

#### Scenario: Hover the edge

- **WHEN** the pointer moves onto the pane's left edge
- **THEN** the resize cursor and a thin line appear, and nothing else changes

#### Scenario: Keyboard focus

- **WHEN** the writer tabs to the resize control while the pane is closed
- **THEN** the pane opens, the control shows its focus, and the arrow keys resize it

#### Scenario: Screen reader

- **WHEN** the resize control receives focus with a screen reader
- **THEN** it is announced as a vertical separator between 220 and the current maximum, at the current width

#### Scenario: No interruption

- **WHEN** the writer resizes the pane by any means
- **THEN** no dialog, toast, or menu appears

### Requirement: Resizing leaves the book untouched

Resizing the pane SHALL NOT change the manuscript or anything NEO saves.

- No chapter, `book.json`, `library.json`, notes page, sidecar, or snapshot SHALL be written because the width changed.
- A pointer resize SHALL NOT move focus out of the editor, and SHALL leave the caret, the selection, the page's scroll position, the save state, and the undo and redo history unchanged.
- A keyboard resize SHALL NOT change text, the caret, the selection, the save state, or the undo and redo history; only the focus needed to reach the control moves, which is NEO's ordinary focus behaviour.
- The resize SHALL NOT send an IPC message or make a network request.
- The page's own width, interface size, and page theme SHALL be unchanged.

#### Scenario: Drag while writing

- **WHEN** the writer has unsaved words on the page, a selection, and undo history, then drags the pane edge
- **THEN** focus stays in the editor, and the words, selection, save state, and undo history are exactly as they were

#### Scenario: No files written

- **WHEN** the writer drags the pane edge on a book with nothing unsaved, then waits past NEO's save delay
- **THEN** no chapter or library file's modification time changed because of the resize

#### Scenario: Another device

- **WHEN** the writer resizes the pane on one device and opens the same library on another
- **THEN** the other device's pane width is unchanged
