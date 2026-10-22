'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const appRoot = process.argv[2];
if (!appRoot) throw Error('Pass unpacked RAMpage source path');
const dest = path.join(appRoot, 'src', 'main.js');
let main = fs.readFileSync(dest, 'utf8').replace(/\r\n/g, '\n');

function exactlyOnce(before, after, label) {
  const n = main.split(before).length - 1;
  if (n !== 1) throw Error(label + ': expected one matching code block; found ' + n);
  main = main.replace(before, after);
}
function patchInFunction(fnName, before, after, label) {
  const start = main.indexOf('function ' + fnName + '(');
  const end = main.indexOf('\n}',start);
  if (start < 0 || end < 0) throw Error('Function not found: ' + fnName);
  const current = main.slice(start,end+2);
  if (current.split(before).length !== 2) throw Error(label + ': source differs from expected');
  main = main.slice(0,start)+current.replace(before,after)+main.slice(end+2);
}

exactlyOnce("const sgdb = require('./steamgriddb');",
  "const sgdb = require('./steamgriddb');\nconst qaPresenter = require('./quick-access-presenter');",
  'Presenter import');
exactlyOnce('let homeHooked = false;', 'let homeHooked = false;\nlet qaAltHooked = false;',
  'backup shortcut state');
patchInFunction('hookHomeKey',
  '  if (on === homeHooked) return;',
  '  if (on === homeHooked && (on ? qaAltHooked : !qaAltHooked)) return;',
  'backup shortcut registration guard');
patchInFunction('hookHomeKey',
  '      buildQuickAccessWindow();',
  "      qaAltHooked = globalShortcut.register('Control+Shift+Q', onHomePressed);\n" +
  "      logLine('Quick Access backup Ctrl+Shift+Q: ' + (qaAltHooked ? 'available' : 'could not be registered'));\n" +
  '      buildQuickAccessWindow();',
  'backup keyboard shortcut');
patchInFunction('hookHomeKey',
  "      globalShortcut.unregister('Home');\n      homeHooked = false;",
  "      globalShortcut.unregister('Home');\n      globalShortcut.unregister('Control+Shift+Q');\n" +
  '      homeHooked = false;\n      qaAltHooked = false;',
  'backup shortcut cleanup');
exactlyOnce('const deadline = Date.now() + 30000;',
  "const deadline = Date.now() + (g.systemId === 'ps4' ? 120000 : 30000);",
  'shadPS4 Qt launcher detection grace');
patchInFunction('toggleQuickAccess',
  '    return showQuickAccessOverlay();',
  "    if (qaPresenter.ps4IsRunning(running, store.games) || running.size === 0) {\n" +
  "      logLine('Quick Access: ShadPS4/unknown-game session using activatable floating toolbar');\n" +
  "      return showQuickAccessOverlay(true);\n" +
  '    }\n    return showQuickAccessOverlay();',
  'ShadPS4-specific activatable toolbar');
exactlyOnce('function showQuickAccessOverlay() {', 'function showQuickAccessOverlay(activeToolbar = false) {',
  'active overlay parameter');
patchInFunction('showQuickAccessOverlay',
  "  qaWin.setAlwaysOnTop(true, 'screen-saver', 1);\n  qaWin.showInactive();\n  qaWin.moveTop();",
  "  qaPresenter.presentQuickAccess(qaWin, activeToolbar);\n" +
  "  if (activeToolbar) {\n" +
  "    const thisBar = qaWin;\n" +
  "    setTimeout(() => {\n" +
  "      if (qaWin !== thisBar || thisBar.isDestroyed() || !thisBar.isVisible()) return;\n" +
  "      if (thisBar.isFocused()) return logLine('ShadPS4 Quick Access: foreground activation succeeded');\n" +
  "      logLine('ShadPS4 Quick Access: foreground activation denied; using visible RAMpage fallback');\n" +
  "      quickAccessInApp('Windows did not activate the ShadPS4 toolbar');\n" +
  "    }, 1600);\n  }",
  'show active vs passive');
patchInFunction('hideQuickAccessOverlay',
  '  if (qaWin && !qaWin.isDestroyed()) {',
  "  if (qaWin && !qaWin.isDestroyed()) {\n" +
  "    try { qaWin.setFocusable(false); } catch { /* ignore unsupported platform */ }",
  'restore non-activating state');
fs.copyFileSync(path.join(__dirname, 'shadps4-qa-presenter.js'),
  path.join(appRoot, 'src', 'quick-access-presenter.js'));
fs.writeFileSync(dest,main);
execFileSync(process.execPath,['--check',dest],{stdio:'inherit'});
console.log('PASS: Alternate Ctrl+Shift+Q, focusable ShadPS4 overlay, and fallback integrated.');
