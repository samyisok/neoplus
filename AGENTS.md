# NEO — notes for agents

NEO is a local word processor for books. It is an Electron app made of plain JavaScript, HTML, and CSS. There is no bundler, no framework, and no compile step. `npm start` runs `electron .`.

Read [CONTRIBUTING.md](CONTRIBUTING.md) before adding a feature. The product is opinionated on purpose. A change that helps someone finish a book belongs here. A change that adds a panel, a prompt, or a dependency usually does not.

## Rules that override convenience

- Nothing interrupts a writer mid-sentence. No popups, no squiggles, no notifications while typing. Spellcheck is off until the writer asks for a pass.
- Controls stay hidden until hover or keyboard focus.
- Words are never discarded. Deleting text, unbinding a shelf, or losing a trash operation must leave the words recoverable (Darlings, a sibling chapter, or the system trash). `book:delete` uses `shell.trashItem`. If trash fails, leave the folder and show it.
- Books are plain files. No database, no proprietary format.
- The renderer never touches the filesystem. Disk access goes through `window.neo` (`preload.js`) to handlers in `main.js`.
- Do not save UI decoration into chapter HTML. Search highlights, spellcheck underlines, and focus dimming use the CSS Highlight API so they stay out of the file.
- Do not rewrite a chapter that has not changed. Libraries are synced with iCloud and Syncthing. A timer that writes every chapter on an interval will fight the other device.

## Where the code is

| File | Role |
|---|---|
| `main.js` | Window, menus, every filesystem operation, import parsing, PDF, backups |
| `preload.js` | The entire renderer API, `window.neo` |
| `index.html` | Two views: `#bookshelf-view` and `#editor-view`. CSP is `script-src 'self'` |
| `app.js` | The whole UI, in banner-marked sections. Search for the banner before reading the file |
| `styles.css` | All styling. Tokens are CSS variables at the top |
| `covers.js` | Shelf covers in the window: seeded canvas art plus real title type. `window.NeoCovers` |
| `art.js` | Painted covers in the main process. OpenAI only. Title and author are never sent to the image model |
| `i18n.js` | `t()` / `tk()`, shared by main and the window. English source text is the key |
| `spell-worker.js` | Hunspell WASM, forked with `utilityProcess`. Messages: `load`, `check`, `suggest`, `add` |
| `backup-worker.js` | The day's backup zip, forked with `utilityProcess` by `dailyBackup` so a file that won't come off iCloud never holds the main process |
| `spell-ro.js` | Romanian diacritics, used by the worker. Does not alter the manuscript |
| `manuscript.js` | Standard manuscript format: the word count's rounding, the header's surname, the `.docx`'s parts and the PDF's page, from a model the window hands it. Plain JavaScript that also runs in Node (`window.NeoManuscript`, loaded by `index.html`) |
| `locales/<code>.json` | One language. Regional files (`fr-CA.json`) hold only the strings that differ |
| `pocket/` | Capacitor shell. It does not contain its own editor |
| `print/` | Vendored Paged.js and hyphenation patterns for paperback PDFs |

`app.js` section banners look like `/*  SAVING  */`. Start there: bookshelf, bound shelves, editor open, typing, poetry, screenplays, placeholders, nav, tabs, outline, outline cards, darlings, counters, saving, refresh, structural undo, find, import, spellcheck, focus, goals, export, manuscript format.

Menus are built in `buildMenu()` in `main.js`. A menu click sends `{ type, ... }` to the window; `app.js` handles it on `window.neo.onMenu`.

## Simple NEO and Show More Features

NEO opens simple. File → Show More Features (`library.moreFeatures`) brings back the rest: SIMPLE NEO near the end of `app.js`, and `moreState` / `simpleTemplate` in `main.js`.

- A menu item behind the switch carries `more: true` in `buildMenu()`; `simpleTemplate` leaves it (and the separators it would strand) out. A key, right-click choice or pane behind it asks `moreOn()` in `app.js`.
- Behind the switch now: alignment, poetry paragraphs, footnotes (⌘⇧N), Markdown emphasis (*italic* typed; off in simple NEO), Other Font…, non-breaking marks, pages views, page width, interface size, focus mode, vim keys, read aloud, Look Up, the tab keys, chapter notes pages, outline cards (loose cards, cards beside the page), New Books Open To, painted covers and Cover Art…, pen names, binding shelves, duplicate, Reshelve, scripts and Fountain/Final Draft import, Import Chapters, txt/md/html exports, Chapter Titles Only, the shelf anthology, Manuscript Format, and the two language menus.
- Simple NEO treats those settings as NEO's defaults (`applyLook`) and never erases them: the writer's choices wait in library.json for the switch.
- Simple NEO's own, because the writer's eyes decide them: the page (View → Page: Night, Paper, Light) and Brighter Interface. Both are in the menu without the switch and in Pocket's ⋯ sheet, and `brightNow` never asks `moreOn()`. A library with a brighter interface set is no sign of more (`usesMoreFeatures`).
- Nothing a book already holds is hidden. A script, footnote, poetry paragraph, bound shelf, painted cover, loose card or chapter notes page with notes on it opens and exports as before, and other pen names stay reachable.
- A book's right-click in simple NEO is the larger cards (`optionModal`), with no cover menu: art is dragged onto the book; New cover and Remove cover art stand with the rest. Word goals are set in Goals, inside the book, never from the shelf.
- The shortcuts window (`bookShortcutSections`) lists a key only when its feature is showing.
- A library from before the switch is decided once (`decideMoreFeatures`): on when it uses something behind it, off otherwise (with one toast saying where things went).
- Pocket (Android and iOS) is always simple and has no switch; its ⋯ sheet in `pocket/www/index.html` offers only simple NEO's choices.
- A new feature goes behind the switch unless Hugh says it belongs in simple NEO. `scripts/simple-neo.test.js`, `npm run test:simple`.

## Outline cards

The Outline tab shows the book as index cards (OUTLINE CARDS in `app.js`) unless `library.outlineView` is `'list'`. A script's Outline is always cards, one per scene (`scriptScenes`): heading, length in eighths, cast, and a note in `book.sceneNotes`, keyed by `data-scene-id` on the heading line. Dragging a scene card calls `spMoveScene`.

- Cards come from the manuscript, not a separate structure: each chapter is cut at its `p.scene-break` lines (`chapterSegments`). A section that holds a `p[data-sec-id]` belongs to that note in `book.sectionNotes`; the first section to carry an id owns it, because paragraphs split from a written ghost inherit the id. Others show their first line.
- Moving a card moves its paragraphs and *** between chapter bodies, then `syncChapter` and `orderSectionNotes`. Every move takes a `snapshotStructure` first.
- `syncGhosts` leaves a ghost where it stands and places a note the page lacks before the next section that's there. It never reorders ghosts.
- Loose cards are `book.looseCards`, shown in the right-hand pane while the Outline is up. A section card dragged there (or Move to loose cards) goes both ways: a section with writing takes its words along as `card.html`, out of the manuscript and the counts until it's placed again. Chapter cards and a script's scene cards go there too: the card carries the chapter (words, title, notes, kind; `held: 'chapter'`) or the scene's lines (`held: 'scene'`), written to book.json before they leave the page, and comes back whole (a chapter only between chapters). A card's Delete sends held words to Darlings first. A section card's Delete section sends its writing to Darlings (`deleteSectionToDarlings`).
- Several cards at once: ⌘-click (Ctrl-click) toggles a card, Shift-click takes a run, and a drag across empty outline space sweeps (`cardLasso`). The picked cards are `cardSel` (keys from `cardKey`), kept across a redraw and dropped after a move. Delete/Backspace or the right-click menu runs `deleteSelectedCards`: one `snapshotStructure`, the single deletes run quiet, sections and scenes from the last up, and a book keeps at least one chapter.
- `joinChapter` makes a chapter a section of another (List Tab on a chapter line, or a chapter card dropped on the middle of another). It moves the lines, persists the receiving chapter, and only then deletes the emptied one.
- In the List, Enter always makes a chapter and Tab always makes a section.
- On a card made new (`cardEditor.fresh`), Enter with words on it opens the next new card; Enter on an empty one, or Esc, stops. A pasted list (`pastedOutline`: the clipboard's HTML levels from `<ul>`/`<ol>` or Word's `mso-list`, else `outlineLines` on the text) becomes one card per item, and in the List one line per item: on a chapter, top items are chapters and deeper ones their sections. `scripts/outline-paste.test.js` covers the text's markers.
- While writing, the top of the right-hand pane shows the cards for where the caret is (`sideCardsUpdate`, `#side-cards`): the chapter's and its sections' (the caret's marked red), or the script scene's. Typed on there, they're the same notes; a scene gets its id with its first note.
- A script scene's card note shows in gray on the scene's empty first line (`spSceneNoteGhosts`, a `data-scene-note` screen mark that `captureBody` strips).

Brighter Interface is two settings: `library.uiBright` while writing (and on the shelf), `library.uiBrightAside` on the other tabs, bright unless turned off. `applyBright` picks one on every tab switch.
- The walking note (`walkNoteUpdate`) is an overlay inside `.chapter`, plus a `data-walk` mark on the caret's paragraph that `captureBody` strips. `note.dismissed` hides it for good.

## Screenplays

A book whose `book.json` says `"format": "screenplay"` is a script. Right-click (long-press) a shelf's + for New Script. The SCREENPLAYS section of `app.js` holds the feature; `scripts/screenplay.test.js` tests its rules.

- The whole script is one chapter, so selection and the arrow keys run through every scene. Scenes are found by their headings.
- Each line is a `<p>` whose class is its element: `sp-heading`, `sp-character`, `sp-paren`, `sp-dialogue`, `sp-transition`, `sp-shot`. Action has no class.
- Page breaks, page numbers, (CONT'D) and the gray suggestions come from `data-pg`, `data-fill`, `data-contd` and `data-ghost` marks. `captureBody` strips them. Never save them.
- Lengths in `styles.css` are in em of the script's type (51em = 8.5in, 1em = one 12pt line), so a line wraps the same on screen, in the off-screen measuring room and in the PDF. `spPaginate` places the pages from the line counts.
- `data-newpage` on a line is the writer's own page break (right-click → Page Break Here; Backspace at the line's start removes it). Unlike the screen marks it is saved, and it travels as `===` in Fountain and `StartsNewPage="Yes"` in Final Draft.
- A script's style lives in its `book.json`: `underlineHeadings: true` (Format → Underline Scene Headings) and `contd: false` ((CONT'D) turned off).
- A script exports as a PDF (letter, printed with `print: 'screenplay'`), Fountain or Final Draft (`.fdx`). The book formats don't apply.
- A `.fountain` or `.fdx` file dropped on a shelf or picked with Import becomes a new script. `importFile` in `main.js` only reads the file; `spFromFountain` and `spFromFdx` in `app.js` sort it into elements. Both readers are plain string functions, so the tests cover them (`scripts/fixtures/` holds a Final Draft file written by screenplain, an outside tool).

