'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const dir = process.argv[2];
if (!dir) throw Error('Pass extracted Electron application directory');
const f = path.join(dir, 'src', 'main.js');
let js = fs.readFileSync(f, 'utf8');
const original = [
"function openShadPS4Rescue(why) {",
"  if (!win || win.isDestroyed()) return;",
"  logLine('ShadPS4 rescue Quick Access triggered: '+why);",
"  win.webContents.send('ui:shadps4Rescue', true);",
"  quickAccessInApp(why);",
"}"
].join('\n');
const oldCount = js.split(original).length - 1;
if (oldCount !== 1) throw Error('Source version mismatch: expected one v1.5 rescue handler, found '+oldCount);
const ps = [
'$ErrorActionPreference = "Stop"',
"Add-Type -TypeDefinition @'",
'using System;',
'using System.Runtime.InteropServices;',
'public static class RPRescueHandoff {',
' [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();',
' [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hwnd, out uint pid);',
' [DllImport("user32.dll")] public static extern bool ShowWindowAsync(IntPtr hwnd, int command);',
' [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr hwnd);',
'}',
"'@",
'$hwnd = [RPRescueHandoff]::GetForegroundWindow()',
'if ($hwnd -eq [IntPtr]::Zero) { Write-Output "NO_FOREGROUND"; exit 0 }',
'$pidValue = [uint32]0',
'[void][RPRescueHandoff]::GetWindowThreadProcessId($hwnd, [ref]$pidValue)',
'$proc = Get-Process -Id $pidValue -ErrorAction Stop',
'if ($proc.ProcessName -notmatch "(?i)^shadps4(qtlauncher)?$") { Write-Output "SKIPPED_OTHER_FOREGROUND"; exit 0 }',
'if ([RPRescueHandoff]::IsIconic($hwnd)) { Write-Output "ALREADY_MINIMIZED"; exit 0 }',
'[void][RPRescueHandoff]::ShowWindowAsync($hwnd, 6)',
'Start-Sleep -Milliseconds 180',
'if ([RPRescueHandoff]::IsIconic($hwnd)) { Write-Output "MINIMIZED_FOREGROUND_SHADPS4" } else { Write-Output "MINIMIZE_DENIED" }'
].join('\n');
const replacement = [
'const SHADPS4_FOCUS_HANDOFF_PS = '+JSON.stringify(ps)+';',
'let shadRescueInProgress = false;',
'function minimizeForegroundShadPS4() {',
"  if (process.platform !== 'win32') return Promise.resolve('NOT_WINDOWS');",
'  return new Promise((resolve) => {',
'    const command = Buffer.from(SHADPS4_FOCUS_HANDOFF_PS, "utf16le").toString("base64");',
"    execFile('powershell', ['-NoProfile','-NonInteractive','-EncodedCommand', command],",
'      { windowsHide:true, timeout:9000 }, (error, stdout) => {',
'        if (error) {',
"          logLine('ShadPS4 focus handoff native probe failed: ' + error.message);",
"          return resolve('NATIVE_PROBE_FAILED');",
'        }',
"        return resolve(String(stdout || '').trim() || 'UNKNOWN');",
'      });',
'  });',
'}',
'',
'async function openShadPS4Rescue(why) {',
'  if (!win || win.isDestroyed() || shadRescueInProgress) return;',
'  shadRescueInProgress = true;',
'  try {',
"    logLine('ShadPS4 rescue Quick Access triggered: ' + why);",
'    // User deliberately pressed Xbox Guide/Home. Only minimise the foreground',
'    // window when its process is shadPS4; never minimise another application.',
'    const handoff = await minimizeForegroundShadPS4();',
"    logLine('ShadPS4 foreground release result: ' + handoff);",
'    if (!win || win.isDestroyed()) return;',
"    win.webContents.send('ui:shadps4Rescue', true);",
'    quickAccessInApp(why);',
'  } finally {',
'    setTimeout(() => { shadRescueInProgress = false; }, 800);',
'  }',
'}'
].join('\n');
js=js.replace(original,replacement);
fs.writeFileSync(f,js);
cp.execFileSync(process.execPath,['--check',f],{stdio:'inherit'});
console.log('PASS: Exact v1.5 handler replaced with focused-ShadPS4-only minimise-then-open Quick Access');
