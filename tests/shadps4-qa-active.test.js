'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const qa = require('../.github/patches/shadps4-qa-presenter');

function mockWindow() {
  const calls = [];
  const w = { setAlwaysOnTop(...a) { calls.push(['top', ...a]); },
    setFocusable(v) { calls.push(['focusable',v]); },
    show() { calls.push(['show']); },
    focus() { calls.push(['focus']); },
    showInactive() { calls.push(['inactive']); },
    moveTop() { calls.push(['moveTop']); } };
  return {w,calls};
}
test('ShadPS4 uses a focusable foreground toolbar, not the invisible passive path', () => {
  const {w,calls} = mockWindow();
  qa.presentQuickAccess(w,true);
  assert.deepEqual(calls,[['top',true,'screen-saver',1],['focusable',true],
    ['show'],['focus'],['moveTop']]);
});
test('PC games preserve the established non-activating toolbar', () => {
  const {w,calls} = mockWindow();
  qa.presentQuickAccess(w,false);
  assert.deepEqual(calls,[['top',true,'screen-saver',1],['focusable',false],
    ['inactive'],['moveTop']]);
});
test('PS4 session identified reliably across launching state and other games', () => {
  const games={one:{systemId:'ps4'},two:{systemId:'ps3'},three:{}};
  assert.equal(qa.ps4IsRunning(new Map([['one',{state:'launching'}]]),games),true);
  assert.equal(qa.ps4IsRunning(new Map([['two',{}]]),games),false);
  assert.equal(qa.ps4IsRunning(new Map(),games),false);
});
test('ShadPS4 processes identified by either launcher or core', () => {
  assert.equal(qa.isShadPS4Name('shadps4'),true);
  assert.equal(qa.isShadPS4Name('shadPS4.exe'),true);
  assert.equal(qa.isShadPS4Name('shadps4qtlauncher'),true);
  assert.equal(qa.isShadPS4Name('steam'),false);
});
