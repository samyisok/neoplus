// NEO fork — settings.json patching (adr-001)
//
// The core writes the whole settings file (export folder, window bounds), and
// so does this feature. Both go through one read-merge-write so neither drops
// the other's keys.

'use strict';

function mergeSettings(current, patch) {
  const out = { ...(current && typeof current === 'object' && !Array.isArray(current) ? current : {}) };
  for (const key of Object.keys(patch || {})) {
    if (patch[key] === undefined) delete out[key];
    else out[key] = patch[key];
  }
  return out;
}

function readSettingsSafe(read) {
  try {
    const value = read();
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

// read, patch one or more keys, write the merged object back.
// An unreadable file is refused, never treated as empty: writing {} + patch
// would erase libraryDir, window bounds and the export folder.
function patchSettingsFile({ read, write, patch }) {
  let current;
  try {
    current = read();
  } catch {
    throw new Error('The settings file could not be read, so nothing was changed');
  }
  if (current != null && (typeof current !== 'object' || Array.isArray(current))) {
    throw new Error('The settings file is not an object, so nothing was changed');
  }
  const merged = mergeSettings(current || {}, patch);
  write(merged);
  return merged;
}

module.exports = { mergeSettings, readSettingsSafe, patchSettingsFile };
