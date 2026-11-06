# Tasks

## 1. Prepare (no merge yet)

- [x] 1.1 Record the rollback point: `git branch pre-1.6.3` (or note `615de78`).
- [x] 1.2 Add the read-only remote and fetch the release:
      `git remote add upstream https://github.com/hughhowey/neo`,
      `git remote set-url --push upstream DISABLED-read-only`,
      `git fetch upstream main v1.6.3`.
- [x] 1.3 Confirm `git merge-base HEAD upstream/main` is `4be59b2` and that
      `v1.6.3` resolves to `984a217`; if not, stop and report.
- [x] 1.4 List the upstream commit subjects (`git log --oneline 4be59b2..upstream/v1.6.3`)
      into the change notes, so the merge's content is on record.
- [x] 1.5 Delete the planning scratch refs once the named remote works
      (`git for-each-ref refs/upstream` then `git update-ref -d` each), so only one
      upstream convention remains.

## 2. Merge

- [x] 2.1 `git merge upstream/v1.6.3` from `main` (merge commit, never rebase).
- [x] 2.2 `git status` — expect conflicts only in `AGENTS.md`, `app.js`,
      `index.html`, `main.js`, `package.json`, `package-lock.json`, `preload.js`.
      Any other conflicting file needs a note before it is resolved.
- [x] 2.3 Resolve `main.js`: take upstream's hunks, re-apply the five seams at their
      new anchors (`context-menu`, `buildMenu`, `whenReady` init, `dailyBackup`,
      and the IPC names they register).
- [x] 2.4 Resolve `app.js`: take upstream, re-apply seams 2/3/4/10/12/13/14/15 and
      confirm each anchor function still exists.
- [x] 2.5 Resolve `preload.js`: keep the `NeoForkNative` block, add upstream's two
      methods outside it.
- [x] 2.6 Resolve `index.html`: keep upstream's new script tag and the `neo-ext/`
      list last on the page.
- [x] 2.7 Resolve `AGENTS.md`: upstream's facts verbatim, every fork section kept in
      place; add upstream's Brighter-Interface change to the Simple NEO notes.
- [x] 2.8 `package.json`: upstream's version and scripts, then the fork scripts, then
      `1.6.3+fork.18` (fork number unchanged while this ADR is active); regenerate
      `package-lock.json` with `npm install --package-lock-only`.

## 3. Check upstream's new behaviour against the fork

- [x] 3.1 Read upstream's library-move path in `main.js`; confirm its `settings.json`
      write is durable and that it preserves `rephrase` and `grammar`.
- [x] 3.2 Confirm `settingsBroken()` still guards every settings write after the merge.
- [x] 3.3 Check the new Simple NEO behaviour (Brighter Interface and the page are now
      outside the switch) against `scripts/simple-neo.test.js` and the fork's
      `moreOn()` usage.
- [x] 3.4 Confirm the fork's preload bridge gained nothing upstream also added under a
      different name (no duplicate IPC handler).

## 4. Gate

- [x] 4.1 `node neo-ext/check-seams.js` — all seams present.
- [x] 4.2 `npm run lint` — no new errors in fork files.
- [x] 4.3 `npm test` — unit suite green, including upstream's new tests and
      `scripts/version.test.js`.
- [x] 4.4 Fork suites: `test:grammar`, `test:rephrase`, `test:history`, `test:records`,
      `test:simple`, `test:interface-size`, `test:sidepane`, `test:inventory`.
- [x] 4.5 Upstream suites that are new: `test:script-keys`, plus `test:pages`,
      `test:words`, `test:snapshots` where they run in this environment.
- [x] 4.6 `openspec validate --all` and `npm run check:version`.

## 5. Ship

- [ ] 5.1 Commit the merge: `adr-019: merge upstream 1.6.3` (merge commit, version
      `1.6.3+fork.18`).
- [ ] 5.2 Archive this change, then raise the version to `1.6.3+fork.19` in
      `package.json` and `package-lock.json`; `npm run check:version` and `npm test`
      again.
- [ ] 5.3 Add the archived change to `CHANGELOG.md` (one entry, keyed by the archive
      folder name) and commit it with the version bump.
- [ ] 5.4 `~/.local/bin/neo-reinstall`; verify `X-Neo-Version=1.6.3+fork.19`.
- [ ] 5.5 Smoke test on a throwaway library (`NEO_TRY_DIR`): open a book, run
      Grammar…, Rephrase…, Notes/Records, Inventory, Settings (AI Grammar), and
      File → Library Folder….
- [ ] 5.6 If a gate or the smoke test fails and cannot be fixed here, `git reset
      --hard pre-1.6.3`, reinstall the previous build, and report what blocked it.
- [ ] 5.7 Push both commits to `origin` (never upstream).
