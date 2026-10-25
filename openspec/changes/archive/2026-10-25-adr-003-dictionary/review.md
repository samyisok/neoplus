# Review — adr-003-dictionary (planning)

Scope: the planning artifacts in `openspec/changes/adr-003-dictionary/`, including the thesaurus data-migration delta and the OEWN source decision. Findings were fixed in the artifacts before implementation.

## GRASP Verification — 2026-10-25

**Scope:** planning diff (`git diff HEAD` over the intent-to-add change)
**Files reviewed:** proposal, two spec deltas, design, tasks
**Findings:** 3

### Problems

- [x] `specs/dictionary/spec.md` — Information Expert / boundary breach: the dictionary capability claimed that “both entries” hide on a multi-word selection and in Simple NEO, which is the thesaurus capability's rule. Reworded to the Dictionary entry only; the thesaurus delta already owns its own suppression.
- [x] Whole change — god-change risk: dictionary, thesaurus data migration, shared word/menu refactor, and a version-checker fix in one ADR. Accepted as intentional (the user asked for one data migration), but tasks are phased so the shared refactor lands before the second feature and each group carries its own tests.
- [x] `neo-ext/main.js` registry — protected variation: the menu seam must not grow a branch per feature. Design keeps one registry with `menuItem(word)` per feature, so a third lexical tool is a registration, not another edit.

### Recommendations

- Keep the menu registry the only place that knows both feature names (done).
- Keep `main.js`'s seam a dispatcher, not a feature owner (done).

## DDD Verification — 2026-10-25

**Scope:** planning diff
**Files reviewed:** proposal, two spec deltas, design, tasks
**Findings:** 5

### Problems

- [x] `specs/dictionary/spec.md` — Ubiquitous language: the window counted “senses” while the heading and the writer's word is “definitions”. Standardized on **definitions** in the spec, proposal, and design.
- [x] `specs/thesaurus/spec.md` delta — Domain leakage: the modified requirement spelled out the OEWN relation mapping (`members`, `hypernym`, `similar`, `also`), which is a data/design decision. Replaced with the observable “keeps the synonym and relation behaviour” and left the mapping in design D2.
- [x] `specs/dictionary/spec.md` — Storage leak: “converted to the app's shard format” described storage. Reworded to “bundled with the application without changing the recorded definitions or examples”.
- [x] Thesaurus migration — Missing attribution rule: the old requirement only required “the licence required by its source”. The OEWN source adds CC BY 4.0 alongside the WordNet notice; the modified requirement now names both and the data README/manifests carry them.
- [x] Change boundary — Cross-aggregate rule: the dictionary spec referred to suppressing the Thesaurus entry. Fixed; the thesaurus delta owns that rule.

### Recommendations

- Use one name for a WordNet sense in the UI: **definition** (done).
- Keep provenance and the two licence notices explicit in both capabilities (done).

## Additional consistency review

- **Source pin.** OEWN 2025 JSON asset: 9,986,555 bytes, SHA-256 `7d749f6e2c39e6970e4997839dcf6e42fd281f3c2fae0171d2192bae8cfa4b51`, tag `2025-edition`. Proposal, design, and manifest tasks agree.
- **Measured data.** Dictionary 126,595 headwords / 184,307 senses / 5.71 MB gz; thesaurus 123,673 headwords / 648,541 relations / 3.58 MB gz. Caps in the data tests (7 MB / 5 MB) leave headroom without hiding a regression.
- **Licence files.** The JSON zip carries no licence file; the build copies `LICENSE.md` and `WNDB_License.txt` from the tagged repository. Design says so; task 2.3 implements it.
- **Thesaurus manifest format.** The shard shape stays at format 2; the manifest moves to format 3 to mark the source change. Task 5.5 and the data test must agree.
- **Version checker is red on purpose.** `npm run check:version` fails while adr-003 is active because the current checker counts active ADRs. Task 1.2 changes it to archived-only; this is the first apply step, not a planning defect in the feature.
- **No code or data touched.** Only `openspec/changes/adr-003-dictionary/` is new.

## Resolutions applied

| Finding | Artifact change |
|---|---|
| Cross-capability “both entries” | Dictionary spec now speaks only for Dictionary…; thesaurus delta owns the rest |
| “senses” vs “definitions” | Standardized on definitions in proposal, spec, design |
| Relation mapping in spec | Moved to design D2; spec states observable behaviour |
| Storage wording | Removed “shard format” from the spec |
| OEWN attribution | Added CC BY 4.0 + WordNet notice to both capability requirements |
| God-change risk | Phased tasks; shared refactor before dictionary |

No blocker remains. `openspec validate adr-003-dictionary --strict` passes.

## Code review gate — 2026-10-25 (after apply)

Scope: `git diff HEAD` plus the new `neo-ext/` modules, tests, and the regenerated data manifests (generated shards excluded). Three reviewers ran on the implemented diff: `code-reviewer`, `security-reviewer`, and `ts-cop` (the cop for this plain-JavaScript/Electron stack). Findings were fixed in the code before sync.

### Blockers found and fixed

