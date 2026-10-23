"use strict";
/**
 * Adds a capability-gated Hydra management panel to the desktop Electron UI.
 * Does not alter Hydra itself or call undocumented Hydra IPC.
 */
const fs=require("node:fs"),path=require("node:path"),cp=require("node:child_process");
function patchDesktop(root){
 const src=n=>path.join(root,"src",n);
 const change=(file,from,to,label)=>{
  const p=src(file),s=fs.readFileSync(p,"utf8").replace(/\r\n/g,"\n");
  const count=s.split(from).length-1;
  if(count!==1)throw Error("Desktop compatibility guard "+label+": "+count+" anchors");
  fs.writeFileSync(p,s.replace(from,to));
 };
 const mainImport="const { HydraRemoteProvider } = require('./hydra-remote-provider');";
 change("main.js",mainImport,mainImport+"\n"+
  "const {createHydraBridge}=require('./hydra-bridge/bridge');\n"+
  "const {createHydraCompanionClient}=require('./hydra-bridge/companion-client');",
 "desktop bridge import");
 const mainHandlers=[
  "// Opt-in local Hydra companion. This is not Hydra's internal Electron IPC.",
  "const hydraDesktopDevPort=Number(process.env.RAMPAGE_HYDRA_COMPANION_DEV_PORT);",
  "let hydraDesktopCompanion=null;",
  "if(process.env.RAMPAGE_HYDRA_COMPANION_DEV_ENABLED==='1' &&",
  "   Number.isSafeInteger(hydraDesktopDevPort) && hydraDesktopDevPort>0 && hydraDesktopDevPort<65536){",
  "  try{hydraDesktopCompanion=createHydraCompanionClient({",
  "    baseUrl:'http://127.0.0.1:'+hydraDesktopDevPort,token:process.env.RAMPAGE_HYDRA_COMPANION_DEV_TOKEN",
  "  });}catch{/* No secret in logs; keep integration disconnected. */}",
  "}",
  "const hydraDesktopBridge=createHydraBridge(hydraDesktopCompanion);",
  "const hydraDesktopContext=()=>({authenticated:true,",
  " hydraEnabled:hydraRemoteProvider.status().enabled===true,",
  " canManageDownloads:hydraDesktopCompanion!==null,csrfValidated:true});",
  "const requireHydraDraftGame=id=>{",
  " const g=store.games[id];",
  " if(!g?.hydraDownloadDraft||g.installed!==false)throw Error('This game is not a pending Hydra download');",
  " return g;",
  "};",
  "ipcMain.handle('hydra:bridge-status',()=>hydraDesktopBridge.status(hydraDesktopContext()));",
  "ipcMain.handle('hydra:bridge-search',(_event,title)=>hydraDesktopBridge.search(hydraDesktopContext(),{title}));",
  "ipcMain.handle('hydra:bridge-options',(_event,gameId)=>{requireHydraDraftGame(gameId);return hydraDesktopBridge.options(hydraDesktopContext(),{gameId});});",
  "ipcMain.handle('hydra:bridge-downloaders',(_event,gameId,optionId)=>{requireHydraDraftGame(gameId);return hydraDesktopBridge.downloaders(hydraDesktopContext(),{gameId,optionId});});",
  "ipcMain.handle('hydra:bridge-downloads',()=>hydraDesktopBridge.downloads(hydraDesktopContext()));",
  "ipcMain.handle('hydra:bridge-command',(_event,payload)=>{requireHydraDraftGame(payload?.gameId);return hydraDesktopBridge.command(hydraDesktopContext(),payload);});",
  "ipcMain.handle('hydra:bridge-install',(_event,gameId)=>{requireHydraDraftGame(gameId);return hydraDesktopBridge.requestInstaller(hydraDesktopContext(),{gameId});});",
  ""
 ].join("\n");
 change("main.js","ipcMain.handle('hydra:draft-create',",mainHandlers+"ipcMain.handle('hydra:draft-create',","desktop IPC endpoints");
 const preloadAnchor="  openHydraDraft: (id) => ipcRenderer.invoke('hydra:draft-open',id),";
 const preload=[
  "  hydraBridgeStatus:()=>ipcRenderer.invoke('hydra:bridge-status'),",
  "  hydraBridgeSearch:(title)=>ipcRenderer.invoke('hydra:bridge-search',title),",
  "  hydraBridgeOptions:(gameId)=>ipcRenderer.invoke('hydra:bridge-options',gameId),",
  "  hydraBridgeDownloaders:(gameId,optionId)=>ipcRenderer.invoke('hydra:bridge-downloaders',gameId,optionId),",
  "  hydraBridgeDownloads:()=>ipcRenderer.invoke('hydra:bridge-downloads'),",
  "  hydraBridgeCommand:(payload)=>ipcRenderer.invoke('hydra:bridge-command',payload),",
  "  hydraBridgeInstall:(gameId)=>ipcRenderer.invoke('hydra:bridge-install',gameId),"
 ].join("\n");
 change("preload.js",preloadAnchor,preloadAnchor+"\n"+preload,"preload methods");
 const panelJs=fs.readFileSync(path.join(__dirname,"..","integrations","hydra","web-panel.js"),"utf8");
 const desktopClient=[
  "const hydraDesktopClient={",
  " status:()=>api.hydraBridgeStatus(),",
  " search:title=>api.hydraBridgeSearch(title),",
  " options:id=>api.hydraBridgeOptions(id),",
  " downloaders:(id,option)=>api.hydraBridgeDownloaders(id,option),",
  " downloads:()=>api.hydraBridgeDownloads(),",
  " queue:(gameId,optionId,downloaderId,extract,deleteArchive)=>",
  "   api.hydraBridgeCommand({action:'queue',gameId,optionId,downloaderId,extract,deleteArchive}),",
  " pause:(gameId,downloadId)=>api.hydraBridgeCommand({action:'pause',gameId,downloadId}),",
  " resume:(gameId,downloadId)=>api.hydraBridgeCommand({action:'resume',gameId,downloadId}),",
  " cancel:(gameId,downloadId)=>api.hydraBridgeCommand({action:'cancel',gameId,downloadId}),",
  " requestInstall:gameId=>api.hydraBridgeInstall(gameId)",
  "};",
  "function openHydraManagerForGame(g){",
  " if(!g?.hydraDownloadDraft || g.installed!==false)return;",
  " const overlay=document.createElement('div');overlay.className='hydra-pc-overlay';",
  " const modal=document.createElement('section');modal.className='hydra-pc-dialog';",
  " modal.setAttribute('role','dialog');modal.setAttribute('aria-modal','true');",
  " modal.setAttribute('aria-label','Hydra download manager');",
  " const top=document.createElement('div');top.className='hydra-pc-top';",
  " const heading=document.createElement('h3');heading.textContent=g.name;",
  " const close=document.createElement('button');close.type='button';close.textContent='Close';",
  " top.append(heading,close);modal.append(top);",
  " const mount=document.createElement('div');modal.append(mount);overlay.append(modal);",
  " document.body.append(overlay);",
  " const controller=mountHydraDownloadPanel(mount,{client:hydraDesktopClient,gameId:g.id,gameTitle:g.name,pollMs:10000});",
  " const dispose=()=>{controller.destroy();overlay.remove();};",
  " close.addEventListener('click',dispose);",
  " overlay.addEventListener('click',event=>{if(event.target===overlay)dispose();});",
  " close.focus();",
  "}",
  ""
 ].join("\n");
 change("renderer/app.js","const WIZ =",panelJs+"\n"+desktopClient+"\nconst WIZ =","desktop panel integration");
 // Persistent game-details button (two native game views).
 const buttonOld='<button data-act="hydra-download"><svg><use href="#i-plus"/></svg>Open Hydra available downloads</button>';
 const buttonNew=buttonOld+'<button data-act="hydra-manager"><svg><use href="#i-plus"/></svg>Manage Hydra downloads</button>';
 const gameFile=src("renderer/app.js");
 let appText=fs.readFileSync(gameFile,"utf8");
 const n=appText.split(buttonOld).length-1;
 if(n!==2)throw Error("Native Hydra game detail buttons expected 2, found "+n);
 appText=appText.replaceAll(buttonOld,buttonNew);
 fs.writeFileSync(gameFile,appText);
 const caseOld="        case 'hydra-download': return g && api.openHydraDraft(g.id).then(r=>toast(r.message||'Hydra opened')).catch(err=>toast(err.message||'Could not open Hydra',true));";
 change("renderer/app.js",caseOld,caseOld+"\n        case 'hydra-manager': return g && openHydraManagerForGame(g);","desktop manager action");
 const css=[
  ".hydra-pc-overlay{position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:100000;display:flex;justify-content:center;align-items:center;padding:16px}",
  ".hydra-pc-dialog{background:var(--bg,#151515);color:var(--text,#eee);border:1px solid #555;border-radius:16px;padding:22px;width:min(780px,96vw);max-height:90vh;overflow-y:auto;box-shadow:0 24px 80px #000b}",
  ".hydra-pc-top{display:flex;justify-content:space-between;align-items:center;gap:12px}",
  ".hydra-pc-dialog .hydra-status{font-size:12px;opacity:.75}",
  ".hydra-pc-dialog button{border-radius:7px;padding:8px 12px;margin:4px;cursor:pointer}",
  ".hydra-pc-dialog .hydra-actions,.hydra-pc-dialog .hydra-filter-row{display:flex;gap:8px;flex-wrap:wrap}",
  ".hydra-pc-dialog input,.hydra-pc-dialog select{padding:9px;background:#222;color:#eee;max-width:100%}",
  ".hydra-pc-dialog .hydra-option,.hydra-pc-dialog .hydra-transfer{border:1px solid #444;border-radius:10px;padding:12px;margin:10px 0}",
  ".hydra-pc-dialog .hydra-option{display:flex;align-items:flex-start;flex-direction:column;gap:5px}",
  ".hydra-pc-dialog .hydra-check{display:flex;align-items:center;gap:7px;margin:9px 0}",
  ".hydra-pc-dialog progress{display:block;width:100%;height:9px;margin:10px 0}"
 ].join("\n");
 fs.appendFileSync(src("renderer/styles.css"),"\n"+css+"\n");
 for(const f of ["main.js","preload.js","renderer/app.js"])cp.execFileSync(process.execPath,["--check",src(f)],{stdio:"inherit"});
 console.log("PASS: desktop Hydra game details can open capability-gated RAMpage download manager.");
}
module.exports={patchDesktop};
