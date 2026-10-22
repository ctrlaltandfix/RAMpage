'use strict';

// Deliberately separate from the passive, non-focusable game overlay.
// A fullscreen Vulkan app can stay above a window shown without activation.
function presentQuickAccess(w, shadPS4) {
  w.setAlwaysOnTop(true, 'screen-saver', 1);
  if (shadPS4) {
    w.setFocusable(true);
    w.show();      // Unlike showInactive(), requests foreground activation.
    w.focus();     // Windows may reject activation; caller verifies and falls back.
  } else {
    w.setFocusable(false);
    w.showInactive();
  }
  w.moveTop();
}

function ps4IsRunning(running, games) {
  for (const id of running.keys()) {
    if (String(games[id]?.systemId || '').toLowerCase() === 'ps4') return true;
  }
  return false;
}

function isShadPS4Name(name) {
  return /^shadps4(?:qtlauncher)?$/i.test(String(name || '').replace(/\.exe$/i, ''));
}

module.exports = { presentQuickAccess, ps4IsRunning, isShadPS4Name };
