# Planning Review

Scope: `openspec/changes/adr-005-records-tab/` — proposal, `story-records` delta, `backup` delta, design, tasks. Reviewed before any code, as the fork's flow requires.

## GRASP

- **Ownership.** One capability, `story-records`, owns the Records view, its store, merge rules, search, and backup coverage. `backup` owns only what a backup contains. The module does not claim notes behaviour.
- **Information Expert.** Pure `records-store` owns validation/merge; `records-search` owns matching/ranges; `records.js` owns DOM and lifecycle; `records-main.js` owns the file boundary; CSS owns highlight paint. The main process, not the renderer, merges on write, because it is the only place that sees the disk immediately before the rename.
- **Protected Variations.** The file boundary is one fixed name through `libName`/`libraryDir`, the backup allowlist is one marked seam, and the notes DOM is injected with `hidden`/class rules rather than a new HTML seam.
- **Coupling.** The view uses core `window.neo` only through the fork bridge. It does not reach into `chapterHTML`, `book`, or notes internals.
- **Cohesion.** The DOM module has one job (the Notes → Records view); the store module has one job (the data); the search module has one job (plain-text matching).
- **No god change.** The feature is one capability plus a small backup modification.

## DDD

- **Ubiquitous language.** record, folder, Unsorted, All records, Notes, show more features, library, book, backup. No new term for a core concept.
- **Boundary.** Records are library-wide; the book and chapter aggregates are untouched. The store is outside `book.json`, `library.json`, and chapters.
- **Observable requirements.** Specs describe what the writer does and sees; `records.json`, merge stamps, `whenLocal`, and `hidden` are design details.
- **Storage does not leak into the spec** beyond the file that must be backed up and the guarantee that it is not a book file.

## Review rounds

### First pass

A reviewer checked the plan against the actual core code and found three blockers and eleven majors. All were fixed:

- **Hidden vs class:** notes elements are now toggled with `hidden` so core `focusPage` cannot land in a class-hidden editor; the strip uses `div[role=tab]`, and `records-tab` is scoped to `notes-tab`.
- **Esc left the book:** Esc is handled on `#editor-view` while Records is set, with `stopPropagation`.
- **View persistence contradicted the spec:** Notes is always the opening view; no per-device record tab.
- **Renderer-side merge could erase a record:** write now re-reads and merges in the main process before rename, and returns the merged store.
- **The iCloud wait used a synchronous stat:** the seam-7 `init` gains core's `whenLocal`; only the pre-write placeholder check uses the sync helper.
- **Leaving Notes had no hook and could leak the class:** observer on `#editor-view` with a scoped CSS guard; flush on blur/visibility.
- **Core refocused the hidden notes editor:** hidden-based, and the records view owns focus when active.
- **A 4 MB refusal was silent:** the text stays, a persistent line explains it, description/title caps are stated, and the merged size is checked.
- **Backups omitted `.bak`:** allowlist is `startsWith('records.json')` and excludes `.tmp`; manual backup copies both files.
- **`copyBookDir` extra-file rules:** same cloud budget, retry, skipped list, before rename, no overwrite.
- **A debounced save could move the caret:** a focused row is never rebuilt by its own save; 600 ms is stated against the notes' 800 ms.

### Second pass

The same reviewer re-checked the fixes and found six follow-ups; all fixed:

- `.tmp` is explicitly excluded from the backup allowlist.
- Esc from the folders list is covered by the editor-view handler and an e2e case.
- The proposal names `records-store.js`, not a module that is never created.
- Cmd+F is documented as still searching the notes page; Records has its own field, and the test no longer claims the wrong behavior.
- The 4 MB cap applies after the merge, not only to the payload.
- An unreadable file keeps edits in memory and on screen; nothing is written until it reads.

## Accepted limitations

- Accent-insensitive search is not offered; “Jose” does not find “José”.
- Cmd/Ctrl+F while Records is open searches the hidden notes page; the records field is the records search.
- Device clocks decide which field is newer; tombstones make deletion final.
- No per-book pinning; folders are the grouping tool.
- Pocket does not show Records; the desktop's daily backup still carries the file.


### Third pass

A fresh reviewer checked the plan without the earlier context and found two blockers and four majors. All fixed:

