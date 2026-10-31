# Review — adr-014-history-tab

Planning review of the change's artifacts only (no code yet), per the fork's
"Planning review: right after propose" step. Scope: `git diff HEAD` with the
change directory intent-to-added.

## GRASP Verification — 2026-10-31

**Files changed:** 8 (proposal, specs/history, specs/thesaurus, specs/rephrase, design, tasks, README, .openspec.yaml)
**Findings:** 2

### Problems

- [x] `openspec/changes/adr-014-history-tab/specs/history/spec.md` — Low cohesion: one module was to own both the recorder and the pane view, though the tools record with no tab open. Split the recorder (`history-record.js`) from the view (`history.js`) and name both in `design.md` D8/D10 and `tasks.md` 3.2–3.3.
- [x] `openspec/changes/adr-014-history-tab/specs/history/spec.md` — Behavior claimed by two capabilities: the History delta restated when Thesaurus and Rephrase record (profile labels, capitalisation, moved text), which their own deltas own. Rewrote the requirement as the log's contract (a record is accepted only for a replacement that happened, is immutable, survives undo, and any later tool appears in the same view).

### Recommendations

- Keep tool-specific recording rules in `specs/thesaurus` and `specs/rephrase`; History owns storage, ordering, and display.
- Keep the chapter snapshot in the recorder module (through `api.js`), not in the view.

## DDD Verification — 2026-10-31

**Files changed:** 8
**Findings:** 2

### Problems

