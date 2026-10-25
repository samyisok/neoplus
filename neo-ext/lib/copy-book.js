// NEO fork — copy one book folder into the backup folder (adr-001)
//
// Plain files, finished atomically: everything is written into a hidden
// .<name>.partial folder, then renamed into place. A file another program
// holds is retried once; a file still in iCloud is asked for and waited on a
// bounded time; anything that still cannot be copied is named in
// _left-out-of-this-backup.txt instead of the copy being quietly short.

'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function moveIntoPlace(partial, dest, name) {
  let candidate = name;
  for (let n = 1; n <= 50; n++) {
    candidate = n === 1 ? name : `${name}-${n}`;
    try {
      await fsp.rename(partial, path.join(dest, candidate));
      return candidate;
    } catch (err) {
      if (err.code !== 'EEXIST' && err.code !== 'ENOTEMPTY' && err.code !== 'EPERM') throw err;
    }
  }
  throw new Error('Could not find a free backup name');
}

async function copyBookDir({ src, dest, folderName, isCloudOnly, requestDownload, cloudWaitMs = 20000, log }) {
  const name = String(folderName || path.basename(src));
  // unique per run: a second request in the same second must never remove or
  // write into the first one's half-finished folder
  const partial = path.join(dest, `.${name}.${process.pid}-${Math.random().toString(36).slice(2, 8)}.partial`);
  const skipped = [];
  const cloudUntil = Date.now() + cloudWaitMs; // one budget for the whole copy
  try {
    await fsp.mkdir(dest, { recursive: true });
    await fsp.rm(partial, { recursive: true, force: true });
    await fsp.mkdir(partial, { recursive: true });

    const walk = async (dir, rel) => {
      const entries = await fsp.readdir(dir, { withFileTypes: true });
      for (const ent of entries) {
        const full = path.join(dir, ent.name);
        const relPath = rel ? path.join(rel, ent.name) : ent.name;
        if (ent.isSymbolicLink()) {
          // never follow a link out of the book: a library received from
          // someone else could otherwise pull in files that are not the book
          skipped.push(relPath);
          continue;
        }
        if (!ent.isFile()) {
          if (ent.isDirectory()) {
            await fsp.mkdir(path.join(partial, relPath), { recursive: true });
            await walk(full, relPath);
          }
          continue;
        }
        if (isCloudOnly) {
          const awayNow = async () => { try { return !!(await isCloudOnly(full)); } catch { return false; } };
          if (await awayNow()) {
            try { requestDownload && requestDownload([full]); } catch { /* the wait below decides */ }
            while (Date.now() < cloudUntil && await awayNow()) {
              await sleep(400);
            }
            if (await awayNow()) {
              skipped.push(relPath);
              continue;
            }
          }
        }
        const target = path.join(partial, relPath);
        await fsp.mkdir(path.dirname(target), { recursive: true });
        try {
          await fsp.copyFile(full, target);
        } catch {
          await sleep(150);
          try {
            await fsp.copyFile(full, target);
          } catch (err) {
            log && log(`backup copy: ${relPath} (${err.code || err.message})`);
            skipped.push(relPath);
          }
        }
      }
    };
    await walk(src, '');

    if (skipped.length) {
      await fsp.writeFile(path.join(partial, '_left-out-of-this-backup.txt'),
        'These files could not be copied:\n\n' + skipped.join('\n') + '\n', 'utf8');
    }
    const finalName = await moveIntoPlace(partial, dest, name);
    return { ok: true, name: finalName, path: path.join(dest, finalName), skipped, incomplete: skipped.length > 0 };
  } catch (err) {
    try { await fsp.rm(partial, { recursive: true, force: true }); } catch { /* already gone */ }
    return { ok: false, error: String((err && err.message) || err) };
  }
}

module.exports = { copyBookDir };
