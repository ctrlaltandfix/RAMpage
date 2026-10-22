'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = process.env.RAMPAGE_APP_ROOT;
assert.ok(root, 'RAMPAGE_APP_ROOT must point to extracted app');
const main = fs.readFileSync(path.join(root,'src','main.js'),'utf8');
const preload = fs.readFileSync(path.join(root,'src','preload.js'),'utf8');
const renderer = fs.readFileSync(path.join(root,'src','renderer','app.js'),'utf8');

test('recovery hotkey registration is not tied to the running Map or game launcher lifecycle', () => {
  assert.match(main,/step\('register ShadPS4 independent shortcut', registerShadPS4RescueShortcut\)/);
  assert.match(main,/globalShortcut\.register\('Control\+Alt\+R'/);
  const s = main.match(/function registerShadPS4RescueShortcut\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(s, 'rescue shortcut function');
  const registered = [];
  const calls = [];
  vm.runInNewContext(s+'; registerShadPS4RescueShortcut();', {
    process:{platform:'win32'},logLine:(s)=>calls.push('log '+s),
    globalShortcut:{register:(key,callback)=>{registered.push(key);callback();return true;}},
    openShadPS4Rescue:(why)=>calls.push('open '+why)
  });
  assert.deepEqual(registered,['Control+Alt+R']);
  assert.ok(calls.some(x=>x.includes('open independent Ctrl+Alt+R')));
});

test('ShadPS4 gamepad/Home actions bypass old passive floating overlay', () => {
  assert.match(main,/if \(qaPresenter\.ps4IsRunning\(running, store\.games\)\) return openShadPS4Rescue/);
  const functionText=main.match(/function toggleQuickAccess\(\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionText);
  assert.ok(functionText.indexOf('openShadPS4Rescue') < functionText.indexOf('showQuickAccessOverlay'));
});

test('Quick Access recovery not dependent on external process detection', () => {
  const functionText=main.match(/function openShadPS4Rescue\(why\) \{[\s\S]*?\n\}/)?.[0];
  assert.ok(functionText);
  assert.match(functionText,/ui:shadps4Rescue/);
  assert.match(functionText,/quickAccessInApp\(why\)/);
  assert.doesNotMatch(functionText,/Get-Process|gameIsAlive|running\.size/);
});

test('same Quick Access controls offer Return to ShadPS4 even when game session is lost', () => {
  assert.match(renderer,/QA\.shadRescue\s*\?\s*\[\{/);
  assert.match(renderer,/key:'resume-shadps4'/);
  assert.match(renderer,/case 'resume-shadps4'/);
  assert.match(renderer,/api\.resumeShadPS4/);
  assert.match(preload,/resumeShadPS4: \(\) => ipcRenderer\.invoke\('shadps4:resume'\)/);
  assert.match(preload,/onShadPS4Rescue/);
});

test('native resume only targets an already-running shadPS4 process', () => {
  const block=main.slice(main.indexOf("ipcMain.handle('shadps4:resume'"),main.indexOf("ipcMain.handle('game:focus'"));
  assert.match(block,/Get-Process -Name shadps4,shadps4qtlauncher/);
  assert.match(block,/SetForegroundWindow/);
  assert.match(block,/bringToFront\(\)/);
  assert.doesNotMatch(block,/Start-Process|spawn\(/);
});

test('other game toolbar and normal shortcuts remain', () => {
  assert.match(main,/qaPresenter\.presentQuickAccess\(qaWin, activeToolbar\)/);
  assert.match(main,/globalShortcut\.register\('Home', onHomePressed\)/);
  assert.match(main,/globalShortcut\.register\('Control\+Shift\+Q', onHomePressed\)/);
});
