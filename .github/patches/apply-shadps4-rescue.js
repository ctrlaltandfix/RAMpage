'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const appRoot = process.argv[2];
if (!appRoot) throw Error('Pass directory containing extracted app package');
const mainPath = path.join(appRoot,'src','main.js');
const preloadPath = path.join(appRoot,'src','preload.js');
const rendererPath = path.join(appRoot,'src','renderer','app.js');
const files = {
  main: fs.readFileSync(mainPath,'utf8').replace(/\r\n/g,'\n'),
  preload: fs.readFileSync(preloadPath,'utf8').replace(/\r\n/g,'\n'),
  renderer: fs.readFileSync(rendererPath,'utf8').replace(/\r\n/g,'\n')
};
function replace(key,before,after,reason) {
  const n = files[key].split(before).length-1;
  if (n !== 1) throw Error(reason + ': expected unique source anchor, got '+n);
  files[key] = files[key].replace(before,after);
}
function fnPatch(key, fnName, before, after, reason) {
  const start = files[key].indexOf('function '+fnName+'(');
  const end = files[key].indexOf('\n}',start);
  if (start<0||end<0) throw Error('Function missing '+fnName);
  const block = files[key].slice(start,end+2);
  if (block.split(before).length !== 2) throw Error('Function '+fnName+': '+reason+' anchor mismatch');
  files[key]=files[key].slice(0,start)+block.replace(before,after)+files[key].slice(end+2);
}

// Completely bypass the Electron floating overlay for PS4, which cannot be
// guaranteed over shadPS4's Vulkan presentation. Bring up the same Quick Access
// controls in RAMpage with an explicit way back to the game instead.
const rescueFunction = [
  'function openShadPS4Rescue(why) {',
  '  if (!win || win.isDestroyed()) return;',
  "  logLine('ShadPS4 rescue Quick Access triggered: '+why);",
  "  win.webContents.send('ui:shadps4Rescue', true);",
  '  quickAccessInApp(why);',
  '}',
  '',
  '// This shortcut remains registered even when the Qt launcher hands off,',
  '// the process watcher drops the game, or the game swallows Guide/Home.',
  'function registerShadPS4RescueShortcut() {',
  "  if (process.platform !== 'win32') return;",
  "  const registered = globalShortcut.register('Control+Alt+R', () => {",
  "    openShadPS4Rescue('independent Ctrl+Alt+R recovery shortcut');",
  '  });',
  "  logLine('ShadPS4 independent Ctrl+Alt+R '+(registered?'registered':'COULD NOT BE REGISTERED'));",
  '}',
  ''
].join('\n');
replace('main','function onHomePressed() {',rescueFunction+'function onHomePressed() {','rescue functions');
fnPatch('main','onHomePressed',
  "  toggleQuickAccess();",
  "  if (qaPresenter.ps4IsRunning(running, store.games)) return openShadPS4Rescue('tracked PS4 session controller/Home');\n  toggleQuickAccess();",
  'tracked PS4 fallback');
fnPatch('main','toggleQuickAccess',
  "  if (store.settings.qaOverGame === false) return quickAccessInApp('set to open in the app');",
  "  if (qaPresenter.ps4IsRunning(running, store.games)) return openShadPS4Rescue('tracked PS4 Quick Access');\n  if (store.settings.qaOverGame === false) return quickAccessInApp('set to open in the app');",
  'bypass shadPS4 compositor');
replace('main',"  step('open window', createWindow);",
  "  step('open window', createWindow);\n  step('register ShadPS4 independent shortcut', registerShadPS4RescueShortcut);",
  'register always-on shortcut');

