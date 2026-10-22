'use strict';
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const base=process.argv[2];if(!base)throw Error('Pass unpacked official RAMpage app');
const fMain=path.join(base,'src','main.js'),fPreload=path.join(base,'src','preload.js'),fRenderer=path.join(base,'src','renderer','app.js');
let main=fs.readFileSync(fMain,'utf8').replace(/\r\n/g,'\n');
let preload=fs.readFileSync(fPreload,'utf8').replace(/\r\n/g,'\n');
let renderer=fs.readFileSync(fRenderer,'utf8').replace(/\r\n/g,'\n');
function patch(text,oldCode,next,title){const n=text.split(oldCode).length-1;if(n!==1)throw Error(title+': expected one source anchor, got '+n);return text.replace(oldCode,next)}
main=patch(main,"const { RemoteLibraryService } = require('./remote-library');",
 "const { RemoteLibraryService } = require('./remote-library');\nconst { HydraRemoteProvider } = require('./hydra-remote-provider');",'Hydra module import');
const oldBlock=[
 'const remoteLibrary = new RemoteLibraryService({',
 '  dataDir: DATA_DIR, getGames: () => store.games, saveGame, rebuildMeta, publish: push, log: logLine',
 '});'
].join('\n');
const newBlock=[
 'const hydraRemoteProvider = new HydraRemoteProvider({dataDir: DATA_DIR, log: logLine});',
 '// Hydra data becomes accessible over authenticated remote web only after desktop opt-in.',
 '// Metadata overrides are persisted in RAMpage, never written into the Hydra database.',
 'const remoteLibrary = new RemoteLibraryService({',
 '  dataDir: DATA_DIR,',
 '  getGames: () => ({...store.games,...hydraRemoteProvider.getGames()}),',
 "  saveGame: (id) => id.startsWith('hydra:') ? hydraRemoteProvider.save(id) : saveGame(id),",
 '  rebuildMeta, publish: push, log: logLine',
 '});'
].join('\n');
main=patch(main,oldBlock,newBlock,'Merge opt-in Hydra collection only into remote API');
main=patch(main,"ipcMain.handle('remote:status', () => remoteLibrary.status());",[
 "ipcMain.handle('hydra:remote-status', () => hydraRemoteProvider.status());",
 "ipcMain.handle('hydra:remote-configure', (_event, {enabled}={}) => hydraRemoteProvider.configure(enabled));",
 "ipcMain.handle('hydra:remote-sync', () => hydraRemoteProvider.sync());",
 "ipcMain.handle('remote:status', () => remoteLibrary.status());"
].join('\n'),'Local-only Hydra IPC');
main=patch(main,"  step('remote library web server', () => remoteLibrary.start().catch(e => logLine('Remote library could not start: ' + e.message)));",
 "  step('remote library web server', () => remoteLibrary.start().catch(e => logLine('Remote library could not start: ' + e.message)));\n  step('opt-in Hydra library sync', () => hydraRemoteProvider.start().catch(e => logLine('Hydra integration unavailable: '+e.message)));",
 'Opt-in Hydra startup');
main=patch(main,"app.once('before-quit', () => remoteQuickTunnel.stop());",
 "app.once('before-quit', () => {remoteQuickTunnel.stop();hydraRemoteProvider.stop();});",'Hydra timer cleanup');
preload=patch(preload,"  stopRemoteTunnel: () => ipcRenderer.invoke('remote:tunnel-stop'),",[
 "  stopRemoteTunnel: () => ipcRenderer.invoke('remote:tunnel-stop'),",
 "  hydraRemoteStatus: () => ipcRenderer.invoke('hydra:remote-status'),",
 "  configureHydraRemote: (enabled) => ipcRenderer.invoke('hydra:remote-configure', {enabled}),",
 "  syncHydraRemote: () => ipcRenderer.invoke('hydra:remote-sync'),"
].join('\n'),'Hydra preload functions');
const original='    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>'+String.fromCharCode(96);
const section=[
 '    <div class="side-label" style="padding-left:0;margin-top:10px">Hydra Launcher integration</div>',
 '    <div class="toggle"><div style="min-width:0;flex:1">',
 '      <b>Include Hydra games in remote library</b>',
 '      <small>Optional. Read your local Hydra library and show its games via the RAMpage web URL. Metadata edits are saved only in RAMpage; no changes are written to Hydra.</small>',
 '      <div id="s-hydra-status" class="hint" style="margin-top:7px;overflow-wrap:anywhere">Hydra integration is off</div>',
 '      <small>Disabled until you enable this option. No Hydra account, executable paths or download sources are sent to remote visitors.</small>',
 '    </div><div style="display:flex;flex-direction:column;gap:7px;min-width:170px">',
 '      <button class="btn" id="s-hydra-toggle">Enable Hydra integration</button>',
 '      <button class="btn" id="s-hydra-sync">Refresh Hydra games</button>',
 '    </div></div>',
 ''].join('\n');
