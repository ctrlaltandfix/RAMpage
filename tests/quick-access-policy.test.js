'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { requiresInAppQuickAccess } = require('../.github/patches/quick-access-policy');
test('shadPS4 PS4 games use the floating overlay', () => {
  assert.equal(requiresInAppQuickAccess({ systemId: 'ps4', emulatorName: 'shadPS4' }), false);
  assert.equal(requiresInAppQuickAccess({ systemId: 'PS4' }), false);
});
test('other emulators keep the established in-app fallback', () => {
  for (const id of ['ps3','ps2','switch','wiiu','wii','gamecube'])
    assert.equal(requiresInAppQuickAccess({ systemId: id }), true, id);
});
test('native games or empty records use the overlay', () => {
  assert.equal(requiresInAppQuickAccess(null), false);
  assert.equal(requiresInAppQuickAccess({}), false);
  assert.equal(requiresInAppQuickAccess({ systemId: null }), false);
});