## Manuscript format

File → Export → Manuscript Format… (MANUSCRIPT FORMAT in `app.js`, the pages in `manuscript.js`) writes the open book the way agents and editors ask for it (William Shunn's novel format): a title page with the writer's contact block, "about 90,000 words" (`roundWords`: to the thousand from 10,000 up, else the hundred) and the title and byline halfway down, no header; then the story numbered from 1 under "Surname / TITLE / page", double-spaced 12 point Times New Roman (or Courier), one-inch margins, every paragraph indented half an inch, each chapter on a new page a third of the way down, `#` for scene breaks, parts on their own page, an epigraph kept, END at the close. The copyright, dedication, contents, acknowledgments and about pages stay out. One story with no chapters gets the short-story layout (title halfway down page 1, the text under it, the header from page 2).

- **.docx** (`docxEntries`): the title page is its own section with no header, the story the next one with `pgNumType start=1` and a PAGE field in `header1.xml`; a short story is one section with `titlePg` and an empty first-page header. A `settings.xml` keeps Word out of Compatibility Mode. Saved through `export:save`.
- **PDF** (`html`): one page for Paged.js, the header in `@page`'s `@top-right` margin box, `@page titlepage` without it; `print:manuscript` lays it out with `renderPaged` (the story's first section is `.pg1`, so it's page 1) and saves it. It shares the print window with the paperback, so each refuses while the other runs. Courier Prime (bundled) goes into the PDF; Word gets Courier New.
- The dialog remembers the contact block for every book (`library.manuscript`: name, address, phone, email, font, end) and the byline and header for this book (`book.manuscript`, only where they differ from NEO's own choice). "Anonymous" is never taken for a byline. Values go into the fields from code, so a quotation mark can't cut one short. It never opens over another dialog or twice. Scripts keep their own PDF; Pocket has no manuscript export (its page doesn't load `manuscript.js`).
- `scripts/manuscript.test.js`; `npm run test:manuscript` (`scripts/manuscript.e2e.js`: the dialog, both files, the .docx read back by NEO's import, the PDF's pages read back with `pdftotext` where it's installed).

## Paperbacks for KDP

Export → Paperback for KDP… (also on the shelf's right-click Export) writes a print interior PDF and a cover template PDF beside it. `printPaperback` and `buildPrintHtml` are the PRINT BOOK section of `app.js`; `makePaperback`, `renderPaged` and `kdpCoverHtml` are in `main.js`, behind `print:paperback`.

- Trims are KDP's four most-used: 5×8, 5.25×8, 5.5×8.5, 6×9 (`PRINT_TRIMS` in `app.js`, `KDP_TRIMS` in `main.js`). Paper thickness, page limits and the inside-margin bands (`kdpGutterMin`) come from KDP's help pages; NEO adds a quarter inch to the minimum. If the page count crosses a band, the book is laid out again with the wider margin.
- Pages are set by Paged.js (`print/paged.polyfill.js`, vendored, MIT) in one offscreen window per export. A hidden window stalls its animation frames; a second offscreen window opened right after one closes fails. The window closes when the export ends. One patch in it is marked `NEO:` (a word hyphenated across a page turn broke a letter late).
- Hyphenation is soft hyphens put in by `hyphenateHtml` in `main.js` with TeX patterns (`print/hyphen/`, ISC), because Chromium only hyphenates on macOS. Only `p.hy` prose is touched; names (capitalised words, except in German) and a paragraph's last word stay whole.
- Chromium rounds page sizes to 0.01 in; `exactPageBox` rewrites the MediaBox to the exact size in the same number of bytes.
- The page count is kept even. Chapters open on a right-hand page; blank pages carry no head or number. Page numbers sit at the outside corners (left pages at the left, right pages at the right); the regular PDF keeps them centered.
- Choices are kept: trim, paper, ISBN and fiction notice in `book.print`; on the pen name, `author.print` holds the back-matter links, `alsoByText` (the writer's own list, one title per line) and `reviewText` (own wording, with `{title}` for the book's title; empty means NEO's translated wording). A dedication typed in the dialog becomes the book's own Dedication page.
- Page 1 is the story's first page (the first `chapter` section, so a prologue). In the paperback that section is `.pg1` and each page's number is set on it after layout. The regular PDF stops counting on `@page front` pages and numbers its contents from the `data-p1` link; pages after page 1 that show no number (a part's title) are `.page.counted`.
- `scripts/print.test.js` covers the margin bands, hyphenation, the page box and the cover's size. Pocket has no paperback export.

## Snapshots

⌘S (Ctrl+S; File → Take Snapshot) snapshots the whole book (SNAPSHOTS in `app.js`). NEO also takes one before the first change of each writing day (`maybeDailySnapshot`, from `scheduleChapterSave` and `snapshotStructure`, built from `savedHTML` so it holds the day's start). No timer, and nothing is taken when nothing changed.

- One folder per snapshot, `book-…/snapshots/<UTC stamp>Z-<kind>-<chapters changed>-<words>-<rand>/`, holding only the chapters that changed since the last snapshot and, written last, `snapshot.json` (order, titles, kinds, a `textHash` of every chapter). Files are written once (`snapshot:list/read/write/remove` in `main.js`, the same four in Pocket's bridge). A chapter's text at a snapshot is in the newest snapshot at or before it holding the file (`snapHolder`).
- Kinds: `k` ⌘S, kept until deleted; `d` start of a day and `r` just before a restore, which go after 30 days (`snapsToThin`). A snapshot that goes first copies its chapter files into the next one that lacks them, so later snapshots still read whole.
- The Darlings tab's right-hand pane lists them (and stays open there); picking one shows the book as it was in `#snap-view`, read-only, words gone since marked with the CSS Highlight API (`wordsGone`). Restore This Chapter and Restore Whole Book take an `r` snapshot and a `snapshotStructure` first, so ⌘Z undoes them. A passage can be set aside as a darling from the right-click menu. Pocket takes snapshots but has no list yet.
- The daily backup zip leaves `snapshots/` out. `scripts/snapshots.test.js` covers the names, the fingerprint, thinning, where a chapter's text is and the marks.
- The snapshot on the page and the list belong to the open book: `openBook` and `backToShelf` clear both (`forgetSnapshots`), another tab only the page (`hideSnapshot`). A snapshot's chapters are `.chapter-body` too, inside `#snap-view` rather than a `.chapter`, so code that walks every `.chapter-body` must pass over them.

## Per device

How NEO looks belongs to each device: `DEVICE_LOOK` in `app.js` (page theme, brightness, zoom, type size, page width, typewriter, non-breaking marks, pages view, focus, counters, outline view, vim keys). Every library write also keeps them in this device's `localStorage`; every library read takes them back from there (`applyDeviceLook`). The library's copy is the last device's, which is what a device new to the library starts with. Zoom is per device and per view: the page per mode, the cards, and the shelf (`neo.shelfZoom`, ⌘+/− and pinch on the shelf), each in `localStorage`; the page moves in tenths. The desktop also keeps its page theme in `settings.json` for the window's color at launch, and `exportFolder` there, so save dialogs open where the last export went.

Format → Page Width (Regular, Wide, Wider; `PAGE_WIDTHS` in `app.js`) sets `--page-wf` and `--page-pad-x`, which `--page-w` and the sheet's side padding in `styles.css` follow. The page also grows a little by itself in a wide window (`--page-w` clamps 680 to 760 px by the window); Pocket's page fills the screen up to 680 px (`pocket.css`).

A book's right-click on the shelf is a small menu (`popMenu`) on the desktop, with the cover's choices one level in; touch keeps the larger cards. Duplicate (`book:duplicate`, and `duplicateBook` in Pocket's bridge) copies the folder under a new id and title.

Pocket makes PDFs through `NeoPdf`, a native plugin in each project: Android opens its print screen (Save as PDF), iOS draws the pages into a file for the share sheet. A script's title can be set bold, underlined or italic as a whole (`book.titleStyle`, ⌘B ⌘U ⌘I on the title page), and keeps it in the PDF, Fountain and Final Draft.

## Processes

```
index.html + app.js  →  preload.js (window.neo)  →  main.js  →  NEO Library
                                                      ↓
                                               spell-worker.js
```

The window is created with `contextIsolation: true` and `nodeIntegration: false`. New renderer capabilities are added in three places: an `ipcMain.handle` in `main.js`, a method on `window.neo` in `preload.js`, and the call site in `app.js`.

## Files on disk

Default library: `~/Documents/NEO Library` (`app.getPath('documents')`). **File → Library Folder…** stores another path in `userData/settings.json` and restarts. NEO does not move existing books.

```
NEO Library/
  library.json          shelves, author, pen names, customWords, spellLanguage
  _catalog.txt          regenerated map of folder → title; edits are ignored
  neo-errors.log
  Backups/neo-backup-YYYY-MM-DD.zip    one per day, 14 kept
  Exports/              emailed PDF snapshots
  book-<slug>-<id>/
    book.json           metadata and chapterOrder
    chapters/<id>.html
    notes.html          the Notes tab's page for the whole book
    notes-<chapter id>.html   a chapter's notes page (NOTES PAGES in app.js)
    outline.html
    darlings.json
    stickies.json
    cover-<ts>.<ext>    writer-chosen image
    art-<ts>.<ext>      painted image, plus art.json
```

App settings and the cover-art API key live in Electron `userData` (`settings.json`, `secrets.json`), not in the library. The key is encrypted with `safeStorage` when the OS allows it. Do not write secrets into the library.

Every book id, chapter id, and sidecar name passes through `libName()` in `main.js`. It allows one path segment and rejects `.`, `..`, slashes, and null bytes. Keep new files inside that helper.

Every library write goes through `writeFileDurable`: `file.tmp`, fsync, then rename into place, so a power cut can't leave an empty file. `writeJSON` also keeps the last version that read whole as `file.bak`, and `readJSON` falls back on `.tmp`, then `.bak`. A `book.json` lost with no copy is rebuilt from the chapter files (`rebuildBookMeta`). There is no append and no partial chapter update.

`json:write` and `aux:write` will create any single-segment `<name>.json` or `<name>.html` in the book folder. Prefer the existing names unless a new sidecar is actually required.

## Saving and sync

The window holds the open book in memory (`chapterHTML`, `book`, `stickies`, `darlings`) and remembers what it last wrote (`savedHTML`, `savedMetaSig`).

- Chapter and notes edits debounce 800 ms, then write only if the HTML changed and the chapter is still in `chapterOrder`.
- `flushAllSaves` runs every 20 s and on blur, hide, and close. It also stores `lastPosition` in `book.json`. A scroll-only change is not a new position.
- `refreshFromDisk` runs on focus, on visibility, and every 30 s while visible. It compares `mtimeMs:size` stamps and re-reads only changed chapters.
- Unchanged local chapter plus a changed file: adopt the file. If the file only has fewer words, adopt it and keep the displaced text in Darlings.
- Both sides changed: keep the local text on the page and insert the disk text as the next chapter, titled as from the other device.
- Skip a chapter whose write is still in flight. Drop a read that overlapped a local save. An empty read must not wipe a chapter that already has text.
- The same generation check applies to `library.json` on the shelf (`libraryGeneration`, `libraryWritesPending`).
- Today's word count (`book.dailyCounts`, `{ start, end }` per writing day) counts only what is typed or cut on this page. Text read from disk (opening, a chapter adopted or kept as the other device's twin) goes through `wordsFromDisk`, which moves the day's start with it. Words moved between chapters (a split, a card dropped on another chapter or made a chapter) are neither written nor cut: `holdDay` puts the day and a running sprint back once they have settled. A chapter made a part and back, and the undo of that, go through `wordsFromDisk` too. Another device's larger tally for a day is taken in (`mergeDayCounts`). `scripts/daily-words.test.js`, and the #345 cases in `npm run test:words`.

Structural undo (`snapshotStructure`, `structuralUndo`, banner STRUCTURAL UNDO) holds `UNDO_DEPTH` (50) actions. An undo puts back only what its action changed: writing made since stays, or, in a chapter the action also touched, goes to Darlings with a toast that says so. What an undo took back goes on `redoStack` (⇧⌘Z, Ctrl+Z's pair; Ctrl+Y off the Mac); any `input` event anywhere, or a new action, empties it. A redo is an undo of the undo, so it keeps the same protections.

On a Mac, iCloud ("Optimize Mac Storage") can turn library files into placeholders: the size is there, the words aren't, and a read waits on iCloud, forever if iCloud is stuck. A synchronous read of one froze the main process at launch, with no window. So `cloudOnlyAmong` spots them (no blocks on disk, then the `dataless` flag), `requestDownload` asks `brctl` for them, and the read handlers wait for them with `afterLocal` without blocking, answering at once when nothing is in iCloud. `readJSON` throws `ECLOUD` for one rather than falling back on `.bak`, and no write goes over a placeholder. The daily backup runs in its own process (`backup-worker.js`), two minutes after launch: it leaves placeholders out and names them, gives each other file 20 seconds, and is ended after 15 minutes. 1.5.1 read every file in the main process at launch, and one stuck file kept NEO from opening, and from updating, which needs NEO open. `scripts/icloud.test.js` plays iCloud with sparse files, and a stuck file with a named pipe. Don't add a direct `readFileSync` of a library file, and never walk the whole library in the main process.

Do not replace this with last-write-wins. The comments in `persistChapter` and `refreshFromDisk` explain cases that look redundant and are not.

## Interface language

Wrap writer-visible strings in `t('English text', { placeholder })`. Use `tk()` for strings translated later, at the point of display. In `index.html`, use `data-i18n`, `data-i18n-title`, `data-i18n-placeholder`, or `data-i18n-ph`.

After adding or changing strings:

```
node scripts/i18n.js template
node scripts/i18n.js check fr
```

`scripts/i18n.js` only scans `app.js`, `main.js`, `covers.js`, `index.html`, and Pocket's own `pocket/www/index.html` and `pocket/www/pocket-bridge.js`. A new string in another file will not enter the template until that list includes it. Pocket's page marks its words with the same `data-i18n*` attributes as the desktop's, and its ⋯ sheet and bridge use `t()`.

Details, plural forms, and regional fallback (`fr-CA` → `fr` → English) are in [TRANSLATING.md](TRANSLATING.md). Quotation marks follow the spellcheck language (`QUOTE_STYLES` in `app.js`). Import chapter detection is `CHAPTER_WORDS` in `main.js`. Cover small-words are `CONNECTORS` in `covers.js`.

Italian has no spellcheck dictionary: the only Hunspell package on npm is GPL-3.0-only, and NEO is MIT. Do not add it.

## Pocket

`pocket/` is a Capacitor app that runs the desktop editor. Its bridge (`pocket/www/pocket-bridge.js`) implements `window.neo` against the phone's library folder. Android shares `Documents/NEO Library` via sync. iOS uses the app folder, optionally iCloud, with `LibraryHome.swift` locating that folder.

`scripts/pocket-www.js` (run by CI, and by hand before a local build) copies `app.js`, `covers.js`, `styles.css`, `i18n.js`, `fonts/`, `locales/`, Hunspell's browser build, and the `SPELL_LANGUAGES` dictionaries from `main.js` into `pocket/www/`. Pocket's checker is `pocket/www/pocket-spell.js`, a module worker with the same messages as `spell-worker.js`. A change to those files changes Pocket. Pocket-only behavior belongs in `pocket-bridge.js` or the native projects, not behind a desktop-only branch scattered through `app.js`.

## Commands

```
npm install
npm start
npm test                   # node --test scripts/*.test.js
npm run test:coverage      # node --test --experimental-test-coverage scripts/*.test.js
npm run lint               # oxlint, Electron's standard-style JavaScript rules
npm run test:spellcheck    # node --test scripts/spellcheck.test.js
npm run test:dictionary    # electron scripts/dictionary.e2e.js (real launch, throwaway library)
npm run test:dashes        # node --test scripts/dashes.test.js
npm run bundle             # Hugh: brings in the newest .bundle from ~/Downloads and pushes main
npm run try                # Hugh: opens the newest .bundle's NEO on a copy of the library, pushes nothing (-- fresh: an empty library)
npm run release            # Hugh: next version (x.y.9 → x.(y+1).0), commit, push, tag (npm run release -- 2.0.0 for another)
npm run package:mac        # macOS build; npm run package calls this
npm run package:linux      # AppImage via electron-builder; also package, package:mac, package:win, package:all
```

Tests use `node:test` and load `app.js` or `spell-worker.js` inside `vm`. Nineteen of them cut `app.js` out by slicing between marker comments such as `// ---- daily words rules:` and `// ---- end of daily words rules ----`. Renaming or moving a marker breaks its test without a compile error; keep the pair together when refactoring. They are not run by CI. The only CI check is a Windows smoke test that the packaged exe boots and creates a library (`.github/workflows/build.yml`, on `v*` tags). Pocket builds from `.github/workflows/pocket.yml`.

npm 11's allow-scripts default skips lifecycle scripts, so `npm install` leaves `node_modules/electron/dist` empty and `npm start` fails. Run `node node_modules/electron/install.js` once (as `~/.local/bin/neo-reinstall` does). `koffi`'s prebuilt binaries ship inside its package; only macOS loads them.

`node scripts/check-romanian-package.js <Resources dir>` compares a packaged app's dictionaries to the source tree. `node scripts/benchmark-spellcheck.js` times the checker. Neither is an npm script.

## Handing changes to Hugh

Hugh pushes and releases himself and isn't a git user. Hand him work as a git bundle of main..your-branch, built on the latest origin/main, then tell him: save it to Downloads, `npm run bundle`. To ship a desktop release: `npm run release`. Both commands check their footing and stop with a plain sentence instead of half-finishing. Don't give him raw git or npm version steps when these cover it.

## When you change something

- A new filesystem operation needs a handler, a `libName()` boundary, and a `preload.js` method. Match the existing IPC names (`library:`, `book:`, `chapter:`, `aux:`, `json:`, `cover:`).
- A new writer-visible string needs `t()` and a template refresh.
- A new way to remove text needs a recovery path and a sentence in the UI that says where the words went.
- Export formats are assembled in `app.js` and written by `export:save` in `main.js`. EPUB is a zip built in memory. PDF is printed from temporary HTML.
- Errors in the main process are appended to `neo-errors.log` via `logError`. Renderer failures go through `window.neo.logError`. Do not swallow a save failure; `persistChapter` rolls `savedHTML` back so the next flush retries.

## This checkout: fork and Linux install

- `origin` is `samyisok/neoplus`, a fork. Upstream is `hughhowey/neo`; HEAD normally equals upstream `main`. Compare before branching: `git fetch https://github.com/hughhowey/neo main:refs/tmp/upstream && git rev-list --left-right --count refs/tmp/upstream...HEAD`. Never push to upstream or rewrite its history.
- Installed for this user as an unpacked AppImage at `~/.local/opt/neo` (`AppRun`) plus `~/.local/share/applications/neo.desktop` (app id `neo`, matches the window's Wayland app id).
- Fedora here has no `fuse-libs` and no passwordless sudo, so `dist/NEO-*.AppImage` cannot be run directly. `~/.local/bin/neo-reinstall [repo]` builds, stops NEO, re-extracts the x64 AppImage over `~/.local/opt/neo`, and rewrites the entry and icon; use it after every feature change. Never hand-edit the installed copy.
- The extracted install has no `APPIMAGE` env, so `electron-updater` stays idle; upgrades happen only through that script.
- A run creates `~/Documents/NEO Library` on first launch. Keep test runs out of it when possible (`NEO_TRY_DIR` for dev).

## OpenSpec: no tickets, one `adr-NNN` change per feature

There are no tickets. Every feature is an OpenSpec change in `openspec/changes/`, and its archived folder is the record of what was decided. `openspec/` and `.opencode/` are committed on `fork` only, never on `main`.

- **Naming:** `adr-<next-number>-<slug>`, zero-padded to three digits, kebab-case slug, e.g. `adr-001-chapter-word-count`. One number per feature, never reused. The next number is the highest that exists anywhere:
  ```
  ls openspec/changes openspec/changes/archive 2>/dev/null | grep -oE 'adr-[0-9]{3}' | sort -u | tail -1
  ```
  No output yet means start at `adr-001`.
- **Create:** `openspec new change adr-NNN-slug --description "one line"`. Then in order: `proposal.md` (the ADR: context, `## Decision`, `## Consequences`), `specs/<capability>/spec.md` with `## ADDED Requirements` and a `#### Scenario:` per requirement, `tasks.md` as the checklist. `design.md` only when the approach is not obvious from the proposal.
- **Capabilities are fork capabilities:** `word-count`, `thesaurus`, `story-notes`, `inventory` (add more as they come). Archive updates `openspec/specs/<capability>/spec.md`. Upstream carries no `openspec/`, so this never merges into their tree.
- **Flow:** branch `adr-NNN-slug` off `fork` → `openspec-propose` → planning review (GRASP/DDD, below) → red test → implement to green (TDD, below) → `openspec validate adr-NNN-slug` → `npm run lint && npm test` → code review gate (below) → `/opsx-sync` → `openspec archive adr-NNN-slug -y` → merge back into `fork`. Archive prepends the date (`openspec/changes/archive/YYYY-MM-DD-adr-NNN-slug`); keep the `adr-` prefix, never rename an archived folder.
- **Commit subject:** `adr-NNN: <summary>`. `openspec archive --skip-specs` is only for tooling or doc-only changes.
- **Helpers:** the OpenSpec skills (`openspec-propose`, `openspec-apply-change`, `openspec-update-change`, `openspec-sync-specs`, `openspec-archive-change`) and the `opsx-*` commands in `.opencode/commands/`. `openspec status --change adr-NNN-slug` names the next missing artifact; `openspec validate --all` before any upstream sync.

### Planning review: right after propose

`/opsx-propose` leaves the change untracked, so the verifiers would see an empty diff. Make the new files visible first, without staging content:

```
git add -N openspec/changes/adr-NNN-slug
git diff HEAD            # what grasp-verify / ddd-verify read
```

Then run `grasp-verify` and `ddd-verify` on that diff and fix what they find in the artifacts, not later in code. Their class-level rules translate to planning as follows:

- **GRASP → ownership:** one capability owns one behavior; a seam carries a line and no policy; fork code belongs in `neo-ext/`; no behavior is claimed by two capabilities; a "god class" reads as a god change (too many capabilities in one `adr-`).
- **DDD → vocabulary and boundaries:** use the names the code already uses (book, chapter, section, snapshot, library, settings); a capability is the aggregate, and one capability may not reach into another's internals; no storage, IPC, or UI detail leaks into requirements; scenarios state observable behavior, not fields to add.

Re-run both until no blocker remains; a finding that changes behavior goes back into `proposal.md`/`specs/` before `/opsx-apply`, so implementation never starts on a design the reviewers already rejected.

### TDD: red first, then green

Every coding task in an `adr-` change starts with a test that fails for the right reason.

1. **Red.** Write the smallest test that expresses the next task's behavior, run it (`node --test scripts/<name>.test.js`, or the group's focused command), and read the failure: it must fail on the missing behavior, not on a typo or a bad import. A test that passes before the code exists is not a test.
2. **Green.** Write only enough code to pass it, re-run the same test, then run the group's tests and `npm test` for regressions.
3. **Refactor.** Clean up with the test green; never widen scope.

Rules that keep this fork honest:

- Bug fixes get a failing regression test first, in a new `scripts/*.test.js` file. Never edit an upstream test; keep `// ---- … rules ----` marker pairs intact.
- `neo-ext/lib/*.js` is pure and must be fully unit-tested this way. A seam's line, a preload bridge, and menu wiring are covered by the smallest observable check the task names (a real launch, a `settings.json` read-back), written and observed failing before the wiring exists.
- UI and filesystem e2e work that cannot be made deterministic gets a written repro in `tasks.md` before the code, then the manual check after it.
- Use the `ts-tdd` skill (and the `tdd-guide` agent) for stack-level guidance; `java-tdd`/`rust-tdd` only in those stacks. They propose tests, they do not replace running them.
- The commit carries the tests and the code together; a task is not done until its test has gone red and then green in this session.

### Code review gate: after apply, before sync

Runs on the implemented diff (`git diff fork...HEAD`) once lint and tests pass, and before `/opsx-sync`. Skip it only for a change that touched no code (`skip_specs`, docs, OpenSpec files alone).

1. `grasp-verify` — responsibility assignment: does the new behavior live where it belongs (`neo-ext/` feature file vs `api.js` adapter vs a seam), and did any upstream file take on logic it should not own?
2. `ddd-verify` — domain boundaries and language: book/chapter/backup/settings terms stay consistent, no storage or transport leak into the domain model.
3. `ts-cop` — the cop for this stack (plain JavaScript/Electron). `java-cop`, `rust-cop`, and `react-cop` are used only when the change is actually in those stacks; do not run them here for ceremony.
4. `code-reviewer` agent — bugs, regressions, and test gaps; read-only, findings only.
5. `security-reviewer` agent — mandatory when the diff touches IPC/preload, filesystem paths, `settings.json`/secrets, network calls, or adds a dependency.
6. Optional: `comment-judge` on the diff, and `refactor-cleaner` only when the change grew duplication or dead code.

Reviewers propose, they never patch: fix blockers yourself, then re-run the failed reviewer plus `npm run lint && npm test`. Record the verdicts (and any accepted advisories with a reason) in the change's `tasks.md` or the commit body. Only then `/opsx-sync` → `/opsx-archive` → merge into `fork` → `~/.local/bin/neo-reinstall`.

## Fork extension strategy (read before adding a feature)

Every fork feature lives in `neo-ext/`. Upstream files get at most a one-line seam, so `git merge upstream/main` stays boring. Never rewrite a core function, never reformat an upstream file, never put plugin data in `book.json` or `library.json`.

### Branches

- `main` mirrors `hughhowey/neo`; never commit fork work there.
- `fork` = upstream + seams + `neo-ext/`; one branch per feature off `fork`, merged back into `fork`.
- `git remote add upstream https://github.com/hughhowey/neo` once. Sync: `git fetch upstream main && git switch fork && git merge upstream/main`. Conflicts should only touch seam lines and the end of this file. Then `node neo-ext/check-seams.js`, `npm run lint`, `npm test`, `~/.local/bin/neo-reinstall`.

### Versioning: upstream number, fork number

`package.json` carries both numbers in one semver string: `<upstream>+fork.<n>`.

- The first three numbers are upstream's release and nothing else: `1.6.0` today. Build metadata is ignored by npm and electron-updater, so the fork still reads as 1.6.0 to the update machinery.
- `n` is the fork's feature count: the highest archived `adr-NNN` number. `1.6.0+fork.2` is upstream 1.6.0 with ADR-002 in it.
- About NEO, the `.AppImage` name, and the desktop entry's `X-Neo-Version` all read this one string.
- Merging an upstream release: take upstream's version and append `+fork.<n>` again.
- Archiving an ADR: raise `n` (`npm pkg set version="<upstream>+fork.<n>"`, and the root version in `package-lock.json`), then `npm run check:version`. `scripts/version.test.js` runs in `npm test`.
- Never change the three upstream numbers for a fork feature, and never use `-fork.<n>`: a prerelease sorts below the release it is based on.

### The seams (the only upstream-file edits allowed)

Each seam carries `NEO-EXT seam` (a line comment, or an HTML comment before the index.html scripts), so `grep -rn "NEO-EXT seam" .` lists every divergence. The preload bridge is one marked block, inline because a sandboxed preload cannot `require` a local file.

| # | File | Anchor to insert after/before | Line |
|---|---|---|---|
| 1 | `index.html` | after `<script src="app.js"></script>` | the `neo-ext/` scripts, last on the page (`boot.js` last of all); the exact list is the `index.html` entry in `neo-ext/check-seams.js`; classic scripts share app.js's global scope |
| 2 | `app.js` | in `switchTab`, after the `$$('.tab').forEach(...)` active-class block | `if (window.NeoExt && NeoExt.tab(name)) return;` — full-width tabs only *(planned)* |
| 3 | `app.js` | end of `updateCounters`, after `trackDailyWords(total);` | `if (window.NeoExt) NeoExt.counters(book);` *(planned)* |
| 4 | `app.js` | end of `openBook`, after `spReportState();` | `if (window.NeoExt) NeoExt.bookOpened(book);` — broadcasts `neo-ext:book-opened` so an open pane view can load the book now on screen |
| 5 | `main.js` | before `Menu.buildFromTemplate(items).popup(...)` in the `context-menu` handler | `require('./neo-ext/main.js').contextMenu(items, params, win);` |
| 6 | `main.js` | immediately before `const menu = Menu.buildFromTemplate(simpleTemplate(template, moreState));` in `buildMenu` (not before `setApplicationMenu`: the menu is already built there) | `require('./neo-ext/main.js').appMenu(template, { more: moreState, bookOpen: bookOpenState });` |
| 7 | `main.js` | inside `app.whenReady().then(...)`, after `ensureLibrary()`, before `createWindow()` | `require('./neo-ext/main.js').init({ ipcMain, dialog, shell: require('electron').shell, … })` — `shell` is not imported at the top of main.js |
| 8 | `preload.js` | after the `window.neo` exposure | the inline `NeoForkNative` bridge — inline because a sandboxed preload cannot `require` a local file |
| 9 | `main.js` | in `dailyBackup`, where `backupsDir` is computed | `const backupsDir = require('./neo-ext/main.js').backupDir(LIBRARY_DIR);` |
| 10 | `app.js` | in the macOS Look Up `contextmenu` listener: its item list and its `popMenu(...).then(...)` | `if (window.NeoExtApi) NeoExtApi.lookUpMenu(items, word);` and `else if (window.NeoExtApi) …lookUpChoice(choice, word)` — every non-lookup choice is forwarded; the choice, not the word, decides which feature opens |
| 11 | `backup-worker.js` | the library-root allowlist in `walk`, after `_catalog.txt` | `name.startsWith('records.json') && !name.endsWith('.tmp')` — the shared records and their `.bak` travel in the daily zip; and the `lstat` check that names a symlink instead of following it |
| 12 | `app.js` | in `applyFonts`, the `const uiZoom = …` line | `window.NeoExt && NeoExt.uiZoom ? NeoExt.uiZoom(library, moreOn()) : (moreOn() ? snapZoom(library.uiZoom) : 1)` — the fork owns the interface-size policy, so Simple NEO follows the writer's choice while Pocket keeps the old rule |
| 13 | `app.js` | the `DEVICE_LOOK` array | `'uiText'` beside `'uiZoom'` — the interface text size is each device's own |
| 14 | `app.js` | in `applyFonts`, after the interface-size lines | `if (window.NeoExt && NeoExt.uiText) NeoExt.uiText(library);` — publishes the fork's text size |
| 15 | `app.js` | in `applyDeviceLook`, the `DEVICE_LOOK` loop | `else if (k !== 'uiText') delete lib[k];` — a device whose stored look predates the key keeps the library's value instead of erasing it |

Rows 1, 4–15 exist today; 2 and 3 are added with the features that need them. `neo-ext/check-seams.js` asserts the seams that exist.

Right-click menus are Electron's, not the page's: renderer `preventDefault` cannot add to them, hence the `main.js` seam. Menu clicks send `{ type: 'neo-ext', … }` with `win.webContents.send('menu', …)`; `onMenu` in `app.js` is a chain of `if`s, so unknown types are ignored, and `boot.js` subscribes its own `window.neo.onMenu`.

### Layout and rules

- `neo-ext/boot.js` (registry, hook wiring, injects `neo-ext/neo-ext.css`), `neo-ext/main.js` (menus, main-process helpers), `neo-ext/api.js` (the only file allowed to touch core internals), `neo-ext/<feature>.js`, `neo-ext/locales/*.json`, `neo-ext/check-seams.js`. Fork strings are keyed by their English text; a translation can be injected through `window.NeoExtLocale` (no loader ships yet), and `t()` is the last fallback.
- Core internals are reachable by name from `boot.js` because app.js is a classic script: top-level `let book`, `chapterHTML`, and functions `chapterWords`, `countWords`, `switchTab`, `t`, `$`. They are not public API — wrap each use in `api.js` with a guard, so an upstream rename breaks one file instead of ten.
- Prefer no-seam injection first: the right pane (`#side-pane`) can take plugin tabs, buttons in `#side-head`, and its own sibling of `#sticky-list` with zero core edits. Core rewrites only `#sticky-list` and `#side-head`'s own span/pin, so leave those alone. Use seam 2 only when a feature needs the full paper width.
- Storage: own sidecars, `window.neo.readJSON/writeJSON(bookId, 'neo-ext-<name>', …)`; one path segment (`libName`), so no subfolders. Debounce writes like `writeSidecar` in `app.js` does. Chapters are never rewritten to hold plugin data.
- Merge-tolerant data: append-only, id-keyed records reconciled by union on read (`{id, chapterId, at, …}`). Two devices then add to each other instead of last-write-winning. Never store a mutable running total; compute it.
- Anchors for character/item/world notes: `data-sec-id` (the same id `book.sectionNotes` uses) plus paragraph ordinal and a short text hash as fallback for finding the words again after edits or an upstream restore. Chapter id alone is too coarse.
- Custom-word additions: reuse the existing path — `spell:learn` for the running checker plus `library.customWords` via the core `writeLibrary` generation check. Do not invent a second word list.
- i18n: plugin strings stay in `neo-ext/locales/`, translated by a small key-equals-English helper in `boot.js`. Do not add files to `scripts/i18n.js`'s scanner (it would drag fork strings into upstream's template).
- Pocket: `scripts/pocket-www.js` copies a fixed file list only, so fork features stay desktop-only. If a feature must reach Pocket, add its files to that copy list and guard missing DOM.
- Never inline script or use `eval` (CSP `script-src 'self'`); all disk access stays behind `window.neo`.
- Simple NEO: menu items added through seam 6 carry `more: true`, **except** everyday ones a simple writer still needs (Backup Book…, Settings…); plugin tabs and buttons check `moreOn()` (through `api.js`) and stay hidden while it is off.
- Lint covers `neo-ext/` (`npm run lint`). Tests for pure plugin logic go in new `scripts/*.test.js` files; don't edit existing tests, and keep the `// ---- … rules ----` marker pairs intact.

### The right-hand pane's width (adr-004)

`neo-ext/side-resize.js` prepends a 10 px separator to `#side-pane`; `neo-ext/lib/side-resize.js` holds the pure bounds, drag, key, and saved-value rules. The width is published as `--neo-side-w`; the six page offsets that assume core NEO's 250 px are overridden in `neo-ext/neo-ext.css` (`scripts/side-resize-css.test.js` fails if upstream renames one). The chosen width lives in this device's `localStorage` under `neo-ext-side-width`, never in `book.json` or `library.json`.

The handle is a zero-height `position: sticky` element, not `fixed` like `#side-pin`: a fixed child inside the transformed, scrolling pane moves with the notes. Its pseudo-elements carry the hit area and the line, and a drag re-asserts `.open` on `pointermove`, `mouseleave`, and `blur` so the pane cannot slide away under the pointer. Pinned (and on Darlings, which holds the pane open) the width stops at the room the page leaves, measured from `#paper-scroll` and a pinned `#nav-pane`; the Outline's board is exempt because its cards are meant to shrink. Resize-driven re-clamps are skipped while `body.neo-ext-resizing` is set.

The whole feature is behind Show More Features: with it off the handle is hidden and the pane stays 250 px, while the stored width waits for the switch's return. It adds no seam, no IPC, no storage in the library, and no entry to `scripts/pocket-www.js`, so Pocket keeps its own pane. `npm run test:sidepane` covers drag, keys, limits, persistence, page geometry, tabs, and the no-writes guarantee on a real launch.

### Records in the right-hand pane (adr-005)

`neo-ext/records.js` injects `#neo-side-tabs` and `#neo-records-view` into `#side-pane`; `neo-ext/records-list.js` renders the grouped list, folder headings, search and rows; `neo-ext/lib/records-store.js` owns validation, merge and the record/folder mutations; `records-search.js` owns matching and ranges; `records-main.js` owns `records.json`. Tabs show on the Manuscript and Notes bottom tabs only; Outline and Darlings keep their pane. The pane's core lists are hidden with the `neo-records-open` class, never rewritten, so the Notes page and left nav are untouched.

`records.json` is library-wide at the library root, written through `neo-ext:records-read/write` with a fixed name, `whenLocal`, core's `writeFileDurable`, a `.bak`, and a merge inside the write. Field stamps (`titleAt`, `bodyAt`, `folderAt`) merge per field; a deletion tombstone is final. Descriptions are plain text in `contenteditable="plaintext-only"`; titles and folder names use `textContent`. Search paints `::highlight(neo-record-search)` and never changes the file.

The whole feature is behind Show More Features. With it off the tab strip is hidden and the pane stays on Notes; the file is untouched. Pocket's copy list is unchanged. `npm run test:records` covers the pane, editing, folders, search, two books, Esc and no book writes; `scripts/records-store.test.js`, `records-search.test.js`, `records-ipc.test.js`, and `records-backup.test.js` cover the store, search, IPC and backup.

### Record tags (adr-006)

`neo-ext/lib/record-tags.js` owns what a tag is: its key, active tags, the 120-character phrase bound, the 50-tag limit, the Create/Find action vocabulary, and one paragraph scanner. `records-store.js` stores `tags: [{ text, at, removedAt }]` inside each record, owns the store-wide tag list (`storeTags`), existence (`tagExists`), and records-by-tag (`recordsWithTag`), and merges per tag; it refuses to load without the tag module rather than run a fallback copy. Add refuses past 50 **active** tags, so a removal frees a place; reading and merging never drop a live tag or a tombstone, even when two copies together exceed 50. An unreadable tag is dropped alone, and the record is kept. Equal event stamps resolve toward the removal, so a copy cannot revive a removed tag. `records-search.js` matches a record's active tags as well as its title and description, through `activeTags`, with no stamp logic of its own.

`word-context.js` keeps its single-word lexical context and adds a phrase side-channel: a selection in one chapter paragraph (≤120 chars, no line break) is stored with `hasTag` through `setContextPhrase`; `word-context-main.js` keeps it per window with the same 5 s TTL; `lib/record-tags-main.js` turns it into **Create Record…** or **Find Record…**. The native menu no longer returns on an empty word when a phrase exists. The macOS Look Up seam forwards every non-lookup choice, so a one-word selection carries the same item. The English spellcheck gate stays on lexical items only.

Choosing Create pins the right pane and creates the title/first tag from the phrase; a phrase no tag can hold fails and says so rather than making an untagged record. Choosing Find fills the records search. A tag chip calls `api.openFind(tag)`, which switches to Manuscript and reuses the core Find bar. The status-bar eye lives in `neo-ext/record-tag-highlight.js` (per-device `neo-record-tag-highlight`, default off): it paints `CSS.highlights` `neo-record-tag`, scans on toggle/tag change/book open/mounted chapter/resize, and re-reads only the typed chapter after typing settles, so Enter never starts a book scan. It paints at most 200 distinct tags and 2,000 ranges, shows only with Show More Features on, a book open, and a tag present, and clears and blocks itself when the switch goes off. No tag or highlight writes a chapter or `library.json`; `records.json` carries tags into both backups.

### Inventory (adr-008)

A book can carry a ledger of items and status — coins, health, magic — and the pane shows the balance as of the chapter the writer is in. `neo-ext/lib/inventory-ledger.js` is pure (items, transactions, `balances`, `log`, merge) and `neo-ext/lib/inventory-anchor.js` is pure too (hash, reconcile). `neo-ext/inventory.js` owns the pane view, the modal, the log, and reconciliation; `neo-ext/inventory-main.js` owns the book's file.

- **File:** `neo-ext-inventory.json` in the book folder, read and written by `neo-ext:inventory-read/write` with a book id (never a path), merge-on-write, `.bak`, iCloud wait, a size cap, and a corrupt main file recovered from its backup. The merged ledger is checked against the same limits the reader applies, so a merge can never write a file Inventory would refuse. Both backups carry it because every file in the book folder is copied. Pocket is unchanged, so Inventory is desktop-only. A pending save remembers the book it was recorded in and is written there before the next book loads.
- **Shape:** `{ format, items: [{ id, name, nameAt, category, categoryAt, createdAt, deletedAt }], transactions: [{ id, itemId, chapterId, sectionId, paragraph, quote, hash, amount, at, removedAt }] }`. A new item reuses an existing name (case-insensitive); a merge folds same-name items and re-points their transactions.
- **Balances:** chapter order is `book.chapterOrder`; inside a chapter the log sorts by paragraph, then time, then id. Balances count only the open chapter and the chapters before it, and the whole book when no chapter is current. Chapter labels use the chapter's title, then core's name. Scrolling or moving the caret to another chapter re-renders them.
- **Unreadable chapters:** `neo-ext:inventory-unreadable` reports chapters that are cloud placeholders or cannot be read; while any exist, nothing is retired or moved and the pane says it is waiting. Missing chapter files are empty chapters, not unreadable ones.
- **Anchor / retirement:** a transaction follows its phrase. A section whose text hash still matches keeps in one comparison; otherwise the quote is searched in the section, the chapter, the other chapters, then loose and held cards. It retires only when the phrase is nowhere in the book's text. An ambiguous quote (two places, neither the recorded one) keeps its anchor rather than guessing; an unreadable or iCloud chapter defers its anchors. Reconciliation runs after a chapter save settles, on book open, after a structural change, on disk adoption, and on focus; it writes only when something changed. A log line also offers **Remove transaction** after a confirmation.
- **Reconcile cost:** typing re-reads only the typed chapter (`reconcile` takes a chapter scope); a whole-book pass runs on open, focus, and structural change. A clean pass writes nothing.
- **Selection:** `word-context.js` publishes the selection (phrase, paragraph, range) and each provider answers for itself; a placeholder paragraph yields no anchor, so no Inventory item; `NeoInventory.selectionAnchor` builds the anchor and `setContextPhrase` carries `{phrase, hasTag, inventory, records, anchor}` so a broken records file never disables Inventory. The native menu builds phrase items from a provider list (`record-tags-main` + `inventory-main`), separate from `menu-registry`'s word items; the macOS Look Up popup offers Inventory… for one word.
- **Pane:** Inventory joins the existing strip through `NeoRecords.registerView`, so Records keeps the strip, keys, Simple NEO gating, Esc, and the flush before hiding. The modal is `modal-backdrop` in `document.body` at the fork's dialog layer, so NEO sees it, and carries the core `modal` class so the app's surface, text colour, Interface Size zoom, and light theme apply; only size, padding, and layout are overridden (dividing heights by `--ui-zoom`). It is a flex column: the item list takes the stretch (9 rem minimum) and scrolls, Save/Cancel stay at the bottom, creating an item is a **+ New item** reveal, and a picked row stays visible even when a search excludes it. Focus, error text, and list scroll are one modal state projected by `renderModal`, so a collapse or failed Save cannot drop focus behind the dialog or leave a stale message. The amount field takes one leading sign and digits only: a separator, second sign, or sign after the first character is refused and the last valid value kept (letters are dropped). Folds reset when the view is reopened. A jump uses `api.revealPhrase`/`phraseLocatable` (guarded; moves view and selection, never edits) and is offered only when the phrase can still be found. A jump or view change may let core write `lastPosition`; nothing else of the book is written.
- **Never:** a transaction, jump, or reconcile writes a chapter, notes page, `book.json` content (beyond NEO's own last position), `library.json`, snapshot, or darling. The only file written is the ledger, and only while Show More Features is on; with the switch off nothing is read, reconciled, or written (a save already in flight may finish).

### Rephrase with the local model (adr-012)

Selecting a word up to a small paragraph (1,200 characters, one block) offers **Rephrase…** in the native menu and, for one word on macOS, in the Look Up popup. It asks the local model for one rewrite per writing profile and replaces the selection as one undoable edit.

- **Settings:** File → Settings… gains tabs (**General**, **AI**); groups register with `tab`, and `neo-ext/settings.js` renders all visible groups, hiding inactive tabs so Save stays whole-window. Save validates every group before writing anything, then writes settings, then the key.
- **AI group (`neo-ext/rephrase-settings.js`):** endpoint, model, key (**Replace…**), base instruction, 2–8 editable profiles (default Polite/Common/Natural/Heroic/Terse — no Literary), and **Test connection**. Stored per device in `settings.json.rephrase`; the key is the encrypted secret `rephrase-key` (`safeStorage` where available, with the AI tab saying when it is not). The tab is behind Show More Features.
- **Endpoint rule (`neo-ext/lib/rephrase-endpoint.js`):** http/https only, no userinfo, host `127.0.0.1`/`[::1]` or `localhost` resolved to loopback; `0.0.0.0`/`::`/remote refused. Save, Test, and the call all use it; redirects are not followed, and the final response URL must stay loopback. TLS verification is never relaxed.
- **Selection (`neo-ext/lib/rephrase-context.js`):** one paragraph/heading, 1,200 characters, exact text kept for replacement; before/after paragraphs capped at 700 characters and taken from the same chapter, skipping ghosts and scene breaks. The phrase payload carries only a `rephrase` flag; the text stays in the renderer.
- **Sessions (`neo-ext/rephrase-main.js`):** `rephrase-start` snapshots endpoint/model/prompt/profiles for the window (5-minute TTL); `rephrase-run` takes `{session, profileId, text, before, after}`, re-checks caps, resolves the profile from the snapshot, reads the key, and makes one POST per profile; `rephrase-end` releases it. The 30-second timeout covers the response body, not just the headers. Settings saved mid-window do not change open cards.
- **Prompt (`neo-ext/lib/rephrase-prompt.js`):** instructions come only from settings; the base instruction is the system message; profile, reference paragraphs, and selection are delimited **data** in the user turn, with delimiter words stripped from the manuscript text.
- **Replies (`neo-ext/lib/rephrase-check.js`):** empty, context-copied, selection-as-prefix/suffix continuation, over-2.5× and under-floor replies are rejected; a leading profile label is stripped first and then whole-reply quotes; one silent retry, then the card shows **Try again**. Failures say the same sentence in the window and Settings through `neo-ext/lib/rephrase-reasons.js`.
- **Window (`neo-ext/rephrase.js`):** refuses to open over another NEO dialog; one card per snapshot profile (`role=button`, Enter/Space), filled sequentially; a failed card has a focused **Try again** button; Tab stays inside; 30 s per call and a 120 s queue budget; Esc/close/choice/Show More Features off stops pending work and discards late answers; cards and quote are `textContent` only. A 404 is `notFound`, not a host problem; the secret name comes from the settings read; an emptied model/endpoint is refused.
- **Replacement:** alive check normalises both `range.toString()` and the captured text, then editor focus + `execCommand('insertText')`, so it is one undo step and arrives through the normal `input` path. A moved selection writes nothing.
- **Never:** opening the window, generating, cancelling, or a failed call writes a chapter, notes, `book.json`, `library.json`, or the library. Logs carry `rephrase: <reason>` only — no URL, key, prompt, selection, or reference text. Pocket has none of this.

### History of replacements (adr-014)

The right pane's fourth view: every replacement a tool made in the open book, newest first, with both texts, the tool (and a Rephrase profile), the time, and the chapter number as it stood then. Read-only — it restores nothing; Snapshots is still where words come back.

- **File:** `neo-ext-history.json` in the book folder, `{ format: 1, entries: [...] }`, read and written by `neo-ext:history-read` / `neo-ext:history-add` with a book id (never a path), an iCloud wait, a `.bak`, a 4 MB and 10 000-entry cap, and core's durable write. The main process stamps `id` (`crypto.randomUUID()`) and `at`; the renderer supplies the meaning. No chapter, notes page, `book.json`, or `library.json` is touched. Both backups carry it because every file in a book folder is copied.
- **Shape:** `{ id, at, tool, label, from, to, chapterId, chapterNumber, chapterTitle, shortened }`. `tool` is a lowercase slug (`thesaurus`, `rephrase`, and later tools); a side over 5,000 characters is truncated and `shortened` says which side. `chapterNumber` is 1-based at the moment of replacement, and 0 with no `chapterId` for a notes page or footnote.
- **Merge:** append-only, union by `id`, no tombstones, newest first by `at` then `id` (derived on read, never stored). A write re-reads, merges, appends, validates, and only then writes; the write chain serialises two recordings. A corrupt main file is shown from `.bak` and is never overwritten — the write answers `unreadable` until the writer repairs it. A symlink is refused (`lstat`, `isFile`), and the backup is written to `.bak.tmp` and renamed over `.bak`, so a planted link is replaced and a failed copy keeps the previous backup.
- **Recorder (`neo-ext/history-record.js`):** one API, `NeoHistory.record({ tool, label, from, to, inChapter })`, called by Thesaurus after `insertText` succeeded with the text actually inserted, and by Rephrase with the chosen card's text and profile. It refuses with no book, Show More Features off, no bridge, a bad tool, empty/unchanged sides. A failure sets the view's notice (never a toast) and logs a reason only; success clears it and asks the view to refresh. A book switched mid-write does not let this view adopt the other book.
- **View (`neo-ext/history.js`):** registers last with `NeoRecords.registerView`, so the strip reads Notes | Records | Inventory | History and inherits Show More Features, the Manuscript/Notes restriction, `allowedTab`, and Esc. Rows are `textContent` only. A book switch reloads (seam 4, `neo-ext:book-opened`); a read failure keeps no stale rows and is retried next time; a record made while the tab is hidden forces a re-read on return.
- **Never:** viewing, recording, or a failed record writes a chapter, notes, `book.json`, `library.json`, a snapshot, or a darling. Pocket is untouched: its copy list does not include these files.

### Interface Size in Settings (adr-015)

File → Settings… → General carries **Interface Size**: Smaller, the percentage, Larger, and Reset, from 90% to 300% in tenths. It is the same `library.uiZoom` as View → Interface Size, so the menu item (still behind Show More Features) and the setting never disagree.

- **Policy (`neo-ext/interface-size.js`):** owns the percentage text, the step, the preview, the group, and the Simple NEO decision. Seam 12 lets core's `applyFonts` ask `NeoExt.uiZoom(library, moreOn())`; the module answers with the snapped stored size in either mode. `boot.js` also re-applies `applyFonts` once after load, because the library can resolve before the fork scripts and Simple NEO would otherwise sit at 100% until the next read.
- **Write (`api.setUiZoom`):** snaps, writes through core's `writeLibrary` only when the value changed, applies fonts, and on failure restores both the in-memory value and the device copy (`rememberDeviceLook`) before answering `{ ok: false }`. The group turns that into one sentence; no path or raw error reaches the window.
- **Preview:** sets `--ui-zoom`, toggles `ui-zoomed`, and sends `uizoom:state` for the menu label — no write. Cancel, Escape, and a backdrop click preview the value stored at that moment (so a View-menu step taken while the window was open is kept); Save closes with `true`; a save in flight ignores Cancel/Escape (`saving` guard in `settings.js`).
- **Surfaces:** everything except the page. The fork toast joins the zoomed surfaces; the fork dialogs divide their widths and heights by `--ui-zoom` so the Settings, Thesaurus, and Dictionary windows stay on screen at 300%. Page zoom, editor type size, and page width are untouched.
- **Not changed:** the one-time Simple NEO migration (`usesMoreFeatures`) still reads a non-100% size as a sign of full NEO; that is upstream code and out of scope here.
- Tests: `scripts/interface-size.test.js`, `scripts/interface-size-css.test.js`, `scripts/api.test.js`, and `npm run test:interface-size`.

### Interface text size (adr-016)

File → Settings… → General also carries **Interface text**: 90% to 200% in tenths, with its own Reset. It grows only the text of the fork's surfaces — the right pane, the fork dialogs, the toasts, and the hints — while their boxes, the pane width, and Interface Size stay where they are. The shelf, navigation pane, and menus keep following Interface Size.

- **Value:** `library.uiText`, default 1, snapped by `api.snapUiText` (0.9–2). It is in `DEVICE_LOOK` (seam 13); `applyDeviceLook` keeps the library's value for a device whose stored look predates the key (seam 15).
- **Publication:** seam 14 calls `NeoExt.uiText(library)` from `applyFonts`, and `boot.js` delegates to `NeoInterfaceSize.applyText`, which writes `--ui-text`; `boot.js`'s re-apply covers the boot order for both sizes.
- **The multiplier:** every numeric `font-size` in `neo-ext/neo-ext.css` is `calc(<size> * var(--ui-text, 1))`, and rules that inherit text (Settings, Thesaurus, Dictionary) get a scaled base. Core `styles.css` is never edited, which is what bounds the feature to the fork's surfaces.
- **Write:** `api.setUiLook({ uiZoom, uiText })` writes both in one library write, restores both and the device copy on failure, and applies fonts once; `setUiZoom`/`setUiText` are single-key wrappers. The group saves through it, so one size can never be kept while the dialog says the save failed.
- Tests: `scripts/interface-size.test.js`, `scripts/interface-size-css.test.js`, `scripts/api.test.js`, `npm run test:interface-size`.

### Grammar review (adr-017)

Writing a selection offers **Grammar…** in the native menu and, for one word, in the Look Up popup. It uses Rephrase's selection limits (one block, 1,200 characters) and the machine's local model.

- **Answer:** `neo-ext/lib/grammar-issues.js` reads one JSON object per line (`quote`, `fix`, `message`) or a single `CLEAN` line. An empty or prose answer with no CLEAN is unreadable. A no-op fix is dropped; a missing message is a not-applied card; an unlocatable or overlapping quote is not applied; the first 40 in answer order survive. Any not-applied issue or malformed object line buys one retry, which replaces the answer. The model never supplies a corrected passage. A quote the model lowercased is matched without case and takes the selection's own characters; a whole-word deletion takes one neighbouring space with it; a fix that opens a sentence takes the capital; an error the model reports twice (a wide quote and the narrow one, both reducing to the same change) collapses to one card instead of a not-applied twin; and an issue whose quote is found in the `<reference>` context rather than in the selection is dropped (matched as a whole word of 4+ characters, so a stray common word is not mistaken for a context fix), because those paragraphs are context, not something to check. The grammar pass runs at temperature 0, so one passage gets one answer.
- **Board:** `neo-ext/grammar-board.js` builds the corrected text from the accepted fixes (green), the original (red grammar, yellow style), numbered cards, and SVG lines. Everything is a text node. The text keeps the full width and the cards sit under it in a grid of rows (`repeat(auto-fill, minmax(15rem, 1fr))`), so a line leaves the middle of the marked word's underline, crosses the 34 px gap under the text, and meets the middle of its card's top border (`lineEnds`), instead of hugging the sentence or crossing the words to the card's side; an inserted word gets an empty caret span at the gap, because a card with no wrong words would otherwise have nothing to join. The card list scrolls on its own. Lines divide `getClientRects()` by the Interface Size zoom; at a local width under 560 px the cards take the full width and the lines are hidden. The waiting line is focused so a screen reader announces it, and its focus ring is turned off. **Suggest style** turns a small wheel beside the button while the pass waits (`.neo-grammar-spinner`, `grammar.js` toggles `view.spinner`), and the style notice ("Nothing to suggest.") renders in `.neo-grammar-top` under that button rather than at the window's foot.
- **Prompts:** `neo-ext/lib/grammar-prompt.js` owns both system turns. The style pass sends the original as `<selection>`, the corrected text as `<reference side="corrected">`, quotes from the original, and at most three; a quote not in the original or over a grammar fix is dropped.
- **Service:** `neo-ext/grammar-main.js` reads `settings.rephrase` through `rephrase-prompt.normalizeSettings`, keeps a 15-minute session (endpoint and model only; the key is read per request), and calls `neo-ext/llm-client.js`, the request/redirect/timeout/status path shared with Rephrase and capped at 2 MB. Its timeout is 90 s (`GRAMMAR_TIMEOUT_MS`), not the client's 30 s default: a 1,200-character passage needs a long JSONL answer and a 4B on a laptop is slow.
- **Outcome:** Replace first checks the range still holds the selection, inserts the corrected string with `execCommand('insertText')` (one undo step), records `tool: 'grammar'` in History, and is disabled when the text is unchanged, empty, or over 2,000 characters. Close, Esc, and the close control write nothing.
- **Gate:** Show More Features only; turning it off closes the board and discards a late answer. Pocket has none of it.
- Tests: `scripts/grammar-issues.test.js`, `grammar-prompt.test.js`, `llm-client.test.js`, `grammar-main.test.js`, `grammar-menu.test.js`, `grammar-view.test.js`, `npm run test:grammar`.
- **Model benchmark (tooling, never the build):** `scripts/grammar-model.e2e.js` runs the app's real prompt and parser against the local model over three corpora of 100 single-error cases (ten per kind) and 20 clean controls each: `grammar-cases.json` (plain sentences), `grammar-cases-literary.json` (novel prose, long clauses, dialogue-adjacent lines) and `grammar-cases-chapter.json` (one chapter's voice: invented names, dialogue, monologue). Each chapter case carries `quote`, the wrongly written span, and the pass requires the single applied issue to cover exactly those words, so a card that highlights the whole sentence fails even when the correction is right. `npm run test:grammar-model -- --corpus grammar-cases-literary.json --runs 3 --temperature 0 --prompt <file> --report <out.json>`; `--prompt` tries a candidate without touching the app. It skips when no key is configured and is not in `npm test`, CI, or packaging, because a build machine has no model. The shipped prompt scores 112/120 (93%), 102/120 (85%) and 95/120 (79%) with 20/20, 20/20 and 19/20 clean on `qwen3.5-4b`; the chapter corpus is hardest because a 4B does not know which invented words are names (`ringobell`, `Xuan yuan`, `dao armor`). Two prompt shapes were measured repeatedly: rules alone raise error recall, examples raise it more, and both make the model invent a change in a correct sentence; opening the turn with "Step 1. Is the sentence already grammatical? If it is, reply CLEAN" is what bought literary clean controls (11/20 -> 20/20). A prompt that adds more rules or is rewritten tidier scores worse, so grow it by measurement on both corpora only.

### Grammar's own AI settings (adr-018)

Settings → **AI Grammar** holds an Endpoint, Model, API key, and Prompt for the grammar pass, stored in `settings.json` under `grammar` on this device (the Rewrite tab is **AI Rephrasing**). An empty endpoint or model is stored empty and follows the Rewrite setting, so a later change there reaches Grammar; the tab shows the inherited value as the field's placeholder. The Prompt field shows the prompt in force — NEO's built-in text when nothing is stored — and carries **Restore default prompt**; a save that leaves the default untouched stores `''`, so a later improvement to NEO's prompt still reaches the writer (`systemFor`). The Rewrite tab's Base instruction and its Profiles carry the same restore buttons (`neo-ext/settings.js` renders `reset` on a textarea and on the profiles list). Each setting is a padded row block (`.neo-ext-row`), so a label never reads as part of the block above it, and a Choose…/Replace… button stretches to the height of its field. The key is the secret `grammar-key`, falling back to `rephrase-key` — unless the writer cleared it (`grammar.keyCleared`). The prompt, endpoint, and model are snapshotted when the window opens, so a settings change does not alter a question already asked.

- `neo-ext/lib/grammar-config.js` is pure (defaults, normalized fallback, caps, secret name); `neo-ext/grammar-settings.js` is the tab; `grammar-main.js` owns get/save/validate/test and the key order.
- Saving refuses to write when `settings.json` cannot be read: the core reader reports a corrupt file as `{}`, so `neo-ext/main.js`'s `settingsBroken()` checks the file itself, and `{} + grammar` would otherwise erase `libraryDir`. The Rewrite save uses the same check.
- A failed settings load renders its note and refuses the save, so a blank form cannot erase what the file still holds.
- Test connection sends the stored key only to the stored endpoint; a different endpoint needs a key typed beside it.
- Prompt in Settings is the system turn only; the selection still travels as data, and an issue is applied only when its quote occurs in the selection.

### How the planned features fit

- **Per-chapter word count**: seam 3 plus `chapterWords(chId)`; render in the counter strip. Derived only, nothing stored, so nothing to sync.
- **Thesaurus / synonyms**: seam 5 item on a word selection, popup in the renderer, replace through a `Range` over the selection. Keep the word data behind one module (`neo-ext/thesaurus.js`) so a local list, an offline dictionary, or an API each drop in without touching UI code.
- **Character/item info and word links**: own sidecar (`neo-ext-notes.json`) keyed by section id and paragraph ordinal; right-pane tab injected without a seam; a link from a word is an anchor record, not markup in the chapter.
- **Inventory / status across chapters**: append-only ledger (`neo-ext-ledger.json`) of `{id, chapterId, item, delta, at}`; totals are a running balance in chapter order, so "spent 100 of 150 in ch.1" blocks the ch.2 spend by arithmetic, and two devices merge by unioning entry ids.