- **Redo cannot be preserved:** any `input` empties NEO's redo stack, so the spec and task now require the structural undo stack and the book's bytes to be unchanged, and say explicitly that typing in a record empties redo like typing anywhere else.
- **The `focusPage` claim was false:** `:not([hidden] *)` does not exclude a hidden element itself. While Records is active `#aux-editor.contentEditable` is set to `false`, an observer keeps core's async notes load from setting it back to `true`, and the plan claims nothing new about F6 in Records.
- **Core's durable write was being re-invented:** the seam-7 `init` now also receives core's `writeFileDurable`, including its Windows/sync-client retry, instead of a hand-rolled tmp/rename.
- **`book.json` baseline:** core writes `book.lastPosition` when the tab changes, so the e2e baseline is taken after Records is open and only the records actions are compared.
- **Future clock skew:** edit stamps are clamped on read/write to `[0, now + 60 s]`, so one bad clock cannot lock a field forever; a scenario and a store test cover it.
- **Missing script wiring:** task 3.2 now adds the three script tags to the existing seam-1 block and their names to `check-seams.js`, so `records.js` actually loads and the seam check keeps covering it.

No blockers remain.

### Fourth pass

The re-check found one more way the contenteditable observer could reopen core's load window: restoring `true` before core's async notes load finishes would let text be typed into a page core then replaces. The plan now restores it only after `dataset.book`/`dataset.kind` are set, and the observer compares before writing and carries an own-write flag so same-value attribute writes cannot loop. `#notes-side` staying visible was checked against `renderNotesSide`/`copyToNotes` and is consistent.

## Verdict

No blockers remain. The change is one new capability plus a backup delta, one upstream seam, no dependency, and no book storage. Proceed to `/opsx-apply` when ready.

## GRASP Verification — 2026-10-26

**Scope:** `git diff HEAD`
**Files changed:** 23
**Findings:** 6

### Problems

- [ ] `neo-ext/records.js:1` — Low cohesion: one 768-line module owns tabs, list, folders, search, save queue, lifecycle, and domain mutations. Split the pane view, tab controller, and save/store client.
- [ ] `neo-ext/records.js:550` — Information Expert violation: the UI stamps `deletedAt`, moves records on folder deletion (`:588`), renames folders (`:572`), and changes folder/title/body stamps. These invariants belong to `records-store.js`.
- [ ] `neo-ext/records.js:612` — High coupling to core notes internals: `#aux-title`, `#aux-editor`, `#notes-nav`, `#editor-view` classes and hidden/contentEditable workarounds. The clarified feature belongs in `#side-pane`; this coupling would disappear.
- [ ] `neo-ext/records.js:126` — Dead information: `recordTitle()` is unused and `openRows` can be `const`; both are lint errors, evidence the controller is unfinished.
- [ ] `neo-ext/records.js:699` — Missing polymorphism/controller: ArrowRight on Records focuses the Notes tab while leaving Records selected; Left/Right/Home/End need one tablist function.
- [ ] `neo-ext/lib/records-store.js:179` — Protected variation: `merge` silently returns an empty store for an invalid side, hiding a data-loss path from the caller. Return a result the adapter can refuse.

### Recommendations

- Move record/folder mutations and their invariants into the store module; the view calls them.
- Split `records.js` before extending it, and re-home the UI in the right pane.
- Replace the duplicated active/folder helpers in the view with the store's exported lists.
- Make invalid merges explicit failures; keep the disk untouched as `records-main.js` already does.

## DDD Verification — 2026-10-26

**Scope:** `git diff HEAD`
**Files changed:** 23
**Findings:** 4

### Problems

- [ ] `neo-ext/records.js:550` — Domain logic in the presentation layer: delete tombstone, folder deletion moving records, duplicate-folder policy, and field timestamps live in the view (`:550`, `:560`, `:572`, `:588`). Move them into the record aggregate/store.
- [ ] `neo-ext/records.js:1` — God class: 768 lines with several bounded responsibilities; split by pane view, tab/session controller, and store adapter.
- [ ] `neo-ext/records.js:126` — Missing ubiquitous language: `activeRecord`, `activeFolder`, and `folderOf` duplicate `activeRecords`/`activeFolders` from the store with slightly different semantics (unknown folder → Unsorted). One vocabulary, one implementation.
- [ ] `neo-ext/records.js:612` — Boundary violation: the Records capability is modelled as a Notes-page view even though the clarified UI belongs to the right-hand pane. The code hides and rewrites another view's DOM instead of owning its own pane surface.
- [ ] `neo-ext/lib/records-store.js:179` — Aggregate failure hides: an invalid merge returns an empty aggregate, which downstream cannot distinguish from a genuinely empty library. Return success/failure, never silent loss.

### Recommendations

