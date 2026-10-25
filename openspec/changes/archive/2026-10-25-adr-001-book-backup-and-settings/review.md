# Review — adr-001-book-backup-and-settings

## GRASP Verification — 2026-10-25

**Scope:** working tree (`git diff HEAD`, new files intent-to-added)
**Files changed:** 28
**Findings:** 5

### Problems

- [ ] `neo-ext/main.js:1-269` — Low cohesion: one module registers IPC, resolves/validates paths, runs the copy, builds the File menu, and resolves the daily folder. Split handlers, menu, and use-case into separate modules.
- [ ] `neo-ext/main.js:39-53,66-89,111-161` — Information Expert: the module that owns "how a backup is made" also re-reads and parses `book.json` for a title. Ask the book's own accessor for its metadata instead of reimplementing the parse.
- [ ] `neo-ext/main.js:1-269` — High coupling: Electron APIs (4), injected core deps (13), fork libs (4), and i18n in one file. The seam injection is the right indirection; the handler module should receive a narrower facade.
- [ ] `neo-ext/boot.js:45-61` + `neo-ext/settings.js:15,102` — Missing indirection: the renderer reads `book` and `t` directly beside the `api.js` adapter that exists for exactly this. Route both through `api.js`.
- [ ] `neo-ext/settings.js:62-164` — Missing polymorphism: a chain of `if (control.type === 'path' | 'text' | 'checkbox' | 'select')`. Use a control-type registry (`{ path: renderPath, text: renderText, … }`) so a new control is a map entry, not another branch.

### Recommendations

- Split `neo-ext/main.js` into `ipc.js` (channels), `menu.js` (template mutation), `backup.js` (use case), keeping `init()` as the composition root.
- Ask core for the book's meta (an injected `readBookMeta`/`readJSON`) instead of parsing `book.json` in the feature.
- Add `getBook()` / `translate()` to `api.js` and use them from `boot.js` and `settings.js`.
- Convert the settings control branches into a renderer map; keep `save` per group as it is now.

## DDD Verification — 2026-10-25

**Scope:** working tree (`git diff HEAD`, new files intent-to-added)
**Files changed:** 28
**Findings:** 3

### Problems

- [ ] `neo-ext/main.js:66-89` — Aggregate bypass: backup reads another aggregate's persistence file (`book.json`) directly instead of going through the book's own accessor. Reuse the core metadata read.
- [ ] `neo-ext/main.js:91-102,111-124` — Domain rules in the application layer: "one backup at a time" and destination admissibility live in the IPC module. Move policy into `lib/` (`backup-policy`/`backup-dir`) and leave the handler as orchestration.
- [ ] `neo-ext/main.js:39-53` — Ubiquitous language: `backupDir`, `checkFolder`, `probe`, `backupBookNow` describe mechanism, not the domain ("daily backup destination", "backup destination is usable"). Rename toward the spec's terms when the module is split.

No anemic entities (no entity layer), no god class (`main.js` 269, `settings.js` 255 lines, both under 350), no infrastructure import leaking into a domain module — `copy-book.js` takes `isCloudOnly`/`requestDownload` as injected capabilities, and `settings-merge.js` takes reader/writer functions, which is the right inversion.

### Recommendations

- Keep the capability-injection pattern; it is the reason this feature stays mergeable.
- After the split, let `lib/backup-dir.js` own "is this destination admissible" and `lib/copy-book.js` own "one at a time", so the IPC layer only maps requests to results.
