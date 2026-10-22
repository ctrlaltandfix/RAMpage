'use strict';
// Guarded patch to official RAMpage v1.6.0 packaged app.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const root=process.argv[2];
if(!root)throw Error('Usage: node apply-quick-tunnel.js <unpacked-app>');
const mainFile=path.join(root,'src','main.js');
const preloadFile=path.join(root,'src','preload.js');
const renderFile=path.join(root,'src','renderer','app.js');
let main=fs.readFileSync(mainFile,'utf8').replace(/\r\n/g,'\n');
let preload=fs.readFileSync(preloadFile,'utf8').replace(/\r\n/g,'\n');
let renderer=fs.readFileSync(renderFile,'utf8').replace(/\r\n/g,'\n');
function replace(s,oldText,newText,label){
 const n=s.split(oldText).length-1;
 if(n!==1)throw Error(label+': expected unique anchor, got '+n);
 return s.replace(oldText,newText);
}
main=replace(main,
 "const { RemoteLibraryService } = require('./remote-library');",
 "const { RemoteLibraryService } = require('./remote-library');\nconst { RemoteQuickTunnel } = require('./remote-quick-tunnel');",
 'cloudflared manager import');
main=replace(main,
 "ipcMain.handle('remote:status', () => remoteLibrary.status());",
 [
 "// The bundled, digest-verified cloudflared is a child of RAMpage. No public LAN binding.",
 "const remoteQuickTunnel = new RemoteQuickTunnel({",
 "  exePath: require('node:path').join(require('node:path').dirname(process.execPath),'tools','cloudflared.exe'),",
 "  getLocalUrl: () => remoteLibrary.status().localUrl,",
 "  log: logLine",
 "});",
 "app.once('before-quit', () => remoteQuickTunnel.stop());",
 "ipcMain.handle('remote:tunnel-status', () => remoteQuickTunnel.status());",
 "ipcMain.handle('remote:tunnel-start', async () => {",
 "  if (!remoteLibrary.status().enabled) throw Error('Enable the password-protected web library first');",
 "  return remoteQuickTunnel.start();",
 "});",
 "ipcMain.handle('remote:tunnel-stop', () => remoteQuickTunnel.stop());",
 "ipcMain.handle('remote:status', () => remoteLibrary.status());"
 ].join('\n'),
 'tunnel lifecycle and IPC');
main=replace(main,
 "  const result = await remoteLibrary.configure(options);",
 "  if (options?.enabled === false) remoteQuickTunnel.stop();\n  const result = await remoteLibrary.configure(options);",
 'disabling service closes public URL');
preload=replace(preload,
 "  configureRemote: (options) => ipcRenderer.invoke('remote:configure', options),",
 [
 "  configureRemote: (options) => ipcRenderer.invoke('remote:configure', options),",
 "  remoteTunnelStatus: () => ipcRenderer.invoke('remote:tunnel-status'),",
 "  startRemoteTunnel: () => ipcRenderer.invoke('remote:tunnel-start'),",
 "  stopRemoteTunnel: () => ipcRenderer.invoke('remote:tunnel-stop'),"
 ].join('\n'),
 'renderer tunnel API');
