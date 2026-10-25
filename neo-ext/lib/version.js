// NEO fork — the two versions, in one string (adr-002)
//
// The upstream project owns `1.6.0`. The fork owns the ADR number: each
// archived change raises it. Semver build metadata joins them without
// changing what npm or electron-updater consider the app's version:
//
//   1.6.0+fork.2   upstream 1.6.0, fork change 2 (ADR-002)

'use strict';

const fs = require('fs');
const path = require('path');

const FORM = /^(\d+\.\d+\.\d+)\+fork\.(\d+)$/;

function parse(text) {
  const match = FORM.exec(String(text || ''));
  if (!match) return null;
  return { raw: String(text), upstream: match[1], fork: Number(match[2]) };
}

function format(upstream, fork) {
  if (!/^\d+\.\d+\.\d+$/.test(String(upstream || ''))) throw new Error('upstream version must be x.y.z');
  if (!Number.isInteger(fork) || fork < 1) throw new Error('fork version must be a positive integer');
  return `${upstream}+fork.${fork}`;
}

// The highest ADR number among the archived changes. A change is a feature;
// its number is the fork's version once it ships. An active change has not
// shipped yet, so it must not raise the number it is about to claim (adr-003).
function highestAdr(root) {
  const archive = path.join(root || '.', 'openspec', 'changes', 'archive');
  let best = 0;
  let names = [];
  try { names = fs.readdirSync(archive); } catch { return best; }
  for (const name of names) {
    const match = /(?:^|-)(adr-(\d{3}))(?:-|$)/.exec(name);
    if (match) best = Math.max(best, Number(match[2]));
  }
  return best;
}

module.exports = { parse, format, highestAdr };
