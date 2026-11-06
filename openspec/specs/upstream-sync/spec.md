# upstream-sync Specification

## Purpose
TBD - created by archiving change adr-019-merge-upstream-1-6-3. Update Purpose after archive.

## Requirements

### Requirement: Upstream is read-only
The fork SHALL read upstream releases only through a read-only remote and SHALL never
push, force-push, tag, open a pull request, or otherwise modify
`github.com/hughhowey/neo`.

#### Scenario: Fetching a release
- **WHEN** a maintainer fetches upstream
- **THEN** upstream is addressed as a remote that can only be fetched
- **AND** a push attempt fails locally instead of reaching the upstream repository

#### Scenario: Publishing the merge
- **WHEN** the merge is committed
- **THEN** it is pushed to the fork (`origin`), never to upstream

### Requirement: A release is merged, not rebased
The fork SHALL bring an upstream release in with a merge commit that keeps upstream's
history and the fork's own commits.

#### Scenario: Merging v1.6.3
- **WHEN** `v1.6.3` is merged into the fork branch
- **THEN** the merge commit has the upstream tag as one parent and the fork head as the other
- **AND** the fork's earlier commits remain reachable and unrewritten

### Requirement: Seams survive the merge
Every `NEO-EXT seam` point in an upstream file SHALL still be present after the merge,
and the fork's seam check SHALL pass.

#### Scenario: An upstream hunk lands on a seam
- **WHEN** upstream rewrites code at or beside a seam anchor
- **THEN** the upstream version of that code is kept and the seam's line is re-applied on top

#### Scenario: A seam anchor moved
- **WHEN** upstream moved the function or block a seam is anchored to
- **THEN** the seam is moved with it and the seam check is updated, not deleted

### Requirement: Fork features keep working
After the merge, every fork feature SHALL behave as its spec states and its own test
suite SHALL pass: grammar, rephrase, history, records, record tags, inventory, the
resizable pane, interface size and interface text.

#### Scenario: Running the fork checks
- **WHEN** the merge is verified
- **THEN** the unit suite and every fork feature's own end-to-end suite pass
- **AND** the fork's seam check and lint report no new failure

#### Scenario: A fork suite fails after the merge
- **WHEN** a fork behaviour regresses because upstream changed the code under it
- **THEN** the fork behaviour is restored without changing the upstream improvement
- **AND** if the two cannot coexist, the conflict is reported before the build is installed

### Requirement: The fork version records both numbers
The version SHALL be `<upstream-release>+fork.<n>` after a merge, where `<n>` is the
highest archived ADR number, and `npm run check:version` SHALL pass.

#### Scenario: Merging 1.6.3
- **WHEN** upstream `1.6.3` is merged while this change is still active
- **THEN** the version reads `1.6.3+fork.18`, because the fork number is the highest
  archived ADR and this one is not archived yet

#### Scenario: Archiving the merge change
- **WHEN** this change is archived
- **THEN** the version becomes `1.6.3+fork.19`
- **AND** the version check and the About box agree

### Requirement: A merge leaves writer data untouched
The merge SHALL NOT change any library file, book file, sidecar, or settings key that
holds writer data, and an existing library SHALL open after the upgrade.

#### Scenario: Opening a library written before the merge
- **WHEN** the merged build opens a library and `settings.json` written by `1.6.0+fork.18`
- **THEN** the library, the writer's settings, and the fork's own settings blocks
  (`rephrase`, `grammar`) are read unchanged

#### Scenario: Upstream adds a settings path
- **WHEN** upstream's new library-move writes `settings.json`
- **THEN** it goes through the same durable write as before
- **AND** the fork's grammar and rephrase blocks survive it

### Requirement: The merge is verified before it replaces the installed build
The merge SHALL be installed only after seams, lint, unit tests, and the fork suites
pass on the merged tree.

#### Scenario: Verification fails
- **WHEN** any gate fails and the cause is not fixed in this change
- **THEN** the previous installed build stays in place and the merge is not shipped

### Requirement: Fork code stays in the fork's own files
The merge SHALL leave new fork behaviour in `neo-ext/`, and SHALL keep upstream files
to their seam lines.

#### Scenario: A fork feature needs a new hook
- **WHEN** a fork behaviour needs to run inside upstream code
- **THEN** it is called through a single marked seam line
- **AND** no upstream function is rewritten or reformatted to carry fork logic
