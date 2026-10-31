#!/usr/bin/env node
// NEO fork — assert every seam still exists (adr-001)
//
// Upstream files are edited in a handful of marked lines. A merge that
// rewrites one of those areas fails here, loudly, before the feature quietly
// stops working. Run: node neo-ext/check-seams.js

'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

// file -> substrings that must be present. Keep in step with the seam table
// in AGENTS.md; future seams (switchTab, counters, openBook) are added here
// when they are implemented.
const SEAMS = [
  ['index.html', ['NEO-EXT seam', 'neo-ext/boot.js', 'neo-ext/settings.js', 'neo-ext/api.js', 'neo-ext/thesaurus-window.js', 'neo-ext/thesaurus.js', 'neo-ext/lib/word-forms.js', 'neo-ext/lib/thesaurus-lookup.js', 'neo-ext/word-context.js', 'neo-ext/dictionary-window.js', 'neo-ext/dictionary.js', 'neo-ext/lib/side-resize.js', 'neo-ext/side-resize.js', 'neo-ext/lib/record-tags.js', 'neo-ext/lib/inventory-ledger.js', 'neo-ext/lib/inventory-anchor.js', 'neo-ext/lib/records-store.js', 'neo-ext/record-tag-highlight.js', 'neo-ext/lib/records-search.js', 'neo-ext/records-list.js', 'neo-ext/records.js', 'neo-ext/inventory.js', 'neo-ext/lib/rephrase-context.js', 'neo-ext/lib/rephrase-endpoint.js', 'neo-ext/lib/rephrase-prompt.js', 'neo-ext/lib/rephrase-check.js', 'neo-ext/lib/rephrase-reasons.js', 'neo-ext/rephrase-settings.js', 'neo-ext/rephrase.js']],
  ['backup-worker.js', ['records.json', "!name.endsWith('.tmp')"]],
  ['preload.js', ['NEO-EXT seam', "exposeInMainWorld('NeoForkNative'"]],
  ['main.js', [
    'NEO-EXT seam',
    'require(\'./neo-ext/main.js\').init({',
    '.appMenu(template, { more: moreState, bookOpen: bookOpenState });',
    '.backupDir(LIBRARY_DIR);',
    '.contextMenu(items, params, win);'
  ]],
  ['app.js', [
    'NEO-EXT seam',
    'NeoExtApi.lookUpMenu(items, word)',
    'window.NeoExtApi) window.NeoExtApi.lookUpChoice(choice, word)'
  ]]
];

// Order matters for both menu seams: adding items after the menu is built (or
// after the Look Up popup is rendered) is the bug they exist to avoid.
function orderProblem(file, text) {
  if (file === 'main.js') {
    const seam = text.indexOf('.appMenu(template, { more: moreState, bookOpen: bookOpenState });');
    const built = text.indexOf('Menu.buildFromTemplate(simpleTemplate(template, moreState))');
    if (seam < 0 || built < 0) return null;
    return seam < built ? null : 'appMenu seam must sit before Menu.buildFromTemplate(simpleTemplate(...))';
  }
  if (file === 'app.js') {
    const add = text.indexOf('NeoExtApi.lookUpMenu(items, word)');
    const menu = text.indexOf('popMenu(e.clientX, e.clientY, items)');
    if (add < 0 || menu < 0) return null;
    return add < menu ? null : 'lookUpMenu seam must sit before the Look Up popMenu call';
  }
  return null;
}

let missing = 0;
for (const [file, anchors] of SEAMS) {
  let text = '';
  try {
    text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  } catch (err) {
    console.error(`MISSING FILE ${file}: ${err.message}`);
    missing++;
    continue;
  }
  for (const anchor of anchors) {
    if (!text.includes(anchor)) {
      console.error(`MISSING SEAM ${file}: ${anchor}`);
      missing++;
    }
  }
  const order = orderProblem(file, text);
  if (order) {
    console.error(`SEAM OUT OF ORDER ${file}: ${order}`);
    missing++;
  }
}

// The rephrase page scripts must load in dependency order.
try {
  const page = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  const ordered = [
    'neo-ext/lib/rephrase-context.js',
    'neo-ext/lib/rephrase-endpoint.js',
    'neo-ext/lib/rephrase-prompt.js',
    'neo-ext/lib/rephrase-check.js',
    'neo-ext/lib/rephrase-reasons.js',
    'neo-ext/rephrase-settings.js',
    'neo-ext/rephrase.js'
  ];
  for (let i = 1; i < ordered.length; i += 1) {
    const prior = page.indexOf(ordered[i - 1]);
    const here = page.indexOf(ordered[i]);
    if (prior < 0 || here < 0 || here <= prior) {
      console.error(`SCRIPT ORDER index.html: ${ordered[i]} must load after ${ordered[i - 1]}`);
      missing++;
    }
  }
} catch (err) {
  console.error('SCRIPT ORDER index.html: could not be checked: ' + (err && err.message));
  missing++;
}

if (missing) {
  console.error(`\n${missing} seam(s) missing — upstream moved something. Fix the seam (see AGENTS.md) before shipping.`);
  process.exit(1);
}
console.log('All neo-ext seams are in place.');