const sectionStart=renderer.indexOf('    <div class="side-label" style="padding-left:0;margin-top:10px">Remote library access</div>');
const sectionEnd=renderer.indexOf('    <div class="modal-actions"><button class="btn primary" data-close>Done</button></div>',sectionStart);
if(sectionStart<0||sectionEnd<0||sectionEnd-sectionStart>5000)throw Error('Could not locate original remote library Settings section');
const section=[
 '    <div class="side-label" style="padding-left:0;margin-top:10px">Remote library access</div>',
 '    <div class="toggle"><div style="min-width:0;flex:1">',
 '      <b>Web library</b><small>Browse your games and update metadata remotely from your phone or PC. Set a 16+ character password first; access is off until you enable it.</small>',
 '      <div id="s-remote-status" class="hint" style="margin-top:7px;overflow-wrap:anywhere">Checking…</div>',
 '      <div id="s-remote-link" class="hint" style="margin-top:4px;overflow-wrap:anywhere"></div>',
 '    </div><div style="display:flex;flex-direction:column;gap:7px;min-width:185px">',
 '      <input id="s-remote-pass" type="password" class="key-input" style="width:100%" placeholder="Password (16+ chars)" autocomplete="new-password"/>',
 '      <button class="btn" id="s-remote-toggle">Enable access</button>',
 '    </div></div>',
 '    <div class="toggle"><div style="min-width:0;flex:1">',
 '      <b>Easy remote HTTPS link</b><small>One click, no Tailscale, account, domain or router setup. Generates a temporary public HTTPS sign-in URL protected by your RAMpage password. Anyone with the link can reach the login page; share it only with people you trust.</small>',
 '      <div id="s-remote-tunnel-status" class="hint" style="margin-top:7px;overflow-wrap:anywhere">Off</div>',
 '      <div id="s-remote-tunnel-url" class="hint" style="margin-top:5px;overflow-wrap:anywhere;user-select:all"></div>',
 '      <small>Link expires when stopped, RAMpage closes or the connection drops. Cloudflare Quick Tunnels are intended for temporary use and are not guaranteed always available.</small>',
 '    </div><div style="display:flex;flex-direction:column;gap:7px;min-width:185px">',
 '      <button class="btn" id="s-remote-tunnel-start">Create HTTPS link</button>',
 '      <button class="btn" id="s-remote-tunnel-stop">Stop sharing</button>',
 '      <button class="btn" id="s-remote-tunnel-copy">Copy HTTPS link</button>',
 '    </div></div>',
 ''
].join('\n');
renderer=renderer.slice(0,sectionStart)+section+renderer.slice(sectionEnd);
const handlerStart=renderer.indexOf('    // Remote web service credentials stay out of library/settings snapshots.');
const handlerEnd=renderer.indexOf("    const bind = (id, fn) => $(id, m).addEventListener('change', (e) => api.setSettings(fn(e.target.checked)));",handlerStart);
if(handlerStart<0||handlerEnd<0||handlerEnd-handlerStart>9000)throw Error('Could not locate previous remote Settings control handlers');
const handlers=[
 '    // The public Quick Tunnel is always explicit, voluntary, and temporary.',
 '    let remoteState = null, tunnelState = null;',
 "    const remoteEl = (id) => $(id,m);",
 '    const renderTunnel = (state) => {',
 '      tunnelState=state;',
 "      const status=remoteEl('#s-remote-tunnel-status');",
 "      const url=remoteEl('#s-remote-tunnel-url');",
 "      const create=remoteEl('#s-remote-tunnel-start');",
 "      const stop=remoteEl('#s-remote-tunnel-stop');",
 "      const copy=remoteEl('#s-remote-tunnel-copy');",
 "      if(status) status.textContent=state.connected ? 'HTTPS link is active (password required)' : state.connecting ? 'Creating secure link…' : 'Off — no public link';",
 "      if(url) url.textContent=state.url || '';",
 "      if(create) {create.disabled=!remoteState?.enabled || !!state.connected || !!state.connecting;create.textContent='Create HTTPS link';}",
 "      if(stop) stop.disabled=!state.connected && !state.connecting;",
 "      if(copy) copy.disabled=!state.url;",
 '    };',
 '    const renderRemote = (s) => {',
 '      remoteState=s;',
 "      const status=remoteEl('#s-remote-status'), url=remoteEl('#s-remote-link'),btn=remoteEl('#s-remote-toggle');",
 "      if(status)status.textContent=s.enabled ? 'Enabled — password-protected web library on this computer.' : 'Disabled — your library is not accessible online.';",
 "      if(url)url.textContent=s.localUrl ? 'Local URL: '+s.localUrl : '';",
 "      if(btn)btn.textContent=s.enabled?'Disable access':'Enable access';",
 '      if(tunnelState)renderTunnel(tunnelState);',
 '    };',
 "    api.remoteStatus().then(renderRemote).catch(err=>{const el=remoteEl('#s-remote-status');if(el)el.textContent=err.message;});",
 "    api.remoteTunnelStatus().then(renderTunnel).catch(err=>{const el=remoteEl('#s-remote-tunnel-status');if(el)el.textContent=err.message;});",
 "    remoteEl('#s-remote-toggle').onclick=async(e)=>{",
 '      const btn=e.currentTarget;btn.disabled=true;',
 '      try{',
 '        const enabled=!remoteState?.enabled;',
 "        const password=remoteEl('#s-remote-pass').value;",
 "        if(enabled&&!remoteState?.configured&&password.length<16)throw Error('Set a password of at least 16 characters');",
 '        const r=await api.configureRemote({enabled,...(password?{password}:{})});',
 "        remoteEl('#s-remote-pass').value='';renderRemote(r);",
 "        if(!enabled)renderTunnel(await api.remoteTunnelStatus());",
 "        toast(enabled?'Web library enabled':'Web library disabled and HTTPS link closed');",
 "      }catch(err){toast(err.message||'Cannot configure web library',true)}",
 '      finally{btn.disabled=false;}',
 '    };',
 "    remoteEl('#s-remote-tunnel-start').onclick=async(e)=>{",
 '      const btn=e.currentTarget;btn.disabled=true;',
 '      try{',
 "        const state=await api.startRemoteTunnel();renderTunnel(state);",
 "        toast('Temporary HTTPS link created — share it privately');",
 "      }catch(err){toast(err.message||'Could not create HTTPS link',true);renderTunnel(await api.remoteTunnelStatus());}",
 '      finally{btn.disabled=false;}',
 '    };',
 "    remoteEl('#s-remote-tunnel-stop').onclick=async()=>{",
 "      try{renderTunnel(await api.stopRemoteTunnel());toast('HTTPS link stopped')}",
 "      catch(err){toast(err.message||'Could not stop HTTPS link',true)}",
 '    };',
 "    remoteEl('#s-remote-tunnel-copy').onclick=async()=>{",
 '      if(!tunnelState?.url)return;',
 "      try{await navigator.clipboard.writeText(tunnelState.url);toast('HTTPS link copied')}",
 "      catch{toast('Select and copy the HTTPS URL above',true)}",
 '    };',
 ''
].join('\n');
renderer=renderer.slice(0,handlerStart)+handlers+renderer.slice(handlerEnd);
fs.copyFileSync(path.join(__dirname,'..','src','remote-quick-tunnel.js'),path.join(root,'src','remote-quick-tunnel.js'));
for(const [file,code] of [[mainFile,main],[preloadFile,preload],[renderFile,renderer]])fs.writeFileSync(file,code);
for(const file of [mainFile,preloadFile,renderFile,path.join(root,'src','remote-quick-tunnel.js')]) cp.execFileSync(process.execPath,['--check',file],{stdio:'inherit'});
console.log('PASS: One-click Cloudflare HTTPS link and Settings controls patched into genuine RAMpage application');
