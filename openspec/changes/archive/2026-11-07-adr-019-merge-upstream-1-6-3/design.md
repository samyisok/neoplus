# Design

## Context

- Upstream base: `4be59b2` ("1.6.0", untagged). Upstream head: `984a217` = tag `v1.6.3`.
- The fork has 20 commits since the merge base; 7 of them are not pushed yet
  (`origin/main` is `4c492e2`), so the recent history is still ours to shape.
- 348 files differ from the base on our side; upstream changed 29. Seven overlap:
  `AGENTS.md`, `app.js`, `index.html`, `main.js`, `package.json`,
  `package-lock.json`, `preload.js`.
- 17 seams live in `app.js`, `index.html`, `main.js`, `preload.js`, `backup-worker.js`.
  `neo-ext/check-seams.js` asserts the ones that exist today.

## Decisions

### D1 — Merge, not rebase

A merge keeps upstream's commits and tag as ancestry, so the next release merges with
a smaller base and `git describe`-style reasoning still works. Rebasing 20 commits
would rewrite history we may already have published, and would replay every seam
resolution once per commit instead of once.

### D2 — A remote that cannot push

```
git remote add upstream https://github.com/hughhowey/neo
git remote set-url --push upstream DISABLED-read-only
git fetch upstream main v1.6.3
```

The push URL is deliberately invalid so a mistyped `git push upstream` fails instead
of writing to a repository we do not own. Planning already fetched the tag into
`refs/upstream/*`; the implementation uses the named remote and deletes those scratch
refs, so the repository ends with one convention instead of two.

### D3 — Conflict rule per file

Upstream's code wins; the fork re-applies its seam line or section on top. Nothing
upstream is dropped to keep a fork convenience, and no seam is deleted to end a
conflict.

| File | Upstream change | Fork keeps | Resolution |
|---|---|---|---|
| `main.js` | +340 lines: library move, iCloud folder offer, menu and startup wiring | 5 seams (`context-menu`, `buildMenu`, `whenReady` init, `dailyBackup`, preload bridge is separate) | take upstream hunks, drop our seam lines back in at their new anchors |
| `app.js` | +248: Brighter Interface out of the switch, quotes, typewriter | seams 2/3/4/10/12/13/14/15 (`switchTab`, counters, `openBook`, Look Up, `applyFonts`, `DEVICE_LOOK`) | same; re-check each anchor still exists |
| `preload.js` | +2: new IPC | `NeoForkNative` bridge block | keep our block, append upstream's two methods |
| `index.html` | +1: new script | the `neo-ext/` script list | keep both; our scripts stay last |
| `AGENTS.md` | 2 hunks: Brighter Interface no longer behind the switch, snapshot ownership, daily words | every fork section | take upstream's facts, keep the fork sections and their ordering |
| `package.json` | version `1.6.3`, new `test:script-keys` | fork scripts (`test:grammar`, `test:model`, …) | take upstream, keep the fork scripts, set `1.6.3+fork.18` until this ADR is archived (D5) |
| `package-lock.json` | version bump | — | regenerate with `npm install --package-lock-only` after the merge |

### D4 — Upstream's new library move meets the fork's settings guard

Upstream adds a "move the library" path that rewrites `settings.json`. The fork's
`settingsBroken()` guard (read-only check of `settings.json` before a save) must still
hold for it: a move must not run over an unreadable settings file either. Verified by
reading upstream's new code and, if it writes settings itself, routing it through the
same durable write. No fork block may be lost: `rephrase` and `grammar` keys survive
the move because the move rewrites the file, not the object.

### D5 — Version and release shape

The version moves in two steps, because `scripts/version.test.js` asserts the fork
number equals the highest **archived** ADR and `highestAdr` ignores an active change:

1. on the merge commit: `1.6.3+fork.18` (upstream number moves, fork number does not);
2. when this ADR is archived: `1.6.3+fork.19`.

Setting `+fork.19` while the change is still active would fail `npm test` at the very
gate this plan relies on.

### D6 — Verification order, and a way back

1. `node neo-ext/check-seams.js`
2. `npm run lint` (fork files clean; upstream's known lint noise is unchanged)
3. `npm test`
4. `npm run test:grammar`, `test:rephrase`, `test:history`, `test:records`,
   `test:simple`, `test:interface-size`, `test:sidepane`, `test:inventory`
5. upstream's new suites (`test:script-keys`, `library-move`, `snapshot-thinning`)
6. `~/.local/bin/neo-reinstall`, then a smoke launch on a throwaway library

A branch `pre-1.6.3` (or the existing `615de78`) is the rollback point: if step 4–6
cannot be made green, reset to it and the installed build stays as it is.

## Risks

- **Seam anchors moved by upstream** — `check-seams.js` fails loudly, which is the
  intended signal; the seam is moved, not dropped.
- **Two writers of `settings.json`** — upstream's library move and the fork's guarded
  save. Checked by hand in this change; a wrong interaction shows as a lost
  `libraryDir`, which the fork's guard is designed to prevent.
- **`AGENTS.md` divergence grows** — the merge adds upstream's facts to a file the
  fork already extends; keep upstream's paragraphs verbatim under the fork's sections
  so the next merge conflicts in the same small places.
- **New upstream tests may assume upstream-only files** (e.g. `pocket/`); they are
  run as upstream ships them and are not edited.

## Non-goals

- No push to upstream, no upstream issue or PR.
- No new fork feature in this change.
- No Pocket work beyond what upstream's 1.6.3 already contains.
- No migration of writer data.
