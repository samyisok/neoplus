# Review — adr-016-ui-text-size

## Implementation review — 2026-10-31

`code-reviewer` and `security-reviewer` on the implemented diff. No blocker.
Every behavioral finding was fixed; two advisories are accepted with reasons.

### Fixed

- **A failed second write kept the first** — the group wrote Interface Size and Interface text in two library writes, so a failure on the second left the first stored while the dialog said the save failed. `api.setUiLook({ uiZoom, uiText })` now writes both in one write, restores both (memory and device copy) on failure, and applies fonts once. This also removed the one-frame flash where the text snapped back between the two writes.
- **Text that inherited did not scale** — the multiplier only reached rules with an explicit size. The Settings, Thesaurus, and Dictionary windows now have a scaled base font, the Thesaurus filter and Settings path field override core's `.modal input` size, and the Thesaurus/Dictionary close buttons scale their 28 px box with the glyph. The Inventory rows inherit the already-scaled dialog base.
- **The CSS gate missed opt-outs** — `scripts/interface-size-css.test.js` now checks rule by rule that every `font-size` carries `var(--ui-text`, and that the inherited-text windows have a scaled base.
- **A device could erase another device's text size** — `applyDeviceLook` deletes keys the device copy lacks; an existing device's stored look predates `uiText`, so it would delete the synced value. A marked seam keeps the library's value for `uiText` (seam 15), and the next write records it on the device.
- **The module guard removed both rows if the adapter was partial** — the text functions are now checked separately from the zoom ones; an older adapter keeps the Interface Size row and simply omits the text row.
- **Tests** — text persistence across a reload is asserted, both sizes are written in one call in `api.test.js` (success, unchanged, failure with both restored), and the end-to-end failure and save-in-flight cases now patch `setUiLook`, the call the group actually makes.
- **Docs** — seams 13–15 added to the AGENTS table with the Interface text note; the spec's composed-size scenario now says the text is 150% of its ordinary size within the 120% frame.

### Accepted

- The `check-seams` pin for the device list is an exact substring (`'uiZoom', 'uiText'`); it fails loudly if upstream reformats the array, which is the intent of the seam check.
- A hand-edited or synced `library.json` can carry `"uiText": "5"`; every consumer snaps it (0.9–2) for display and the next save writes a normal number. No data is lost, so nothing normalizes on read.

## Verification

`npm test` 652 · `test:interface-size` 11 · `test:rephrase` 15 · `test:history` 8 · `test:inventory` 30 · `test:simple` 14 · changed files lint clean · `check-seams` passes.
