// NEO fork — how big a records file may get (adr-007)
//
// The store is pure domain data; measuring its bytes belongs to the file
// boundary that refuses an oversized write, so it lives here.

'use strict';

const MAX_BYTES = 4 * 1024 * 1024;

function sizeOf(value) {
  try {
    const text = JSON.stringify(value);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(text);
    return text.length;
  } catch { return Infinity; }
}

// The bytes actually written are what must fit, so the writer measures the
// exact text it hands to disk rather than a compact re-encoding.
function sizeOfText(text) {
  try {
    if (typeof Buffer !== 'undefined') return Buffer.byteLength(text);
    if (typeof TextEncoder === 'function') return new TextEncoder().encode(text).length;
    return String(text).length;
  } catch { return Infinity; }
}

module.exports = { MAX_BYTES, sizeOf, sizeOfText };
