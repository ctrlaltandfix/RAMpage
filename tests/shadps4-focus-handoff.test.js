'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root=process.env.RAMPAGE_APP_ROOT;
assert.ok(root,'RAMPAGE_APP_ROOT is required');
const main=fs.readFileSync(path.join(root,'src','main.js'),'utf8');

test('minimisation targets only foreground shadPS4 window and no other app', () => {
  const data = main.match(/^const SHADPS4_FOCUS_HANDOFF_PS = ("(?:\\.|[^"\\])*");$/m);
  assert.ok(data,'native focus-handoff script is missing');
  const ps=JSON.parse(data[1]);
  assert.match(ps,/GetForegroundWindow\(\)/);
  assert.match(ps,/GetWindowThreadProcessId/);
  assert.match(ps,/ProcessName -notmatch.*shadps4/);
  assert.ok(ps.indexOf('SKIPPED_OTHER_FOREGROUND')<ps.indexOf('[RPRescueHandoff]::ShowWindowAsync($hwnd'),
    'Must reject all other processes before any window action');
  assert.match(ps,/ShowWindowAsync\(\$hwnd, 6\)/);
  assert.match(ps,/IsIconic\(\$hwnd\)/);
  assert.doesNotMatch(ps,/Stop-Process|Remove-Item|taskkill|SendInput/);
});

test('Quick Access waits for foreground ShadPS4 minimisation before showing menu', async () => {
  const fn=main.match(/^async function openShadPS4Rescue\(why\) \{[\s\S]*?^\}$/m)?.[0];
  assert.ok(fn,'new async rescue function missing');
  const trace=[];
  let release;
  const waiting = new Promise(res=>{release=res;});
  const context=vm.createContext({
    win:{isDestroyed:()=>false,webContents:{send:(...a)=>trace.push(['send',...a])}},
    logLine:(value)=>trace.push(['log',value]),
    minimizeForegroundShadPS4:()=>{trace.push(['minimize-request']);return waiting;},
    quickAccessInApp:(why)=>trace.push(['menu',why]),
    setTimeout:(cb)=>cb()
  });
  vm.runInContext('let shadRescueInProgress = false; \n'+fn,context);
  const op=vm.runInContext("openShadPS4Rescue('Xbox Guide')",context);
  assert.deepEqual(trace.filter(x=>x[0]==='minimize-request'),[['minimize-request']]);
  assert.equal(trace.some(x=>x[0]==='menu'),false,'Cannot open menu behind fullscreen before minimisation');
  release('MINIMIZED_FOREGROUND_SHADPS4');
  await op;
  assert.equal(trace.filter(x=>x[0]==='menu').length,1);
  assert.equal(trace.filter(x=>x[0]==='send').length,1);
  assert.ok(trace.some(x=>x.join().includes('MINIMIZED_FOREGROUND_SHADPS4')));
});

test('repeat controller input cannot trigger concurrent minimisation',async()=>{
  const fn=main.match(/^async function openShadPS4Rescue\(why\) \{[\s\S]*?^\}$/m)?.[0];
  let pending;
  let calls=0;
  const ctx=vm.createContext({
    win:{isDestroyed:()=>false,webContents:{send:()=>{}}},
    logLine:()=>{},
    minimizeForegroundShadPS4:()=>{calls++;return new Promise(r=>{pending=r;});},
    quickAccessInApp:()=>{},
    setTimeout:(fn)=>fn()
  });
  vm.runInContext('let shadRescueInProgress = false; \n'+fn,ctx);
  const a=vm.runInContext("openShadPS4Rescue('first')",ctx);
  await vm.runInContext("openShadPS4Rescue('second')",ctx);
  assert.equal(calls,1);
  pending('MINIMIZED_FOREGROUND_SHADPS4');
  await a;
});

test('non-ShadPS4 PC games keep original Quick Access overlay',()=>{
  assert.match(main,/function showQuickAccessOverlay\(activeToolbar = false\)/);
  assert.match(main,/qaPresenter\.presentQuickAccess\(qaWin, activeToolbar\)/);
  assert.match(main,/registerShadPS4RescueShortcut/);
  assert.match(main,/Return to ShadPS4|shadps4:resume/);
});