- [x] `openspec/changes/adr-014-history-tab/specs/history/spec.md` — Cross-boundary duplication: two capabilities described the same replacement event. Narrowed History to the aggregate it owns (the book's log) and left the event to the tool that raises it.
- [x] `openspec/changes/adr-014-history-tab/specs/history/spec.md` — Vocabulary drift: “log”, “record”, “entry”, and “history” were used for one thing. The spec now says **history** for the stored whole and **entry** for one recorded replacement throughout.

### Recommendations

- Chapter, book, notes page, and footnote keep their NEO meanings; no storage, IPC, or field names appear in requirements (they live in `design.md`).
- Two devices merge by entry identity, never last-write-wins, matching the inventory ledger's rule.

## Artifact review — pass 2 (requested)

Second pass over the whole change against the code it plans to touch, after the
planning verifiers. Eleven findings, all fixed in the artifacts.

### Problems

- [x] `specs/history/spec.md` — no rule for a book that has nothing recorded, though R1 only covered "no book open". Added the empty-history bullet and scenario.
- [x] `specs/history/spec.md` — nothing stopped the previous book's rows from showing while the next book's history loads. Added the loading rule and scenario; `design.md` D9 now says the view shows a loading state, never the old rows.
- [x] `specs/history/spec.md` — a replacement made while the tab is open had no stated behaviour, though D8 refreshed the view. Added the bullet and scenario.
- [x] `specs/history/spec.md` — "unreadable is reported and never overwritten" contradicted D5's `.bak` fallback. R5 now says an earlier good copy may be shown under the warning, and the scenario says so.
- [x] `design.md` D5 — the "shortened" mark was required by the spec but had no stored field or rendering rule. Added `shortened: 'from' | 'to'`, truncated by the main process.
- [x] `design.md` D6 — the recorder was to read six core bindings (`currentChapter`, `chapterOrder`, `chapterTitle`, `chapterNameOf`) directly, which is both an Information Expert problem and a coupling spike. Moved to one new `api.chapterSnapshot()` in the adapter, and stated that the stored title is the writer's own or empty, so “Chapter 3 · Chapter 3” cannot happen.
- [x] `design.md` D9 — the spec asks for the writer's own date and time format; the design never said how. Added `toLocaleString` over the stored `at`, formatted at render, never recomputed.
- [x] `design.md` D7 — the view could adopt the wrong book's store if the writer switched books while a record was in flight, and `record`'s rejection contract was unstated. Added the captured book id guard and “resolves to a boolean, never rejects”.
- [x] `design.md` Risks — “History” could be mistaken for Snapshots, which do restore words. Added the distinction and the read-only note in the tab.
- [x] `tasks.md` 5.1 — the end-to-end test would have needed the writer's live local model. Changed to a loopback stub server, as `scripts/rephrase.e2e.js` already uses.
- [x] `tasks.md` 3.x — no red test for the new adapter helper, the loading state, the live row, the localized date, or the shortened mark. Added 3.1 and widened 3.2–3.3.

### Checked and accepted

- Backups already copy every file in a `book-*` folder (`walk` in `backup-worker.js`), so the new sidecar needs no backup rule; `book:delete` trashes the folder, so the file leaves with it.
- `NeoRecords.registerView` supplies the tab strip, Show More Features gating, the Manuscript/Notes restriction, and the flush-before-hide rules (`allowedTab`, `applyTabs`, `setView` in `neo-ext/records.js`), so History adds no core seam.
- A refusal never toasts: deliberate, and consistent with “nothing interrupts a writer mid-sentence”.
- Growth is bounded by 10,000 entries and 4 MB, refused rather than trimmed, so no recorded entry is deleted to make room.
- `records.js` merges by id; `history` reuses the rule, and an append-only log with no deletes needs no tombstones.

## Verdict

No blocker remains after the artifact edits above. Both findings were fixed in
the planning artifacts before implementation, so apply starts from the reviewed
design.

Later gates (implementation diff): `grasp-verify`, `ddd-verify`, `ts-cop`,
`code-reviewer`, `security-reviewer` — recorded in `tasks.md` 5.3 when the code
exists.

## DDD Verification — 2026-10-31 (implemented diff)

**Scope:** `git diff HEAD` + the four new `neo-ext/history*` modules · **Files changed:** 29 · **Findings:** 0

No DDD violations detected. Checked:

- **Layers:** `neo-ext/lib/history-log.js` is pure (no DOM, no filesystem, no IPC); `neo-ext/history-main.js` is the file adapter; `neo-ext/history.js` is presentation. No persistence knowledge reaches the domain module, and no renderer code names a path.
- **Aggregates:** an entry references the chapter by `chapterId` only, never a chapter object; History never calls Inventory, Records, or the manuscript, and no feature reaches into the history's internals.
- **Ubiquitous language:** book, chapter, entry, history, tool, shortened — the same words the spec uses. Storage fields stay in `design.md` and the file module.
- **Size:** every new module is under 350 lines (223 max); no god object.
- **Note (advisory, not a finding):** the domain speaks `count`/`entry` while the IPC boundary answers `large`/`invalid`. That translation is deliberate and single-sited in `history-main.js`.

## GRASP Verification — 2026-10-31 (implemented diff)

**Scope:** `git diff HEAD` + the four new `neo-ext/history*` modules · **Files changed:** 29 · **Findings:** 0

No GRASP violations detected. Checked:

- **Information Expert:** `api.chapterSnapshot()` (the adapter that owns the book bindings) produces the chapter snapshot; the recorder owns the guard; the main process owns entry identity (`id`, `at`); the view owns only display.
- **Creator:** entries are created where their identity data lives (main), from meaning supplied by the renderer.
- **Low cohesion / high coupling:** recorder, file, and view are separate modules with 4–5 direct dependencies each; the established `init(deps, ipcMain)` pattern keeps transport wiring out of the domain code.
- **Protected variations:** the preload bridge is the only volatile edge; the renderer reads it per call.
- **Missing polymorphism:** `toolLabel` was an if-chain over two tools; replaced with a `TOOL_LABELS` map so a later tool falls back to its slug without editing a branch.
- **Indirection:** `NeoHistory.record` and `NeoHistoryView.refresh` are the seams between tools and the view; neither names the other's internals.

**Advisory left open:** `history-main.js` and `inventory-main.js` repeat `cleanBookId`, `fileOf`, `readOne`, and the iCloud wait. Extracting `lib/book-file.js` is a separate change: their failure vocabularies and backup rules differ, and both are proven.

## ts-cop — 2026-10-31 (implemented diff)

**Findings:** no blockers; six should-fix, all fixed; seven advisories, five fixed.

Fixed: `logError(source, err)` call shape; the backup is now copied to `.bak.tmp` and renamed (a failed copy keeps the previous backup and is logged); `at` and `chapterNumber` accept numbers only, not `true`/`'3'`/`[]`; `load` is started through a wrapper that catches, so a throw cannot leave the pane on "Reading…"; the unused `sizeOf` was deleted and the size test now measures through `records-file`; Inventory's recovery reads its backup with `lstat` + `isFile`.

Also fixed from the advisories: the dead `hide` hook removed, the unused `requestDownload` wiring dropped, the bridge read per call, the stale header comment corrected, unused exports dropped, the loading-state test now asserts the empty state after release, and the e2e's history reader fails on a corrupt file instead of reading it as empty.

Left open: extracting the shared book-file plumbing (above).
