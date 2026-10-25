// NEO fork — names for a book's manual backup folder (adr-001)
//
// A plain folder beside the writer's other backups: <slug>-YYYY-MM-DD-HHMMSS,
// with a numeric suffix when that name is already taken. Windows-safe: no
// reserved characters, no trailing dots, no reserved device names.

'use strict';

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function clean(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')      // Capítulo -> capitulo
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/[ .]+$/g, '')      // Windows drops a trailing dot or space
    .slice(0, 48)
    .replace(/-+$/g, '');
}

function slug(title, id) {
  const fromTitle = clean(title);
  if (fromTitle && !RESERVED.test(fromTitle)) return fromTitle;
  const fromId = clean(id);
  if (fromId && !RESERVED.test(fromId)) return fromId;
  return 'book';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

// The writer's own clock, so the folder reads the way the day did.
function timestamp(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
    + `-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function folderName({ title, id, now, taken }) {
  // a copy named book-… would be mistaken for a book by the library and the
  // daily walk: keep backups out of that namespace
  let base = `${slug(title, id)}-${timestamp(now)}`;
  if (base.startsWith('book-')) base = `backup-${base}`;
  if (!taken || !taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const next = `${base}-${n}`;
    if (!taken.has(next)) return next;
  }
}

module.exports = { slug, timestamp, folderName };
