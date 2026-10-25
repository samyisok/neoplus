// NEO fork — where backups are written (adr-001)
//
// One folder for manual book backups and the daily zip: the configured one
// when set, otherwise <library>/Backups. A folder inside a book folder is
// refused, so a backup can never grow inside the thing it copies.

'use strict';

const fs = require('fs');
const path = require('path');

function defaultBackupDir(libraryDir) {
  return path.join(libraryDir, 'Backups');
}

function resolveBackupDir({ libraryDir, configured }) {
  const chosen = String(configured || '').trim();
  if (!chosen) return defaultBackupDir(libraryDir);
  if (!path.isAbsolute(chosen)) throw new Error('The backup folder must be an absolute path');
  return chosen;
}

// the real path of p, or of its nearest existing ancestor with the rest
// appended, so a symlink cannot hide that a folder lands inside a book
function realish(p) {
  let head = path.resolve(p);
  const tail = [];
  for (;;) {
    try { return path.join(fs.realpathSync(head), ...tail.reverse()); }
    catch {
      const up = path.dirname(head);
      if (up === head) return path.resolve(p);
      tail.push(path.basename(head));
      head = up;
    }
  }
}

function inside(parent, child) {
  const rel = path.relative(realish(parent), realish(child));
  return rel !== '' && !rel.startsWith('..') && !path.isAbsolute(rel);
}

function insideBook({ folder, libraryDir }) {
  if (!inside(libraryDir, folder)) return false;
  const rel = path.relative(realish(libraryDir), realish(folder));
  return rel.split(path.sep)[0].startsWith('book-');
}

function validateBackupDir({ folder, libraryDir, ownBookDir }) {
  const chosen = String(folder || '').trim();
  if (!chosen) return { ok: false, reason: 'Choose a folder for backups' };
  if (!path.isAbsolute(chosen)) return { ok: false, reason: 'The backup folder must be an absolute path' };
  if (ownBookDir && (realish(chosen) === realish(ownBookDir) || inside(ownBookDir, chosen))) {
    return { ok: false, reason: 'The backup folder cannot be inside the book being backed up' };
  }
  if (insideBook({ folder: chosen, libraryDir })) {
    return { ok: false, reason: 'Choose a folder outside the library’s book folders' };
  }
  // a folder deeper inside the library could be a book folder the library did
  // not name book-… (a hand-made one): backups only at the root or outside
  if (inside(libraryDir, chosen)) {
    const depth = path.relative(realish(libraryDir), realish(chosen)).split(path.sep).filter(Boolean).length;
    if (depth > 1) return { ok: false, reason: 'Choose a folder at the library root or outside the library' };
  }
  return { ok: true, folder: chosen };
}

function ensureDir(folder) {
  fs.mkdirSync(folder, { recursive: true });
}

module.exports = { defaultBackupDir, resolveBackupDir, insideBook, validateBackupDir, ensureDir, realish };