- **macOS Look Up routed by word, not by choice** (`app.js` seam 10 + `word-context.js` + `api.js` + `boot.js`). Choosing **Dictionary…** matched no branch, and choosing **Thesaurus…** called both features' `openWord`, so the dictionary could open (or a spurious "Close the other window first" toast appeared). The seam now passes the chosen value: `lookUpChoice(choice, word)`, `word-context.js` dispatches to the one feature, and `check-seams.js` asserts both the `choice === 'dictionary'` branch and the two-argument call. A regression test pins "only the chosen feature answers"; the e2e drives the main-process menu action.

### Majors found and fixed

- **`dictionary.openWord` never spent the shared word context** — the range stayed reachable for the rest of the session. It now clears the context once the lookup is underway (a test asserts a single clear).
- **Converter could write a partial release silently** — `readRelease` now refuses a JSON file that is not an object, an empty synset set, or an empty entry set; unsafe prototype keys are skipped; `--sha256` must be 64 hex characters; a build without the licence directory is refused instead of shipping the data unattributed. Covered by new `readRelease`/`writeData` tests.
- **Action routing and modal refusal were untested** — `scripts/dictionary.e2e.js` now sends the `menu` message from the main process and opens the definition window; it also opens a core dialog first and asserts the dictionary refuses with "Close the other window first".
- **`lib/shard-store.js` had no direct test** — new `scripts/shard-store.test.js` covers the three-shard bound, eviction, and retry after a failed read.

### Advisories accepted (with reason)

- **No `will-navigate` guard on the app window; IPC handlers do not check the sender** (security M1/L1). Pre-existing since adr-001/adr-002 and recorded in the adr-002 review; belongs in its own change. adr-003 adds no write capability and no network path.
- **Context-word entries are not purged on window destroy** (security L2). The word is spent once and expires in five seconds; a reused `webContents` id could in theory offer a stale word for a lookup that reads no user data. Left for a follow-up.
- **`setContextWord` uses synchronous IPC** (security L5, pre-existing). The word must arrive before Electron builds the menu in the same turn; changing it would change the seam's timing.
- **Renderer Look Up still names the two features explicitly** (ts-cop M3). The order is a constant, and routing is now by the chosen value, so a third feature is a one-line addition; a renderer registration API was not added because nothing else needs it yet.
- **Thesaurus and dictionary main processes repeat the manifest probe** (ts-cop minor). Only the I/O moved to `lib/shard-store.js`; the probe is eight lines and format-specific. Left as is.
- **`x()` and the POS table are repeated across renderer files** (nit). A shared i18n helper would touch every fork module; not folded into this change.

### Verdicts

| Reviewer | Verdict | Blockers |
|---|---|---|
| `code-reviewer` | blocked on Look Up routing; majors on converter guards, test gaps, context spend | fixed |
| `security-reviewer` | no blockers; low/medium advisories | none |
| `ts-cop` | blocked on the same Look Up routing; majors on the test gap and `shard-store` coverage | fixed |

After the fixes: `node --test scripts/*.test.js` 407 pass, `npm run test:dictionary` 12 pass, `npx oxlint neo-ext/` clean, `node neo-ext/check-seams.js` passes, `npm run check:version` reports `1.6.0+fork.2`, `openspec validate adr-003-dictionary --strict` passes.

## Follow-up review after commit — 2026-10-25

A fresh read of the committed diff found two issues the first gate missed. Both were fixed with a failing test first.

### Blocker: a dismissed Look Up could replace the same word in an older chapter

`thesaurus.js` preferred its stashed `active` entry over the live context whenever the words matched. On macOS, choosing a word, dismissing the popup, then right-clicking the same word in another chapter and choosing Thesaurus… opened the **old** range and replaced that word instead. The live context now wins; the stash is only the popup's own path, where the context was spent. Regression test in `scripts/thesaurus-menu.test.js` uses two nodes with the same word and asserts the live one is replaced.

### Major: the dictionary returned focus to the wrong place

The window restored `document.activeElement` captured at open. After the macOS popup that is `<body>` (focus lost), and a right-click in a chapter other than the caret's moved the caret to the first chapter on close. `word-context.js` now exposes the editor the word came from, the dictionary passes that element (never its range), and the window focuses it on close. Covered by a `dictionary.e2e.js` case that blurs focus before opening through the Look Up seam.

### Also fixed

- Converter: spellings that clean to one headword (`God` / `god`, and 697 more in the release) merged instead of overwriting each other — this restored 698 headwords' senses and 2,643 relations. Data regenerated: 126,595 dictionary headwords / 184,307 senses / 5.71 MB; 123,673 thesaurus headwords / 648,541 relations / 3.58 MB.
- The converter uses the runtime `HEADWORD` rule, both data tests assert it, and the dictionary lookup test covers prototype keys.
- A dictionary response with senses but no groups no longer renders an empty window; a non-thenable bridge answer is refused instead of throwing.
- README wording for the asar-excluded `LICENSE.md`, and the AGENTS bullet about custom words.

Final counts: `node --test scripts/*.test.js` 409 pass, `npm run test:dictionary` 13 pass, seams, version and `openspec validate --all` pass.