- Model `addRecord`, `deleteRecord`, `renameFolder`, `deleteFolder`, `moveRecord`, and `touchField` on the store; keep the view a renderer of returned state.
- Re-home the feature in `#side-pane`; leave the Notes page, left nav, and aux editor untouched.
- Keep merge failure explicit and surface it through `records-main.js`.
- Split the view module before the right-pane rewrite so the new UI starts under 350 lines.

## Code-review notes — 2026-10-26

- `npm test`: 452 pass.
- `npm run test:records`: 9/12. Search empty-state, selection preservation, and the Simple NEO toggle still fail; the e2e targets the wrong Notes-page layout and will be rewritten with it.
- `npx oxlint neo-ext/`: 2 errors in `records.js` (`recordTitle` unused, `openRows` const), reported above.
- The working tree also contains the uncommitted UI for the rejected Notes-page layout. Do not commit it; `/opsx-update` must re-home the plan in the right pane before `/opsx-apply` continues.

## Resolutions after the GRASP/DDD and security reviews — 2026-10-27

- **Right pane.** The UI was rebuilt in `#side-pane`; `records.js` owns tabs/lifecycle/save, `records-list.js` owns groups/rows/search. `#aux-paper`, `#notes-nav`, and the bottom tabs are untouched (D1).
- **Domain ownership.** `records-store.js` now owns `addRecord`, `deleteRecord`, `renameRecord`, `setBody`, `moveRecord`, `addFolder`, `renameFolder`, `deleteFolder`, with duplicate-name/tombstone/folder-move invariants; the view calls them.
- **Merge failure.** `merge` returns `{ok,store}` or `{ok:false,reason}`; `records-main` refuses the write instead of emptying the aggregate. Unit and IPC tests cover it.
- **Save race.** A response is always merged into the page, never substituted; edits made during a save cannot vanish. Retry flushes local edits instead of re-reading over them; `loadStore` refuses while a write is pending or local changes are unsaved.
- **Draft path.** A draft shows in Unsorted/folder even when the group is empty, folded, or a search is active; `+ Record` clears the query.
- **Esc & F6.** Esc is scoped to the pane and ignores open modals; F6/⌃Tab focuses the records search. Window capture prevents core's shelf handler.
- **Pending adopt.** A stale post-save snapshot is cleared on any new edit/failure and adopted on body focusout, not only window blur.
- **i18n.** `records-list.js` routes every writer-visible string through `NeoExt.x`; locale keys added.
- **Security:** read refuses a file over 4 MB before `JSON.parse`; normalize caps items at 20,000 before sorting; the daily backup worker skips a symlinked `records.json` and names it.

### Verification

- `npm test` — 461 pass.
- `npm run test:records` — 14 pass.
- `npm run test:notes` — 14 pass.
- `npx oxlint neo-ext/` clean; seams pass; `openspec validate --strict` passes.
- No blockers from the re-review remain.

### Manual check

A dev launch (throwaway library) added “John Silver” under “The Silver Series”, wrote three description lines, and captured the pane: tabs, search, buttons, folder heading, one-line title, expanded plain text, and folder select all read correctly at the 250 px pane width. No screenshot of a real library is stored in the repo.

### Right-pane polish — 2026-10-27

- The records toolbar's sticky background covered the ADR-004 resize line at the search row. The grip's stacking order was raised above the toolbar, and an e2e hit test at the pane's left edge over the search now proves the grip wins.
- The Notes | Records tabs were below the pane title ("From this chapter" on the Notes tab). They are now the pane's first child, above the title block and pin; e2e asserts the strip's bottom is above `#side-head`'s top.

### Bin on the right — 2026-10-27

The record delete control moved from a leading minus to a bin icon at the right end of the row (folder heads use the same bin). Its accessible name, inline confirmation, Esc, and e2e `minus()` selectors are unchanged; only the affordance moved.

### Folder count position — 2026-10-27

The folder count sat between the name and the hover-revealed +/bin, so when those controls were hidden it looked stranded mid-row. The count is now the last item in the folder header, right of the controls; hidden controls no longer push it inward. E2E checks the count is the head's last element.

### Title indent — 2026-10-27

A record's title started against its 2 px left rule while the description was indented, so the two did not share a text edge. The title button now carries 32 px of left padding; its text lines up with the description text at every pane width. The bin keeps the right edge.

### Title and description gaps — 2026-10-27

The first alignment pass put the title flush with the description text (32 px from the row edge), which read too far from its rule and left the description's own rule only a few pixels from its text. The title now sits 10 px inside the record's border and the description 9 px inside its own rule: both have a quiet gap, without pretending they share one left edge.
