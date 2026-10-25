// NEO fork — two versions in one string (adr-002)
//
// The upstream release and the fork's ADR number must not drift: About, the
// AppImage name, and the desktop entry all read package.json.

'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const version = require('../neo-ext/lib/version.js');

const ROOT = path.join(__dirname, '..');

test('parse: upstream plus fork number, nothing else', () => {
  assert.deepEqual(version.parse('1.6.0+fork.2'), { raw: '1.6.0+fork.2', upstream: '1.6.0', fork: 2 });
  assert.equal(version.parse('1.6.0'), null);
  assert.equal(version.parse('1.6.0-fork.2'), null);
  assert.equal(version.parse('1.6+fork.2'), null);
  assert.equal(version.parse(''), null);
});

test('format: round-trips and refuses nonsense', () => {
  assert.equal(version.format('1.6.0', 2), '1.6.0+fork.2');
  assert.deepEqual(version.parse(version.format('2.0.1', 12)), { raw: '2.0.1+fork.12', upstream: '2.0.1', fork: 12 });
  assert.throws(() => version.format('1.6', 2));
  assert.throws(() => version.format('1.6.0', 0));
});

test('repository: the fork number is the highest archived ADR', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const parsed = version.parse(pkg.version);
  assert.ok(parsed, `package version ${pkg.version}`);
  const highest = version.highestAdr(ROOT);
  assert.ok(highest > 0, 'no ADR change found');
  assert.equal(parsed.fork, highest, `version fork ${parsed.fork}, highest ADR ${highest}`);
});

test('repository: the lockfile carries the same version', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  const lock = JSON.parse(fs.readFileSync(path.join(ROOT, 'package-lock.json'), 'utf8'));
  assert.equal(lock.version, pkg.version);
  assert.equal(lock.packages[''].version, pkg.version);
});