// Resume control must work even if RAMpage lost its running Map after launcher handoff.
// It targets an existing native ShadPS4 window by process name, never spawns a game.
const resumeImpl=[
"ipcMain.handle('shadps4:resume', async () => {",
"  if (process.platform !== 'win32') return { ok:false, error:'Only supported on Windows' };",
"  logLine('ShadPS4 recovery: attempt to return to existing game window');",
"  if (win && !win.isDestroyed()) {",
"    try { win.setAlwaysOnTop(false); win.minimize(); } catch (e) { logLine('ShadPS4 rescue minimize: '+e.message); }",
"  }",
"  const ps = [",
"    '$ErrorActionPreference = \"SilentlyContinue\"',",
"    'Add-Type -TypeDefinition @\"',",
"    'using System;',",
"    'using System.Runtime.InteropServices;',",
"    'public static class RPRescueWin {',",
"    ' [DllImport(\"user32.dll\")] public static extern bool ShowWindow(IntPtr h, int n);',",
"    ' [DllImport(\"user32.dll\")] public static extern bool BringWindowToTop(IntPtr h);',",
"    ' [DllImport(\"user32.dll\")] public static extern bool SetForegroundWindow(IntPtr h);',",
"    '}',",
"    '\"@',",
"    '$c = @(Get-Process -Name shadps4,shadps4qtlauncher -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne [IntPtr]::Zero })',",
"    '$t = $c | Sort-Object { if ($_.ProcessName -ieq \"shadps4\") { 0 } else { 1 } } | Select-Object -First 1',",
"    'if (!$t) { Write-Output \"NO_GAME_WINDOW\"; exit 2 }',",
"    '[void][RPRescueWin]::ShowWindow($t.MainWindowHandle,9)',",
"    '[void][RPRescueWin]::BringWindowToTop($t.MainWindowHandle)',",
"    '$ok = [RPRescueWin]::SetForegroundWindow($t.MainWindowHandle)',",
"    'if ($ok) { Write-Output \"RESUMED\" } else { Write-Output \"FOCUS_BLOCKED\"; exit 3 }'",
"  ].join('\\n');",
"  return new Promise((resolve) => {",
"    execFile('powershell',['-NoProfile','-NonInteractive','-EncodedCommand',",
"      Buffer.from(ps,'utf16le').toString('base64')],",
"      { windowsHide:true, timeout:12000 },(err,out) => {",
"        const status = String(out||'').trim();",
"        logLine('ShadPS4 rescue return result: '+(status || err?.message || 'unknown'));",
"        if (!err && status.includes('RESUMED')) return resolve({ok:true});",
"        // Avoid permanently leaving RAMpage hidden with no ShadPS4 window.",
"        bringToFront();",
"        resolve({ok:false,error:'Could not focus ShadPS4; try Alt+Tab. '+status});",
"      });",
"  });",
"});",
""
].join('\n');
replace('main',"ipcMain.handle('game:focus', async (_e, id) => {",resumeImpl+"ipcMain.handle('game:focus', async (_e, id) => {",'native resume IPC');

replace('preload',"  focusGame: (id) => ipcRenderer.invoke('game:focus', id),",
 "  focusGame: (id) => ipcRenderer.invoke('game:focus', id),\n  resumeShadPS4: () => ipcRenderer.invoke('shadps4:resume'),",
 'resume API');
replace('preload',"  onQuickAccess: (cb) => ipcRenderer.on('ui:quickAccess', () => cb()),",
 "  onQuickAccess: (cb) => ipcRenderer.on('ui:quickAccess', () => cb()),\n  onShadPS4Rescue: (cb) => ipcRenderer.on('ui:shadps4Rescue', (_e,on) => cb(!!on)),",
 'rescue status API');
replace('renderer',"const QA = { open: false, confirm: null, busy: false };",
 "const QA = { open: false, confirm: null, busy: false, shadRescue: false };",
 'rescue state');
fnPatch('renderer','qaItems',
 "    // Over a game, closing the bar already returns to it; from inside RAMpage it",
 "    ...(!OVERLAY && QA.shadRescue ? [{ key:'resume-shadps4', icon:'i-play', label:'Return to ShadPS4', sub:'Go back to the running PS4 game' }] : []),\n    // Over a game, closing the bar already returns to it; from inside RAMpage it",
 'always visible ShadPS4 resume');
fnPatch('renderer','qaActivate',
 "    case 'resume': return toggleQuickAccess(false);",
 "    case 'resume': return toggleQuickAccess(false);\n    case 'resume-shadps4': {\n      toggleQuickAccess(false);\n      const result = await api.resumeShadPS4?.();\n      if (result && !result.ok) toast(result.error || 'ShadPS4 cannot be focused', true);\n      return;\n    }",
 'rescue return QA item');
replace('renderer',
 "  api.onPadWatch?.((on) => { state.padWatch = on; });",
 "  api.onPadWatch?.((on) => { state.padWatch = on; });\n  api.onShadPS4Rescue?.((on) => { QA.shadRescue = on; if (QA.open) drawQuickAccess(); });",
 'rescue UI event');
fs.writeFileSync(mainPath,files.main);
fs.writeFileSync(preloadPath,files.preload);
fs.writeFileSync(rendererPath,files.renderer);
for (const file of [mainPath,preloadPath,rendererPath]) cp.execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('PASS: ShadPS4 accessibility recovery shortcut and explicit native resume path installed; existing PC overlay retained');
