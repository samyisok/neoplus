#!/usr/bin/env node
// NEO fork — build the offline English thesaurus (adr-002)
//
// Reads LibreOffice's en_US MyThes file (WordNet 2.1 derived), writes one
// gzipped JSON shard per headword letter plus a manifest. Run by hand when the
// upstream file changes; the output is reviewed and committed.
//
//   node neo-ext/tools/build-thesaurus.js <th_en_US_v2.dat> [--sha256 <hex>]
//        [--out <dir>] [--license <file>] [--commit <sha>] [--url <url>]

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const FORMAT = 2;
const DEFAULT_COMMIT = '2f0ddaeeb4323ac99afd35d2c4fda643c9ee8bcf';
const DEFAULT_SHA = '8a3e4637450b7277428da248f0a604b5c92942bc30507220c051181462340f39';
const DEFAULT_URL = `https://raw.githubusercontent.com/LibreOffice/dictionaries/${DEFAULT_COMMIT}/en/th_en_US_v2.dat`;
const ROOT = path.join(__dirname, '..', '..');
const DEFAULT_OUT = path.join(ROOT, 'neo-ext', 'thesaurus', 'en');
const HEADWORD = /^[a-z][a-z' -]*$/;
const MARKERS = {
  'generic term': 'generic',
  'similar term': 'similar',
  'related term': 'related',
  antonym: 'antonym'
};
const MARKER = /^(.*?)(?: \(([a-z ]+)\))?$/;

function args() {
  const opts = { _: [] };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opts[argv[i].slice(2)] = argv[++i];
    else opts._.push(argv[i]);
  }
  return opts;
}

const OPTIONS = args();

function arg(name, fallback) {
  const key = name.replace(/^--/, '');
  return Object.prototype.hasOwnProperty.call(OPTIONS, key) ? OPTIONS[key] : fallback;
}

function source() {
  return OPTIONS._[0] || '';
}

function parse(text) {
  const words = new Map();
  const problems = [];
  let head = null;
  let left = 0;
  let senses = null;
  const term = (raw) => {
    const match = MARKER.exec(String(raw || '').trim());
    if (!match) return null;
    const w = match[1].trim();
    if (!w) return null;
    if (/[()]/.test(w)) {
      problems.push(`unparsed marker in "${w}"`);
      return null;
    }
    const marker = match[2];
    if (marker !== undefined && !Object.hasOwn(MARKERS, marker)) {
      problems.push(`unknown marker "(${marker})" beside "${w}"`);
      return null;
    }
    return { w, rel: marker ? MARKERS[marker] : '' };
  };

  const keep = () => {
    if (!head || !HEADWORD.test(head)) return;
    const kept = senses
      .map((s) => {
        const seen = new Set();
        const syns = [];
        for (const raw of s.syns) {
          const entry = term(raw);
          if (!entry) continue;
          const key = entry.w.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          syns.push(entry);
        }
        return { pos: s.pos, syns };
      })
      .filter((s) => s.syns.length);
    if (!kept.length) return;
    if (words.has(head)) words.get(head).push(...kept);
    else words.set(head, kept);
  };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (left > 0 && line.startsWith('(')) {
      const end = line.indexOf(')');
      const bar = line.indexOf('|');
      if (end < 0 || bar < 0) throw new Error(`malformed sense for "${head}": ${line}`);
      const pos = line.slice(1, end).trim();
      const syns = line.slice(bar + 1).split('|');
      senses.push({ pos, syns });
      if (--left === 0) keep();
      continue;
    }
    const match = /^([^|]+)\|(\d+)$/.exec(line);
    if (!match) continue;
    head = match[1].trim().toLowerCase();
    left = Number(match[2]) || 0;
    senses = [];
    if (left === 0) keep();
  }
  if (problems.length) throw new Error(`source markers could not be read:\n${[...new Set(problems)].slice(0, 10).join('\n')}`);
  return words;
}

function build(words, out) {
  const byLetter = new Map();
  for (const head of [...words.keys()].sort()) {
    const letter = head[0];
    if (!byLetter.has(letter)) byLetter.set(letter, {});
    byLetter.get(letter)[head] = words.get(head);
  }

  const shardsDir = path.join(out, 'shards');
  fs.rmSync(shardsDir, { recursive: true, force: true });
  fs.mkdirSync(shardsDir, { recursive: true });

  let synonyms = 0;
  let gzBytes = 0;
  for (const [letter, entries] of [...byLetter].sort()) {
    for (const sense of Object.values(entries)) {
      for (const s of sense) synonyms += s.syns.length;
    }
    const json = Buffer.from(JSON.stringify(entries));
    const gz = zlib.gzipSync(json, { level: 9 });
    fs.writeFileSync(path.join(shardsDir, `${letter}.json.gz`), gz);
    gzBytes += gz.length;
  }

  const manifest = {
    format: FORMAT,
    language: 'en',
    source: arg('--url', DEFAULT_URL),
    commit: arg('--commit', DEFAULT_COMMIT),
    sha256: '',
    headwords: words.size,
    synonyms,
    shards: byLetter.size,
    gzBytes
  };
  return manifest;
}

function main() {
  const file = source();
  if (!file || !fs.existsSync(file)) {
    console.error('usage: node neo-ext/tools/build-thesaurus.js <th_en_US_v2.dat> [--sha256 <hex>]');
    process.exit(2);
  }
  const buf = fs.readFileSync(file);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const expected = arg('--sha256', DEFAULT_SHA);
  if (expected && expected.toLowerCase() !== sha256) {
    console.error(`source hash ${sha256} does not match --sha256 ${expected}; refusing to build`);
    process.exit(1);
  }

  const out = arg('--out', DEFAULT_OUT);
  fs.mkdirSync(out, { recursive: true });
  const words = parse(buf.toString('utf8'));
  const manifest = build(words, out);
  manifest.sha256 = sha256;

  const license = arg('--license', '');
  if (license) {
    if (!fs.existsSync(license)) {
      console.error(`licence file not found: ${license}`);
      process.exit(1);
    }
    fs.copyFileSync(license, path.join(out, 'WordNet_license.txt'));
  }
  if (!fs.existsSync(path.join(out, 'WordNet_license.txt'))) {
    console.error(`missing ${path.join(out, 'WordNet_license.txt')} — pass --license <file>`);
    process.exit(1);
  }

  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`headwords ${manifest.headwords}, synonyms ${manifest.synonyms}, shards ${manifest.shards}, ${(manifest.gzBytes / 1048576).toFixed(2)} MB gzipped`);
}

if (require.main === module) main();

module.exports = { parse, build, HEADWORD, MARKERS };