renderer=patch(renderer,original,section+original,'Hydra Settings markup');
const bind="    const bind = (id, fn) => $(id, m).addEventListener('change', (e) => api.setSettings(fn(e.target.checked)));";
const handlers=[
 '    // Hydra opt-in is available only through desktop Settings, never over HTTP.',
 '    let hydraStatus = null;',
 '    const updateHydra = (status) => {',
 '      hydraStatus=status;',
 "      const label=$('#s-hydra-status',m),toggle=$('#s-hydra-toggle',m),sync=$('#s-hydra-sync',m);",
 "      if(label)label.textContent=status.error?'Hydra: '+status.error:!status.enabled?(status.detected?'Detected, disabled':'Not detected, disabled'):'Enabled · '+status.count+' Hydra games · '+(status.lastSync?'Last sync '+new Date(status.lastSync).toLocaleString():'Not yet synced');",
 "      if(toggle)toggle.textContent=status.enabled?'Disable Hydra integration':'Enable Hydra integration';",
 '      if(sync)sync.disabled=!status.enabled;',
 '    };',
 "    api.hydraRemoteStatus().then(updateHydra).catch(err=>{const e=$('#s-hydra-status',m);if(e)e.textContent=err.message;});",
 "    $('#s-hydra-toggle',m).onclick=async(ev)=>{",
 '      const btn=ev.currentTarget;btn.disabled=true;',
 '      try{const next=await api.configureHydraRemote(!hydraStatus?.enabled);updateHydra(next);',
 "        toast(next.enabled?'Hydra games enabled in remote library':'Hydra integration disabled');",
 "      }catch(err){toast(err.message||'Hydra integration unavailable',true)}finally{btn.disabled=false;}",
 '    };',
 "    $('#s-hydra-sync',m).onclick=async(ev)=>{",
 '      const btn=ev.currentTarget;btn.disabled=true;',
 '      try{const state=await api.syncHydraRemote();updateHydra(state);',
 "        toast(state.error?state.error:'Hydra games refreshed',!!state.error);",
 "      }catch(err){toast(err.message||'Hydra sync failed',true)}finally{btn.disabled=false;}",
 '    };',
 ''].join('\n');
renderer=patch(renderer,bind,handlers+bind,'Hydra Settings handlers');
// Only offer Hydra as a filter choice after it actually appears in the remote catalogue.
const remoteClient=path.join(base,'src','remote','client.js');
const oldClient=fs.readFileSync(remoteClient,'utf8');
const oldReload="async function reload(){const d=await call('/api/games');state.games=d.games.sort((a,b)=>a.name.localeCompare(b.name));render();}";
const newReload=[
 "async function reload(){",
 "  const d=await call('/api/games');",
 "  state.games=d.games.sort((a,b)=>a.name.localeCompare(b.name));",
 "  const filter=qs('filter'),existing=filter.querySelector('option[value=\"hydra\"]');",
 "  if(state.games.some(g=>g.source==='hydra')&&!existing){",
 "    const option=document.createElement('option');option.value='hydra';option.textContent='Hydra Launcher';filter.append(option);",
 "  } else if(!state.games.some(g=>g.source==='hydra')&&existing){",
 "    if(filter.value==='hydra')filter.value='all';existing.remove();",
 "  }",
 "  render();",
 "}"
].join('\n');
fs.writeFileSync(remoteClient,patch(oldClient,oldReload,newReload,'Hydra filter only when enabled'));
cp.execFileSync(process.execPath,['--check',remoteClient],{stdio:'inherit'});
fs.copyFileSync(path.join(__dirname,'..','src','hydra-remote-provider.js'),path.join(base,'src','hydra-remote-provider.js'));
for(const [p,t] of [[fMain,main],[fPreload,preload],[fRenderer,renderer]])fs.writeFileSync(p,t);
for(const f of [fMain,fPreload,fRenderer,path.join(base,'src','hydra-remote-provider.js')])cp.execFileSync(process.execPath,['--check',f],{stdio:'inherit'});
console.log('PASS: Hydra opt-in on desktop, with original password-protected remote API retained');
