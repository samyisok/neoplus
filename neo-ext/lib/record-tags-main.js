// NEO fork — the native context menu's record item (adr-006)
//
// The renderer has already decided whether a tag exists; this module only
// turns that phrase into the one menu item the main process may add.

'use strict';

const { tagAction } = require('./record-tags.js');

function menuItem(info, t) {
  if (!info || !info.phrase) return null;
  const find = !!info.hasTag;
  return {
    label: t(find ? 'Find Record…' : 'Create Record…'),
    action: tagAction(find),
    phrase: info.phrase
  };
}

module.exports = { menuItem };
