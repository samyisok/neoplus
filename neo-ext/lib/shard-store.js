// NEO fork — one shard store for the lexical features (adr-003)
//
// A shard is one letter's gzipped JSON. Both the dictionary and the thesaurus
// read them the same way: three shards in memory, insertion order, bounded
// gunzip, and a failed read dropped so the next lookup may retry.

'use strict';

const fsp = require('fs').promises;
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzip = promisify(zlib.gunzip);
const MAX_SHARD = 32 * 1024 * 1024;
const CACHED_SHARDS = 3;

function create({ dir, name = 'data', log = () => {} } = {}) {
  const shards = new Map();

  function trim() {
    while (shards.size > CACHED_SHARDS) shards.delete(shards.keys().next().value);
  }

  async function load(letter) {
    if (!letter) return null;
    if (shards.has(letter)) return shards.get(letter);
    const file = path.join(dir, 'shards', `${letter}.json.gz`);
    const loading = fsp.readFile(file)
      .then((gz) => gunzip(gz, { maxOutputLength: MAX_SHARD }))
      .then((buf) => JSON.parse(buf.toString('utf8')))
      .catch((err) => {
        log(`${name} shard ${letter}: ` + (err && err.message));
        shards.delete(letter); // a transient read failure must be retryable
        return null;
      });
    shards.set(letter, loading);
    trim();
    return loading;
  }

  function clear() {
    shards.clear();
  }

  function size() {
    return shards.size;
  }

  return { load, clear, size, dir };
}

module.exports = { create, MAX_SHARD, CACHED_SHARDS };
