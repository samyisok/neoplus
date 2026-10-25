#!/usr/bin/env node
// NEO fork — keep the version honest (adr-002)
//
// package.json carries upstream's version plus the fork's ADR number. This
// check fails when the two drift, so an archived feature cannot ship under the
// previous fork number. Only archived ADRs count: a change still in
// openspec/changes/ has not shipped, so proposing one does not raise the
// number (adr-003). Run: node neo-ext/check-version.js

'use strict';

const fs = require('fs');
const path = require('path');

const version = require('./lib/version.js');

const ROOT = path.join(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

const parsed = version.parse(pkg.version);
if (!parsed) {
  console.error(`version "${pkg.version}" must look like 1.6.0+fork.2 (upstream + fork ADR number)`);
  process.exit(1);
}

const expected = version.highestAdr(ROOT);
if (expected && parsed.fork !== expected) {
  console.error(`version says fork ${parsed.fork}, but the highest ADR is ${expected}. Set "version" to "${version.format(parsed.upstream, expected)}".`);
  process.exit(1);
}

console.log(`Version ${pkg.version}: upstream ${parsed.upstream}, fork ${parsed.fork}${expected ? ` (ADR-${String(expected).padStart(3, '0')})` : ''}.`);
