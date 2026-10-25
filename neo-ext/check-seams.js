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
// in AGENTS.md; future seams (switchTab, counters, openBook, context menu) are
// added here when they are implemented.
const SEAMS = [
  ['index.html', ['NEO-EXT seam', 'neo-ext/boot.js', 'neo-ext/settings.js', 'neo-ext/api.js']],
  ['preload.js', ['NEO-EXT seam', "exposeInMainWorld('NeoForkNative'"]],
  ['main.js', [
    'NEO-EXT seam',
    'require(\'./neo-ext/main.js\').init({',
    '.appMenu(template, { more: moreState, bookOpen: bookOpenState });',
    '.backupDir(LIBRARY_DIR);'
  ]]
];

// order matters for the menu seam: adding items after buildFromTemplate is
// the bug it exists to avoid
function orderProblem(file, text) {
  if (file !== 'main.js') return null;
  const seam = text.indexOf('.appMenu(template, { more: moreState, bookOpen: bookOpenState });');
  const built = text.indexOf('Menu.buildFromTemplate(simpleTemplate(template, moreState))');
  if (seam < 0 || built < 0) return null;
  return seam < built ? null : 'appMenu seam must sit before Menu.buildFromTemplate(simpleTemplate(...))';
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

if (missing) {
  console.error(`\n${missing} seam(s) missing — upstream moved something. Fix the seam (see AGENTS.md) before shipping.`);
  process.exit(1);
}
console.log('All neo-ext seams are in place.');
