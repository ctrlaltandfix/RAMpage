'use strict';
function requiresInAppQuickAccess(game) {
  if (!game || !game.systemId) return false;
  // shadPS4 supports borderless full screen: try the usual Quick Access overlay.
  // Preserve the previous in-app fallback for all other emulators.
  return String(game.systemId).toLowerCase() !== 'ps4';
}
module.exports = { requiresInAppQuickAccess };
